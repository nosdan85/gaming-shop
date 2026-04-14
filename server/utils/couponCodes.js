const DEFAULT_DISCOUNT_PERCENT = 10;
const DEFAULT_COUPON_CODES = [
    '8945271630', '1738409625', '6209541837', '4172963058', '9501384267',
    '2865407193', '7319046258', '5648231907', '1083756429', '3427591860',
    '6792084315', '2159637804', '4861750293', '9035612748', '1284073596',
    '7541093628', '2975318046', '8406721953', '3652149780', '5198037624',
    '7426803159', '1369542087', '6083195472', '9750318264', '2641805739',
    '8214736509', '3579021468', '6902847315', '1408962735', '5836174092',
    '7193250486', '2506749183', '9681437205', '4029186751', '8347052961',
    '1763928405', '5470813269', '6905132784', '2398741605', '8051279346',
    '4137602985', '9285017364', '3741968205', '6519402378', '2807369145',
    '7045192836', '1682037594', '5927481306', '8361705249', '2419058736'
];

const parseCouponCodesFromEnv = () => {
    const raw = String(process.env.COUPON_CODES || '').trim();
    if (!raw) return [];
    return raw
        .split(/[,\s]+/)
        .map((code) => String(code || '').trim())
        .filter(Boolean);
};

const normalizeCouponCode = (value) => String(value || '').trim().toUpperCase();

const ALL_COUPON_CODES = (() => {
    const envCodes = parseCouponCodesFromEnv();
    const source = envCodes.length > 0 ? envCodes : DEFAULT_COUPON_CODES;
    return source.map((code) => normalizeCouponCode(code));
})();
const DEFAULT_COUPON_SET = new Set(ALL_COUPON_CODES);

const isSupportedCouponCode = (value) => DEFAULT_COUPON_SET.has(normalizeCouponCode(value));

module.exports = {
    DEFAULT_DISCOUNT_PERCENT,
    DEFAULT_COUPON_CODES: ALL_COUPON_CODES,
    normalizeCouponCode,
    isSupportedCouponCode
};
