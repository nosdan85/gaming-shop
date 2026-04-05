require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { client } = require('./bot');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
app.set('trust proxy', 1);

const configuredOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const defaultDevOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = new Set([...configuredOrigins, ...defaultDevOrigins]);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.size === 0 || allowedOrigins.has(origin)) {
            return callback(null, true);
        }
        return callback(new Error('CORS_NOT_ALLOWED'));
    },
    credentials: true
}));

app.use(express.json({
    verify: (req, res, buffer) => {
        req.rawBody = buffer.toString();
    }
}));

app.use('/api', apiLimiter);
app.use('/api/shop', require('./routes/shopRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

app.get('/', (req, res) => res.status(200).json({ status: 'ok', service: 'gaming-shop' }));

app.use((err, req, res, next) => {
    if (err?.message === 'CORS_NOT_ALLOWED') {
        return res.status(403).json({ error: 'Origin is not allowed by CORS policy' });
    }
    return next(err);
});

if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not configured');
} else {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('MongoDB connected'))
        .catch((err) => console.error('MongoDB connection error:', err.message));
}

if (process.env.DISCORD_BOT_TOKEN) {
    client.login(process.env.DISCORD_BOT_TOKEN).catch((err) => {
        console.error('Bot login failed:', err.message);
    });
    client.on('error', (err) => console.error('Bot error:', err.message));
} else {
    console.warn('DISCORD_BOT_TOKEN missing - bot disabled');
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
