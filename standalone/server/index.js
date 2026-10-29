'use strict';
/**
 * Archivio Use Case — server standalone (nessuna dipendenza esterna, richiede Node.js >= 22.13).
 * API REST + file statici della web app, dati in SQLite, loghi su file system.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openDatabase } = require('./db');
const auth = require('./auth');
const { sanitizeCase, ValidationError, ASSET_NAME, isPng } = require('./validate');

const DEFAULT_SECTORS = [
  'Manifatturiero', 'Servizi finanziari', 'Sanità', 'Pubblica Amministrazione', 'Retail e GDO', 'Energia e Utilities',
  'Trasporti e Logistica', 'Telecomunicazioni', 'Education', 'Turismo e Hospitality', 'Servizi professionali', 'Altro'
];
const AD_LOGO = 'ad-consulting-logo.png';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.map': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "connect-src 'self'", "frame-src 'self' blob:", "object-src 'self' blob:",
  "base-uri 'none'", "form-action 'self'", "frame-ancestors 'self'"
].join('; ');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function loadConfig(env = process.env) {
  const sectors = (env.UCM_SECTORS || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  return {
    port: Number(env.UCM_PORT || 8080),
    host: env.UCM_HOST || '0.0.0.0',
    dataDir: path.resolve(env.UCM_DATA_DIR || path.join(process.cwd(), 'data')),
    webDir: path.resolve(env.UCM_WEB_DIR || path.join(__dirname, '..', 'web')),
    siteTitle: env.UCM_SITE_TITLE || 'Archivio Use Case',
    sectors: sectors.length ? sectors : DEFAULT_SECTORS,
    trustProxy: env.UCM_TRUST_PROXY === '1',
    cookieSecure: env.UCM_COOKIE_SECURE === '1',
    adminPassword: env.UCM_ADMIN_PASSWORD || ''
  };
}

function nowIso() {
  return new Date().toISOString();
}

function rowToCase(row) {
  return Object.assign(JSON.parse(row.data), {
    id: row.id,
    etag: '"' + row.version + '"',
    created: row.created,
    modified: row.modified,
    autore: row.author_name,
    autoreEmail: row.author_email,
    modificatoDa: row.editor_name
  });
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) {
      out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    }
  });
  return out;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Contenuto troppo grande.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limit = 2 * 1024 * 1024) {
  const buf = await readBody(req, limit);
  if (!buf.length) {
    return {};
  }
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new HttpError(400, 'JSON non valido.');
  }
}

function createApp(config) {
  const db = openDatabase(config.dataDir);
  const throttle = auth.createThrottle();
  const assetsDir = path.join(config.dataDir, 'assets');

  bootstrapAdmin(db, config);

  function clientIp(req) {
    if (config.trustProxy && req.headers['x-forwarded-for']) {
      return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    }
    return req.socket.remoteAddress || '';
  }

  function isHttps(req) {
    return config.cookieSecure || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');
  }

  function send(res, status, body, headers) {
    const isBuffer = Buffer.isBuffer(body);
    const payload = isBuffer ? body : body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, Object.assign(
      isBuffer ? {} : { 'Content-Type': 'application/json; charset=utf-8' },
      { 'Content-Length': Buffer.byteLength(payload), 'Cache-Control': 'no-store' },
      headers || {}
    ));
    res.end(payload);
  }

  function setSessionCookie(req, res, token, maxAge) {
    const parts = ['ucm_session=' + encodeURIComponent(token), 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=' + maxAge];
    if (isHttps(req)) {
      parts.push('Secure');
    }
    return parts.join('; ');
  }

  function requireUser(req) {
    const user = auth.findSessionUser(db, parseCookies(req.headers.cookie).ucm_session);
    if (!user) {
      throw new HttpError(401, 'Sessione scaduta o non autenticata. Effettua di nuovo l\'accesso.');
    }
    return user;
  }

  function requireWriter(user) {
    if (user.role === 'reader') {
      throw new HttpError(403, 'Non hai i permessi necessari per eseguire questa operazione.');
    }
  }

  function meBody(user) {
    return {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      permissions: auth.permissionsFor(user.role),
      canManageSettings: user.role === 'admin'
    };
  }

  async function handleApi(req, res, url) {
    const method = req.method;
    const p = url.pathname;

    if (method !== 'GET' && method !== 'HEAD' && req.headers['x-requested-with'] !== 'ucm') {
      throw new HttpError(403, 'Richiesta non consentita.');
    }

    if (p === '/api/config' && method === 'GET') {
      return send(res, 200, { siteTitle: config.siteTitle, sectors: config.sectors });
    }

    if (p === '/api/login' && method === 'POST') {
      const body = await readJson(req, 10 * 1024);
      const username = String(body.username || '').trim();
      const key = clientIp(req) + '|' + username.toLowerCase();
      const wait = throttle.retryAfter(key);
      if (wait) {
        return send(res, 429, { error: 'Troppi tentativi di accesso. Riprova tra ' + Math.ceil(wait / 60) + ' minuti.' }, { 'Retry-After': String(wait) });
      }
      const row = db.prepare('SELECT * FROM users WHERE username = ? AND disabled = 0').get(username);
      // Esegue sempre un confronto per non rivelare se l'utente esiste.
      const ok = row ? auth.verifyPassword(String(body.password || ''), row.password_hash) : (auth.verifyPassword('x', 'scrypt$00$00'), false);
      if (!ok) {
        throttle.fail(key);
        return send(res, 401, { error: 'Nome utente o password non corretti.' });
      }
      throttle.reset(key);
      const s = auth.createSession(db, row.id);
      return send(res, 200, meBody({ username: row.username, displayName: row.display_name, role: row.role }),
        { 'Set-Cookie': setSessionCookie(req, res, s.token, s.maxAge) });
    }

    if (p === '/api/logout' && method === 'POST') {
      auth.destroySession(db, parseCookies(req.headers.cookie).ucm_session);
      return send(res, 200, { ok: true }, { 'Set-Cookie': setSessionCookie(req, res, '', 0) });
    }

    const user = requireUser(req);

    if (p === '/api/me' && method === 'GET') {
      return send(res, 200, meBody(user));
    }

    if (p === '/api/me/password' && method === 'POST') {
      const body = await readJson(req, 10 * 1024);
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
      if (!auth.verifyPassword(String(body.current || ''), row.password_hash)) {
        throw new HttpError(400, 'La password attuale non è corretta.');
      }
      const problem = auth.checkPasswordPolicy(body.next);
      if (problem) {
        throw new HttpError(400, problem);
      }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(body.next), user.id);
      return send(res, 200, { ok: true });
    }

    // ---- casi -----------------------------------------------------------------------------------
    if (p === '/api/items' && method === 'GET') {
      const rows = db.prepare('SELECT * FROM cases WHERE deleted = 0 ORDER BY id DESC').all();
      return send(res, 200, rows.map(rowToCase));
    }

    if (p === '/api/items' && method === 'POST') {
      requireWriter(user);
      const data = sanitizeCase(await readJson(req));
      const ts = nowIso();
      const info = db.prepare(
        'INSERT INTO cases (data, version, created, modified, author_name, author_email, editor_name) VALUES (?, 1, ?, ?, ?, ?, ?)'
      ).run(JSON.stringify(data), ts, ts, user.displayName, user.email || '', user.displayName);
      const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(Number(info.lastInsertRowid));
      return send(res, 201, rowToCase(row));
    }

    const m = /^\/api\/items\/(\d+)$/.exec(p);
    if (m) {
      const id = Number(m[1]);
      const row = db.prepare('SELECT * FROM cases WHERE id = ? AND deleted = 0').get(id);
      if (!row) {
        throw new HttpError(404, 'Elemento non trovato (potrebbe essere stato eliminato).');
      }
      if (method === 'GET') {
        return send(res, 200, rowToCase(row));
      }
      if (method === 'PUT' || method === 'DELETE') {
        requireWriter(user);
        const ifMatch = req.headers['if-match'];
        if (!ifMatch) {
          throw new HttpError(428, 'Intestazione If-Match obbligatoria.');
        }
        if (ifMatch !== '*' && ifMatch !== '"' + row.version + '"') {
          throw new HttpError(412, 'Il caso è stato modificato da un altro utente.', { latest: rowToCase(row) });
        }
        if (method === 'DELETE') {
          db.prepare('UPDATE cases SET deleted = 1, deleted_at = ?, editor_name = ? WHERE id = ?').run(nowIso(), user.displayName, id);
          return send(res, 200, { ok: true });
        }
        const data = sanitizeCase(await readJson(req));
        db.prepare('UPDATE cases SET data = ?, version = version + 1, modified = ?, editor_name = ? WHERE id = ?')
          .run(JSON.stringify(data), nowIso(), user.displayName, id);
        return send(res, 200, rowToCase(db.prepare('SELECT * FROM cases WHERE id = ?').get(id)));
      }
    }

    // ---- loghi ----------------------------------------------------------------------------------
    const a = /^\/api\/assets\/([^/]+)$/.exec(p);
    if (a) {
      const name = decodeURIComponent(a[1]);
      if (!ASSET_NAME.test(name)) {
        throw new HttpError(400, 'Nome file non valido.');
      }
      const file = path.join(assetsDir, name);
      if (method === 'GET') {
        if (!fs.existsSync(file)) {
          throw new HttpError(404, 'File non trovato.');
        }
        return send(res, 200, fs.readFileSync(file), { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff' });
      }
      requireWriter(user);
      if (name === AD_LOGO && user.role !== 'admin') {
        throw new HttpError(403, 'Solo un amministratore può modificare il logo aziendale.');
      }
      if (method === 'PUT') {
        const buf = await readBody(req, 6 * 1024 * 1024);
        if (!isPng(buf)) {
          throw new HttpError(400, 'Il file non è un PNG valido.');
        }
        fs.writeFileSync(file, buf);
        return send(res, 200, { name });
      }
      if (method === 'DELETE') {
        fs.rmSync(file, { force: true });
        return send(res, 200, { ok: true });
      }
    }

    throw new HttpError(404, 'Risorsa non trovata.');
  }

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'Metodo non consentito.');
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') {
      rel = '/index.html';
    }
    let file = path.normalize(path.join(config.webDir, rel));
    if (file !== config.webDir && !file.startsWith(config.webDir + path.sep)) {
      throw new HttpError(403, 'Accesso negato.');
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (path.extname(rel)) {
        throw new HttpError(404, 'File non trovato.');
      }
      file = path.join(config.webDir, 'index.html');
    }
    const st = fs.statSync(file);
    const etag = '"' + st.size + '-' + Math.floor(st.mtimeMs) + '"';
    const headers = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'ETag': etag,
      'Cache-Control': 'no-cache'
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      return res.end();
    }
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (isHttps(req)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
      } else {
        serveStatic(req, res, url);
      }
    } catch (e) {
      if (res.headersSent) {
        return res.end();
      }
      if (e instanceof HttpError) {
        send(res, e.status, Object.assign({ error: e.message }, e.extra || {}));
      } else if (e instanceof ValidationError) {
        send(res, 400, { error: e.message });
      } else {
        console.error('Errore interno:', e);
        send(res, 500, { error: 'Errore interno del server.' });
      }
    }
  });

  return { server, db };
}

function bootstrapAdmin(db, config) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) {
    return;
  }
  const generated = !config.adminPassword;
  const password = config.adminPassword || crypto.randomBytes(12).toString('base64url');
  if (auth.checkPasswordPolicy(password)) {
    throw new Error('UCM_ADMIN_PASSWORD deve contenere almeno ' + auth.MIN_PASSWORD + ' caratteri.');
  }
  db.prepare("INSERT INTO users (username, display_name, email, role, password_hash, created) VALUES ('admin', 'Admin', '', 'admin', ?, ?)")
    .run(auth.hashPassword(password), nowIso());
  console.log('==============================================================');
  console.log(' PRIMO AVVIO: creato l\'utente amministratore.');
  console.log('   utente:   admin');
  console.log(generated ? '   password: ' + password + '   (cambiala al primo accesso)' : '   password: quella indicata in UCM_ADMIN_PASSWORD');
  console.log('==============================================================');
}

if (require.main === module) {
  const config = loadConfig();
  const { server } = createApp(config);
  server.listen(config.port, config.host, () => {
    console.log('Archivio Use Case in ascolto su http://' + config.host + ':' + config.port + ' (dati: ' + config.dataDir + ')');
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { createApp, loadConfig };
