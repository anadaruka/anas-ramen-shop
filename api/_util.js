// Shared helpers for the account/save API.
// Files starting with "_" are not exposed as routes by Vercel.
const crypto = require('crypto');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const SECRET = process.env.AUTH_SECRET || 'dev-only-secret';

// Upstash REST API: POST a command array to the base URL.
async function redis(...command) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('redis_not_configured');
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`redis_${command[0]}_${res.status}`);
  return (await res.json()).result;
}

// Phone is an identifier, not a verified number: digits only, 7–15 long.
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

function validPin(pin) {
  return /^[0-9]{4,8}$/.test(String(pin || ''));
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}

// Deterministic session token — verified by recomputing, no session store.
function tokenFor(phone, pinHash) {
  return crypto.createHmac('sha256', SECRET).update(phone + ':' + pinHash).digest('hex');
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Small per-IP rate limit so 4-digit PINs can't be brute-forced politely.
async function allowRate(req, bucket, max, windowSec) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const key = `rl:${bucket}:${ip}`;
  const n = await redis('INCR', key);
  if (n === 1) await redis('EXPIRE', key, windowSec);
  return n <= max;
}

async function getUser(phone) {
  const raw = await redis('GET', `user:${phone}`);
  return raw ? JSON.parse(raw) : null;
}

module.exports = {
  redis, normalizePhone, validPin, hashPin, tokenFor, timingSafeEqual, allowRate, getUser, crypto,
};
