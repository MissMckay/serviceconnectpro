const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const express = require("express");
const mongoose = require("mongoose");

const serviceRoutes = require("../routes/serviceRoutes");
const errorHandler = require("../middleware/errorMiddleware");
const Service = require("../models/Service");
const User = require("../models/User");
const connectDB = require("../config/db");

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

const createFindChain = (resultFactory) => {
  const chain = {
    select() {
      return chain;
    },
    read() {
      return chain;
    },
    sort() {
      return chain;
    },
    skip() {
      return chain;
    },
    limit() {
      return chain;
    },
    maxTimeMS() {
      return chain;
    },
    lean() {
      return resultFactory();
    }
  };

  return chain;
};

test("POST /api/services merges image values from multiple supported fields", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createProviderToken();

  const originalUserFindById = User.findById;
  const originalServiceCreate = Service.create;

  let createdPayload = null;

  User.findById = () => ({
    read() {
      return this;
    },
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
      { imageUrl: "https://cdn.example.com/one.jpg", thumbnailUrl: "", caption: "" },
      { imageUrl: "https://cdn.example.com/two.jpg", thumbnailUrl: "", caption: "" },
      { imageUrl: "https://cdn.example.com/three.jpg", thumbnailUrl: "", caption: "Front view" },
      { imageUrl: "https://cdn.example.com/four.jpg", thumbnailUrl: "", caption: "" }
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
    read() {
      return this;
    },
    select: async () => approvedProvider
  });

  Service.findById = () => ({
    read: async () => serviceDoc
  });

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
      { imageUrl: "https://cdn.example.com/a.jpg", thumbnailUrl: "", caption: "" },
      { imageUrl: "https://cdn.example.com/b.jpg", thumbnailUrl: "", caption: "B" }
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findById = originalUserFindById;
    Service.findById = originalServiceFindById;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("GET /api/services serves stale cache immediately while refreshing in background", async () => {
  const originalFind = Service.find;
  const originalGetConnectionStatus = connectDB.getConnectionStatus;
  const originalScheduleReconnect = connectDB.scheduleReconnect;
  const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");

  let findCallCount = 0;

  Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    value: 1,
  });

  connectDB.getConnectionStatus = () => ({
    readyState: 1,
    connected: true,
    connecting: false,
    degraded: false,
    degradedUntil: null,
    lastConnectionIssue: null,
  });
  connectDB.scheduleReconnect = () => {};

  Service.find = () => {
    findCallCount += 1;

    if (findCallCount === 1) {
      return createFindChain(async () => ([
        {
          _id: "service-fast",
          serviceName: "Fast listing",
          category: "Home",
          description: "Fast result",
          price: 100,
          availabilityStatus: "Available",
          images: [{ imageUrl: "https://cdn.example.com/a.jpg", caption: "" }],
          providerId: "provider-1",
          providerName: "Provider One",
          providerAddress: "Monrovia",
          providerProfilePhoto: "",
          averageRating: 4.5,
          reviewsCount: 3,
          createdAt: new Date().toISOString(),
        }
      ]));
    }

    return createFindChain(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve([
              {
                _id: "service-slow",
                serviceName: "Slow refresh",
                category: "Home",
                description: "Slow result",
                price: 120,
                availabilityStatus: "Available",
                images: [{ imageUrl: "https://cdn.example.com/b.jpg", caption: "" }],
                providerId: "provider-2",
                providerName: "Provider Two",
                providerAddress: "Monrovia",
                providerProfilePhoto: "",
                averageRating: 4.7,
                reviewsCount: 5,
                createdAt: new Date().toISOString(),
              }
            ]);
          }, 1500);
        })
    );
  };

  const { server, baseUrl } = await startTestServer();

  try {
    const warmResponse = await fetch(`${baseUrl}/api/services`);
    const warmBody = await warmResponse.json();

    assert.equal(warmResponse.status, 200);
    assert.equal(warmBody.data[0].serviceName, "Fast listing");

    await new Promise((resolve) => setTimeout(resolve, 5200));

    const startedAt = Date.now();
    const staleResponse = await fetch(`${baseUrl}/api/services`);
    const elapsedMs = Date.now() - startedAt;
    const staleBody = await staleResponse.json();

    assert.equal(staleResponse.status, 200);
    assert.equal(staleBody.meta.cache, "stale");
    assert.equal(staleBody.data[0].serviceName, "Fast listing");
    assert.ok(elapsedMs < 1000, `expected cached response under 1000ms, got ${elapsedMs}ms`);

    await new Promise((resolve) => setTimeout(resolve, 1600));
    assert.ok(findCallCount >= 2, "expected background refresh query to run");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Service.find = originalFind;
    connectDB.getConnectionStatus = originalGetConnectionStatus;
    connectDB.scheduleReconnect = originalScheduleReconnect;

    if (originalReadyStateDescriptor) {
      Object.defineProperty(mongoose.connection, "readyState", originalReadyStateDescriptor);
    }
  }
});
