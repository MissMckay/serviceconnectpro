const mongoose = require("mongoose");
const Service = require("../models/Service");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

const parseMaybeJson = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return value;
    }
  }
  return value;
};

const IMAGE_FIELD_NAMES = [
  "images",
  "image",
  "imageUrl",
  "imageUrls",
  "photo",
  "photos",
  "photoUrls",
  "serviceImages"
];

const isImageObject = (value) =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ("imageUrl" in value || "url" in value || "caption" in value)
  );

const objectValuesInOrder = (value) => {
  const keys = Object.keys(value);
  const numericKeys = keys.filter((key) => /^\d+$/.test(key));

  if (numericKeys.length === keys.length) {
    return numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key]);
  }

  return Object.values(value);
};

const getImagesFromBody = (body = {}) => {
  const candidates = IMAGE_FIELD_NAMES
    .filter((fieldName) => Object.prototype.hasOwnProperty.call(body, fieldName))
    .map((fieldName) => parseMaybeJson(body[fieldName]))
    .filter((value) => value !== undefined && value !== null);

  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  return candidates;
};

const isMultipartRequest = (req) =>
  typeof req.headers?.["content-type"] === "string" &&
  req.headers["content-type"].toLowerCase().includes("multipart/form-data");

const normalizeServiceImages = (imagesInput) => {
  if (imagesInput === undefined) return undefined;

  const parsedImages = parseMaybeJson(imagesInput);
  const rawImages = Array.isArray(parsedImages)
    ? parsedImages
    : (parsedImages && typeof parsedImages === "object" && !isImageObject(parsedImages))
      ? objectValuesInOrder(parsedImages)
      : [parsedImages];

  return rawImages
    .map((item) => {
      const parsedItem = parseMaybeJson(item);

      if (Array.isArray(parsedItem)) {
        return normalizeServiceImages(parsedItem);
      }

      const normalizedItem = parsedItem && typeof parsedItem === "object" ? parsedItem : item;

      if (typeof normalizedItem === "string") {
        return { imageUrl: normalizedItem.trim(), caption: "" };
      }

      if (normalizedItem && typeof normalizedItem === "object") {
        const imageUrl = (normalizedItem.imageUrl || normalizedItem.url || "").toString().trim();
        const caption = typeof normalizedItem.caption === "string" ? normalizedItem.caption : "";
        return imageUrl ? { imageUrl, caption } : null;
      }

      return null;
    })
    .flat()
    .filter(Boolean);
};

exports.createService = asyncHandler(async (req, res) => {
  const { serviceName, category, description, price, availabilityStatus } = req.body;
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

  const normalizedImages = normalizeServiceImages(getImagesFromBody(req.body)) || [];
  if (isMultipartRequest(req) && normalizedImages.length === 0) {
    const error = new Error("Multipart file upload is not supported on this endpoint. Send image URLs in the body.");
    error.statusCode = 400;
    throw error;
  }
  if (normalizedImages.length > 10) {
    const error = new Error("Maximum 10 images are allowed");
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
    images: normalizedImages,
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

  const allowedFields = ["serviceName", "category", "description", "price", "availabilityStatus"];

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      if (field === "price") {
        service.price = Number(req.body.price);
      } else {
        service[field] = req.body[field];
      }
    }
  });

  if (IMAGE_FIELD_NAMES.some((fieldName) => Object.prototype.hasOwnProperty.call(req.body, fieldName))) {
    const normalizedImages = normalizeServiceImages(getImagesFromBody(req.body)) || [];
    if (isMultipartRequest(req) && normalizedImages.length === 0) {
      const error = new Error("Multipart file upload is not supported on this endpoint. Send image URLs in the body.");
      error.statusCode = 400;
      throw error;
    }
    if (normalizedImages.length > 10) {
      const error = new Error("Maximum 10 images are allowed");
      error.statusCode = 400;
      throw error;
    }
    service.images = normalizedImages;
  }

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
