const connectDB = require("../config/db");

const errorHandler = (err, req, res, next) => {
  const isPayloadTooLarge = err.type === "entity.too.large";
  const isMongoUnavailable = connectDB.isMongoConnectionError(err);
  const isWriteRequest = ["POST", "PUT", "PATCH", "DELETE"].includes(String(req.method || "").toUpperCase());
  const statusCode = isPayloadTooLarge ? 413 : (isMongoUnavailable ? 503 : (err.statusCode || 500));
  const message = isPayloadTooLarge
    ? "Request payload too large"
    : isMongoUnavailable
      ? isWriteRequest
        ? "Database is temporarily unavailable for updates. Please retry in a moment."
        : "Database temporarily unavailable. Please try again."
      : (err.message || "Internal Server Error");
  const logLabel = statusCode >= 500 ? "ERROR" : "WARN";
  const logMessage = `${req.method} ${req.originalUrl} -> ${statusCode} ${message}`;

  if (isMongoUnavailable && !connectDB.isConnected()) {
    connectDB.scheduleReconnect("error-middleware");
  }

  if (statusCode >= 500) {
    console.error(logLabel + ":", logMessage, err);
  } else {
    console.warn(logLabel + ":", logMessage);
  }

  res.status(statusCode).json({
    success: false,
    message
  });
};

module.exports = errorHandler;
