const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const qs = require('qs');
const axios = require('axios');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Counter = require('../models/Counter');
const Proof = require('../models/Proof');
const ProofImage = require('../models/ProofImage');
const WalletTransaction = require('../models/WalletTransaction');
const DeliverySlot = require('../models/DeliverySlot');
const Game = require('../models/Game');
const ShopConfig = require('../models/ShopConfig');
const {
    createOrderTicket,
    createWalletDeliveryTicket,
    createPayPalFFTicket,
    createLTCTicket,
    checkUserInGuild,
    checkUserHasOwnerRole,
    DiscordBotError
} = require('../bot');
const { createPayPalOrder, capturePayPalOrder, createLTCInvoice } = require('../services/paymentService');
const {
    buildMemoExpected,
    ensurePayPalFfInstructions
} = require('../services/paypalFfService');
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
const { creditPendingWalletTopup } = require('../services/walletService');
const {
    createSquareCashAppPayment,
    getSquareConfigError,
    getSquarePublicConfig,
    verifySquareWebhookSignature
} = require('../services/squareService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadToImgbb } = require('../utils/imgbbService');
const { log } = require('../utils/loggingService');

const PRODUCT_IMAGE_DIR = path.resolve(process.env.PRODUCT_IMAGE_DIR || './uploads/product-images');
try { fs.mkdirSync(PRODUCT_IMAGE_DIR, { recursive: true }); } catch (_) {}

const PRODUCT_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const PRODUCT_IMAGE_MAX_SIZE = 2 * 1024 * 1024; // 2MB
const productImageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, PRODUCT_IMAGE_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
        cb(null, `${base}_${Date.now()}${ext}`);
    }
});
const productImageFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!PRODUCT_IMAGE_EXTENSIONS.includes(ext)) {
        return cb(new Error('Only PNG, JPG, JPEG, and WEBP images are allowed.'), false);
    }
    cb(null, true);
};
const uploadProductImage = multer({
    storage: productImageStorage,
    fileFilter: productImageFilter,
    limits: { fileSize: PRODUCT_IMAGE_MAX_SIZE }
});

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
const DEFAULT_CASHAPP_HANDLE = '$yoko276';
const PUBLIC_CLIENT_URL = 'https://www.nosdan.store';
const PROOF_IMAGE_FETCH_TIMEOUT_MS = 12000;
const MAX_PROOF_IMAGE_BYTES = (() => {
    const n = Number(process.env.MAX_PROOF_IMAGE_BYTES);
    if (!Number.isFinite(n) || n <= 0) return 8 * 1024 * 1024;
    return Math.max(256 * 1024, Math.min(25 * 1024 * 1024, Math.floor(n)));
})();
const PROOF_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.svg'];
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
const getPayPalPaymentEmail = () => (
    normalizeEnvValue(process.env.PAYPAL_PAYMENT_EMAIL)
    || normalizeEnvValue(process.env.PAYPAL_EMAIL)
);
const getCashAppHandle = () => normalizeEnvValue(process.env.CASHAPP_HANDLE) || DEFAULT_CASHAPP_HANDLE;
const getLtcPayAddress = () => normalizeEnvValue(process.env.LTC_PAY_ADDRESS) || DEFAULT_LTC_PAY_ADDRESS;
const getLtcQrImageUrl = () => normalizeEnvValue(process.env.LTC_QR_IMAGE_URL) || DEFAULT_LTC_QR_IMAGE_URL;
const getProofVouchChannelId = () => normalizeEnvValue(process.env.DISCORD_VOUCH_CHANNEL_ID);
const getDiscordBotToken = () => normalizeEnvValue(process.env.DISCORD_BOT_TOKEN);
const normalizeProofImageContentType = (value) => {
    const text = String(value || '').split(';')[0].trim().toLowerCase();
    return text.startsWith('image/') ? text : 'image/jpeg';
};
const isDiscordImageAttachment = (attachment) => {
    const contentType = String(attachment?.content_type || attachment?.contentType || '').toLowerCase();
    if (contentType.startsWith('image/')) return true;
    const filename = String(attachment?.filename || attachment?.name || '').toLowerCase();
    return PROOF_IMAGE_EXTENSIONS.some((ext) => filename.endsWith(ext));
};
const isAllowedProofImageRemoteUrl = (value) => {
    try {
        const parsed = new URL(String(value || '').trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;
        const host = parsed.hostname.toLowerCase();
        return (
            host === 'cdn.discordapp.com'
            || host === 'media.discordapp.net'
            || host === 'media.discordapp.com'
            || host.endsWith('.discordapp.net')
            || host.endsWith('.discordapp.com')
        );
    } catch {
        return false;
    }
};
const fetchProofImageBuffer = async (url) => {
    if (!isAllowedProofImageRemoteUrl(url)) {
        throw new Error('Proof image URL is not allowed');
    }
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: PROOF_IMAGE_FETCH_TIMEOUT_MS,
        maxContentLength: MAX_PROOF_IMAGE_BYTES,
        validateStatus: (status) => Number(status) >= 200 && Number(status) < 300
    });
    const buffer = Buffer.from(response.data || []);
    if (!buffer.length) throw new Error('Proof image is empty');
    if (buffer.length > MAX_PROOF_IMAGE_BYTES) throw new Error('Proof image is too large');
    const contentType = normalizeProofImageContentType(response.headers?.['content-type']);
    return { buffer, contentType };
};
const fetchFreshDiscordProofImageUrls = async (proof) => {
    const channelId = getProofVouchChannelId();
    const botToken = getDiscordBotToken();
    const messageIds = Array.from(new Set(
        (Array.isArray(proof?.vouchMessageIds) ? proof.vouchMessageIds : [])
            .map((value) => String(value || '').trim())
            .filter(Boolean)
    ));
    if (!channelId || !botToken || messageIds.length === 0) return [];

    const urls = [];
    for (const messageId of messageIds) {
        try {
            const response = await discordRequest({
                method: 'get',
                url: `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
                timeout: 8000,
                headers: { Authorization: `Bot ${botToken}` }
            }, 0, { maxRetries: 1, maxDelayMs: 2500 });
            const attachments = Array.isArray(response?.data?.attachments) ? response.data.attachments : [];
            attachments
                .filter(isDiscordImageAttachment)
                .forEach((attachment) => {
                    const url = String(attachment?.url || attachment?.proxy_url || '').trim();
                    if (url) urls.push(url);
                });
        } catch (error) {
            console.warn(`Proof image Discord refresh failed for message ${messageId}:`, error?.response?.status || error?.message || error);
        }
    }
    return urls;
};
const sendProofImageResponse = (res, image) => {
    const data = Buffer.isBuffer(image?.data)
        ? image.data
        : Buffer.from(image?.data?.buffer || image?.data || []);
    if (!data.length) {
        return res.status(404).json({ error: 'Proof image not found' });
    }
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Content-Type', normalizeProofImageContentType(image?.contentType));
    return res.send(data);
};
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
    const txnId = capture?.id || '';
    return { amountValue, currency, referenceId, txnId };
};

const amountsMatch = (left, right) => Math.abs(Number(left) - Number(right)) < 0.01;
const BULK_DISCOUNT_THRESHOLD = 10;
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const moneyToCents = (value) => Math.round((Number(value) + Number.EPSILON) * 100);
const centsToMoney = (value) => roundMoney((Number(value) || 0) / 100);
const normalizeText = (value) => String(value || '').trim().toLowerCase();
const normalizeKeyText = (value) => normalizeText(value).replace(/\s+/g, '');
const WALLET_TOPUP_METHODS = new Set(['paypal_ff', 'cashapp', 'ltc']);
const formatWalletMethodLabel = (method) => {
    const normalized = String(method || '').trim().toLowerCase();
    if (normalized === 'paypal_ff') return 'PayPal Friends & Family';
    if (normalized === 'cashapp') return 'Cash App';
    if (normalized === 'ltc') return 'Litecoin';
    if (normalized === 'wallet') return 'Wallet';
    return normalized || '-';
};
const buildWalletMemoExpected = ({ referenceCode, discordId }) => `NOS WALLET ${referenceCode} ${discordId}`;
const toWalletTransactionPayload = (transaction) => {
    const hasBalanceAfter = transaction?.balanceAfterCents !== null
        && transaction?.balanceAfterCents !== undefined
        && Number.isFinite(Number(transaction.balanceAfterCents));
    return {
        id: String(transaction?._id || ''),
        discordId: transaction?.discordId || '',
        discordUsername: transaction?.discordUsername || '',
        type: transaction?.type || '',
        direction: transaction?.direction || '',
        amountCents: Number(transaction?.amountCents || 0),
        amount: centsToMoney(transaction?.amountCents || 0),
        currency: transaction?.currency || 'USD',
        method: transaction?.method || '',
        methodLabel: formatWalletMethodLabel(transaction?.method),
        status: transaction?.status || '',
        referenceCode: transaction?.referenceCode || '',
        memoExpected: transaction?.memoExpected || '',
        paymentAddress: transaction?.paymentAddress || '',
        provider: transaction?.provider || '',
        providerPaymentId: transaction?.providerPaymentId || '',
        payAmount: Number.isFinite(Number(transaction?.payAmount)) ? Number(transaction.payAmount) : null,
        payCurrency: transaction?.payCurrency || '',
        checkoutUrl: transaction?.checkoutUrl || '',
        txnId: transaction?.txnId || '',
        orderId: transaction?.orderId || '',
        items: Array.isArray(transaction?.items) ? transaction.items : [],
        balanceAfterCents: hasBalanceAfter ? Number(transaction.balanceAfterCents) : null,
        balanceAfter: hasBalanceAfter ? centsToMoney(transaction.balanceAfterCents) : null,
        adminNotes: transaction?.adminNotes || '',
        reviewedBy: transaction?.reviewedBy || '',
        reviewedAt: transaction?.reviewedAt || null,
        createdAt: transaction?.createdAt || null,
        updatedAt: transaction?.updatedAt || null
    };
};
const buildWalletInstructions = ({ transaction }) => {
    const method = String(transaction?.method || '').trim().toLowerCase();
    const amount = centsToMoney(transaction?.amountCents || 0);
    const base = {
        method,
        methodLabel: formatWalletMethodLabel(method),
        amount,
        currency: 'USD',
        memoExpected: transaction?.memoExpected || ''
    };

    if (method === 'paypal_ff') {
        return {
            ...base,
            paypalEmail: getPayPalPaymentEmail(),
            destination: getPayPalPaymentEmail()
        };
    }
    if (method === 'cashapp') {
        const squareConfig = getSquarePublicConfig();
        return {
            ...base,
            provider: transaction?.provider || 'square',
            destination: 'Cash App Pay',
            ltcAddress: getLtcPayAddress(),
            qrImageUrl: getLtcQrImageUrl(),
            square: {
                enabled: squareConfig.enabled,
                applicationId: squareConfig.applicationId,
                locationId: squareConfig.locationId,
                environment: squareConfig.environment
            }
        };
    }
    if (method === 'ltc') {
        const hasProviderPayment = Boolean(transaction?.providerPaymentId);
        return {
            ...base,
            payAddress: getLtcPayAddress(),
            qrImageUrl: hasProviderPayment ? '' : getLtcQrImageUrl(),
            destination: transaction?.paymentAddress || getLtcPayAddress(),
            provider: transaction?.provider || '',
            providerPaymentId: transaction?.providerPaymentId || '',
            payAmount: Number.isFinite(Number(transaction?.payAmount)) ? Number(transaction.payAmount) : null,
            payCurrency: transaction?.payCurrency || 'ltc'
        };
    }
    return base;
};
const creditSquareWalletPayment = async ({ payment, source = 'square' }) => {
    const paymentId = String(payment?.id || '').trim();
    const referenceCode = String(payment?.reference_id || '').trim();
    const paymentStatus = String(payment?.status || '').trim().toLowerCase();
    const amountCents = Number(payment?.amount_money?.amount || 0);
    const currency = String(payment?.amount_money?.currency || '').trim().toUpperCase();
    const matchConditions = [];
    if (paymentId) {
        matchConditions.push({ providerPaymentId: paymentId }, { txnId: paymentId });
    }
    if (referenceCode) {
        matchConditions.push({ referenceCode });
    }
    if (!paymentId || matchConditions.length === 0) {
        return { ok: false, status: 'missing_payment_id', message: 'Square payment id is missing.' };
    }

    const transaction = await WalletTransaction.findOne({
        type: 'topup',
        method: 'cashapp',
        provider: 'square',
        $or: matchConditions
    });
    if (!transaction) {
        return { ok: false, status: 'topup_not_found', message: 'Square wallet top-up was not found.' };
    }
    if (transaction.status === 'completed') {
        return { ok: true, status: 'already_completed', transaction };
    }
    if (paymentStatus !== 'completed') {
        return { ok: false, status: paymentStatus || 'not_completed', transaction };
    }
    if (currency && currency !== 'USD') {
        transaction.adminNotes = `Square currency mismatch: expected USD, received ${currency}.`;
        await transaction.save();
        return { ok: false, status: 'currency_mismatch', transaction };
    }
    if (!Number.isFinite(amountCents) || amountCents < Number(transaction.amountCents || 0)) {
        transaction.adminNotes = `Square amount mismatch: expected ${transaction.amountCents} cents, received ${amountCents} cents.`;
        await transaction.save();
        return { ok: false, status: 'amount_mismatch', transaction };
    }

    transaction.providerPaymentId = paymentId;
    await transaction.save();

    return creditPendingWalletTopup({
        filter: { _id: transaction._id, method: 'cashapp', provider: 'square' },
        txnId: paymentId,
        source,
        adminNotes: `Square Cash App Pay status=${paymentStatus}`
    });
};
const LEGACY_COMBO_KEYS = new Set(['combox2luck+drop', 'combox2luckdrop']);
const COMBO_LUCK_KEY = 'x2luck';
const COMBO_DROP_KEY = 'x2drop';
const DEFAULT_COMBO_IMAGE = 'combo x2 luck+drop.png';
let ensureComboProductsPromise = null;
const getForcedCatalogPrice = (product) => {
    const category = normalizeText(product?.category);
    const name = normalizeText(product?.name);
    const keyName = normalizeKeyText(product?.name);

    if (category === 'sets') {
        return name === 'madoka' ? 8 : 2;
    }
    if (category === 'combo' && (keyName === COMBO_LUCK_KEY || keyName === COMBO_DROP_KEY)) {
        return 3;
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

const isLegacyComboProduct = (product) => {
    const category = normalizeText(product?.category);
    const keyName = normalizeKeyText(product?.name);
    return category === 'combo' && LEGACY_COMBO_KEYS.has(keyName);
};

const createComboProductPayload = (name, image) => ({
    name,
    price: 3,
    originalPriceString: '$3/1',
    bulkPrice: null,
    bulkPriceString: '',
    image: String(image || DEFAULT_COMBO_IMAGE).trim() || DEFAULT_COMBO_IMAGE,
    category: 'Combo'
});

const ensureSplitComboProducts = async () => {
    if (ensureComboProductsPromise) return ensureComboProductsPromise;

    ensureComboProductsPromise = (async () => {
        const comboProducts = await Product.find({ category: { $regex: /^combo$/i } }).lean();
        const hasLuck = comboProducts.some((item) => normalizeKeyText(item?.name) === COMBO_LUCK_KEY);
        const hasDrop = comboProducts.some((item) => normalizeKeyText(item?.name) === COMBO_DROP_KEY);
        const legacyProduct = comboProducts.find((item) => isLegacyComboProduct(item));
        const comboImage = String(legacyProduct?.image || DEFAULT_COMBO_IMAGE).trim() || DEFAULT_COMBO_IMAGE;

        const createTasks = [];
        if (!hasLuck) {
            createTasks.push(Product.create(createComboProductPayload('x2 luck', comboImage)));
        }
        if (!hasDrop) {
            createTasks.push(Product.create(createComboProductPayload('x2 drop', comboImage)));
        }

        if (createTasks.length > 0) {
            await Promise.all(createTasks);
        }
    })().catch((error) => {
        ensureComboProductsPromise = null;
        throw error;
    });

    return ensureComboProductsPromise;
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

    const confirmedCouponOrder = await Order.findOne({
        confirmationDiscountCode: couponCode,
        confirmedAt: { $ne: null },
        couponCode: { $ne: couponCode }
    }).select('_id').lean();
    const isGeneratedConfirmCoupon = Boolean(confirmedCouponOrder);

    if (!isSupportedCouponCode(couponCode) && !isGeneratedConfirmCoupon) {
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
        discountPercent: isGeneratedConfirmCoupon ? 5 : getCouponDiscountPercent(couponCode),
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
    if (order.discordId && order.discordId !== discordId) return { order: null, status: 403, error: 'You do not own this order' };
    return { order, status: 200, error: null };
};

const getPublicOrder = async (orderId) => {
    const order = await Order.findOne({ orderId });
    if (!order) return { order: null, status: 404, error: 'Order not found' };
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
    const startTime = Date.now();
    const { code: rawCode, redirect_uri: frontendRedirectUri } = req.body || {};
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    const redirectUri = resolveDiscordAuthRedirectUri(frontendRedirectUri);

    log.info('[AUTH DISCORD] Discord auth request received', {
        requestId: req.requestId,
        ip: req.ip,
        hasCode: Boolean(code),
        hasRedirectUri: Boolean(redirectUri)
    });

    if (!code) {
        log.warn('[AUTH DISCORD] Missing code', { requestId: req.requestId });
        return res.status(400).json({ error: 'Missing authorization code' });
    }
    if (!redirectUri) {
        log.warn('[AUTH DISCORD] Missing redirect_uri', { requestId: req.requestId });
        return res.status(400).json({ error: 'redirect_uri required' });
    }
    const oauthConfigError = getDiscordOauthConfigError();
    if (oauthConfigError) {
        log.error('[AUTH DISCORD] OAuth config error', { requestId: req.requestId, error: oauthConfigError });
        return res.status(500).json({ error: oauthConfigError });
    }

    cleanupAuthSuccessCache();
    const cacheKey = getAuthCodeCacheKey(code);
    const cached = discordAuthSuccessCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        log.info('[AUTH DISCORD] Auth success (cached)', {
            requestId: req.requestId,
            duration: `${Date.now() - startTime}ms`
        });
        return res.json(cached.payload);
    }

    const inFlightPromise = discordAuthInFlight.get(cacheKey);
    if (inFlightPromise) {
        try {
            const payload = await inFlightPromise;
            log.info('[AUTH DISCORD] Auth success (in-flight)', {
                requestId: req.requestId,
                duration: `${Date.now() - startTime}ms`
            });
            return res.json(payload);
        } catch (error) {
            log.error('[AUTH DISCORD] Auth failed (in-flight)', {
                requestId: req.requestId,
                error: error?.message || error,
                step: error?.discordStep
            });
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
        log.info('[AUTH DISCORD] Auth success', {
            requestId: req.requestId,
            discordId: payload?.user?.discordId,
            duration: `${Date.now() - startTime}ms`
        });
        return res.json(payload);
    } catch (error) {
        log.error('[AUTH DISCORD] Auth failed', {
            requestId: req.requestId,
            error: error?.message || error,
            step: error?.discordStep,
            status: error?.response?.status,
            duration: `${Date.now() - startTime}ms`
        });
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
        await ensureSplitComboProducts().catch((error) => {
            console.warn('ensureSplitComboProducts warning:', error?.message || error);
        });
        const products = await Product.find().lean();
        const normalizedProducts = products
            .filter((product) => !isLegacyComboProduct(product))
            .map((product) => applyPriceOverridesForClient(product));
        res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
        return res.json(normalizedProducts);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get('/proofs', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        const page = Math.max(1, Number(req.query?.page) || 1);
        const limit = Math.min(60, Math.max(1, Number(req.query?.limit) || 24));
        const skip = (page - 1) * limit;

        const proofs = await Proof.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit + 1)
            .lean();

        const hasMore = proofs.length > limit;
        const pageItems = hasMore ? proofs.slice(0, limit) : proofs;
        const apiOrigin = `${req.protocol}://${req.get('host')}`;

        return res.json({
            page,
            limit,
            hasMore,
            items: pageItems.map((proof) => ({
                id: String(proof?._id || ''),
                orderId: String(proof?.orderId || ''),
                discordUsername: String(proof?.discordUsername || ''),
                totalAmount: Number(proof?.totalAmount || 0),
                items: Array.isArray(proof?.items) ? proof.items : [],
                imageUrls: (Array.isArray(proof?.imageUrls) ? proof.imageUrls : [])
                    .map((_, index) => `${apiOrigin}/api/shop/proofs/${encodeURIComponent(String(proof?._id || ''))}/images/${index}`),
                createdAt: proof?.createdAt || null
            }))
        });
    } catch (error) {
        console.error('Proofs fetch error:', error);
        return res.status(500).json({ error: 'Failed to fetch proofs' });
    }
});

router.get('/proofs/:proofId/images/:imageIndex', async (req, res) => {
    try {
        const proofId = String(req.params?.proofId || '').trim();
        const imageIndex = Math.floor(Number(req.params?.imageIndex));
        if (!OBJECT_ID_PATTERN.test(proofId) || !Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex > 99) {
            return res.status(400).json({ error: 'Invalid proof image id' });
        }

        const cached = await ProofImage.findOne({ proofId, position: imageIndex }).lean();
        if (cached?.data) {
            return sendProofImageResponse(res, cached);
        }

        const proof = await Proof.findById(proofId)
            .select('orderId imageUrls vouchMessageIds')
            .lean();
        if (!proof) {
            return res.status(404).json({ error: 'Proof not found' });
        }

        const originalUrl = Array.isArray(proof.imageUrls) ? String(proof.imageUrls[imageIndex] || '').trim() : '';
        const candidates = [];
        if (originalUrl) candidates.push(originalUrl);

        const freshDiscordUrls = await fetchFreshDiscordProofImageUrls(proof);
        const freshUrl = freshDiscordUrls[imageIndex] || '';
        if (freshUrl && freshUrl !== originalUrl) candidates.push(freshUrl);

        for (const candidate of candidates) {
            try {
                const image = await fetchProofImageBuffer(candidate);
                await ProofImage.findOneAndUpdate(
                    { proofId, position: imageIndex },
                    {
                        $set: {
                            orderId: String(proof.orderId || ''),
                            contentType: image.contentType,
                            data: image.buffer,
                            sourceUrl: candidate,
                            updatedAt: new Date()
                        },
                        $setOnInsert: {
                            createdAt: new Date()
                        }
                    },
                    { upsert: true }
                );
                return sendProofImageResponse(res, {
                    data: image.buffer,
                    contentType: image.contentType
                });
            } catch (error) {
                console.warn(`Proof image fetch failed: ${candidate}`, error?.message || error);
            }
        }

        return res.status(404).json({ error: 'Proof image is no longer available' });
    } catch (error) {
        console.error('Proof image fetch error:', error);
        return res.status(500).json({ error: 'Failed to fetch proof image' });
    }
});

router.delete('/proofs/:proofId', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const canDelete = await canAccessOwnerEndpoints(discordId);
        if (!canDelete) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const proofId = String(req.params?.proofId || '').trim();
        if (!OBJECT_ID_PATTERN.test(proofId)) {
            return res.status(400).json({ error: 'Invalid proof id' });
        }

        const deleted = await Proof.findByIdAndDelete(proofId);
        if (!deleted) {
            return res.status(404).json({ error: 'Proof not found' });
        }

        return res.json({ success: true, id: proofId });
    } catch (error) {
        console.error('Delete proof error:', error);
        return res.status(500).json({ error: 'Failed to delete proof' });
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

router.get('/wallet', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });

        const dbUser = await User.findOne({ discordId }).lean();
        if (!dbUser) return res.status(401).json({ error: 'Discord account not linked' });

        const transactions = await WalletTransaction.find({ discordId })
            .sort({ createdAt: -1 })
            .limit(80)
            .lean();

        return res.json({
            balanceCents: Number(dbUser.walletBalanceCents || 0),
            balance: centsToMoney(dbUser.walletBalanceCents || 0),
            currency: 'USD',
            paypalEmail: getPayPalPaymentEmail(),
            cashAppHandle: getCashAppHandle(),
            square: getSquarePublicConfig(),
            ltcPayAddress: getLtcPayAddress(),
            ltcQrImageUrl: getLtcQrImageUrl(),
            transactions: transactions.map(toWalletTransactionPayload)
        });
    } catch (error) {
        console.error('Wallet fetch error:', error);
        return res.status(500).json({ error: 'Failed to load wallet' });
    }
});

router.post('/wallet/topup', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });

        const method = String(req.body?.method || '').trim().toLowerCase();
        if (!WALLET_TOPUP_METHODS.has(method)) {
            return res.status(400).json({ error: 'Invalid top-up method' });
        }

        const amountCents = moneyToCents(req.body?.amount);
        if (!Number.isFinite(amountCents) || amountCents < 100) {
            return res.status(400).json({ error: 'Top-up amount must be at least $1.00' });
        }
        if (amountCents > 1000000) {
            return res.status(400).json({ error: 'Top-up amount is too large' });
        }

        const dbUser = await User.findOne({ discordId });
        if (!dbUser) return res.status(401).json({ error: 'Discord account not linked' });

        const counter = await Counter.findOneAndUpdate(
            { id: 'walletTopup' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        const referenceCode = `TOP${counter.seq}`;
        const memoExpected = buildWalletMemoExpected({ referenceCode, discordId });
        let paymentAddress = method === 'paypal_ff'
            ? getPayPalPaymentEmail()
            : (method === 'cashapp' ? getCashAppHandle() : getLtcPayAddress());
        let provider = '';
        let providerPaymentId = '';
        let payAmount = null;
        let payCurrency = '';

        if (method === 'cashapp') {
            const squareConfigError = getSquareConfigError();
            if (squareConfigError) {
                return res.status(503).json({ error: `Cash App Pay auto-confirmation is not configured (${squareConfigError})` });
            }
            provider = 'square';
            paymentAddress = 'Cash App Pay';
        }

        if (method === 'ltc' && normalizeEnvValue(process.env.NOWPAYMENTS_API_KEY)) {
            const ltcPayment = await createLTCInvoice(referenceCode, centsToMoney(amountCents), {
                orderDescription: `NosMarket wallet top-up ${referenceCode}`
            });
            if (!ltcPayment?.paymentId || !ltcPayment?.payAddress || !ltcPayment?.payAmount) {
                return res.status(503).json({ error: 'Litecoin auto-confirmation provider is temporarily unavailable' });
            }
            provider = 'nowpayments';
            providerPaymentId = String(ltcPayment.paymentId || '');
            paymentAddress = String(ltcPayment.payAddress || '');
            payAmount = Number(ltcPayment.payAmount);
            payCurrency = String(ltcPayment.payCurrency || 'ltc').toLowerCase();
        } else if (method === 'ltc') {
            return res.status(503).json({ error: 'Litecoin auto-confirmation is not configured (missing NOWPAYMENTS_API_KEY or BACKEND_URL)' });
        }

        if (!paymentAddress) {
            return res.status(500).json({ error: `${formatWalletMethodLabel(method)} destination is not configured` });
        }

        const transaction = await WalletTransaction.create({
            discordId,
            discordUsername: dbUser.discordUsername || '',
            type: 'topup',
            direction: 'credit',
            amountCents,
            currency: 'USD',
            method,
            status: 'pending',
            referenceCode,
            memoExpected,
            paymentAddress,
            provider,
            providerPaymentId,
            payAmount,
            payCurrency
        });

        return res.json({
            success: true,
            topup: toWalletTransactionPayload(transaction),
            instructions: buildWalletInstructions({ transaction }),
            notificationSent: false
        });
    } catch (error) {
        console.error('Wallet deposit error:', error);
        return res.status(500).json({ error: 'Failed to start wallet payment' });
    }
});

router.post('/wallet/topup/square/:transactionId/complete', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });

        const transactionId = String(req.params?.transactionId || '').trim();
        if (!OBJECT_ID_PATTERN.test(transactionId)) {
            return res.status(400).json({ error: 'Invalid transaction id' });
        }

        const sourceId = String(req.body?.sourceId || req.body?.source_id || '').trim();
        if (!sourceId) {
            return res.status(400).json({ error: 'Missing Square source id' });
        }

        const transaction = await WalletTransaction.findOne({
            _id: transactionId,
            discordId,
            type: 'topup',
            method: 'cashapp',
            provider: 'square'
        });
        if (!transaction) {
            return res.status(404).json({ error: 'Cash App top-up request not found' });
        }
        if (transaction.status === 'completed') {
            return res.json({
                success: true,
                alreadyCompleted: true,
                topup: toWalletTransactionPayload(transaction)
            });
        }
        if (transaction.status !== 'pending') {
            return res.status(409).json({ error: `Top-up is ${transaction.status}` });
        }

        const squarePayment = await createSquareCashAppPayment({
            sourceId,
            amountCents: Number(transaction.amountCents || 0),
            referenceCode: transaction.referenceCode,
            buyerDiscordId: discordId
        });
        if (!squarePayment.ok || !squarePayment.payment?.id) {
            return res.status(502).json({
                error: squarePayment.error || 'Square payment failed',
                status: squarePayment.status || 'failed'
            });
        }

        transaction.providerPaymentId = String(squarePayment.payment.id || '');
        transaction.txnId = String(squarePayment.payment.id || '');
        await transaction.save();

        const creditResult = await creditSquareWalletPayment({
            payment: squarePayment.payment,
            source: 'square_checkout'
        });
        const freshUser = await User.findOne({ discordId }).lean();
        const freshTransaction = await WalletTransaction.findById(transaction._id).lean();

        if (!creditResult.ok) {
            return res.status(202).json({
                success: false,
                status: creditResult.status,
                paymentStatus: squarePayment.status,
                topup: toWalletTransactionPayload(freshTransaction || transaction),
                balanceCents: Number(freshUser?.walletBalanceCents || 0),
                balance: centsToMoney(freshUser?.walletBalanceCents || 0)
            });
        }

        return res.json({
            success: true,
            paymentStatus: squarePayment.status,
            topup: toWalletTransactionPayload(freshTransaction || creditResult.transaction || transaction),
            balanceCents: Number(freshUser?.walletBalanceCents || 0),
            balance: centsToMoney(freshUser?.walletBalanceCents || 0)
        });
    } catch (error) {
        console.error('Square Cash App wallet complete error:', error);
        return res.status(500).json({ error: 'Failed to complete Cash App payment' });
    }
});

router.get('/wallet/admin', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });

        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const [pendingTopups, transactions] = await Promise.all([
            WalletTransaction.find({ type: 'topup', status: 'pending' })
                .sort({ createdAt: 1 })
                .limit(100)
                .lean(),
            WalletTransaction.find({})
                .sort({ createdAt: -1 })
                .limit(150)
                .lean()
        ]);

        return res.json({
            pendingTopups: pendingTopups.map(toWalletTransactionPayload),
            transactions: transactions.map(toWalletTransactionPayload)
        });
    } catch (error) {
        console.error('Wallet admin fetch error:', error);
        return res.status(500).json({ error: 'Failed to load wallet admin data' });
    }
});

router.post('/wallet/admin/topups/:transactionId/approve', authRequired, async (req, res) => {
    try {
        const ownerDiscordId = String(req.user?.discordId || '').trim();
        if (!ownerDiscordId) return res.status(401).json({ error: 'Authentication required' });

        const isOwner = await canAccessOwnerEndpoints(ownerDiscordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const transactionId = String(req.params?.transactionId || '').trim();
        if (!OBJECT_ID_PATTERN.test(transactionId)) {
            return res.status(400).json({ error: 'Invalid transaction id' });
        }

        const txnId = String(req.body?.txnId || req.body?.txn_id || '').trim().slice(0, 120);
        const adminNotes = String(req.body?.adminNotes || req.body?.admin_notes || '').trim().slice(0, 1000);
        const transaction = await WalletTransaction.findOneAndUpdate(
            { _id: transactionId, type: 'topup', status: 'pending' },
            {
                $set: {
                    status: 'completed',
                    txnId,
                    adminNotes,
                    reviewedBy: ownerDiscordId,
                    reviewedAt: new Date()
                }
            },
            { new: true }
        );

        if (!transaction) {
            return res.status(409).json({ error: 'Top-up is not pending or does not exist' });
        }

        const creditedUser = await User.findOneAndUpdate(
            { discordId: transaction.discordId },
            { $inc: { walletBalanceCents: transaction.amountCents } },
            { new: true }
        );
        if (!creditedUser) {
            return res.status(500).json({ error: 'Could not credit wallet user' });
        }

        transaction.balanceAfterCents = Number(creditedUser.walletBalanceCents || 0);
        await transaction.save();

        return res.json({
            success: true,
            balanceCents: Number(creditedUser.walletBalanceCents || 0),
            balance: centsToMoney(creditedUser.walletBalanceCents || 0),
            topup: toWalletTransactionPayload(transaction)
        });
    } catch (error) {
        console.error('Wallet top-up approve error:', error);
        return res.status(500).json({ error: 'Failed to approve top-up' });
    }
});

router.post('/wallet/admin/topups/:transactionId/reject', authRequired, async (req, res) => {
    try {
        const ownerDiscordId = String(req.user?.discordId || '').trim();
        if (!ownerDiscordId) return res.status(401).json({ error: 'Authentication required' });

        const isOwner = await canAccessOwnerEndpoints(ownerDiscordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const transactionId = String(req.params?.transactionId || '').trim();
        if (!OBJECT_ID_PATTERN.test(transactionId)) {
            return res.status(400).json({ error: 'Invalid transaction id' });
        }

        const adminNotes = String(req.body?.adminNotes || req.body?.admin_notes || '').trim().slice(0, 1000);
        const transaction = await WalletTransaction.findOneAndUpdate(
            { _id: transactionId, type: 'topup', status: 'pending' },
            {
                $set: {
                    status: 'rejected',
                    adminNotes,
                    reviewedBy: ownerDiscordId,
                    reviewedAt: new Date()
                }
            },
            { new: true }
        );

        if (!transaction) {
            return res.status(409).json({ error: 'Top-up is not pending or does not exist' });
        }

        return res.json({ success: true, topup: toWalletTransactionPayload(transaction) });
    } catch (error) {
        console.error('Wallet top-up reject error:', error);
        return res.status(500).json({ error: 'Failed to reject top-up' });
    }
});

router.post('/checkout', checkoutLimiter, async (req, res) => {
    const startTime = Date.now();
    log.info('[CHECKOUT] Incoming checkout request', {
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        hasCartItems: Array.isArray(req.body?.cartItems) && req.body.cartItems.length > 0,
        cartItemCount: Array.isArray(req.body?.cartItems) ? req.body.cartItems.length : 0,
        hasCoupon: Boolean(req.body?.couponCode)
    });

    try {
        const viewer = getOptionalRequestUser(req);
        const discordId = String(viewer?.discordId || '').trim();
        const cartItems = Array.isArray(req.body?.cartItems) ? req.body.cartItems : [];
        const couponCodeRaw = req.body?.couponCode;
        if (cartItems.length === 0) {
            log.warn('[CHECKOUT] Empty cart items', { requestId: req.requestId });
            return res.status(400).json({ error: 'Invalid request payload' });
        }

        const dbUser = discordId ? await User.findOne({ discordId }).lean() : null;

        const cartSummary = await calculateCartSummary({ cartItems, couponCodeRaw });
        if (cartSummary.error) {
            log.warn('[CHECKOUT] Cart summary error', {
                requestId: req.requestId,
                discordId,
                error: cartSummary.error
            });
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

        const totalCents = moneyToCents(totalAmount);
        if (!Number.isFinite(totalCents) || totalCents <= 0) {
            log.warn('[CHECKOUT] Invalid total', { requestId: req.requestId, totalAmount });
            return res.status(400).json({ error: 'Invalid checkout total' });
        }

        let newOrder = null;
        let orderId = '';
        let products = [];
        try {
            for (let attempt = 0; attempt < 3; attempt += 1) {
                const counter = await Counter.findOneAndUpdate(
                    { id: 'orderId' },
                    { $inc: { seq: 1 } },
                    { new: true, upsert: true }
                );
                orderId = `nm_${counter.seq}`;

                try {
                    products = items.map((item) => ({
                        product: item.product || null,
                        name: item.name || '',
                        quantity: Number(item.quantity || 1),
                        price: Number(item.price || 0)
                    }));
                    newOrder = new Order({
                        orderId,
                        customerEmail: '',
                        discordId,
                        discordUsername: dbUser?.discordUsername || '',
                        items,
                        products,
                        subtotalAmount,
                        discountAmount,
                        discountPercent,
                        couponCode,
                        total: totalAmount,
                        totalAmount,
                        paymentMethod: 'paypal_ff',
                        paymentStatus: 'pending',
                        memoExpected: buildMemoExpected({ orderId }),
                        txnId: '',
                        paidAt: null,
                        status: 'Waiting Payment',
                        ticketStatus: 'pending',
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
        } catch (saveError) {
            throw saveError;
        }

        if (!newOrder) {
            log.error('[CHECKOUT] Failed to create order after retries', { requestId: req.requestId });
            return res.status(503).json({ error: 'Could not create order right now. Please retry.' });
        }

        log.info('[CHECKOUT] Order created successfully', {
            requestId: req.requestId,
            orderId,
            discordId,
            discordUsername: dbUser?.discordUsername || 'anonymous',
            subtotalAmount,
            discountAmount,
            discountPercent,
            couponCode,
            totalAmount,
            itemCount: items.length,
            duration: `${Date.now() - startTime}ms`
        });

        return res.json({
            success: true,
            orderId,
            subtotalAmount: newOrder.subtotalAmount,
            discountAmount: newOrder.discountAmount || 0,
            discountPercent: newOrder.discountPercent || 0,
            couponCode: newOrder.couponCode || '',
            totalAmount: newOrder.totalAmount,
            customerEmail: '',
            paymentMethod: 'paypal_ff',
            paymentStatus: 'pending',
            memoExpected: newOrder.memoExpected || buildMemoExpected(newOrder),
            ticketMode: 'bot',
            channelId: null,
            ticketStatus: 'pending',
            ticketError: ''
        });
    } catch (err) {
        log.error('[CHECKOUT] Server error', {
            requestId: req.requestId,
            error: err?.message || err,
            stack: err?.stack,
            duration: `${Date.now() - startTime}ms`
        });
        return res.status(500).json({ error: 'Server error' });
    }
});

router.get('/order-payment-info', async (req, res) => {
    const orderId = req.query?.orderId;
    if (!orderId) return res.status(400).json({ error: 'Missing orderId' });
    try {
        const viewer = getOptionalRequestUser(req);
        const { order, status, error } = viewer?.discordId
            ? await getOwnedOrder(orderId, viewer.discordId)
            : await getPublicOrder(orderId);
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
            customerEmail: order.customerEmail || '',
            subtotalAmount: Number(order.subtotalAmount || order.totalAmount || 0),
            discountAmount: Number(order.discountAmount || 0),
            discountPercent: Number(order.discountPercent || 0),
            couponCode: order.couponCode || '',
            totalAmount: order.totalAmount,
            items: Array.isArray(order.items)
                ? order.items.map((item) => ({
                    name: String(item?.name || ''),
                    quantity: Number(item?.quantity || 1),
                    price: Number(item?.price || 0)
                }))
                : [],
            status: order.status,
            paymentMethod: order.paymentMethod || 'paypal_ff',
            paymentStatus: order.paymentStatus || (order.status === 'Completed' ? 'paid' : 'pending'),
            memoExpected: order.memoExpected || buildMemoExpected(order),
            isPaid: order.status === 'Completed' || order.paymentStatus === 'paid',
            discordId: order.discordId || '',
            discordUsername: order.discordUsername || '',
            robloxUserId: order.robloxUserId || '',
            robloxUsername: order.robloxUsername || '',
            robloxVerifiedAt: order.robloxVerifiedAt || null,
            deliverySlotId: order.deliverySlotId || null,
            deliveryOwnerTimezone: order.deliveryOwnerTimezone || '',
            deliveryOwnerStartAt: order.deliveryOwnerStartAt || null,
            deliveryOwnerEndAt: order.deliveryOwnerEndAt || null,
            deliveryCustomerTimezone: order.deliveryCustomerTimezone || '',
            deliveryCustomerStartAt: order.deliveryCustomerStartAt || null,
            deliveryCustomerEndAt: order.deliveryCustomerEndAt || null,
            deliveryOwnerStartText: formatDateInTimezone(order.deliveryOwnerStartAt, order.deliveryOwnerTimezone),
            deliveryOwnerEndText: formatDateInTimezone(order.deliveryOwnerEndAt, order.deliveryOwnerTimezone),
            deliveryCustomerStartText: formatDateInTimezone(order.deliveryCustomerStartAt, order.deliveryCustomerTimezone),
            deliveryCustomerEndText: formatDateInTimezone(order.deliveryCustomerEndAt, order.deliveryCustomerTimezone),
            deliveredAt: order.deliveredAt || null,
            confirmationRequestedAt: order.confirmationRequestedAt || null,
            confirmedAt: order.confirmedAt || null,
            confirmationDiscountCode: order.confirmationDiscountCode || '',
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

router.post('/create-payment', async (req, res) => {
    const startTime = Date.now();
    const { orderId, method } = req.body || {};

    log.info('[CREATE_PAYMENT] Request received', {
        requestId: req.requestId,
        ip: req.ip,
        orderId,
        method,
        hasAuth: Boolean(req.headers.authorization)
    });

    try {
        if (!orderId || !method) {
            log.warn('[CREATE_PAYMENT] Missing params', { requestId: req.requestId, orderId, method });
            return res.status(400).json({ error: 'Missing orderId or method' });
        }

        const viewer = getOptionalRequestUser(req);
        const { order, status, error } = viewer?.discordId
            ? await getOwnedOrder(orderId, viewer.discordId)
            : await getPublicOrder(orderId);
        if (!order) {
            log.warn('[CREATE_PAYMENT] Order not found', { requestId: req.requestId, orderId, status });
            return res.status(status).json({ error });
        }

        if (order.status === 'Completed') {
            log.warn('[CREATE_PAYMENT] Order already completed', { requestId: req.requestId, orderId });
            return res.status(400).json({ error: 'Order is already paid' });
        }

        if (method === 'paypal_ff') {
            log.info('[CREATE_PAYMENT] PayPal F&F selected', {
                requestId: req.requestId,
                orderId,
                discordId: order.discordId,
                totalAmount: order.totalAmount
            });
            const instructions = await ensurePayPalFfInstructions(order, { sendEmail: true });
            return res.json({
                type: 'paypal_ff',
                email: instructions?.paypalEmail || process.env.PAYPAL_EMAIL || '',
                memoExpected: instructions?.memoExpected || buildMemoExpected(order),
                paymentStatus: instructions?.order?.paymentStatus || 'pending',
                instructionEmailSentAt: instructions?.order?.paymentInstructionEmailSentAt || null
            });
        }

        if (method === 'paypal') {
            const backendBaseUrl = getBackendBaseUrl() || getOriginBaseUrl(`${req.protocol}://${req.get('host')}`);
            const clientBaseUrl = getClientBaseUrl() || getOriginBaseUrl(req.headers.origin);
            if (!backendBaseUrl || !clientBaseUrl) {
                log.error('[CREATE_PAYMENT] Payment URLs not configured', { requestId: req.requestId });
                return res.status(500).json({ error: 'Payment URLs are not configured' });
            }

            const returnUrl = `${backendBaseUrl}/api/shop/paypal/capture?orderId=${encodeURIComponent(orderId)}`;
            const cancelUrl = `${clientBaseUrl}/pay?orderId=${encodeURIComponent(orderId)}`;
            log.info('[CREATE_PAYMENT] Creating PayPal order', { requestId: req.requestId, orderId, returnUrl, cancelUrl });

            const paypal = await withTimeout(
                createPayPalOrder(orderId, order.totalAmount, returnUrl, cancelUrl),
                PAYMENT_PROVIDER_TIMEOUT_MS,
                null
            );
            if (!paypal?.approvalLink || !paypal?.orderId) {
                log.error('[CREATE_PAYMENT] PayPal order creation failed', { requestId: req.requestId, orderId });
                return res.status(503).json({ error: 'PayPal is temporarily unavailable. Please use another payment option.' });
            }

            await Order.findByIdAndUpdate(order._id, {
                paypalOrderId: paypal.orderId,
                paymentMethod: 'paypal'
            });

            log.info('[CREATE_PAYMENT] PayPal order created', {
                requestId: req.requestId,
                orderId,
                paypalOrderId: paypal.orderId,
                duration: `${Date.now() - startTime}ms`
            });

            return res.json({
                type: 'paypal',
                approvalLink: paypal.approvalLink,
                paypalOrderId: paypal.orderId
            });
        }

        if (method === 'ltc') {
            log.info('[CREATE_PAYMENT] LTC payment selected', {
                requestId: req.requestId,
                orderId,
                totalAmount: order.totalAmount
            });

            await Order.findByIdAndUpdate(order._id, {
                paymentMethod: 'ltc',
                paymentStatus: 'pending'
            });
            return res.json({
                type: 'ltc',
                payAddress: getLtcPayAddress(),
                payCurrency: 'ltc',
                qrImageUrl: getLtcQrImageUrl()
            });
        }

        log.warn('[CREATE_PAYMENT] Invalid payment method', { requestId: req.requestId, orderId, method });
        return res.status(400).json({ error: 'Invalid payment method' });
    } catch (err) {
        log.error('[CREATE_PAYMENT] Server error', {
            requestId: req.requestId,
            orderId,
            method,
            error: err?.message || err,
            duration: `${Date.now() - startTime}ms`
        });
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
            paymentStatus: 'paid',
            txnId: summary.txnId || order.txnId || '',
            paidAt: new Date(),
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
            paymentStatus: 'paid',
            txnId: summary.txnId || order.txnId || '',
            paidAt: new Date(),
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
        const orderId = String(req.body?.order_id || '').trim();
        const providerPaymentId = String(req.body?.payment_id || req.body?.purchase_id || '').trim();
        const finalStatuses = new Set(['finished', 'confirmed']);
        if (orderId && finalStatuses.has(paymentStatus)) {
            const payCurrency = String(req.body?.pay_currency || 'ltc').toLowerCase();
            const walletOr = [{ referenceCode: orderId }];
            if (providerPaymentId) {
                walletOr.push({ providerPaymentId }, { txnId: providerPaymentId });
            }
            const walletTopup = await WalletTransaction.findOne({
                type: 'topup',
                method: 'ltc',
                $or: walletOr
            }).lean();
            if (walletTopup) {
                const walletCredit = await creditPendingWalletTopup({
                    filter: {
                        method: 'ltc',
                        $or: walletOr
                    },
                    txnId: providerPaymentId,
                    source: 'nowpayments',
                    adminNotes: `NOWPayments status=${paymentStatus}, currency=${payCurrency}`
                });
                return res.json({
                    received: true,
                    walletCredited: walletCredit.ok,
                    walletStatus: walletCredit.status,
                    referenceCode: walletTopup.referenceCode
                });
            }

            await Order.findOneAndUpdate(
                { orderId },
                {
                    status: 'Completed',
                    paymentStatus: 'paid',
                    txnId: providerPaymentId,
                    paidAt: new Date(),
                    paymentMethod: payCurrency
                }
            );
        }

        return res.json({ received: true });
    } catch (err) {
        console.error('NOWPayments webhook error:', err);
        return res.status(500).json({ error: 'Webhook error' });
    }
});

router.post('/webhook/square', async (req, res) => {
    try {
        const signature = req.headers['x-square-hmacsha256-signature'];
        const notificationUrl = normalizeEnvValue(process.env.SQUARE_WEBHOOK_URL)
            || `${getBackendBaseUrl()}/api/shop/webhook/square`;
        if (!normalizeEnvValue(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)) {
            return res.status(503).json({ error: 'Square webhook is disabled (missing SQUARE_WEBHOOK_SIGNATURE_KEY)' });
        }
        if (!verifySquareWebhookSignature({
            rawBody: req.rawBody || '',
            signature,
            notificationUrl
        })) {
            return res.status(401).json({ error: 'Invalid Square webhook signature' });
        }

        const eventType = String(req.body?.type || '').trim();
        const payment = req.body?.data?.object?.payment || null;
        if (!payment?.id) {
            return res.json({ received: true, ignored: true, eventType });
        }

        const paymentStatus = String(payment?.status || '').trim().toLowerCase();
        if (paymentStatus !== 'completed') {
            return res.json({ received: true, ignored: true, eventType, paymentStatus });
        }

        const creditResult = await creditSquareWalletPayment({
            payment,
            source: 'square_webhook'
        });

        return res.json({
            received: true,
            walletCredited: creditResult.ok,
            walletStatus: creditResult.status,
            referenceCode: creditResult.transaction?.referenceCode || payment.reference_id || ''
        });
    } catch (error) {
        console.error('Square webhook error:', error);
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

const toDeliverySlotPayload = (slot, timezone = '') => {
    const customerTimezone = String(timezone || '').trim() || String(slot?.ownerTimezone || 'UTC');
    return {
        id: String(slot?._id || ''),
        ownerTimezone: String(slot?.ownerTimezone || ''),
        customerTimezone,
        startAt: slot?.startAt || null,
        endAt: slot?.endAt || null,
        ownerStartText: formatDateInTimezone(slot?.startAt, slot?.ownerTimezone),
        ownerEndText: formatDateInTimezone(slot?.endAt, slot?.ownerTimezone),
        customerStartText: formatDateInTimezone(slot?.startAt, customerTimezone),
        customerEndText: formatDateInTimezone(slot?.endAt, customerTimezone),
        note: String(slot?.note || '')
    };
};

const formatDateInTimezone = (value, timezone) => {
    if (!value) return '';
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: String(timezone || 'UTC'),
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(new Date(value));
    } catch {
        return new Date(value).toISOString();
    }
};

const buildConfirmCouponCode = (orderId) => {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    return normalizeCouponCode(`NOS5-${String(orderId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6)}-${suffix}`);
};

/**
 * Parse a local date+time string as a UTC Date using a named IANA timezone.
 * The `dateStr` is in YYYY-MM-DD format; `timeStr` is HH:MM (24-hour).
 * Returns a Date representing that local moment in time (UTC milliseconds).
 */
const parseLocalDateTimeInZone = (dateStr, timeStr, timezone) => {
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hour, minute] = timeStr.split(':').map(Number);
        const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);

        // Get the offset by formatting a reference moment in both UTC and target timezone
        const ref = new Date(Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 12, 0, 0));
        const utcStr = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false })
            .format(ref);
        const tzStr = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
            .format(ref);
        const utcMinutes = Number(utcStr.split(':')[0]) * 60 + Number(utcStr.split(':')[1]);
        const tzMinutes = Number(tzStr.split(':')[0]) * 60 + Number(tzStr.split(':')[1]);
        const offsetMinutes = tzMinutes - utcMinutes;

        return new Date(localDate.getTime() - offsetMinutes * 60 * 1000);
    } catch {
        return new Date(`${dateStr}T${timeStr}`);
    }
};

router.get('/roblox/search', async (req, res) => {
    try {
        const username = String(req.query?.username || '').trim();
        if (!username || username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Roblox username must be 3-20 characters.' });
        }

        const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
            usernames: [username],
            excludeBannedUsers: false
        }, { timeout: 10000 });
        const found = Array.isArray(response.data?.data) ? response.data.data[0] : null;
        if (!found?.id) return res.status(404).json({ error: 'Roblox user not found.' });

        return res.json({
            robloxUserId: String(found.id),
            robloxUsername: String(found.name || username),
            robloxDisplayName: String(found.displayName || found.name || username)
        });
    } catch (error) {
        console.error('Roblox search error:', error?.message || error);
        return res.status(500).json({ error: 'Could not search Roblox right now.' });
    }
});

router.post('/orders/:orderId/link-roblox', authRequired, async (req, res) => {
    try {
        const orderId = String(req.params?.orderId || '').trim();
        const discordId = String(req.user?.discordId || '').trim();
        const robloxUserId = String(req.body?.robloxUserId || '').trim();
        const robloxUsername = String(req.body?.robloxUsername || '').trim();
        const robloxDisplayName = String(req.body?.robloxDisplayName || '').trim();
        if (!orderId || !discordId || !robloxUserId || !robloxUsername) {
            return res.status(400).json({ error: 'Missing Roblox account information.' });
        }

        const { order, status, error } = await getOwnedOrder(orderId, discordId);
        if (!order) return res.status(status).json({ error });
        if (order.paymentStatus !== 'paid' && order.status !== 'Completed') {
            return res.status(402).json({ error: 'Payment must be confirmed before linking Roblox.' });
        }

        const dbUser = await User.findOne({ discordId }).lean();
        order.discordId = discordId;
        order.discordUsername = dbUser?.discordUsername || order.discordUsername || '';
        order.robloxUserId = robloxUserId;
        order.robloxUsername = robloxUsername;
        order.robloxDisplayName = robloxDisplayName;
        order.robloxVerifiedAt = new Date();
        await order.save();

        return res.json({ success: true, order });
    } catch (error) {
        console.error('Link Roblox error:', error);
        return res.status(500).json({ error: 'Could not link Roblox account.' });
    }
});

router.get('/delivery-slots', async (req, res) => {
    try {
        const timezone = String(req.query?.timezone || 'UTC').trim();
        const slots = await DeliverySlot.find({
            active: true,
            endAt: { $gte: new Date() }
        }).sort({ startAt: 1 }).limit(100).lean();
        return res.json({ slots: slots.map((slot) => toDeliverySlotPayload(slot, timezone)) });
    } catch (error) {
        console.error('Delivery slots fetch error:', error);
        return res.status(500).json({ error: 'Could not load delivery slots.' });
    }
});

router.post('/delivery-slots', authRequired, async (req, res) => {
    try {
        const ownerDiscordId = String(req.user?.discordId || '').trim();
        if (!ownerDiscordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(ownerDiscordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const ownerTimezone = String(req.body?.ownerTimezone || 'UTC').trim();
        const startAt = new Date(req.body?.startAt);
        const endAt = new Date(req.body?.endAt);
        const note = String(req.body?.note || '').trim().slice(0, 500);
        if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
            return res.status(400).json({ error: 'Invalid delivery slot time range.' });
        }

        const slot = await DeliverySlot.create({
            ownerDiscordId,
            ownerTimezone,
            startAt,
            endAt,
            note
        });
        return res.json({ success: true, slot: toDeliverySlotPayload(slot, ownerTimezone) });
    } catch (error) {
        console.error('Create delivery slot error:', error);
        return res.status(500).json({ error: 'Could not create delivery slot.' });
    }
});

router.post('/orders/:orderId/delivery-slot', authRequired, async (req, res) => {
    try {
        const orderId = String(req.params?.orderId || '').trim();
        const discordId = String(req.user?.discordId || '').trim();
        const slotId = String(req.body?.slotId || '').trim();
        const customerTimezone = String(req.body?.customerTimezone || 'UTC').trim();
        if (!OBJECT_ID_PATTERN.test(slotId)) return res.status(400).json({ error: 'Invalid delivery slot.' });

        const { order, status, error } = await getOwnedOrder(orderId, discordId);
        if (!order) return res.status(status).json({ error });
        if (order.paymentStatus !== 'paid' && order.status !== 'Completed') {
            return res.status(402).json({ error: 'Payment must be confirmed before selecting delivery time.' });
        }

        const slot = await DeliverySlot.findOne({ _id: slotId, active: true });
        if (!slot) return res.status(404).json({ error: 'Delivery slot not found.' });

        order.deliverySlotId = slot._id;
        order.deliveryOwnerTimezone = slot.ownerTimezone;
        order.deliveryOwnerStartAt = slot.startAt;
        order.deliveryOwnerEndAt = slot.endAt;
        order.deliveryCustomerTimezone = customerTimezone;
        order.deliveryCustomerStartAt = slot.startAt;
        order.deliveryCustomerEndAt = slot.endAt;
        await order.save();

        return res.json({ success: true, slot: toDeliverySlotPayload(slot, customerTimezone) });
    } catch (error) {
        console.error('Select delivery slot error:', error);
        return res.status(500).json({ error: 'Could not select delivery slot.' });
    }
});

router.post('/orders/:orderId/confirm-delivery', authRequired, async (req, res) => {
    try {
        const orderId = String(req.params?.orderId || '').trim();
        const discordId = String(req.user?.discordId || '').trim();
        const { order, status, error } = await getOwnedOrder(orderId, discordId);
        if (!order) return res.status(status).json({ error });
        if (!order.deliveredAt) {
            return res.status(409).json({ error: 'Delivery has not been marked as delivered yet.' });
        }
        if (!order.confirmedAt) {
            order.confirmedAt = new Date();
            order.confirmIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
            order.confirmUa = String(req.headers['user-agent'] || '').slice(0, 500);
            order.confirmationDiscountCode = order.confirmationDiscountCode || buildConfirmCouponCode(order.orderId);
            await order.save();
        }
        return res.json({
            success: true,
            couponCode: order.confirmationDiscountCode,
            discountPercent: 5,
            confirmedAt: order.confirmedAt
        });
    } catch (error) {
        console.error('Confirm delivery error:', error);
        return res.status(500).json({ error: 'Could not confirm delivery.' });
    }
});

router.get('/owner/confirmed-orders', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
        const orders = await Order.find({ confirmedAt: { $ne: null } }).sort({ confirmedAt: -1 }).limit(200).lean();
        return res.json(orders.map((order) => ({
            orderId: order.orderId,
            paidAt: order.paidAt,
            deliveredAt: order.deliveredAt,
            confirmedAt: order.confirmedAt,
            confirmIp: order.confirmIp || '',
            confirmUa: order.confirmUa || '',
            robloxUserId: order.robloxUserId || '',
            robloxUsername: order.robloxUsername || '',
            discordId: order.discordId || '',
            discordUsername: order.discordUsername || '',
            totalAmount: order.totalAmount,
            items: order.items || [],
            couponCode: order.confirmationDiscountCode || '',
            paymentMethod: order.paymentMethod || '',
            txnId: order.txnId || ''
        })));
    } catch (error) {
        console.error('Confirmed orders owner error:', error);
        return res.status(500).json({ error: 'Could not load confirmed orders.' });
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
        const instructions = await ensurePayPalFfInstructions(order);

        if (isPanelTicketMode()) {
            await Order.findByIdAndUpdate(order._id, { paymentMethod: 'paypal_ff' });
            return res.json({
                mode: 'panel',
                panelUrl: getTicketPanelUrl(),
                orderId: order.orderId,
                email: instructions?.paypalEmail || process.env.PAYPAL_EMAIL || '',
                memoExpected: instructions?.memoExpected || buildMemoExpected(order)
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
                email: instructions?.paypalEmail || process.env.PAYPAL_EMAIL || '',
                memoExpected: instructions?.memoExpected || buildMemoExpected(order)
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
                    email: instructions?.paypalEmail || process.env.PAYPAL_EMAIL || '',
                    memoExpected: instructions?.memoExpected || buildMemoExpected(order)
                });
            }

            if (normalizePayPalTicketStatus(fresh?.paypalTicketStatus) === 'creating') {
                return res.status(409).json({
                    ...buildInProgressPayload(
                        fresh?.paypalTicketLockUntil,
                        'PayPal ticket is already being created. Please wait a moment.',
                        'PAYPAL_TICKET_CREATION_IN_PROGRESS'
                    ),
                    email: instructions?.paypalEmail || process.env.PAYPAL_EMAIL || '',
                    memoExpected: instructions?.memoExpected || buildMemoExpected(order)
                });
            }

            return res.status(409).json({
                error: 'PayPal ticket cannot be created right now. Please retry shortly.',
                code: 'PAYPAL_TICKET_NOT_READY',
                email: instructions?.paypalEmail || process.env.PAYPAL_EMAIL || '',
                memoExpected: instructions?.memoExpected || buildMemoExpected(order)
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
                    email: instructions?.paypalEmail || process.env.PAYPAL_EMAIL || '',
                    memoExpected: instructions?.memoExpected || buildMemoExpected(order)
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
            email: instructions?.paypalEmail || process.env.PAYPAL_EMAIL || '',
            memoExpected: instructions?.memoExpected || buildMemoExpected(order)
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
        if (order.paymentStatus !== 'paid' && order.status !== 'Completed') {
            return res.status(402).json({ error: 'Payment must be confirmed before creating a ticket.' });
        }
        if (!order.discordId) {
            const dbUser = await User.findOne({ discordId: req.user.discordId }).lean();
            order.discordId = req.user.discordId;
            order.discordUsername = dbUser?.discordUsername || req.user.discordUsername || '';
            await order.save();
        }
        if (!order.robloxUserId || !order.robloxUsername) {
            return res.status(409).json({ error: 'Link your Roblox account before creating a ticket.', code: 'ROBLOX_LINK_REQUIRED' });
        }
        if (!order.deliverySlotId || !order.deliveryCustomerStartAt || !order.deliveryCustomerEndAt) {
            return res.status(409).json({ error: 'Select a delivery time before creating a ticket.', code: 'DELIVERY_SLOT_REQUIRED' });
        }

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
                    paymentMethod: 'cashapp',
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
                        paymentMethod: 'cashapp',
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
            customerEmail: order.customerEmail || '',
            discordId: order.discordId,
            discordUsername: order.discordUsername,
            totalAmount: order.totalAmount,
            paymentMethod: order.paymentMethod || '-',
            paymentStatus: order.paymentStatus || (order.status === 'Completed' ? 'paid' : 'pending'),
            memoExpected: order.memoExpected || '',
            txnId: order.txnId || '',
            status: order.status,
            ticketStatus: order.ticketStatus || '',
            channelId: order.channelId || '',
            isPaid: order.status === 'Completed' || order.paymentStatus === 'paid',
            items: order.items,
            createdAt: order.createdAt
        })));
    } catch (err) {
        console.error('Orders error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// ─── Product image library ────────────────────────────────────────────────────
router.get('/owner/product-images', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const uploadsDirFiles = await fs.promises.readdir(PRODUCT_IMAGE_DIR).catch(() => []);
        const publicDir = path.resolve(__dirname, '../../client/public/products');
        const publicDirFiles = await fs.promises.readdir(publicDir).catch(() => []);

        const merged = Array.from(new Set([...uploadsDirFiles, ...publicDirFiles]))
            .filter((f) => {
                const ext = path.extname(f).toLowerCase();
                return PRODUCT_IMAGE_EXTENSIONS.includes(ext);
            })
            .map((filename) => ({ filename }));

        return res.json({ images: merged });
    } catch (error) {
        console.error('List product images error:', error);
        return res.status(500).json({ error: 'Could not list product images.' });
    }
});

router.post('/owner/product-images/upload', authRequired, uploadProductImage.single('image'), async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });

        // Upload to imgbb; fall back to local disk path if it fails
        const imgbbUrl = await uploadToImgbb(req.file.buffer, req.file.originalname);
        const imageUrl = imgbbUrl || `/products/${req.file.filename}`;

        return res.json({ filename: imageUrl });
    } catch (error) {
        console.error('Upload product image error:', error);
        return res.status(500).json({ error: 'Could not upload product image.' });
    }
});

// ─── Owner product CRUD ───────────────────────────────────────────────────────
router.get('/owner/products', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const filter = {};
        const category = String(req.query?.category || '').trim();
        if (category) filter.category = category;

        const products = await Product.find(filter).sort({ category: 1, name: 1 }).lean();
        return res.json({ products });
    } catch (error) {
        console.error('Owner products list error:', error);
        return res.status(500).json({ error: 'Could not list products.' });
    }
});

router.post('/owner/products', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const { name, price, originalPriceString, bulkPrice, bulkPriceString, image, desc, category, gameId } = req.body || {};
        if (!name || !String(name).trim()) return res.status(400).json({ error: 'Product name is required.' });
        if (price === undefined || price === null || Number(price) <= 0) return res.status(400).json({ error: 'Valid price is required.' });
        if (!category || !String(category).trim()) return res.status(400).json({ error: 'Category is required.' });
        if (!image || !String(image).trim()) return res.status(400).json({ error: 'Product image is required.' });

        const product = await Product.create({
            name: String(name).trim(),
            price: Number(price),
            originalPriceString: String(originalPriceString || '').trim(),
            bulkPrice: bulkPrice !== undefined && bulkPrice !== null && bulkPrice !== '' ? Number(bulkPrice) : null,
            bulkPriceString: String(bulkPriceString || '').trim(),
            image: String(image).trim(),
            desc: String(desc || '').trim(),
            category: String(category).trim(),
            gameId: gameId ? new (require('mongoose').Types.ObjectId)(String(gameId)) : null
        });
        return res.json({ product });
    } catch (error) {
        console.error('Create product error:', error);
        return res.status(500).json({ error: 'Could not create product.' });
    }
});

router.put('/owner/products/:id', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const { id } = req.params;
        if (!OBJECT_ID_PATTERN.test(id)) return res.status(400).json({ error: 'Invalid product ID.' });

        const product = await Product.findById(id);
        if (!product) return res.status(404).json({ error: 'Product not found.' });

        const { name, price, originalPriceString, bulkPrice, bulkPriceString, image, desc, category, gameId } = req.body || {};
        if (name !== undefined) product.name = String(name).trim();
        if (price !== undefined) {
            if (Number(price) <= 0) return res.status(400).json({ error: 'Price must be greater than 0.' });
            product.price = Number(price);
        }
        if (originalPriceString !== undefined) product.originalPriceString = String(originalPriceString || '').trim();
        if (bulkPrice !== undefined) product.bulkPrice = bulkPrice !== null && bulkPrice !== '' ? Number(bulkPrice) : null;
        if (bulkPriceString !== undefined) product.bulkPriceString = String(bulkPriceString || '').trim();
        if (image !== undefined) product.image = String(image).trim();
        if (desc !== undefined) product.desc = String(desc || '').trim();
        if (category !== undefined) product.category = String(category).trim();
        if (gameId !== undefined) {
            product.gameId = gameId ? new (require('mongoose').Types.ObjectId)(String(gameId)) : null;
        }

        await product.save();
        return res.json({ product });
    } catch (error) {
        console.error('Update product error:', error);
        return res.status(500).json({ error: 'Could not update product.' });
    }
});

router.delete('/owner/products/:id', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const { id } = req.params;
        if (!OBJECT_ID_PATTERN.test(id)) return res.status(400).json({ error: 'Invalid product ID.' });

        const product = await Product.findByIdAndDelete(id);
        if (!product) return res.status(404).json({ error: 'Product not found.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('Delete product error:', error);
        return res.status(500).json({ error: 'Could not delete product.' });
    }
});

// ─── Bulk delivery slots ──────────────────────────────────────────────────────
router.post('/delivery-slots/bulk', authRequired, async (req, res) => {
    try {
        const ownerDiscordId = String(req.user?.discordId || '').trim();
        if (!ownerDiscordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(ownerDiscordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const { ownerTimezone, date, ranges } = req.body || {};
        if (!ownerTimezone || !date || !Array.isArray(ranges) || ranges.length === 0) {
            return res.status(400).json({ error: 'ownerTimezone, date, and ranges are required.' });
        }

        const dateStr = String(date).trim();
        const tz = String(ownerTimezone).trim();
        const created = [];
        for (const range of ranges) {
            const { startTime, endTime, note } = range || {};
            if (!startTime || !endTime) continue;

            const startAt = parseLocalDateTimeInZone(dateStr, startTime, tz);
            const endAt = parseLocalDateTimeInZone(dateStr, endTime, tz);
            if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) continue;

            const slot = await DeliverySlot.create({
                ownerDiscordId,
                ownerTimezone: tz,
                startAt,
                endAt,
                note: String(note || '').trim().slice(0, 500)
            });
            created.push(toDeliverySlotPayload(slot, tz));
        }

        return res.json({ slots: created });
    } catch (error) {
        console.error('Bulk create delivery slots error:', error);
        return res.status(500).json({ error: 'Could not create delivery slots.' });
    }
});

router.get('/delivery-slots/manage', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const slots = await DeliverySlot.find({})
            .sort({ startAt: -1 })
            .limit(200)
            .lean();

        return res.json({ slots });
    } catch (error) {
        console.error('Manage delivery slots error:', error);
        return res.status(500).json({ error: 'Could not load delivery slots.' });
    }
});

router.patch('/delivery-slots/:id', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const { id } = req.params;
        if (!OBJECT_ID_PATTERN.test(id)) return res.status(400).json({ error: 'Invalid slot ID.' });

        const slot = await DeliverySlot.findById(id);
        if (!slot) return res.status(404).json({ error: 'Delivery slot not found.' });

        if (req.body.active !== undefined) slot.active = Boolean(req.body.active);
        if (req.body.note !== undefined) slot.note = String(req.body.note || '').trim().slice(0, 500);
        await slot.save();

        return res.json({ slot: toDeliverySlotPayload(slot, slot.ownerTimezone) });
    } catch (error) {
        console.error('Update delivery slot error:', error);
        return res.status(500).json({ error: 'Could not update delivery slot.' });
    }
});

router.delete('/delivery-slots/:id', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

        const { id } = req.params;
        if (!OBJECT_ID_PATTERN.test(id)) return res.status(400).json({ error: 'Invalid slot ID.' });

        const slot = await DeliverySlot.findById(id);
        if (!slot) return res.status(404).json({ error: 'Delivery slot not found.' });

        // Only allow deletion if no orders are linked to this slot
        const hasOrders = await Order.findOne({ deliverySlotId: slot._id });
        if (hasOrders) return res.status(409).json({ error: 'Cannot delete a slot with linked orders. Deactivate it instead.' });

        await DeliverySlot.findByIdAndDelete(id);
        return res.json({ success: true });
    } catch (error) {
        console.error('Delete delivery slot error:', error);
        return res.status(500).json({ error: 'Could not delete delivery slot.' });
    }
});

module.exports = router;

// ─── BANNER IMAGE CONFIG ───────────────────────────────────────────────────────
const BANNER_DIR = path.resolve(process.env.BANNER_IMAGE_DIR || './uploads/banners');
try { fs.mkdirSync(BANNER_DIR, { recursive: true }); } catch (_) {}
const bannerStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, BANNER_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
        cb(null, `${base}_${Date.now()}${ext}`);
    }
});
const bannerUpload = multer({
    storage: bannerStorage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) cb(null, true);
        else cb(new Error('Only image files are allowed.'), false);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

// ─── MASKED USERNAME HELPER ────────────────────────────────────────────────────
const maskUsername = (username) => {
    const raw = String(username || '').trim();
    if (!raw || raw.length <= 2) return raw + '***';
    return raw[0] + '*'.repeat(Math.min(raw.length - 1, 4));
};

// ─── PUBLIC SHOP ENDPOINTS ────────────────────────────────────────────────────

// GET /api/shop/games — list active games
router.get('/games', async (req, res) => {
    try {
        const games = await Game.find({ active: true }).sort({ name: 1 }).lean();
        return res.json(games);
    } catch (error) {
        console.error('List games error:', error);
        return res.status(500).json({ error: 'Could not list games.' });
    }
});

// GET /api/shop/config — banners + best sellers
router.get('/config', async (req, res) => {
    try {
        const config = await ShopConfig.getConfig();
        return res.json({
            banners: Array.isArray(config.banners) ? config.banners : [],
            bestSellerIds: Array.isArray(config.bestSellerIds) ? config.bestSellerIds : [],
            featuredProductIds: Array.isArray(config.featuredProductIds) ? config.featuredProductIds : []
        });
    } catch (error) {
        console.error('Shop config error:', error);
        return res.status(500).json({ error: 'Could not load shop config.' });
    }
});

// GET /api/shop/recent-purchases — public feed of confirmed orders (masked usernames)
router.get('/recent-purchases', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query?.limit) || 20, 50);
        const orders = await Order.find({ confirmedAt: { $ne: null } })
            .sort({ confirmedAt: -1 }).limit(limit).lean();
        return res.json(orders.map((o) => ({
            username: maskUsername(o.discordUsername || o.discordId || ''),
            productName: Array.isArray(o.items) && o.items[0]?.name ? o.items[0].name : 'Item'
        })));
    } catch (error) {
        console.error('Recent purchases error:', error);
        return res.status(500).json({ error: 'Could not load recent purchases.' });
    }
});

// ─── ADMIN SHOP ENDPOINTS ──────────────────────────────────────────────────────

// GET /api/shop/owner/games
router.get('/owner/games', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
        const games = await Game.find({}).sort({ name: 1 }).lean();
        return res.json(games);
    } catch (error) {
        console.error('Owner list games error:', error);
        return res.status(500).json({ error: 'Could not list games.' });
    }
});

// POST /api/shop/owner/games
router.post('/owner/games', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
        const { name, slug, image, active } = req.body || {};
        if (!name || !String(name).trim()) return res.status(400).json({ error: 'Game name is required.' });
        if (!slug || !String(slug).trim()) return res.status(400).json({ error: 'Game slug is required.' });
        const game = await Game.create({
            name: String(name).trim(),
            slug: String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            image: String(image || '').trim(),
            active: Boolean(active)
        });
        return res.json(game);
    } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: 'Game name or slug already exists.' });
        console.error('Create game error:', error);
        return res.status(500).json({ error: 'Could not create game.' });
    }
});

// PUT /api/shop/owner/games/:id
router.put('/owner/games/:id', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
        const { id } = req.params;
        if (!OBJECT_ID_PATTERN.test(id)) return res.status(400).json({ error: 'Invalid game ID.' });
        const { name, slug, image, active } = req.body || {};
        const game = await Game.findByIdAndUpdate(id, {
            ...(name !== undefined && { name: String(name).trim() }),
            ...(slug !== undefined && { slug: String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') }),
            ...(image !== undefined && { image: String(image || '').trim() }),
            ...(active !== undefined && { active: Boolean(active) })
        }, { new: true, runValidators: true });
        if (!game) return res.status(404).json({ error: 'Game not found.' });
        return res.json(game);
    } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: 'Game name or slug already exists.' });
        console.error('Update game error:', error);
        return res.status(500).json({ error: 'Could not update game.' });
    }
});

// DELETE /api/shop/owner/games/:id
router.delete('/owner/games/:id', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
        const { id } = req.params;
        if (!OBJECT_ID_PATTERN.test(id)) return res.status(400).json({ error: 'Invalid game ID.' });
        await Game.findByIdAndDelete(id);
        return res.json({ success: true });
    } catch (error) {
        console.error('Delete game error:', error);
        return res.status(500).json({ error: 'Could not delete game.' });
    }
});

// POST /api/shop/owner/config/banners/upload
router.post('/owner/config/banners/upload', authRequired, bannerUpload.single('banner'), async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
        if (!req.file) return res.status(400).json({ error: 'No banner file uploaded.' });

        // Upload to imgbb; fall back to local disk path if it fails
        const imgbbUrl = await uploadToImgbb(req.file.buffer, req.file.originalname);
        const bannerUrl = imgbbUrl || `/products/${req.file.filename}`;

        const config = await ShopConfig.getConfig();
        config.banners.push(bannerUrl);
        await config.save();
        return res.json({ filename: bannerUrl, banners: config.banners });
    } catch (error) {
        console.error('Upload banner error:', error);
        return res.status(500).json({ error: 'Could not upload banner.' });
    }
});

// DELETE /api/shop/owner/config/banners — body: { bannerUrl }
router.delete('/owner/config/banners', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
        const { bannerUrl } = req.body || {};
        if (!bannerUrl) return res.status(400).json({ error: 'bannerUrl is required.' });
        const config = await ShopConfig.getConfig();
        config.banners = config.banners.filter((f) => f !== bannerUrl);
        await config.save();
        // Try to delete local file only if it's a local path
        if (!bannerUrl.startsWith('http')) {
            try { fs.unlinkSync(path.join(BANNER_DIR, bannerUrl)); } catch (_) {}
        }
        return res.json({ success: true, banners: config.banners });
    } catch (error) {
        console.error('Delete banner error:', error);
        return res.status(500).json({ error: 'Could not delete banner.' });
    }
});

// PUT /api/shop/owner/config/best-sellers
router.put('/owner/config/best-sellers', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
        const { bestSellerIds } = req.body || {};
        if (!Array.isArray(bestSellerIds)) return res.status(400).json({ error: 'bestSellerIds must be an array.' });
        const config = await ShopConfig.getConfig();
        config.bestSellerIds = bestSellerIds
            .filter((id) => OBJECT_ID_PATTERN.test(String(id)))
            .map((id) => new (require('mongoose').Types.ObjectId)(String(id)));
        await config.save();
        return res.json({ success: true, bestSellerIds: config.bestSellerIds });
    } catch (error) {
        console.error('Update best sellers error:', error);
        return res.status(500).json({ error: 'Could not update best sellers.' });
    }
});

// PUT /api/shop/owner/config/featured
router.put('/owner/config/featured', authRequired, async (req, res) => {
    try {
        const discordId = String(req.user?.discordId || '').trim();
        if (!discordId) return res.status(401).json({ error: 'Authentication required' });
        const isOwner = await canAccessOwnerEndpoints(discordId);
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
        const { featuredProductIds } = req.body || {};
        if (!Array.isArray(featuredProductIds)) return res.status(400).json({ error: 'featuredProductIds must be an array.' });
        const config = await ShopConfig.getConfig();
        config.featuredProductIds = featuredProductIds
            .filter((id) => OBJECT_ID_PATTERN.test(String(id)))
            .map((id) => new (require('mongoose').Types.ObjectId)(String(id)));
        await config.save();
        return res.json({ success: true, featuredProductIds: config.featuredProductIds });
    } catch (error) {
        console.error('Update featured products error:', error);
        return res.status(500).json({ error: 'Could not update featured products.' });
    }
});
