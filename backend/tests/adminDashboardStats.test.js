const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const express = require("express");

const adminRoutes = require("../routes/adminRoutes");
const User = require("../models/User");
const Service = require("../models/Service");

const startTestServer = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRoutes);

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
};

test("dashboard-stats returns aggregated counts for admin", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

  const originalUserCount = User.countDocuments;
  const originalServiceCount = Service.countDocuments;

  User.countDocuments = async (query = {}) => {
    if (Object.keys(query).length === 0) return 15;
    if (query.role === "provider" && query.isApproved === false) return 2;
    if (query.role === "user") return 11;
    if (query.role === "provider") return 4;
    if (query.accountStatus === "suspended") return 3;
    return 0;
  };
  Service.countDocuments = async (query = {}) => {
    if (query.moderationStatus === "removed") return 2;
    if (query.moderationStatus && query.moderationStatus.$ne === "removed") return 9;
    return 11;
  };

  const { server, baseUrl } = await startTestServer();

  try {
    const token = jwt.sign(
      { id: "507f191e810c19729de860ea", role: "admin" },
      process.env.JWT_SECRET
    );

    const response = await fetch(`${baseUrl}/api/admin/dashboard-stats`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.data, {
      totalUsers: 15,
      totalProviders: 4,
      pendingProviders: 2,
      suspendedUsers: 3,
      totalServices: 9,
      removedServices: 2
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.countDocuments = originalUserCount;
    Service.countDocuments = originalServiceCount;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("dashboard-stats blocks non-admin users", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

  const { server, baseUrl } = await startTestServer();

  try {
    const token = jwt.sign(
      { id: "507f191e810c19729de860ea", role: "user" },
      process.env.JWT_SECRET
    );

    const response = await fetch(`${baseUrl}/api/admin/dashboard-stats`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.message, "Access denied. Admins only.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    process.env.JWT_SECRET = previousSecret;
  }
});
