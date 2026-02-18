const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    discordUsername: { type: String, required: true },

    // Lưu token OAuth để có thể auto-join server / migrate sang server mới
    accessToken: { type: String },
    refreshToken: { type: String },
    tokenExpiresAt: { type: Date }, // thời điểm hết hạn accessToken
    scopes: [{ type: String }],

    linkToken: { type: String },
    linkTokenExpiresAt: { type: Date },

    joinedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);