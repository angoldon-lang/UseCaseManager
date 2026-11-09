'use strict';
/** Versione del server: valorizzata in fase di build (esbuild define); in sviluppo letta da package.json. */
function getVersion() {
  /* global __APP_VERSION__, __APP_BUILD__, __APP_COMMIT__ */
  if (typeof __APP_VERSION__ !== 'undefined') {
    return { version: __APP_VERSION__, build: __APP_BUILD__, commit: __APP_COMMIT__ };
  }
  try {
    return { version: require('../../package.json').version + '-dev', build: '', commit: '' };
  } catch (e) {
    return { version: 'dev', build: '', commit: '' };
  }
}

module.exports = { getVersion };
