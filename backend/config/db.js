const mongoose = require("mongoose");
const dns = require("dns");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let listenersAttached = false;
let activeConnectionPromise = null;
let reconnectTimer = null;
let reconnectAttempts = 0;

const CONNECTED_STATE = 1;
const CONNECTING_STATE = 2;

const getIntEnv = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getMongoUri = () => {
  const rawStandardUri = process.env.MONGO_URI_STANDARD;
  const srvUri = process.env.MONGO_URI;
  const standardUri =
    rawStandardUri && rawStandardUri.startsWith("mongodb://") ? rawStandardUri : "";
  const mongoUri = standardUri || srvUri;

  if (!mongoUri) {
    if (rawStandardUri && rawStandardUri.startsWith("mongodb+srv://")) {
      throw new Error(
        "MONGO_URI_STANDARD must use mongodb:// host1,host2,host3 format. Move your mongodb+srv:// value to MONGO_URI."
      );
    }

    throw new Error("MONGO_URI or MONGO_URI_STANDARD must be set in .env");
  }

  return { mongoUri, usingStandardUri: Boolean(standardUri) };
};

const buildConnectionOptions = () => ({
  serverSelectionTimeoutMS: getIntEnv("MONGO_SERVER_SELECTION_TIMEOUT_MS", 15000),
  connectTimeoutMS: getIntEnv("MONGO_CONNECT_TIMEOUT_MS", 15000),
  socketTimeoutMS: getIntEnv("MONGO_SOCKET_TIMEOUT_MS", 45000),
  heartbeatFrequencyMS: getIntEnv("MONGO_HEARTBEAT_FREQUENCY_MS", 10000),
  maxPoolSize: getIntEnv("MONGO_MAX_POOL_SIZE", 10),
  minPoolSize: getIntEnv("MONGO_MIN_POOL_SIZE", 1),
  family: getIntEnv("MONGO_IP_FAMILY", 4),
  retryReads: true,
  retryWrites: true
});

const isMongoConnectionError = (error) => {
  if (!error) return false;

  const message = String(error.message || "").toLowerCase();
  const causeMessage = String(error.cause?.message || "").toLowerCase();

  return [
    error.name === "MongoNetworkError",
    error.name === "MongoNetworkTimeoutError",
    error.name === "MongoServerSelectionError",
    message.includes("timed out"),
    message.includes("connection"),
    message.includes("server selection"),
    message.includes("topology was destroyed"),
    causeMessage.includes("timed out")
  ].some(Boolean);
};

const attachConnectionListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on("connected", () => {
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const dbName = mongoose.connection.db?.databaseName || "unknown";
    console.log("MongoDB connection event: connected to", dbName);
  });

  mongoose.connection.on("reconnected", () => {
    reconnectAttempts = 0;
    console.log("MongoDB connection event: reconnected");
  });

  mongoose.connection.on("disconnected", () => {
    console.error("MongoDB connection event: disconnected");
    scheduleReconnect("disconnected");
  });

  mongoose.connection.on("error", (error) => {
    console.error("MongoDB connection event: error");
    console.error(error);

    if (isMongoConnectionError(error)) {
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

const connectWithRetry = async () => {
  const { mongoUri, usingStandardUri } = getMongoUri();
  const maxRetries = getIntEnv("MONGO_CONNECT_RETRIES", 5);
  const baseDelayMs = getIntEnv("MONGO_CONNECT_BASE_DELAY_MS", 1000);

  configureDns(mongoUri, usingStandardUri);
  mongoose.set("bufferCommands", false);
  attachConnectionListeners();

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(mongoUri, buildConnectionOptions());
      const dbName = mongoose.connection.db?.databaseName || "unknown";
      console.log("MongoDB Connected to database:", dbName);
      return mongoose.connection;
    } catch (error) {
      logConnectionGuidance(error, attempt, maxRetries, usingStandardUri);

      if (attempt < maxRetries) {
        const backoffMs = baseDelayMs * attempt;
        console.error(`Retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
      }
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

const scheduleReconnect = (reason = "unknown") => {
  if (mongoose.connection.readyState === CONNECTED_STATE || mongoose.connection.readyState === CONNECTING_STATE) {
    return;
  }

  if (activeConnectionPromise || reconnectTimer) {
    return;
  }

  reconnectAttempts += 1;
  const baseDelayMs = getIntEnv("MONGO_RECONNECT_BASE_DELAY_MS", 2000);
  const maxDelayMs = getIntEnv("MONGO_RECONNECT_MAX_DELAY_MS", 30000);
  const delayMs = Math.min(baseDelayMs * reconnectAttempts, maxDelayMs);

  console.error(`Scheduling MongoDB reconnect in ${delayMs}ms (${reason}).`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectDB().catch((error) => {
      console.error("MongoDB reconnect attempt failed.");
      console.error(error);
      scheduleReconnect("retry-failed");
    });
  }, delayMs);
};

connectDB.ensureConnected = connectDB;
connectDB.scheduleReconnect = scheduleReconnect;
connectDB.isMongoConnectionError = isMongoConnectionError;

module.exports = connectDB;
