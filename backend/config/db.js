const mongoose = require('mongoose');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error("MONGO_URI is not set. Add it to .env before starting the server.");
    }

    mongoose.set('bufferCommands', false);

    const maxRetries = Number.parseInt(process.env.MONGO_CONNECT_RETRIES || "5", 10);
    const baseDelayMs = Number.parseInt(process.env.MONGO_CONNECT_BASE_DELAY_MS || "1000", 10);
    const serverSelectionTimeoutMS = Number.parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || "5000", 10);
    const connectTimeoutMS = Number.parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || "5000", 10);

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            await mongoose.connect(mongoUri, {
                serverSelectionTimeoutMS,
                connectTimeoutMS,
            });
            console.log("MongoDB Connected");
            return;
        } catch (error) {
            const message = String(error?.message || "");
            const isAtlasNetworkAccessIssue =
                error?.name === "MongooseServerSelectionError" ||
                message.toLowerCase().includes("whitelist") ||
                message.toLowerCase().includes("replicasetnoprimary");

            console.error(`MongoDB connection attempt ${attempt} of ${maxRetries} failed.`);

            if (isAtlasNetworkAccessIssue) {
                console.error(
                    "MongoDB Atlas connection failed: your current public IP is likely not allowed in Atlas Network Access. " +
                    "Add your IP in Atlas -> Security -> Network Access, then retry."
                );
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
