const mongoose = require('mongoose');

const linkSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, index: true },
    status: {
        type: String,
        enum: ['pending', 'verified', 'expired'],
        default: 'pending',
        index: true
    },
    discordId: { type: String, default: null },
    discordUsername: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
    verifiedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LinkSession', linkSessionSchema);
