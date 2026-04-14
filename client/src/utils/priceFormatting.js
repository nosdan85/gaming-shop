const PRICE_PATTERN = /^\s*\$?\s*([0-9]*\.?[0-9]+)\s*\/\s*([0-9a-zA-Z.]+)\s*$/;

const formatNumber = (value, maxDecimals = 2) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  if (Math.abs(amount - Math.round(amount)) < 1e-9) return `${Math.round(amount)}`;
  return amount.toFixed(maxDecimals).replace(/\.?0+$/, '');
};
const normalizeDisplayAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  if (amount > 0 && amount < 1) return 1;
  return amount;
};

const safeDollarFallback = (value) => {
  const amount = normalizeDisplayAmount(value);
  if (!Number.isFinite(amount)) return '$0';
  return `$${formatNumber(amount)}`;
};

const parsePriceString = (priceString) => {
  if (typeof priceString !== 'string') return null;
  const match = priceString.match(PRICE_PATTERN);
  if (!match) return null;

  const usd = match[1];
  return { usd };
};

export const formatCardPrice = (priceString, fallbackPrice) => {
  const parsed = parsePriceString(priceString);
  if (!parsed) return safeDollarFallback(fallbackPrice);
  return `$${formatNumber(normalizeDisplayAmount(parsed.usd))}`;
};

export const formatPriceForSentence = (priceString, fallbackPrice) => {
  const parsed = parsePriceString(priceString);
  if (!parsed) return safeDollarFallback(fallbackPrice);
  return `$${formatNumber(normalizeDisplayAmount(parsed.usd))}`;
};
