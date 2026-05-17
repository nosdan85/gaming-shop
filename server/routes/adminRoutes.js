const express = require('express');
const router = express.Router();
const {
    getStats,
    getAllOrders,
    updateOrderStatus,
    markOrderPaidManually,
    recheckOrderIpn
} = require('../controllers/adminController');
const jwt = require('jsonwebtoken');
const { adminLoginLimiter } = require('../middleware/rateLimit');

const getToken = (req) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice('Bearer '.length).trim();
    }
    return req.header('x-auth-token');
};

const getAdminJwtSecret = () => process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET || '';

const adminAuth = (req, res, next) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: 'No token' });

    const adminJwtSecret = getAdminJwtSecret();
    if (!adminJwtSecret) return res.status(500).json({ message: 'JWT admin secret missing' });

    try {
        const decoded = jwt.verify(token, adminJwtSecret);
        if (decoded.role !== 'admin') throw new Error('Not admin');
        req.user = decoded;
        return next();
    } catch {
        return res.status(401).json({ message: 'Token invalid' });
    }
};

router.post('/login', adminLoginLimiter, (req, res) => {
    const { password } = req.body;
    const adminJwtSecret = getAdminJwtSecret();
    if (!adminJwtSecret) return res.status(500).json({ message: 'JWT admin secret missing' });
    if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ message: 'ADMIN_PASSWORD missing' });

    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(400).json({ message: 'Wrong Password' });
    }

    const token = jwt.sign({ role: 'admin', type: 'admin' }, adminJwtSecret, { expiresIn: '1d' });
    return res.json({ token });
});

router.use(adminAuth);
router.get('/stats', getStats);
router.get('/orders', getAllOrders);
router.put('/order/:id', updateOrderStatus);
router.post('/order/:id/mark-paid', markOrderPaidManually);
router.post('/order/:id/recheck-ipn', recheckOrderIpn);

module.exports = router;
