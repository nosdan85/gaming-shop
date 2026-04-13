const safeBase64UrlDecode = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  try {
    return atob(padded);
  } catch {
    return '';
  }
};

export const readJwtPayload = (token) => {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  const json = safeBase64UrlDecode(parts[1]);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const isAdminToken = (token) => {
  const payload = readJwtPayload(token);
  return payload?.role === 'admin' || payload?.type === 'admin';
};
