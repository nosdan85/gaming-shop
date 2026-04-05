const jwt = require('jsonwebtoken');

const getBearerToken = (req) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice('Bearer '.length).trim();
    }
    return req.header('x-auth-token') || '';
};

const authRequired = (req, res, next) => {
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ error: 'Server auth is not configured' });
    }

    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded?.discordId && decoded?.role !== 'admin') {
            return res.status(401).json({ error: 'Invalid auth token' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

module.exports = { authRequired };
