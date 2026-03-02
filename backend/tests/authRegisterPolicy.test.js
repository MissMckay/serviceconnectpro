const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const authRoutes = require("../routes/authRoutes");
const User = require("../models/User");

const startTestServer = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
};

test("POST /api/auth/register rejects admin role in public signup", async () => {
  const originalFindOne = User.findOne;
  const originalSave = User.prototype.save;

  let saveCalled = false;

  User.findOne = async () => null;
  User.prototype.save = async function saveStub() {
    saveCalled = true;
    return this;
  };

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Admin Attempt",
        email: "admin-attempt@example.com",
        password: "Test@123",
        role: "admin"
      })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.message, "Invalid role");
    assert.equal(saveCalled, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findOne = originalFindOne;
    User.prototype.save = originalSave;
  }
});
