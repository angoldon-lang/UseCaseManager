'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp, loadConfig } = require('../server/index');
const auth = require('../server/auth');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const H = { 'X-Requested-With': 'ucm', 'Content-Type': 'application/json' };

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ucm-test-'));
  const web = path.join(dir, 'web');
  fs.mkdirSync(web);
  fs.writeFileSync(path.join(web, 'index.html'), '<html>ok</html>');
  const config = loadConfig({ UCM_DATA_DIR: path.join(dir, 'data'), UCM_WEB_DIR: web, UCM_ADMIN_PASSWORD: 'password-admin-1' });
  const { server, db } = createApp(config);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (username, display_name, role, password_hash, created) VALUES ('ed', 'Edith Editor', 'editor', ?, ?)").run(auth.hashPassword('password-editor-1'), now);
  db.prepare("INSERT INTO users (username, display_name, role, password_hash, created) VALUES ('rd', 'Rita Reader', 'reader', ?, ?)").run(auth.hashPassword('password-reader-1'), now);
  const close = () => new Promise((r) => { server.close(r); db.close(); });
  return { base, close, db };
}

async function login(base, username, password) {
  const r = await fetch(base + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username, password }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { r, cookie };
}

const api = (base, cookie) => (method, p, body, extra) =>
  fetch(base + p, { method, headers: Object.assign({}, H, { Cookie: cookie }, extra || {}), body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)) });

const caso = (extra) => Object.assign({
  cliente: 'Acme', settore: 'Manifatturiero', nomeProgetto: 'ERP', anno: 2025, esigenza: 'e', soluzioneProposta: 'p',
  soluzioneImplementata: 'i', benefici: 'b', vendor: ['SAP', 'SAP;x'], tecnologie: [], servizi: ['Assessment'], stato: 'Completo'
}, extra || {});

test('autenticazione, ruoli, concorrenza, loghi', async (t) => {
  const { base, close } = await start();
  t.after(close);

  // static + sicurezza
  let r = await fetch(base + '/');
  assert.strictEqual(r.status, 200);
  assert.ok(r.headers.get('content-security-policy'));
  r = await fetch(base + '/..%2f..%2fetc%2fpasswd');
  assert.ok([403, 404].includes(r.status));
  r = await fetch(base + '/api/items');
  assert.strictEqual(r.status, 401);

  // login
  let l = await login(base, 'admin', 'sbagliata');
  assert.strictEqual(l.r.status, 401);
  l = await login(base, 'admin', 'password-admin-1');
  assert.strictEqual(l.r.status, 200);
  assert.ok(/HttpOnly/.test(l.r.headers.get('set-cookie')) && /SameSite=Strict/.test(l.r.headers.get('set-cookie')));
  const admin = api(base, l.cookie);

  // CSRF: senza intestazione custom la scrittura è rifiutata
  r = await fetch(base + '/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: l.cookie }, body: JSON.stringify(caso()) });
  assert.strictEqual(r.status, 403);

  // creazione, validazione, etag
  r = await admin('POST', '/api/items', { stato: 'Bozza' });
  assert.strictEqual(r.status, 400);
  r = await admin('POST', '/api/items', caso({ id: 999, autore: 'hacker', logoClienteUrl: '../x' }));
  assert.strictEqual(r.status, 400);
  r = await admin('POST', '/api/items', caso({ id: 999, autore: 'hacker' }));
  assert.strictEqual(r.status, 201);
  const created = await r.json();
  assert.notStrictEqual(created.id, 999);
  assert.strictEqual(created.autore, 'Admin');
  assert.deepStrictEqual(created.vendor, ['SAP', 'SAP,x']);
  assert.strictEqual(created.etag, '"1"');

  // aggiornamento con etag corretto/errato/forzato
  r = await admin('PUT', '/api/items/' + created.id, caso({ localizzazione: 'Milano' }), { 'If-Match': created.etag });
  assert.strictEqual(r.status, 200);
  const v2 = await r.json();
  assert.strictEqual(v2.etag, '"2"');
  r = await admin('PUT', '/api/items/' + created.id, caso({ localizzazione: 'Roma' }), { 'If-Match': created.etag });
  assert.strictEqual(r.status, 412);
  assert.strictEqual((await r.json()).latest.localizzazione, 'Milano');
  r = await admin('PUT', '/api/items/' + created.id, caso({ localizzazione: 'Roma' }), { 'If-Match': '*' });
  assert.strictEqual(r.status, 200);
  r = await admin('PUT', '/api/items/' + created.id, caso());
  assert.strictEqual(r.status, 428);

  // ruoli
  const ed = api(base, (await login(base, 'ed', 'password-editor-1')).cookie);
  const rd = api(base, (await login(base, 'rd', 'password-reader-1')).cookie);
  assert.strictEqual((await rd('GET', '/api/items')).status, 200);
  assert.strictEqual((await rd('POST', '/api/items', caso())).status, 403);
  assert.strictEqual((await rd('DELETE', '/api/items/' + created.id, undefined, { 'If-Match': '*' })).status, 403);
  assert.deepStrictEqual((await (await rd('GET', '/api/me')).json()).permissions, { canAdd: false, canEdit: false, canDelete: false });
  assert.strictEqual((await ed('POST', '/api/items', caso({ cliente: 'Beta' }))).status, 201);

  // loghi
  assert.strictEqual((await ed('PUT', '/api/assets/logo-cliente-1.png', PNG, { 'Content-Type': 'image/png' })).status, 200);
  assert.strictEqual((await ed('PUT', '/api/assets/logo-cliente-2.png', Buffer.from('non png'))).status, 400);
  assert.strictEqual((await ed('PUT', '/api/assets/ad-consulting-logo.png', PNG)).status, 403);
  assert.strictEqual((await admin('PUT', '/api/assets/ad-consulting-logo.png', PNG)).status, 200);
  r = await rd('GET', '/api/assets/logo-cliente-1.png');
  assert.strictEqual(r.headers.get('content-type'), 'image/png');
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(PNG));
  assert.strictEqual((await rd('GET', '/api/assets/..%2Fusecases.db')).status, 400);

  // eliminazione logica
  r = await admin('DELETE', '/api/items/' + created.id, undefined, { 'If-Match': '"1"' });
  assert.strictEqual(r.status, 412);
  r = await admin('DELETE', '/api/items/' + created.id, undefined, { 'If-Match': '*' });
  assert.strictEqual(r.status, 200);
  const list = await (await admin('GET', '/api/items')).json();
  assert.strictEqual(list.length, 1);

  // cambio password e logout
  r = await ed('POST', '/api/me/password', { current: 'password-editor-1', next: 'corta' });
  assert.strictEqual(r.status, 400);
  r = await ed('POST', '/api/me/password', { current: 'password-editor-1', next: 'nuova-password-1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await login(base, 'ed', 'nuova-password-1')).r.status, 200);
  await admin('POST', '/api/logout', {});
  assert.strictEqual((await admin('GET', '/api/me')).status, 401);
});

test('blocco dopo troppi tentativi di login', async (t) => {
  const { base, close } = await start();
  t.after(close);
  for (let i = 0; i < 5; i++) {
    assert.strictEqual((await login(base, 'admin', 'no')).r.status, 401);
  }
  const blocked = await login(base, 'admin', 'password-admin-1');
  assert.strictEqual(blocked.r.status, 429);
});
