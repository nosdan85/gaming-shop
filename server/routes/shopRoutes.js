const express = require('express');
const router = express.Router();
const { getProducts, checkout } = require('../controllers/shopController'); // Bỏ linkDiscord cũ
const { discordCallback } = require('../controllers/authController'); // Thêm cái này
const { checkoutLimiter } = require('../middleware/rateLimit');

router.get('/products', getProducts);
router.post('/checkout', checkoutLimiter, checkout);
router.post('/auth/discord', discordCallback); // Route mới xử lý login

module.exports = router;