const Order = require('../models/Order');
const User = require('../models/User');
const mongoose = require('mongoose');
const {
    markOrderPaid,
    reprocessLatestIpnForOrder
} = require('../services/paypalFfService');

const ORDER_STATUS_VALUES = new Set(['Pending', 'Waiting Payment', 'Completed', 'Cancelled']);

exports.getStats = async (req, res) => {
    try {
        const totalRevenue = await Order.aggregate([
            { $match: { $or: [{ status: 'Completed' }, { paymentStatus: 'paid' }] } },
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

        const paymentStatus = nextStatus === 'Completed'
            ? 'paid'
            : (nextStatus === 'Cancelled' ? 'cancelled' : 'pending');
        const update = { status: nextStatus, paymentStatus };
        if (paymentStatus !== 'paid') {
            update.paidAt = null;
        }

        const updated = await Order.findByIdAndUpdate(orderId, update, { new: true });
        if (!updated) {
            return res.status(404).json({ message: 'Order not found' });
        }

        return res.json({ message: 'Updated', order: updated });
    } catch (error) {
        console.error('Admin updateOrderStatus error:', error?.message || error);
        return res.status(500).json({ message: 'Could not update order status' });
    }
};

exports.markOrderPaidManually = async (req, res) => {
    try {
        const orderObjectId = String(req.params?.id || '').trim();
        const txnId = String(req.body?.txnId || req.body?.txn_id || '').trim();
        const note = String(req.body?.note || '').trim();

        if (!mongoose.Types.ObjectId.isValid(orderObjectId)) {
            return res.status(400).json({ message: 'Invalid order id' });
        }
        if (!txnId) {
            return res.status(400).json({ message: 'txnId is required for manual confirmation' });
        }

        const duplicateOrder = await Order.findOne({
            _id: { $ne: orderObjectId },
            txnId,
            paymentStatus: 'paid'
        }).lean();
        if (duplicateOrder) {
            return res.status(409).json({
                message: `Transaction ID is already used by order ${duplicateOrder.orderId}`
            });
        }

        const order = await Order.findById(orderObjectId);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const updated = await markOrderPaid(order, {
            txnId,
            source: 'admin_manual',
            manualNote: note,
            confirmedBy: req.user?.role || 'admin'
        });

        return res.json({ message: 'Order marked paid', order: updated });
    } catch (error) {
        console.error('Admin manual paid error:', error?.message || error);
        return res.status(500).json({ message: 'Could not mark order paid' });
    }
};

exports.recheckOrderIpn = async (req, res) => {
    try {
        const orderObjectId = String(req.params?.id || '').trim();
        if (!mongoose.Types.ObjectId.isValid(orderObjectId)) {
            return res.status(400).json({ message: 'Invalid order id' });
        }

        const order = await Order.findById(orderObjectId);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const result = await reprocessLatestIpnForOrder(order);
        const refreshed = await Order.findById(orderObjectId);
        return res.json({
            message: result.status,
            ok: result.ok === true,
            logId: result.log?._id || null,
            order: refreshed
        });
    } catch (error) {
        console.error('Admin IPN recheck error:', error?.message || error);
        return res.status(500).json({ message: 'Could not recheck IPN' });
    }
};
