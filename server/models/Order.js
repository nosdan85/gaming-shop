const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    discordId: { type: String, required: true },
    discordUsername: { type: String, default: '' },
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        quantity: Number,
        price: Number
    }],
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: ['Pending', 'Waiting Payment', 'Completed', 'Cancelled'], default: 'Pending' },
    paymentMethod: { type: String, default: null },
    paypalOrderId: { type: String },
    channelId: { type: String },
    paypalTicketChannel: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);