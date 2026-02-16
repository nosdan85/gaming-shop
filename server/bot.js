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
    const MY_ID = '123456789012345678'; // <-- ID ADMIN CỦA BẠN
    if (message.author.id !== MY_ID) return;

    if (message.content === '!checkdb') {
        const User = require('./models/User');
        const users = await User.find({});
        let content = `**Total Linked Users:** ${users.length}\n`;
        users.slice(-20).forEach(u => { 
            content += `<@${u.discordId}> (${u.discordUsername})\n`;
        });
        if(users.length > 20) content += `...and ${users.length - 20} more.`;
        message.reply(content);
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