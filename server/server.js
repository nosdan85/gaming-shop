// Load .env (giữ nguyên như trước đây để tránh lỗi deploy)
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

// Health check for Render (phải trả 200 để deploy success)
app.get('/', (req, res) => res.status(200).json({ status: 'ok', service: 'gaming-shop' }));

// Login Bot Discord (không block server; lỗi bot không làm crash app)
if (process.env.DISCORD_BOT_TOKEN) {
  client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
    console.error('❌ Bot login failed:', err.message);
  });
  client.on('error', err => console.error('🤖 Bot error:', err.message));
} else {
  console.warn('⚠️ DISCORD_BOT_TOKEN missing — bot disabled');
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));