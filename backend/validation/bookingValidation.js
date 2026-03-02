const Joi = require("joi");

exports.bookingSchema = Joi.object({
  serviceId: Joi.string().required(),
  bookingDate: Joi.date().required()
});

exports.statusSchema = Joi.object({
  status: Joi.string()
    .valid("Pending", "Accepted", "Rejected", "Completed")
    .required()
});
