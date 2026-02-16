// file: server/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { client } = require('./bot');

// Import Routes
const shopRoutes = require('./routes/shopRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Import Middleware
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();

// 1. Connect Database
connectDB();

// 2. Middlewares
app.use(cors({ 
    origin: process.env.CLIENT_URL, // Chỉ cho phép frontend gọi
    credentials: true 
}));
app.use(express.json());

// Apply Rate Limit cho toàn bộ API (Chống spam request)
app.use('/api', apiLimiter);

// 3. Routes Configuration
app.use('/api/shop', shopRoutes);   // Các tính năng mua hàng
app.use('/api/admin', adminRoutes); // Các tính năng quản lý

// 4. Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    
    // Start Discord Bot song song với Server
    client.login(process.env.DISCORD_BOT_TOKEN)
        .then(() => console.log("🤖 Discord Bot Online!"))
        .catch(err => console.error("❌ Bot Login Failed:", err));
});