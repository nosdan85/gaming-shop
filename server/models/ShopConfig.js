const mongoose = require('mongoose');

const shopConfigSchema = new mongoose.Schema({
    _id: { type: String, default: 'singleton' },
    banners: [{ type: String }],
    bestSellerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    featuredProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
}, { timestamps: true });

shopConfigSchema.statics.getConfig = async function () {
    let config = await this.findById('singleton');
    if (!config) {
        config = await this.create({ _id: 'singleton', banners: [], bestSellerIds: [], featuredProductIds: [] });
    }
    return config;
};

module.exports = mongoose.model('ShopConfig', shopConfigSchema);
