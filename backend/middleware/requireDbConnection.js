const mongoose = require("mongoose");
const connectDB = require("../config/db");

const CONNECTED_STATE = 1;

const requireDbConnection = async (req, res, next) => {
  if (mongoose.connection.readyState === CONNECTED_STATE) {
    return next();
  }

  try {
    await connectDB.ensureConnected();
    return next();
  } catch (error) {
    if (connectDB.isMongoConnectionError(error)) {
      connectDB.scheduleReconnect("request-gate-failed");
      return res.status(503).json({
        success: false,
        message: "Database temporarily unavailable. Please try again."
      });
    }

    return next(error);
  }
};

module.exports = requireDbConnection;
