// POST /api/save  { phone, token, action: 'load' | 'store', save? }
// Token comes from /api/auth; verified by recomputation, so there is no
// session table. Saves are whole-state JSON blobs, last write wins.
const { normalizePhone, tokenFor, timingSafeEqual, allowRate, getUser, redis } = require('./_util.js');

const MAX_SAVE_BYTES = 200_000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const body = req.body || {};
    const phone = normalizePhone(body.phone);
    if (!phone || typeof body.token !== 'string') {
      return res.status(400).json({ error: 'bad_request' });
    }

    if (!(await allowRate(req, 'save', 600, 3600))) {
      return res.status(429).json({ error: 'rate_limited' });
    }

    const user = await getUser(phone);
    if (!user || !timingSafeEqual(body.token, tokenFor(phone, user.pinHash))) {
      return res.status(401).json({ error: 'bad_token', message: 'Log in again.' });
    }

    if (body.action === 'load') {
      const raw = await redis('GET', `save:${phone}`);
      return res.status(200).json({ ok: true, save: raw ? JSON.parse(raw) : null });
    }

    if (body.action === 'store') {
      if (typeof body.save !== 'object' || body.save === null) {
        return res.status(400).json({ error: 'bad_save' });
      }
      const raw = JSON.stringify(body.save);
      if (raw.length > MAX_SAVE_BYTES) return res.status(413).json({ error: 'save_too_large' });
      await redis('SET', `save:${phone}`, raw);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'bad_action' });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
};
