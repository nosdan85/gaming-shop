const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
    discordId: { type: String, required: true, index: true },
    discordUsername: { type: String, default: '' },
    type: {
        type: String,
        enum: ['topup', 'purchase', 'adjustment'],
        required: true,
        index: true
    },
    direction: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    amountCents: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'USD' },
    method: {
        type: String,
        enum: ['paypal_ff', 'cashapp', 'ltc', 'wallet', 'admin'],
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'rejected', 'cancelled'],
        default: 'pending',
        index: true
    },
    referenceCode: { type: String, default: '', trim: true, index: true },
    memoExpected: { type: String, default: '', trim: true },
    paymentAddress: { type: String, default: '', trim: true },
    txnId: { type: String, default: '', trim: true, index: true },
    orderId: { type: String, default: '', trim: true, index: true },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
    balanceAfterCents: { type: Number, default: null },
    adminNotes: { type: String, default: '', trim: true },
    reviewedBy: { type: String, default: '', trim: true },
    reviewedAt: { type: Date, default: null }
}, { timestamps: true });

walletTransactionSchema.index({ discordId: 1, createdAt: -1 });
walletTransactionSchema.index({ status: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
