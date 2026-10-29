# Archivio Use Case — versione standalone per Linux

Stessa interfaccia, schede PDF ed export Excel della web part SharePoint, ma come applicazione autonoma: un server Node.js con database SQLite, accesso con utente e password e tre ruoli. Non richiede SharePoint né servizi esterni (anche le icone sono servite dal server).

## Requisiti
- Linux con systemd (Debian/Ubuntu, RHEL/Rocky/Alma, SUSE…) oppure Docker.
- **Node.js ≥ 22.13** (il database usa il modulo SQLite incluso in Node: nessun pacchetto da compilare).
- Un browser moderno (Chrome, Edge, Firefox) per gli utenti.

## Installazione con pacchetto (systemd)
```bash
tar xzf ad-usecase-archive-linux-v1.0.0.tar.gz
cd ad-usecase-archive-linux-v1.0.0
sudo ./install.sh
```
Lo script crea l'utente di sistema `ucm`, installa in `/opt/ad-usecase-archive`, mette i dati in `/var/lib/ad-usecase-archive`, la configurazione in `/etc/ad-usecase-archive/ucm.env` e avvia il servizio `ad-usecase-archive`. È rieseguibile per aggiornare: configurazione e dati non vengono toccati.

Poi:
1. Leggi la password iniziale: `journalctl -u ad-usecase-archive | grep -A3 "PRIMO AVVIO"`.
2. Apri `http://<server>:8080`, accedi come **admin** e cambia la password (pulsante col tuo nome in alto).
3. In **Impostazioni** carica il logo AD Consulting.

## Installazione con Docker
```bash
npm install && node standalone/build.js           # genera dist-standalone/
docker compose -f standalone/docker-compose.yml up -d --build
docker compose -f standalone/docker-compose.yml logs | grep -A3 "PRIMO AVVIO"
```
I dati stanno nel volume `ucm-data` (`/data` nel container).

## Utenti e ruoli
| Ruolo | Può |
|---|---|
| `reader` | consultare, cercare, scaricare PDF, esportare Excel |
| `editor` | in più creare, modificare, duplicare, eliminare casi e caricare loghi cliente |
| `admin` | in più cambiare il logo aziendale |

Gli utenti si gestiscono da riga di comando (la password viene chiesta in modo riservato):
```bash
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm user:add mrossi "Mario Rossi" editor mario@azienda.it
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm user:list
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm user:passwd mrossi
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm user:role mrossi reader
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm user:disable mrossi
```
(Con Docker: `docker compose exec archivio node server/cli.js user:list`.)

## HTTPS
Il servizio parla HTTP: in produzione mettilo dietro un reverse proxy HTTPS. Vedi `nginx.conf.example`; in `ucm.env` imposta `UCM_HOST=127.0.0.1` e `UCM_TRUST_PROXY=1` (cookie `Secure` e IP reale per il blocco dei tentativi di login). Con Caddy basta `archivio.example.com { reverse_proxy 127.0.0.1:8080 }`.

## Configurazione (`/etc/ad-usecase-archive/ucm.env`)
`UCM_PORT`, `UCM_HOST`, `UCM_DATA_DIR`, `UCM_SITE_TITLE`, `UCM_SECTORS` (elenco settori), `UCM_TRUST_PROXY`, `UCM_COOKIE_SECURE`, `UCM_ADMIN_PASSWORD` (solo primo avvio). Dopo ogni modifica: `sudo systemctl restart ad-usecase-archive`.

## Backup e ripristino
```bash
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm backup /var/backups/archivio-$(date +%F)
```
Copia in modo coerente database e loghi anche a servizio attivo. Per ripristinare: ferma il servizio e ricopia `usecases.db` e `assets/` in `/var/lib/ad-usecase-archive` (proprietario `ucm`). I casi eliminati dall'interfaccia restano nel database: `ucm trash:list` e `ucm trash:restore <id>`.

## Comportamento
- **Concorrenza**: ogni caso ha una versione; se un altro utente salva prima di te compare l'avviso con le opzioni "Ricarica" o "Sovrascrivi con le mie modifiche".
- **Sicurezza**: password con scrypt, sessioni di 12 ore su cookie `HttpOnly`/`SameSite=Strict`, intestazione anti-CSRF, Content-Security-Policy, blocco dopo 5 accessi falliti in 10 minuti, validazione lato server di tutti i campi.
- **Citabilità/PDF/Excel**: identici alla versione SharePoint; l'export Excel include sempre tutti i casi, ignorando i filtri.

## Aggiornamento
Scompatta il nuovo pacchetto ed esegui di nuovo `sudo ./install.sh`. Disinstallazione: `sudo /opt/ad-usecase-archive/uninstall.sh` (`--purge` per eliminare anche i dati).

## Compilare dai sorgenti
```bash
npm install
node standalone/build.js     # produce dist-standalone/ e release-standalone/ad-usecase-archive-linux-v<versione>.tar.gz
npm run test:standalone      # test delle API del server
```
