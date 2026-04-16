const mongoose = require('mongoose');

const proofItemSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    packQuantity: { type: Number, default: 0 },
    deliveredLabel: { type: String, default: 'x0' },
    lineTotal: { type: Number, default: 0 }
}, { _id: false });

const proofSchema = new mongoose.Schema({
    orderId: { type: String, default: '' },
    discordId: { type: String, default: '' },
    discordUsername: { type: String, default: '' },
    totalAmount: { type: Number, default: 0 },
    items: { type: [proofItemSchema], default: [] },
    imageUrls: { type: [String], default: [] },
    vouchMessageIds: { type: [String], default: [] },
    source: { type: String, default: 'auto_vouch' },
    createdAt: { type: Date, default: Date.now }
});

proofSchema.index({ createdAt: -1 });
proofSchema.index({ orderId: 1 });

module.exports = mongoose.model('Proof', proofSchema);
