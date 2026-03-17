const AdminInviteCode = require("../models/AdminInviteCode");
const asyncHandler = require("../utils/asyncHandler");

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(length = 10) {
  let s = "";
  for (let i = 0; i < length; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

exports.createAdminInviteCode = asyncHandler(async (req, res) => {
  const createdBy = req.user?.id ? String(req.user.id) : null;
  if (!createdBy) {
    return res.status(401).json({ message: "Authentication required" });
  }
  let code = randomCode(10);
  let exists = await AdminInviteCode.findById(code);
  while (exists) {
    code = randomCode(10);
    exists = await AdminInviteCode.findById(code);
  }
  await AdminInviteCode.create({
    _id: code,
    createdBy,
  });
  res.status(201).json({ success: true, data: { code, id: code } });
});

exports.getAdminInviteCode = asyncHandler(async (req, res) => {
  const { codeId } = req.params;
  if (!codeId) {
    return res.status(400).json({ message: "Code ID required" });
  }
  const doc = await AdminInviteCode.findById(codeId).lean();
  if (!doc) {
    return res.status(404).json({ success: false, message: "Code not found" });
  }
  res.json({
    success: true,
    data: {
      id: doc._id,
      code: doc._id,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt,
      usedBy: doc.usedBy ?? null,
      usedAt: doc.usedAt ?? null,
    },
  });
});

exports.markAdminInviteCodeUsed = asyncHandler(async (req, res) => {
  const { codeId } = req.params;
  const uid = req.body?.uid ?? req.user?.id;
  if (!codeId) {
    return res.status(400).json({ message: "Code ID required" });
  }
  if (!uid) {
    return res.status(400).json({ message: "uid required" });
  }
  const doc = await AdminInviteCode.findByIdAndUpdate(
    codeId,
    { $set: { usedBy: String(uid), usedAt: new Date() } },
    { new: true }
  );
  if (!doc) {
    return res.status(404).json({ success: false, message: "Code not found" });
  }
  res.json({ success: true, data: doc });
});

exports.listAdminInviteCodesByCreator = asyncHandler(async (req, res) => {
  const createdBy = req.user?.id ? String(req.user.id) : null;
  if (!createdBy) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const list = await AdminInviteCode.find({ createdBy })
    .sort({ createdAt: -1 })
    .lean();
  const data = list.map((d) => ({
    id: d._id,
    code: d._id,
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    usedBy: d.usedBy ?? null,
    usedAt: d.usedAt ?? null,
  }));
  res.json({ success: true, data });
});
