const Joi = require("joi");

exports.serviceSchema = Joi.object({
  serviceName: Joi.string().min(3).required(),
  category: Joi.string().required(),
  description: Joi.string().min(5).required(),
  price: Joi.number().positive().required(),
  availabilityStatus: Joi.string().valid("Available", "Unavailable")
});
