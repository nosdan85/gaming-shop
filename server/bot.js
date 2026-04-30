const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder
} = require('discord.js');
const axios = require('axios');
const { discordRequest } = require('./utils/discordApi');
const Order = require('./models/Order');
const User = require('./models/User');
const Proof = require('./models/Proof');
const { encryptSecret, decryptSecret } = require('./utils/tokenCrypto');
const { formatDeliveredUnitsLabel } = require('./utils/itemQuantityDisplay');

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const SNOWFLAKE_PATTERN = /^\d{16,22}$/;
const BOT_SELF_CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_CREATE_CHANNEL_MS = 8000;
const TICKET_CREATE_MIN_GAP_MS = (() => {
    const n = Number(process.env.DISCORD_TICKET_CREATE_MIN_GAP_MS);
    if (!Number.isFinite(n) || n < 500) return 3500;
    return Math.floor(n);
})();
const TICKET_CREATE_QUEUE_MAX_COOLDOWN_MS = 2 * 60 * 1000;
const TICKET_CREATE_RETRY_MAX_RETRIES = 2;
const TICKET_CREATE_RETRY_BASE_DELAY_MS = 900;
const TICKET_CREATE_RETRY_MAX_DELAY_MS = 5000;
const MAX_VOUCH_IMAGES_PER_MESSAGE = 10;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 15000;
const ADDALL_CONCURRENCY = (() => {
    const n = Number(process.env.DISCORD_ADDALL_CONCURRENCY);
    if (!Number.isFinite(n)) return 4;
    return Math.max(1, Math.min(12, Math.floor(n)));
})();
const ADDALL_PROGRESS_INTERVAL = (() => {
    const n = Number(process.env.DISCORD_ADDALL_PROGRESS_INTERVAL);
    if (!Number.isFinite(n)) return 100;
    return Math.max(25, Math.min(1000, Math.floor(n)));
})();
const ADDALL_MAX_JOIN_RETRIES = (() => {
    const n = Number(process.env.DISCORD_ADDALL_MAX_JOIN_RETRIES);
    if (!Number.isFinite(n)) return 3;
    return Math.max(1, Math.min(8, Math.floor(n)));
})();
const CLOSE_COMMANDS = new Set(['!close', '/close', '!dong', '/dong']);
const DONE_COMMANDS = new Set(['!done', '/done']);
const READD_ALL_COMMANDS = new Set(['!addall', '/addall', '!readdall', '/readdall']);
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.svg'];

const PERM_VIEW_CHANNEL = 1n << 10n;
const PERM_SEND_MESSAGES = 1n << 11n;
const PERM_EMBED_LINKS = 1n << 14n;
const PERM_ATTACH_FILES = 1n << 15n;
const PERM_READ_MESSAGE_HISTORY = 1n << 16n;
const PERM_ADD_REACTIONS = 1n << 6n;
const PERM_VIEW_CHANNEL_ONLY = String(PERM_VIEW_CHANNEL);
const PERM_TICKET_CHAT = String(
    PERM_VIEW_CHANNEL
    | PERM_SEND_MESSAGES
    | PERM_EMBED_LINKS
    | PERM_ATTACH_FILES
    | PERM_READ_MESSAGE_HISTORY
    | PERM_ADD_REACTIONS
);

let cachedBotSelfId = '';
let cachedBotSelfAt = 0;
let ticketCreateChain = Promise.resolve();
let lastTicketCreateAt = 0;
let ticketCreateBlockedUntilAt = 0;

class DiscordBotError extends Error {
    constructor(message, { status = 500, code = 'DISCORD_BOT_ERROR', data = null, retryAfterSeconds = 0 } = {}) {
        super(message);
        this.name = 'DiscordBotError';
        this.status = status;
        this.code = code;
        this.data = data;
        this.retryAfterSeconds = Number.isFinite(Number(retryAfterSeconds))
            ? Math.max(0, Math.ceil(Number(retryAfterSeconds)))
            : 0;
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

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

const isSnowflake = (value) => SNOWFLAKE_PATTERN.test(String(value || '').trim());
const getPayPalPaymentEmail = () => normalizeEnvValue(process.env.PAYPAL_PAYMENT_EMAIL) || 'nguyenquanghuy111106@gmail.com';
const getCashAppHandle = () => normalizeEnvValue(process.env.CASHAPP_HANDLE) || '$yoko276';
const getLtcPayAddress = () => normalizeEnvValue(process.env.LTC_PAY_ADDRESS) || 'ltc1ququ7e6ryccpnu7jgy0l4vukgc3mventxyulyge';
const getBotToken = () => normalizeEnvValue(process.env.DISCORD_BOT_TOKEN);
const getGuildId = () => normalizeEnvValue(process.env.DISCORD_GUILD_ID);
const getOwnerRoleId = () => normalizeEnvValue(process.env.DISCORD_OWNER_ROLE_ID);
const getTicketCategoryId = () => normalizeEnvValue(process.env.DISCORD_TICKET_CATEGORY_ID);
const getOwnerId = () => normalizeEnvValue(process.env.DISCORD_OWNER_ID);
const getVouchChannelId = () => normalizeEnvValue(process.env.DISCORD_VOUCH_CHANNEL_ID);
const getOauthClientId = () => normalizeEnvValue(process.env.DISCORD_CLIENT_ID);
const getOauthClientSecret = () => normalizeEnvValue(process.env.DISCORD_CLIENT_SECRET);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeRetryAfterSeconds = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n > 1000) return Math.ceil(n / 1000);
    return Math.ceil(n);
};

const runTicketCreateQueued = async (runner) => {
    const run = async () => {
        const elapsed = Date.now() - lastTicketCreateAt;
        const gapWaitMs = Math.max(0, TICKET_CREATE_MIN_GAP_MS - elapsed);
        const cooldownWaitMs = Math.max(0, ticketCreateBlockedUntilAt - Date.now());
        const waitMs = Math.max(gapWaitMs, cooldownWaitMs);
        if (waitMs > 0) {
            await sleep(waitMs);
        }
        try {
            return await runner();
        } finally {
            lastTicketCreateAt = Date.now();
        }
    };

    const queued = ticketCreateChain.then(run, run);
    ticketCreateChain = queued.catch(() => {});
    return queued;
};

const setTicketCreateCooldownSeconds = (seconds) => {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return 0;

    const clampedSeconds = Math.min(
        Math.ceil(TICKET_CREATE_QUEUE_MAX_COOLDOWN_MS / 1000),
        Math.max(1, Math.ceil(n))
    );
    ticketCreateBlockedUntilAt = Math.max(ticketCreateBlockedUntilAt, Date.now() + (clampedSeconds * 1000));
    return clampedSeconds;
};

const truncateText = (value, max = 300) => String(value || '').slice(0, Math.max(0, Number(max) || 0));

const formatDiscordApiMessage = (data) => {
    if (!data) return '';
    if (typeof data === 'string') return truncateText(data, 300);
    return truncateText(
        data.message || data.error || data.error_description || JSON.stringify(data),
        300
    );
};
const isTemporaryCloudflareBlock = (status, data) => {
    if (status !== 403) return false;
    const text = typeof data === 'string' ? data.toLowerCase() : JSON.stringify(data || {}).toLowerCase();
    return (
        text.includes('cloudflare')
        || text.includes('1015')
        || text.includes('temporarily blocked')
        || text.includes('temporarily unavailable')
    );
};

const sanitizeChannelName = (raw, fallbackPrefix = 'ticket') => {
    const text = String(raw || '').trim().toLowerCase();
    const compact = text
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    const safe = compact || `${fallbackPrefix}-${Date.now()}`;
    return safe.slice(0, 90);
};

const formatOrderItems = (items) => {
    const lines = Array.isArray(items)
        ? items.map((item) => {
            const quantity = Math.max(1, Number(item?.quantity) || 1);
            const name = String(item?.name || 'Item').trim();
            return `${formatDeliveredUnitsLabel(name, quantity)} ${name}`;
        })
        : [];
    const joined = lines.join('\n') || '-';
    return truncateText(joined, 1000);
};

const formatOrderItemsWithPrice = (items) => {
    const lines = Array.isArray(items)
        ? items.map((item) => {
            const quantity = Math.max(1, Number(item?.quantity) || 1);
            const name = String(item?.name || 'Item').trim();
            const deliveredLabel = formatDeliveredUnitsLabel(name, quantity);
            const lineTotal = (Math.max(0, Number(item?.price) || 0) * quantity).toFixed(2);
            return `${deliveredLabel} ${name} - $${lineTotal}`;
        })
        : [];
    const joined = lines.join('\n') || '-';
    return truncateText(joined, 1000);
};

const formatOrderItemNamesForNote = (items) => {
    const names = Array.isArray(items)
        ? items
            .map((item) => String(item?.name || '').trim())
            .filter(Boolean)
        : [];
    return truncateText(names.join(', ') || 'Item', 300);
};

const formatPayPalMemoForOrder = (order) => {
    const existingMemo = normalizeEnvValue(order?.memoExpected);
    if (existingMemo) return truncateText(existingMemo, 255);
    const orderCode = String(order?.orderId || '').trim().toUpperCase();
    return truncateText(`NOSMARKET ${orderCode} - ${formatOrderItemNamesForNote(order?.items)}`, 255);
};

const getOrderSequence = (order) => {
    const orderId = String(order?.orderId || '').trim();
    const match = orderId.match(/(\d+)$/);
    if (!match) return Date.now();
    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed) || parsed <= 0) return Date.now();
    return Math.floor(parsed);
};

const assertDiscordConfig = () => {
    const token = getBotToken();
    const guildId = getGuildId();
    if (!token) {
        throw new DiscordBotError('DISCORD_BOT_TOKEN is missing', {
            status: 500,
            code: 'DISCORD_BOT_TOKEN_MISSING'
        });
    }
    if (!isSnowflake(guildId)) {
        throw new DiscordBotError('DISCORD_GUILD_ID is missing or invalid', {
            status: 500,
            code: 'DISCORD_GUILD_ID_INVALID'
        });
    }
};

const toDiscordBotError = (error, { defaultMessage = 'Discord API request failed', defaultCode = 'DISCORD_API_ERROR' } = {}) => {
    if (error instanceof DiscordBotError) return error;

    const statusRaw = Number(error?.response?.status);
    const status = Number.isFinite(statusRaw) && statusRaw > 0 ? statusRaw : 500;
    const data = error?.response?.data || null;
    const apiMessage = formatDiscordApiMessage(data);
    const retryAfterSeconds = Math.max(
        normalizeRetryAfterSeconds(error?.response?.headers?.['retry-after']),
        normalizeRetryAfterSeconds(data?.retry_after),
        normalizeRetryAfterSeconds(data?.retryAfterSeconds)
    );

    if (status === 401) {
        return new DiscordBotError('DISCORD_BOT_TOKEN is invalid', {
            status: 500,
            code: 'DISCORD_BOT_UNAUTHORIZED',
            data
        });
    }
    if (isTemporaryCloudflareBlock(status, data)) {
        return new DiscordBotError('Discord is temporarily rate limited. Please retry shortly.', {
            status: 429,
            code: 'DISCORD_RATE_LIMITED',
            data,
            retryAfterSeconds: Math.max(retryAfterSeconds, 30)
        });
    }
    if (status === 403) {
        return new DiscordBotError(
            apiMessage || 'Bot lacks permission in this Discord server (check roles/permissions).',
            { status: 500, code: 'DISCORD_BOT_FORBIDDEN', data }
        );
    }
    if (status === 404) {
        return new DiscordBotError(apiMessage || 'Discord resource not found', {
            status: 404,
            code: 'DISCORD_NOT_FOUND',
            data
        });
    }
    if (status === 429) {
        console.warn('Discord rate limit hit', {
            bucket: error?.response?.headers?.['x-ratelimit-bucket'] || '',
            remaining: error?.response?.headers?.['x-ratelimit-remaining'] || '',
            resetAfter: error?.response?.headers?.['x-ratelimit-reset-after'] || '',
            scope: error?.response?.headers?.['x-ratelimit-scope'] || '',
            global: error?.response?.headers?.['x-ratelimit-global'] || ''
        });
        return new DiscordBotError('Discord is temporarily rate limited. Please retry shortly.', {
            status: 429,
            code: 'DISCORD_RATE_LIMITED',
            data,
            retryAfterSeconds
        });
    }
    if (status >= 500 && status < 600) {
        return new DiscordBotError('Discord API is temporarily unavailable. Please retry shortly.', {
            status: 503,
            code: 'DISCORD_API_UNAVAILABLE',
            data
        });
    }
    if (status >= 400 && status < 500) {
        return new DiscordBotError(apiMessage || defaultMessage, {
            status,
            code: defaultCode,
            data
        });
    }

    return new DiscordBotError(apiMessage || error?.message || defaultMessage, {
        status: 503,
        code: defaultCode,
        data
    });
};

const botRequest = async ({
    method,
    path,
    data,
    timeout = REQUEST_TIMEOUT_MS,
    retry = true,
    retryOptions = {},
    defaultCode
}) => {
    assertDiscordConfig();
    const token = getBotToken();
    try {
        return await discordRequest({
            method,
            url: `${DISCORD_API_BASE}${path}`,
            data,
            timeout,
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json'
            }
        }, 0, retry
            ? {
                maxRetries: Number.isInteger(retryOptions.maxRetries) ? retryOptions.maxRetries : 2,
                baseDelayMs: Number.isFinite(retryOptions.baseDelayMs) ? retryOptions.baseDelayMs : 800,
                maxDelayMs: Number.isFinite(retryOptions.maxDelayMs) ? retryOptions.maxDelayMs : 10000
            }
            : { noRetry: true }
        );
    } catch (error) {
        throw toDiscordBotError(error, { defaultCode });
    }
};

const getBotSelfId = async () => {
    if (isSnowflake(client?.user?.id)) return client.user.id;
    if (cachedBotSelfId && (Date.now() - cachedBotSelfAt) < BOT_SELF_CACHE_TTL_MS) return cachedBotSelfId;

    const res = await botRequest({
        method: 'get',
        path: '/users/@me',
        timeout: 7000,
        retry: false,
        defaultCode: 'DISCORD_BOT_SELF_LOOKUP_FAILED'
    });
    const selfId = String(res?.data?.id || '').trim();
    if (!isSnowflake(selfId)) {
        throw new DiscordBotError('Failed to resolve bot user id', {
            status: 500,
            code: 'DISCORD_BOT_SELF_INVALID'
        });
    }

    cachedBotSelfId = selfId;
    cachedBotSelfAt = Date.now();
    return selfId;
};

const getGuildMember = async (discordId) => {
    if (!isSnowflake(discordId)) return { ok: false, exists: false, unavailable: false, member: null };

    const guildId = getGuildId();
    try {
        const res = await botRequest({
            method: 'get',
            path: `/guilds/${guildId}/members/${discordId}`,
            timeout: 4000,
            retry: false,
            defaultCode: 'DISCORD_MEMBER_LOOKUP_FAILED'
        });
        return { ok: true, exists: true, unavailable: false, member: res?.data || null };
    } catch (error) {
        if (error instanceof DiscordBotError && error.status === 404) {
            return { ok: true, exists: false, unavailable: false, member: null };
        }
        if (error instanceof DiscordBotError && error.status === 503) {
            return { ok: false, exists: false, unavailable: true, member: null };
        }
        throw error;
    }
};

const checkUserInGuild = async (discordId) => {
    if (!isSnowflake(discordId)) return false;
    try {
        const result = await getGuildMember(discordId);
        if (result.unavailable) return null;
        return result.exists;
    } catch (error) {
        if (error instanceof DiscordBotError && (error.status === 500 || error.status === 503)) {
            return null;
        }
        return null;
    }
};

const checkUserHasOwnerRole = async (discordId) => {
    if (!isSnowflake(discordId)) return false;

    const ownerRoleId = getOwnerRoleId();
    if (!isSnowflake(ownerRoleId)) return false;

    try {
        const result = await getGuildMember(discordId);
        if (!result.exists || !result.member) return false;
        const roleIds = Array.isArray(result.member.roles) ? result.member.roles.map((id) => String(id)) : [];
        return roleIds.includes(ownerRoleId);
    } catch {
        return false;
    }
};

const isImageAttachment = (attachment) => {
    if (!attachment) return false;
    const contentType = String(attachment.contentType || '').toLowerCase();
    if (contentType.startsWith('image/')) return true;

    const fileName = String(attachment.name || attachment.filename || '').toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
};

const getImageAttachments = (message) => {
    if (!message?.attachments || typeof message.attachments.values !== 'function') return [];
    const imageAttachments = [];
    for (const attachment of message.attachments.values()) {
        if (isImageAttachment(attachment)) imageAttachments.push(attachment);
    }
    return imageAttachments;
};

const findOrderByTicketChannelId = async (channelId) => {
    if (!isSnowflake(channelId)) return null;
    return Order.findOne({
        $or: [
            { channelId },
            { paypalTicketChannelId: channelId },
            { ltcTicketChannelId: channelId }
        ]
    }).sort({ createdAt: -1 });
};

const findOrderByTicketChannelName = async (channelNameRaw) => {
    const channelName = String(channelNameRaw || '').trim().toLowerCase();
    if (!channelName) return null;

    return Order.findOne({
        $or: [
            { orderId: channelName },
            { paypalTicketChannel: channelName },
            { ltcTicketChannel: channelName }
        ]
    }).sort({ createdAt: -1 });
};

const findOrderByTicketChannel = async (message) => {
    const channelId = String(message?.channelId || '').trim();
    const byId = await findOrderByTicketChannelId(channelId);
    if (byId) return byId;

    const channelName = String(message?.channel?.name || '').trim();
    if (!channelName) return null;
    return findOrderByTicketChannelName(channelName);
};

const isConfiguredTicketCategoryChannel = (message) => {
    const ticketCategoryId = getTicketCategoryId();
    if (!isSnowflake(ticketCategoryId)) return false;
    const parentId = String(message?.channel?.parentId || '').trim();
    return parentId === ticketCategoryId;
};

const isTicketOwnerOrStaff = async (discordId, order) => {
    const userId = String(discordId || '').trim();
    if (!isSnowflake(userId)) return false;

    if (String(order?.discordId || '') === userId) {
        return true;
    }

    const ownerId = getOwnerId();
    if (ownerId && ownerId === userId) {
        return true;
    }

    return checkUserHasOwnerRole(userId);
};

const isStaffUser = async (discordId) => {
    const userId = String(discordId || '').trim();
    if (!isSnowflake(userId)) return false;

    const ownerId = getOwnerId();
    if (ownerId && ownerId === userId) {
        return true;
    }

    return checkUserHasOwnerRole(userId);
};

const formatPurchasedItemsForDm = (items) => {
    if (!Array.isArray(items) || items.length === 0) return 'Unknown item';
    return items
        .map((item) => {
            const quantity = Math.max(1, Number(item?.quantity) || 1);
            const name = String(item?.name || 'Unknown item').trim();
            return `${formatDeliveredUnitsLabel(name, quantity)} ${name}`;
        })
        .join(', ')
        .slice(0, 800);
};

const buildPurchaseThankYouDm = (order) => {
    const purchasedItems = formatPurchasedItemsForDm(order?.items);
    return [
        '**✨ Thank You for Your Purchase ✨**',
        '',
        'We sincerely appreciate your order and the trust you have placed in our service. It was a pleasure serving you, and we hope that you are completely satisfied with your purchase.',
        '',
        `**📦 Purchased Item:** [${purchasedItems}]`,
        '',
        'If you require any additional items in the future, please feel free to contact us at any time. We would be delighted to assist you again and continue providing you with reliable service.',
        '',
        '**💎 Thank you once again for your support and trust.**',
        '',
        '**— Nos Team**'
    ].join('\n');
};

const sendPurchaseThankYouDm = async (order) => {
    const userId = String(order?.discordId || '').trim();
    if (!isSnowflake(userId)) return false;

    const user = await client.users.fetch(userId, { force: true });
    if (!user) return false;
    await user.send(buildPurchaseThankYouDm(order));
    return true;
};

const refreshDiscordAccessToken = async (refreshToken) => {
    const safeRefreshToken = String(refreshToken || '').trim();
    const clientId = getOauthClientId();
    const clientSecret = getOauthClientSecret();
    if (!safeRefreshToken || !clientId || !clientSecret) return null;

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: safeRefreshToken
    });

    const res = await discordRequest({
        method: 'post',
        url: 'https://discord.com/api/oauth2/token',
        timeout: 12000,
        data: body.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, 0, { noRetry: true });

    return res?.data || null;
};

const getUsableUserAccessToken = async (dbUser) => {
    if (!dbUser) return '';

    const now = Date.now();
    const accessToken = decryptSecret(dbUser.accessToken);
    const refreshToken = decryptSecret(dbUser.refreshToken);
    const tokenExpiresAtMs = new Date(dbUser.tokenExpiresAt || 0).getTime();

    if (accessToken && (!Number.isFinite(tokenExpiresAtMs) || tokenExpiresAtMs > now + 60 * 1000)) {
        return accessToken;
    }

    if (!refreshToken) return '';

    try {
        const refreshed = await refreshDiscordAccessToken(refreshToken);
        const nextAccessToken = String(refreshed?.access_token || '').trim();
        if (!nextAccessToken) return '';

        const nextRefreshToken = String(refreshed?.refresh_token || '').trim();
        const expiresIn = Number(refreshed?.expires_in);
        const scopes = String(refreshed?.scope || '')
            .split(' ')
            .map((value) => value.trim())
            .filter(Boolean);

        dbUser.accessToken = encryptSecret(nextAccessToken);
        if (nextRefreshToken) {
            dbUser.refreshToken = encryptSecret(nextRefreshToken);
        }
        if (Number.isFinite(expiresIn) && expiresIn > 0) {
            dbUser.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
        }
        if (scopes.length > 0) {
            dbUser.scopes = scopes;
        }
        await dbUser.save();
        return nextAccessToken;
    } catch (error) {
        console.warn(`Refresh token failed for user ${dbUser.discordId || 'unknown'}:`, error?.response?.status || error?.message || error);
        return '';
    }
};

const addMemberToGuild = async ({ guildId, discordId, accessToken }) => {
    if (!isSnowflake(guildId) || !isSnowflake(discordId) || !accessToken) {
        throw new DiscordBotError('Missing guild/user/access token for guild join', {
            status: 400,
            code: 'DISCORD_JOIN_INPUT_INVALID'
        });
    }

    return botRequest({
        method: 'put',
        path: `/guilds/${guildId}/members/${discordId}`,
        data: { access_token: accessToken },
        timeout: REQUEST_TIMEOUT_MS,
        retry: false,
        defaultCode: 'DISCORD_GUILD_JOIN_FAILED'
    });
};

const formatLinkedUserLine = (dbUser, index) => {
    const orderNo = String(index + 1).padStart(5, '0');
    const discordId = String(dbUser?.discordId || '').trim();
    const discordUsername = String(dbUser?.discordUsername || '').trim() || 'Unknown User';
    return `${orderNo}. ${discordUsername} (${discordId || 'missing-id'})`;
};

const getLinkedUsersSnapshot = async () => {
    const users = await User.find({
        discordId: { $exists: true, $ne: '' }
    })
        .select('discordId discordUsername')
        .sort({ discordUsername: 1, discordId: 1 })
        .lean();

    return Array.isArray(users)
        ? users.filter((item) => String(item?.discordId || '').trim())
        : [];
};

const buildLinkedUsersListText = (users) => {
    const rows = Array.isArray(users)
        ? users.map((item, index) => formatLinkedUserLine(item, index))
        : [];
    const body = rows.join('\n') || 'No linked users found.';
    return `Linked users (${rows.length})\n\n${body}`;
};

const reAddLinkedUsersToGuild = async ({ targetGuildId, totalLinkedHint = 0, onProgress = null } = {}) => {
    const guildId = String(targetGuildId || '').trim() || getGuildId();
    if (!isSnowflake(guildId)) {
        throw new DiscordBotError('DISCORD_GUILD_ID is missing or invalid', {
            status: 500,
            code: 'DISCORD_GUILD_ID_INVALID'
        });
    }

    const baseFilter = { discordId: { $exists: true, $ne: '' } };
    const totalLinked = Number(totalLinkedHint) > 0
        ? Math.floor(Number(totalLinkedHint))
        : await User.countDocuments(baseFilter);

    const cursor = User.find(baseFilter)
        .select('discordId discordUsername accessToken refreshToken tokenExpiresAt scopes')
        .cursor();

    const summary = {
        totalLinked,
        added: 0,
        alreadyInGuild: 0,
        skippedNoToken: 0,
        failed: 0,
        processed: 0
    };

    const notifyProgress = async (force = false) => {
        if (typeof onProgress !== 'function') return;
        if (!force && summary.processed > 0 && (summary.processed % ADDALL_PROGRESS_INTERVAL !== 0)) return;
        try {
            await onProgress({ ...summary });
        } catch {
            // Ignore progress callback errors.
        }
    };

    const processOneUser = async (dbUser) => {
        const discordId = String(dbUser?.discordId || '').trim();
        if (!isSnowflake(discordId)) {
            summary.failed += 1;
            summary.processed += 1;
            await notifyProgress();
            return;
        }

        const accessToken = await getUsableUserAccessToken(dbUser);
        if (!accessToken) {
            summary.skippedNoToken += 1;
            summary.processed += 1;
            await notifyProgress();
            return;
        }

        let joined = false;
        for (let attempt = 1; attempt <= ADDALL_MAX_JOIN_RETRIES; attempt += 1) {
            try {
                const res = await addMemberToGuild({ guildId, discordId, accessToken });
                const status = Number(res?.status || 0);
                if (status === 204) {
                    summary.alreadyInGuild += 1;
                } else {
                    summary.added += 1;
                }
                joined = true;
                break;
            } catch (error) {
                if (error instanceof DiscordBotError && error.status === 429 && attempt < ADDALL_MAX_JOIN_RETRIES) {
                    const waitMs = Math.max(1000, (Number(error.retryAfterSeconds) || 1) * 1000);
                    await sleep(waitMs);
                    continue;
                }
                if (
                    error instanceof DiscordBotError
                    && (error.status === 500 || error.status === 503)
                    && attempt < ADDALL_MAX_JOIN_RETRIES
                ) {
                    const waitMs = Math.min(8000, 600 * attempt);
                    await sleep(waitMs);
                    continue;
                }
                break;
            }
        }

        if (!joined) {
            summary.failed += 1;
        }

        summary.processed += 1;
        await notifyProgress();
    };

    const activeTasks = new Set();
    for await (const dbUser of cursor) {
        const task = processOneUser(dbUser)
            .catch(() => {
                summary.failed += 1;
                summary.processed += 1;
            })
            .finally(() => {
                activeTasks.delete(task);
            });

        activeTasks.add(task);
        if (activeTasks.size >= ADDALL_CONCURRENCY) {
            await Promise.race(activeTasks);
        }
    }

    await Promise.all(Array.from(activeTasks));
    await notifyProgress(true);

    return summary;
};

const formatVouchItems = (items) => {
    if (!Array.isArray(items) || items.length === 0) return '**1X UNKNOWN ITEM**';
    return items
        .map((item) => {
            const quantity = Math.max(1, Number(item?.quantity) || 1);
            const name = String(item?.name || 'UNKNOWN ITEM').trim().toUpperCase();
            const deliveredLabel = formatDeliveredUnitsLabel(name, quantity).toUpperCase();
            return `**${deliveredLabel} ${name}**`;
        })
        .join('\n')
        .slice(0, 1500);
};

const buildVouchContent = (order) => {
    const mention = `<@${order?.discordId || ''}>`;
    const itemsText = formatVouchItems(order?.items);
    const enjoyText = formatPurchasedItemsForDm(order?.items);
    return truncateText(`${mention}\n${itemsText}\nEnjoy your ${enjoyText}\nPlease leave us a vouch \u2764\uFE0F`, 1900);
};

const buildProofItems = (items) => {
    if (!Array.isArray(items)) return [];
    return items
        .map((item) => {
            const name = String(item?.name || '').trim();
            if (!name) return null;
            const packQuantity = Math.max(1, Number(item?.quantity) || 1);
            const deliveredLabel = formatDeliveredUnitsLabel(name, packQuantity);
            const lineTotal = Math.max(0, Number(item?.price) || 0) * packQuantity;
            return {
                name,
                packQuantity,
                deliveredLabel,
                lineTotal: Number.isFinite(lineTotal) ? Number(lineTotal.toFixed(2)) : 0
            };
        })
        .filter(Boolean);
};

const saveProofRecord = async ({ order, imageUrls, vouchMessageIds = [] }) => {
    const images = Array.from(new Set((Array.isArray(imageUrls) ? imageUrls : []).filter(Boolean)));
    if (!order || images.length === 0) return;
    const payload = {
        orderId: String(order?.orderId || ''),
        discordId: String(order?.discordId || ''),
        discordUsername: String(order?.discordUsername || ''),
        totalAmount: Number(order?.totalAmount || 0),
        items: buildProofItems(order?.items),
        imageUrls: images,
        vouchMessageIds: Array.from(new Set((Array.isArray(vouchMessageIds) ? vouchMessageIds : []).filter(Boolean))),
        source: 'auto_vouch'
    };

    const normalizeUrl = (value) => String(value || '').trim();
    const sameImageSet = (left, right) => {
        const a = new Set((Array.isArray(left) ? left : []).map(normalizeUrl).filter(Boolean));
        const b = new Set((Array.isArray(right) ? right : []).map(normalizeUrl).filter(Boolean));
        if (a.size !== b.size) return false;
        for (const url of a) {
            if (!b.has(url)) return false;
        }
        return true;
    };

    const latestForOrder = await Proof.findOne({ orderId: payload.orderId })
        .sort({ createdAt: -1 })
        .select('_id createdAt imageUrls')
        .lean();

    if (latestForOrder && sameImageSet(latestForOrder.imageUrls, payload.imageUrls)) {
        await Proof.updateOne(
            { _id: latestForOrder._id },
            {
                $set: {
                    ...payload,
                    createdAt: latestForOrder.createdAt || new Date()
                }
            }
        );
        return;
    }

    await Proof.create(payload);
};

const sendAutoVouchFromTicketImages = async ({ order, imageUrls }) => {
    const vouchChannelId = getVouchChannelId();
    const uniqueImageUrls = Array.from(
        new Set(
            (Array.isArray(imageUrls) ? imageUrls : [])
                .map((url) => String(url || '').trim())
                .filter(Boolean)
        )
    );
    if (!isSnowflake(vouchChannelId) || uniqueImageUrls.length === 0) return false;

    const getImageExtFromUrl = (url) => {
        try {
            const pathname = String(new URL(String(url || '')).pathname || '').toLowerCase();
            const matched = IMAGE_EXTENSIONS.find((ext) => pathname.endsWith(ext));
            if (matched) return matched;
        } catch {
            // Ignore URL parse errors.
        }
        return '.png';
    };

    const downloadImageBuffer = async (url) => {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
            validateStatus: (status) => Number(status) >= 200 && Number(status) < 300
        });
        return Buffer.from(res.data);
    };

    const channel = await client.channels.fetch(vouchChannelId, { force: true });
    if (!channel || typeof channel.send !== 'function') {
        return false;
    }

    const sentMessageIds = [];
    const uploadedImageUrls = [];
    let didSendHeaderContent = false;
    for (let index = 0; index < uniqueImageUrls.length; index += MAX_VOUCH_IMAGES_PER_MESSAGE) {
        const imageBatch = uniqueImageUrls.slice(index, index + MAX_VOUCH_IMAGES_PER_MESSAGE);
        const files = [];

        for (let imageIndex = 0; imageIndex < imageBatch.length; imageIndex += 1) {
            const sourceUrl = imageBatch[imageIndex];
            try {
                const buffer = await downloadImageBuffer(sourceUrl);
                const ext = getImageExtFromUrl(sourceUrl);
                files.push(new AttachmentBuilder(buffer, {
                    name: `proof-${Date.now()}-${index + imageIndex}${ext}`
                }));
            } catch (error) {
                console.warn(`Auto-vouch image download failed: ${sourceUrl}`, error?.message || error);
            }
        }

        if (files.length === 0) {
            continue;
        }

        const sent = await channel.send({
            ...(didSendHeaderContent ? {} : { content: buildVouchContent(order) }),
            files
        });
        didSendHeaderContent = true;
        const messageId = String(sent?.id || '').trim();
        if (isSnowflake(messageId)) {
            sentMessageIds.push(messageId);
        }
        for (const attachment of sent.attachments.values()) {
            const uploadedUrl = String(attachment?.url || '').trim();
            if (uploadedUrl) {
                uploadedImageUrls.push(uploadedUrl);
            }
        }
    }

    if (uploadedImageUrls.length === 0) {
        return false;
    }

    try {
        await saveProofRecord({
            order,
            imageUrls: Array.from(new Set(uploadedImageUrls)),
            vouchMessageIds: sentMessageIds
        });
    } catch (error) {
        console.error('Save proof record error:', error?.message || error);
    }

    return true;
};

const resetOrderTicketStateByChannel = async (order, channelId) => {
    if (!order || !channelId) return;

    const update = {};
    if (String(order.channelId || '') === channelId) {
        update.channelId = '';
        update.ticketStatus = 'pending';
        update.ticketError = '';
        update.ticketLockUntil = null;
    }

    if (String(order.paypalTicketChannelId || '') === channelId) {
        update.paypalTicketChannelId = '';
        update.paypalTicketChannel = '';
        update.paypalTicketStatus = 'pending';
        update.paypalTicketError = '';
        update.paypalTicketLockUntil = null;
    }

    if (String(order.ltcTicketChannelId || '') === channelId) {
        update.ltcTicketChannelId = '';
        update.ltcTicketChannel = '';
        update.ltcTicketStatus = 'pending';
        update.ltcTicketError = '';
        update.ltcTicketLockUntil = null;
    }

    if (Object.keys(update).length > 0) {
        await Order.updateOne({ _id: order._id }, { $set: update });
    }
};

const closeTicketChannel = async ({ order, channelId }) => {
    await resetOrderTicketStateByChannel(order, channelId).catch((error) => {
        console.error('Reset ticket state error:', error?.message || error);
    });

    await botRequest({
        method: 'delete',
        path: `/channels/${channelId}`,
        timeout: REQUEST_TIMEOUT_MS,
        retry: false,
        defaultCode: 'DISCORD_CHANNEL_CLOSE_FAILED'
    });
};

const buildPermissionOverwrites = ({ customerId, includeOwnerRole, botSelfId }) => {
    const guildId = getGuildId();
    const ownerRoleId = getOwnerRoleId();

    const overwrites = [
        { id: guildId, type: 0, deny: PERM_VIEW_CHANNEL_ONLY },
        { id: customerId, type: 1, allow: PERM_TICKET_CHAT }
    ];

    if (includeOwnerRole && isSnowflake(ownerRoleId)) {
        overwrites.push({ id: ownerRoleId, type: 0, allow: PERM_TICKET_CHAT });
    }

    if (isSnowflake(botSelfId)) {
        overwrites.push({ id: botSelfId, type: 1, allow: PERM_TICKET_CHAT });
    }

    return overwrites;
};

const buildCreateChannelPayloads = async ({ channelName, customerId }) => {
    const safeName = sanitizeChannelName(channelName, 'ticket');
    const categoryId = getTicketCategoryId();
    const ownerRoleId = getOwnerRoleId();
    const hasCategory = isSnowflake(categoryId);
    const hasOwnerRole = isSnowflake(ownerRoleId);
    const botSelfId = await getBotSelfId().catch(() => '');

    const primaryPayload = {
        name: safeName,
        type: 0,
        permission_overwrites: buildPermissionOverwrites({
            customerId,
            includeOwnerRole: hasOwnerRole,
            botSelfId
        })
    };
    if (hasCategory) {
        primaryPayload.parent_id = categoryId;
    }

    const fallbackPayload = {
        name: safeName,
        type: 0,
        permission_overwrites: buildPermissionOverwrites({
            customerId,
            includeOwnerRole: false,
            botSelfId
        })
    };

    const samePayload = JSON.stringify(primaryPayload) === JSON.stringify(fallbackPayload);
    return samePayload ? [primaryPayload] : [primaryPayload, fallbackPayload];
};

const createTicketChannel = async ({ channelName, customerId }) => {
    if (!isSnowflake(customerId)) {
        throw new DiscordBotError('Customer Discord ID is invalid', {
            status: 400,
            code: 'DISCORD_USER_ID_INVALID'
        });
    }

    const inGuild = await checkUserInGuild(customerId);
    if (inGuild === false) {
        throw new DiscordBotError('You must join the Discord server before creating a ticket.', {
            status: 403,
            code: 'USER_NOT_IN_GUILD'
        });
    }
    if (inGuild === null) {
        // Discord member lookup can intermittently fail on hosted IPs.
        // Continue ticket flow and let channel creation be the real gate.
        console.warn(`Ticket guild membership check unavailable for ${customerId}; proceeding with channel create.`);
    }

    return runTicketCreateQueued(async () => {
        const guildId = getGuildId();
        const payloads = await buildCreateChannelPayloads({ channelName, customerId });

        let lastRecoverableError = null;
        for (const payload of payloads) {
            try {
                const res = await botRequest({
                    method: 'post',
                    path: `/guilds/${guildId}/channels`,
                    data: payload,
                    timeout: REQUEST_TIMEOUT_CREATE_CHANNEL_MS,
                    retry: true,
                    retryOptions: {
                        maxRetries: TICKET_CREATE_RETRY_MAX_RETRIES,
                        baseDelayMs: TICKET_CREATE_RETRY_BASE_DELAY_MS,
                        maxDelayMs: TICKET_CREATE_RETRY_MAX_DELAY_MS
                    },
                    defaultCode: 'DISCORD_CHANNEL_CREATE_FAILED'
                });
                const channelId = String(res?.data?.id || '').trim();
                if (isSnowflake(channelId)) {
                    return channelId;
                }
                lastRecoverableError = new DiscordBotError('Discord returned an invalid channel id', {
                    status: 503,
                    code: 'DISCORD_CHANNEL_CREATE_INVALID'
                });
            } catch (error) {
                if (!(error instanceof DiscordBotError)) {
                    throw error;
                }
                if (error.status === 429) {
                    const cooldownSeconds = setTicketCreateCooldownSeconds(
                        Math.max(Number(error.retryAfterSeconds) || 0, 2)
                    );
                    if (cooldownSeconds > 0) {
                        error.retryAfterSeconds = Math.max(Number(error.retryAfterSeconds) || 0, cooldownSeconds);
                    }
                    throw error;
                }
                // Hard fail: config/permission/unavailable
                if (error.status === 500 || error.status === 503) {
                    throw error;
                }
                // Recoverable candidate mismatch (bad category/role/payload), keep trying fallback payloads
                lastRecoverableError = error;
            }
        }

        throw lastRecoverableError || new DiscordBotError('Could not create Discord ticket channel', {
            status: 503,
            code: 'DISCORD_CHANNEL_CREATE_FAILED'
        });
    });
};

const sendTicketMessage = async ({ channelId, content, embed, components = [] }) => {
    if (!isSnowflake(channelId)) {
        throw new DiscordBotError('Created channel id is invalid', {
            status: 500,
            code: 'DISCORD_CHANNEL_ID_INVALID'
        });
    }

    await botRequest({
        method: 'post',
        path: `/channels/${channelId}/messages`,
        data: {
            content: truncateText(content, 1900),
            embeds: embed ? [embed.toJSON()] : [],
            components: Array.isArray(components) ? components.map((item) => item.toJSON()) : []
        },
        timeout: REQUEST_TIMEOUT_MS,
        retry: true,
        retryOptions: { maxRetries: 2, baseDelayMs: 700, maxDelayMs: 8000 },
        defaultCode: 'DISCORD_MESSAGE_SEND_FAILED'
    });
};

const buildOrderMention = (discordId) => {
    const ownerRoleId = getOwnerRoleId();
    if (isSnowflake(ownerRoleId)) {
        return `<@${discordId}> <@&${ownerRoleId}>`;
    }
    return `<@${discordId}>`;
};

const formatUsdAmount = (value) => `$${Number(value || 0).toFixed(2)}`;

const buildPaymentTicketFields = ({ order, paymentLine, note, orderTotalAmount = null }) => {
    const ownerRoleId = getOwnerRoleId();
    const ownerMention = isSnowflake(ownerRoleId) ? `<@&${ownerRoleId}>` : '-';
    const hasExplicitOrderTotal = !(
        orderTotalAmount === null
        || orderTotalAmount === undefined
        || String(orderTotalAmount).trim() === ''
    );
    const normalizedOrderTotalAmount = hasExplicitOrderTotal ? Number(orderTotalAmount) : NaN;
    const resolvedOrderTotalAmount = Number.isFinite(normalizedOrderTotalAmount)
        ? normalizedOrderTotalAmount
        : Number(order?.totalAmount || 0);
    const fields = [
        { name: 'Buyer', value: `<@${order.discordId}>`, inline: true },
        { name: 'Owner Role', value: ownerMention, inline: true },
        { name: 'Order Total', value: formatUsdAmount(resolvedOrderTotalAmount), inline: true },
        { name: 'Payment', value: paymentLine, inline: false },
        { name: 'Items (Qty + Price)', value: formatOrderItemsWithPrice(order.items), inline: false },
        { name: 'Proof', value: 'Send your payment screenshot in this ticket after you pay.', inline: false }
    ];
    const safeNote = String(note || '').trim();
    if (safeNote) {
        fields.push({ name: 'Note', value: safeNote, inline: false });
    }
    return fields;
};

const buildCopyButtons = (buttonConfigs = []) => {
    const usableConfigs = (Array.isArray(buttonConfigs) ? buttonConfigs : [])
        .filter((item) => item && item.customId && item.label);
    if (usableConfigs.length === 0) return [];

    const rows = [];
    for (let index = 0; index < usableConfigs.length; index += 5) {
        const chunk = usableConfigs.slice(index, index + 5);
        rows.push(new ActionRowBuilder().addComponents(
            ...chunk.map((item) => new ButtonBuilder()
                .setCustomId(String(item.customId))
                .setLabel(String(item.label))
                .setStyle(ButtonStyle.Secondary))
        ));
    }
    return rows;
};

const buildPayPalGuideDescription = (order) => {
    const amountText = formatUsdAmount(order?.totalAmount || 0);
    const itemNote = formatPayPalMemoForOrder(order);
    const paypalEmail = getPayPalPaymentEmail();
    return [
        '# **\u{1F4B3} PayPal Payment Guide**',
        '',
        '**Method:** **Friends and Family**',
        `**Send ${amountText} to:** \`${paypalEmail}\``,
        '',
        '**1.** Choose **Friends and Family**',
        `**2.** Write \`${itemNote}\` in the note`,
        '**3.** Send the **payment screenshot** in the ticket'
    ].join('\n');
};

const buildCashAppGuideDescription = (order) => {
    const baseTotal = Number(order?.totalAmount || 0);
    const cashAppTotal = Math.max(0, baseTotal * 1.1);
    const amountText = formatUsdAmount(cashAppTotal);
    const cashAppHandle = getCashAppHandle();
    const itemNote = formatOrderItemNamesForNote(order?.items);
    return [
        '# **\u{1F4B8} Cash App Payment Guide**',
        '',
        `**Send ${amountText} to:** \`${cashAppHandle}\``,
        '',
        `**1.** Send the payment to **${cashAppHandle}**`,
        `**2.** Write \`${itemNote}\` in the note`,
        '**3.** Send the **payment screenshot** in the ticket',
        '',
        '**Note:** Cash App payments will include an additional **10% conversion fee**.'
    ].join('\n');
};

const buildLtcGuideDescription = (order) => {
    const ltcAddress = getLtcPayAddress();
    const amountText = formatUsdAmount(order?.totalAmount || 0);
    return [
        '# **LTC Payment Guide**',
        '',
        `**Send ${amountText} worth of LTC to:** \`${ltcAddress}\``,
        '',
        '**1.** Send the LTC payment to the wallet above',
        '**2.** Send your **payment screenshot** in this ticket'
    ].join('\n');
};

const buildPayPalCopyRows = (order) => buildCopyButtons([
    { customId: `copy_paypal_email_${order.orderId}`, label: 'Copy PayPal Email' },
    { customId: `copy_paypal_item_${order.orderId}`, label: 'Copy PayPal Note' }
]);

const buildCashAppCopyRows = (order) => buildCopyButtons([
    { customId: `copy_cashapp_tag_${order.orderId}`, label: 'Copy CashApp Tag' },
    { customId: `copy_cashapp_item_${order.orderId}`, label: 'Copy Item Name' }
]);

const buildLtcCopyRows = (order) => buildCopyButtons([
    { customId: `copy_ltc_wallet_${order.orderId}`, label: 'Copy LTC Address' }
]);

const createPayPalFFTicket = async (order, paypalSeq) => {
    const safeSeq = Number.isInteger(Number(paypalSeq)) ? Number(paypalSeq) : Date.now();
    const channelId = await createTicketChannel({
        channelName: `paypal_${safeSeq}`,
        customerId: order.discordId
    });

    const embed = new EmbedBuilder()
        .setColor(0x8ED3FF)
        .setTitle('PayPal Payment')
        .setDescription(
            `Hello <@${order.discordId}>. Please complete payment and send your proof screenshot in this ticket.\nOur staff will confirm your payment and deliver right away.`
        )
        .addFields(buildPaymentTicketFields({
            order,
            paymentLine: `${formatUsdAmount(order.totalAmount || 0)} to ${getPayPalPaymentEmail()} (Friends & Family)`,
            note: `PayPal note: ${formatPayPalMemoForOrder(order)}`
        }));

    try {
        await sendTicketMessage({
            channelId,
            content: buildOrderMention(order.discordId),
            embed
        });
    } catch (error) {
        console.error('PayPal F&F ticket message error:', error?.message || error);
    }

    return channelId;
};

const createLTCTicket = async (order, ltcSeq) => {
    const safeSeq = Number.isInteger(Number(ltcSeq)) ? Number(ltcSeq) : Date.now();
    const channelId = await createTicketChannel({
        channelName: `ltc_${safeSeq}`,
        customerId: order.discordId
    });

    const embed = new EmbedBuilder()
        .setColor(0xF5F7FA)
        .setTitle('LTC Payment')
        .setDescription(
            `Hello <@${order.discordId}>. Please complete payment and send your proof screenshot in this ticket.\nOur staff will confirm your payment and deliver right away.`
        )
        .addFields(buildPaymentTicketFields({
            order,
            paymentLine: `${formatUsdAmount(order.totalAmount || 0)} equivalent LTC to ${getLtcPayAddress()}`
        }));

    try {
        await sendTicketMessage({
            channelId,
            content: buildOrderMention(order.discordId),
            embed
        });
    } catch (error) {
        console.error('LTC ticket message error:', error?.message || error);
    }

    return channelId;
};

const createOrderTicket = async (order) => {
    const seq = getOrderSequence(order);
    const cashAppAmount = Number(order.totalAmount || 0) * 1.1;
    const channelId = await createTicketChannel({
        channelName: `cashapp_${seq}`,
        customerId: order.discordId
    });

    const embed = new EmbedBuilder()
        .setColor(0xA7EFC0)
        .setTitle('Cash App Payment')
        .setDescription(
            `Hello <@${order.discordId}>. Please complete payment and send your proof screenshot in this ticket.\nOur staff will confirm your payment and deliver right away.`
        )
        .addFields(buildPaymentTicketFields({
            order,
            paymentLine: `${formatUsdAmount(cashAppAmount)} to ${getCashAppHandle()}`,
            orderTotalAmount: cashAppAmount,
            note: 'Includes additional 10% conversion fee.'
        }));

    try {
        await sendTicketMessage({
            channelId,
            content: buildOrderMention(order.discordId),
            embed
        });
    } catch (error) {
        console.error('Order ticket message error:', error?.message || error);
    }

    return channelId;
};

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = String(interaction.customId || '');
    const match = customId.match(/^copy_(paypal_email|paypal_item|cashapp_tag|cashapp_item|ltc_wallet)_(.+)$/);
    if (!match) return;

    const copyType = match[1];
    const orderId = match[2];

    try {
        const order = await Order.findOne({ orderId });
        if (!order) {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Order not found.', ephemeral: true });
            }
            return;
        }

        const valueMap = {
            paypal_email: getPayPalPaymentEmail(),
            paypal_item: formatPayPalMemoForOrder(order),
            cashapp_tag: getCashAppHandle(),
            cashapp_item: formatOrderItemNamesForNote(order.items),
            ltc_wallet: getLtcPayAddress()
        };
        const labelMap = {
            paypal_email: 'PayPal Email',
            paypal_item: 'PayPal Note',
            cashapp_tag: 'CashApp Tag',
            cashapp_item: 'Item Name',
            ltc_wallet: 'LTC Address'
        };
        const rawValue = String(valueMap[copyType] || '').trim();
        const safeValue = truncateText(rawValue || '-', 300);
        const label = String(labelMap[copyType] || 'Value');
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                ephemeral: true,
                content: `Copy ${label}:\n\`${safeValue}\``
            });
        }
    } catch (error) {
        console.error('Button interaction error:', error?.message || error);
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: 'Failed to process payment selection.', ephemeral: true });
            } catch (replyError) {
                console.error('Button reply error:', replyError?.message || replyError);
            }
        }
    }
});

client.on('messageCreate', async (message) => {
    if (!message || message.author?.bot) return;
    if (!message.guildId) return;

    const channelId = String(message.channelId || '').trim();
    if (!isSnowflake(channelId)) return;

    const normalizedContent = String(message.content || '').trim().toLowerCase();
    const isCloseCommand = CLOSE_COMMANDS.has(normalizedContent);
    const isDoneCommand = DONE_COMMANDS.has(normalizedContent);
    const isReAddAllCommand = READD_ALL_COMMANDS.has(normalizedContent);
    const imageAttachments = getImageAttachments(message);
    if (!isCloseCommand && !isDoneCommand && !isReAddAllCommand && imageAttachments.length === 0) return;

    if (isReAddAllCommand) {
        const canRun = await isStaffUser(message.author.id);
        if (!canRun) {
            await message.reply('You do not have permission to run this command.');
            return;
        }

        const targetGuildId = String(message.guildId || '').trim();
        if (!isSnowflake(targetGuildId)) {
            await message.reply('Could not resolve target server for this command.');
            return;
        }

        let progressMessage = null;
        try {
            const linkedUsers = await getLinkedUsersSnapshot();
            if (linkedUsers.length === 0) {
                await message.reply('No linked users found to restore.');
                return;
            }

            const linkedUsersText = buildLinkedUsersListText(linkedUsers);
            const usersAttachment = new AttachmentBuilder(
                Buffer.from(linkedUsersText, 'utf8'),
                { name: `linked-users-${targetGuildId}.txt` }
            );

            await message.reply({
                content: `Found ${linkedUsers.length} linked users. Full list is attached below. Starting restore into this server now...`,
                files: [usersAttachment]
            });

            progressMessage = await message.reply('Restore in progress... 0 users processed.');
            let lastProgressEditAt = 0;
            const summary = await reAddLinkedUsersToGuild({
                targetGuildId,
                totalLinkedHint: linkedUsers.length,
                onProgress: async (progress) => {
                    const now = Date.now();
                    if (
                        progress.processed < progress.totalLinked
                        && (now - lastProgressEditAt) < 2000
                    ) {
                        return;
                    }

                    lastProgressEditAt = now;
                    if (progressMessage && typeof progressMessage.edit === 'function') {
                        const progressText = [
                            `Restore in progress on guild ${targetGuildId}`,
                            `Processed: ${progress.processed}/${progress.totalLinked}`,
                            `Added: ${progress.added}`,
                            `Already in server: ${progress.alreadyInGuild}`,
                            `Skipped (missing/expired token): ${progress.skippedNoToken}`,
                            `Failed: ${progress.failed}`
                        ].join('\n');
                        await progressMessage.edit(progressText);
                    }
                }
            });
            const summaryText = [
                'Add-all completed.',
                `Target guild: ${targetGuildId}`,
                `Linked users: ${summary.totalLinked}`,
                `Processed: ${summary.processed}`,
                `Added: ${summary.added}`,
                `Already in server: ${summary.alreadyInGuild}`,
                `Skipped (missing/expired token): ${summary.skippedNoToken}`,
                `Failed: ${summary.failed}`
            ].join('\n');

            if (progressMessage && typeof progressMessage.edit === 'function') {
                await progressMessage.edit(summaryText);
            } else {
                await message.reply(summaryText);
            }
        } catch (error) {
            console.error('Add-all command error:', error?.message || error);
            const failText = 'Failed to add linked users. Check bot permissions and OAuth config (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET).';
            if (progressMessage && typeof progressMessage.edit === 'function') {
                await progressMessage.edit(failText).catch(() => {});
            } else {
                await message.reply(failText).catch(() => {});
            }
        }
        return;
    }

    let order = null;
    try {
        order = await findOrderByTicketChannel(message);
    } catch (error) {
        console.error('Ticket channel order lookup failed:', error?.message || error);
        return;
    }

    if (isCloseCommand) {
        try {
            if (!order && !isConfiguredTicketCategoryChannel(message)) {
                await message.reply('This command only works inside a ticket channel.');
                return;
            }

            await message.reply('Closing ticket in 3 seconds...');
            await sleep(3000);
            await closeTicketChannel({ order, channelId });
            return;
        } catch (error) {
            console.error('Close ticket command error:', error?.message || error);
            try {
                await message.reply('Failed to close ticket. Please try again.');
            } catch {
                // Ignore reply failures.
            }
            return;
        }
    }

    if (isDoneCommand) {
        try {
            if (!order) {
                await message.reply('Could not find order for this ticket channel.');
                return;
            }

            await Order.updateOne(
                { _id: order._id },
                {
                    $set: {
                        status: 'Completed',
                        paymentMethod: order.paymentMethod || 'manual'
                    }
                }
            );

            let dmSent = false;
            try {
                dmSent = await sendPurchaseThankYouDm(order);
            } catch (error) {
                console.error('Send purchase thank-you DM error:', error?.message || error);
            }

            await message.reply(
                dmSent
                    ? 'Order marked as completed. Customer DM sent. Closing ticket in 3 seconds...'
                    : 'Order marked as completed. Could not send customer DM. Closing ticket in 3 seconds...'
            );
            await sleep(3000);
            await closeTicketChannel({ order, channelId });
            return;
        } catch (error) {
            console.error('Done ticket command error:', error?.message || error);
            try {
                await message.reply('Failed to complete this order ticket. Please try again.');
            } catch {
                // Ignore reply failures.
            }
            return;
        }
    }

    if (!order) {
        if (imageAttachments.length > 0) {
            console.warn(`No order mapped for ticket channel ${channelId}`);
        }
        return;
    }
    if (imageAttachments.length === 0) return;

    try {
        const canSendVouch = await isStaffUser(message.author.id);
        if (!canSendVouch) {
            console.warn(`Auto-vouch denied for user ${message.author.id} in channel ${channelId}`);
            return;
        }

        const imageUrls = imageAttachments
            .map((attachment) => String(attachment?.url || attachment?.proxyURL || '').trim())
            .filter(Boolean);

        if (imageUrls.length === 0) return;

        const sent = await sendAutoVouchFromTicketImages({
            order,
            imageUrls
        });

        if (sent) {
            const imageCountText = imageUrls.length > 1
                ? ` (${imageUrls.length} images)`
                : '';
            await message.reply(`Vouch posted successfully${imageCountText}.`);
            return;
        }

        console.warn(`Auto-vouch skipped for channel ${channelId}: DISCORD_VOUCH_CHANNEL_ID missing/invalid or bot cannot send.`);
    } catch (error) {
        console.error('Auto vouch send error:', error?.message || error);
        try {
            await message.reply('Could not post vouch. Check DISCORD_VOUCH_CHANNEL_ID and bot permissions.');
        } catch {
            // Ignore reply failures.
        }
    }
});

client.on('clientReady', () => {
    console.log(`Bot online: ${client.user?.tag || client.user?.id || 'unknown'}`);
});

client.on('error', (error) => {
    console.error('Bot error:', error?.message || error);
});

module.exports = {
    client,
    DiscordBotError,
    createOrderTicket,
    createPayPalFFTicket,
    createLTCTicket,
    checkUserInGuild,
    checkUserHasOwnerRole,
    getOwnerId
};

