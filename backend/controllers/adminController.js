const mongoose = require("mongoose");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const Review = require("../models/Review");
const asyncHandler = require("../utils/asyncHandler");
const { archiveServicesByProvider, clearServicesListCache } = require("./serviceController");

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const applyQueryModifiers = (query, { sort, page, limit } = {}) => {
  let result = query;

  if (sort && typeof result.sort === "function") {
    result = result.sort(sort);
  }

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (parsedPage - 1) * parsedLimit;

  if (typeof result.skip === "function") {
    result = result.skip(skip);
  }
  if (typeof result.limit === "function") {
    result = result.limit(parsedLimit);
  }

  return { query: result, parsedPage, parsedLimit };
};

exports.getAllUsers = asyncHandler(async (req, res) => {
  const { search = "", role, status, approved, page, limit } = req.query;
  const shouldPaginate = page !== undefined || limit !== undefined;

  const filter = {};

  if (search.trim()) {
    const regex = new RegExp(escapeRegex(search.trim()), "i");
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  if (typeof role === "string" && ["user", "provider", "admin"].includes(role)) {
    filter.role = role;
  }

  if (typeof status === "string" && ["active", "suspended"].includes(status)) {
    filter.accountStatus = status;
  }

  if (typeof approved === "string" && ["true", "false"].includes(approved.toLowerCase())) {
    filter.isApproved = approved.toLowerCase() === "true";
  }

  let usersQuery = User.find(filter).select("-password -profilePhoto").lean();
  const { query, parsedPage, parsedLimit } = applyQueryModifiers(usersQuery, {
    sort: { createdAt: -1 },
    page,
    limit
  });
  usersQuery = query;

  const users = await usersQuery;
  const total = shouldPaginate
    ? await User.countDocuments(filter)
    : (Array.isArray(users) ? users.length : 0);

  res.json({
    success: true,
    data: users,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.max(Math.ceil(total / parsedLimit), 1)
    }
  });
});

const isValidUserId = (id) => {
  if (id == null || typeof id !== "string") return false;
  const v = id.trim();
  if (!v) return false;
  // Allow: Mongo ObjectId strings OR Firebase-like UIDs (20+ chars)
  if (/^[a-fA-F0-9]{24}$/.test(v)) return true;
  if (/^[A-Za-z0-9_-]{20,128}$/.test(v)) return true;
  return false;
};

exports.getUserDetailsAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidUserId(id)) {
    return res.status(400).json({ success: false, message: "Invalid user ID" });
  }
  const user = await User.findById(id.trim()).select("-password");
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const uid = id.trim();
  const [bookingsCount, reviewsCount, servicesCount] = await Promise.all([
    Booking.countDocuments({
      $or: [{ userId: uid }, { providerId: uid }]
    }),
    Review.countDocuments({ userId: uid }),
    Service.countDocuments({ providerId: uid })
  ]);

  res.json({
    success: true,
    data: {
      ...user.toObject(),
      metrics: {
        bookingsCount,
        reviewsCount,
        servicesCount
      }
    }
  });
});

exports.updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};
  if (!isValidUserId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID"
    });
  }
  const uid = id.trim();

  const allowedRoles = ["user", "provider", "admin"];
  if (typeof role !== "string" || !allowedRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: "role must be one of: user, provider, admin"
    });
  }

  if (req.user && req.user.id === uid && role !== "admin") {
    return res.status(400).json({
      success: false,
      message: "Admins cannot remove their own admin role"
    });
  }
  const user = await User.findById(uid).select("-password");

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  user.role = role;
  await user.save();

  res.json({
    success: true,
    data: user
  });
});

exports.getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    totalProviders,
    pendingProviders,
    suspendedUsers,
    totalServices,
    removedServices
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: "provider" }),
    User.countDocuments({ role: "provider", isApproved: false }),
    User.countDocuments({ accountStatus: "suspended" }),
    Service.countDocuments({ moderationStatus: { $ne: "removed" } }),
    Service.countDocuments({ moderationStatus: "removed" })
  ]);

  res.json({
    success: true,
    data: {
      totalUsers,
      totalProviders,
      pendingProviders,
      suspendedUsers,
      totalServices,
      removedServices
    }
  });
});

exports.updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accountStatus } = req.body;
  if (!isValidUserId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID"
    });
  }
  const uid = id.trim();

  if (!["active", "suspended"].includes(accountStatus)) {
    return res.status(400).json({
      success: false,
      message: "accountStatus must be either 'active' or 'suspended'"
    });
  }

  const user = await User.findById(uid).select("-password");
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found"
    });
  }
  user.accountStatus = accountStatus;
  await user.save();
  res.json({
    success: true,
    data: user
  });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const softDelete = String(req.query.softDelete || "false").toLowerCase() === "true";
  const hardDelete = String(req.query.hardDelete || "false").toLowerCase() === "true";
  if (!isValidUserId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID"
    });
  }
  const uid = id.trim();
  if (req.user && req.user.id === uid) {
    return res.status(400).json({
      success: false,
      message: "Admins cannot delete their own account"
    });
  }

  const user = await User.findById(uid);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found"
    });
  }

  let archivedServices = 0;
  if (String(user.role || "").toLowerCase() === "provider") {
    archivedServices = await archiveServicesByProvider(uid, req.user?.id || "system");
  }

  if (softDelete && !hardDelete) {
    user.accountStatus = "suspended";
    if (typeof user.save === "function") {
      await user.save();
    } else {
      await User.updateOne({ _id: uid }, { $set: { accountStatus: "suspended" } });
    }

    return res.json({
      success: true,
      message: "User suspended successfully",
      archivedServices
    });
  }

  await User.findByIdAndDelete(uid);
  clearServicesListCache();

  return res.json({
    success: true,
    message: "User deleted successfully",
    archivedServices
  });
});

exports.getPendingProviders = asyncHandler(async (req, res) => {
  const pendingProviders = await User.find({
    role: "provider",
    isApproved: false
  }).select("-password -profilePhoto").lean();

  res.json({
    success: true,
    data: pendingProviders
  });
});

exports.getAllProviders = asyncHandler(async (req, res) => {
  const providers = await User.find({ role: "provider" })
    .select("-password -profilePhoto")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: providers
  });
});

exports.updateProviderApprovalStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { decision, isApproved, accountStatus, approvalStatus } = req.body;
  if (!isValidUserId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid provider ID"
    });
  }
  const uid = id.trim();

  const hasDecision = typeof decision === "string";
  const hasExplicitApproval = typeof isApproved === "boolean";
  if (!hasDecision && !hasExplicitApproval) {
    return res.status(400).json({
      success: false,
      message: "Provide either decision ('approve'|'reject') or isApproved (boolean)"
    });
  }

  if (hasDecision && !["approve", "reject"].includes(decision)) {
    return res.status(400).json({
      success: false,
      message: "decision must be either 'approve' or 'reject'"
    });
  }

  const provider = await User.findById(uid).select("-password");
  if (!provider || provider.role !== "provider") {
    return res.status(404).json({
      success: false,
      message: "Provider not found"
    });
  }
  const approvedFromDecision = hasDecision ? decision === "approve" : null;
  const nextIsApproved = hasExplicitApproval ? isApproved : approvedFromDecision;

  provider.isApproved = nextIsApproved;
  const normalizedApprovalStatus =
    typeof approvalStatus === "string" ? approvalStatus.trim().toLowerCase() : "";
  if (["pending", "approved", "rejected"].includes(normalizedApprovalStatus)) {
    provider.approvalStatus = normalizedApprovalStatus;
  } else if (provider.isApproved) {
    provider.approvalStatus = "approved";
  } else if (hasDecision || hasExplicitApproval) {
    provider.approvalStatus = "rejected";
  }

  if (typeof accountStatus === "string" && ["active", "suspended"].includes(accountStatus)) {
    provider.accountStatus = accountStatus;
  } else if (provider.isApproved && provider.accountStatus !== "active") {
    provider.accountStatus = "active";
  }

  await provider.save();

  res.json({
    success: true,
    message: provider.isApproved ? "Provider approved successfully" : "Provider rejected successfully",
    data: provider
  });
});

exports.approveProvider = asyncHandler(async (req, res) => {
  req.body = {
    ...req.body,
    decision: "approve",
    isApproved: true,
    approvalStatus: "approved",
    accountStatus: req.body.accountStatus || "active"
  };

  return exports.updateProviderApprovalStatus(req, res);
});

exports.rejectProvider = asyncHandler(async (req, res) => {
  req.body = {
    ...req.body,
    decision: "reject",
    isApproved: false,
    approvalStatus: "rejected",
    accountStatus: req.body.accountStatus || "suspended"
  };

  return exports.updateProviderApprovalStatus(req, res);
});

exports.updateProviderAccountStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accountStatus } = req.body;
  if (!isValidUserId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid provider ID"
    });
  }
  const uid = id.trim();
  if (!["active", "suspended"].includes(accountStatus)) {
    return res.status(400).json({
      success: false,
      message: "accountStatus must be either 'active' or 'suspended'"
    });
  }
  const provider = await User.findById(uid).select("-password");

  if (!provider || provider.role !== "provider") {
    return res.status(404).json({
      success: false,
      message: "Provider not found"
    });
  }

  provider.accountStatus = accountStatus;
  await provider.save();

  res.json({
    success: true,
    data: provider
  });
});

exports.getAllServicesAdmin = asyncHandler(async (req, res) => {
  const {
    category,
    providerId,
    status,
    search = "",
    page,
    limit
  } = req.query;
  const shouldPaginate = page !== undefined || limit !== undefined;

  const filter = {};

  if (typeof category === "string" && category.trim()) {
    filter.category = category.trim();
  }

  if (typeof providerId === "string" && providerId.trim()) {
    filter.providerId = providerId.trim();
  }

  if (typeof status === "string" && ["active", "removed", "available", "unavailable"].includes(status)) {
    if (["active", "removed"].includes(status)) {
      filter.moderationStatus = status;
    } else {
      filter.availabilityStatus = status === "available" ? "Available" : "Unavailable";
    }
  }

  if (search.trim()) {
    filter.$or = [
      { serviceName: new RegExp(escapeRegex(search.trim()), "i") },
      { description: new RegExp(escapeRegex(search.trim()), "i") }
    ];
  }

  let servicesQuery = Service.find(filter)
    .select("serviceName category description price availabilityStatus moderationStatus providerId providerName providerPhone providerAddress averageRating reviewsCount createdAt removedAt removedBy");
  if (typeof servicesQuery.populate === "function") {
    servicesQuery = servicesQuery.populate("providerId", "name phone providerAddress");
  }

  const { query, parsedPage, parsedLimit } = applyQueryModifiers(servicesQuery, {
    sort: { createdAt: -1 },
    page,
    limit
  });
  servicesQuery = query;

  const services = await servicesQuery.lean();
  const total = shouldPaginate
    ? await Service.countDocuments(filter)
    : (Array.isArray(services) ? services.length : 0);

  const mappedServices = Array.isArray(services)
    ? services.map((service) => ({
      ...service,
      ...(Array.isArray(service.images) ? { imagesCount: service.images.length } : {})
    }))
    : services;

  res.json({
    success: true,
    data: mappedServices,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.max(Math.ceil(total / parsedLimit), 1)
    }
  });
});

exports.updateServiceAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid service ID"
    });
  }

  const service = await Service.findById(id);
  if (!service) {
    return res.status(404).json({
      success: false,
      message: "Service not found"
    });
  }

  const allowedFields = [
    "serviceName",
    "category",
    "description",
    "price",
    "availabilityStatus",
    "moderationStatus"
  ];

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      service[field] = req.body[field];
    }
  });

  if (service.moderationStatus === "removed") {
    service.removedAt = service.removedAt || new Date();
    service.removedBy = req.user?.id || null;
  }

  await service.save();

  res.json({
    success: true,
    data: service
  });
});

exports.deleteServiceAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hardDelete = String(req.query.hardDelete || "false").toLowerCase() === "true";

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid service ID"
    });
  }

  const service = await Service.findById(id);
  if (!service) {
    return res.status(404).json({
      success: false,
      message: "Service not found"
    });
  }

  if (!hardDelete && typeof service.save === "function") {
    service.moderationStatus = "removed";
    service.removedAt = new Date();
    service.removedBy = req.user?.id || null;
    await service.save();

    return res.json({
      success: true,
      message: "Service removed successfully",
      data: service
    });
  }

  const relatedBookings = await Booking.find({ serviceId: id }).select("_id");
  const bookingIds = relatedBookings.map((booking) => booking._id);

  await Promise.all([
    Review.deleteMany({
      $or: [
        { serviceId: id },
        ...(bookingIds.length ? [{ bookingId: { $in: bookingIds } }] : [])
      ]
    }),
    Booking.deleteMany({ serviceId: id }),
    Service.findByIdAndDelete(id)
  ]);

  return res.json({
    success: true,
    message: "Service and related records deleted successfully"
  });
});
