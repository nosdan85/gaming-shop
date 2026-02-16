const express = require('express');
const router = express.Router();
const { getProducts, checkout, linkDiscord } = require('../controllers/shopController');

router.get('/products', getProducts);
router.post('/checkout', checkout);
router.post('/link-discord', linkDiscord);

module.exports = router;