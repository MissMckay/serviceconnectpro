const mongoose = require('mongoose');
const dns = require('dns');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async () => {
    // Prefer standard URI if set (avoids DNS SRV lookup, works when network blocks querySrv)
    const standardUri = process.env.MONGO_URI_STANDARD;
    const srvUri = process.env.MONGO_URI;
    const mongoUri = standardUri || srvUri;

    if (!mongoUri) {
        throw new Error("MONGO_URI or MONGO_URI_STANDARD must be set in .env");
    }

    mongoose.set('bufferCommands', false);

    const maxRetries = Number.parseInt(process.env.MONGO_CONNECT_RETRIES || "5", 10);
    const baseDelayMs = Number.parseInt(process.env.MONGO_CONNECT_BASE_DELAY_MS || "1000", 10);
    const serverSelectionTimeoutMS = Number.parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || "10000", 10);
    const connectTimeoutMS = Number.parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || "10000", 10);
    const socketTimeoutMS = Number.parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS || "10000", 10);
    const maxPoolSize = Number.parseInt(process.env.MONGO_MAX_POOL_SIZE || "10", 10);

    // If using SRV URI, try Google DNS first (many networks block SRV on default DNS)
    const useSrv = mongoUri.startsWith("mongodb+srv://");
    if (useSrv) {
        dns.setServers(["8.8.8.8", "8.8.4.4"]);
    }

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            await mongoose.connect(mongoUri, {
                serverSelectionTimeoutMS,
                connectTimeoutMS,
                socketTimeoutMS,
                maxPoolSize,
            });
            const dbName = mongoose.connection.db?.databaseName || "unknown";
            console.log("MongoDB Connected to database:", dbName);
            return;
        } catch (error) {
            const message = String(error?.message || "");
            const code = error?.code || "";
            const syscall = error?.syscall || "";
            const reasonType = error?.reason?.type || error?.cause?.type || "";
            const isSrvRefused = syscall === "querySrv" && (code === "ECONNREFUSED" || code === "ENOTFOUND");
            const isAtlasNetworkAccessIssue =
                error?.name === "MongooseServerSelectionError" ||
                reasonType === "ReplicaSetNoPrimary" ||
                message.toLowerCase().includes("whitelist") ||
                message.toLowerCase().includes("replicasetnoprimary") ||
                message.toLowerCase().includes("could not connect to any servers");

            console.error(`MongoDB connection attempt ${attempt} of ${maxRetries} failed.`);

            if (isSrvRefused && !standardUri) {
                console.error(
                    "Your network is blocking DNS SRV lookups (used by mongodb+srv://).\n" +
                    "Fix: In Atlas go to Connect -> your cluster -> Connect your application -> Node.js.\n" +
                    "Choose driver version 2.12 or earlier to see the STANDARD connection string.\n" +
                    "Copy it, replace <password> with your DB password, add /serviceconnect before the ? if missing.\n" +
                    "Then in .env set MONGO_URI_STANDARD=<that string> and leave MONGO_URI as is (or remove it)."
                );
            } else if (isAtlasNetworkAccessIssue) {
                console.error("");
                console.error(">>> FIX: Allow your IP in MongoDB Atlas <<<");
                console.error("1. Go to https://cloud.mongodb.com and sign in.");
                console.error("2. Open your project -> Security (left sidebar) -> Network Access.");
                console.error("3. Click 'Add IP Address'.");
                console.error("4. Either click 'Add Current IP Address' OR use 'Allow Access from Anywhere' (0.0.0.0/0) for testing.");
                console.error("5. Confirm. Wait 1-2 minutes, then restart this backend (npm start).");
                console.error("");
            }

            console.error(error);

            if (attempt < maxRetries) {
                const backoffMs = baseDelayMs * attempt;
                console.error(`Retrying in ${backoffMs}ms...`);
                await sleep(backoffMs);
            }
        }
    }

    throw new Error("MongoDB connection failed after retries. See logs above for details.");
};

module.exports = connectDB;
