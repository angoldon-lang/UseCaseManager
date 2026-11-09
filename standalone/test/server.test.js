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

async function start(extraEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ucm-test-'));
  const web = path.join(dir, 'web');
  fs.mkdirSync(web);
  fs.writeFileSync(path.join(web, 'index.html'), '<html>ok</html>');
  const config = loadConfig(Object.assign({ UCM_DATA_DIR: path.join(dir, 'data'), UCM_WEB_DIR: web, UCM_ADMIN_PASSWORD: 'password-admin-1' }, extraEnv || {}));
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
  cliente: 'Acme', settore: 'Manifatturiero', nomeProgetto: 'ERP', anno: 2025, fatturato: '10-50M', salesRiferimento: 'Giulia Bianchi', esigenza: 'e', soluzioneProposta: 'p',
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
  assert.strictEqual(created.fatturato, '10-50M');
  assert.strictEqual(created.salesRiferimento, 'Giulia Bianchi');
  assert.strictEqual(created.compilazioneAI, false);

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

test('fatturato a scaglioni: valori non validi rifiutati, importi storici convertiti', async (t) => {
  const { base, close, db } = await start();
  t.after(close);
  const admin = api(base, (await login(base, 'admin', 'password-admin-1')).cookie);
  assert.strictEqual((await admin('POST', '/api/items', caso({ fatturato: 'tanto' }))).status, 400);
  let r = await admin('POST', '/api/items', caso({ fatturato: 3500000 }));
  assert.strictEqual((await r.json()).fatturato, '2-10M');
  r = await admin('POST', '/api/items', caso({ fatturato: undefined }));
  assert.strictEqual((await r.json()).fatturato, '');
  // caso salvato con la versione precedente (importo numerico, senza campi nuovi)
  const legacy = JSON.stringify({ cliente: 'Vecchio', nomeProgetto: 'P', fatturato: 800000000, stato: 'Bozza' });
  const now = new Date().toISOString();
  db.prepare('INSERT INTO cases (data, version, created, modified) VALUES (?, 1, ?, ?)').run(legacy, now, now);
  const list = await (await admin('GET', '/api/items')).json();
  const old = list.filter((c) => c.cliente === 'Vecchio')[0];
  assert.strictEqual(old.fatturato, '250M-1Mld');
  assert.strictEqual(old.salesRiferimento, '');
  assert.strictEqual(old.compilazioneAI, false);
});

test('gestione utenti da amministratore', async (t) => {
  const { base, close } = await start();
  t.after(close);
  const admin = api(base, (await login(base, 'admin', 'password-admin-1')).cookie);
  const ed = api(base, (await login(base, 'ed', 'password-editor-1')).cookie);

  // solo gli admin
  assert.strictEqual((await ed('GET', '/api/users')).status, 403);
  assert.strictEqual((await ed('POST', '/api/users', { username: 'x', displayName: 'X', role: 'reader', password: 'password-lunga-1' })).status, 403);

  // creazione + validazioni
  const nuovo = { username: 'mrossi', displayName: 'Mario Rossi', email: 'mario@azienda.it', role: 'editor', password: 'password-lunga-1' };
  let r = await admin('POST', '/api/users', nuovo);
  assert.strictEqual(r.status, 201);
  const created = await r.json();
  assert.strictEqual(created.role, 'editor');
  assert.ok(!('password_hash' in created) && !('passwordHash' in created));
  assert.strictEqual((await admin('POST', '/api/users', nuovo)).status, 409);
  assert.strictEqual((await admin('POST', '/api/users', Object.assign({}, nuovo, { username: 'MROSSI' }))).status, 409);
  assert.strictEqual((await admin('POST', '/api/users', Object.assign({}, nuovo, { username: 'a b' }))).status, 400);
  assert.strictEqual((await admin('POST', '/api/users', Object.assign({}, nuovo, { username: 'altro', password: 'corta' }))).status, 400);
  assert.strictEqual((await admin('POST', '/api/users', Object.assign({}, nuovo, { username: 'altro', role: 'dio' }))).status, 400);
  assert.strictEqual((await admin('POST', '/api/users', Object.assign({}, nuovo, { username: 'altro', email: 'non-una-mail' }))).status, 400);

  // il nuovo utente accede e scrive
  const mr = await login(base, 'mrossi', 'password-lunga-1');
  assert.strictEqual(mr.r.status, 200);
  const mrApi = api(base, mr.cookie);
  assert.strictEqual((await mrApi('POST', '/api/items', caso())).status, 201);

  // cambio ruolo: la sessione precedente viene chiusa, i permessi cambiano
  r = await admin('PATCH', '/api/users/' + created.id, { role: 'reader' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await mrApi('GET', '/api/me')).status, 401);
  const mr2 = api(base, (await login(base, 'mrossi', 'password-lunga-1')).cookie);
  assert.strictEqual((await mr2('POST', '/api/items', caso())).status, 403);

  // reset password
  assert.strictEqual((await admin('PATCH', '/api/users/' + created.id, { password: 'nuova-password-9' })).status, 200);
  assert.strictEqual((await login(base, 'mrossi', 'password-lunga-1')).r.status, 401);
  assert.strictEqual((await login(base, 'mrossi', 'nuova-password-9')).r.status, 200);

  // disabilitazione
  await admin('PATCH', '/api/users/' + created.id, { disabled: true });
  assert.strictEqual((await login(base, 'mrossi', 'nuova-password-9')).r.status, 401);
  await admin('PATCH', '/api/users/' + created.id, { disabled: false });
  assert.strictEqual((await login(base, 'mrossi', 'nuova-password-9')).r.status, 200);

  // protezioni: non si può eliminare/declassare se stessi né l'ultimo admin
  const users = await (await admin('GET', '/api/users')).json();
  const me = users.filter((u) => u.username === 'admin')[0];
  assert.strictEqual((await admin('DELETE', '/api/users/' + me.id, undefined)).status, 409);
  assert.strictEqual((await admin('PATCH', '/api/users/' + me.id, { role: 'editor' })).status, 409);
  assert.strictEqual((await admin('PATCH', '/api/users/' + me.id, { disabled: true })).status, 409);
  // secondo admin: ora il primo può essere declassato da lui ma non l'ultimo
  const second = await (await admin('POST', '/api/users', { username: 'boss2', displayName: 'Boss 2', role: 'admin', password: 'password-lunga-2' })).json();
  const boss2 = api(base, (await login(base, 'boss2', 'password-lunga-2')).cookie);
  assert.strictEqual((await boss2('PATCH', '/api/users/' + me.id, { role: 'editor' })).status, 200);
  assert.strictEqual((await boss2('PATCH', '/api/users/' + second.id, { role: 'editor' })).status, 409);

  // eliminazione
  assert.strictEqual((await boss2('DELETE', '/api/users/' + created.id, undefined)).status, 200);
  assert.strictEqual((await login(base, 'mrossi', 'nuova-password-9')).r.status, 401);
  assert.strictEqual((await boss2('DELETE', '/api/users/99999', undefined)).status, 404);
});

// ---- AI: servizio Anthropic simulato -------------------------------------------------------------------
const http = require('http');

async function startMockAnthropic(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {};
      seen.push({ url: req.url, headers: req.headers, body: parsed });
      const out = handler(parsed, req);
      res.writeHead(out.status || 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out.json));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: 'http://127.0.0.1:' + server.address().port, seen, close: () => new Promise((r) => server.close(r)) };
}

const message = (text, stop) => ({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop || 'end_turn', stop_sequence: null,
  content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 }
});

test('AI: non configurata', async (t) => {
  const { base, close } = await start();
  t.after(close);
  const ed = api(base, (await login(base, 'ed', 'password-editor-1')).cookie);
  assert.strictEqual((await (await fetch(base + '/api/config')).json()).aiEnabled, false);
  const r = await ed('POST', '/api/ai/describe', { appunti: 'a'.repeat(50) });
  assert.strictEqual(r.status, 503);
});

test('AI: elaborazione, riservatezza, ruoli, errori e limite orario', async (t) => {
  const draft = { sintesi: 'S', esigenza: 'E', soluzioneProposta: 'P', soluzioneImplementata: 'I', benefici: 'B', kpi: '' };
  let mode = 'ok';
  const mock = await startMockAnthropic(() => {
    if (mode === 'ok') return { json: message(JSON.stringify(draft)) };
    if (mode === 'refusal') return { json: message('', 'refusal') };
    if (mode === 'auth') return { status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } };
    if (mode === 'garbage') return { json: message('non json') };
    return { json: message(JSON.stringify({ sintesi: '', esigenza: '', soluzioneProposta: '', soluzioneImplementata: '', benefici: '', kpi: '' })) };
  });
  const { base, close } = await start({ UCM_ANTHROPIC_API_KEY: 'sk-ant-test-key', UCM_AI_BASE_URL: mock.url, UCM_AI_HOURLY_LIMIT: '6' });
  t.after(async () => { await close(); await mock.close(); });
  assert.strictEqual((await (await fetch(base + '/api/config')).json()).aiEnabled, true);

  const ed = api(base, (await login(base, 'ed', 'password-editor-1')).cookie);
  const rd = api(base, (await login(base, 'rd', 'password-reader-1')).cookie);
  const appunti = 'Il cliente aveva una rete obsoleta con frequenti fermi. Abbiamo fatto assessment e installato 40 switch. Dopo il go-live -60% ticket.';
  const input = { appunti, nomeProgetto: 'Rete campus', settore: 'Manifatturiero', anno: 2025, vendor: ['Cisco'], tecnologie: ['ISE'], servizi: ['Assessment'], cliente: 'SEGRETO SPA', clienteCitabile: false };

  // ok: risultato e contenuto della richiesta all'API
  let r = await ed('POST', '/api/ai/describe', input);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), draft);
  const call = mock.seen[0];
  assert.ok(call.url.startsWith('/v1/messages'));
  assert.strictEqual(call.headers['authorization'], 'Bearer sk-ant-test-key');
  assert.ok(String(call.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'));
  assert.strictEqual(call.body.model, 'claude-opus-5-5');
  assert.strictEqual(call.body.fallbacks, 'default');
  assert.strictEqual(call.body.output_config.format.type, 'json_schema');
  assert.ok(call.body.max_tokens >= 4000);
  const sent = JSON.stringify(call.body);
  assert.ok(sent.includes('Rete campus') && sent.includes('-60% ticket'));
  assert.ok(!sent.includes('SEGRETO'), 'il nome del cliente non deve essere inviato all\'AI');
  assert.ok(!('temperature' in call.body) && !('thinking' in call.body));

  // ruoli e validazione
  assert.strictEqual((await rd('POST', '/api/ai/describe', input)).status, 403);
  assert.strictEqual((await ed('POST', '/api/ai/describe', { appunti: 'corto' })).status, 400);

  // errori dell'API tradotti in messaggi chiari
  mode = 'refusal';
  r = await ed('POST', '/api/ai/describe', input);
  assert.strictEqual(r.status, 422);
  mode = 'auth';
  r = await ed('POST', '/api/ai/describe', input);
  assert.strictEqual(r.status, 502);
  assert.ok(!(await r.text()).includes('sk-ant'), 'la chiave non deve comparire nelle risposte');
  mode = 'garbage';
  assert.strictEqual((await ed('POST', '/api/ai/describe', input)).status, 502);
  mode = 'empty';
  assert.strictEqual((await ed('POST', '/api/ai/describe', input)).status, 422);

  // limite orario (6): 1 ok + 1 corto escluso dopo la validazione? il corto conta; 5 + 1 raggiunto
  mode = 'ok';
  r = await ed('POST', '/api/ai/describe', input);
  assert.strictEqual(r.status, 429);
});
