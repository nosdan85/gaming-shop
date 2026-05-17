const mongoose = require('mongoose');

const proofImageSchema = new mongoose.Schema({
    proofId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Proof',
        required: true,
        index: true
    },
    orderId: { type: String, default: '' },
    position: { type: Number, required: true },
    contentType: { type: String, default: 'image/jpeg' },
    data: { type: Buffer, required: true },
    sourceUrl: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

proofImageSchema.index({ proofId: 1, position: 1 }, { unique: true });

module.exports = mongoose.model('ProofImage', proofImageSchema);
