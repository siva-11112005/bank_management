const Joi = require("joi");

const forgotPasswordSchema = Joi.object({
  body: Joi.object({ email: Joi.string().email().required() }),
});

const resetPasswordSchema = Joi.object({
  body: Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
  }),
});

const verifyTokenSchema = Joi.object({
  body: Joi.object({ token: Joi.string().required() }),
});

module.exports = {
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyTokenSchema,
};
