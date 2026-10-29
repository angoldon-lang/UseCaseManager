'use strict';
const crypto = require('crypto');

const SESSION_HOURS = 12;
const MIN_PASSWORD = 10;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

function checkPasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return 'La password deve contenere almeno ' + MIN_PASSWORD + ' caratteri.';
  }
  return null;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  return { token, maxAge: SESSION_HOURS * 3600 };
}

function findSessionUser(db, token) {
  if (!token) {
    return null;
  }
  return db.prepare(
    `SELECT u.id, u.username, u.display_name AS displayName, u.email, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires > ? AND u.disabled = 0`
  ).get(sha256(token), Date.now()) || null;
}

function destroySession(db, token) {
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }
}

function permissionsFor(role) {
  const write = role === 'admin' || role === 'editor';
  return { canAdd: write, canEdit: write, canDelete: write };
}

/** Limita i tentativi di login falliti (per IP + utente). */
function createThrottle(maxFailures = 5, windowMs = 10 * 60 * 1000) {
  const failures = new Map();
  const prune = (key, now) => (failures.get(key) || []).filter((t) => now - t < windowMs);
  return {
    retryAfter(key) {
      const now = Date.now();
      const list = prune(key, now);
      failures.set(key, list);
      return list.length >= maxFailures ? Math.ceil((list[0] + windowMs - now) / 1000) : 0;
    },
    fail(key) {
      const now = Date.now();
      const list = prune(key, now);
      list.push(now);
      failures.set(key, list);
    },
    reset(key) {
      failures.delete(key);
    }
  };
}

module.exports = {
  hashPassword, verifyPassword, checkPasswordPolicy, createSession, findSessionUser, destroySession,
  permissionsFor, createThrottle, MIN_PASSWORD
};
