const express = require('express');
const router = express.Router();
const { getStats, getAllOrders, updateOrderStatus } = require('../controllers/adminController');
const jwt = require('jsonwebtoken');

// Middleware Auth
const adminAuth = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if(decoded.role !== 'admin') throw new Error();
        next();
    } catch (e) { res.status(401).json({ message: 'Token invalid' }); }
};

// Login Route
router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token });
    } else {
        res.status(400).json({ message: "Wrong Password" });
    }
});

router.use(adminAuth); // Bảo vệ các route dưới
router.get('/stats', getStats);
router.get('/orders', getAllOrders);
router.put('/order/:id', updateOrderStatus);

module.exports = router;