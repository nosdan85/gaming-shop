const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true },
    image: { type: String, default: '' },
    active: { type: Boolean, default: true }
}, { timestamps: true });

// slug index already handled by unique: true in schema definition
gameSchema.index({ active: 1 });

module.exports = mongoose.model('Game', gameSchema);

