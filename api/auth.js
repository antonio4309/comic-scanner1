import { kv } from '@vercel/kv';
import { pbkdf2Sync, randomBytes } from 'crypto';

const TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

function hashPw(pw) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(pw, salt, 100000, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}

function verifyPw(pw, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return pbkdf2Sync(pw, salt, 100000, 64, 'sha512').toString('hex') === hash;
}

function makeToken() { return randomBytes(32).toString('hex'); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, name, email, password } = req.body || {};

  if (action === 'verify') {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const sess = await kv.get(`session:${token}`);
    if (!sess) return res.status(401).json({ error: 'Session expired' });
    return res.status(200).json(sess);
  }

  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

  const emailKey = `user:${email.toLowerCase().trim()}`;

  if (action === 'register') {
    const existing = await kv.get(emailKey);
    if (existing) return res.status(400).json({ error: 'An account with that email already exists.' });

    const userId = randomBytes(8).toString('hex');
    const user = {
      id: userId,
      name: (name || '').trim() || email.split('@')[0],
      email: email.toLowerCase().trim(),
      passwordHash: hashPw(password),
      plan: 'free',
      features: ['export', 'lookup'],
      createdAt: Date.now()
    };
    await kv.set(emailKey, user);

    const token = makeToken();
    const sessData = { userId, name: user.name, email: user.email, plan: user.plan, features: user.features };
    await kv.set(`session:${token}`, sessData, { ex: TOKEN_TTL_SEC });
    return res.status(200).json({ token, ...sessData });
  }

  if (action === 'login') {
    const user = await kv.get(emailKey);
    if (!user || !verifyPw(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    const token = makeToken();
    const sessData = { userId: user.id, name: user.name, email: user.email, plan: user.plan, features: user.features };
    await kv.set(`session:${token}`, sessData, { ex: TOKEN_TTL_SEC });
    return res.status(200).json({ token, ...sessData });
  }

  if (action === 'change-password') {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const sess = await kv.get(`session:${token}`);
    if (!sess) return res.status(401).json({ error: 'Session expired' });

    const user = await kv.get(`user:${sess.email}`);
    if (!user || !verifyPw(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password too short' });

    user.passwordHash = hashPw(newPassword);
    await kv.set(`user:${sess.email}`, user);
    return res.status(200).json({ ok: true });
  }

  if (action === 'delete-account') {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const sess = await kv.get(`session:${token}`);
    if (!sess) return res.status(401).json({ error: 'Session expired' });
    await kv.del(`user:${sess.email}`);
    await kv.del(`inventory:${sess.userId}`);
    await kv.del(`session:${token}`);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
