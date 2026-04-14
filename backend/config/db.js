const mongoose = require("mongoose");
const dns = require("dns");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let listenersAttached = false;
let activeConnectionPromise = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let degradedUntil = 0;
let lastConnectionIssue = null;
let lastLoggedIssueKey = null;

const CONNECTED_STATE = 1;
const CONNECTING_STATE = 2;
const VERIFY_RETRYABLE_NAMES = new Set([
  "MongoNotConnectedError",
  "MongoNetworkTimeoutError",
  "MongoServerSelectionError",
]);

const setDegradedState = (error, reason = "unknown") => {
  const cooldownMs = getIntEnv("MONGO_DEGRADED_COOLDOWN_MS", 15000);
  degradedUntil = Date.now() + cooldownMs;
  lastConnectionIssue = {
    at: new Date().toISOString(),
    reason,
    name: error?.name || null,
    message: error?.message || null,
  };
};

const clearDegradedState = () => {
  degradedUntil = 0;
  lastConnectionIssue = null;
  lastLoggedIssueKey = null;
};

const getConnectionStatus = () => ({
  readyState: mongoose.connection.readyState,
  connected: mongoose.connection.readyState === CONNECTED_STATE,
  connecting: mongoose.connection.readyState === CONNECTING_STATE,
  degraded: Date.now() < degradedUntil,
  degradedUntil: degradedUntil || null,
  lastConnectionIssue,
});

const getIntEnv = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getMongoUriConfig = () => {
  const rawStandardUri = process.env.MONGO_URI_STANDARD;
  const srvUri = process.env.MONGO_URI;
  const standardUri =
    rawStandardUri && rawStandardUri.startsWith("mongodb://") ? rawStandardUri : "";
  const mongoUri = standardUri || srvUri;
  const fallbackUri = process.env.MONGO_FALLBACK_URI || "";
  const dbName = (process.env.MONGO_DB_NAME || "").trim();

  if (!mongoUri) {
    if (rawStandardUri && rawStandardUri.startsWith("mongodb+srv://")) {
      throw new Error(
        "MONGO_URI_STANDARD must use mongodb:// host1,host2,host3 format. Move your mongodb+srv:// value to MONGO_URI."
      );
    }

    throw new Error("MONGO_URI or MONGO_URI_STANDARD must be set in .env");
  }

  return {
    primaryUri: mongoUri,
    fallbackUri,
    dbName,
    usingStandardUri: Boolean(standardUri),
  };
};

const buildConnectionOptions = (dbName) => ({
  serverSelectionTimeoutMS: getIntEnv("MONGO_SERVER_SELECTION_TIMEOUT_MS", 10000),
  connectTimeoutMS: getIntEnv("MONGO_CONNECT_TIMEOUT_MS", 10000),
  socketTimeoutMS: getIntEnv("MONGO_SOCKET_TIMEOUT_MS", 20000),
  heartbeatFrequencyMS: getIntEnv("MONGO_HEARTBEAT_FREQUENCY_MS", 10000),
  maxPoolSize: getIntEnv("MONGO_MAX_POOL_SIZE", 10),
  minPoolSize: getIntEnv("MONGO_MIN_POOL_SIZE", 1),
  family: getIntEnv("MONGO_IP_FAMILY", 4),
  retryReads: true,
  retryWrites: true,
  autoIndex: true,
  ...(dbName ? { dbName } : {}),
});

const isMongoConnectionError = (error) => {
  if (!error) return false;

  const message = String(error.message || "").toLowerCase();
  const causeMessage = String(error.cause?.message || "").toLowerCase();

  return [
    error.name === "MongoNetworkError",
    error.name === "MongoNetworkTimeoutError",
    error.name === "MongoServerSelectionError",
    error.name === "MongoNotConnectedError",
    message.includes("timed out"),
    message.includes("connection"),
    message.includes("server selection"),
    message.includes("topology was destroyed"),
    causeMessage.includes("timed out"),
  ].some(Boolean);
};

const attachConnectionListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on("connected", () => {
    reconnectAttempts = 0;
    clearDegradedState();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const dbName = mongoose.connection.db?.databaseName || "unknown";
    const host = mongoose.connection.host || "unknown-host";
    console.log(`MongoDB connected to ${dbName} on ${host}`);
  });

  mongoose.connection.on("reconnected", () => {
    reconnectAttempts = 0;
    clearDegradedState();
    console.log("MongoDB reconnected");
  });

  mongoose.connection.on("disconnected", () => {
    setDegradedState(null, "disconnected");
    scheduleReconnect("disconnected");
  });

  mongoose.connection.on("error", (error) => {
    if (isMongoConnectionError(error)) {
      setDegradedState(error, error.name || "error");
      scheduleReconnect(error.name || "error");
    }
  });
};

const configureDns = (mongoUri, usingStandardUri) => {
  if (usingStandardUri || !mongoUri.startsWith("mongodb+srv://")) return;

  const configuredServers = (process.env.MONGO_DNS_SERVERS || "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (configuredServers.length > 0) {
    dns.setServers(configuredServers);
  }
};

const buildConnectionTargets = ({ primaryUri, fallbackUri, dbName, usingStandardUri }) => {
  const targets = [{ uri: primaryUri, dbName, usingStandardUri, label: "primary" }];

  if (fallbackUri.trim()) {
    targets.push({
      uri: fallbackUri.trim(),
      dbName,
      usingStandardUri: fallbackUri.startsWith("mongodb://"),
      label: "fallback",
    });
  }

  return targets;
};

const logConnectionGuidance = (error, attempt, maxRetries, usingStandardUri) => {
  const message = String(error?.message || "");
  const lowerMessage = message.toLowerCase();
  const code = error?.code || "";
  const syscall = error?.syscall || "";
  const reasonType = error?.reason?.type || error?.cause?.type || "";
  const tlsCode = error?.cause?.code || error?.code || "";
  const isSrvRefused = syscall === "querySrv" && (code === "ECONNREFUSED" || code === "ENOTFOUND");
  const isTlsHandshakeIssue =
    tlsCode === "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR" ||
    lowerMessage.includes("tlsv1 alert internal error") ||
    lowerMessage.includes("ssl routines") ||
    lowerMessage.includes("alert number 80");
  const isAtlasNetworkAccessIssue =
    (error?.name === "MongooseServerSelectionError" && !isTlsHandshakeIssue) ||
    reasonType === "ReplicaSetNoPrimary" ||
    lowerMessage.includes("whitelist") ||
    lowerMessage.includes("ip that isn't whitelisted") ||
    lowerMessage.includes("replicasetnoprimary") ||
    lowerMessage.includes("could not connect to any servers") ||
    lowerMessage.includes("timed out");

  const issueKey = [
    error?.name || "Error",
    error?.code || "",
    reasonType || "",
    lowerMessage,
    usingStandardUri ? "standard" : "srv",
  ].join("|");

  if (attempt > 1 && lastLoggedIssueKey === issueKey) {
    return;
  }

  lastLoggedIssueKey = issueKey;

  console.error(`MongoDB connection attempt ${attempt} of ${maxRetries} failed.`);

  if (isSrvRefused && !usingStandardUri) {
    console.error(
      "Your network is blocking DNS SRV lookups.\n" +
      "Set MONGO_URI_STANDARD to the standard Atlas URI, or define MONGO_DNS_SERVERS if you need custom DNS."
    );
  } else if (isTlsHandshakeIssue) {
    console.error("Atlas TLS handshake failed. Check Atlas Network Access and verify the connection string.");
  } else if (isAtlasNetworkAccessIssue) {
    console.error("Atlas is reachable but rejecting or timing out the connection. Check Atlas Network Access and allow your current IP.");
  }

  console.error(error);
};

const verifyConnection = async () => {
  const maxAttempts = Math.max(1, getIntEnv("MONGO_VERIFY_RETRIES", 3));
  const retryDelayMs = Math.max(100, getIntEnv("MONGO_VERIFY_RETRY_DELAY_MS", 250));
  const shouldVerifyWithPing = String(process.env.MONGO_VERIFY_WITH_PING || "").toLowerCase() === "true";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const db = mongoose.connection?.db;
    const isConnected = mongoose.connection.readyState === CONNECTED_STATE;

    if (!db || !isConnected) {
      if (attempt === maxAttempts) {
        const error = new Error("MongoDB connection is not ready yet.");
        error.name = "MongoNotConnectedError";
        throw error;
      }
      await sleep(retryDelayMs);
      continue;
    }

    if (!shouldVerifyWithPing) {
      return;
    }

    try {
      await db.admin().ping();
      return;
    } catch (error) {
      const shouldRetry =
        attempt < maxAttempts &&
        (VERIFY_RETRYABLE_NAMES.has(error?.name) || isMongoConnectionError(error));

      if (!shouldRetry) {
        throw error;
      }

      await sleep(retryDelayMs * attempt);
    }
  }
};

const connectWithRetry = async () => {
  const config = getMongoUriConfig();
  const targets = buildConnectionTargets(config);
  const maxRetries = getIntEnv("MONGO_CONNECT_RETRIES", 5);
  const baseDelayMs = getIntEnv("MONGO_CONNECT_BASE_DELAY_MS", 2000);
  mongoose.set("bufferCommands", false);
  attachConnectionListeners();

  for (const target of targets) {
    configureDns(target.uri, target.usingStandardUri);

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        await mongoose.connect(target.uri, buildConnectionOptions(target.dbName));
        await verifyConnection();

        const dbName = mongoose.connection.db?.databaseName || "unknown";
        const host = mongoose.connection.host || "unknown-host";
        console.log(`MongoDB ready: ${dbName} on ${host} using ${target.label} URI`);

        return mongoose.connection;
      } catch (error) {
        if (isMongoConnectionError(error)) {
          setDegradedState(error, `connect-${target.label}`);
        }
        logConnectionGuidance(error, attempt, maxRetries, target.usingStandardUri);

        try {
          await mongoose.disconnect();
        } catch (_) {
          // ignore disconnect cleanup errors
        }

        if (attempt < maxRetries) {
          const backoffMs = baseDelayMs * attempt;
          await sleep(backoffMs);
        }
      }
    }

    if (targets.length > 1 && target.label === "primary") {
      console.warn("Primary MongoDB URI failed. Trying fallback URI.");
    }
  }

  throw new Error("MongoDB connection failed after retries. See logs above for details.");
};

const connectDB = async () => {
  if (mongoose.connection.readyState === CONNECTED_STATE) {
    return mongoose.connection;
  }

  if (activeConnectionPromise) {
    return activeConnectionPromise;
  }

  activeConnectionPromise = connectWithRetry().finally(() => {
    activeConnectionPromise = null;
  });

  return activeConnectionPromise;
};

const forceReconnect = async (reason = "manual") => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect cleanup errors
  }

  activeConnectionPromise = null;
  reconnectAttempts = 0;
  setDegradedState(null, `force-reconnect:${reason}`);

  return connectDB();
};

const scheduleReconnect = (reason = "unknown") => {
  if (
    mongoose.connection.readyState === CONNECTED_STATE ||
    mongoose.connection.readyState === CONNECTING_STATE
  ) {
    return;
  }

  if (activeConnectionPromise || reconnectTimer) {
    return;
  }

  reconnectAttempts += 1;
  const baseDelayMs = getIntEnv("MONGO_RECONNECT_BASE_DELAY_MS", 3000);
  const maxDelayMs = getIntEnv("MONGO_RECONNECT_MAX_DELAY_MS", 30000);
  const delayMs = Math.min(baseDelayMs * reconnectAttempts, maxDelayMs);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectDB().catch((error) => {
      scheduleReconnect("retry-failed");
    });
  }, delayMs);
};

connectDB.ensureConnected = connectDB;
connectDB.forceReconnect = forceReconnect;
connectDB.scheduleReconnect = scheduleReconnect;
connectDB.isMongoConnectionError = isMongoConnectionError;
connectDB.getConnectionStatus = getConnectionStatus;
connectDB.isConnected = () => mongoose.connection.readyState === CONNECTED_STATE;

module.exports = connectDB;
