const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const express = require("express");

const serviceRoutes = require("../routes/serviceRoutes");
const errorHandler = require("../middleware/errorMiddleware");
const Service = require("../models/Service");
const User = require("../models/User");

const startTestServer = () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/api/services", serviceRoutes);
  app.use(errorHandler);

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
};

const createProviderToken = (id = "507f191e810c19729de860aa") => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  return jwt.sign({ id, role: "provider" }, process.env.JWT_SECRET);
};

const approvedProvider = {
  _id: "507f191e810c19729de860aa",
  role: "provider",
  isApproved: true,
  accountStatus: "active"
};

test("POST /api/services merges image values from multiple supported fields", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createProviderToken();

  const originalUserFindById = User.findById;
  const originalServiceCreate = Service.create;

  let createdPayload = null;

  User.findById = () => ({
    select: async () => approvedProvider
  });

  Service.create = async (payload) => {
    createdPayload = payload;
    return { _id: "service-1", ...payload };
  };

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/services`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        serviceName: "AC Repair",
        category: "Home Services",
        description: "Repairs and maintenance",
        price: 120,
        imageUrl: "https://cdn.example.com/one.jpg",
        photos: [
          "https://cdn.example.com/two.jpg",
          { imageUrl: "https://cdn.example.com/three.jpg", caption: "Front view" }
        ],
        serviceImages: [{ url: "https://cdn.example.com/four.jpg" }]
      })
    });

    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(createdPayload.images.length, 4);
    assert.deepEqual(createdPayload.images, [
      { imageUrl: "https://cdn.example.com/one.jpg", caption: "" },
      { imageUrl: "https://cdn.example.com/two.jpg", caption: "" },
      { imageUrl: "https://cdn.example.com/three.jpg", caption: "Front view" },
      { imageUrl: "https://cdn.example.com/four.jpg", caption: "" }
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findById = originalUserFindById;
    Service.create = originalServiceCreate;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("PUT /api/services/:id supports indexed object image payloads", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createProviderToken();
  const serviceId = "507f191e810c19729de860bb";

  const originalUserFindById = User.findById;
  const originalServiceFindById = Service.findById;

  const serviceDoc = {
    _id: serviceId,
    providerId: { toString: () => "507f191e810c19729de860aa" },
    serviceName: "AC Repair",
    category: "Home Services",
    description: "Repairs and maintenance",
    price: 120,
    images: [],
    save: async function save() {
      return this;
    }
  };

  User.findById = () => ({
    select: async () => approvedProvider
  });

  Service.findById = async () => serviceDoc;

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/services/${serviceId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        images: {
          0: "https://cdn.example.com/a.jpg",
          1: { imageUrl: "https://cdn.example.com/b.jpg", caption: "B" }
        }
      })
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.data.images, [
      { imageUrl: "https://cdn.example.com/a.jpg", caption: "" },
      { imageUrl: "https://cdn.example.com/b.jpg", caption: "B" }
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findById = originalUserFindById;
    Service.findById = originalServiceFindById;
    process.env.JWT_SECRET = previousSecret;
  }
});
