const Order = require('../models/Order');
const Product = require('../models/Product');
const Counter = require('../models/Counter');
const User = require('../models/User');
const { checkUserInGuild } = require('../bot');

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const MAX_QUANTITY_PER_PRODUCT = 100000;

exports.checkout = async (req, res) => {
    const { discordId, cartItems } = req.body || {};
    try {
        if (!discordId || !Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ message: 'Invalid request payload' });
        }

        const user = await User.findOne({ discordId });
        if (!user) {
            return res.status(400).json({ message: 'Discord not linked' });
        }

        const inGuild = await checkUserInGuild(discordId);
        if (inGuild === false) {
            return res.status(403).json({
                error_code: 'USER_NOT_IN_GUILD',
                message: 'You must join our Discord server to order.',
                invite_link: process.env.DISCORD_SERVER_INVITE || ''
            });
        }

        const quantityByProductId = new Map();
        for (const item of cartItems) {
            const productId = typeof item?._id === 'string' ? item._id.trim() : '';
            const quantity = Number(item?.quantity);
            if (!OBJECT_ID_PATTERN.test(productId)) continue;
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_PRODUCT) continue;
            quantityByProductId.set(productId, (quantityByProductId.get(productId) || 0) + quantity);
        }

        if (quantityByProductId.size === 0) {
            return res.status(400).json({ message: 'Cart empty or invalid items' });
        }

        const products = await Product.find({ _id: { $in: Array.from(quantityByProductId.keys()) } });
        if (products.length !== quantityByProductId.size) {
            return res.status(400).json({ message: 'Cart contains invalid products' });
        }

        const items = products.map((product) => {
            const quantity = quantityByProductId.get(String(product._id));
            return {
                product: product._id,
                name: product.name,
                quantity,
                price: Number(product.price) || 0
            };
        });
        const totalAmount = Number(
            items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0).toFixed(2)
        );
        if (totalAmount <= 0) {
            return res.status(400).json({ message: 'Invalid cart total' });
        }

        const counter = await Counter.findOneAndUpdate(
            { id: 'orderId' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        const orderId = `nm_${counter.seq}`;

        const newOrder = new Order({
            orderId,
            discordId: user.discordId,
            discordUsername: user.discordUsername || '',
            items,
            totalAmount,
            status: 'Pending',
            ticketStatus: 'pending',
            ticketError: ''
        });
        await newOrder.save();

        return res.json({
            message: 'Success',
            orderId,
            totalAmount
        });
    } catch (err) {
        console.error('Checkout Error:', err);
        return res.status(500).json({ message: 'Server Error' });
    }
};

exports.getProducts = async (req, res) => {
    try {
        const products = await Product.find().lean();
        return res.json(products);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

exports.linkDiscord = async (req, res) => {
    const { discordId, discordUsername } = req.body || {};

    if (!discordId || !discordUsername) {
        return res.status(400).json({ message: 'Missing discordId or discordUsername' });
    }

    try {
        let user = await User.findOne({ discordId });
        if (!user) {
            user = await User.create({ discordId, discordUsername });
        } else {
            user.discordUsername = discordUsername;
            await user.save();
        }

        return res.json({
            message: 'Linked successfully',
            user: {
                discordId: user.discordId,
                discordUsername: user.discordUsername
            }
        });
    } catch (err) {
        console.error('LinkDiscord Error:', err);
        return res.status(500).json({ message: 'Server Error' });
    }
};
