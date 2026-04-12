const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
const Product = require('../models/Product');
const connectDB = require('../config/db');

const SHOP_DATA = {
    Chest: [
        {
            name: 'Aura Crate',
            priceNumber: 0.02,
            oneTimePrice: '$0.02/1',
            bulkPriceNumber: 0.015,
            bulkPriceString: '$0.015/1',
            image: 'aura-chest.png'
        },
        {
            name: 'Secret Chest',
            priceNumber: 0.02,
            oneTimePrice: '$0.02/1',
            bulkPriceNumber: 0.015,
            bulkPriceString: '$0.015/1',
            image: 'secret-chest.png'
        },
        {
            name: 'Cosmetic Crate',
            priceNumber: 0.015,
            oneTimePrice: '$0.015/1',
            bulkPriceNumber: 0.01,
            bulkPriceString: '$0.01/1',
            image: 'cosmetic-chest.png'
        },
        {
            name: 'Mythic Chest',
            priceNumber: 1,
            oneTimePrice: '$1/8k',
            bulkPriceNumber: 1,
            bulkPriceString: '$1/9k',
            image: 'mythic-chest.png'
        }
    ],
    Reroll: [
        {
            name: 'Trait Reroll',
            priceNumber: 1,
            oneTimePrice: '$1/500k',
            bulkPriceNumber: 1,
            bulkPriceString: '$1/600k',
            image: 'trait-reroll.png'
        },
        {
            name: 'Race Reroll',
            priceNumber: 1,
            oneTimePrice: '$1/500k',
            bulkPriceNumber: 1,
            bulkPriceString: '$1/600k',
            image: 'race-reroll.png'
        },
        {
            name: 'Clan Reroll',
            priceNumber: 1,
            oneTimePrice: '$1/10k',
            bulkPriceNumber: 1,
            bulkPriceString: '$1/12k',
            image: 'clan-reroll.png'
        }
    ],
    Shard: [
        {
            name: 'Passive Shard',
            priceNumber: 1,
            oneTimePrice: '$1/200k',
            bulkPriceNumber: 1,
            bulkPriceString: '$1/250k',
            image: 'passive-shard.png'
        },
        {
            name: 'Power Shard',
            priceNumber: 1,
            oneTimePrice: '$1/30k',
            bulkPriceNumber: 1,
            bulkPriceString: '$1/35k',
            image: 'power-shard.png'
        }
    ],
    Seal: [
        {
            name: 'Upper Seal',
            priceNumber: 1,
            oneTimePrice: '$1/30k',
            bulkPriceNumber: 1,
            bulkPriceString: '$1/35k',
            image: 'upper-seal.png'
        }
    ],
    Relic: [
        {
            name: 'Broken Sword',
            priceNumber: 1,
            oneTimePrice: '$1/100k',
            bulkPriceNumber: null,
            bulkPriceString: '',
            image: 'broken-sword.png'
        },
        {
            name: 'Abyss Sigil',
            priceNumber: 1,
            oneTimePrice: '$1/100k',
            bulkPriceNumber: null,
            bulkPriceString: '',
            image: 'abyss-sigil.png'
        },
        {
            name: 'Dark Grail',
            priceNumber: 1,
            oneTimePrice: '$1/100k',
            bulkPriceNumber: null,
            bulkPriceString: '',
            image: 'dark-grail.png'
        },
        {
            name: 'Frost Relic',
            priceNumber: 1,
            oneTimePrice: '$1/5k',
            bulkPriceNumber: 1,
            bulkPriceString: '$1/10k',
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
                const bulkLabel = item.bulkPriceString || 'No bulk price';
                products.push({
                    name: item.name,
                    price: item.priceNumber,
                    originalPriceString: item.oneTimePrice,
                    bulkPrice: item.bulkPriceNumber,
                    bulkPriceString: item.bulkPriceString,
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
