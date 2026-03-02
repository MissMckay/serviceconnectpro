const errorHandler = (err, req, res, next) => {
  const isPayloadTooLarge = err.type === "entity.too.large";
  const statusCode = isPayloadTooLarge ? 413 : (err.statusCode || 500);
  const message = isPayloadTooLarge
    ? "Request payload too large"
    : (err.message || "Internal Server Error");
  const logLabel = statusCode >= 500 ? "ERROR" : "WARN";
  const logMessage = `${req.method} ${req.originalUrl} -> ${statusCode} ${message}`;

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
