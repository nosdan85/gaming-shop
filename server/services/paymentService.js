/**
 * Payment Service - PayPal REST API + NOWPayments (LTC/Crypto)
 * Add PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, NOWPAYMENTS_API_KEY to .env
 */
const axios = require('axios');

const BASE_URL = process.env.CLIENT_URL || process.env.VITE_API_URL?.replace('gaming-shop-backend', 'nosmarket') || 'https://www.nosmarket.com';

// --- PayPal ---
async function createPayPalOrder(orderId, totalAmount, returnUrl, cancelUrl) {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !secret) return null;

    try {
        const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
        const tokenRes = await axios.post(
            process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com/v1/oauth2/token' : 'https://api-m.sandbox.paypal.com/v1/oauth2/token',
            'grant_type=client_credentials',
            { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const accessToken = tokenRes.data.access_token;

        const orderRes = await axios.post(
            process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com/v2/checkout/orders' : 'https://api-m.sandbox.paypal.com/v2/checkout/orders',
            {
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: { currency_code: 'USD', value: totalAmount.toFixed(2) },
                    reference_id: orderId,
                }],
                application_context: {
                    return_url: returnUrl || `${process.env.WEBHOOK_BASE_URL || 'https://gaming-shop-backend.onrender.com'}/api/shop/paypal/capture`,
                    cancel_url: cancelUrl || BASE_URL,
                },
            },
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );

        const approvalLink = orderRes.data.links?.find(l => l.rel === 'approve')?.href;
        return { orderId: orderRes.data.id, approvalLink };
    } catch (err) {
        console.error('PayPal create order error:', err.response?.data || err.message);
        return null;
    }
}

// --- NOWPayments (LTC) ---
async function createLTCInvoice(orderId, totalAmountUSD) {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) return null;

    try {
        const res = await axios.post(
            'https://api.nowpayments.io/v1/payment',
            {
                price_amount: totalAmountUSD,
                price_currency: 'usd',
                pay_currency: 'ltc',
                order_id: orderId,
                ipn_callback_url: `${process.env.WEBHOOK_BASE_URL || 'https://gaming-shop-backend.onrender.com'}/api/shop/webhook/nowpayments`,
            },
            { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }
        );
        return {
            payAddress: res.data.pay_address,
            payAmount: res.data.pay_amount,
            payCurrency: res.data.pay_currency,
            paymentId: res.data.payment_id,
        };
    } catch (err) {
        console.error('NOWPayments error:', err.response?.data || err.message);
        return null;
    }
}

async function capturePayPalOrder(paypalOrderId) {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !secret) return false;
    try {
        const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
        const tokenRes = await axios.post(
            process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com/v1/oauth2/token' : 'https://api-m.sandbox.paypal.com/v1/oauth2/token',
            'grant_type=client_credentials',
            { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const captureRes = await axios.post(
            `${process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'}/v2/checkout/orders/${paypalOrderId}/capture`,
            {},
            { headers: { Authorization: `Bearer ${tokenRes.data.access_token}`, 'Content-Type': 'application/json' } }
        );
        return captureRes.data.status === 'COMPLETED';
    } catch (err) {
        console.error('PayPal capture error:', err.response?.data);
        return false;
    }
}

module.exports = { createPayPalOrder, createLTCInvoice, capturePayPalOrder };
