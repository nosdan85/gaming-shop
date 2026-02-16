require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { client } = require('./bot'); // Import Bot Discord

const app = express();

// Middleware
app.use(cors({ origin: '*' })); // Cho phép mọi nơi truy cập
app.use(express.json());

// --- KHAI BÁO ROUTE (PHẢI GIỐNG HỆT DÒNG NÀY) ---
// Frontend gọi /api/shop/products -> Backend phải có /api/shop
app.use('/api/shop', require('./routes/shopRoutes')); 
// ------------------------------------------------

// Kết nối Database
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ DB Error:", err));

// Login Bot Discord
client.login(process.env.DISCORD_BOT_TOKEN);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));