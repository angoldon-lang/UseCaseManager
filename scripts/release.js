'use strict';
/**
 * Prepara un nuovo rilascio.   Uso: npm run release -- [patch|minor|major|X.Y.Z|current]
 *   1. aumenta la versione in package.json (con "current" la lascia invariata e ripubblica il pacchetto)
 *   2. verifica che CHANGELOG.md abbia le novità di quella versione (altrimenti aggiunge un titolo da completare)
 *   3. esegue i test e la build
 *   4. copia il pacchetto in deploy/ad-usecase-archive-latest.tar.gz (+ sha256), da cui "ucm-update" aggiorna il server
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const arg = process.argv[2] || 'patch';

function bump(v, kind) {
  if (kind === 'current') {
    return v;
  }
  if (/^\d+\.\d+\.\d+$/.test(kind)) {
    return kind;
  }
  const [a, b, c] = v.split('.').map(Number);
  if (kind === 'major') return (a + 1) + '.0.0';
  if (kind === 'minor') return a + '.' + (b + 1) + '.0';
  if (kind === 'patch') return a + '.' + b + '.' + (c + 1);
  throw new Error('Uso: npm run release -- [patch|minor|major|X.Y.Z|current]');
}

const next = bump(pkg.version, arg);
console.log('Versione: ' + pkg.version + ' → ' + next);
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const clPath = path.join(root, 'CHANGELOG.md');
let cl = fs.readFileSync(clPath, 'utf8');
if (cl.indexOf('## ' + next) < 0) {
  const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const d = new Date();
  const entry = '## ' + next + ' — ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + '\n- (descrivi qui le novità di questa versione)\n\n';
  cl = cl.replace(/^(# .*\n+)/, '$1' + entry);
  fs.writeFileSync(clPath, cl);
  console.log('ATTENZIONE: aggiunto un titolo in CHANGELOG.md: descrivi le novità e rilancia "npm run build" prima di pubblicare.');
}

const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
run('npm test');
run('node standalone/build.js');

const deploy = path.join(root, 'deploy');
fs.mkdirSync(deploy, { recursive: true });
fs.readdirSync(deploy).filter((f) => /^ad-usecase-archive-linux/.test(f)).forEach((f) => fs.rmSync(path.join(deploy, f)));
const built = path.join(root, 'release-standalone', 'ad-usecase-archive-linux-v' + next + '.tar.gz');
const target = path.join(deploy, 'ad-usecase-archive-latest.tar.gz');
fs.copyFileSync(built, target);
const hash = execSync('sha256sum ad-usecase-archive-latest.tar.gz', { cwd: deploy }).toString();
fs.writeFileSync(target + '.sha256', hash);

console.log('\nRilascio v' + next + ' pronto in deploy/.');
console.log('Prossimi passi: git add -A && git commit -m "Versione ' + next + '" && git push');
console.log('Sul server: sudo ucm-update');
