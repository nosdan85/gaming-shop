const DEFAULT_DISCOUNT_PERCENT = 10;
const DEFAULT_COUPON_CODES = Array.from(
    { length: 50 },
    (_, index) => `NOS10-${String(index + 1).padStart(3, '0')}`
);
const DEFAULT_COUPON_SET = new Set(DEFAULT_COUPON_CODES);

const normalizeCouponCode = (value) => String(value || '').trim().toUpperCase();

const isSupportedCouponCode = (value) => DEFAULT_COUPON_SET.has(normalizeCouponCode(value));

module.exports = {
    DEFAULT_DISCOUNT_PERCENT,
    DEFAULT_COUPON_CODES,
    normalizeCouponCode,
    isSupportedCouponCode
};
