const Joi = require("joi");

// Generic validation middleware using Joi schemas
module.exports = (schema) => {
  return (req, res, next) => {
    const toValidate = {
      body: req.body,
      params: req.params,
      query: req.query,
    };

    const options = { allowUnknown: true, abortEarly: false, stripUnknown: true };
    const { error, value } = schema.validate(toValidate, options);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        details: error.details.map((d) => d.message),
      });
    }
    req.body = value.body || req.body;
    req.params = value.params || req.params;
    req.query = value.query || req.query;
    next();
  };
};
