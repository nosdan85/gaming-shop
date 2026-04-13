require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { client } = require('./bot');
const { getDiscordGatewayStatus } = require('./config/discordGateway');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
const normalizeEnvValue = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith("'") && text.endsWith("'"))
    ) {
        return text.slice(1, -1).trim();
    }
    return text;
};
const trustProxyRaw = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
if (/^\d+$/.test(trustProxyRaw)) {
    app.set('trust proxy', Number(trustProxyRaw));
} else if (trustProxyRaw === 'true') {
    app.set('trust proxy', true);
} else if (trustProxyRaw === 'false') {
    app.set('trust proxy', false);
} else {
    app.set('trust proxy', 1);
}
const { isVercelRuntime, gatewayEnabled: shouldEnableBotGateway } = getDiscordGatewayStatus();
const forceHttpListen = String(process.env.FORCE_HTTP_LISTEN || '').trim().toLowerCase() === 'true';

const configuredOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const defaultDevOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = new Set([...configuredOrigins, ...defaultDevOrigins]);
const normalizeHostname = (hostname) => String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
const isAllowedOrigin = (origin) => {
    if (!origin || allowedOrigins.size === 0 || allowedOrigins.has(origin)) {
        return true;
    }

    try {
        const requestUrl = new URL(origin);
        const requestProtocol = requestUrl.protocol;
        const requestPort = requestUrl.port || '';
        const requestHost = normalizeHostname(requestUrl.hostname);

        for (const allowedOrigin of allowedOrigins) {
            try {
                const allowedUrl = new URL(allowedOrigin);
                const allowedProtocol = allowedUrl.protocol;
                const allowedPort = allowedUrl.port || '';
                const allowedHost = normalizeHostname(allowedUrl.hostname);

                if (
                    requestProtocol === allowedProtocol &&
                    requestPort === allowedPort &&
                    requestHost === allowedHost
                ) {
                    return true;
                }
            } catch {
                // Ignore malformed env values and keep checking the rest.
            }
        }
    } catch {
        return false;
    }

    return false;
};

app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
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
    console.error('Unhandled server error:', err?.message || err);
    if (res.headersSent) {
        return next(err);
    }
    const status = Number(err?.status);
    const safeStatus = Number.isFinite(status) && status >= 400 && status <= 599 ? status : 500;
    return res.status(safeStatus).json({
        error: safeStatus >= 500 ? 'Internal server error' : String(err?.message || 'Request failed')
    });
});

const normalizedBotToken = normalizeEnvValue(process.env.DISCORD_BOT_TOKEN);
if (normalizedBotToken && shouldEnableBotGateway) {
    client.login(normalizedBotToken).catch((err) => {
        console.error('Bot login failed:', err.message);
    });
    client.on('error', (err) => console.error('Bot error:', err.message));
} else if (normalizedBotToken && !shouldEnableBotGateway) {
    console.warn(
        'Discord gateway login disabled (DISCORD_ENABLE_GATEWAY=false or serverless runtime). ' +
        'Ticket message commands (!close) and auto-vouch from images will not run.'
    );
} else {
    console.warn('DISCORD_BOT_TOKEN missing - bot disabled');
}

const PORT = process.env.PORT || 5000;
const shouldStartHttpServer = !isVercelRuntime || forceHttpListen;
const connectMongo = async () => {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is not configured');
        return false;
    }
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected');
        return true;
    } catch (err) {
        console.error('MongoDB connection error:', err?.message || err);
        return false;
    }
};

const bootstrap = async () => {
    const mongoConnected = await connectMongo();
    if (shouldStartHttpServer) {
        const requireDbBeforeListen = String(process.env.REQUIRE_DB_BEFORE_LISTEN || 'true').trim().toLowerCase() !== 'false';
        if (requireDbBeforeListen && !mongoConnected) {
            process.exit(1);
            return;
        }
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    }
};

void bootstrap();

module.exports = app;
