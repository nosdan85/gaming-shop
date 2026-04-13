const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { discordRequest } = require('./utils/discordApi');
const Order = require('./models/Order');
const { getDiscordGatewayStatus } = require('./config/discordGateway');

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
const CLOSE_COMMANDS = new Set(['!close', '/close', '!dong', '/dong']);
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
const { gatewayEnabled: discordGatewayEnabled } = getDiscordGatewayStatus();

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
const getBotToken = () => normalizeEnvValue(process.env.DISCORD_BOT_TOKEN);
const getGuildId = () => normalizeEnvValue(process.env.DISCORD_GUILD_ID);
const getOwnerRoleId = () => normalizeEnvValue(process.env.DISCORD_OWNER_ROLE_ID);
const getTicketCategoryId = () => normalizeEnvValue(process.env.DISCORD_TICKET_CATEGORY_ID);
const getOwnerId = () => normalizeEnvValue(process.env.DISCORD_OWNER_ID);
const getVouchChannelId = () => normalizeEnvValue(process.env.DISCORD_VOUCH_CHANNEL_ID);
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
        ? items.map((item) => `${Number(item?.quantity) || 0}x ${String(item?.name || 'Item')}`)
        : [];
    const joined = lines.join('\n') || '-';
    return truncateText(joined, 1000);
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

const getFirstImageAttachment = (message) => {
    if (!message?.attachments || typeof message.attachments.values !== 'function') return null;
    for (const attachment of message.attachments.values()) {
        if (isImageAttachment(attachment)) return attachment;
    }
    return null;
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

const formatVouchItems = (items) => {
    if (!Array.isArray(items) || items.length === 0) return '**1X UNKNOWN ITEM**';
    return items
        .map((item) => {
            const quantity = Math.max(1, Number(item?.quantity) || 1);
            const name = String(item?.name || 'UNKNOWN ITEM').trim().toUpperCase();
            return `**${quantity}X ${name}**`;
        })
        .join('\n')
        .slice(0, 1500);
};

const buildVouchContent = (order) => {
    const mention = `<@${order?.discordId || ''}>`;
    const itemsText = formatVouchItems(order?.items);
    return truncateText(`${mention}\n${itemsText}\nPlease leave us a vouch ❤️`, 1900);
};

const sendAutoVouchFromTicketImage = async ({ order, imageUrl }) => {
    const vouchChannelId = getVouchChannelId();
    if (!isSnowflake(vouchChannelId) || !imageUrl) return false;

    const embed = new EmbedBuilder()
        .setColor(0x00D632)
        .setImage(imageUrl);

    await botRequest({
        method: 'post',
        path: `/channels/${vouchChannelId}/messages`,
        data: {
            content: buildVouchContent(order),
            embeds: [embed.toJSON()]
        },
        timeout: REQUEST_TIMEOUT_MS,
        retry: true,
        defaultCode: 'DISCORD_VOUCH_SEND_FAILED'
    });

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

const createPayPalFFTicket = async (order, paypalSeq) => {
    const safeSeq = Number.isInteger(Number(paypalSeq)) ? Number(paypalSeq) : Date.now();
    const channelId = await createTicketChannel({
        channelName: `paypal_${safeSeq}`,
        customerId: order.discordId
    });

    const embed = new EmbedBuilder()
        .setColor(0x003087)
        .setTitle(`PayPal F&F - Order ${order.orderId}`)
        .setDescription(`Hello <@${order.discordId}>. Upload your PayPal payment screenshot here.`)
        .addFields(
            { name: 'Customer', value: order.discordUsername || `<@${order.discordId}>`, inline: true },
            { name: 'Total', value: `$${Number(order.totalAmount || 0).toFixed(2)}`, inline: true },
            { name: 'Items', value: formatOrderItems(order.items) }
        );

    try {
        await sendTicketMessage({
            channelId,
            content: buildOrderMention(order.discordId),
            embed
        });
    } catch (error) {
        // Channel is already created; do not force duplicate channel attempts.
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
        .setColor(0x345D9D)
        .setTitle(`LTC Payment - Order ${order.orderId}`)
        .setDescription(`Hello <@${order.discordId}>. Please upload your LTC payment proof screenshot here.`);

    try {
        await sendTicketMessage({
            channelId,
            content: buildOrderMention(order.discordId),
            embed
        });
    } catch (error) {
        // Channel is already created; do not force duplicate channel attempts.
        console.error('LTC ticket message error:', error?.message || error);
    }

    return channelId;
};

const createOrderTicket = async (order) => {
    const channelId = await createTicketChannel({
        channelName: `${order.orderId}`,
        customerId: order.discordId
    });
    const gatewayDisabled = !discordGatewayEnabled;

    const embed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle(`Order: ${order.orderId}`)
        .setDescription(
            gatewayDisabled
                ? `Hello <@${order.discordId}>. Please reply with your payment method: CashApp.`
                : `Hello <@${order.discordId}>. Choose CashApp.`
        )
        .addFields(
            { name: 'Customer', value: order.discordUsername || `<@${order.discordId}>`, inline: true },
            { name: 'Total', value: `$${Number(order.totalAmount || 0).toFixed(2)}`, inline: true },
            { name: 'Items', value: formatOrderItems(order.items) },
            { name: 'Payment', value: '-', inline: false },
            { name: 'Paid', value: 'No', inline: false }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pay_cashapp_${order.orderId}`)
            .setLabel('CashApp')
            .setStyle(ButtonStyle.Secondary)
    );

    try {
        await sendTicketMessage({
            channelId,
            content: buildOrderMention(order.discordId),
            embed,
            components: gatewayDisabled ? [] : [row]
        });
    } catch (error) {
        // Channel is already created; do not force duplicate channel attempts.
        console.error('Order ticket message error:', error?.message || error);
    }

    return channelId;
};

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = String(interaction.customId || '');
    const match = customId.match(/^pay_(cashapp)_(.+)$/);
    if (!match) return;

    const method = match[1];
    const orderId = match[2];

    try {
        const order = await Order.findOne({ orderId });
        if (!order) {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Order not found.', ephemeral: true });
            }
            return;
        }

        await Order.findOneAndUpdate(
            { orderId },
            { status: 'Waiting Payment', paymentMethod: method }
        );

        const payEmbed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('Pay via CashApp')
            .setDescription(
                `Amount: $${Number(order.totalAmount || 0).toFixed(2)}\nUpload your payment proof screenshot here.`
            );

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ embeds: [payEmbed] });
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
    const imageAttachment = getFirstImageAttachment(message);
    if (!isCloseCommand && !imageAttachment) return;

    let order = null;
    try {
        order = await findOrderByTicketChannel(message);
    } catch (error) {
        console.error('Ticket channel order lookup failed:', error?.message || error);
        return;
    }

    if (isCloseCommand) {
        try {
            let canClose = false;
            if (order) {
                canClose = await isTicketOwnerOrStaff(message.author.id, order);
            } else if (isConfiguredTicketCategoryChannel(message)) {
                // Fallback for legacy tickets missing channelId mapping in DB.
                canClose = await isStaffUser(message.author.id);
            }

            if (!canClose) {
                await message.reply('You do not have permission to close this ticket.');
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

    if (!order) {
        if (imageAttachment?.url) {
            console.warn(`No order mapped for ticket channel ${channelId}`);
        }
        return;
    }
    if (!imageAttachment?.url) return;

    try {
        const canSendVouch = await isStaffUser(message.author.id);
        if (!canSendVouch) {
            console.warn(`Auto-vouch denied for user ${message.author.id} in channel ${channelId}`);
            return;
        }

        const sent = await sendAutoVouchFromTicketImage({
            order,
            imageUrl: imageAttachment.url
        });

        if (sent) {
            await message.reply('Vouch posted successfully.');
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

client.on('ready', () => {
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
