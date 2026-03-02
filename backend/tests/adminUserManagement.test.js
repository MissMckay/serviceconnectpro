const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const express = require("express");

const adminRoutes = require("../routes/adminRoutes");
const User = require("../models/User");
const Service = require("../models/Service");
const Booking = require("../models/Booking");
const Review = require("../models/Review");

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

const createAdminToken = () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  return jwt.sign(
    { id: "507f191e810c19729de860ea", role: "admin" },
    process.env.JWT_SECRET
  );
};

test("admin can fetch all registered users", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFind = User.find;
  const token = createAdminToken();

  User.find = () => ({
    select: async () => ([
      { _id: "1", name: "User A", role: "user", accountStatus: "active" },
      { _id: "2", name: "Provider B", role: "provider", accountStatus: "suspended" }
    ])
  });

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.find = originalFind;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("admin can suspend or activate a user account", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;
  const token = createAdminToken();
  const userId = "507f191e810c19729de860eb";

  const userDoc = {
    _id: userId,
    accountStatus: "active",
    save: async function save() {
      return this;
    }
  };

  User.findById = () => ({
    select: async () => userDoc
  });

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/users/${userId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ accountStatus: "suspended" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.accountStatus, "suspended");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findById = originalFindById;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("status update validates accountStatus values", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createAdminToken();
  const userId = "507f191e810c19729de860ec";

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/users/${userId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ accountStatus: "paused" })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "accountStatus must be either 'active' or 'suspended'");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    process.env.JWT_SECRET = previousSecret;
  }
});

test("delete user validates user ID", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createAdminToken();

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/users/not-a-valid-id`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "Invalid user ID");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    process.env.JWT_SECRET = previousSecret;
  }
});

test("admin can delete existing users", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;
  const originalFindByIdAndDelete = User.findByIdAndDelete;
  const token = createAdminToken();
  const userId = "507f191e810c19729de860ed";
  let deleteCalledWith = null;

  User.findById = async () => ({ _id: userId });
  User.findByIdAndDelete = async (id) => {
    deleteCalledWith = id;
  };

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, "User deleted successfully");
    assert.equal(deleteCalledWith, userId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findById = originalFindById;
    User.findByIdAndDelete = originalFindByIdAndDelete;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("admin can fetch pending providers", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFind = User.find;
  const token = createAdminToken();

  User.find = (query) => {
    assert.deepEqual(query, { role: "provider", isApproved: false });
    return {
      select: async () => ([
        { _id: "3", name: "Pending Provider", role: "provider", isApproved: false }
      ])
    };
  };

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/providers/pending`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].isApproved, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.find = originalFind;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("admin can approve a provider", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;
  const token = createAdminToken();
  const providerId = "507f191e810c19729de860ef";

  const providerDoc = {
    _id: providerId,
    role: "provider",
    isApproved: false,
    save: async function save() {
      return this;
    }
  };

  User.findById = () => ({
    select: async () => providerDoc
  });

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/providers/${providerId}/approval`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ decision: "approve" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.isApproved, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findById = originalFindById;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("admin can reject a provider", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;
  const token = createAdminToken();
  const providerId = "507f191e810c19729de860f0";

  const providerDoc = {
    _id: providerId,
    role: "provider",
    isApproved: true,
    save: async function save() {
      return this;
    }
  };

  User.findById = () => ({
    select: async () => providerDoc
  });

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/providers/${providerId}/approval`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ decision: "reject" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.isApproved, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findById = originalFindById;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("provider approval validates decision value", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createAdminToken();
  const providerId = "507f191e810c19729de860f1";

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/providers/${providerId}/approval`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ decision: "hold" })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "decision must be either 'approve' or 'reject'");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    process.env.JWT_SECRET = previousSecret;
  }
});

test("admin can fetch all listed services", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFind = Service.find;
  const token = createAdminToken();

  const services = [
    { _id: "s1", serviceName: "Plumbing", providerId: "p1" },
    { _id: "s2", serviceName: "Electrical", providerId: "p2" }
  ];

  Service.find = () => ({
    sort: async () => services
  });

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/services`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.data, services);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Service.find = originalFind;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("admin can delete service with related bookings and reviews", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createAdminToken();
  const serviceId = "507f191e810c19729de860f2";

  const originalServiceFindById = Service.findById;
  const originalServiceFindByIdAndDelete = Service.findByIdAndDelete;
  const originalBookingFind = Booking.find;
  const originalBookingDeleteMany = Booking.deleteMany;
  const originalReviewDeleteMany = Review.deleteMany;

  let reviewDeleteQuery = null;
  let bookingDeleteQuery = null;
  let deletedServiceId = null;

  Service.findById = async () => ({ _id: serviceId });
  Service.findByIdAndDelete = async (id) => {
    deletedServiceId = id;
  };
  Booking.find = () => ({
    select: async () => ([
      { _id: "507f191e810c19729de860f3" },
      { _id: "507f191e810c19729de860f4" }
    ])
  });
  Booking.deleteMany = async (query) => {
    bookingDeleteQuery = query;
  };
  Review.deleteMany = async (query) => {
    reviewDeleteQuery = query;
  };

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/services/${serviceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, "Service and related records deleted successfully");
    assert.deepEqual(bookingDeleteQuery, { serviceId });
    assert.equal(reviewDeleteQuery.$or[0].serviceId, serviceId);
    assert.deepEqual(reviewDeleteQuery.$or[1].bookingId, {
      $in: ["507f191e810c19729de860f3", "507f191e810c19729de860f4"]
    });
    assert.equal(deletedServiceId, serviceId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Service.findById = originalServiceFindById;
    Service.findByIdAndDelete = originalServiceFindByIdAndDelete;
    Booking.find = originalBookingFind;
    Booking.deleteMany = originalBookingDeleteMany;
    Review.deleteMany = originalReviewDeleteMany;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("service delete validates service ID", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createAdminToken();

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/admin/services/not-a-valid-id`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "Invalid service ID");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    process.env.JWT_SECRET = previousSecret;
  }
});
