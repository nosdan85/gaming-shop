const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    originalPriceString: { type: String },
    bulkPrice: { type: Number, default: null },
    bulkPriceString: { type: String, default: '' },
    image: { type: String, required: true },
    desc: { type: String },
    category: { type: String, required: true }
});

module.exports = mongoose.model('Product', productSchema);