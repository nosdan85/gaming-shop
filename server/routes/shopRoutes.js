const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const { createOrderTicket, checkUserInGuild } = require('../bot');
const axios = require('axios'); // Dùng để gọi sang Discord
const qs = require('qs'); // Dùng để đóng gói dữ liệu gửi đi

// 1. LOGIN DISCORD (MỚI THÊM)
// Link gọi: /api/shop/auth/discord
router.post('/auth/discord', async (req, res) => {
    const { code } = req.body;
    try {
        // A. Đổi Code lấy Token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', qs.stringify({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.DISCORD_REDIRECT_URI
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token } = tokenResponse.data;

        // B. Dùng Token lấy thông tin User
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        // C. Trả về cho Frontend
        const user = userResponse.data;
        res.json({
            user: {
                discordId: user.id,
                discordUsername: user.username,
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error("Login Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Authentication failed" });
    }
});

// 2. Lấy danh sách sản phẩm
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Checkout (Mua hàng)
router.post('/checkout', async (req, res) => {
    const { discordId, cartItems } = req.body;

    // Kiểm tra User trong Server
    const inGuild = await checkUserInGuild(discordId);
    if (!inGuild) {
        return res.status(403).json({ 
            error_code: "USER_NOT_IN_GUILD",
            invite_link: process.env.DISCORD_SERVER_INVITE 
        });
    }

    const totalAmount = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const orderId = `order_${Date.now()}`;

    const newOrder = new Order({
        orderId,
        discordId,
        items: cartItems,
        totalAmount,
        status: 'Pending'
    });
    await newOrder.save();

    const channelId = await createOrderTicket(newOrder);
    res.json({ success: true, orderId, channelId });
});

module.exports = router;