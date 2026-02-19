const express = require("express");
const router = express.Router();
const {
  listBeneficiaries,
  addBeneficiary,
  verifyBeneficiary,
  resendBeneficiaryOtp,
  removeBeneficiary,
} = require("../controllers/beneficiaryController");
const { protect } = require("../middleware/authMiddleware");
const validate = require("../middlewares/validate");
const Joi = require("joi");

const addSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().trim().min(2).required(),
    accountNumber: Joi.string().trim().required(),
    ifscCode: Joi.string().trim().min(6).required(),
  }),
});

const verifySchema = Joi.object({
  body: Joi.object({
    beneficiaryId: Joi.string().hex().length(24).required(),
    code: Joi.string().trim().pattern(/^\d{6}$/).required(),
  }),
});

router.get("/", protect, listBeneficiaries);
router.post("/", protect, validate(addSchema), addBeneficiary);
router.post("/verify", protect, validate(verifySchema), verifyBeneficiary);
router.post("/:beneficiaryId/resend-otp", protect, resendBeneficiaryOtp);
router.delete("/:beneficiaryId", protect, removeBeneficiary);

module.exports = router;
