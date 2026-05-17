# PayPal Friends and Family IPN setup

This repo runs the IPN listener in Node/Express, not PHP. The public `https://www.nosmarket.com/ipn.php` path is rewritten by `client/vercel.json` to the backend listener at `https://gaming-shop-2.onrender.com/ipn.php`.

## PayPal

1. Use a PayPal Business account.
2. Enable Instant Payment Notification.
3. Set the listener URL to:

```text
https://www.nosmarket.com/ipn.php
```

The backend verifies IPN by posting the raw payload back to PayPal with `cmd=_notify-validate`. In sandbox, set `PAYPAL_IPN_MODE=sandbox`; in production, use `PAYPAL_IPN_MODE=live`.

## Backend env

```text
PAYPAL_EMAIL=your-paypal-receiver@example.com
PAYPAL_PAYMENT_EMAIL=your-paypal-receiver@example.com
PAYPAL_RECEIVER_EMAILS=your-paypal-receiver@example.com
PAYPAL_IPN_MODE=live
PAYPAL_IPN_CURRENCY=USD

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer@example.com
SMTP_PASS=secret
MAIL_FROM=NosMarket <mailer@example.com>
```

`PAYPAL_RECEIVER_EMAILS` can contain a comma-separated allowlist. If SMTP is missing, orders still work but emails are skipped and logged.

## Admin

Open:

```text
https://www.nosmarket.com/admin/orders.php
```

Login with `ADMIN_PASSWORD`. Pending PayPal F&F orders can be marked paid manually only from the admin panel, with a PayPal transaction ID.

## Reminder cron

Run this once per hour from your scheduler:

```bash
cd server && npm run send:payment-reminders
```

The job emails orders that are still `paymentStatus=pending` after 24 hours and have not already received a reminder.
