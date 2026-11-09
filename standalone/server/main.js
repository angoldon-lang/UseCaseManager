'use strict';
/** Avvio del server. */
const { createApp, loadConfig } = require('./index');

const config = loadConfig();
const { server } = createApp(config);
server.listen(config.port, config.host, () => {
  console.log('Archivio Use Case in ascolto su http://' + config.host + ':' + config.port + ' (dati: ' + config.dataDir + ')');
  console.log('Elaborazione AI: ' + (config.aiApiKey ? 'attiva (modello ' + config.aiModel + ')' : 'non configurata (UCM_ANTHROPIC_API_KEY)'));
});
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
