const express = require('express');
const {
  sendOtp,
  verifyOtp,
  createContact,
} = require('../controllers/contactController');

const router = express.Router();

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/', createContact);

module.exports = router;
