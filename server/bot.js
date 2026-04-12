const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const path = require('path');
const { discordRequest } = require('./utils/discordApi');
const Order = require('./models/Order');
const User = require('./models/User');
const OWNER_ID = process.env.DISCORD_OWNER_ID || '';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

const DISCORD_API_BASE = 'https://discord.com/api';
const SNOWFLAKE_PATTERN = /^\d{16,22}$/;
const BOT_ID_CACHE_TTL_MS = 10 * 60 * 1000;

const PERM_VIEW_CHANNEL = PermissionsBitField.Flags.ViewChannel.toString();
const PERM_VIEW_AND_SEND = (
    PermissionsBitField.Flags.ViewChannel
    | PermissionsBitField.Flags.SendMessages
    | PermissionsBitField.Flags.ReadMessageHistory
).toString();

let cachedBotUserId = null;
let cachedBotUserIdAt = 0;

const isSnowflake = (value) => SNOWFLAKE_PATTERN.test(String(value || '').trim());
const getBotToken = () => String(process.env.DISCORD_BOT_TOKEN || '').trim();
const getGuildId = () => String(process.env.DISCORD_GUILD_ID || '').trim();

const discordBotRequest = async (config) => {
    const token = getBotToken();
    if (!token) {
        throw new Error('DISCORD_BOT_TOKEN is missing');
    }
    return discordRequest({
        ...config,
        headers: {
            Authorization: `Bot ${token}`,
            ...(config.headers || {})
        }
    }, 0, { noRetry: true });
};

const getBotUserId = async () => {
    if (client?.user?.id) return client.user.id;
    if (cachedBotUserId && (Date.now() - cachedBotUserIdAt) < BOT_ID_CACHE_TTL_MS) {
        return cachedBotUserId;
    }
    const res = await discordBotRequest({
        method: 'get',
        url: `${DISCORD_API_BASE}/users/@me`,
        timeout: 8000
    });
    const id = String(res?.data?.id || '').trim();
    if (!isSnowflake(id)) return null;
    cachedBotUserId = id;
    cachedBotUserIdAt = Date.now();
    return id;
};

const createTicketChannelViaRest = async ({ channelName, customerId, categoryId, ownerRoleId }) => {
    const guildId = getGuildId();
    if (!isSnowflake(guildId) || !isSnowflake(customerId)) {
        return null;
    }

    const botUserId = await getBotUserId().catch(() => null);
    const basePayload = {
        name: String(channelName || `ticket_${Date.now()}`).slice(0, 90),
        type: 0
    };

    const buildOverwrites = (includeOwnerRole) => {
        const permissionOverwrites = [
            { id: guildId, type: 0, deny: PERM_VIEW_CHANNEL },
            { id: customerId, type: 1, allow: PERM_VIEW_AND_SEND }
        ];
        if (includeOwnerRole && isSnowflake(ownerRoleId)) {
            permissionOverwrites.push({ id: ownerRoleId, type: 0, allow: PERM_VIEW_AND_SEND });
        }
        if (isSnowflake(botUserId)) {
            permissionOverwrites.push({ id: botUserId, type: 1, allow: PERM_VIEW_AND_SEND });
        }
        return permissionOverwrites;
    };

    const candidates = [];
    const ownerVariants = isSnowflake(ownerRoleId) ? [true, false] : [false];
    for (const includeOwnerRole of ownerVariants) {
        const payload = {
            ...basePayload,
            permission_overwrites: buildOverwrites(includeOwnerRole)
        };
        if (isSnowflake(categoryId)) {
            candidates.push({ ...payload, parent_id: categoryId });
        }
        candidates.push(payload);
    }

    for (const candidate of candidates) {
        try {
            const res = await discordBotRequest({
                method: 'post',
                url: `${DISCORD_API_BASE}/guilds/${guildId}/channels`,
                timeout: 12000,
                data: candidate,
                headers: { 'Content-Type': 'application/json' }
            });
            const channelId = String(res?.data?.id || '').trim();
            if (isSnowflake(channelId)) return channelId;
        } catch (error) {
            const status = Number(error?.response?.status) || 0;
            if (status === 401 || status === 403) {
                throw error;
            }
            // Try next candidate (for example, retry without parent_id).
        }
    }

    return null;
};

const sendMessageToChannelViaRest = async ({ channelId, content, embed, components }) => {
    if (!isSnowflake(channelId)) return false;
    const payload = {
        content: String(content || '').slice(0, 1900),
        embeds: embed ? [embed.toJSON()] : [],
        components: Array.isArray(components) ? components.map((c) => c.toJSON()) : []
    };

    await discordBotRequest({
        method: 'post',
        url: `${DISCORD_API_BASE}/channels/${channelId}/messages`,
        timeout: 12000,
        data: payload,
        headers: { 'Content-Type': 'application/json' }
    });
    return true;
};

const hasOwnerAccess = (message) => {
    const hasOwnerRole = message.member?.roles?.cache?.has(process.env.DISCORD_OWNER_ROLE_ID);
    const isExplicitOwner = OWNER_ID && message.author?.id === OWNER_ID;
    return Boolean(hasOwnerRole || isExplicitOwner);
};

const resolveOwnerRoleId = async (guild) => {
    const rawRoleId = String(process.env.DISCORD_OWNER_ROLE_ID || '').trim();
    if (!isSnowflake(rawRoleId)) return null;
    if (!guild) return rawRoleId;
    try {
        const role = await guild.roles.fetch(rawRoleId);
        return role?.id || null;
    } catch {
        return rawRoleId;
    }
};

const resolveTicketCategoryId = async (guild) => {
    const rawCategoryId = String(process.env.DISCORD_TICKET_CATEGORY_ID || '').trim();
    if (!isSnowflake(rawCategoryId)) return null;
    if (!guild) return rawCategoryId;
    try {
        const channel = await guild.channels.fetch(rawCategoryId);
        return channel?.id || null;
    } catch {
        return null;
    }
};

// --- HELPER: CHECK USER IN GUILD ---
const checkUserInGuild = async (discordId) => {
    const guildId = String(process.env.DISCORD_GUILD_ID || '').trim();
    const botToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
    if (!discordId || !guildId || !botToken) return null;

    try {
        await discordRequest({
            method: 'get',
            url: `https://discord.com/api/guilds/${guildId}/members/${discordId}`,
            timeout: 8000,
            headers: {
                Authorization: `Bot ${botToken}`
            }
        }, 0, { noRetry: true });
        return true;
    } catch (error) {
        const status = Number(error?.response?.status) || 0;
        if (status === 404) return false;
        if (status === 429 || (status >= 500 && status < 600)) {
            console.warn(`checkUserInGuild temporary failure for ${discordId}: ${status}`);
            return null;
        }
        if (status === 401 || status === 403) {
            console.error('checkUserInGuild bot permission/config error:', error?.response?.data || error.message);
            return null;
        }
        console.error('checkUserInGuild unexpected error:', error?.response?.data || error.message);
        return null;
    }
};

// --- HELPER: CHECK USER CÓ OWNER ROLE ---
const checkUserHasOwnerRole = async (discordId) => {
    const ownerRoleId = String(process.env.DISCORD_OWNER_ROLE_ID || '').trim();
    if (!isSnowflake(discordId) || !isSnowflake(ownerRoleId)) return false;

    const guildId = getGuildId();
    const token = getBotToken();
    if (isSnowflake(guildId) && token) {
        try {
            const res = await discordBotRequest({
                method: 'get',
                url: `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordId}`,
                timeout: 8000
            });
            const roleIds = Array.isArray(res?.data?.roles) ? res.data.roles.map((r) => String(r)) : [];
            return roleIds.includes(ownerRoleId);
        } catch (error) {
            const status = Number(error?.response?.status) || 0;
            if (status === 404) return false;
            if (status === 401 || status === 403) {
                console.error('checkUserHasOwnerRole permission/config error:', error?.response?.data || error.message);
            }
        }
    }

    try {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        if (!guild) return false;
        const member = await guild.members.fetch(discordId);
        return member.roles.cache.has(ownerRoleId);
    } catch (e) {
        return false;
    }
};

const createPayPalFFTicketViaRest = async (order, paypalSeq) => {
    const categoryId = await resolveTicketCategoryId(null);
    const ownerRoleId = await resolveOwnerRoleId(null);
    const channelId = await createTicketChannelViaRest({
        channelName: `paypal_${paypalSeq}`,
        customerId: order.discordId,
        categoryId,
        ownerRoleId
    });

    if (!channelId) return null;

    const embed = new EmbedBuilder()
        .setColor(0x003087)
        .setTitle(`PayPal F&F - Order ${order.orderId}`)
        .setDescription(`Hello <@${order.discordId}>. Upload your PayPal payment screenshot here.`)
        .addFields(
            { name: 'Customer', value: order.discordUsername || `<@${order.discordId}>`, inline: true },
            { name: 'Total', value: `$${order.totalAmount}`, inline: true },
            { name: 'Items', value: order.items.map((i) => `${i.quantity}x ${i.name}`).join('\n') }
        );

    const mentionContent = isSnowflake(ownerRoleId)
        ? `<@${order.discordId}> <@&${ownerRoleId}>`
        : `<@${order.discordId}>`;

    const sent = await sendMessageToChannelViaRest({
        channelId,
        content: mentionContent,
        embed
    }).catch((error) => {
        console.error('PayPal F&F REST send message error:', error?.response?.data || error.message || error);
        return false;
    });

    return sent ? channelId : null;
};

const createOrderTicketViaRest = async (order) => {
    const categoryId = await resolveTicketCategoryId(null);
    const ownerRoleId = await resolveOwnerRoleId(null);
    const channelId = await createTicketChannelViaRest({
        channelName: `${order.orderId}`,
        customerId: order.discordId,
        categoryId,
        ownerRoleId
    });

    if (!channelId) return null;

    const orderEmbed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle(`Order: ${order.orderId}`)
        .setDescription(`Hello <@${order.discordId}>. Choose CashApp or Robux.`)
        .addFields(
            { name: 'Customer', value: order.discordUsername || `<@${order.discordId}>`, inline: true },
            { name: 'Total', value: `$${order.totalAmount}`, inline: true },
            { name: 'Items', value: order.items.map((i) => `${i.quantity}x ${i.name}`).join('\n') },
            { name: 'Payment', value: '-', inline: false },
            { name: 'Paid', value: 'No', inline: false }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pay_cashapp_${order.orderId}`).setLabel('CashApp').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`pay_robux_${order.orderId}`).setLabel('Robux').setStyle(ButtonStyle.Secondary)
    );

    const mentionContent = isSnowflake(ownerRoleId)
        ? `<@${order.discordId}> <@&${ownerRoleId}>`
        : `<@${order.discordId}>`;

    const sent = await sendMessageToChannelViaRest({
        channelId,
        content: mentionContent,
        embed: orderEmbed,
        components: [row]
    }).catch((error) => {
        console.error('Order REST send message error:', error?.response?.data || error.message || error);
        return false;
    });

    return sent ? channelId : null;
};

// --- TICKET: PayPal F&F (tên paypal_1, paypal_2...; khác với ticket CashApp/Robux) ---
const createPayPalFFTicket = async (order, paypalSeq) => {
    try {
        if (!client.isReady()) {
            console.warn('PayPal F&F Ticket: bot not ready, fallback to REST');
            return createPayPalFFTicketViaRest(order, paypalSeq);
        }
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        if (!guild) {
            console.warn('PayPal F&F Ticket: guild fetch failed, fallback to REST');
            return createPayPalFFTicketViaRest(order, paypalSeq);
        }
        const categoryId = await resolveTicketCategoryId(guild);
        const ownerRoleId = await resolveOwnerRoleId(guild);
        const channelName = `paypal_${paypalSeq}`;
        const permissionOverwrites = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: order.discordId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        if (ownerRoleId) {
            permissionOverwrites.push({
                id: ownerRoleId,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            });
        }

        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryId || null,
            permissionOverwrites,
        });

        const embed = new EmbedBuilder()
            .setColor(0x003087)
            .setTitle(`PayPal F&F — Order ${order.orderId}`)
            .setDescription(`Hello <@${order.discordId}>. Upload your PayPal payment screenshot here.`)
            .addFields(
                { name: 'Customer', value: order.discordUsername || `<@${order.discordId}>`, inline: true },
                { name: 'Total', value: `$${order.totalAmount}`, inline: true },
                { name: 'Items', value: order.items.map(i => `${i.quantity}x ${i.name}`).join('\n') }
            );

        const mentionContent = ownerRoleId
            ? `<@${order.discordId}> <@&${ownerRoleId}>`
            : `<@${order.discordId}>`;

        await channel.send({
            content: mentionContent,
            embeds: [embed]
        });

        return channel.id;
    } catch (error) {
        console.error("PayPal F&F Ticket Error:", error?.response?.data || error.message || error);
        return createPayPalFFTicketViaRest(order, paypalSeq);
    }
};

// --- TICKET: CashApp/Robux (tên nm_1, nm_2...) ---
const createOrderTicket = async (order) => {
    try {
        if (!client.isReady()) {
            console.warn('Order ticket: bot not ready, fallback to REST');
            return createOrderTicketViaRest(order);
        }
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        if (!guild) {
            console.warn('Order ticket: guild fetch failed, fallback to REST');
            return createOrderTicketViaRest(order);
        }
        const categoryId = await resolveTicketCategoryId(guild);
        const ownerRoleId = await resolveOwnerRoleId(guild);
        const permissionOverwrites = [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: order.discordId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        if (ownerRoleId) {
            permissionOverwrites.push({
                id: ownerRoleId,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            });
        }

        const channel = await guild.channels.create({
            name: `${order.orderId}`,
            type: ChannelType.GuildText,
            parent: categoryId || null,
            permissionOverwrites,
        });

        const orderEmbed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`🧾 Order: ${order.orderId}`)
            .setDescription(`Hello <@${order.discordId}>. Choose CashApp or Robux.`)
            .addFields(
                { name: 'Customer', value: order.discordUsername || `<@${order.discordId}>`, inline: true },
                { name: 'Total', value: `$${order.totalAmount}`, inline: true },
                { name: 'Items', value: order.items.map(i => `${i.quantity}x ${i.name}`).join('\n') },
                { name: 'Payment', value: '—', inline: false },
                { name: 'Paid', value: '❌ No', inline: false }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pay_cashapp_${order.orderId}`).setLabel('CashApp').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pay_robux_${order.orderId}`).setLabel('Robux').setStyle(ButtonStyle.Secondary)
        );

        const mentionContent = ownerRoleId
            ? `<@${order.discordId}> <@&${ownerRoleId}>`
            : `<@${order.discordId}>`;

        await channel.send({ 
            content: mentionContent, 
            embeds: [orderEmbed], 
            components: [row] 
        });

        return channel.id;
    } catch (error) {
        console.error("Ticket Error:", error?.response?.data || error.message || error);
        return createOrderTicketViaRest(order);
    }
};

// --- BUTTON HANDLER (Ticket: chỉ CashApp & Apple Pay, PayPal/LTC thanh toán trên web) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const [action, method, ...rest] = interaction.customId.split('_');
    const orderId = rest.join('_');

    if (action === 'pay') {
        const order = await Order.findOne({ orderId });
        if (!order) return;
        const totalAmount = order.totalAmount;
        const methods = {
            'cashapp': { name: 'CashApp', img: 'cashapp.png' },
            'robux': { name: 'Robux', img: 'robux.png' }
        };
        const selected = methods[method];
        if (!selected) return;

        let files = [], embed;
        const imagePath = path.join(__dirname, `../client/public/pictures/payments/${selected.img}`);
        try {
            const fs = require('fs');
            if (fs.existsSync(imagePath)) {
                files = [new AttachmentBuilder(imagePath)];
                embed = new EmbedBuilder()
                    .setColor(0x000000)
                    .setTitle(`Pay via ${selected.name}`)
                    .setDescription(`**Amount:** $${totalAmount}\n\nScan QR or use details below.\n**Upload screenshot proof here.**`)
                    .setImage(`attachment://${selected.img}`);
            } else {
                embed = new EmbedBuilder()
                    .setColor(0x000000)
                    .setTitle(`Pay via ${selected.name}`)
                    .setDescription(`**Amount:** $${totalAmount}\n\nUpload screenshot proof here.`);
            }
        } catch {
            embed = new EmbedBuilder()
                .setColor(0x000000)
                .setTitle(`Pay via ${selected.name}`)
                .setDescription(`**Amount:** $${totalAmount}\n\nUpload screenshot proof here.`);
        }

        await interaction.reply({ embeds: [embed], files });
        await Order.findOneAndUpdate({ orderId }, { status: 'Waiting Payment', paymentMethod: method });
    }
});

// --- ADMIN / USER COMMANDS ---
client.on('messageCreate', async message => {
    // Bỏ qua bot & DM
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    if (!content.startsWith('!')) return; // chỉ xử lý các lệnh bắt đầu bằng !

    const args = content.split(/\s+/);
    const cmd = args[0].toLowerCase();

    // ID owner cố định (an toàn vì chỉ là ID public, không phải token)

    // !close - đóng ticket, đánh dấu đã thanh toán
    if (cmd === '!close') {
        const chName = message.channel.name;
        const isCashAppRobux = chName.startsWith('order_') || chName.startsWith('nm_');
        const isPayPalFF = chName.startsWith('paypal_');
        if (!isCashAppRobux && !isPayPalFF) return;

        const isAdmin = hasOwnerAccess(message);
        const order = isCashAppRobux
            ? await Order.findOne({ orderId: chName })
            : await Order.findOne({ paypalTicketChannel: chName });

        if (!isAdmin) return message.reply('Only staff can close and mark ticket as paid.');
        if (!order) return message.reply('Order not found.');
        try {
            await Order.findByIdAndUpdate(order._id, { status: 'Completed' });
            await message.channel.delete();
        } catch (err) {
            console.error('Close ticket error:', err);
            message.reply('Failed to close ticket.');
        }
        return;
    }

    // !order - xem thông tin đơn (trong ticket)
    if (cmd === '!order') {
        const chName = message.channel.name;
        if (!chName.startsWith('order_') && !chName.startsWith('nm_')) return;
        const order = await Order.findOne({ orderId: chName });
        if (!order) return message.reply('Order not found.');
        const isPaid = order.status === 'Completed';
        const method = order.paymentMethod || '—';
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📋 Order ${order.orderId}`)
            .addFields(
                { name: 'Customer', value: order.discordUsername || `<@${order.discordId}>`, inline: true },
                { name: 'Payment', value: method, inline: true },
                { name: 'Paid', value: isPaid ? '✅ Yes' : '❌ No', inline: true }
            );
        return message.reply({ embeds: [embed] });
    }

    // 2) Xem nhanh người đã link trong DB: !linked_users hoặc !checkdb
    if (cmd === '!linked_users' || cmd === '!checkdb') {
        if (!hasOwnerAccess(message)) {
            return message.reply(
                `You don't have permission to use this command.\n` +
                `Your ID: \`${message.author.id}\`\n` +
                `OWNER_ID (env): \`${OWNER_ID}\``
            );
        }

        const User = require('./models/User');
        const users = await User.find({}).sort({ joinedAt: 1 });

        if (!users.length) {
            return message.reply('No users have linked Discord with the bot yet.');
        }

        let contentMsg = `**Total Linked Users:** ${users.length}\n`;
        users.slice(-50).forEach((u, idx) => { 
            contentMsg += `${idx + 1}. <@${u.discordId}> (${u.discordUsername})\n`;
        });
        if(users.length > 50) contentMsg += `...and ${users.length - 50} more.`;
        return message.reply(contentMsg);
    }

    // 3) GỬI DM CHO TẤT CẢ USER ĐÃ LIÊN KẾT KHI SERVER CŨ BỊ BAN / CHUYỂN SERVER MỚI
    // Cú pháp: !notify_new_server https://discord.gg/xxxx
    if (cmd === '!notify_new_server') {
        if (!hasOwnerAccess(message)) {
            return message.reply(
                `You don't have permission to use this command.\n` +
                `Your ID: \`${message.author.id}\`\n` +
                `OWNER_ID (env): \`${OWNER_ID}\``
            );
        }

        const inviteLink = args[1];
        if (!inviteLink) {
            return message.reply('Please enter the new server invite link.\nExample: `!notify_new_server https://discord.gg/xxxx`');
        }

        const User = require('./models/User');
        const users = await User.find({});

        if (!users.length) {
            return message.reply('No users have linked Discord yet. No one to DM.');
        }

        await message.reply(`Sending DM to **${users.length}** linked users. This may take a while...`);

        for (const u of users) {
            try {
                const discordUser = await client.users.fetch(u.discordId);
                await discordUser.send(
                    `The shop's old server has been banned or is no longer active.\n` +
                    `Here is the new server link, please join again:\n${inviteLink}`
                );

                // Nghỉ nhẹ để hạn chế rate-limit
                await new Promise(res => setTimeout(res, 500));
            } catch (err) {
                console.error(`Không gửi được DM tới ${u.discordId}:`, err);
            }
        }

        return;
    }

    // 4) MIGRATE SERVER: thêm tất cả user đã liên kết vào GUILD MỚI (auto-join, không chỉ DM)
    // Cú pháp: !migrate_server NEW_GUILD_ID
    if (cmd === '!migrate_server') {
        if (!hasOwnerAccess(message)) {
            return message.reply(
                `You don't have permission to use this command.\n` +
                `Your ID: \`${message.author.id}\`\n` +
                `OWNER_ID: \`${OWNER_ID}\``
            );
        }

        const newGuildId = args[1];
        if (!newGuildId) {
            return message.reply('Please enter the new server ID.\nExample: `!migrate_server 123456789012345678`');
        }

        const users = await User.find({ accessToken: { $ne: null } });
        if (!users.length) {
            return message.reply('No users have accessToken to auto-join the new server.');
        }

        await message.reply(`Auto-joining **${users.length}** users to new server (${newGuildId}).`);

        for (const u of users) {
            try {
                await discordRequest({
                    method: 'put',
                    url: `https://discord.com/api/guilds/${newGuildId}/members/${u.discordId}`,
                    data: { access_token: u.accessToken },
                    headers: {
                        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });
            } catch (err) {
                console.error(`Migrate server error for ${u.discordId}:`, err.response?.data || err.message);
            }
        }

        return;
    }
});

// --- AUTO VOUCH ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    const chName = message.channel.name;
    const isTicket = chName.startsWith('order_') || chName.startsWith('nm_') || chName.startsWith('paypal_');
    if (!isTicket) return;
    if (message.attachments.size === 0) return;
    if (!message.member.roles.cache.has(process.env.DISCORD_OWNER_ROLE_ID)) return;

    try {
        const order = chName.startsWith('paypal_')
            ? await Order.findOne({ paypalTicketChannel: chName })
            : await Order.findOne({ orderId: chName });
        if (!order) return;

        const vouchChannel = await client.channels.fetch(process.env.DISCORD_VOUCH_CHANNEL_ID);
        const attachment = message.attachments.first();

        const vouchEmbed = new EmbedBuilder()
            .setColor(0x00FF00) // Xanh lá
            .setTitle('✅ SUCCESSFUL TRANSACTION')
            .setDescription(
                `Thank you <@${order.discordId}> for your purchase! ❤️\n\n` + 
                `**Items Bought:**\n` + 
                order.items.map(i => `• ${i.quantity}x ${i.name}`).join('\n') + 
                `\n\n**Total Value**\n$${order.totalAmount}`
            )
            .setImage(attachment.url)
            .setFooter({ text: 'Legit Check ✅ • ' + new Date().toLocaleTimeString() })
            .setTimestamp();

        await vouchChannel.send({ 
            content: `New vouch for <@${order.discordId}>!`, 
            embeds: [vouchEmbed] 
        });

        await message.react('✅');
    } catch (e) { console.error("Vouch Error:", e); }
});

client.on('ready', () => console.log(`🤖 Bot Online: ${client.user.tag}`));
client.on('error', err => console.error('🤖 Bot error:', err.message));
module.exports = { client, createOrderTicket, createPayPalFFTicket, checkUserInGuild, checkUserHasOwnerRole };

