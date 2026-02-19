const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Counter = require('../models/Counter');
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
    try {
        const { discordId, cartItems } = req.body;
        if (!discordId || !Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ error: 'Invalid request' });
        }

        const inGuild = await checkUserInGuild(discordId);
        if (!inGuild) {
            return res.status(403).json({ 
                error_code: "USER_NOT_IN_GUILD",
                invite_link: process.env.DISCORD_SERVER_INVITE 
            });
        }

        const dbUser = await User.findOne({ discordId });
        const discordUsername = dbUser?.discordUsername || '';

        const items = cartItems.map(i => ({
            product: i._id,
            name: i.name || 'Item',
            quantity: Number(i.quantity) || 1,
            price: Number(i.price) || 0
        }));
        const totalAmount = items.reduce((acc, i) => acc + i.price * i.quantity, 0);

        const counter = await Counter.findOneAndUpdate(
            { id: 'orderId' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        const orderId = `nm_${counter.seq}`;

        const newOrder = new Order({
            orderId,
            discordId,
            discordUsername,
            items,
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            status: 'Pending'
        });
        await newOrder.save();

        const channelId = await createOrderTicket(newOrder);
        if (channelId) await Order.findOneAndUpdate({ orderId }, { channelId });
        res.json({ success: true, orderId, channelId });
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 4. Tạo PayPal order cho web (trả về link thanh toán)
const { createPayPalOrder, createLTCInvoice, capturePayPalOrder } = require('../services/paymentService');
router.post('/create-payment', async (req, res) => {
    try {
        const { orderId, totalAmount, method } = req.body;
        if (!orderId || !totalAmount) return res.status(400).json({ error: 'Missing orderId or totalAmount' });
        const amount = parseFloat(totalAmount);

        if (method === 'paypal') {
            const base = process.env.WEBHOOK_BASE_URL || 'https://gaming-shop-backend.onrender.com';
            const returnUrl = `${base}/api/shop/paypal/capture?orderId=${encodeURIComponent(orderId)}`;
            const paypal = await createPayPalOrder(orderId, amount, returnUrl);
            if (!paypal?.approvalLink) return res.status(500).json({ error: 'PayPal not configured' });
            return res.json({ type: 'paypal', approvalLink: paypal.approvalLink, paypalOrderId: paypal.orderId });
        }
        if (method === 'ltc') {
            const ltc = await createLTCInvoice(orderId, amount);
            if (!ltc?.payAddress) return res.status(500).json({ error: 'LTC not configured' });
            return res.json({ type: 'ltc', payAddress: ltc.payAddress, payAmount: ltc.payAmount, payCurrency: ltc.payCurrency });
        }
        res.status(400).json({ error: 'Invalid method' });
    } catch (err) {
        console.error('Create payment error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 5. PayPal capture via JS SDK (AJAX, no redirect)
router.post('/paypal/capture-ajax', async (req, res) => {
    const { paypalOrderId, orderId } = req.body;
    if (!paypalOrderId) return res.status(400).json({ error: 'Missing paypalOrderId' });
    try {
        const ok = await capturePayPalOrder(paypalOrderId);
        if (ok && orderId) {
            await Order.findOneAndUpdate({ orderId }, { status: 'Completed', paymentMethod: 'paypal' });
        }
        res.json({ success: ok });
    } catch (e) {
        console.error('PayPal capture-ajax error:', e);
        res.status(500).json({ error: 'Capture failed' });
    }
});

// 5b. PayPal capture - redirect flow fallback
router.get('/paypal/capture', async (req, res) => {
    const token = req.query.token;
    const orderId = req.query.orderId;
    const clientUrl = process.env.CLIENT_URL || 'https://www.nosmarket.com';
    if (!token) return res.redirect(clientUrl);
    try {
        const ok = await capturePayPalOrder(token);
        if (ok && orderId) {
            const order = await Order.findOne({ orderId });
            await Order.findOneAndUpdate(
                { orderId },
                { status: 'Completed', paymentMethod: 'paypal' }
            );
            const total = order?.totalAmount || 0;
            const chId = order?.channelId || '';
            const redirectUrl = `${clientUrl}/pay?orderId=${encodeURIComponent(orderId)}&total=${total}&channelId=${chId}&paid=1`;
            return res.redirect(redirectUrl);
        }
    } catch (e) {}
    res.redirect(clientUrl);
});

// 5b. Webhook NOWPayments (LTC/crypto) - cập nhật đơn khi thanh toán thành công
router.post('/webhook/nowpayments', async (req, res) => {
    try {
        const { payment_status, order_id } = req.body;
        if (payment_status === 'finished' && order_id) {
            await Order.findOneAndUpdate({ orderId: order_id }, { status: 'Completed', paymentMethod: 'ltc' });
        }
        res.json({ received: true });
    } catch (err) {
        console.error('NOWPayments webhook:', err);
        res.status(500).json({ error: 'Webhook error' });
    }
});

// 6. Link Discord thủ công từ web (DiscordModal)
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

// 7. Admin: danh sách đơn (Customer, Payment method, Paid)
router.get('/orders', async (req, res) => {
    try {
        const orders = await Order.find({}).sort({ createdAt: -1 }).limit(100);
        res.json(orders.map(o => ({
            orderId: o.orderId,
            discordId: o.discordId,
            discordUsername: o.discordUsername,
            totalAmount: o.totalAmount,
            paymentMethod: o.paymentMethod || '—',
            status: o.status,
            isPaid: o.status === 'Completed',
            items: o.items
        })));
    } catch (err) {
        console.error('Orders error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;