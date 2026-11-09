'use strict';
/**
 * Compila la versione standalone: web app (esbuild + sass) e server, poi crea il tarball per Linux.
 * Uso: node standalone/build.js   →   dist-standalone/ + release-standalone/*.tar.gz
 */
const esbuild = require('esbuild');
const sass = require('sass');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist-standalone');
const pkg = require(path.join(root, 'package.json'));
const info = require('./version').getBuildInfo();
const defines = {
  __APP_VERSION__: JSON.stringify(info.version),
  __APP_BUILD__: JSON.stringify(info.build),
  __APP_COMMIT__: JSON.stringify(info.commit)
};
const { execSync } = require('child_process');

function git(cmd, fallback) {
  try {
    return execSync('git ' + cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback;
  } catch (e) {
    return fallback;
  }
}


const scssModules = {
  name: 'scss-modules',
  setup(build) {
    build.onLoad({ filter: /\.module\.scss$/ }, (args) => ({
      contents: sass.compile(args.path, { style: 'compressed' }).css,
      loader: 'local-css',
      resolveDir: path.dirname(args.path)
    }));
  }
};

(async () => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'web', 'fonts'), { recursive: true });

  console.log('> web app');
  await esbuild.build({
    entryPoints: { app: path.join(__dirname, 'web', 'main.tsx') },
    outdir: path.join(out, 'web'),
    bundle: true, splitting: true, format: 'esm', minify: true, sourcemap: false,
    target: ['es2018'], platform: 'browser', logLevel: 'warning',
    chunkNames: 'chunks/[name]-[hash]',
    define: Object.assign({ 'process.env.NODE_ENV': '"production"', global: 'window' }, defines),
    loader: { '.md': 'text' },
    plugins: [scssModules],
    legalComments: 'external'
  });
  for (const f of ['index.html', 'fabric-config.js', 'favicon.png']) {
    fs.copyFileSync(path.join(__dirname, 'web', f), path.join(out, 'web', f));
  }
  const fontsSrc = path.join(root, 'node_modules', '@fluentui', 'font-icons-mdl2', 'fonts');
  for (const f of fs.readdirSync(fontsSrc)) {
    if (f.endsWith('.woff')) {
      fs.copyFileSync(path.join(fontsSrc, f), path.join(out, 'web', 'fonts', f));
    }
  }

  console.log('> server');
  // Server e CLI in un unico file ciascuno (SDK Anthropic incluso): sul server di destinazione non serve "npm install".
  await esbuild.build({
    entryPoints: { main: path.join(__dirname, 'server', 'main.js'), cli: path.join(__dirname, 'server', 'cli.js') },
    outdir: path.join(out, 'server'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'warning', legalComments: 'none',
    external: ['node:sqlite'],
    define: defines
  });
  fs.mkdirSync(path.join(out, 'bin'));
  fs.writeFileSync(path.join(out, 'bin', 'ucm'), '#!/bin/sh\nDIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"\nexec node --disable-warning=ExperimentalWarning "$DIR/server/cli.js" "$@"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(out, 'bin', 'ucm-server'), '#!/bin/sh\nDIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"\nexec node --disable-warning=ExperimentalWarning "$DIR/server/main.js" "$@"\n', { mode: 0o755 });
  // Origine degli aggiornamenti (modificabile dopo l'installazione in /etc/ad-usecase-archive/update.conf).
  const repo = process.env.UCM_UPDATE_REPO || 'https://github.com/angoldon-lang/UseCaseManager.git';
  const branch = process.env.UCM_UPDATE_BRANCH || git('rev-parse --abbrev-ref HEAD', 'main');
  fs.writeFileSync(path.join(out, 'update.conf.example'),
    '# Origine degli aggiornamenti per "ucm-update".\n' +
    '# Repository git che contiene deploy/ad-usecase-archive-latest.tar.gz e ramo da cui leggerlo.\n' +
    'REPO_URL="' + repo + '"\n' +
    'BRANCH="' + branch + '"\n' +
    '# Per un repository privato: token di accesso GitHub (sola lettura sul repository), oppure esportare GITHUB_TOKEN.\n' +
    '#TOKEN=""\n');
  for (const f of ['install.sh', 'uninstall.sh', 'ucm-update.sh', 'ucm.service', 'ucm.env.example', 'nginx.conf.example', '../../CHANGELOG.md']) {
    fs.copyFileSync(path.join(__dirname, 'install', f), path.join(out, path.basename(f)));
    if (f.endsWith('.sh')) { fs.chmodSync(path.join(out, f), 0o755); }
  }
  fs.copyFileSync(path.join(__dirname, 'README.md'), path.join(out, 'README.md'));
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({
    name: 'ad-usecase-archive-standalone', version: info.version, build: info.build, commit: info.commit, private: true,
    description: 'Archivio Use Case AD Consulting - versione standalone', engines: { node: '>=22.13.0' }
  }, null, 2) + '\n');

  console.log('> tarball');
  const rel = path.join(root, 'release-standalone');
  fs.mkdirSync(rel, { recursive: true });
  const name = 'ad-usecase-archive-linux-v' + info.version;
  const tarball = path.join(rel, name + '.tar.gz');
  fs.rmSync(tarball, { force: true });
  execFileSync('tar', ['--transform', 's,^dist-standalone,' + name + ',', '-czf', tarball, '-C', root, 'dist-standalone'], { stdio: 'inherit' });
  execFileSync('sh', ['-c', 'cd "' + rel + '" && sha256sum "' + name + '.tar.gz" > "' + name + '.tar.gz.sha256"']);
  console.log('OK: ' + tarball);
})().catch((e) => { console.error(e); process.exit(1); });
