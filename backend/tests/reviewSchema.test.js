const test = require("node:test");
const assert = require("node:assert/strict");

const Review = require("../models/Review");

test("review schema has required fields, refs, and validation", () => {
  const schema = Review.schema;

  assert.equal(schema.path("userId").options.ref, "User");
  assert.equal(schema.path("serviceId").options.ref, "Service");
  assert.equal(schema.path("bookingId").options.ref, "Booking");

  assert.equal(schema.path("rating").options.min, 1);
  assert.equal(schema.path("rating").options.max, 5);
  assert.equal(schema.path("comment").options.type, String);
  assert.equal(schema.options.timestamps, true);
});

test("review schema enforces one review per user per booking", () => {
  const indexes = Review.schema.indexes();
  const hasUniqueBookingUserIndex = indexes.some(([keys, options]) => {
    return (
      keys.bookingId === 1 &&
      keys.userId === 1 &&
      options &&
      options.unique === true
    );
  });

  assert.equal(hasUniqueBookingUserIndex, true);
});
