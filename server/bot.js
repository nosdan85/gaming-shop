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

// --- HELPER: CHECK USER CÓ OWNER ROLE ---
const checkUserHasOwnerRole = async (discordId) => {
    try {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        if (!guild) return false;
        const member = await guild.members.fetch(discordId);
        const ownerRoleId = process.env.DISCORD_OWNER_ROLE_ID;
        return member.roles.cache.has(ownerRoleId);
    } catch (e) { return false; }
};

// --- TICKET: PayPal F&F (tên paypal_1, paypal_2...; khác với ticket CashApp/Robux) ---
const createPayPalFFTicket = async (order, paypalSeq) => {
    try {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const category = await guild.channels.fetch(process.env.DISCORD_TICKET_CATEGORY_ID);
        const channelName = `paypal_${paypalSeq}`;

        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category ? category.id : null,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: order.discordId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: process.env.DISCORD_OWNER_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ],
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

        await channel.send({
            content: `<@${order.discordId}> <@&${process.env.DISCORD_OWNER_ROLE_ID}>`,
            embeds: [embed]
        });

        return channel.id;
    } catch (error) { console.error("PayPal F&F Ticket Error:", error); }
};

// --- TICKET: CashApp/Robux (tên nm_1, nm_2...) ---
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

        await channel.send({ 
            content: `<@${order.discordId}> <@&${process.env.DISCORD_OWNER_ROLE_ID}>`, 
            embeds: [orderEmbed], 
            components: [row] 
        });

        return channel.id;
    } catch (error) { console.error("Ticket Error:", error); }
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
    const OWNER_ID = '1146730730060271736';

    // !close - đóng ticket, đánh dấu đã thanh toán
    if (cmd === '!close') {
        const chName = message.channel.name;
        const isCashAppRobux = chName.startsWith('order_') || chName.startsWith('nm_');
        const isPayPalFF = chName.startsWith('paypal_');
        if (!isCashAppRobux && !isPayPalFF) return;

        const isAdmin = message.member?.roles?.cache?.has(process.env.DISCORD_OWNER_ROLE_ID) || message.author.id === OWNER_ID;
        const order = isCashAppRobux
            ? await Order.findOne({ orderId: chName })
            : await Order.findOne({ paypalTicketChannel: chName });
        const isCustomer = order && order.discordId === message.author.id;

        if (!isAdmin && !isCustomer) return message.reply('Only the customer or staff can close this ticket.');
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
        if (message.author.id !== OWNER_ID) {
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
        if (message.author.id !== OWNER_ID) {
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
        if (message.author.id !== OWNER_ID) {
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
module.exports = { client, createOrderTicket, createPayPalFFTicket, checkUserInGuild, checkUserHasOwnerRole };