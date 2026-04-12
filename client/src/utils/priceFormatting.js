const PRICE_PATTERN = /^\s*\$?\s*([0-9]*\.?[0-9]+)\s*\/\s*([0-9a-zA-Z.]+)\s*$/;

const safeDollarFallback = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '$0';
  const formatted = amount % 1 === 0 ? `${amount}` : `${amount}`;
  return `$${formatted}`;
};

const parsePriceString = (priceString) => {
  if (typeof priceString !== 'string') return null;
  const match = priceString.match(PRICE_PATTERN);
  if (!match) return null;

  const usd = match[1];
  const quantity = match[2];
  return { usd, quantity };
};

export const formatCardPrice = (priceString, fallbackPrice) => {
  const parsed = parsePriceString(priceString);
  if (!parsed) return safeDollarFallback(fallbackPrice);
  return `$${parsed.usd} = x${parsed.quantity}`;
};

export const formatPriceForSentence = (priceString, fallbackPrice) => {
  const parsed = parsePriceString(priceString);
  if (!parsed) return safeDollarFallback(fallbackPrice);
  return `$${parsed.usd} for ${parsed.quantity}`;
};
