const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
const Product = require('../models/Product');
const connectDB = require('../config/db');

const SHOP_DATA = {
    Chest: [
        { name: 'Aura Crate', oneTimePrice: '$0.02/1', bulkPriceString: '$0.015/1', image: 'aura-chest.png' },
        { name: 'Secret Chest', oneTimePrice: '$0.02/1', bulkPriceString: '$0.015/1', image: 'secret-chest.png' },
        { name: 'Cosmetic Crate', oneTimePrice: '$0.015/1', bulkPriceString: '$0.01/1', image: 'cosmetic-chest.png' },
        { name: 'Mythic Chest', oneTimePrice: '$1/8k', bulkPriceString: '$1/9k', image: 'mythic-chest.png' }
    ],
    Reroll: [
        { name: 'Trait Reroll', oneTimePrice: '$1/500k', bulkPriceString: '$1/600k', image: 'trait-reroll.png' },
        { name: 'Race Reroll', oneTimePrice: '$1/500k', bulkPriceString: '$1/600k', image: 'race-reroll.png' },
        { name: 'Clan Reroll', oneTimePrice: '$1/10k', bulkPriceString: '$1/12k', image: 'clan-reroll.png' }
    ],
    Shard: [
        { name: 'Passive Shard', oneTimePrice: '$1/200k', bulkPriceString: '$1/250k', image: 'passive-shard.png' },
        { name: 'Power Shard', oneTimePrice: '$1/30k', bulkPriceString: '$1/35k', image: 'power-shard.png' }
    ],
    Seal: [
        { name: 'Upper Seal', oneTimePrice: '$1/30k', bulkPriceString: '$1/35k', image: 'upper-seal.png' }
    ],
    Relic: [
        { name: 'Broken Sword', oneTimePrice: '$1/100k', bulkPriceString: '', image: 'broken-sword.png' },
        { name: 'Abyss Sigil', oneTimePrice: '$1/100k', bulkPriceString: '', image: 'abyss-sigil.png' },
        { name: 'Dark Grail', oneTimePrice: '$1/100k', bulkPriceString: '', image: 'dark-grail.png' },
        { name: 'Frost Relic', oneTimePrice: '$1/5k', bulkPriceString: '$1/10k', image: 'frost-relic.png' }
    ],
    Sets: [
        { name: 'Cid V2+F', oneTimePrice: '$2/1', bulkPriceString: '', image: 'Cid V2+F.png' },
        { name: 'Madara+F', oneTimePrice: '$2/1', bulkPriceString: '', image: 'Madara+F.png' },
        { name: 'Saber Alter+F', oneTimePrice: '$2/1', bulkPriceString: '', image: 'Saber Alter+F.png' },
        { name: 'Madoka', oneTimePrice: '$8/1', bulkPriceString: '', image: 'Madoka.png' },
        { name: 'Cartethyia+F', oneTimePrice: '$2/1', bulkPriceString: '', image: 'Cartethyia+F.png' },
        { name: 'Gilgamesh+F', oneTimePrice: '$2/1', bulkPriceString: '', image: 'Gilgamesh+F.png' },
        { name: 'Aizen V2+F', oneTimePrice: '$2/1', bulkPriceString: '', image: 'Aizen V2+F.png' },
        { name: 'Esdeath+F', oneTimePrice: '$2/1', bulkPriceString: '', image: 'Esdeath+F.png' },
        { name: 'Kokushibou+F', oneTimePrice: '$2/1', bulkPriceString: '', image: 'Kokushibou+F.png' }
    ],
    Combo: [
        { name: 'x2 luck', oneTimePrice: '$3/1', bulkPriceString: '', image: 'combo x2 luck+drop.png' },
        { name: 'x2 drop', oneTimePrice: '$3/1', bulkPriceString: '', image: 'combo x2 luck+drop.png' }
    ]
};

const PRICE_PATTERN = /^\s*\$?\s*([0-9]*\.?[0-9]+)\s*\/\s*([0-9a-zA-Z.,]+)\s*$/;

const roundMoney = (value, digits = 6) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const parseAmountToken = (token) => {
    if (typeof token !== 'string') return null;
    const raw = token.trim().toLowerCase().replace(/,/g, '');
    if (!raw) return null;

    const applyUnit = (value, suffix) => {
        if (!Number.isFinite(value) || value <= 0) return null;
        if (suffix === 'k') return value * 1000;
        if (suffix === 'm') return value * 1000000;
        return value;
    };

    const suffix = raw.endsWith('k') ? 'k' : raw.endsWith('m') ? 'm' : '';
    const body = suffix ? raw.slice(0, -1) : raw;

    if (/^\d{1,3}(\.\d{3})+$/.test(body)) {
        const grouped = Number(body.replace(/\./g, ''));
        return applyUnit(grouped, suffix);
    }

    const numeric = Number(body);
    return applyUnit(numeric, suffix);
};

const parsePriceSpec = (priceString) => {
    if (typeof priceString !== 'string') return null;
    const match = priceString.match(PRICE_PATTERN);
    if (!match) return null;

    const usd = Number(match[1]);
    const quantity = parseAmountToken(match[2]);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;

    return { usd, quantity };
};

const getBulkUnitPrice = (oneTimePrice, bulkPriceString) => {
    if (!bulkPriceString) return null;
    const regular = parsePriceSpec(oneTimePrice);
    const bulk = parsePriceSpec(bulkPriceString);
    if (!regular || !bulk) return null;

    const bulkPerUnit = bulk.usd / bulk.quantity;
    const converted = bulkPerUnit * regular.quantity;
    if (!Number.isFinite(converted) || converted <= 0) return null;
    return roundMoney(converted, 6);
};

const getRegularUnitPrice = (oneTimePrice) => {
    const regular = parsePriceSpec(oneTimePrice);
    if (!regular) return null;
    return roundMoney(regular.usd, 6);
};

const importData = async () => {
    try {
        await connectDB();

        console.log('Deleting old product data...');
        await Product.deleteMany({});

        const products = [];
        for (const [category, items] of Object.entries(SHOP_DATA)) {
            for (const item of items) {
                const regularUnitPrice = getRegularUnitPrice(item.oneTimePrice);
                const bulkUnitPrice = getBulkUnitPrice(item.oneTimePrice, item.bulkPriceString);

                if (!Number.isFinite(regularUnitPrice) || regularUnitPrice <= 0) {
                    console.warn(`Skip invalid price: ${item.name} (${item.oneTimePrice})`);
                    continue;
                }

                products.push({
                    name: item.name,
                    price: regularUnitPrice,
                    originalPriceString: item.oneTimePrice,
                    bulkPrice: bulkUnitPrice,
                    bulkPriceString: item.bulkPriceString || '',
                    image: item.image,
                    category
                });
            }
        }

        console.log(`Inserting ${products.length} Sailor Piece products...`);
        await Product.insertMany(products);
        console.log('Data imported successfully.');
        process.exit();
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
};

importData();
