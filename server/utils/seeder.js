const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
const Product = require('../models/Product');
const connectDB = require('../config/db');

const SHOP_DATA = {
    Chest: [
        {
            name: 'Aura Chest',
            priceNumber: 0.02,
            oneTimePrice: '$0.02/1',
            bulkPrice: '$0.015/1',
            image: 'aura-chest.png'
        },
        {
            name: 'Secret Chest',
            priceNumber: 0.02,
            oneTimePrice: '$0.02/1',
            bulkPrice: '$0.015/1',
            image: 'secret-chest.png'
        },
        {
            name: 'Cosmetic Chest',
            priceNumber: 0.015,
            oneTimePrice: '$0.015/1',
            bulkPrice: '$0.01/1',
            image: 'cosmetic-chest.png'
        },
        {
            name: 'Mythic Chest',
            priceNumber: 1,
            oneTimePrice: '$1/8.000',
            bulkPrice: '$1/9000',
            image: 'mythic-chest.png'
        }
    ],
    Reroll: [
        {
            name: 'Trait Reroll',
            priceNumber: 1,
            oneTimePrice: '$1/500k',
            bulkPrice: '$1/600k',
            image: 'trait-reroll.png'
        },
        {
            name: 'Race Reroll',
            priceNumber: 1,
            oneTimePrice: '$1/500k',
            bulkPrice: '$1/600k',
            image: 'race-reroll.png'
        },
        {
            name: 'Clan Reroll',
            priceNumber: 1,
            oneTimePrice: '$1/10000',
            bulkPrice: '$1/12000',
            image: 'clan-reroll.png'
        }
    ],
    Shard: [
        {
            name: 'Passive Shard',
            priceNumber: 1,
            oneTimePrice: '$1/200k',
            bulkPrice: '$1/250k',
            image: 'passive-shard.png'
        },
        {
            name: 'Power Shard',
            priceNumber: 1,
            oneTimePrice: '$1/30000',
            bulkPrice: '$1/35k',
            image: 'power-shard.png'
        }
    ],
    Seal: [
        {
            name: 'Upper Seal',
            priceNumber: 1,
            oneTimePrice: '$1/30000',
            bulkPrice: '$1/35000',
            image: 'upper-seal.png'
        }
    ],
    Relic: [
        {
            name: 'Broken Sword',
            priceNumber: 1,
            oneTimePrice: '$1/100k',
            bulkPrice: null,
            image: 'broken-sword.png'
        },
        {
            name: 'Abyss Sigil',
            priceNumber: 1,
            oneTimePrice: '$1/100k',
            bulkPrice: null,
            image: 'abyss-sigil.png'
        },
        {
            name: 'Dark Grail',
            priceNumber: 1,
            oneTimePrice: '$1/100k',
            bulkPrice: null,
            image: 'dark-grail.png'
        },
        {
            name: 'Frost Relic',
            priceNumber: 1,
            oneTimePrice: '$1/5k',
            bulkPrice: '$1/10k',
            image: 'frost-relic.png'
        }
    ]
};

const importData = async () => {
    try {
        await connectDB();

        console.log('Deleting old product data...');
        await Product.deleteMany({});

        const products = [];
        for (const [category, items] of Object.entries(SHOP_DATA)) {
            for (const item of items) {
                const bulkLabel = item.bulkPrice || 'No bulk price';
                products.push({
                    name: item.name,
                    price: item.priceNumber,
                    originalPriceString: item.oneTimePrice,
                    image: item.image,
                    desc: `One-time price: ${item.oneTimePrice}\nBulk price: ${bulkLabel}`,
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