const Order = require('../models/Order');
const User = require('../models/User');
const mongoose = require('mongoose');
const {
    markOrderPaid,
    reprocessLatestIpnForOrder
} = require('../services/paypalFfService');

const ORDER_STATUS_VALUES = new Set(['Pending', 'Waiting Payment', 'Completed', 'Cancelled']);

const log = require('../utils/loggingService').log;

const logAdminAction = (action, req, details = {}) => {
    log.info(`[ADMIN ${action}]`, {
        adminIp: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.requestId,
        ...details
    });
};

exports.getStats = async (req, res) => {
    const startTime = Date.now();
    logAdminAction('GET_STATS', req);
    try {
        const totalRevenue = await Order.aggregate([
            { $match: { $or: [{ status: 'Completed' }, { paymentStatus: 'paid' }] } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        const totalOrders = await Order.countDocuments();
        const totalUsers = await User.countDocuments();

        log.info('[ADMIN GET_STATS] Success', {
            requestId: req.requestId,
            revenue: totalRevenue[0]?.total || 0,
            orders: totalOrders,
            users: totalUsers,
            duration: `${Date.now() - startTime}ms`
        });

        return res.json({
            revenue: totalRevenue[0] ? totalRevenue[0].total : 0,
            orders: totalOrders,
            users: totalUsers
        });
    } catch (error) {
        log.error('[ADMIN GET_STATS] Error', {
            requestId: req.requestId,
            error: error?.message || error,
            duration: `${Date.now() - startTime}ms`
        });
        return res.status(500).json({ message: 'Could not load dashboard stats' });
    }
};

exports.getAllOrders = async (req, res) => {
    const startTime = Date.now();
    logAdminAction('GET_ALL_ORDERS', req);
    try {
        const page = Math.max(1, Number(req.query?.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 50));
        const skip = (page - 1) * limit;

        const [orders, total] = await Promise.all([
            Order.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Order.countDocuments()
        ]);

        log.info('[ADMIN GET_ALL_ORDERS] Success', {
            requestId: req.requestId,
            page,
            limit,
            count: orders.length,
            total,
            duration: `${Date.now() - startTime}ms`
        });

        return res.json({
            orders,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        log.error('[ADMIN GET_ALL_ORDERS] Error', {
            requestId: req.requestId,
            error: error?.message || error,
            duration: `${Date.now() - startTime}ms`
        });
        return res.status(500).json({ message: 'Could not load orders' });
    }
};

exports.updateOrderStatus = async (req, res) => {
    const startTime = Date.now();
    const orderId = String(req.params?.id || '').trim();
    const nextStatus = String(req.body?.status || '').trim();

    logAdminAction('UPDATE_ORDER_STATUS', req, {
        orderId,
        newStatus: nextStatus
    });

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            log.warn('[ADMIN UPDATE_ORDER_STATUS] Invalid order ID', { orderId });
            return res.status(400).json({ message: 'Invalid order id' });
        }
        if (!ORDER_STATUS_VALUES.has(nextStatus)) {
            log.warn('[ADMIN UPDATE_ORDER_STATUS] Invalid status', { orderId, status: nextStatus });
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
            log.warn('[ADMIN UPDATE_ORDER_STATUS] Order not found', { orderId });
            return res.status(404).json({ message: 'Order not found' });
        }

        log.info('[ADMIN UPDATE_ORDER_STATUS] Success', {
            requestId: req.requestId,
            orderId,
            oldStatus: updated.status,
            newStatus: nextStatus,
            paymentStatus,
            duration: `${Date.now() - startTime}ms`
        });

        return res.json({ message: 'Updated', order: updated });
    } catch (error) {
        log.error('[ADMIN UPDATE_ORDER_STATUS] Error', {
            requestId: req.requestId,
            orderId,
            error: error?.message || error,
            duration: `${Date.now() - startTime}ms`
        });
        return res.status(500).json({ message: 'Could not update order status' });
    }
};

exports.markOrderPaidManually = async (req, res) => {
    const startTime = Date.now();
    const orderObjectId = String(req.params?.id || '').trim();
    const txnId = String(req.body?.txnId || req.body?.txn_id || '').trim();
    const note = String(req.body?.note || '').trim();

    logAdminAction('MARK_ORDER_PAID_MANUAL', req, {
        orderObjectId,
        txnId: txnId ? '[PROVIDED]' : '[MISSING]',
        note: note ? '[PROVIDED]' : '[EMPTY]'
    });

    try {
        if (!mongoose.Types.ObjectId.isValid(orderObjectId)) {
            log.warn('[ADMIN MARK_ORDER_PAID_MANUAL] Invalid order ID', { orderObjectId });
            return res.status(400).json({ message: 'Invalid order id' });
        }
        if (!txnId) {
            log.warn('[ADMIN MARK_ORDER_PAID_MANUAL] Missing txnId', { orderObjectId });
            return res.status(400).json({ message: 'txnId is required for manual confirmation' });
        }

        const duplicateOrder = await Order.findOne({
            _id: { $ne: orderObjectId },
            txnId,
            paymentStatus: 'paid'
        }).lean();
        if (duplicateOrder) {
            log.warn('[ADMIN MARK_ORDER_PAID_MANUAL] Duplicate txnId', {
                orderObjectId,
                duplicateOrderId: duplicateOrder.orderId
            });
            return res.status(409).json({
                message: `Transaction ID is already used by order ${duplicateOrder.orderId}`
            });
        }

        const order = await Order.findById(orderObjectId);
        if (!order) {
            log.warn('[ADMIN MARK_ORDER_PAID_MANUAL] Order not found', { orderObjectId });
            return res.status(404).json({ message: 'Order not found' });
        }

        const updated = await markOrderPaid(order, {
            txnId,
            source: 'admin_manual',
            manualNote: note,
            confirmedBy: req.user?.role || 'admin'
        });

        log.info('[ADMIN MARK_ORDER_PAID_MANUAL] Success', {
            requestId: req.requestId,
            orderObjectId,
            orderId: updated.orderId,
            txnId,
            duration: `${Date.now() - startTime}ms`
        });

        return res.json({ message: 'Order marked paid', order: updated });
    } catch (error) {
        log.error('[ADMIN MARK_ORDER_PAID_MANUAL] Error', {
            requestId: req.requestId,
            orderObjectId,
            error: error?.message || error,
            duration: `${Date.now() - startTime}ms`
        });
        return res.status(500).json({ message: 'Could not mark order paid' });
    }
};

exports.recheckOrderIpn = async (req, res) => {
    const startTime = Date.now();
    const orderObjectId = String(req.params?.id || '').trim();

    logAdminAction('RECHECK_ORDER_IPN', req, { orderObjectId });

    try {
        if (!mongoose.Types.ObjectId.isValid(orderObjectId)) {
            log.warn('[ADMIN RECHECK_ORDER_IPN] Invalid order ID', { orderObjectId });
            return res.status(400).json({ message: 'Invalid order id' });
        }

        const order = await Order.findById(orderObjectId);
        if (!order) {
            log.warn('[ADMIN RECHECK_ORDER_IPN] Order not found', { orderObjectId });
            return res.status(404).json({ message: 'Order not found' });
        }

        const result = await reprocessLatestIpnForOrder(order);
        const refreshed = await Order.findById(orderObjectId);

        log.info('[ADMIN RECHECK_ORDER_IPN] Success', {
            requestId: req.requestId,
            orderObjectId,
            orderId: order.orderId,
            resultStatus: result.status,
            ok: result.ok,
            duration: `${Date.now() - startTime}ms`
        });

        return res.json({
            message: result.status,
            ok: result.ok === true,
            logId: result.log?._id || null,
            order: refreshed
        });
    } catch (error) {
        log.error('[ADMIN RECHECK_ORDER_IPN] Error', {
            requestId: req.requestId,
            orderObjectId,
            error: error?.message || error,
            duration: `${Date.now() - startTime}ms`
        });
        return res.status(500).json({ message: 'Could not recheck IPN' });
    }
};
