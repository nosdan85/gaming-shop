const API_BASE = (() => {
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/+$/, '');
  return '/api';
})();

/**
 * Returns the full URL for a product image filename.
 * Tries the uploads server endpoint first, then falls back to client/public.
 */
export function getProductImageUrl(filename) {
  if (!filename) return '/products/aura-chest.png';
  const trimmed = String(filename).trim();
  if (!trimmed) return '/products/aura-chest.png';
  return `${API_BASE}/product-images/${encodeURIComponent(trimmed)}`;
}
