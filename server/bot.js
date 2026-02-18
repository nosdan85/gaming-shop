const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const path = require('path');
const axios = require('axios');
const Order = require('./models/Order');
const User = require('./models/User');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// --- HELPER: CHECK USER IN GUILD ---
const checkUserInGuild = async (discordId) => {
    try {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        if (!guild) return false;
        await guild.members.fetch(discordId);
        return true;
    } catch (e) { return false; }
};

// --- TICKET SYSTEM ---
const createOrderTicket = async (order) => {
    try {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const category = await guild.channels.fetch(process.env.DISCORD_TICKET_CATEGORY_ID);
        
        const channel = await guild.channels.create({
            name: `${order.orderId}`,
            type: ChannelType.GuildText,
            parent: category ? category.id : null,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: order.discordId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: process.env.DISCORD_OWNER_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ],
        });

        const orderEmbed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`🧾 Order: ${order.orderId}`)
            .setDescription(`Hello <@${order.discordId}>. Please select a payment method.`)
            .addFields(
                { name: 'Total', value: `$${order.totalAmount}`, inline: true },
                { name: 'Items', value: order.items.map(i => `${i.quantity}x ${i.name}`).join('\n') }
            );

        // --- SỬA Ở ĐÂY: TẤT CẢ NÚT THÀNH STYLE SECONDARY (MÀU XÁM/TRONG SUỐT) ---
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pay_paypal_${order.orderId}`).setLabel('PayPal').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pay_ltc_${order.orderId}`).setLabel('LTC').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pay_cashapp_${order.orderId}`).setLabel('CashApp').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pay_apple_${order.orderId}`).setLabel('Apple Pay').setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ 
            content: `<@${order.discordId}> <@&${process.env.DISCORD_OWNER_ROLE_ID}>`, 
            embeds: [orderEmbed], 
            components: [row] 
        });

        return channel.id;
    } catch (error) { console.error("Ticket Error:", error); }
};

// --- BUTTON HANDLER ---
const { createPayPalOrder, createLTCInvoice } = require('./services/paymentService');

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const [action, method, ...rest] = interaction.customId.split('_');
    const orderId = rest.join('_');

    if (action === 'pay') {
        const order = await Order.findOne({ orderId });
        const totalAmount = order?.totalAmount || 0;
        const methods = {
            'paypal': { name: 'PayPal', img: 'paypal.png' },
            'ltc': { name: 'Litecoin', img: 'ltc.png' },
            'cashapp': { name: 'CashApp', img: 'cashapp.png' },
            'apple': { name: 'Apple Pay', img: 'apple.png' }
        };
        const selected = methods[method];
        if (!selected) return;

        let embed, files = [];
        if (method === 'paypal') {
            const base = process.env.WEBHOOK_BASE_URL || 'https://gaming-shop-backend.onrender.com';
            const returnUrl = `${base}/api/shop/paypal/capture`; // PayPal redirects user here after payment
            const paypal = await createPayPalOrder(orderId, totalAmount, returnUrl);
            if (paypal?.approvalLink) {
                await Order.findOneAndUpdate({ orderId }, { paypalOrderId: paypal.orderId });
                embed = new EmbedBuilder()
                    .setColor(0x0070BA)
                    .setTitle('Pay via PayPal')
                    .setDescription(`**Amount:** $${totalAmount}\n\n**[Click here to pay with PayPal](${paypal.approvalLink})**\n\nPayment will be confirmed automatically.`);
            }
        } else if (method === 'ltc') {
            const ltc = await createLTCInvoice(orderId, totalAmount);
            if (ltc?.payAddress) {
                embed = new EmbedBuilder()
                    .setColor(0xBFBBBB)
                    .setTitle('Pay via Litecoin (LTC)')
                    .setDescription(
                        `**Amount:** ${ltc.payAmount} LTC\n` +
                        `**Address:** \`${ltc.payAddress}\`\n\n` +
                        `Send exactly the amount above. Payment confirms automatically.`
                    );
            }
        }

        if (!embed) {
            const imagePath = path.join(__dirname, `../client/public/pictures/payments/${selected.img}`);
            files = [new AttachmentBuilder(imagePath)];
            embed = new EmbedBuilder()
                .setColor(0x000000)
                .setTitle(`Pay via ${selected.name}`)
                .setDescription(`Scan QR or use details below.\n**Upload screenshot proof here.**`)
                .setImage(`attachment://${selected.img}`);
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
    const OWNER_ID = '1146730730060271736';

    // !close - đóng và xóa ticket (channel order_* hoặc NM_*)
    if (cmd === '!close') {
        if (!message.channel.name.startsWith('order_') && !message.channel.name.startsWith('nm_')) return;
        const isAdmin = message.member?.roles?.cache?.has(process.env.DISCORD_OWNER_ROLE_ID) || message.author.id === OWNER_ID;
        const order = await Order.findOne({ orderId: message.channel.name });
        const isCustomer = order && order.discordId === message.author.id;
        if (!isAdmin && !isCustomer) return message.reply('Only the customer or staff can close this ticket.');
        try {
            await message.channel.delete();
        } catch (err) {
            console.error('Close ticket error:', err);
            message.reply('Failed to close ticket.');
        }
        return;
    }

    // 2) Xem nhanh người đã link trong DB: !linked_users hoặc !checkdb
    if (cmd === '!linked_users' || cmd === '!checkdb') {
        if (message.author.id !== OWNER_ID) {
            return message.reply(
                `Bạn không có quyền dùng lệnh này.\n` +
                `Your ID: \`${message.author.id}\`\n` +
                `OWNER_ID (env): \`${OWNER_ID}\``
            );
        }

        const User = require('./models/User');
        const users = await User.find({}).sort({ joinedAt: 1 });

        if (!users.length) {
            return message.reply('Hiện chưa có ai liên kết Discord với bot.');
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
        if (message.author.id !== OWNER_ID) {
            return message.reply(
                `Bạn không có quyền dùng lệnh này.\n` +
                `Your ID: \`${message.author.id}\`\n` +
                `OWNER_ID (env): \`${OWNER_ID}\``
            );
        }

        const inviteLink = args[1];
        if (!inviteLink) {
            return message.reply('Vui lòng nhập link invite server mới.\nVí dụ: `!notify_new_server https://discord.gg/xxxx`');
        }

        const User = require('./models/User');
        const users = await User.find({});

        if (!users.length) {
            return message.reply('Hiện chưa có ai liên kết Discord với bot, không có ai để gửi DM.');
        }

        await message.reply(`Bắt đầu gửi DM cho **${users.length}** người đã liên kết. Việc này có thể mất một lúc...`);

        for (const u of users) {
            try {
                const discordUser = await client.users.fetch(u.discordId);
                await discordUser.send(
                    `Server cũ của shop đã bị ban / không còn hoạt động.\n` +
                    `Đây là link server mới, hãy join lại nhé:\n${inviteLink}`
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
        if (message.author.id !== OWNER_ID) {
            return message.reply(
                `Bạn không có quyền dùng lệnh này.\n` +
                `Your ID: \`${message.author.id}\`\n` +
                `OWNER_ID: \`${OWNER_ID}\``
            );
        }

        const newGuildId = args[1];
        if (!newGuildId) {
            return message.reply('Vui lòng nhập ID server mới.\nVí dụ: `!migrate_server 123456789012345678`');
        }

        const users = await User.find({ accessToken: { $ne: null } });
        if (!users.length) {
            return message.reply('Hiện chưa có user nào có accessToken để auto-join server mới.');
        }

        await message.reply(`Bắt đầu auto-join **${users.length}** user vào server mới (${newGuildId}).`);

        for (const u of users) {
            try {
                await axios.put(
                    `https://discord.com/api/guilds/${newGuildId}/members/${u.discordId}`,
                    { access_token: u.accessToken },
                    {
                        headers: {
                            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            } catch (err) {
                console.error(`Migrate server error for ${u.discordId}:`, err.response?.data || err.message);
            }
        }

        return;
    }
});

// --- AUTO VOUCH (EMBED CHUẨN MẪU) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!message.channel.name.startsWith('order_') && !message.channel.name.startsWith('nm_')) return;
    if (message.attachments.size === 0) return;
    
    if (!message.member.roles.cache.has(process.env.DISCORD_OWNER_ROLE_ID)) return;

    try {
        const order = await Order.findOne({ orderId: message.channel.name });
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
module.exports = { client, createOrderTicket, checkUserInGuild };