const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    discordUsername: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);