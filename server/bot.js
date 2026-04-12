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

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const SNOWFLAKE_PATTERN = /^\d{16,22}$/;
const BOT_SELF_CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_CREATE_CHANNEL_MS = 8000;
const TICKET_CREATE_MIN_GAP_MS = 1200;

const PERM_VIEW_CHANNEL = String(1n << 10n);
const PERM_VIEW_SEND_HISTORY = String((1n << 10n) | (1n << 11n) | (1n << 16n));

let cachedBotSelfId = '';
let cachedBotSelfAt = 0;
let ticketCreateChain = Promise.resolve();
let lastTicketCreateAt = 0;

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
    intents: [GatewayIntentBits.Guilds]
});

const isSnowflake = (value) => SNOWFLAKE_PATTERN.test(String(value || '').trim());
const getBotToken = () => String(process.env.DISCORD_BOT_TOKEN || '').trim();
const getGuildId = () => String(process.env.DISCORD_GUILD_ID || '').trim();
const getOwnerRoleId = () => String(process.env.DISCORD_OWNER_ROLE_ID || '').trim();
const getTicketCategoryId = () => String(process.env.DISCORD_TICKET_CATEGORY_ID || '').trim();
const getOwnerId = () => String(process.env.DISCORD_OWNER_ID || '').trim();
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
        const waitMs = Math.max(0, TICKET_CREATE_MIN_GAP_MS - elapsed);
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

const truncateText = (value, max = 300) => String(value || '').slice(0, Math.max(0, Number(max) || 0));

const formatDiscordApiMessage = (data) => {
    if (!data) return '';
    if (typeof data === 'string') return truncateText(data, 300);
    return truncateText(
        data.message || data.error || data.error_description || JSON.stringify(data),
        300
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

const buildPermissionOverwrites = ({ customerId, includeOwnerRole, botSelfId }) => {
    const guildId = getGuildId();
    const ownerRoleId = getOwnerRoleId();

    const overwrites = [
        { id: guildId, type: 0, deny: PERM_VIEW_CHANNEL },
        { id: customerId, type: 1, allow: PERM_VIEW_SEND_HISTORY }
    ];

    if (includeOwnerRole && isSnowflake(ownerRoleId)) {
        overwrites.push({ id: ownerRoleId, type: 0, allow: PERM_VIEW_SEND_HISTORY });
    }

    if (isSnowflake(botSelfId)) {
        overwrites.push({ id: botSelfId, type: 1, allow: PERM_VIEW_SEND_HISTORY });
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
                    retry: false,
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
                // Hard fail: config/permission/rate-limit/unavailable
                if (error.status === 429 || error.status === 500 || error.status === 503) {
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

const createOrderTicket = async (order) => {
    const channelId = await createTicketChannel({
        channelName: `${order.orderId}`,
        customerId: order.discordId
    });

    const embed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle(`Order: ${order.orderId}`)
        .setDescription(`Hello <@${order.discordId}>. Choose CashApp or Robux.`)
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
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`pay_robux_${order.orderId}`)
            .setLabel('Robux')
            .setStyle(ButtonStyle.Secondary)
    );

    try {
        await sendTicketMessage({
            channelId,
            content: buildOrderMention(order.discordId),
            embed,
            components: [row]
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
    const match = customId.match(/^pay_(cashapp|robux)_(.+)$/);
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
            .setTitle(`Pay via ${method === 'cashapp' ? 'CashApp' : 'Robux'}`)
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
    checkUserInGuild,
    checkUserHasOwnerRole,
    getOwnerId
};
