const express = require('express');
const { processPayPalIpnRequest } = require('../services/paypalFfService');

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const result = await processPayPalIpnRequest(req);
        if (!result?.ok) {
            console.warn('PayPal IPN processed without payment update:', result?.status || 'unknown');
        }
        return res.status(200).send('');
    } catch (error) {
        console.error('PayPal IPN listener error:', error?.message || error);
        return res.status(500).send('');
    }
});

router.all('/', (req, res) => {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('');
});

module.exports = router;
