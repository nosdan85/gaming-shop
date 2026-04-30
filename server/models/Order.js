const mongoose = require('mongoose');

const paymentStatusValues = ['pending', 'paid', 'cancelled'];

const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    customerEmail: { type: String, default: '', trim: true, lowercase: true },
    discordId: { type: String, required: true },
    discordUsername: { type: String, default: '' },
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        quantity: Number,
        price: Number
    }],
    products: { type: [mongoose.Schema.Types.Mixed], default: [] },
    subtotalAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    couponCode: { type: String, default: '' },
    total: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: ['Pending', 'Waiting Payment', 'Completed', 'Cancelled'], default: 'Pending' },
    paymentMethod: { type: String, default: 'paypal_ff' },
    paymentStatus: { type: String, enum: paymentStatusValues, default: 'pending', index: true },
    memoExpected: { type: String, default: '', trim: true },
    txnId: { type: String, default: '', trim: true, index: true },
    paidAt: { type: Date, default: null },
    paymentInstructionEmailSentAt: { type: Date, default: null },
    paymentConfirmationEmailSentAt: { type: Date, default: null },
    paymentReminderEmailSentAt: { type: Date, default: null },
    manualPaymentNote: { type: String, default: '' },
    manualPaymentConfirmedBy: { type: String, default: '' },
    ipnLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentLog', default: null },
    paypalOrderId: { type: String },
    channelId: { type: String },
    ticketStatus: { type: String, enum: ['pending', 'creating', 'created', 'ready', 'failed', 'panel'], default: 'pending' },
    ticketLockUntil: { type: Date, default: null },
    ticketError: { type: String, default: '' },
    paypalTicketChannel: { type: String },
    paypalTicketChannelId: { type: String },
    paypalTicketStatus: { type: String, enum: ['pending', 'creating', 'created', 'failed'], default: 'pending' },
    paypalTicketLockUntil: { type: Date, default: null },
    paypalTicketError: { type: String, default: '' },
    ltcTicketChannel: { type: String },
    ltcTicketChannelId: { type: String },
    ltcTicketStatus: { type: String, enum: ['pending', 'creating', 'created', 'failed'], default: 'pending' },
    ltcTicketLockUntil: { type: Date, default: null },
    ltcTicketError: { type: String, default: '' }
}, { timestamps: true });

orderSchema.index({ createdAt: -1 });
orderSchema.index({ memoExpected: 1 });
orderSchema.index({ paymentMethod: 1, paymentStatus: 1, createdAt: -1 });

orderSchema.pre('validate', function syncPaymentAliases(next) {
    if (!Number.isFinite(Number(this.total)) || Number(this.total) <= 0) {
        this.total = Number(this.totalAmount || 0);
    }
    if (!Array.isArray(this.products) || this.products.length === 0) {
        this.products = Array.isArray(this.items)
            ? this.items.map((item) => ({
                product: item.product,
                name: item.name,
                quantity: item.quantity,
                price: item.price
            }))
            : [];
    }
    if (this.status === 'Completed') this.paymentStatus = 'paid';
    if (this.status === 'Cancelled') this.paymentStatus = 'cancelled';
    if (this.paymentStatus === 'paid') this.status = 'Completed';
    if (this.paymentStatus === 'cancelled') this.status = 'Cancelled';
    next();
});

module.exports = mongoose.model('Order', orderSchema);
