// POST /api/auth  { phone, pin }
// One door for everyone: an unknown phone number opens a new shop with
// that PIN; a known number must present the matching PIN.
// Phone + PIN is an identifier, not verified SMS auth (prototype scope).
const {
  crypto, normalizePhone, validPin, hashPin, tokenFor, timingSafeEqual, allowRate, getUser, redis,
} = require('./_util.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const phone = normalizePhone(req.body && req.body.phone);
    const pin = req.body && req.body.pin;
    if (!phone) return res.status(400).json({ error: 'bad_phone', message: 'Enter a phone number (7–15 digits).' });
    if (!validPin(pin)) return res.status(400).json({ error: 'bad_pin', message: 'PIN must be 4–8 digits.' });

    if (!(await allowRate(req, 'auth', 30, 3600))) {
      return res.status(429).json({ error: 'rate_limited', message: 'Too many tries — wait a bit.' });
    }

    let user = await getUser(phone);
    let created = false;

    if (!user) {
      const salt = crypto.randomBytes(16).toString('hex');
      user = { salt, pinHash: hashPin(pin, salt), createdAt: Date.now() };
      // NX guards the race where two devices sign up the same number at once
      const set = await redis('SET', `user:${phone}`, JSON.stringify(user), 'NX');
      if (set === null) user = await getUser(phone); // lost the race — verify instead
      else created = true;
    }

    if (!created && !timingSafeEqual(hashPin(pin, user.salt), user.pinHash)) {
      return res.status(401).json({ error: 'wrong_pin', message: 'Wrong PIN for this number.' });
    }

    return res.status(200).json({ ok: true, created, phone, token: tokenFor(phone, user.pinHash) });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', message: 'Server hiccup — try again.' });
  }
};
