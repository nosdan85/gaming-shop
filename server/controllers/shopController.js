const Order = require('../models/Order');
const Product = require('../models/Product');
const Counter = require('../models/Counter');
const User = require('../models/User');
const { createOrderTicket, checkUserInGuild } = require('../bot'); // Import hàm check

exports.checkout = async (req, res) => {
    const { discordId, cartItems } = req.body;
    try {
        const user = await User.findOne({ discordId });
        if (!user) return res.status(400).json({ message: "Discord not linked" });

        // --- BƯỚC KIỂM TRA QUAN TRỌNG: JOIN SERVER ---
        const isInServer = await checkUserInGuild(discordId);
        
        if (!isInServer) {
            // Nếu chưa vào server, trả về mã lỗi đặc biệt để Frontend hiện bảng Join
            return res.status(403).json({ 
                error_code: "USER_NOT_IN_GUILD",
                message: "You must join our Discord Server to order.",
                invite_link: process.env.DISCORD_SERVER_INVITE // Link lấy từ .env
            });
        }
        // ----------------------------------------------

        // Tính tiền và Validate sản phẩm
        let totalAmount = 0;
        const items = [];
        for (const item of cartItems) {
            const product = await Product.findById(item._id);
            if (product) {
                totalAmount += product.price * item.quantity;
                items.push({
                    product: product._id,
                    name: product.name,
                    quantity: item.quantity,
                    price: product.price
                });
            }
        }

        if (items.length === 0) return res.status(400).json({ message: "Cart empty or invalid items" });

        // Tạo Order ID (order_fp_x)
        const counter = await Counter.findOneAndUpdate(
            { id: "orderId" }, 
            { $inc: { seq: 1 } }, 
            { new: true, upsert: true }
        );
        const orderIdStr = `order_fp_${counter.seq}`;

        // Lưu đơn hàng
        const newOrder = new Order({
            orderId: orderIdStr,
            user: user._id,
            discordId: user.discordId,
            items,
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            status: 'Pending'
        });

        await newOrder.save();
        
        // Gọi bot tạo ticket
        await createOrderTicket(newOrder);

        res.json({ message: "Success", orderId: orderIdStr });

    } catch (err) {
        console.error("Checkout Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
};

// Lấy danh sách sản phẩm
exports.getProducts = async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Link Discord từ website (DiscordModal) -> lưu vào collection User
exports.linkDiscord = async (req, res) => {
    const { discordId, discordUsername } = req.body;

    if (!discordId || !discordUsername) {
        return res.status(400).json({ message: 'Missing discordId or discordUsername' });
    }

    try {
        let user = await User.findOne({ discordId });

        if (!user) {
            user = await User.create({
                discordId,
                discordUsername,
            });
        } else {
            user.discordUsername = discordUsername;
            await user.save();
        }

        return res.json({
            message: 'Linked successfully',
            user: {
                discordId: user.discordId,
                discordUsername: user.discordUsername,
            },
        });
    } catch (err) {
        console.error('LinkDiscord Error:', err);
        return res.status(500).json({ message: 'Server Error' });
    }
};