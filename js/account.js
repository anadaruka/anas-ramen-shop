// ============================================================
// Player accounts: phone + PIN (identifier, not SMS-verified).
// Talks to /api/auth and /api/save on the same origin.
// On the plain static dev server there is no /api — every call
// fails fast and the game plays as an offline guest.
// ============================================================

const AUTH_KEY = 'ramen-auth';

export function getAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; }
}

export function setAuth(auth) {
  try {
    if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    else localStorage.removeItem(AUTH_KEY);
  } catch (e) { /* private mode */ }
}

async function api(path, body, { keepalive = false } = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
  if (!res.ok || !data || data.error) {
    const err = new Error((data && data.message) || 'Server unavailable');
    err.code = (data && data.error) || `http_${res.status}`;
    throw err;
  }
  return data;
}

// Resolves { phone, token, created }
export function apiLogin(phone, pin) {
  return api('/api/auth', { phone, pin });
}

// Resolves the save object or null if the account has none yet
export async function apiLoadSave(auth) {
  const data = await api('/api/save', { ...auth, action: 'load' });
  return data.save;
}

export function apiStoreSave(auth, save, opts) {
  return api('/api/save', { ...auth, action: 'store', save }, opts);
}
