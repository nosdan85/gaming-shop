const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { createOrderTicket, checkUserInGuild } = require('../bot');
const axios = require('axios'); // Dùng để gọi sang Discord
const qs = require('qs'); // Dùng để đóng gói dữ liệu gửi đi

// Helper: auto-join user vào 1 guild bằng access_token OAuth
const joinGuildWithAccessToken = async (guildId, userId, accessToken) => {
    try {
        await axios.put(
            `https://discord.com/api/guilds/${guildId}/members/${userId}`,
            { access_token: accessToken },
            {
                headers: {
                    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return true;
    } catch (err) {
        console.error('JoinGuild error:', err.response?.data || err.message);
        return false;
    }
};

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

        const {
            access_token,
            refresh_token,
            expires_in,
            scope,
            token_type
        } = tokenResponse.data;

        // B. Dùng Token lấy thông tin User
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        // C. Lưu / cập nhật vào MongoDB (collection users)
        const user = userResponse.data;

        const discordId = user.id;
        const discordUsername = user.username;

        let dbUser = await User.findOne({ discordId });
        if (!dbUser) {
            dbUser = new User({ discordId, discordUsername });
        } else {
            dbUser.discordUsername = discordUsername;
        }

        dbUser.accessToken = access_token;
        dbUser.refreshToken = refresh_token;
        dbUser.tokenExpiresAt = new Date(Date.now() + (expires_in || 0) * 1000);
        dbUser.scopes = typeof scope === 'string' ? scope.split(' ') : [];

        await dbUser.save();

        // D. Auto-join guild hiện tại nếu chưa trong server
        await joinGuildWithAccessToken(process.env.DISCORD_GUILD_ID, discordId, access_token);

        // E. Trả về cho Frontend
        res.json({
            user: {
                discordId: dbUser.discordId,
                discordUsername: dbUser.discordUsername,
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

// 4. Verify link token (từ !link trong Discord app)
router.get('/verify-token/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            linkToken: req.params.token,
            linkTokenExpiresAt: { $gt: new Date() }
        });
        if (!user) return res.status(404).json({ error: 'Token invalid or expired' });

        user.linkToken = null;
        user.linkTokenExpiresAt = null;
        await user.save();

        res.json({
            discordId: user.discordId,
            discordUsername: user.discordUsername,
        });
    } catch (err) {
        console.error('Verify token error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 5. Link Discord thủ công từ web (DiscordModal)
//    POST /api/shop/link-discord  { discordId, discordUsername }
router.post('/link-discord', async (req, res) => {
    const { discordId, discordUsername } = req.body;

    if (!discordId || !discordUsername) {
        return res.status(400).json({ message: 'Missing discordId or discordUsername' });
    }

    try {
        let user = await User.findOne({ discordId });

        if (!user) {
            user = await User.create({
                discordId,
                discordUsername,
            });
        } else {
            user.discordUsername = discordUsername;
            await user.save();
        }

        return res.json({
            message: 'Linked successfully',
            user: {
                discordId: user.discordId,
                discordUsername: user.discordUsername,
            },
        });
    } catch (err) {
        console.error('LinkDiscord Error:', err);
        return res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;