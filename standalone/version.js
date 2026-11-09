'use strict';
/** Informazioni di versione, calcolate in fase di build. */
const { execSync } = require('child_process');
const path = require('path');

function getBuildInfo() {
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  let commit = '';
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    // fuori da un repository git
  }
  // UCM_VERSION_OVERRIDE serve solo ai test automatici dell'aggiornamento.
  return { version: process.env.UCM_VERSION_OVERRIDE || pkg.version, build: new Date().toISOString().slice(0, 10), commit: commit };
}

module.exports = { getBuildInfo };
