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
    define: { 'process.env.NODE_ENV': '"production"', global: 'window' },
    plugins: [scssModules],
    legalComments: 'external'
  });
  for (const f of ['index.html', 'fabric-config.js']) {
    fs.copyFileSync(path.join(__dirname, 'web', f), path.join(out, 'web', f));
  }
  const fontsSrc = path.join(root, 'node_modules', '@fluentui', 'font-icons-mdl2', 'fonts');
  for (const f of fs.readdirSync(fontsSrc)) {
    if (f.endsWith('.woff')) {
      fs.copyFileSync(path.join(fontsSrc, f), path.join(out, 'web', 'fonts', f));
    }
  }

  console.log('> server');
  fs.cpSync(path.join(__dirname, 'server'), path.join(out, 'server'), { recursive: true });
  fs.mkdirSync(path.join(out, 'bin'));
  fs.writeFileSync(path.join(out, 'bin', 'ucm'), '#!/bin/sh\nDIR="$(cd "$(dirname "$0")/.." && pwd)"\nexec node --disable-warning=ExperimentalWarning "$DIR/server/cli.js" "$@"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(out, 'bin', 'ucm-server'), '#!/bin/sh\nDIR="$(cd "$(dirname "$0")/.." && pwd)"\nexec node --disable-warning=ExperimentalWarning "$DIR/server/index.js" "$@"\n', { mode: 0o755 });
  for (const f of ['install.sh', 'uninstall.sh', 'ucm.service', 'ucm.env.example', 'nginx.conf.example']) {
    fs.copyFileSync(path.join(__dirname, 'install', f), path.join(out, f));
    if (f.endsWith('.sh')) { fs.chmodSync(path.join(out, f), 0o755); }
  }
  fs.copyFileSync(path.join(__dirname, 'README.md'), path.join(out, 'README.md'));
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({
    name: 'ad-usecase-archive-standalone', version: pkg.version, private: true,
    description: 'Archivio Use Case AD Consulting - versione standalone', engines: { node: '>=22.13.0' }
  }, null, 2) + '\n');

  console.log('> tarball');
  const rel = path.join(root, 'release-standalone');
  fs.mkdirSync(rel, { recursive: true });
  const name = 'ad-usecase-archive-linux-v' + pkg.version;
  const tarball = path.join(rel, name + '.tar.gz');
  fs.rmSync(tarball, { force: true });
  execFileSync('tar', ['--transform', 's,^dist-standalone,' + name + ',', '-czf', tarball, '-C', root, 'dist-standalone'], { stdio: 'inherit' });
  execFileSync('sh', ['-c', 'cd "' + rel + '" && sha256sum "' + name + '.tar.gz" > "' + name + '.tar.gz.sha256"']);
  console.log('OK: ' + tarball);
})().catch((e) => { console.error(e); process.exit(1); });
