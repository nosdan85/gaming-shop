require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const { sendReminderForOrder } = require('../services/paypalFfService');

const HOURS_24_MS = 24 * 60 * 60 * 1000;

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

const main = async () => {
    const mongoUri = normalizeEnvValue(process.env.MONGO_URI);
    if (!mongoUri) {
        throw new Error('MONGO_URI is not configured');
    }

    await mongoose.connect(mongoUri);
    const cutoff = new Date(Date.now() - HOURS_24_MS);
    const pendingOrders = await Order.find({
        paymentMethod: 'paypal_ff',
        paymentStatus: 'pending',
        customerEmail: { $ne: '' },
        paymentReminderEmailSentAt: null,
        createdAt: { $lte: cutoff }
    }).sort({ createdAt: 1 }).limit(200);

    let sent = 0;
    let skipped = 0;
    for (const order of pendingOrders) {
        try {
            const result = await sendReminderForOrder(order);
            if (result.sent) sent += 1;
            else skipped += 1;
        } catch (error) {
            skipped += 1;
            console.error(`Reminder failed for ${order.orderId}:`, error?.message || error);
        }
    }

    console.log(`Pending payment reminders complete. Sent=${sent}, skipped=${skipped}.`);
};

main()
    .catch((error) => {
        console.error('Pending payment reminder job failed:', error?.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect().catch(() => {});
    });
