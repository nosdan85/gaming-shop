const crypto = require('crypto');
const axios = require('axios');

const normalizeValue = (value) => String(value || '').trim();
const isProduction = () => normalizeValue(process.env.SQUARE_ENV).toLowerCase() === 'production';
const getSquareBaseUrl = () => (isProduction() ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com');
const getSquareVersion = () => normalizeValue(process.env.SQUARE_API_VERSION) || '2026-01-22';
const getSquareAccessToken = () => normalizeValue(process.env.SQUARE_ACCESS_TOKEN);
const getSquareApplicationId = () => normalizeValue(process.env.SQUARE_APPLICATION_ID);
const getSquareLocationId = () => normalizeValue(process.env.SQUARE_LOCATION_ID);
const getSquareWebhookSignatureKey = () => normalizeValue(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);
const getSquareEnvironment = () => (isProduction() ? 'production' : 'sandbox');

const getSquarePublicConfig = () => ({
    enabled: Boolean(getSquareApplicationId() && getSquareLocationId() && getSquareAccessToken()),
    applicationId: getSquareApplicationId(),
    locationId: getSquareLocationId(),
    environment: getSquareEnvironment()
});

const getSquareConfigError = () => {
    if (!getSquareApplicationId()) return 'SQUARE_APPLICATION_ID is missing';
    if (!getSquareLocationId()) return 'SQUARE_LOCATION_ID is missing';
    if (!getSquareAccessToken()) return 'SQUARE_ACCESS_TOKEN is missing';
    return '';
};

const createSquareCashAppPayment = async ({
    sourceId,
    amountCents,
    referenceCode,
    buyerDiscordId = ''
}) => {
    const configError = getSquareConfigError();
    if (configError) {
        return { ok: false, status: 'config_error', error: configError };
    }

    const safeSourceId = normalizeValue(sourceId);
    const safeReferenceCode = normalizeValue(referenceCode);
    const amount = Number(amountCents);
    if (!safeSourceId || !safeReferenceCode || !Number.isInteger(amount) || amount <= 0) {
        return { ok: false, status: 'invalid_request', error: 'Square payment request is invalid' };
    }

    try {
        const response = await axios.post(
            `${getSquareBaseUrl()}/v2/payments`,
            {
                source_id: safeSourceId,
                idempotency_key: `wallet_${safeReferenceCode}_${amount}`,
                amount_money: {
                    amount,
                    currency: 'USD'
                },
                location_id: getSquareLocationId(),
                reference_id: safeReferenceCode,
                note: `NosMarket wallet top-up ${safeReferenceCode}${buyerDiscordId ? ` (${buyerDiscordId})` : ''}`,
                autocomplete: true
            },
            {
                headers: {
                    Authorization: `Bearer ${getSquareAccessToken()}`,
                    'Content-Type': 'application/json',
                    'Square-Version': getSquareVersion()
                },
                timeout: 20000
            }
        );

        const payment = response.data?.payment || null;
        return {
            ok: Boolean(payment?.id),
            status: normalizeValue(payment?.status || 'unknown').toLowerCase(),
            payment
        };
    } catch (error) {
        const message = error?.response?.data
            ? JSON.stringify(error.response.data).slice(0, 1000)
            : normalizeValue(error?.message || error);
        console.error('Square create payment error:', message);
        return { ok: false, status: 'api_error', error: message };
    }
};

const verifySquareWebhookSignature = ({ rawBody, signature, notificationUrl }) => {
    const signatureKey = getSquareWebhookSignatureKey();
    const safeSignature = normalizeValue(signature);
    const safeRawBody = typeof rawBody === 'string' ? rawBody : '';
    const safeNotificationUrl = normalizeValue(notificationUrl);
    if (!signatureKey || !safeSignature || !safeRawBody || !safeNotificationUrl) return false;

    const expected = crypto
        .createHmac('sha256', signatureKey)
        .update(`${safeNotificationUrl}${safeRawBody}`)
        .digest('base64');

    const expectedBuffer = Buffer.from(expected, 'base64');
    const actualBuffer = Buffer.from(safeSignature, 'base64');
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

module.exports = {
    createSquareCashAppPayment,
    getSquareConfigError,
    getSquarePublicConfig,
    verifySquareWebhookSignature
};
