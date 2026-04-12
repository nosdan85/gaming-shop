const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const qs = require('qs');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Counter = require('../models/Counter');
const { createOrderTicket, createPayPalFFTicket, checkUserInGuild, checkUserHasOwnerRole } = require('../bot');
const { createPayPalOrder, createLTCInvoice, capturePayPalOrder } = require('../services/paymentService');
const { discordRequest } = require('../utils/discordApi');
const { authRequired } = require('../middleware/authMiddleware');
const { checkoutLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const MAX_QUANTITY_PER_PRODUCT = 100000;

const getBackendBaseUrl = () => (process.env.WEBHOOK_BASE_URL || process.env.BACKEND_URL || '').replace(/\/+$/, '');
const getClientBaseUrl = () => ((process.env.CLIENT_URL || '').split(',')[0] || '').trim().replace(/\/+$/, '');
const buildClientPayUrl = (orderId, extraQuery = '') => {
    const encodedOrderId = encodeURIComponent(orderId || '');
    const query = extraQuery ? `&${extraQuery}` : '';
    const base = getClientBaseUrl();
    if (base) return `${base}/pay?orderId=${encodedOrderId}${query}`;
    return `/pay?orderId=${encodedOrderId}${query}`;
};

const isDiscordTemporaryBlock = (status, data) => {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    if (status !== 403) return false;
    const text = typeof data === 'string' ? data.toLowerCase() : JSON.stringify(data || {}).toLowerCase();
    return text.includes('cloudflare') || text.includes('1015') || text.includes('temporarily blocked');
};

const getDiscordErrorMessage = (data) => {
    if (!data) return '';
    if (typeof data === 'string') return data.slice(0, 200);
    return data.error_description || data.message || data.error || '';
};

const timingSafeEqualHex = (left, right) => {
    if (!left || !right) return false;
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

const extractPayPalSummary = (captureData) => {
    const purchaseUnit = captureData?.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const amountValue = Number(capture?.amount?.value || purchaseUnit?.amount?.value || 0);
    const currency = capture?.amount?.currency_code || purchaseUnit?.amount?.currency_code || '';
    const referenceId = purchaseUnit?.reference_id || '';
    return { amountValue, currency, referenceId };
};

const amountsMatch = (left, right) => Math.abs(Number(left) - Number(right)) < 0.01;
const BULK_DISCOUNT_THRESHOLD = 14.99;
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const resolveAppliedPrice = (product, quantity) => {
    const qty = Number(quantity) || 0;
    const regularUnitPrice = Number(product.price) || 0;
    const regularTotal = regularUnitPrice * qty;
    const bulkUnitPrice = Number(product.bulkPrice);
    const hasBulkPrice = Number.isFinite(bulkUnitPrice) && bulkUnitPrice > 0;
    if (hasBulkPrice && regularTotal > BULK_DISCOUNT_THRESHOLD) {
        return bulkUnitPrice;
    }
    return regularUnitPrice;
};

const joinGuildWithAccessToken = async (guildId, userId, accessToken) => {
    if (!guildId || !userId || !accessToken || !process.env.DISCORD_BOT_TOKEN) return false;
    try {
        await discordRequest({
            method: 'put',
            url: `https://discord.com/api/guilds/${guildId}/members/${userId}`,
            data: { access_token: accessToken },
            headers: {
                Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (err) {
        console.error('Join guild error:', err.response?.data || err.message);
        return false;
    }
};

const getOwnedOrder = async (orderId, discordId) => {
    const order = await Order.findOne({ orderId });
    if (!order) return { order: null, status: 404, error: 'Order not found' };
    if (order.discordId !== discordId) return { order: null, status: 403, error: 'You do not own this order' };
    return { order, status: 200, error: null };
};

const canAccessOwnerEndpoints = async (discordId) => {
    if (!discordId) return false;
    const ownerId = process.env.DISCORD_OWNER_ID || '';
    if (ownerId && discordId === ownerId) return true;
    return checkUserHasOwnerRole(discordId);
};

router.post('/auth/discord', async (req, res) => {
    const { code, redirect_uri: frontendRedirectUri } = req.body || {};
    const redirectUri = frontendRedirectUri || process.env.DISCORD_REDIRECT_URI;
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });
    if (!redirectUri) return res.status(400).json({ error: 'redirect_uri required' });

    try {
        const tokenResponse = await discordRequest({
            method: 'post',
            url: 'https://discord.com/api/oauth2/token',
            data: qs.stringify({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }, 0, { maxRetries: 1, maxDelayMs: 2500 });

        const { access_token, refresh_token, expires_in, scope } = tokenResponse.data || {};

        const userResponse = await discordRequest({
            method: 'get',
            url: 'https://discord.com/api/users/@me',
            headers: { Authorization: `Bearer ${access_token}` }
        }, 0, { maxRetries: 1, maxDelayMs: 2500 });

        const user = userResponse.data || {};
        const discordId = user.id;
        const discordUsername = user.username;
        if (!discordId || !discordUsername) {
            return res.status(500).json({ error: 'Discord user payload is invalid' });
        }

        let dbUser = await User.findOne({ discordId });
        if (!dbUser) {
            dbUser = new User({ discordId, discordUsername });
        } else {
            dbUser.discordUsername = discordUsername;
        }

        dbUser.accessToken = access_token;
        dbUser.refreshToken = refresh_token;
        dbUser.tokenExpiresAt = new Date(Date.now() + (Number(expires_in) || 0) * 1000);
        dbUser.scopes = typeof scope === 'string' ? scope.split(' ') : [];
        await dbUser.save();

        await joinGuildWithAccessToken(process.env.DISCORD_GUILD_ID, discordId, access_token);

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({ error: 'JWT_SECRET is not configured' });
        }

        const token = jwt.sign(
            { discordId: dbUser.discordId, type: 'user' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            user: {
                discordId: dbUser.discordId,
                discordUsername: dbUser.discordUsername,
                avatar: user.avatar || null
            },
            token
        });
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        const message = getDiscordErrorMessage(data);
        console.error('Discord auth error:', status, data || error.message);

        if (isDiscordTemporaryBlock(status, data)) {
            return res.status(503).json({
                error: 'Discord temporarily limiting requests. Please try again in a few minutes.',
                code: 'DISCORD_RATE_LIMIT'
            });
        }

        if (status >= 400 && status < 500) {
            return res.status(400).json({
                error: message || 'Discord authentication failed. Check app credentials and redirect URI.'
            });
        }

        return res.status(500).json({ error: 'Authentication failed' });
    }
});

router.get('/products', async (req, res) => {
    try {
        const products = await Product.find().lean();
        res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
        return res.json(products);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/checkout', authRequired, checkoutLimiter, async (req, res) => {
    try {
        const discordId = req.user?.discordId;
        const cartItems = Array.isArray(req.body?.cartItems) ? req.body.cartItems : [];
        if (!discordId || cartItems.length === 0) {
            return res.status(400).json({ error: 'Invalid request payload' });
        }

        const dbUser = await User.findOne({ discordId });
        if (!dbUser) {
            return res.status(401).json({ error: 'Discord account not linked' });
        }

        const inGuild = await checkUserInGuild(discordId);
        if (!inGuild) {
            return res.status(403).json({
                error_code: 'USER_NOT_IN_GUILD',
                invite_link: process.env.DISCORD_SERVER_INVITE || ''
            });
        }

        const quantityByProductId = new Map();
        for (const item of cartItems) {
            const productId = typeof item?._id === 'string' ? item._id.trim() : '';
            const quantity = Number(item?.quantity);
            if (!OBJECT_ID_PATTERN.test(productId)) continue;
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_PRODUCT) continue;
            quantityByProductId.set(productId, (quantityByProductId.get(productId) || 0) + quantity);
        }

        if (quantityByProductId.size === 0) {
            return res.status(400).json({ error: 'Cart contains invalid products' });
        }

        const productIds = Array.from(quantityByProductId.keys());
        const products = await Product.find({ _id: { $in: productIds } });
        if (products.length !== productIds.length) {
            return res.status(400).json({ error: 'Some products are invalid or no longer available' });
        }

        const items = products.map((product) => {
            const quantity = quantityByProductId.get(String(product._id));
            const appliedUnitPrice = resolveAppliedPrice(product, quantity);
            return {
                product: product._id,
                name: product.name,
                quantity,
                price: appliedUnitPrice
            };
        });

        const totalAmount = roundMoney(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
        if (totalAmount <= 0) {
            return res.status(400).json({ error: 'Invalid cart total' });
        }

        const counter = await Counter.findOneAndUpdate(
            { id: 'orderId' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        const orderId = `nm_${counter.seq}`;
        const newOrder = new Order({
            orderId,
            discordId,
            discordUsername: dbUser.discordUsername || '',
            items,
            totalAmount,
            status: 'Pending'
        });
        await newOrder.save();

        return res.json({ success: true, orderId, totalAmount: newOrder.totalAmount });
    } catch (err) {
        console.error('Checkout error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.get('/order-payment-info', authRequired, async (req, res) => {
    const orderId = req.query?.orderId;
    if (!orderId) return res.status(400).json({ error: 'Missing orderId' });
    try {
        const { order, status, error } = await getOwnedOrder(orderId, req.user.discordId);
        if (!order) return res.status(status).json({ error });
        return res.json({
            orderId: order.orderId,
            totalAmount: order.totalAmount,
            status: order.status,
            isPaid: order.status === 'Completed'
        });
    } catch (err) {
        console.error('Order payment info error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post('/create-payment', authRequired, async (req, res) => {
    try {
        const { orderId, method } = req.body || {};
        if (!orderId || !method) {
            return res.status(400).json({ error: 'Missing orderId or method' });
        }

        const { order, status, error } = await getOwnedOrder(orderId, req.user.discordId);
        if (!order) return res.status(status).json({ error });

        if (order.status === 'Completed') {
            return res.status(400).json({ error: 'Order is already paid' });
        }

        if (method === 'paypal') {
            const backendBaseUrl = getBackendBaseUrl();
            const clientBaseUrl = getClientBaseUrl();
            if (!backendBaseUrl || !clientBaseUrl) {
                return res.status(500).json({ error: 'Payment URLs are not configured' });
            }

            const returnUrl = `${backendBaseUrl}/api/shop/paypal/capture?orderId=${encodeURIComponent(orderId)}`;
            const cancelUrl = `${clientBaseUrl}/pay?orderId=${encodeURIComponent(orderId)}`;
            const paypal = await createPayPalOrder(orderId, order.totalAmount, returnUrl, cancelUrl);
            if (!paypal?.approvalLink || !paypal?.orderId) {
                return res.status(500).json({ error: 'PayPal is not configured' });
            }

            await Order.findByIdAndUpdate(order._id, {
                paypalOrderId: paypal.orderId,
                paymentMethod: 'paypal'
            });

            return res.json({
                type: 'paypal',
                approvalLink: paypal.approvalLink,
                paypalOrderId: paypal.orderId
            });
        }

        if (method === 'ltc') {
            const ltc = await createLTCInvoice(orderId, order.totalAmount);
            if (!ltc?.payAddress) {
                return res.status(500).json({ error: 'LTC payment is not configured' });
            }

            await Order.findByIdAndUpdate(order._id, { paymentMethod: 'ltc' });
            return res.json({
                type: 'ltc',
                payAddress: ltc.payAddress,
                payAmount: ltc.payAmount,
                payCurrency: ltc.payCurrency
            });
        }

        return res.status(400).json({ error: 'Invalid payment method' });
    } catch (err) {
        console.error('Create payment error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post('/paypal/capture-ajax', authRequired, async (req, res) => {
    const { paypalOrderId, orderId } = req.body || {};
    if (!paypalOrderId || !orderId) {
        return res.status(400).json({ error: 'Missing paypalOrderId or orderId' });
    }

    try {
        const { order, status, error } = await getOwnedOrder(orderId, req.user.discordId);
        if (!order) return res.status(status).json({ error });

        if (order.paypalOrderId && order.paypalOrderId !== paypalOrderId) {
            return res.status(400).json({ error: 'PayPal order mismatch' });
        }

        const capture = await capturePayPalOrder(paypalOrderId);
        if (!capture.success) {
            return res.status(400).json({ error: 'Capture failed' });
        }

        const summary = extractPayPalSummary(capture.data);
        if (summary.referenceId && summary.referenceId !== orderId) {
            return res.status(400).json({ error: 'PayPal reference mismatch' });
        }
        if (!amountsMatch(summary.amountValue, order.totalAmount)) {
            return res.status(400).json({ error: 'Paid amount mismatch' });
        }

        await Order.findByIdAndUpdate(order._id, {
            status: 'Completed',
            paymentMethod: 'paypal'
        });
        return res.json({ success: true });
    } catch (err) {
        console.error('PayPal capture-ajax error:', err);
        return res.status(500).json({ error: 'Capture failed' });
    }
});

router.get('/paypal/capture', async (req, res) => {
    const paypalOrderId = req.query?.token;
    const orderId = req.query?.orderId;
    const fallback = getClientBaseUrl() || '/';

    if (!paypalOrderId || !orderId) return res.redirect(fallback);

    try {
        const order = await Order.findOne({ orderId });
        if (!order) return res.redirect(fallback);
        if (order.paypalOrderId && order.paypalOrderId !== paypalOrderId) {
            return res.redirect(buildClientPayUrl(orderId, 'error=paypal_order_mismatch'));
        }

        const capture = await capturePayPalOrder(paypalOrderId);
        if (!capture.success) {
            return res.redirect(buildClientPayUrl(orderId, 'error=paypal_capture_failed'));
        }

        const summary = extractPayPalSummary(capture.data);
        if (summary.referenceId && summary.referenceId !== orderId) {
            return res.redirect(buildClientPayUrl(orderId, 'error=paypal_reference_mismatch'));
        }
        if (!amountsMatch(summary.amountValue, order.totalAmount)) {
            return res.redirect(buildClientPayUrl(orderId, 'error=paypal_amount_mismatch'));
        }

        await Order.findByIdAndUpdate(order._id, {
            status: 'Completed',
            paymentMethod: 'paypal'
        });

        return res.redirect(buildClientPayUrl(orderId, 'paid=1'));
    } catch (err) {
        console.error('PayPal capture redirect error:', err);
        return res.redirect(buildClientPayUrl(orderId, 'error=paypal_capture_failed'));
    }
});

router.post('/webhook/nowpayments', async (req, res) => {
    try {
        const signature = req.headers['x-nowpayments-sig'];
        const secret = process.env.NOWPAYMENTS_IPN_SECRET;

        if (secret) {
            const expected = crypto.createHmac('sha512', secret).update(req.rawBody || '').digest('hex');
            if (!timingSafeEqualHex(String(signature || ''), expected)) {
                return res.status(401).json({ error: 'Invalid webhook signature' });
            }
        }

        const paymentStatus = String(req.body?.payment_status || '').toLowerCase();
        const orderId = req.body?.order_id;
        const finalStatuses = new Set(['finished', 'confirmed']);
        if (orderId && finalStatuses.has(paymentStatus)) {
            const payCurrency = String(req.body?.pay_currency || 'ltc').toLowerCase();
            await Order.findOneAndUpdate(
                { orderId },
                { status: 'Completed', paymentMethod: payCurrency }
            );
        }

        return res.json({ received: true });
    } catch (err) {
        console.error('NOWPayments webhook error:', err);
        return res.status(500).json({ error: 'Webhook error' });
    }
});

router.post('/link-discord', async (req, res) => {
    return res.status(410).json({
        error: 'Manual Discord linking is disabled. Please use OAuth login.'
    });
});

router.get('/paypal-email', (req, res) => {
    return res.json({ email: process.env.PAYPAL_EMAIL || '' });
});

router.post('/create-ticket-paypal-ff', authRequired, async (req, res) => {
    try {
        const { orderId } = req.body || {};
        if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

        const { order, status, error } = await getOwnedOrder(orderId, req.user.discordId);
        if (!order) return res.status(status).json({ error });

        if (order.paypalTicketChannelId) {
            return res.json({
                channelId: order.paypalTicketChannelId,
                email: process.env.PAYPAL_EMAIL || ''
            });
        }

        const counter = await Counter.findOneAndUpdate(
            { id: 'paypalTicket' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        const paypalSeq = counter.seq;
        const channelName = `paypal_${paypalSeq}`;
        const channelId = await createPayPalFFTicket(order, paypalSeq);
        if (channelId) {
            await Order.findByIdAndUpdate(order._id, {
                paymentMethod: 'paypal_ff',
                paypalTicketChannel: channelName,
                paypalTicketChannelId: channelId
            });
        }

        return res.json({
            channelId: channelId || null,
            email: process.env.PAYPAL_EMAIL || ''
        });
    } catch (err) {
        console.error('Create PayPal F&F ticket error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post('/create-ticket', authRequired, async (req, res) => {
    try {
        const { orderId } = req.body || {};
        if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

        const { order, status, error } = await getOwnedOrder(orderId, req.user.discordId);
        if (!order) return res.status(status).json({ error });

        if (order.channelId) {
            return res.json({ channelId: order.channelId });
        }

        const channelId = await createOrderTicket(order);
        if (channelId) {
            await Order.findByIdAndUpdate(order._id, { channelId });
        }
        return res.json({ channelId: channelId || null });
    } catch (err) {
        console.error('Create ticket error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.get('/check-owner', authRequired, async (req, res) => {
    try {
        const discordId = req.user?.discordId;
        if (!discordId) return res.status(401).json({ isOwner: false });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        return res.json({ isOwner });
    } catch (err) {
        return res.status(500).json({ isOwner: false });
    }
});

router.get('/orders', authRequired, async (req, res) => {
    try {
        const discordId = req.user?.discordId;
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });

        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const orders = await Order.find({}).sort({ createdAt: -1 }).limit(100);
        return res.json(orders.map((order) => ({
            orderId: order.orderId,
            discordId: order.discordId,
            discordUsername: order.discordUsername,
            totalAmount: order.totalAmount,
            paymentMethod: order.paymentMethod || '-',
            status: order.status,
            isPaid: order.status === 'Completed',
            items: order.items,
            createdAt: order.createdAt
        })));
    } catch (err) {
        console.error('Orders error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
