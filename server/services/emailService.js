const nodemailer = require('nodemailer');

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

const normalizeEmail = (value) => normalizeEnvValue(value).toLowerCase();

const getMailFrom = () => normalizeEnvValue(process.env.MAIL_FROM)
    || normalizeEnvValue(process.env.SMTP_FROM)
    || normalizeEnvValue(process.env.SMTP_USER)
    || normalizeEnvValue(process.env.PAYPAL_EMAIL)
    || 'no-reply@nosmarket.com';

const getTransportConfig = () => {
    const host = normalizeEnvValue(process.env.SMTP_HOST);
    const user = normalizeEnvValue(process.env.SMTP_USER);
    const pass = normalizeEnvValue(process.env.SMTP_PASS);
    if (!host || !user || !pass) return null;

    const port = Number(process.env.SMTP_PORT || 587);
    const secureRaw = normalizeEnvValue(process.env.SMTP_SECURE).toLowerCase();
    return {
        host,
        port: Number.isFinite(port) ? port : 587,
        secure: secureRaw === 'true' || secureRaw === '1',
        auth: { user, pass }
    };
};

let transporter = null;

const getTransporter = () => {
    if (normalizeEnvValue(process.env.MAIL_DISABLED).toLowerCase() === 'true') return null;
    const config = getTransportConfig();
    if (!config) return null;
    if (!transporter) {
        transporter = nodemailer.createTransport(config);
    }
    return transporter;
};

const formatUsd = (value) => `$${Number(value || 0).toFixed(2)}`;

const formatItems = (items) => {
    const names = Array.isArray(items)
        ? items
            .map((item) => {
                const name = String(item?.name || '').trim();
                const quantity = Number(item?.quantity || 1);
                if (!name) return '';
                return quantity > 1 ? `${name} x${quantity}` : name;
            })
            .filter(Boolean)
        : [];
    return names.join(', ') || 'your items';
};

const buildEmailText = ({ order, title, bodyLines = [] }) => [
    title,
    '',
    `Order: ${order.orderId}`,
    `Total: ${formatUsd(order.totalAmount || order.total)}`,
    `Items: ${formatItems(order.items || order.products)}`,
    '',
    ...bodyLines,
    '',
    'NosMarket'
].join('\n');

const buildHtml = (text) => String(text || '')
    .split('\n')
    .map((line) => (line ? `<p>${line.replace(/[&<>]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;'
    }[char]))}</p>` : '<br>'))
    .join('');

const sendEmail = async ({ to, subject, text }) => {
    const recipient = normalizeEmail(to);
    if (!recipient) return { sent: false, skipped: true, reason: 'missing_recipient' };

    const mailer = getTransporter();
    if (!mailer) {
        console.warn(`Mail skipped for ${recipient}: SMTP_HOST/SMTP_USER/SMTP_PASS are not configured.`);
        return { sent: false, skipped: true, reason: 'smtp_not_configured' };
    }

    await mailer.sendMail({
        from: getMailFrom(),
        to: recipient,
        subject,
        text,
        html: buildHtml(text)
    });
    return { sent: true, skipped: false };
};

const sendPaymentInstructionsEmail = async ({ order, paypalEmail, memoExpected }) => {
    const text = buildEmailText({
        order,
        title: 'PayPal Friends and Family payment instructions',
        bodyLines: [
            `Send payment to: ${paypalEmail}`,
            'Method: Friends and Family',
            `PayPal note/memo to copy exactly: ${memoExpected}`,
            'Your order will be marked paid automatically after PayPal IPN confirms the transaction.'
        ]
    });
    return sendEmail({
        to: order.customerEmail,
        subject: `Payment instructions for ${order.orderId}`,
        text
    });
};

const sendPaymentConfirmationEmail = async ({ order }) => {
    const text = buildEmailText({
        order,
        title: 'Payment received',
        bodyLines: [
            'Your payment has been confirmed.',
            `Transaction ID: ${order.txnId || 'manual confirmation'}`
        ]
    });
    return sendEmail({
        to: order.customerEmail,
        subject: `Payment confirmed for ${order.orderId}`,
        text
    });
};

const sendPaymentReminderEmail = async ({ order, paypalEmail, memoExpected }) => {
    const text = buildEmailText({
        order,
        title: 'Payment reminder',
        bodyLines: [
            'Your order is still waiting for payment.',
            `Send payment to: ${paypalEmail}`,
            'Method: Friends and Family',
            `PayPal note/memo to copy exactly: ${memoExpected}`
        ]
    });
    return sendEmail({
        to: order.customerEmail,
        subject: `Payment reminder for ${order.orderId}`,
        text
    });
};

module.exports = {
    normalizeEmail,
    sendPaymentInstructionsEmail,
    sendPaymentConfirmationEmail,
    sendPaymentReminderEmail
};
