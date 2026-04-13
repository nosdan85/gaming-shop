export const AUTH_SYNC_EVENT = 'auth-state-changed';

const safeParseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
};

export const readAuthState = () => {
  const storage = getStorage();
  if (!storage) return { user: null, token: '' };
  const user = safeParseJson(storage.getItem('user') || storage.getItem('discordUser'));
  const token = String(storage.getItem('token') || '');
  return { user, token };
};

export const writeAuthState = ({ user, token }) => {
  const storage = getStorage();
  if (!storage) return;

  if (user) {
    const serializedUser = JSON.stringify(user);
    storage.setItem('user', serializedUser);
    storage.setItem('discordUser', serializedUser);
  } else {
    storage.removeItem('user');
    storage.removeItem('discordUser');
  }

  if (token) {
    storage.setItem('token', token);
  } else {
    storage.removeItem('token');
  }
};

export const clearAuthState = () => {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem('user');
  storage.removeItem('discordUser');
  storage.removeItem('token');
};

export const emitAuthStateChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_SYNC_EVENT));
};

export const subscribeAuthStateChanges = (onChange) => {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => {
    if (event.type === AUTH_SYNC_EVENT) {
      onChange();
      return;
    }
    if (!event?.key || event.key === 'user' || event.key === 'discordUser' || event.key === 'token') {
      onChange();
    }
  };

  window.addEventListener('storage', handler);
  window.addEventListener(AUTH_SYNC_EVENT, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(AUTH_SYNC_EVENT, handler);
  };
};
