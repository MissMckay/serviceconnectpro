require("dotenv").config();
const mongoose = require("mongoose");
const Service = require("../models/Service");

(async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not set. Add it to .env before running backfill.");
  }

  try {
    await mongoose.connect(mongoUri);

    const result = await Service.updateMany(
      {},
      {
        $set: {
          imageUrl: "",
          providerName: "Not provided",
          providerAddress: "Not provided",
        },
      }
    );

    console.log("Backfill complete:", result.modifiedCount);
  } finally {
    await mongoose.disconnect();
  }

  await User.updateMany(
  { role: "provider", providerAddress: { $exists: false } },
  { $set: { providerAddress: "Not provided" } }
);

await User.updateMany(
  { role: "provider", phone: { $exists: false } },
  { $set: { phone: "Not provided" } }
);
})();
