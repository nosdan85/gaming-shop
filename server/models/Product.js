const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true }, // Lưu dạng số (e.g., 5.4)
    originalPriceString: { type: String }, // Lưu string gốc (e.g., "5.4$")
    image: { type: String, required: true },
    desc: { type: String },
    category: { type: String, required: true } // Game, Bundles, Best Seller, etc.
});

module.exports = mongoose.model('Product', productSchema);