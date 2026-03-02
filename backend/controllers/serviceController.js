const mongoose = require("mongoose");
const Service = require("../models/Service");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

const normalizeServiceImages = (imagesInput) => {
  if (imagesInput === undefined) return undefined;

  const rawImages = Array.isArray(imagesInput) ? imagesInput : [imagesInput];

  return rawImages
    .map((item) => {
      if (typeof item === "string") {
        return { imageUrl: item, caption: "" };
      }

      if (item && typeof item === "object") {
        const imageUrl = item.imageUrl || item.url || "";
        const caption = typeof item.caption === "string" ? item.caption : "";
        return imageUrl ? { imageUrl, caption } : null;
      }

      return null;
    })
    .filter(Boolean);
};

exports.createService = asyncHandler(async (req, res) => {
  const { serviceName, category, description, price, images, availabilityStatus } = req.body;
  const provider = await User.findById(req.user.id).select("role isApproved accountStatus");

  if (
    !provider ||
    provider.role !== "provider" ||
    provider.isApproved !== true ||
    provider.accountStatus !== "active"
  ) {
    const error = new Error("Only providers can create services");
    error.statusCode = 403;
    throw error;
  }

  if (!serviceName || !category || !description || price === undefined) {
    const error = new Error("serviceName, category, description and price are required");
    error.statusCode = 400;
    throw error;
  }

  if (Number(price) <= 0) {
    const error = new Error("price must be a positive number");
    error.statusCode = 400;
    throw error;
  }

  const service = await Service.create({
    serviceName,
    category,
    description,
    price: Number(price),
    availabilityStatus: ["Available", "Unavailable"].includes(availabilityStatus)
      ? availabilityStatus
      : "Available",
    images: normalizeServiceImages(images) || [],
    providerId: req.user.id
  });

  res.status(201).json({
    success: true,
    data: service
  });
});

exports.getAllServices = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const services = await Service.find({ moderationStatus: { $ne: "removed" } })
    .populate("providerId", "name phone providerAddress")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: services
  });
});

exports.getServiceById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error("Invalid service ID");
    error.statusCode = 400;
    throw error;
  }

  const service = await Service.findOne({ _id: id, moderationStatus: { $ne: "removed" } })
    .populate("providerId", "name phone providerAddress");

  if (!service) {
    const error = new Error("Service not found");
    error.statusCode = 404;
    throw error;
  }

  res.json({
    success: true,
    data: service
  });
});

exports.updateService = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error("Invalid service ID");
    error.statusCode = 400;
    throw error;
  }

  const service = await Service.findById(id);

  if (!service) {
    const error = new Error("Service not found");
    error.statusCode = 404;
    throw error;
  }

  if (service.providerId.toString() !== req.user.id) {
    const error = new Error("Not authorized to update this service");
    error.statusCode = 403;
    throw error;
  }

  const allowedFields = ["serviceName", "category", "description", "price", "images", "availabilityStatus"];

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      if (field === "price") {
        service.price = Number(req.body.price);
      } else if (field === "images") {
        service.images = normalizeServiceImages(req.body.images) || [];
      } else {
        service[field] = req.body[field];
      }
    }
  });

  if (service.price <= 0) {
    const error = new Error("price must be a positive number");
    error.statusCode = 400;
    throw error;
  }

  await service.save();

  res.json({
    success: true,
    data: service
  });
});

exports.deleteService = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error("Invalid service ID");
    error.statusCode = 400;
    throw error;
  }

  const service = await Service.findById(id);

  if (!service) {
    const error = new Error("Service not found");
    error.statusCode = 404;
    throw error;
  }

  if (service.providerId.toString() !== req.user.id) {
    const error = new Error("Not authorized to delete this service");
    error.statusCode = 403;
    throw error;
  }

  await service.deleteOne();

  res.json({
    success: true,
    message: "Service deleted successfully"
  });
});
