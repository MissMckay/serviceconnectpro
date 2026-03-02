const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const express = require("express");

const adminRoutes = require("../routes/adminRoutes");

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

test("admin API blocks non-admin users", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

  const { server, baseUrl } = await startTestServer();

  try {
    const token = jwt.sign(
      { id: "507f191e810c19729de860ea", role: "user" },
      process.env.JWT_SECRET
    );

    const response = await fetch(`${baseUrl}/api/admin/users`, {
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

test("admin API blocks requests without token", async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/admin/users`, {
      method: "GET"
    });

    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.message, "Access denied. No token provided.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
