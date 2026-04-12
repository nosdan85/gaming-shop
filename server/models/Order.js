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
    ticketStatus: { type: String, enum: ['pending', 'creating', 'ready', 'failed', 'panel'], default: 'pending' },
    ticketError: { type: String, default: '' },
    paypalTicketChannel: { type: String },
    paypalTicketChannelId: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
