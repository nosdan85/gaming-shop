const DEFAULT_DISCOUNT_PERCENT = 10;
const DEFAULT_COUPON_TIERS = [
    { count: 30, discountPercent: 5 },
    { count: 20, discountPercent: 10 },
    { count: 10, discountPercent: 20 },
    { count: 5, discountPercent: 35 }
];
const DEFAULT_TOTAL_CODES = DEFAULT_COUPON_TIERS.reduce((sum, tier) => sum + tier.count, 0);

const parseCouponCodesFromEnv = () => {
    const raw = String(process.env.COUPON_CODES || '').trim();
    if (!raw) return [];
    return raw
        .split(/[,\s]+/)
        .map((code) => String(code || '').trim())
        .filter(Boolean);
};

const normalizeCouponCode = (value) => String(value || '').trim().toUpperCase();

const buildDeterministicNumericCodes = (count) => {
    let state = 246813579;
    const codes = new Set();
    while (codes.size < count) {
        state = (state * 1664525 + 1013904223) >>> 0;
        const next = String(state).padStart(10, '0').slice(0, 10);
        codes.add(next);
    }
    return Array.from(codes);
};

const parseEnvCouponEntry = (entry) => {
    const [codeRaw, percentRaw = ''] = String(entry || '').split(':');
    const couponCode = normalizeCouponCode(codeRaw);
    if (!couponCode) return null;

    const parsedPercent = Number(percentRaw);
    const discountPercent = Number.isFinite(parsedPercent) && parsedPercent > 0
        ? Math.round(parsedPercent)
        : DEFAULT_DISCOUNT_PERCENT;

    return { couponCode, discountPercent };
};

const buildDefaultCouponConfigs = () => {
    const numericCodes = buildDeterministicNumericCodes(DEFAULT_TOTAL_CODES);
    const configs = [];
    let cursor = 0;
    for (const tier of DEFAULT_COUPON_TIERS) {
        for (let i = 0; i < tier.count; i += 1) {
            const couponCode = numericCodes[cursor];
            cursor += 1;
            configs.push({
                couponCode,
                discountPercent: tier.discountPercent
            });
        }
    }
    return configs;
};

const ALL_COUPON_CONFIGS = (() => {
    const envCodes = parseCouponCodesFromEnv()
        .map((entry) => parseEnvCouponEntry(entry))
        .filter(Boolean);
    if (envCodes.length > 0) return envCodes;
    return buildDefaultCouponConfigs();
})();
const COUPON_CONFIG_MAP = new Map(
    ALL_COUPON_CONFIGS.map((config) => [config.couponCode, Number(config.discountPercent) || DEFAULT_DISCOUNT_PERCENT])
);

const isSupportedCouponCode = (value) => COUPON_CONFIG_MAP.has(normalizeCouponCode(value));
const getCouponDiscountPercent = (value) => {
    const key = normalizeCouponCode(value);
    return Number(COUPON_CONFIG_MAP.get(key) || 0);
};

module.exports = {
    DEFAULT_DISCOUNT_PERCENT,
    DEFAULT_COUPON_CODES: Array.from(COUPON_CONFIG_MAP.keys()),
    DEFAULT_COUPON_TIERS,
    normalizeCouponCode,
    isSupportedCouponCode,
    getCouponDiscountPercent
};
