const axios = require('axios');
const qs = require('qs');
const Order = require('../models/Order');
const PaymentLog = require('../models/PaymentLog');
const {
    normalizeEmail,
    sendPaymentInstructionsEmail,
    sendPaymentConfirmationEmail,
    sendPaymentReminderEmail
} = require('./emailService');

const ORDER_CODE_PATTERN = /\bnm[_-]?\d+\b/i;
const DEFAULT_PAYPAL_VERIFY_TIMEOUT_MS = 15000;

const normalizeEnvValue = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith("'") && text.endsWith("'"))
    ) {
        return text.slice(1, -1).trim();
    }
    return text;
};

const normalizeText = (value) => String(value || '').trim();
const normalizeLower = (value) => normalizeText(value).toLowerCase();
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getPayPalPaymentEmail = () => normalizeEnvValue(process.env.PAYPAL_PAYMENT_EMAIL)
    || normalizeEnvValue(process.env.PAYPAL_EMAIL)
    || '';

const getAllowedReceiverEmails = () => {
    const configured = [
        normalizeEnvValue(process.env.PAYPAL_RECEIVER_EMAILS),
        normalizeEnvValue(process.env.PAYPAL_EMAIL),
        normalizeEnvValue(process.env.PAYPAL_PAYMENT_EMAIL)
    ].join(',');
    return configured
        .split(',')
        .map((email) => normalizeEmail(email))
        .filter(Boolean);
};

const getExpectedCurrency = () => normalizeEnvValue(process.env.PAYPAL_IPN_CURRENCY || 'USD').toUpperCase();

const getPayPalVerifyUrl = () => {
    const mode = normalizeLower(process.env.PAYPAL_IPN_MODE || process.env.PAYPAL_MODE || 'live');
    if (mode === 'sandbox') return 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr';
    return 'https://ipnpb.paypal.com/cgi-bin/webscr';
};

const normalizeOrderCode = (value) => {
    const match = normalizeText(value).match(ORDER_CODE_PATTERN);
    if (!match) return '';
    const digits = match[0].match(/\d+/)?.[0] || '';
    return digits ? `nm_${digits}` : '';
};

const getDisplayOrderCode = (orderId) => normalizeText(orderId).replace(/-/g, '_').toUpperCase();

const formatItemsForMemo = (items) => {
    const names = Array.isArray(items)
        ? items
            .map((item) => normalizeText(item?.name))
            .filter(Boolean)
        : [];
    return names.join(', ').slice(0, 180) || 'Items';
};

const buildMemoExpected = (order) => {
    const orderCode = getDisplayOrderCode(order?.orderId || '');
    const items = formatItemsForMemo(order?.items || order?.products);
    return `NOSMARKET ${orderCode} - ${items}`.slice(0, 255);
};

const buildProductsSnapshot = (order) => {
    const sourceItems = Array.isArray(order?.items) ? order.items : [];
    return sourceItems.map((item) => ({
        product: item?.product || null,
        name: item?.name || '',
        quantity: Number(item?.quantity || 1),
        price: Number(item?.price || 0)
    }));
};

const getRawPayload = (req) => {
    if (typeof req?.rawBody === 'string' && req.rawBody.trim()) return req.rawBody;
    if (req?.body && typeof req.body === 'object') {
        return qs.stringify(req.body, { encode: true, indices: false });
    }
    return '';
};

const verifyPayPalIpnRaw = async (rawBody) => {
    const verifyBody = rawBody
        ? `cmd=_notify-validate&${rawBody}`
        : 'cmd=_notify-validate';
    const timeout = Number(process.env.PAYPAL_IPN_VERIFY_TIMEOUT_MS || DEFAULT_PAYPAL_VERIFY_TIMEOUT_MS);
    const response = await axios.post(getPayPalVerifyUrl(), verifyBody, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'NosMarket-IPN-Listener/1.0'
        },
        timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_PAYPAL_VERIFY_TIMEOUT_MS,
        transformRequest: [(data) => data]
    });
    return normalizeText(response.data);
};

const ensurePayPalFfInstructions = async (order, { sendEmail = false } = {}) => {
    if (!order) return null;

    const memoExpected = normalizeText(order.memoExpected) || buildMemoExpected(order);
    order.memoExpected = memoExpected;
    order.paymentMethod = 'paypal_ff';
    order.total = roundMoney(order.total || order.totalAmount || 0);
    order.products = Array.isArray(order.products) && order.products.length > 0
        ? order.products
        : buildProductsSnapshot(order);

    if (order.paymentStatus !== 'paid') {
        order.paymentStatus = 'pending';
        if (order.status !== 'Completed' && order.status !== 'Cancelled') {
            order.status = 'Waiting Payment';
        }
    }

    await order.save();

    const paypalEmail = getPayPalPaymentEmail();
    if (sendEmail && order.customerEmail && !order.paymentInstructionEmailSentAt) {
        try {
            const result = await sendPaymentInstructionsEmail({ order, paypalEmail, memoExpected });
            if (result.sent) {
                order.paymentInstructionEmailSentAt = new Date();
                await order.save();
            }
        } catch (error) {
            console.error('Payment instruction email error:', error?.message || error);
        }
    }

    return { order, memoExpected, paypalEmail };
};

const sendReminderForOrder = async (order) => {
    const instructions = await ensurePayPalFfInstructions(order);
    if (!instructions?.order?.customerEmail) {
        return { sent: false, skipped: true, reason: 'missing_customer_email' };
    }
    const result = await sendPaymentReminderEmail({
        order: instructions.order,
        paypalEmail: instructions.paypalEmail,
        memoExpected: instructions.memoExpected
    });
    if (result.sent) {
        instructions.order.paymentReminderEmailSentAt = new Date();
        await instructions.order.save();
    }
    return result;
};

const markOrderPaid = async (order, {
    txnId = '',
    source = 'paypal_ipn',
    logId = null,
    manualNote = '',
    confirmedBy = ''
} = {}) => {
    if (!order) return null;
    const wasPaid = order.paymentStatus === 'paid' || order.status === 'Completed';
    const safeTxnId = normalizeText(txnId);

    order.paymentStatus = 'paid';
    order.status = 'Completed';
    order.paymentMethod = order.paymentMethod || 'paypal_ff';
    if (safeTxnId) order.txnId = safeTxnId;
    if (!order.paidAt) order.paidAt = new Date();
    if (logId) order.ipnLogId = logId;
    if (manualNote) order.manualPaymentNote = manualNote;
    if (confirmedBy) order.manualPaymentConfirmedBy = confirmedBy;

    await order.save();

    if (!wasPaid && order.customerEmail && !order.paymentConfirmationEmailSentAt) {
        try {
            const result = await sendPaymentConfirmationEmail({ order, source });
            if (result.sent) {
                order.paymentConfirmationEmailSentAt = new Date();
                await order.save();
            }
        } catch (error) {
            console.error('Payment confirmation email error:', error?.message || error);
        }
    }

    return order;
};

const extractMemoText = (payload = {}) => [
    payload.memo,
    payload.custom,
    payload.transaction_subject,
    payload.item_name,
    payload.item_number,
    payload.invoice
].map((value) => normalizeText(value)).filter(Boolean).join(' ');

const extractOrderIdFromPayload = (payload = {}) => normalizeOrderCode(extractMemoText(payload));

const getPaymentAmount = (payload = {}) => {
    const amount = Number(payload.mc_gross ?? payload.payment_gross ?? 0);
    return Number.isFinite(amount) ? amount : 0;
};

const getPaymentCurrency = (payload = {}) => normalizeText(payload.mc_currency || payload.currency_code).toUpperCase();

const updateLogAndReturn = async (log, fields, result) => {
    Object.assign(log, fields);
    await log.save();
    return result;
};

const processPayPalIpnRaw = async ({
    rawBody,
    payload,
    req = null,
    source = 'paypal_ipn',
    replayOf = null
}) => {
    const parsedPayload = payload && typeof payload === 'object' && Object.keys(payload).length > 0
        ? payload
        : qs.parse(rawBody || '');
    const log = await PaymentLog.create({
        provider: 'paypal_ipn',
        source,
        ip: normalizeText(req?.ip || req?.headers?.['x-forwarded-for'] || ''),
        userAgent: normalizeText(req?.headers?.['user-agent'] || ''),
        rawBody: rawBody || qs.stringify(parsedPayload, { encode: true, indices: false }),
        payload: parsedPayload,
        orderId: extractOrderIdFromPayload(parsedPayload),
        txnId: normalizeText(parsedPayload.txn_id || ''),
        replayOf
    });

    let verifyResponse = '';
    try {
        verifyResponse = await verifyPayPalIpnRaw(log.rawBody);
    } catch (error) {
        return updateLogAndReturn(log, {
            verificationStatus: 'error',
            processingStatus: 'failed',
            error: error?.response?.data
                ? JSON.stringify(error.response.data).slice(0, 1000)
                : normalizeText(error?.message || error).slice(0, 1000)
        }, { ok: false, status: 'verify_error', log });
    }

    log.paypalVerifyResponse = verifyResponse;
    if (verifyResponse !== 'VERIFIED') {
        return updateLogAndReturn(log, {
            verificationStatus: 'invalid',
            processingStatus: 'invalid',
            message: 'PayPal returned INVALID for this IPN payload.'
        }, { ok: false, status: 'invalid', log });
    }

    log.verificationStatus = 'verified';

    if (normalizeText(parsedPayload.payment_status) !== 'Completed') {
        return updateLogAndReturn(log, {
            processingStatus: 'ignored',
            message: `Ignored payment_status=${normalizeText(parsedPayload.payment_status) || '(empty)'}`
        }, { ok: true, status: 'ignored', log });
    }

    const allowedReceiverEmails = getAllowedReceiverEmails();
    const receiverEmail = normalizeEmail(parsedPayload.receiver_email || parsedPayload.business);
    if (allowedReceiverEmails.length > 0 && !allowedReceiverEmails.includes(receiverEmail)) {
        return updateLogAndReturn(log, {
            processingStatus: 'receiver_mismatch',
            message: `Unexpected receiver_email=${receiverEmail || '(empty)'}`
        }, { ok: false, status: 'receiver_mismatch', log });
    }

    const orderId = extractOrderIdFromPayload(parsedPayload);
    if (!orderId) {
        return updateLogAndReturn(log, {
            processingStatus: 'memo_mismatch',
            message: 'Could not find order code in memo/custom fields.'
        }, { ok: false, status: 'memo_mismatch', log });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
        return updateLogAndReturn(log, {
            orderId,
            processingStatus: 'order_not_found',
            message: `Order ${orderId} was not found.`
        }, { ok: false, status: 'order_not_found', log });
    }
    log.orderId = order.orderId;

    const txnId = normalizeText(parsedPayload.txn_id || '');
    if (!txnId) {
        return updateLogAndReturn(log, {
            processingStatus: 'failed',
            message: 'Missing txn_id in verified IPN payload.'
        }, { ok: false, status: 'missing_txn_id', log, order });
    }

    if (txnId) {
        const duplicateOrder = await Order.findOne({
            txnId,
            _id: { $ne: order._id },
            paymentStatus: 'paid'
        }).lean();
        if (duplicateOrder) {
            return updateLogAndReturn(log, {
                processingStatus: 'duplicate',
                message: `txn_id is already attached to order ${duplicateOrder.orderId}.`
            }, { ok: false, status: 'duplicate_txn', log, order });
        }
    }

    const currency = getPaymentCurrency(parsedPayload);
    const expectedCurrency = getExpectedCurrency();
    if (currency && expectedCurrency && currency !== expectedCurrency) {
        return updateLogAndReturn(log, {
            processingStatus: 'currency_mismatch',
            message: `Expected ${expectedCurrency}, received ${currency}.`
        }, { ok: false, status: 'currency_mismatch', log, order });
    }

    const paidAmount = getPaymentAmount(parsedPayload);
    const expectedAmount = roundMoney(order.totalAmount || order.total || 0);
    if (paidAmount + 0.009 < expectedAmount) {
        return updateLogAndReturn(log, {
            processingStatus: 'amount_mismatch',
            message: `Expected at least ${expectedAmount.toFixed(2)}, received ${paidAmount.toFixed(2)}.`
        }, { ok: false, status: 'amount_mismatch', log, order });
    }

    const wasAlreadyPaid = order.paymentStatus === 'paid' || order.status === 'Completed';
    const paidOrder = await markOrderPaid(order, {
        txnId,
        source,
        logId: log._id
    });

    return updateLogAndReturn(log, {
        processingStatus: wasAlreadyPaid ? 'duplicate' : 'paid',
        message: wasAlreadyPaid
            ? `Order ${paidOrder.orderId} was already paid.`
            : `Order ${paidOrder.orderId} marked paid.`
    }, { ok: true, status: 'paid', log, order: paidOrder });
};

const processPayPalIpnRequest = async (req) => processPayPalIpnRaw({
    rawBody: getRawPayload(req),
    payload: req.body || {},
    req,
    source: 'paypal_ipn'
});

const reprocessLatestIpnForOrder = async (order) => {
    const orderId = normalizeText(order?.orderId);
    if (!orderId) return { ok: false, status: 'missing_order_id' };
    const regex = new RegExp(escapeRegex(orderId), 'i');
    const latest = await PaymentLog.findOne({
        provider: 'paypal_ipn',
        $or: [
            { orderId },
            { rawBody: regex },
            { 'payload.memo': regex },
            { 'payload.custom': regex },
            { 'payload.transaction_subject': regex },
            { 'payload.invoice': regex }
        ]
    }).sort({ createdAt: -1 });
    if (!latest) return { ok: false, status: 'no_ipn_log' };

    return processPayPalIpnRaw({
        rawBody: latest.rawBody,
        payload: latest.payload,
        source: 'admin_recheck',
        replayOf: latest._id
    });
};

module.exports = {
    buildMemoExpected,
    ensurePayPalFfInstructions,
    getPayPalPaymentEmail,
    markOrderPaid,
    processPayPalIpnRequest,
    processPayPalIpnRaw,
    reprocessLatestIpnForOrder,
    sendReminderForOrder
};
