const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const qs = require('qs');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Counter = require('../models/Counter');
const {
    createOrderTicket,
    createPayPalFFTicket,
    createLTCTicket,
    checkUserInGuild,
    checkUserHasOwnerRole,
    DiscordBotError
} = require('../bot');
const { createPayPalOrder, capturePayPalOrder } = require('../services/paymentService');
const { discordRequest } = require('../utils/discordApi');
const { authRequired, getBearerToken, verifyAnyJwtToken } = require('../middleware/authMiddleware');
const { checkoutLimiter, discordAuthLimiter } = require('../middleware/rateLimit');
const { getDiscordGatewayStatus } = require('../config/discordGateway');
const { encryptSecret } = require('../utils/tokenCrypto');
const {
    normalizeCouponCode,
    isSupportedCouponCode,
    getCouponDiscountPercent
} = require('../utils/couponCodes');

const router = express.Router();
const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const MAX_QUANTITY_PER_PRODUCT = 100000;
const AUTH_CODE_CACHE_TTL_MS = 2 * 60 * 1000;
const AUTH_RATE_LIMIT_DEFAULT_RETRY_SECONDS = 15;
const DISCORD_TOKEN_MIN_GAP_MS = (() => {
    const n = Number(process.env.DISCORD_TOKEN_MIN_GAP_MS);
    if (!Number.isFinite(n) || n < 500) return 1500;
    return Math.floor(n);
})();
const BRIDGE_REQUEST_MAX_AGE_MS = 5 * 60 * 1000;
const DISCORD_GUILD_CHECK_TIMEOUT_MS = 5000;
const PAYMENT_PROVIDER_TIMEOUT_MS = 15000;
const TICKET_LOCK_WINDOW_MS = 30 * 1000;
const PAYPAL_TICKET_LOCK_WINDOW_MS = 30 * 1000;
const LTC_TICKET_LOCK_WINDOW_MS = 30 * 1000;
const DEFAULT_LTC_PAY_ADDRESS = 'ltc1ququ7e6ryccpnu7jgy0l4vukgc3mventxyulyge';
const DEFAULT_LTC_QR_IMAGE_URL = '/pictures/payments/ltc.png';
const discordAuthSuccessCache = new Map();
const discordAuthInFlight = new Map();
let discordTokenExchangeChain = Promise.resolve();
let lastDiscordTokenExchangeAtMs = 0;

const getAuthCodeCacheKey = (code) => crypto.createHash('sha256').update(String(code || '')).digest('hex');
const cleanupAuthSuccessCache = () => {
    const now = Date.now();
    for (const [key, entry] of discordAuthSuccessCache.entries()) {
        if (!entry || entry.expiresAt <= now) {
            discordAuthSuccessCache.delete(key);
        }
    }
};
const buildDiscordRateLimitPayload = (retryAfterSeconds, step = 'unknown', providerStatus = null) => ({
    error: 'Discord temporarily limiting requests. Please try again in a few minutes.',
    code: 'DISCORD_RATE_LIMIT',
    retryAfterSeconds,
    step,
    providerStatus
});
const withDiscordStep = async (step, runner) => {
    try {
        return await runner();
    } catch (error) {
        if (error && !error.discordStep) error.discordStep = step;
        throw error;
    }
};
const runDiscordTokenExchangeQueued = async (runner) => {
    const run = async () => {
        const elapsed = Date.now() - lastDiscordTokenExchangeAtMs;
        const waitMs = Math.max(0, DISCORD_TOKEN_MIN_GAP_MS - elapsed);
        if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        try {
            return await runner();
        } finally {
            lastDiscordTokenExchangeAtMs = Date.now();
        }
    };
    const queued = discordTokenExchangeChain.then(run, run);
    discordTokenExchangeChain = queued.catch(() => {});
    return queued;
};

const withTimeout = (promise, timeoutMs, fallbackValue = null) => Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs))
]);

const normalizeEnvValue = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith("'") && text.endsWith("'"))
    ) {
        return text.slice(1, -1).trim();
    }
    return text;
};

const getBackendBaseUrl = () => normalizeEnvValue(process.env.WEBHOOK_BASE_URL || process.env.BACKEND_URL).replace(/\/+$/, '');
const getClientBaseUrl = () => normalizeEnvValue((process.env.CLIENT_URL || '').split(',')[0] || '').replace(/\/+$/, '');
const getOriginBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
const getLtcPayAddress = () => normalizeEnvValue(process.env.LTC_PAY_ADDRESS) || DEFAULT_LTC_PAY_ADDRESS;
const getLtcQrImageUrl = () => normalizeEnvValue(process.env.LTC_QR_IMAGE_URL) || DEFAULT_LTC_QR_IMAGE_URL;
const getDiscordOauthClientId = () => normalizeEnvValue(process.env.DISCORD_CLIENT_ID);
const getDiscordOauthClientSecret = () => normalizeEnvValue(process.env.DISCORD_CLIENT_SECRET);
const getConfiguredDiscordRedirectUri = () => normalizeEnvValue(process.env.DISCORD_REDIRECT_URI);
const getDiscordOauthConfigError = () => {
    if (!getDiscordOauthClientId()) return 'DISCORD_CLIENT_ID is missing';
    if (!getDiscordOauthClientSecret()) return 'DISCORD_CLIENT_SECRET is missing';
    return '';
};
const resolveDiscordAuthRedirectUri = (frontendRedirectUri) => {
    const configured = getConfiguredDiscordRedirectUri();
    if (configured) return configured;
    return String(frontendRedirectUri || '').trim();
};
const getDiscordTicketConfigError = () => {
    if (!normalizeEnvValue(process.env.DISCORD_BOT_TOKEN)) return 'DISCORD_BOT_TOKEN is missing';
    if (!normalizeEnvValue(process.env.DISCORD_GUILD_ID)) return 'DISCORD_GUILD_ID is missing';
    return '';
};
const getTicketMode = () => String(process.env.DISCORD_TICKET_MODE || 'bot').trim().toLowerCase();
const getTicketPanelUrl = () => String(process.env.DISCORD_TICKET_PANEL_URL || '').trim();
const isPanelTicketMode = () => getTicketMode() === 'panel' && /^https?:\/\//i.test(getTicketPanelUrl());
const buildTicketErrorResponse = (error) => {
    if (error instanceof DiscordBotError) {
        const status = Number(error.status);
        const safeStatus = Number.isFinite(status) && status >= 400 && status <= 599
            ? status
            : (error.code === 'DISCORD_RATE_LIMITED' ? 429 : 503);
        const retryAfterSeconds = Number(error.retryAfterSeconds) || 0;
        return {
            status: safeStatus,
            payload: {
                error: error.message || 'Ticket bot is temporarily unavailable. Please try again in a moment.',
                code: error.code || 'DISCORD_TICKET_ERROR',
                ...(retryAfterSeconds > 0
                    ? {
                        retryAfterSeconds,
                        retryAfterMs: retryAfterSeconds * 1000
                    }
                    : {})
            }
        };
    }

    const fallbackStatus = Number(error?.status);
    if (Number.isFinite(fallbackStatus) && fallbackStatus >= 400 && fallbackStatus <= 599) {
        return {
            status: fallbackStatus,
            payload: {
                error: String(error?.message || 'Ticket bot is temporarily unavailable. Please try again in a moment.'),
                code: String(error?.code || 'DISCORD_TICKET_ERROR')
            }
        };
    }

    return {
        status: 503,
        payload: {
            error: 'Ticket bot is temporarily unavailable. Please try again in a moment.',
            code: 'DISCORD_TICKET_UNAVAILABLE'
        }
    };
};
const normalizeTicketStatus = (value) => {
    const status = String(value || '').trim().toLowerCase();
    if (status === 'ready') return 'created';
    if (status === 'creating') return 'creating';
    if (status === 'created') return 'created';
    if (status === 'failed') return 'failed';
    if (status === 'panel') return 'panel';
    return 'pending';
};
const normalizePayPalTicketStatus = (value) => {
    const status = String(value || '').trim().toLowerCase();
    if (status === 'creating') return 'creating';
    if (status === 'created') return 'created';
    if (status === 'failed') return 'failed';
    return 'pending';
};
const normalizeLtcTicketStatus = (value) => {
    const status = String(value || '').trim().toLowerCase();
    if (status === 'creating') return 'creating';
    if (status === 'created') return 'created';
    if (status === 'failed') return 'failed';
    return 'pending';
};
const getLockRetryAfterMs = (lockUntil) => {
    if (!lockUntil) return 0;
    const lockMs = new Date(lockUntil).getTime();
    if (!Number.isFinite(lockMs)) return 0;
    return Math.max(0, lockMs - Date.now());
};
const buildInProgressPayload = (lockUntil, message, code) => {
    const retryAfterMs = getLockRetryAfterMs(lockUntil);
    const retryAfterSeconds = retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : 0;
    return {
        error: message,
        code,
        ...(retryAfterMs > 0 ? { retryAfterMs, retryAfterSeconds } : {})
    };
};
const buildClientPayUrl = (orderId, extraQuery = '') => {
    const encodedOrderId = encodeURIComponent(orderId || '');
    const query = extraQuery ? `&${extraQuery}` : '';
    const base = getClientBaseUrl();
    if (base) return `${base}/pay?orderId=${encodedOrderId}${query}`;
    return `/pay?orderId=${encodedOrderId}${query}`;
};

const isDiscordCloudflareBlock = (status, data) => {
    if (status !== 403) return false;
    const text = typeof data === 'string' ? data.toLowerCase() : JSON.stringify(data || {}).toLowerCase();
    return text.includes('cloudflare') || text.includes('1015') || text.includes('temporarily blocked');
};
const isDiscordTemporaryBlock = (status, data) => {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return isDiscordCloudflareBlock(status, data);
};
const shouldApplyDiscordAuthCooldown = (status, data) => status === 429 || isDiscordCloudflareBlock(status, data);
const buildDiscordAuthUnavailablePayload = (step = 'unknown', providerStatus = null) => ({
    error: 'Discord authentication is temporarily unavailable. Please retry shortly.',
    code: 'DISCORD_AUTH_UNAVAILABLE',
    step,
    providerStatus
});

const getDiscordErrorMessage = (data) => {
    if (!data) return '';
    if (typeof data === 'string') return data.slice(0, 200);
    return data.error_description || data.message || data.error || '';
};

const normalizeRetryAfterToSeconds = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n > 1000) return Math.ceil(n / 1000);
    return Math.ceil(n);
};

const getDiscordRetryAfterSeconds = (error) => {
    const headerSeconds = normalizeRetryAfterToSeconds(error?.response?.headers?.['retry-after']);
    const bodySeconds = normalizeRetryAfterToSeconds(
        error?.response?.data?.retry_after ?? error?.response?.data?.retryAfterSeconds
    );
    return Math.max(headerSeconds, bodySeconds, 0);
};
const getDiscordAuthCooldownFromError = (error) => {
    const baseRetry = Math.max(getDiscordRetryAfterSeconds(error), AUTH_RATE_LIMIT_DEFAULT_RETRY_SECONDS);
    const step = error?.discordStep || 'unknown';
    // Token endpoint rate limit is usually stricter; cool down longer to avoid hammering.
    if (step === 'oauth_token') {
        return Math.max(baseRetry, 30);
    }
    return baseRetry;
};

const timingSafeEqualHex = (left, right) => {
    if (!left || !right) return false;
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

const parseBridgeTimestampMs = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n < 1e12) return Math.round(n * 1000);
    return Math.round(n);
};

const getBridgeVerificationResult = (req) => {
    const secret = String(process.env.DISCORD_AUTH_BRIDGE_SECRET || '').trim();
    if (!secret) {
        return { ok: false, status: 500, error: 'DISCORD_AUTH_BRIDGE_SECRET is not configured' };
    }

    const timestampHeader = String(req.headers['x-bridge-timestamp'] || '').trim();
    const signatureHeader = String(req.headers['x-bridge-signature'] || '').trim().toLowerCase();
    if (!timestampHeader || !signatureHeader) {
        return { ok: false, status: 401, error: 'Missing bridge signature headers' };
    }

    const timestampMs = parseBridgeTimestampMs(timestampHeader);
    if (!timestampMs || Math.abs(Date.now() - timestampMs) > BRIDGE_REQUEST_MAX_AGE_MS) {
        return { ok: false, status: 401, error: 'Bridge request timestamp is invalid or expired' };
    }

    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body || {});
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${timestampMs}.${rawBody}`)
        .digest('hex')
        .toLowerCase();

    if (!timingSafeEqualHex(signatureHeader, expectedSignature)) {
        return { ok: false, status: 401, error: 'Bridge signature verification failed' };
    }

    return { ok: true };
};

const issueDiscordUserJwt = (discordId) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }

    return jwt.sign(
        { discordId, type: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

const normalizeDiscordScopes = (scope) => {
    if (typeof scope !== 'string') return [];
    return scope
        .split(' ')
        .map((s) => s.trim())
        .filter(Boolean);
};

const upsertDiscordUserAndBuildAuthPayload = async ({
    discordUser,
    accessToken = '',
    refreshToken = '',
    expiresIn = 0,
    scope = ''
}) => {
    const discordId = String(discordUser?.id || '').trim();
    const discordUsername = String(discordUser?.username || discordUser?.global_name || '').trim();
    if (!discordId || !discordUsername) {
        throw new Error('Discord user payload is invalid');
    }

    let dbUser = await User.findOne({ discordId });
    const isNewUser = !dbUser;
    if (!dbUser) {
        dbUser = new User({ discordId, discordUsername });
    } else {
        dbUser.discordUsername = discordUsername;
    }

    const safeAccessToken = typeof accessToken === 'string' ? accessToken.trim() : '';
    const safeRefreshToken = typeof refreshToken === 'string' ? refreshToken.trim() : '';
    const scopes = normalizeDiscordScopes(scope);
    const expiresInSeconds = Number(expiresIn);

    if (safeAccessToken) dbUser.accessToken = encryptSecret(safeAccessToken);
    if (safeRefreshToken) dbUser.refreshToken = encryptSecret(safeRefreshToken);
    if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
        dbUser.tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    }
    if (scopes.length > 0) {
        dbUser.scopes = scopes;
    }

    await dbUser.save();

    // Keep Discord API load low by default; only auto-join when explicitly enabled.
    if (isNewUser && scopes.includes('guilds.join') && process.env.DISCORD_AUTO_JOIN_ON_LOGIN === 'true' && safeAccessToken) {
        void joinGuildWithAccessToken(process.env.DISCORD_GUILD_ID, discordId, safeAccessToken);
    }

    const token = issueDiscordUserJwt(dbUser.discordId);
    return {
        user: {
            discordId: dbUser.discordId,
            discordUsername: dbUser.discordUsername,
            avatar: discordUser?.avatar || null
        },
        token
    };
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
const BULK_DISCOUNT_THRESHOLD = 10;
const MIN_CHECKOUT_TOTAL = 1;
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const normalizeText = (value) => String(value || '').trim().toLowerCase();
const normalizeKeyText = (value) => normalizeText(value).replace(/\s+/g, '');
const getForcedCatalogPrice = (product) => {
    const category = normalizeText(product?.category);
    const name = normalizeText(product?.name);
    const keyName = normalizeKeyText(product?.name);

    if (category === 'sets') {
        return name === 'madoka' ? 8 : 2;
    }
    if (category === 'combo' && (keyName === 'combox2luck+drop' || keyName === 'combox2luckdrop')) {
        return 6;
    }
    return null;
};
const normalizeBasePrice = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n;
};
const getEffectiveProductPrice = (product) => {
    const forced = getForcedCatalogPrice(product);
    if (Number.isFinite(forced) && forced > 0) return forced;
    const base = normalizeBasePrice(product?.price);
    if (base > 0 && base < 1) return 1;
    return base;
};
const applyPriceOverridesForClient = (product) => {
    const forced = getForcedCatalogPrice(product);
    const base = normalizeBasePrice(product?.price);
    const shouldForceOneDollar = !Number.isFinite(forced) && base > 0 && base < 1;
    const finalPrice = Number.isFinite(forced) && forced > 0
        ? forced
        : (shouldForceOneDollar ? 1 : null);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) return product;

    const nextOriginalPriceString = Number.isFinite(forced) && forced > 0
        ? `$${finalPrice}/1`
        : product?.originalPriceString;

    return {
        ...product,
        price: finalPrice,
        originalPriceString: nextOriginalPriceString,
        bulkPrice: null,
        bulkPriceString: ''
    };
};

const validateCouponCode = async (couponCodeRaw) => {
    const couponCode = normalizeCouponCode(couponCodeRaw);
    if (!couponCode) {
        return {
            couponCode: '',
            discountPercent: 0,
            discountAmount: 0
        };
    }

    if (!isSupportedCouponCode(couponCode)) {
        return {
            couponCode: '',
            discountPercent: 0,
            discountAmount: 0,
            error: 'Coupon code is invalid.'
        };
    }

    const existingOrder = await Order.findOne({
        couponCode,
        status: { $ne: 'Cancelled' }
    }).select('_id').lean();

    if (existingOrder) {
        return {
            couponCode: '',
            discountPercent: 0,
            discountAmount: 0,
            error: 'Coupon code has already been used.'
        };
    }

    return {
        couponCode,
        discountPercent: getCouponDiscountPercent(couponCode),
        discountAmount: 0
    };
};

const getLinePricing = (product, quantity) => {
    const qty = Number(quantity) || 0;
    const rawRegularUnitPrice = normalizeBasePrice(product?.price);
    const regularUnitPrice = getEffectiveProductPrice(product);
    const forcedToOneDollar = rawRegularUnitPrice > 0 && rawRegularUnitPrice < 1;
    if (!Number.isFinite(regularUnitPrice) || regularUnitPrice <= 0 || qty <= 0) {
        return { lineTotal: 0, effectiveUnitPrice: 0, bulkUnits: 0 };
    }

    const bulkUnitPrice = forcedToOneDollar ? null : Number(product.bulkPrice);
    const hasBulkPrice = Number.isFinite(bulkUnitPrice) && bulkUnitPrice > 0;
    if (!hasBulkPrice) {
        const lineTotal = roundMoney(regularUnitPrice * qty);
        return { lineTotal, effectiveUnitPrice: regularUnitPrice, bulkUnits: 0 };
    }

    const regularUnitsLimit = Math.max(1, Math.floor(BULK_DISCOUNT_THRESHOLD / regularUnitPrice));
    if (qty <= regularUnitsLimit) {
        const lineTotal = roundMoney(regularUnitPrice * qty);
        return { lineTotal, effectiveUnitPrice: regularUnitPrice, bulkUnits: 0 };
    }

    const bulkUnits = qty - regularUnitsLimit;
    const regularPart = regularUnitsLimit * regularUnitPrice;
    const bulkPart = bulkUnits * bulkUnitPrice;
    const lineTotal = roundMoney(regularPart + bulkPart);
    const effectiveUnitPrice = roundMoney(lineTotal / qty, 6);
    return { lineTotal, effectiveUnitPrice, bulkUnits };
};

const buildQuantityMapFromCartItems = (cartItems) => {
    const quantityByProductId = new Map();
    for (const item of cartItems) {
        const productId = typeof item?._id === 'string' ? item._id.trim() : '';
        const quantity = Number(item?.quantity);
        if (!OBJECT_ID_PATTERN.test(productId)) continue;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_PRODUCT) continue;
        quantityByProductId.set(productId, (quantityByProductId.get(productId) || 0) + quantity);
    }
    return quantityByProductId;
};

const calculateCartSummary = async ({ cartItems, couponCodeRaw = '' }) => {
    const quantityByProductId = buildQuantityMapFromCartItems(cartItems);
    if (quantityByProductId.size === 0) {
        return { error: 'Cart contains invalid products', status: 400 };
    }

    const productIds = Array.from(quantityByProductId.keys());
    const products = await Product.find({ _id: { $in: productIds } });
    if (products.length !== productIds.length) {
        return { error: 'Some products are invalid or no longer available', status: 400 };
    }

    const pricedItems = products.map((product) => {
        const quantity = quantityByProductId.get(String(product._id));
        const pricing = getLinePricing(product, quantity);
        return {
            product: product._id,
            name: product.name,
            quantity,
            price: pricing.effectiveUnitPrice,
            lineTotal: pricing.lineTotal
        };
    });

    const items = pricedItems.map(({ lineTotal, ...rest }) => rest);
    const subtotalAmount = roundMoney(pricedItems.reduce((sum, item) => sum + item.lineTotal, 0));
    if (subtotalAmount <= 0) {
        return { error: 'Invalid cart total', status: 400 };
    }

    const couponValidation = await validateCouponCode(couponCodeRaw);
    if (couponValidation.error) {
        return { error: couponValidation.error, status: 400 };
    }

    const discountPercent = Number(couponValidation.discountPercent) || 0;
    const discountAmount = discountPercent > 0
        ? roundMoney(subtotalAmount * discountPercent / 100)
        : 0;
    const totalAmount = roundMoney(Math.max(0, subtotalAmount - discountAmount));

    return {
        items,
        subtotalAmount,
        discountAmount,
        discountPercent,
        totalAmount,
        couponCode: couponValidation.couponCode || ''
    };
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
        }, 0, { noRetry: true });
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
const acquireOrderTicketLock = async ({ orderId, discordId }) => {
    const now = new Date();
    const lockUntil = new Date(Date.now() + TICKET_LOCK_WINDOW_MS);

    const lockedOrder = await Order.findOneAndUpdate(
        {
            orderId,
            discordId,
            status: { $ne: 'Cancelled' },
            $and: [
                {
                    $or: [
                        { channelId: null },
                        { channelId: '' },
                        { channelId: { $exists: false } }
                    ]
                },
                {
                    $or: [
                        { ticketLockUntil: null },
                        { ticketLockUntil: { $exists: false } },
                        { ticketLockUntil: { $lt: now } }
                    ]
                }
            ],
            $or: [
                { ticketStatus: { $in: ['pending', 'failed', 'creating', 'ready', 'created'] } },
                { ticketStatus: null },
                { ticketStatus: { $exists: false } }
            ]
        },
        {
            $set: {
                ticketStatus: 'creating',
                ticketError: '',
                ticketLockUntil: lockUntil
            }
        },
        { new: true }
    );

    return { lockedOrder, lockUntil };
};
const releaseOrderTicketLockAsFailed = async (orderId, discordId, lockUntil, message) => {
    const lockFilter = lockUntil ? { ticketLockUntil: lockUntil } : {};
    await Order.updateOne(
        { orderId, discordId, ...lockFilter },
        {
            $set: {
                ticketStatus: 'failed',
                ticketError: String(message || 'Ticket creation failed.')
            },
            $unset: { ticketLockUntil: 1 }
        }
    );
};
const acquirePayPalTicketLock = async ({ orderId, discordId }) => {
    const now = new Date();
    const lockUntil = new Date(Date.now() + PAYPAL_TICKET_LOCK_WINDOW_MS);

    const lockedOrder = await Order.findOneAndUpdate(
        {
            orderId,
            discordId,
            status: { $ne: 'Cancelled' },
            $and: [
                {
                    $or: [
                        { paypalTicketChannelId: null },
                        { paypalTicketChannelId: '' },
                        { paypalTicketChannelId: { $exists: false } }
                    ]
                },
                {
                    $or: [
                        { paypalTicketLockUntil: null },
                        { paypalTicketLockUntil: { $exists: false } },
                        { paypalTicketLockUntil: { $lt: now } }
                    ]
                }
            ],
            $or: [
                { paypalTicketStatus: { $in: ['pending', 'failed', 'creating'] } },
                { paypalTicketStatus: null },
                { paypalTicketStatus: { $exists: false } }
            ]
        },
        {
            $set: {
                paypalTicketStatus: 'creating',
                paypalTicketError: '',
                paypalTicketLockUntil: lockUntil
            }
        },
        { new: true }
    );

    return { lockedOrder, lockUntil };
};
const releasePayPalTicketLockAsFailed = async (orderId, discordId, lockUntil, message) => {
    const lockFilter = lockUntil ? { paypalTicketLockUntil: lockUntil } : {};
    await Order.updateOne(
        { orderId, discordId, ...lockFilter },
        {
            $set: {
                paypalTicketStatus: 'failed',
                paypalTicketError: String(message || 'PayPal ticket creation failed.')
            },
            $unset: { paypalTicketLockUntil: 1 }
        }
    );
};
const acquireLtcTicketLock = async ({ orderId, discordId }) => {
    const now = new Date();
    const lockUntil = new Date(Date.now() + LTC_TICKET_LOCK_WINDOW_MS);

    const lockedOrder = await Order.findOneAndUpdate(
        {
            orderId,
            discordId,
            status: { $ne: 'Cancelled' },
            $and: [
                {
                    $or: [
                        { ltcTicketChannelId: null },
                        { ltcTicketChannelId: '' },
                        { ltcTicketChannelId: { $exists: false } }
                    ]
                },
                {
                    $or: [
                        { ltcTicketLockUntil: null },
                        { ltcTicketLockUntil: { $exists: false } },
                        { ltcTicketLockUntil: { $lt: now } }
                    ]
                }
            ],
            $or: [
                { ltcTicketStatus: { $in: ['pending', 'failed', 'creating'] } },
                { ltcTicketStatus: null },
                { ltcTicketStatus: { $exists: false } }
            ]
        },
        {
            $set: {
                ltcTicketStatus: 'creating',
                ltcTicketError: '',
                ltcTicketLockUntil: lockUntil
            }
        },
        { new: true }
    );

    return { lockedOrder, lockUntil };
};
const releaseLtcTicketLockAsFailed = async (orderId, discordId, lockUntil, message) => {
    const lockFilter = lockUntil ? { ltcTicketLockUntil: lockUntil } : {};
    await Order.updateOne(
        { orderId, discordId, ...lockFilter },
        {
            $set: {
                ltcTicketStatus: 'failed',
                ltcTicketError: String(message || 'LTC ticket creation failed.')
            },
            $unset: { ltcTicketLockUntil: 1 }
        }
    );
};

const canAccessOwnerEndpoints = async (discordId) => {
    if (!discordId) return false;
    const ownerId = process.env.DISCORD_OWNER_ID || '';
    if (ownerId && discordId === ownerId) return true;
    return checkUserHasOwnerRole(discordId);
};

const getOptionalRequestUser = (req) => {
    const token = getBearerToken(req);
    if (!token) return null;
    return verifyAnyJwtToken(token);
};

const exchangeDiscordAuthCode = async (code, redirectUri) => {
    const oauthClientId = getDiscordOauthClientId();
    const oauthClientSecret = getDiscordOauthClientSecret();
    if (!oauthClientId || !oauthClientSecret) {
        const configError = new Error(getDiscordOauthConfigError() || 'Discord OAuth credentials are not configured');
        configError.code = 'DISCORD_OAUTH_CONFIG_ERROR';
        throw configError;
    }

    const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let tokenResponse = null;
    const maxTokenRetries = 1;
    for (let attempt = 0; attempt <= maxTokenRetries; attempt += 1) {
        try {
            tokenResponse = await withDiscordStep('oauth_token', () => runDiscordTokenExchangeQueued(() => discordRequest({
                method: 'post',
                url: 'https://discord.com/api/oauth2/token',
                timeout: 12000,
                data: qs.stringify({
                    client_id: oauthClientId,
                    client_secret: oauthClientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri
                }),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }, 0, { noRetry: true })));
            break;
        } catch (error) {
            const status = Number(error?.response?.status) || 0;
            const retryAfterSeconds = getDiscordRetryAfterSeconds(error);
            const shouldRetry = attempt < maxTokenRetries && status === 429 && retryAfterSeconds > 0;
            if (!shouldRetry) {
                throw error;
            }
            await waitFor(Math.min(15000, retryAfterSeconds * 1000));
        }
    }

    const { access_token, refresh_token, expires_in, scope } = tokenResponse.data || {};

    const userResponse = await withDiscordStep('oauth_user', () => discordRequest({
        method: 'get',
        url: 'https://discord.com/api/users/@me',
        timeout: 12000,
        headers: { Authorization: `Bearer ${access_token}` }
    }, 0, { noRetry: true }));

    return upsertDiscordUserAndBuildAuthPayload({
        discordUser: userResponse.data || {},
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        scope
    });
};

router.post('/auth/discord', discordAuthLimiter, async (req, res) => {
    const { code: rawCode, redirect_uri: frontendRedirectUri } = req.body || {};
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    const redirectUri = resolveDiscordAuthRedirectUri(frontendRedirectUri);
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });
    if (!redirectUri) return res.status(400).json({ error: 'redirect_uri required' });
    const oauthConfigError = getDiscordOauthConfigError();
    if (oauthConfigError) return res.status(500).json({ error: oauthConfigError });

    cleanupAuthSuccessCache();
    const cacheKey = getAuthCodeCacheKey(code);
    const cached = discordAuthSuccessCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.payload);
    }

    const inFlightPromise = discordAuthInFlight.get(cacheKey);
    if (inFlightPromise) {
        try {
            const payload = await inFlightPromise;
            return res.json(payload);
        } catch (error) {
            if (error?.code === 'DISCORD_OAUTH_CONFIG_ERROR') {
                return res.status(500).json({ error: error.message });
            }
            const status = error.response?.status;
            const data = error.response?.data;
            const message = getDiscordErrorMessage(data);
            const step = error.discordStep || 'unknown';
            if (isDiscordTemporaryBlock(status, data)) {
                if (shouldApplyDiscordAuthCooldown(status, data)) {
                    const retryAfter = getDiscordAuthCooldownFromError(error);
                    return res.status(503).json(buildDiscordRateLimitPayload(retryAfter, step, status || 503));
                }
                return res.status(503).json(buildDiscordAuthUnavailablePayload(step, status || 503));
            }
            if (status >= 400 && status < 500) {
                return res.status(400).json({
                    error: message || 'Discord authentication failed. Check app credentials and redirect URI.'
                });
            }
            if (!status) {
                return res.status(503).json(buildDiscordAuthUnavailablePayload(step));
            }
            return res.status(500).json({ error: 'Authentication failed' });
        }
    }

    const task = exchangeDiscordAuthCode(code, redirectUri);
    discordAuthInFlight.set(cacheKey, task);

    try {
        const payload = await task;
        discordAuthSuccessCache.set(cacheKey, {
            payload,
            expiresAt: Date.now() + AUTH_CODE_CACHE_TTL_MS
        });
        return res.json(payload);
    } catch (error) {
        if (error?.code === 'DISCORD_OAUTH_CONFIG_ERROR') {
            return res.status(500).json({ error: error.message });
        }
        const status = error.response?.status;
        const data = error.response?.data;
        const message = getDiscordErrorMessage(data);
        const step = error.discordStep || 'unknown';
        console.error('Discord auth error:', {
            step,
            status,
            retryAfterHeader: error.response?.headers?.['retry-after'],
            data: data || error.message
        });

        if (isDiscordTemporaryBlock(status, data)) {
            if (shouldApplyDiscordAuthCooldown(status, data)) {
                const retryAfter = getDiscordAuthCooldownFromError(error);
                return res.status(503).json(buildDiscordRateLimitPayload(retryAfter, step, status || 503));
            }
            return res.status(503).json(buildDiscordAuthUnavailablePayload(step, status || 503));
        }

        if (status >= 400 && status < 500) {
            return res.status(400).json({
                error: message || 'Discord authentication failed. Check app credentials and redirect URI.'
            });
        }
        if (!status) {
            return res.status(503).json(buildDiscordAuthUnavailablePayload(step));
        }

        if (error.message === 'Discord user payload is invalid' || error.message === 'JWT_SECRET is not configured') {
            return res.status(500).json({ error: error.message });
        }

        return res.status(500).json({ error: 'Authentication failed' });
    } finally {
        discordAuthInFlight.delete(cacheKey);
    }
});

router.post('/auth/discord-bridge', async (req, res) => {
    const verification = getBridgeVerificationResult(req);
    if (!verification.ok) {
        return res.status(verification.status).json({ error: verification.error });
    }

    try {
        const payload = await upsertDiscordUserAndBuildAuthPayload({
            discordUser: req.body?.user || {},
            accessToken: req.body?.access_token,
            refreshToken: req.body?.refresh_token,
            expiresIn: req.body?.expires_in,
            scope: req.body?.scope
        });
        return res.json(payload);
    } catch (error) {
        if (error.message === 'Discord user payload is invalid') {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'JWT_SECRET is not configured') {
            return res.status(500).json({ error: error.message });
        }
        console.error('Discord bridge auth error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
});

router.get('/products', async (req, res) => {
    try {
        const products = await Product.find().lean();
        const normalizedProducts = products.map((product) => applyPriceOverridesForClient(product));
        res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
        return res.json(normalizedProducts);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/coupon/preview', async (req, res) => {
    try {
        const cartItems = Array.isArray(req.body?.cartItems) ? req.body.cartItems : [];
        const couponCodeRaw = req.body?.couponCode;
        if (cartItems.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        const summary = await calculateCartSummary({ cartItems, couponCodeRaw });
        if (summary.error) {
            return res.status(summary.status || 400).json({ error: summary.error });
        }

        return res.json({
            success: true,
            couponCode: summary.couponCode || '',
            discountPercent: summary.discountPercent || 0,
            discountAmount: summary.discountAmount || 0,
            subtotalAmount: summary.subtotalAmount || 0,
            totalAmount: summary.totalAmount || 0
        });
    } catch (error) {
        console.error('Coupon preview error:', error);
        return res.status(500).json({ error: 'Failed to preview coupon' });
    }
});

router.post('/checkout', authRequired, checkoutLimiter, async (req, res) => {
    try {
        const discordId = req.user?.discordId;
        const cartItems = Array.isArray(req.body?.cartItems) ? req.body.cartItems : [];
        const couponCodeRaw = req.body?.couponCode;
        if (!discordId || cartItems.length === 0) {
            return res.status(400).json({ error: 'Invalid request payload' });
        }

        const dbUser = await User.findOne({ discordId });
        if (!dbUser) {
            return res.status(401).json({ error: 'Discord account not linked' });
        }

        const inGuild = await withTimeout(
            Promise.resolve(checkUserInGuild(discordId)),
            DISCORD_GUILD_CHECK_TIMEOUT_MS,
            null
        );
        if (inGuild === false) {
            return res.status(403).json({
                error_code: 'USER_NOT_IN_GUILD',
                invite_link: process.env.DISCORD_SERVER_INVITE || ''
            });
        }
        if (inGuild === null) {
            console.warn(`Checkout guild check unavailable for ${discordId}; continuing checkout.`);
        }

        const cartSummary = await calculateCartSummary({ cartItems, couponCodeRaw });
        if (cartSummary.error) {
            return res.status(cartSummary.status || 400).json({ error: cartSummary.error });
        }

        const {
            items,
            subtotalAmount,
            discountAmount,
            discountPercent,
            totalAmount,
            couponCode
        } = cartSummary;

        if (subtotalAmount <= MIN_CHECKOUT_TOTAL) {
            return res.status(400).json({ error: 'Minimum checkout total must be greater than $1.00' });
        }

        const ticketMode = isPanelTicketMode() ? 'panel' : 'bot';
        let newOrder = null;
        let orderId = '';
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const counter = await Counter.findOneAndUpdate(
                { id: 'orderId' },
                { $inc: { seq: 1 } },
                { new: true, upsert: true }
            );
            orderId = `nm_${counter.seq}`;

            try {
                newOrder = new Order({
                    orderId,
                    discordId,
                    discordUsername: dbUser.discordUsername || '',
                    items,
                    subtotalAmount,
                    discountAmount,
                    discountPercent,
                    couponCode,
                    totalAmount,
                    status: ticketMode === 'panel' ? 'Waiting Payment' : 'Pending',
                    ticketStatus: ticketMode === 'panel' ? 'panel' : 'pending',
                    ticketError: ''
                });
                await newOrder.save();
                break;
            } catch (saveError) {
                const duplicateOrderId = Number(saveError?.code) === 11000 && saveError?.keyPattern?.orderId;
                if (!duplicateOrderId || attempt >= 2) {
                    throw saveError;
                }
            }
        }
        if (!newOrder) {
            return res.status(503).json({ error: 'Could not create order right now. Please retry.' });
        }

        const panelUrl = isPanelTicketMode() ? getTicketPanelUrl() : '';

        return res.json({
            success: true,
            orderId,
            subtotalAmount: newOrder.subtotalAmount,
            discountAmount: newOrder.discountAmount || 0,
            discountPercent: newOrder.discountPercent || 0,
            couponCode: newOrder.couponCode || '',
            totalAmount: newOrder.totalAmount,
            ticketMode,
            channelId: null,
            ticketStatus: newOrder.ticketStatus,
            ...(panelUrl ? { panelUrl } : {}),
            ticketError: ''
        });
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
        const normalizedTicketStatus = normalizeTicketStatus(order.ticketStatus);
        const normalizedPayPalTicketStatus = normalizePayPalTicketStatus(order.paypalTicketStatus);
        const normalizedLtcTicketStatus = normalizeLtcTicketStatus(order.ltcTicketStatus);
        const ticketRetryAfterMs = normalizedTicketStatus === 'creating' ? getLockRetryAfterMs(order.ticketLockUntil) : 0;
        const paypalTicketRetryAfterMs = normalizedPayPalTicketStatus === 'creating'
            ? getLockRetryAfterMs(order.paypalTicketLockUntil)
            : 0;
        const ltcTicketRetryAfterMs = normalizedLtcTicketStatus === 'creating'
            ? getLockRetryAfterMs(order.ltcTicketLockUntil)
            : 0;
        return res.json({
            orderId: order.orderId,
            subtotalAmount: Number(order.subtotalAmount || order.totalAmount || 0),
            discountAmount: Number(order.discountAmount || 0),
            discountPercent: Number(order.discountPercent || 0),
            couponCode: order.couponCode || '',
            totalAmount: order.totalAmount,
            status: order.status,
            isPaid: order.status === 'Completed',
            channelId: order.channelId || null,
            ticketStatus: normalizedTicketStatus,
            ticketError: order.ticketError || '',
            ticketRetryAfterMs,
            ticketRetryAfterSeconds: ticketRetryAfterMs > 0 ? Math.ceil(ticketRetryAfterMs / 1000) : 0,
            paypalTicketChannelId: order.paypalTicketChannelId || null,
            paypalTicketStatus: normalizedPayPalTicketStatus,
            paypalTicketError: order.paypalTicketError || '',
            paypalTicketRetryAfterMs,
            paypalTicketRetryAfterSeconds: paypalTicketRetryAfterMs > 0
                ? Math.ceil(paypalTicketRetryAfterMs / 1000)
                : 0,
            ltcTicketChannelId: order.ltcTicketChannelId || null,
            ltcTicketStatus: normalizedLtcTicketStatus,
            ltcTicketError: order.ltcTicketError || '',
            ltcTicketRetryAfterMs,
            ltcTicketRetryAfterSeconds: ltcTicketRetryAfterMs > 0
                ? Math.ceil(ltcTicketRetryAfterMs / 1000)
                : 0,
            ticketMode: isPanelTicketMode() ? 'panel' : 'bot',
            panelUrl: isPanelTicketMode() ? getTicketPanelUrl() : ''
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
            const backendBaseUrl = getBackendBaseUrl() || getOriginBaseUrl(`${req.protocol}://${req.get('host')}`);
            const clientBaseUrl = getClientBaseUrl() || getOriginBaseUrl(req.headers.origin);
            if (!backendBaseUrl || !clientBaseUrl) {
                return res.status(500).json({ error: 'Payment URLs are not configured' });
            }

            const returnUrl = `${backendBaseUrl}/api/shop/paypal/capture?orderId=${encodeURIComponent(orderId)}`;
            const cancelUrl = `${clientBaseUrl}/pay?orderId=${encodeURIComponent(orderId)}`;
            const paypal = await withTimeout(
                createPayPalOrder(orderId, order.totalAmount, returnUrl, cancelUrl),
                PAYMENT_PROVIDER_TIMEOUT_MS,
                null
            );
            if (!paypal?.approvalLink || !paypal?.orderId) {
                return res.status(503).json({ error: 'PayPal is temporarily unavailable. Please use another payment option.' });
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
            await Order.findByIdAndUpdate(order._id, { paymentMethod: 'ltc' });
            return res.json({
                type: 'ltc',
                payAddress: getLtcPayAddress(),
                payCurrency: 'ltc',
                qrImageUrl: getLtcQrImageUrl()
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
        const secret = normalizeEnvValue(process.env.NOWPAYMENTS_IPN_SECRET);
        if (!secret) {
            return res.status(503).json({ error: 'NOWPayments webhook is disabled (missing NOWPAYMENTS_IPN_SECRET)' });
        }
        if (!signature) {
            return res.status(401).json({ error: 'Missing webhook signature' });
        }

        const expected = crypto.createHmac('sha512', secret).update(req.rawBody || '').digest('hex');
        if (!timingSafeEqualHex(String(signature || ''), expected)) {
            return res.status(401).json({ error: 'Invalid webhook signature' });
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

router.get('/paypal-email', authRequired, (req, res) => {
    return res.json({ email: process.env.PAYPAL_EMAIL || '' });
});

router.get('/create-ticket', (req, res) => {
    return res.status(405).json({ error: 'Use POST /api/shop/create-ticket' });
});

router.get('/create-ticket-paypal-ff', (req, res) => {
    return res.status(405).json({ error: 'Use POST /api/shop/create-ticket-paypal-ff' });
});

router.get('/bot-status', async (req, res) => {
    const hasBotToken = Boolean(String(process.env.DISCORD_BOT_TOKEN || '').trim());
    const hasGuildId = Boolean(String(process.env.DISCORD_GUILD_ID || '').trim());
    const hasCategoryId = Boolean(String(process.env.DISCORD_TICKET_CATEGORY_ID || '').trim());
    const hasOwnerRoleId = Boolean(String(process.env.DISCORD_OWNER_ROLE_ID || '').trim());
    const hasVouchChannelId = Boolean(String(process.env.DISCORD_VOUCH_CHANNEL_ID || '').trim());
    const basePayload = { ok: hasBotToken && hasGuildId };

    try {
        const viewer = getOptionalRequestUser(req);
        let canViewDetails = false;
        if (viewer?.role === 'admin') {
            canViewDetails = true;
        } else if (viewer?.discordId) {
            canViewDetails = await canAccessOwnerEndpoints(viewer.discordId);
        }

        if (!canViewDetails) {
            return res.json(basePayload);
        }

        const { isVercelRuntime, gatewayFlag, gatewayEnabled } = getDiscordGatewayStatus();
        return res.json({
            ...basePayload,
            hasBotToken,
            hasGuildId,
            hasCategoryId,
            hasOwnerRoleId,
            hasVouchChannelId,
            runtime: isVercelRuntime ? 'vercel-serverless' : 'node-service',
            gatewayFlag: gatewayFlag || '(unset)',
            gatewayWillRun: gatewayEnabled
        });
    } catch (error) {
        console.error('bot-status error:', error?.message || error);
        return res.json(basePayload);
    }
});

router.post('/create-ticket-paypal-ff', authRequired, async (req, res) => {
    let lockAcquiredOrderId = '';
    let lockAcquiredDiscordId = '';
    let lockAcquiredUntil = null;
    try {
        const { orderId } = req.body || {};
        if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

        const { order, status, error } = await getOwnedOrder(orderId, req.user.discordId);
        if (!order) return res.status(status).json({ error });

        if (isPanelTicketMode()) {
            await Order.findByIdAndUpdate(order._id, { paymentMethod: 'paypal_ff' });
            return res.json({
                mode: 'panel',
                panelUrl: getTicketPanelUrl(),
                orderId: order.orderId,
                email: process.env.PAYPAL_EMAIL || ''
            });
        }

        const ticketConfigError = getDiscordTicketConfigError();
        if (ticketConfigError) {
            return res.status(500).json({ error: ticketConfigError });
        }

        if (order.paypalTicketChannelId) {
            return res.json({
                success: true,
                alreadyExists: true,
                channelId: order.paypalTicketChannelId,
                email: process.env.PAYPAL_EMAIL || ''
            });
        }

        const { lockedOrder, lockUntil } = await acquirePayPalTicketLock({
            orderId,
            discordId: req.user.discordId
        });
        if (!lockedOrder) {
            const fresh = await Order.findOne({ orderId, discordId: req.user.discordId }).lean();
            if (!fresh) {
                return res.status(404).json({ error: 'Order not found' });
            }
            if (fresh?.paypalTicketChannelId) {
                return res.json({
                    success: true,
                    alreadyExists: true,
                    channelId: fresh.paypalTicketChannelId,
                    email: process.env.PAYPAL_EMAIL || ''
                });
            }

            if (normalizePayPalTicketStatus(fresh?.paypalTicketStatus) === 'creating') {
                return res.status(409).json({
                    ...buildInProgressPayload(
                        fresh?.paypalTicketLockUntil,
                        'PayPal ticket is already being created. Please wait a moment.',
                        'PAYPAL_TICKET_CREATION_IN_PROGRESS'
                    ),
                    email: process.env.PAYPAL_EMAIL || ''
                });
            }

            return res.status(409).json({
                error: 'PayPal ticket cannot be created right now. Please retry shortly.',
                code: 'PAYPAL_TICKET_NOT_READY',
                email: process.env.PAYPAL_EMAIL || ''
            });
        }

        lockAcquiredOrderId = lockedOrder.orderId;
        lockAcquiredDiscordId = lockedOrder.discordId;
        lockAcquiredUntil = lockUntil;

        const counter = await Counter.findOneAndUpdate(
            { id: 'paypalTicket' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        const paypalSeq = counter.seq;
        const channelName = `paypal_${paypalSeq}`;
        const channelId = await Promise.resolve(createPayPalFFTicket(lockedOrder, paypalSeq));
        if (!channelId) {
            throw new DiscordBotError('Could not create PayPal ticket channel', {
                status: 503,
                code: 'DISCORD_TICKET_UNAVAILABLE'
            });
        }

        const persistResult = await Order.updateOne(
            { _id: lockedOrder._id, paypalTicketLockUntil: lockAcquiredUntil },
            {
                $set: {
                    paymentMethod: 'paypal_ff',
                    paypalTicketChannel: channelName,
                    paypalTicketChannelId: channelId,
                    paypalTicketStatus: 'created',
                    paypalTicketError: ''
                },
                $unset: { paypalTicketLockUntil: 1 }
            }
        );
        if (!persistResult?.matchedCount) {
            const fresh = await Order.findById(lockedOrder._id).lean();
            if (fresh?.paypalTicketChannelId) {
                return res.json({
                    success: true,
                    alreadyExists: true,
                    channelId: fresh.paypalTicketChannelId,
                    email: process.env.PAYPAL_EMAIL || ''
                });
            }
            await Order.updateOne(
                {
                    _id: lockedOrder._id,
                    $or: [
                        { paypalTicketChannelId: null },
                        { paypalTicketChannelId: '' },
                        { paypalTicketChannelId: { $exists: false } }
                    ]
                },
                {
                    $set: {
                        paymentMethod: 'paypal_ff',
                        paypalTicketChannel: channelName,
                        paypalTicketChannelId: channelId,
                        paypalTicketStatus: 'created',
                        paypalTicketError: ''
                    },
                    $unset: { paypalTicketLockUntil: 1 }
                }
            );
        }

        return res.json({
            success: true,
            channelId: channelId || null,
            email: process.env.PAYPAL_EMAIL || ''
        });
    } catch (err) {
        console.error('Create PayPal F&F ticket error:', err);
        const { status, payload } = buildTicketErrorResponse(err);
        if (lockAcquiredOrderId && lockAcquiredDiscordId) {
            await releasePayPalTicketLockAsFailed(
                lockAcquiredOrderId,
                lockAcquiredDiscordId,
                lockAcquiredUntil,
                payload.error || 'PayPal ticket creation failed.'
            ).catch(() => {});
        }
        if (payload.code === 'USER_NOT_IN_GUILD') {
            return res.status(status).json({
                ...payload,
                invite_link: process.env.DISCORD_SERVER_INVITE || '',
                email: process.env.PAYPAL_EMAIL || ''
            });
        }
        return res.status(status).json({
            ...payload,
            email: process.env.PAYPAL_EMAIL || ''
        });
    }
});

router.post('/create-ticket-ltc', authRequired, async (req, res) => {
    let lockAcquiredOrderId = '';
    let lockAcquiredDiscordId = '';
    let lockAcquiredUntil = null;
    try {
        const { orderId } = req.body || {};
        if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

        const { order, status, error } = await getOwnedOrder(orderId, req.user.discordId);
        if (!order) return res.status(status).json({ error });

        if (isPanelTicketMode()) {
            await Order.findByIdAndUpdate(order._id, { paymentMethod: 'ltc' });
            return res.json({
                mode: 'panel',
                panelUrl: getTicketPanelUrl(),
                orderId: order.orderId
            });
        }

        const ticketConfigError = getDiscordTicketConfigError();
        if (ticketConfigError) {
            return res.status(500).json({ error: ticketConfigError });
        }

        if (order.ltcTicketChannelId) {
            return res.json({
                success: true,
                alreadyExists: true,
                channelId: order.ltcTicketChannelId
            });
        }

        const { lockedOrder, lockUntil } = await acquireLtcTicketLock({
            orderId,
            discordId: req.user.discordId
        });
        if (!lockedOrder) {
            const fresh = await Order.findOne({ orderId, discordId: req.user.discordId }).lean();
            if (!fresh) {
                return res.status(404).json({ error: 'Order not found' });
            }
            if (fresh?.ltcTicketChannelId) {
                return res.json({
                    success: true,
                    alreadyExists: true,
                    channelId: fresh.ltcTicketChannelId
                });
            }

            if (normalizeLtcTicketStatus(fresh?.ltcTicketStatus) === 'creating') {
                return res.status(409).json(
                    buildInProgressPayload(
                        fresh?.ltcTicketLockUntil,
                        'LTC ticket is already being created. Please wait a moment.',
                        'LTC_TICKET_CREATION_IN_PROGRESS'
                    )
                );
            }

            return res.status(409).json({
                error: 'LTC ticket cannot be created right now. Please retry shortly.',
                code: 'LTC_TICKET_NOT_READY'
            });
        }

        lockAcquiredOrderId = lockedOrder.orderId;
        lockAcquiredDiscordId = lockedOrder.discordId;
        lockAcquiredUntil = lockUntil;

        const counter = await Counter.findOneAndUpdate(
            { id: 'ltcTicket' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        const ltcSeq = counter.seq;
        const channelName = `ltc_${ltcSeq}`;
        const channelId = await Promise.resolve(createLTCTicket(lockedOrder, ltcSeq));
        if (!channelId) {
            throw new DiscordBotError('Could not create LTC ticket channel', {
                status: 503,
                code: 'DISCORD_TICKET_UNAVAILABLE'
            });
        }

        const persistResult = await Order.updateOne(
            { _id: lockedOrder._id, ltcTicketLockUntil: lockAcquiredUntil },
            {
                $set: {
                    paymentMethod: 'ltc',
                    ltcTicketChannel: channelName,
                    ltcTicketChannelId: channelId,
                    ltcTicketStatus: 'created',
                    ltcTicketError: ''
                },
                $unset: { ltcTicketLockUntil: 1 }
            }
        );
        if (!persistResult?.matchedCount) {
            const fresh = await Order.findById(lockedOrder._id).lean();
            if (fresh?.ltcTicketChannelId) {
                return res.json({
                    success: true,
                    alreadyExists: true,
                    channelId: fresh.ltcTicketChannelId
                });
            }
            await Order.updateOne(
                {
                    _id: lockedOrder._id,
                    $or: [
                        { ltcTicketChannelId: null },
                        { ltcTicketChannelId: '' },
                        { ltcTicketChannelId: { $exists: false } }
                    ]
                },
                {
                    $set: {
                        paymentMethod: 'ltc',
                        ltcTicketChannel: channelName,
                        ltcTicketChannelId: channelId,
                        ltcTicketStatus: 'created',
                        ltcTicketError: ''
                    },
                    $unset: { ltcTicketLockUntil: 1 }
                }
            );
        }

        return res.json({
            success: true,
            channelId: channelId || null,
            payAddress: getLtcPayAddress(),
            qrImageUrl: getLtcQrImageUrl()
        });
    } catch (err) {
        console.error('Create LTC ticket error:', err);
        const { status, payload } = buildTicketErrorResponse(err);
        if (lockAcquiredOrderId && lockAcquiredDiscordId) {
            await releaseLtcTicketLockAsFailed(
                lockAcquiredOrderId,
                lockAcquiredDiscordId,
                lockAcquiredUntil,
                payload.error || 'LTC ticket creation failed.'
            ).catch(() => {});
        }
        if (payload.code === 'USER_NOT_IN_GUILD') {
            return res.status(status).json({
                ...payload,
                invite_link: process.env.DISCORD_SERVER_INVITE || ''
            });
        }
        return res.status(status).json(payload);
    }
});

router.post('/create-ticket', authRequired, async (req, res) => {
    let lockAcquiredOrderId = '';
    let lockAcquiredDiscordId = '';
    let lockAcquiredUntil = null;
    try {
        const { orderId } = req.body || {};
        if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

        const { order, status, error } = await getOwnedOrder(orderId, req.user.discordId);
        if (!order) return res.status(status).json({ error });

        if (isPanelTicketMode()) {
            await Order.findByIdAndUpdate(order._id, {
                status: order.status === 'Pending' ? 'Waiting Payment' : order.status
            });
            return res.json({
                mode: 'panel',
                panelUrl: getTicketPanelUrl(),
                orderId: order.orderId
            });
        }

        const ticketConfigError = getDiscordTicketConfigError();
        if (ticketConfigError) {
            return res.status(500).json({ error: ticketConfigError });
        }

        if (order.channelId) {
            return res.json({
                success: true,
                alreadyExists: true,
                channelId: order.channelId
            });
        }

        const { lockedOrder, lockUntil } = await acquireOrderTicketLock({
            orderId,
            discordId: req.user.discordId
        });
        if (!lockedOrder) {
            const fresh = await Order.findOne({ orderId, discordId: req.user.discordId }).lean();
            if (!fresh) {
                return res.status(404).json({ error: 'Order not found' });
            }
            if (fresh?.channelId) {
                return res.json({
                    success: true,
                    alreadyExists: true,
                    channelId: fresh.channelId
                });
            }

            if (normalizeTicketStatus(fresh?.ticketStatus) === 'creating') {
                return res.status(409).json(
                    buildInProgressPayload(
                        fresh?.ticketLockUntil,
                        'Ticket is already being created. Please wait a moment.',
                        'TICKET_CREATION_IN_PROGRESS'
                    )
                );
            }

            return res.status(409).json({
                error: 'Ticket cannot be created right now. Please retry shortly.',
                code: 'TICKET_NOT_READY'
            });
        }

        lockAcquiredOrderId = lockedOrder.orderId;
        lockAcquiredDiscordId = lockedOrder.discordId;
        lockAcquiredUntil = lockUntil;

        const channelId = await Promise.resolve(createOrderTicket(lockedOrder));
        if (!channelId) {
            throw new DiscordBotError('Could not create ticket channel', {
                status: 503,
                code: 'DISCORD_TICKET_UNAVAILABLE'
            });
        }

        const persistResult = await Order.updateOne(
            { _id: lockedOrder._id, ticketLockUntil: lockAcquiredUntil },
            {
                $set: {
                    channelId,
                    ticketStatus: 'created',
                    ticketError: '',
                    status: lockedOrder.status === 'Pending' ? 'Waiting Payment' : lockedOrder.status
                },
                $unset: { ticketLockUntil: 1 }
            }
        );
        if (!persistResult?.matchedCount) {
            const fresh = await Order.findById(lockedOrder._id).lean();
            if (fresh?.channelId) {
                return res.json({
                    success: true,
                    alreadyExists: true,
                    channelId: fresh.channelId
                });
            }
            await Order.updateOne(
                {
                    _id: lockedOrder._id,
                    $or: [
                        { channelId: null },
                        { channelId: '' },
                        { channelId: { $exists: false } }
                    ]
                },
                {
                    $set: {
                        channelId,
                        ticketStatus: 'created',
                        ticketError: '',
                        status: lockedOrder.status === 'Pending' ? 'Waiting Payment' : lockedOrder.status
                    },
                    $unset: { ticketLockUntil: 1 }
                }
            );
        }

        return res.json({
            success: true,
            channelId
        });
    } catch (err) {
        console.error('Create ticket error:', err);
        const { status, payload } = buildTicketErrorResponse(err);
        if (lockAcquiredOrderId && lockAcquiredDiscordId) {
            await releaseOrderTicketLockAsFailed(
                lockAcquiredOrderId,
                lockAcquiredDiscordId,
                lockAcquiredUntil,
                payload.error || 'Ticket creation failed.'
            ).catch(() => {});
        }
        if (payload.code === 'USER_NOT_IN_GUILD') {
            return res.status(status).json({
                ...payload,
                invite_link: process.env.DISCORD_SERVER_INVITE || ''
            });
        }
        return res.status(status).json(payload);
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
