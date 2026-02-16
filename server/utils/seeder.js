const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
const Product = require('../models/Product');
const connectDB = require('../config/db');

// ... (Giữ nguyên phần SHOP_DATA từ file cũ hoặc copy lại từ đoạn chat trước)
const SHOP_DATA = {
    "Bundles": [
        { name: "x3 Holiday Box", price: "3.5$", img: "3holidaybox.png", desc: "" },
        { name: "x10 Holiday Box", price: "10.2$", img: "10holidaybox.png", desc: "" },
        { name: "x50 Holiday Box", price: "51$", img: "50holidaybox.png", desc: "" },
        { name: "Ultimate Bundle 2025", price: "59.9$", img: "ultimatebundle2025.png", desc: "" }
    ],
    "Best Seller": [
        // Lưu ý: Đã đổi tên ảnh fruit storage cho khớp
        { name: "+1 Fruit Storage (2x)", price: "4.8$", img: "1fruitstorage.png", desc: "" }, 
        { name: "Permanent Dragon", price: "30$", img: "dragon.png", desc: "" },
        { name: "Permanent Kitsune", price: "24$", img: "kitsune.png", desc: "" },
        { name: "Permanent Buddha", price: "9.9$", img: "buddha.png", desc: "" },
        { name: "Dark Blade", price: "7.2$", img: "darkblade.png", desc: "" }
    ],
    "Permanent Fruits": [
        { name: "Permanent Dragon", price: "30$", img: "dragon.png", desc: "" },
        { name: "Permanent Control", price: "24$", img: "control.png", desc: "" },
        { name: "Permanent Kitsune", price: "24$", img: "kitsune.png", desc: "" },
        { name: "Permanent Yeti", price: "18$", img: "yeti.png", desc: "" },
        { name: "Permanent Tiger", price: "18$", img: "tiger.png", desc: "" },
        { name: "Permanent Spirit", price: "15.3$", img: "spirit.png", desc: "" },
        { name: "Permanent Gas", price: "15$", img: "gas.png", desc: "" },
        { name: "Permanent Venom", price: "14.7$", img: "venom.png", desc: "" },
        { name: "Permanent Shadow", price: "14.6$", img: "shadow.png", desc: "" },
        { name: "Permanent Dough", price: "14.4$", img: "dough.png", desc: "" },
        { name: "Permanent T-Rex", price: "14.1$", img: "trex.png", desc: "" },
        { name: "Permanent Mammoth", price: "14.1$", img: "mammoth.png", desc: "" },
        { name: "Permanent Gravity", price: "13.8$", img: "gravity.png", desc: "" },
        { name: "Permanent Blizzard", price: "13.5$", img: "blizzard.png", desc: "" },
        { name: "Permanent Pain", price: "13.2$", img: "pain.png", desc: "" },
        { name: "Permanent Lightning", price: "12.6$", img: "lightning.png", desc: "" },
        { name: "Permanent Portal", price: "12$", img: "portal.png", desc: "" },
        { name: "Permanent Phoenix", price: "12$", img: "phoenix.png", desc: "" },
        { name: "Permanent Sound", price: "11.4$", img: "sound.png", desc: "" },
        { name: "Permanent Spider", price: "10.8$", img: "spider.png", desc: "" },
        { name: "Permanent Creation", price: "10.5$", img: "creation.png", desc: "" },
        { name: "Permanent Love", price: "10.2$", img: "love.png", desc: "" },
        { name: "Permanent Buddha", price: "9.9$", img: "buddha.png", desc: "" },
        { name: "Permanent Quake", price: "9$", img: "quake.png", desc: "" },
        { name: "Permanent Magma", price: "7.8$", img: "magma.png", desc: "" },
        { name: "Permanent Ghost", price: "7.7$", img: "ghost.png", desc: "" },
        { name: "Permanent Rubber", price: "7.2$", img: "rubber.png", desc: "" },
        { name: "Permanent Light", price: "6.6$", img: "light.png", desc: "" },
        { name: "Permanent Diamond", price: "6$", img: "diamond.png", desc: "" },
        { name: "Permanent Eagle", price: "5.85$", img: "eagle.png", desc: "" },
        { name: "Permanent Dark", price: "5.7$", img: "dark.png", desc: "" },
        { name: "Permanent Sand", price: "5.1$", img: "sand.png", desc: "" },
        { name: "Permanent Ice", price: "4.5$", img: "ice.png", desc: "" },
        { name: "Permanent Flame", price: "3.3$", img: "flame.png", desc: "" },
        { name: "Permanent Smoke", price: "1.5$", img: "smoke.png", desc: "" },
        { name: "Permanent Bomb", price: "1.3$", img: "bomb.png", desc: "" }
    ],
    "Gamepass": [
        { name: "20,000 Simulation Data", price: "18$", img: "20000simulationdata.png", desc: "Large pack of Simulation Data." },
        { name: "10,000 Simulation Data", price: "9$", img: "10000simulationdata.png", desc: "Medium pack of Simulation Data." },
        { name: "6000 Simulation Data", price: "6$", img: "6000simulationdata.png", desc: "Small pack of Simulation Data." },
        { name: "2x Money + 2x Mastery", price: "5.4$", img: "2moneymastery.png", desc: "Doubles Money and Mastery EXP." },
        { name: "2x Boss Drops + Fast Boats", price: "4.2$", img: "2bossdropfastboat.png", desc: "Doubles drop chance and exclusive boats." },
        { name: "+1 Fruit Storage (2x)", price: "4.8$", img: "1fruitstorage.png", desc: "Store multiple of the same Blox Fruits." },
        { name: "3x Mythical Scrolls", price: "9$", img: "3mythicalscrolls.png", desc: "Chance for Blessing (Requires 3rd Sea)." },
        { name: "5x Legendary Scrolls", price: "4.8$", img: "5legendaryscrolls.png", desc: "Chance for Blessing (Requires 3rd Sea)." },
        { name: "Dark Blade", price: "7.2$", img: "darkblade.png", desc: "Mythical Dark Blade + Upgradable." },
        { name: "Fruit Notifier", price: "16.2$", img: "fruitnotifer.png", desc: "Locate spawned Blox Fruits." },
        { name: "EXP Boost [1 hr]", price: "0.6$", img: "expboost1hours.png", desc: "Boosts experience gain for 1 hour." },
        { name: "EXP Boost [6 hrs]", price: "2.7$", img: "expboost6hours.png", desc: "Boosts experience gain for 6 hours." },
        { name: "EXP Boost [12 hrs]", price: "5.1$", img: "expboost12hours.png", desc: "Boosts experience gain for 12 hours." },
        { name: "EXP Boost [24 hrs]", price: "9$", img: "expboost24hours.png", desc: "Boosts experience gain for 24 hours." },
        { name: "16,000 Fragments", price: "9$", img: "16000fragments.png", desc: "Currency for awakening fruits." },
        { name: "10,000 Fragments", price: "6$", img: "10000fragments.png", desc: "Currency for awakening fruits." },
        { name: "4500 Fragments", price: "3$", img: "4500fragments.png", desc: "Currency for awakening fruits." },
        { name: "2,100 Fragments", price: "1.5$", img: "2100fragments.png", desc: "Currency for awakening fruits." }
    ]
};
const importData = async () => {
    try {
        await connectDB();
        
        console.log('🗑️  Deleting OLD Data...');
        await Product.deleteMany({}); 

        const products = [];
        const seenNames = new Set(); // Bộ lọc tên trùng

        for (const [category, items] of Object.entries(SHOP_DATA)) {
            items.forEach(item => {
                // Chỉ thêm nếu tên chưa từng xuất hiện
                if (!seenNames.has(item.name)) {
                    seenNames.add(item.name);
                    products.push({
                        name: item.name,
                        price: parseFloat(item.price.replace('$', '')),
                        originalPriceString: item.price,
                        image: item.img, 
                        desc: item.desc,
                        category: category // Lấy category đầu tiên tìm thấy
                    });
                }
            });
        }

        console.log(`📦 Inserting ${products.length} UNIQUE products...`);
        await Product.insertMany(products);
        console.log('✅ Data Imported Successfully!');
        process.exit();
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

importData();