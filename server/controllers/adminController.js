const Order = require('../models/Order');
const User = require('../models/User');
const mongoose = require('mongoose');

const ORDER_STATUS_VALUES = new Set(['Pending', 'Waiting Payment', 'Completed', 'Cancelled']);

exports.getStats = async (req, res) => {
    try {
        const totalRevenue = await Order.aggregate([
            { $match: { status: 'Completed' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        const totalOrders = await Order.countDocuments();
        const totalUsers = await User.countDocuments();

        return res.json({
            revenue: totalRevenue[0] ? totalRevenue[0].total : 0,
            orders: totalOrders,
            users: totalUsers
        });
    } catch (error) {
        console.error('Admin getStats error:', error?.message || error);
        return res.status(500).json({ message: 'Could not load dashboard stats' });
    }
};

exports.getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        return res.json(orders);
    } catch (error) {
        console.error('Admin getAllOrders error:', error?.message || error);
        return res.status(500).json({ message: 'Could not load orders' });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const orderId = String(req.params?.id || '').trim();
        const nextStatus = String(req.body?.status || '').trim();

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid order id' });
        }
        if (!ORDER_STATUS_VALUES.has(nextStatus)) {
            return res.status(400).json({ message: 'Invalid order status' });
        }

        const updated = await Order.findByIdAndUpdate(
            orderId,
            { status: nextStatus },
            { new: true }
        );
        if (!updated) {
            return res.status(404).json({ message: 'Order not found' });
        }

        return res.json({ message: 'Updated', order: updated });
    } catch (error) {
        console.error('Admin updateOrderStatus error:', error?.message || error);
        return res.status(500).json({ message: 'Could not update order status' });
    }
};
