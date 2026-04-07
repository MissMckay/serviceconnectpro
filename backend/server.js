require("dotenv").config();
const http = require("http");
const express = require("express");
const path = require("path");
const { Server } = require("socket.io");
const cors = require("cors");

const connectDB = require("./config/db");
const { attachMessageSocket } = require("./socket/messageSocket");

const app = express();
const server = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const corsOrigins = corsOrigin.split(",").map((o) => o.trim()).filter(Boolean);
const corsOriginRegex = process.env.CORS_ORIGIN_REGEX || "";
const corsOriginPatterns = corsOriginRegex
  .split(",")
  .map((pattern) => pattern.trim())
  .filter(Boolean)
  .map((pattern) => new RegExp(pattern));

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (corsOrigins.includes(origin) || corsOriginPatterns.some((pattern) => pattern.test(origin))) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

const io = new Server(server, { cors: corsOptions });
app.set("io", io);
attachMessageSocket(io);

const bodyLimit = process.env.BODY_SIZE_LIMIT || "50mb";

app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
app.use("/admin-ui", express.static(path.join(__dirname, "public", "admin")));

// Health check
function healthHandler(req, res) {
  const mongoose = require("mongoose");
  const dbState = mongoose.connection.readyState;
  const stateNames = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };

  res.json({
    ok: dbState === 1,
    database: stateNames[dbState] || "unknown",
    databaseName: mongoose.connection.db?.databaseName || null,
  });
}

app.get("/api/health", healthHandler);
app.get("/health", healthHandler);

// Routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

const serviceRoutes = require("./routes/serviceRoutes");
app.use("/api/services", serviceRoutes);

const bookingRoutes = require("./routes/bookingRoutes");
app.use("/api/bookings", bookingRoutes);

const adminRoutes = require("./routes/adminRoutes");
app.use("/api/admin", adminRoutes);

const adminInviteCodeRoutes = require("./routes/adminInviteCodeRoutes");
app.use("/api/admin-invite-codes", adminInviteCodeRoutes);

const reviewRoutes = require("./routes/reviewRoutes");
app.use("/api/reviews", reviewRoutes);

const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);
app.use("/users", userRoutes);

const messageRoutes = require("./routes/messageRoutes");
app.use("/api/messages", messageRoutes);
app.use("/messages", messageRoutes);

const providerRoutes = require("./routes/providerRoutes");
app.use("/api/providers", providerRoutes);

app.get("/", (req, res) => {
  res.send("ServiceConnect API Running...");
});

const errorHandler = require("./middleware/errorMiddleware");
app.use(errorHandler);

const startServer = async () => {
  const PORT = process.env.PORT || 5000;

  try {
    await connectDB();
    console.log("MongoDB Atlas connected. Database ready.");
  } catch (error) {
    console.error("Database connection failed. Server will not start.");
    console.error(error.message || error);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
