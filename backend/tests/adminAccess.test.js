const test = require("node:test");
const assert = require("node:assert/strict");

const isAdmin = require("../middleware/isAdmin");

const createRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

test("isAdmin blocks non-admin users", () => {
  const req = { user: { role: "user" } };
  const res = createRes();
  let nextCalled = false;

  isAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Access denied. Admins only.");
});

test("isAdmin allows admin users", () => {
  const req = { user: { role: "admin" } };
  const res = createRes();
  let nextCalled = false;

  isAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});
