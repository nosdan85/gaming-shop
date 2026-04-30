/**
 * Payment Service - PayPal REST API + NOWPayments (LTC/Crypto)
 */
const axios = require('axios');

const normalizeValue = (value) => String(value || '').trim();
const isPlaceholderValue = (value) => /^<[^>]+>$/.test(normalizeValue(value));
const PAYPAL_CLIENT_ID = normalizeValue(process.env.PAYPAL_CLIENT_ID);
const PAYPAL_CLIENT_SECRET = normalizeValue(process.env.PAYPAL_CLIENT_SECRET);
const PAYPAL_IS_LIVE = process.env.PAYPAL_MODE === 'live';
const PAYPAL_BASE = PAYPAL_IS_LIVE ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const getBackendBaseUrl = () => process.env.WEBHOOK_BASE_URL || process.env.BACKEND_URL || '';

const getPayPalAccessToken = async () => {
    if (
        !PAYPAL_CLIENT_ID
        || !PAYPAL_CLIENT_SECRET
        || isPlaceholderValue(PAYPAL_CLIENT_ID)
        || isPlaceholderValue(PAYPAL_CLIENT_SECRET)
    ) {
        return null;
    }
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await axios.post(
        `${PAYPAL_BASE}/v1/oauth2/token`,
        'grant_type=client_credentials',
        { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return tokenRes.data?.access_token || null;
};

async function createPayPalOrder(orderId, totalAmount, returnUrl, cancelUrl) {
    try {
        const accessToken = await getPayPalAccessToken();
        if (!accessToken) return null;

        const orderRes = await axios.post(
            `${PAYPAL_BASE}/v2/checkout/orders`,
            {
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: { currency_code: 'USD', value: Number(totalAmount).toFixed(2) },
                    reference_id: orderId
                }],
                application_context: {
                    return_url: returnUrl,
                    cancel_url: cancelUrl
                }
            },
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );

        const approvalLink = orderRes.data?.links?.find((l) => l.rel === 'approve')?.href;
        return { orderId: orderRes.data?.id, approvalLink };
    } catch (err) {
        console.error('PayPal create order error:', err.response?.data || err.message);
        return null;
    }
}

async function capturePayPalOrder(paypalOrderId) {
    try {
        const accessToken = await getPayPalAccessToken();
        if (!accessToken) return { success: false, data: null };

        const captureRes = await axios.post(
            `${PAYPAL_BASE}/v2/checkout/orders/${paypalOrderId}/capture`,
            {},
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );

        return {
            success: captureRes.data?.status === 'COMPLETED',
            data: captureRes.data || null
        };
    } catch (err) {
        console.error('PayPal capture error:', err.response?.data || err.message);
        return { success: false, data: null };
    }
}

async function createLTCInvoice(orderId, totalAmountUSD, options = {}) {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    const backendBaseUrl = getBackendBaseUrl();
    if (!apiKey || !backendBaseUrl) return null;

    try {
        const callbackUrl = options.ipnCallbackUrl || `${backendBaseUrl}/api/shop/webhook/nowpayments`;
        const res = await axios.post(
            'https://api.nowpayments.io/v1/payment',
            {
                price_amount: totalAmountUSD,
                price_currency: 'usd',
                pay_currency: 'ltc',
                order_id: orderId,
                order_description: options.orderDescription || orderId,
                ipn_callback_url: callbackUrl
            },
            { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }
        );

        return {
            payAddress: res.data?.pay_address,
            payAmount: res.data?.pay_amount,
            payCurrency: res.data?.pay_currency,
            paymentId: res.data?.payment_id,
            paymentStatus: res.data?.payment_status,
            priceAmount: res.data?.price_amount,
            priceCurrency: res.data?.price_currency
        };
    } catch (err) {
        console.error('NOWPayments error:', err.response?.data || err.message);
        return null;
    }
}

module.exports = { createPayPalOrder, capturePayPalOrder, createLTCInvoice };
