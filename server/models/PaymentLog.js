const mongoose = require('mongoose');

const paymentLogSchema = new mongoose.Schema({
    provider: { type: String, default: 'paypal_ipn', index: true },
    source: { type: String, default: 'paypal_ipn' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    rawBody: { type: String, default: '' },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    verificationStatus: {
        type: String,
        enum: ['received', 'verified', 'invalid', 'error'],
        default: 'received',
        index: true
    },
    processingStatus: {
        type: String,
        enum: [
            'received',
            'ignored',
            'paid',
            'duplicate',
            'invalid',
            'failed',
            'order_not_found',
            'memo_mismatch',
            'receiver_mismatch',
            'amount_mismatch',
            'currency_mismatch'
        ],
        default: 'received',
        index: true
    },
    orderId: { type: String, default: '', index: true },
    txnId: { type: String, default: '', index: true },
    paypalVerifyResponse: { type: String, default: '' },
    message: { type: String, default: '' },
    error: { type: String, default: '' },
    replayOf: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentLog', default: null }
}, { timestamps: true });

paymentLogSchema.index({ createdAt: -1 });
paymentLogSchema.index({ provider: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentLog', paymentLogSchema);
