const jwt = require('jsonwebtoken');

const getBearerToken = (req) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice('Bearer '.length).trim();
    }
    return req.header('x-auth-token') || '';
};

const verifyWithSecret = (token, secret) => {
    if (!token || !secret) return null;
    try {
        return jwt.verify(token, secret);
    } catch {
        return null;
    }
};

const verifyAnyJwtToken = (token) => {
    const userToken = verifyWithSecret(token, process.env.JWT_SECRET);
    if (userToken) return userToken;

    const adminSecret = process.env.JWT_ADMIN_SECRET || '';
    if (!adminSecret) return null;
    return verifyWithSecret(token, adminSecret);
};

const authRequired = (req, res, next) => {
    if (!process.env.JWT_SECRET && !process.env.JWT_ADMIN_SECRET) {
        return res.status(500).json({ error: 'Server auth is not configured' });
    }

    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifyAnyJwtToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (!decoded?.discordId && decoded?.role !== 'admin') {
        return res.status(401).json({ error: 'Invalid auth token' });
    }

    req.user = decoded;
    return next();
};

module.exports = {
    authRequired,
    getBearerToken,
    verifyAnyJwtToken
};
