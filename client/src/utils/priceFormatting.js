const PRICE_PATTERN = /^\s*\$?\s*([0-9]*\.?[0-9]+)\s*\/\s*([0-9a-zA-Z.]+)\s*$/;

const formatNumber = (value, maxDecimals = 2) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  if (Math.abs(amount - Math.round(amount)) < 1e-9) return `${Math.round(amount)}`;
  return amount.toFixed(maxDecimals).replace(/\.?0+$/, '');
};

const safeDollarFallback = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '$0';
  return `$${formatNumber(amount)}`;
};

const parsePriceString = (priceString) => {
  if (typeof priceString !== 'string') return null;
  const match = priceString.match(PRICE_PATTERN);
  if (!match) return null;

  const usd = match[1];
  const quantity = match[2];
  return { usd, quantity };
};

const normalizeParsedPrice = (parsed) => {
  if (!parsed) return null;
  const usdNumber = Number(parsed.usd);
  const quantityNumber = Number(parsed.quantity);
  if (!Number.isFinite(usdNumber) || usdNumber <= 0) return parsed;
  if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) return parsed;

  if (usdNumber < 1) {
    return {
      usd: '1',
      quantity: formatNumber(quantityNumber / usdNumber)
    };
  }

  return {
    usd: formatNumber(usdNumber),
    quantity: formatNumber(quantityNumber)
  };
};

export const formatCardPrice = (priceString, fallbackPrice) => {
  const parsed = parsePriceString(priceString);
  if (!parsed) return safeDollarFallback(fallbackPrice);
  const normalized = normalizeParsedPrice(parsed);
  return `$${normalized.usd} = x${normalized.quantity}`;
};

export const formatPriceForSentence = (priceString, fallbackPrice) => {
  const parsed = parsePriceString(priceString);
  if (!parsed) return safeDollarFallback(fallbackPrice);
  const normalized = normalizeParsedPrice(parsed);
  return `$${normalized.usd} for ${normalized.quantity}`;
};
