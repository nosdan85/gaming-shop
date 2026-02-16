const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const { createOrderTicket, checkUserInGuild } = require('../bot');

// 1. Lấy danh sách sản phẩm
// Link gọi sẽ là: /api/shop/products
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Checkout (Mua hàng)
router.post('/checkout', async (req, res) => {
    const { discordId, cartItems } = req.body;

    // Kiểm tra xem User có trong Server Discord chưa
    const inGuild = await checkUserInGuild(discordId);
    if (!inGuild) {
        return res.status(403).json({ 
            error_code: "USER_NOT_IN_GUILD",
            invite_link: process.env.DISCORD_SERVER_INVITE 
        });
    }

    // Tính tổng tiền
    const totalAmount = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const orderId = `order_${Date.now()}`; // Tạo mã đơn hàng

    // Lưu đơn hàng vào DB
    const newOrder = new Order({
        orderId,
        discordId,
        items: cartItems,
        totalAmount,
        status: 'Pending'
    });
    await newOrder.save();

    // Tạo Ticket trên Discord
    const channelId = await createOrderTicket(newOrder);

    res.json({ success: true, orderId, channelId });
});

module.exports = router;