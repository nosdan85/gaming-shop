const mongoose = require('mongoose');

const deliverySlotSchema = new mongoose.Schema({
    ownerDiscordId: { type: String, default: '', trim: true, index: true },
    ownerTimezone: { type: String, required: true, trim: true },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    active: { type: Boolean, default: true, index: true },
    note: { type: String, default: '', trim: true }
}, { timestamps: true });

deliverySlotSchema.index({ active: 1, startAt: 1 });

module.exports = mongoose.model('DeliverySlot', deliverySlotSchema);
