/**
 * Returns the URL for a product image filename.
 * Always uses the same-origin /products/ path so it works
 * regardless of which domain the app is served from.
 */
export function getProductImageUrl(filename) {
  if (!filename) return '/products/aura-chest.png';
  const trimmed = String(filename).trim();
  if (!trimmed) return '/products/aura-chest.png';
  return `/products/${encodeURIComponent(trimmed)}`;
}
