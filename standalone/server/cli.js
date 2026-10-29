#!/usr/bin/env node
'use strict';
/** Amministrazione da riga di comando: utenti, cestino, backup. Uso: ucm <comando> */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { openDatabase } = require('./db');
const auth = require('./auth');

const dataDir = path.resolve(process.env.UCM_DATA_DIR || path.join(process.cwd(), 'data'));
const [cmd, ...args] = process.argv.slice(2);

function usage() {
  console.log(`Uso: ucm <comando>

  user:list
  user:add <utente> "<Nome visualizzato>" <admin|editor|reader> [email]   (la password viene chiesta)
  user:passwd <utente>
  user:role <utente> <admin|editor|reader>
  user:disable <utente> | user:enable <utente> | user:delete <utente>
  trash:list                 elenca i casi eliminati
  trash:restore <id>         ripristina un caso eliminato
  backup <cartella>          copia database e loghi in <cartella>

Variabile: UCM_DATA_DIR (predefinita ./data). Attuale: ${dataDir}`);
}

function askPassword(prompt) {
  if (process.env.UCM_NEW_PASSWORD) {
    return Promise.resolve(process.env.UCM_NEW_PASSWORD);
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(prompt)) { rl.output.write(s); } };
    rl.question(prompt, (a) => { rl.output.write('\n'); rl.close(); resolve(a); });
  });
}

(async () => {
  if (!cmd || cmd === '-h' || cmd === '--help') {
    return usage();
  }
  const db = openDatabase(dataDir);
  const need = (n) => { if (args.length < n) { usage(); process.exit(2); } };
  const getUser = (name) => {
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(name);
    if (!u) { console.error('Utente non trovato: ' + name); process.exit(1); }
    return u;
  };
  const roles = ['admin', 'editor', 'reader'];

  switch (cmd) {
    case 'user:list':
      db.prepare('SELECT username, display_name, role, disabled, email FROM users ORDER BY username').all()
        .forEach((u) => console.log([u.username, u.display_name, u.role, u.disabled ? 'DISABILITATO' : 'attivo', u.email].join('\t')));
      break;
    case 'user:add': {
      need(3);
      if (!roles.includes(args[2])) { console.error('Ruolo non valido.'); process.exit(2); }
      const pw = await askPassword('Password (min ' + auth.MIN_PASSWORD + ' caratteri): ');
      const problem = auth.checkPasswordPolicy(pw);
      if (problem) { console.error(problem); process.exit(1); }
      db.prepare('INSERT INTO users (username, display_name, email, role, password_hash, created) VALUES (?, ?, ?, ?, ?, ?)')
        .run(args[0], args[1], args[3] || '', args[2], auth.hashPassword(pw), new Date().toISOString());
      console.log('Utente creato.');
      break;
    }
    case 'user:passwd': {
      need(1);
      const u = getUser(args[0]);
      const pw = await askPassword('Nuova password: ');
      const problem = auth.checkPasswordPolicy(pw);
      if (problem) { console.error(problem); process.exit(1); }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(pw), u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      console.log('Password aggiornata; sessioni attive chiuse.');
      break;
    }
    case 'user:role':
      need(2);
      if (!roles.includes(args[1])) { console.error('Ruolo non valido.'); process.exit(2); }
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(args[1], getUser(args[0]).id);
      console.log('Ruolo aggiornato.');
      break;
    case 'user:disable':
    case 'user:enable': {
      need(1);
      const u = getUser(args[0]);
      db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(cmd === 'user:disable' ? 1 : 0, u.id);
      if (cmd === 'user:disable') { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); }
      console.log('Fatto.');
      break;
    }
    case 'user:delete':
      need(1);
      db.prepare('DELETE FROM users WHERE id = ?').run(getUser(args[0]).id);
      console.log('Utente eliminato.');
      break;
    case 'trash:list':
      db.prepare('SELECT id, data, deleted_at FROM cases WHERE deleted = 1 ORDER BY deleted_at DESC').all().forEach((r) => {
        const d = JSON.parse(r.data);
        console.log([r.id, d.cliente, d.nomeProgetto, r.deleted_at].join('\t'));
      });
      break;
    case 'trash:restore':
      need(1);
      db.prepare('UPDATE cases SET deleted = 0, deleted_at = NULL WHERE id = ?').run(Number(args[0]));
      console.log('Ripristinato (se presente).');
      break;
    case 'backup': {
      need(1);
      const dest = path.resolve(args[0]);
      fs.mkdirSync(path.join(dest, 'assets'), { recursive: true });
      const target = path.join(dest, 'usecases.db');
      fs.rmSync(target, { force: true });
      db.exec("VACUUM INTO '" + target.replace(/'/g, "''") + "'");
      const src = path.join(dataDir, 'assets');
      if (fs.existsSync(src)) { fs.cpSync(src, path.join(dest, 'assets'), { recursive: true }); }
      console.log('Backup creato in ' + dest);
      break;
    }
    default:
      usage();
      process.exit(2);
  }
  db.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
