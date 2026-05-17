/**
 * Returns the URL for a product image filename.
 * Handles both local paths (/products/...) and cloud URLs (imgbb etc.).
 */
export function getProductImageUrl(filename) {
  if (!filename) return '/products/aura-chest.png';
  const trimmed = String(filename).trim();
  if (!trimmed) return '/products/aura-chest.png';
  // Already a full URL (imgbb or other CDN) — return as-is
  if (trimmed.startsWith('http')) return trimmed;
  return `/products/${encodeURIComponent(trimmed)}`;
}
