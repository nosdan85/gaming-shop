const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const path = require('path');
const Order = require('./models/Order');

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
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const [action, method, ...rest] = interaction.customId.split('_');
    const orderId = rest.join('_');

    if (action === 'pay') {
        const methods = {
            'paypal': { name: 'PayPal', img: 'paypal.png' },
            'ltc': { name: 'Litecoin', img: 'ltc.png' },
            'cashapp': { name: 'CashApp', img: 'cashapp.png' },
            'apple': { name: 'Apple Pay', img: 'apple.png' }
        };
        const selected = methods[method];
        if (!selected) return;

        const imagePath = path.join(__dirname, `../client/public/pictures/payments/${selected.img}`);
        const file = new AttachmentBuilder(imagePath);
        
        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle(`Pay via ${selected.name}`)
            .setDescription(`Scan QR or use details below.\n**Upload screenshot proof here.**`)
            .setImage(`attachment://${selected.img}`);

        await interaction.reply({ embeds: [embed], files: [file] });
        await Order.findOneAndUpdate({ orderId }, { status: 'Waiting Payment', paymentMethod: method });
    }
});

// --- ADMIN COMMANDS ---
client.on('messageCreate', async message => {
    // Bỏ qua bot & DM
    if (message.author.bot || !message.guild) return;

    // CHỈ ADMIN ĐƯỢC DÙNG CÁC LỆNH NÀY
    const OWNER_ID = process.env.DISCORD_OWNER_ID || '123456789012345678'; // <-- ĐỔI TRONG .env HOẶC GIỮ NGUYÊN
    if (message.author.id !== OWNER_ID) return;

    const args = message.content.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    // 1) Xem nhanh người đã link trong DB (giữ nguyên logic cũ, đổi sang !linked_users)
    if (cmd === '!linked_users' || cmd === '!checkdb') {
        const User = require('./models/User');
        const users = await User.find({}).sort({ joinedAt: 1 });

        if (!users.length) {
            return message.reply('Hiện chưa có ai liên kết Discord với bot.');
        }

        let content = `**Total Linked Users:** ${users.length}\n`;
        users.slice(-50).forEach((u, idx) => { 
            content += `${idx + 1}. <@${u.discordId}> (${u.discordUsername})\n`;
        });
        if(users.length > 50) content += `...and ${users.length - 50} more.`;
        return message.reply(content);
    }

    // 2) GỬI DM CHO TẤT CẢ USER ĐÃ LIÊN KẾT KHI SERVER CŨ BỊ BAN / CHUYỂN SERVER MỚI
    // Cú pháp: !notify_new_server https://discord.gg/xxxx
    if (cmd === '!notify_new_server') {
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

    // 3) (OPTIONAL) ĐỂ USER TỰ /LINK BẰNG LỆNH TEXT
    // Cú pháp: !link  -> bot sẽ lấy ID & username hiện tại của người dùng
    if (cmd === '!link') {
        const User = require('./models/User');
        try {
            const existing = await User.findOne({ discordId: message.author.id });
            if (existing) {
                return message.reply('Bạn đã liên kết Discord với bot trước đó rồi.');
            }

            await User.create({
                discordId: message.author.id,
                discordUsername: message.author.tag,
            });

            return message.reply('Đã liên kết acc Discord của bạn với bot. Nếu server có vấn đề, bot sẽ DM cho bạn.');
        } catch (err) {
            console.error('Lỗi lệnh !link:', err);
            return message.reply('Đã xảy ra lỗi khi liên kết, vui lòng thử lại sau.');
        }
    }
});

// --- AUTO VOUCH (EMBED CHUẨN MẪU) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!message.channel.name.startsWith('order_')) return;
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