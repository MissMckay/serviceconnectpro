require('dotenv').config();
const express = require('express');
const path = require("path");
const connectDB = require('./config/db');
const cors = require("cors");



const app = express();
const bodyLimit = process.env.BODY_SIZE_LIMIT || "1mb";

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

const startServer = async () => {
  try {
    await connectDB();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server failed to start due to database connection failure.");
    console.error(error);
    process.exit(1);
  }
};

app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
app.use("/admin-ui", express.static(path.join(__dirname, "public", "admin")));

//authRoutes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);


//serviceRoutes
const serviceRoutes = require("./routes/serviceRoutes");
app.use("/api/services", serviceRoutes);

//bookingRoutes
const bookingRoutes = require("./routes/bookingRoutes");
app.use("/api/bookings", bookingRoutes);


app.get('/', (req, res) => {
    res.send("ServiceConnect API Running...");
});

const adminRoutes = require("./routes/adminRoutes");
app.use("/api/admin", adminRoutes);

const reviewRoutes = require("./routes/reviewRoutes");
app.use("/api/reviews", reviewRoutes);

const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);

const providerRoutes = require("./routes/providerRoutes");
app.use("/api/providers", providerRoutes);

const errorHandler = require("./middleware/errorMiddleware");
app.use(errorHandler);

startServer();
