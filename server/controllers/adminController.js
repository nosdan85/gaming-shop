const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

exports.getStats = async (req, res) => {
    const totalRevenue = await Order.aggregate([
        { $match: { status: 'Completed' } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);
    const totalOrders = await Order.countDocuments();
    const totalUsers = await User.countDocuments();
    
    res.json({
        revenue: totalRevenue[0] ? totalRevenue[0].total : 0,
        orders: totalOrders,
        users: totalUsers
    });
};

exports.getAllOrders = async (req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
};

exports.updateOrderStatus = async (req, res) => {
    const { status } = req.body;
    await Order.findByIdAndUpdate(req.params.id, { status });
    res.json({ message: "Updated" });
};

// Logic thêm sửa xóa Product ở đây...