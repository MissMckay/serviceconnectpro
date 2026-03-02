const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const express = require("express");

const reviewRoutes = require("../routes/reviewRoutes");
const errorHandler = require("../middleware/errorMiddleware");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const Service = require("../models/Service");

const startTestServer = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/reviews", reviewRoutes);
  app.use(errorHandler);

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
};

const createUserToken = (id = "507f191e810c19729de860aa") => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  return jwt.sign({ id, role: "user" }, process.env.JWT_SECRET);
};

test("POST /api/reviews requires authentication", async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: "507f191e810c19729de860ab",
        rating: 5,
        comment: "Great service"
      })
    });

    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.message, "Access denied. No token provided.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/reviews allows only completed bookings", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createUserToken();
  const originalFindById = Booking.findById;

  Booking.findById = async () => ({
    _id: "507f191e810c19729de860ab",
    userId: "507f191e810c19729de860aa",
    serviceId: "507f191e810c19729de860ac",
    status: "Pending"
  });

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/reviews`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        bookingId: "507f191e810c19729de860ab",
        rating: 4,
        comment: "Good"
      })
    });

    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.message, "Only completed bookings can be reviewed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Booking.findById = originalFindById;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("POST /api/reviews stores review and updates service average rating", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createUserToken();

  const originalBookingFindById = Booking.findById;
  const originalReviewFindOne = Review.findOne;
  const originalReviewCreate = Review.create;
  const originalReviewFind = Review.find;
  const originalServiceFindByIdAndUpdate = Service.findByIdAndUpdate;

  let updatedServiceId = null;
  let updatedPayload = null;

  Booking.findById = async () => ({
    _id: "507f191e810c19729de860ab",
    userId: "507f191e810c19729de860aa",
    serviceId: "507f191e810c19729de860ac",
    status: "Completed"
  });
  Review.findOne = async () => null;
  Review.create = async (payload) => ({
    _id: "507f191e810c19729de860ad",
    ...payload
  });
  Review.find = () => ({
    select: async () => ([
      { rating: 4 },
      { rating: 5 }
    ])
  });
  Service.findByIdAndUpdate = async (id, payload) => {
    updatedServiceId = id;
    updatedPayload = payload;
  };

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/reviews`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        bookingId: "507f191e810c19729de860ab",
        rating: 5,
        comment: "Excellent"
      })
    });

    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.rating, 5);
    assert.equal(updatedServiceId, "507f191e810c19729de860ac");
    assert.deepEqual(updatedPayload, { averageRating: 4.5 });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Booking.findById = originalBookingFindById;
    Review.findOne = originalReviewFindOne;
    Review.create = originalReviewCreate;
    Review.find = originalReviewFind;
    Service.findByIdAndUpdate = originalServiceFindByIdAndUpdate;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("DELETE /api/reviews/:id recalculates average rating after deletion", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createUserToken();
  const reviewId = "507f191e810c19729de860ae";
  const serviceId = "507f191e810c19729de860ac";

  const originalReviewFindById = Review.findById;
  const originalReviewFind = Review.find;
  const originalServiceFindByIdAndUpdate = Service.findByIdAndUpdate;

  let updatedPayload = null;

  const reviewDoc = {
    _id: reviewId,
    userId: "507f191e810c19729de860aa",
    serviceId,
    deleteOne: async () => {}
  };

  Review.findById = async () => reviewDoc;
  Review.find = () => ({
    select: async () => ([
      { rating: 3 },
      { rating: 4 }
    ])
  });
  Service.findByIdAndUpdate = async (id, payload) => {
    assert.equal(id, serviceId);
    updatedPayload = payload;
  };

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/reviews/${reviewId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, "Review deleted successfully");
    assert.deepEqual(updatedPayload, { averageRating: 3.5 });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Review.findById = originalReviewFindById;
    Review.find = originalReviewFind;
    Service.findByIdAndUpdate = originalServiceFindByIdAndUpdate;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("DELETE /api/reviews/:id sets service average rating to 0 when no reviews remain", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const token = createUserToken();
  const reviewId = "507f191e810c19729de860af";
  const serviceId = "507f191e810c19729de860ac";

  const originalReviewFindById = Review.findById;
  const originalReviewFind = Review.find;
  const originalServiceFindByIdAndUpdate = Service.findByIdAndUpdate;

  let updatedPayload = null;

  const reviewDoc = {
    _id: reviewId,
    userId: "507f191e810c19729de860aa",
    serviceId,
    deleteOne: async () => {}
  };

  Review.findById = async () => reviewDoc;
  Review.find = () => ({
    select: async () => ([])
  });
  Service.findByIdAndUpdate = async (id, payload) => {
    assert.equal(id, serviceId);
    updatedPayload = payload;
  };

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/reviews/${reviewId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(updatedPayload, { averageRating: 0 });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Review.findById = originalReviewFindById;
    Review.find = originalReviewFind;
    Service.findByIdAndUpdate = originalServiceFindByIdAndUpdate;
    process.env.JWT_SECRET = previousSecret;
  }
});

test("GET /api/reviews/service/:serviceId returns latest reviews with user name", async () => {
  const originalReviewFind = Review.find;
  const serviceId = "507f191e810c19729de860ac";
  let capturedQuery = null;
  let capturedSort = null;
  let capturedPopulate = null;

  const mockedReviews = [
    { _id: "r2", rating: 5, userId: { name: "Latest User" } },
    { _id: "r1", rating: 4, userId: { name: "Older User" } }
  ];

  Review.find = (query) => {
    capturedQuery = query;
    return {
      sort: (sortObj) => {
        capturedSort = sortObj;
        return {
          populate: async (path, select) => {
            capturedPopulate = { path, select };
            return mockedReviews;
          }
        };
      }
    };
  };

  const { server, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/api/reviews/service/${serviceId}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(capturedQuery, { serviceId });
    assert.deepEqual(capturedSort, { createdAt: -1 });
    assert.deepEqual(capturedPopulate, { path: "userId", select: "name" });
    assert.deepEqual(body.data, mockedReviews);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Review.find = originalReviewFind;
  }
});
