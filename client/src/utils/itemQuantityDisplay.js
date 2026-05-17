const ITEM_BASE_UNITS = new Map([
  ['abyss-sigil', 100000],
  ['aura-crate', 50],
  ['broken-sword', 100000],
  ['clan-reroll', 25000],
  ['cosmetic-crate', 70],
  ['dark-grail', 100000],
  ['frost-relic', 5000],
  ['mythic-chest', 10000],
  ['passive-shard', 200000],
  ['power-shard', 30000],
  ['race-reroll', 500000],
  ['secret-chest', 50],
  ['trait-reroll', 500000],
  ['upper-seal', 30000]
]);

const normalizeItemKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const getBaseUnits = (itemName) => {
  const key = normalizeItemKey(itemName);
  const mapped = Number(ITEM_BASE_UNITS.get(key));
  if (Number.isFinite(mapped) && mapped > 0) return mapped;
  return 1;
};

const formatCompactUnits = (value) => {
  const units = Math.max(0, Math.floor(Number(value) || 0));
  if (units >= 1000 && units % 1000 === 0) {
    return `${Math.floor(units / 1000)}k`;
  }
  return String(units);
};

export const getDeliveredUnits = (itemName, packQuantity) => {
  const base = getBaseUnits(itemName);
  const qty = Math.max(0, Math.floor(Number(packQuantity) || 0));
  return base * qty;
};

export const formatDeliveredUnitsLabel = (itemName, packQuantity) => {
  const delivered = getDeliveredUnits(itemName, packQuantity);
  return `x${formatCompactUnits(delivered)}`;
};
