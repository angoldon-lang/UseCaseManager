# Archivio Use Case — installazione e uso sul server Linux

Applicazione autonoma: un server Node.js con database SQLite, accesso con utente e password e tre ruoli. Non richiede servizi esterni (anche le icone sono servite dal server).

## Requisiti
- Linux con systemd (Debian/Ubuntu, RHEL/Rocky/Alma, SUSE…) oppure Docker.
- **Node.js ≥ 22.13** (il database usa il modulo SQLite incluso in Node: nessun pacchetto da compilare).
- Un browser moderno (Chrome, Edge, Firefox) per gli utenti.

## Installazione con pacchetto (systemd)
```bash
tar xzf ad-usecase-archive-latest.tar.gz
cd ad-usecase-archive-linux-v*
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

**Dalla pagina web** (solo amministratori): pulsante **Utenti** in alto. Da lì puoi creare un utente (nome utente, nome visualizzato, email facoltativa, ruolo e password, con pulsante *Genera password*), cambiare ruolo, reimpostare la password, disabilitare/riattivare e eliminare. Ogni modifica di ruolo, password o disabilitazione chiude le sessioni attive di quell'utente. Non si può disabilitare, declassare o eliminare il proprio utente, né l'ultimo amministratore attivo.

**Da riga di comando** (utile per il primo avvio o se hai perso l'accesso; la password viene chiesta in modo riservato):
```bash
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm user:add mrossi "Mario Rossi" editor mario@azienda.it
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm user:list
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm user:passwd mrossi
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm user:role mrossi reader
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm user:disable mrossi
```
(Con Docker: `docker compose exec archivio node server/cli.js user:list`.)

## Elaborazione dei testi con l'AI (facoltativa)
Nel form di ogni caso c'è la scelta **«Scrivo tutto a mano» / «Elabora la descrizione dettagliata con l'AI»**. Con l'AI l'utente scrive degli appunti a punti e il server genera sintesi, esigenza, soluzione proposta, soluzione implementata, benefici e KPI in italiano; i testi restano modificabili e il caso viene marcato "Testi elaborati con AI" (colonna anche nell'Excel).

Per attivarla:
1. Crea una chiave API su https://platform.claude.com.
2. In `/etc/ad-usecase-archive/ucm.env` imposta `UCM_ANTHROPIC_API_KEY=sk-ant-...` (con Docker: variabile nel compose) e riavvia il servizio. La chiave resta sul server: non arriva mai al browser.
3. Il server deve poter raggiungere `api.anthropic.com` in HTTPS (proxy/firewall inclusi).

Dettagli utili:
- Modello predefinito `claude-opus-5-5`; per spendere meno imposta `UCM_AI_MODEL=claude-sonnet-5-5` (o `claude-haiku-5-5`). Ogni elaborazione consuma qualche migliaio di token.
- Possono usarla `editor` e `admin`, con un limite orario per utente (`UCM_AI_HOURLY_LIMIT`, predefinito 30).
- **Riservatezza**: all'AI vanno solo gli appunti, il nome del progetto, il settore, l'anno, vendor, tecnologie e servizi. **Mai il nome del cliente**: agli utenti conviene non scriverlo negli appunti, perché il testo degli appunti viene inviato così com'è.
- L'AI è istruita a non inventare dati: i campi senza informazioni (tipicamente i KPI) restano vuoti. Va comunque riletto il risultato prima di salvare.
- Senza chiave l'opzione AI è disattivata e si scrive a mano.

## HTTPS
Il servizio parla HTTP: in produzione mettilo dietro un reverse proxy HTTPS. Vedi `nginx.conf.example`; in `ucm.env` imposta `UCM_HOST=127.0.0.1` e `UCM_TRUST_PROXY=1` (cookie `Secure` e IP reale per il blocco dei tentativi di login). Con Caddy basta `archivio.example.com { reverse_proxy 127.0.0.1:8080 }`.

## Configurazione (`/etc/ad-usecase-archive/ucm.env`)
`UCM_PORT`, `UCM_HOST`, `UCM_DATA_DIR`, `UCM_SITE_TITLE`, `UCM_SECTORS` (elenco settori), `UCM_TRUST_PROXY`, `UCM_COOKIE_SECURE`, `UCM_ADMIN_PASSWORD` (solo primo avvio), `UCM_ANTHROPIC_API_KEY`, `UCM_AI_MODEL`, `UCM_AI_HOURLY_LIMIT` (elaborazione AI). Dopo ogni modifica: `sudo systemctl restart ad-usecase-archive`.

## Backup e ripristino
```bash
sudo -u ucm env UCM_DATA_DIR=/var/lib/ad-usecase-archive ucm backup /var/backups/archivio-$(date +%F)
```
Copia in modo coerente database e loghi anche a servizio attivo. Per ripristinare: ferma il servizio e ricopia `usecases.db` e `assets/` in `/var/lib/ad-usecase-archive` (proprietario `ucm`). I casi eliminati dall'interfaccia restano nel database: `ucm trash:list` e `ucm trash:restore <id>`.

## Comportamento
- **Concorrenza**: ogni caso ha una versione; se un altro utente salva prima di te compare l'avviso con le opzioni "Ricarica" o "Sovrascrivi con le mie modifiche".
- **Sicurezza**: password con scrypt, sessioni di 12 ore su cookie `HttpOnly`/`SameSite=Strict`, intestazione anti-CSRF, Content-Security-Policy, blocco dopo 5 accessi falliti in 10 minuti, validazione lato server di tutti i campi.
- **Campi del caso**: oltre ai campi iniziali ci sono il **Sales di riferimento** (facoltativo, solo uso interno: non compare nella scheda PDF) e il **fatturato del cliente a scaglioni** (Fino a 2 M€, 2–10, 10–50, 50–250, 250 M€–1 Mld€, Oltre 1 Mld€). I casi salvati con un importo vengono convertiti automaticamente nello scaglione corrispondente.
- **Citabilità/PDF/Excel**: l'export Excel include sempre tutti i casi, ignorando i filtri.

## Aggiornamento
```bash
sudo ucm-update
```
Scarica l'ultima versione, verifica l'integrità del pacchetto (sha256), fa un **backup** dei dati in `/var/backups/ad-usecase-archive/` (ne conserva gli ultimi 10), installa e controlla che il servizio risponda con la nuova versione. **Se qualcosa non va torna da solo alla versione precedente** e i dati non vengono toccati. Dati, utenti e configurazione restano sempre.

| Comando | Cosa fa |
|---|---|
| `sudo ucm-update` | installa l'ultima versione disponibile |
| `sudo ucm-update --check` | mostra versione installata e disponibile, senza installare |
| `sudo ucm-update --file PACCHETTO.tar.gz` | usa un pacchetto copiato sul server (nessun accesso a GitHub) |
| `sudo ucm-update --force` | reinstalla anche se la versione è la stessa o più vecchia |
| `sudo ucm-update --branch RAMO` | legge l'aggiornamento da un altro ramo del repository |
| `ucm version` | mostra la versione installata |

La versione in uso è visibile anche **nell'app, in basso** (con data di build e un elenco delle novità).

**Da dove si aggiorna**: l'origine è in `/etc/ad-usecase-archive/update.conf` (`REPO_URL` e `BRANCH`). Serve `git` sul server e l'accesso a GitHub. Se il repository è **privato** crea un token GitHub in sola lettura sul repository e scrivilo in `update.conf` (`TOKEN="..."`) oppure lancia `sudo GITHUB_TOKEN=... ucm-update`. Senza accesso a GitHub scarica il pacchetto da un altro computer, copialo sul server e usa `--file`.

Se per qualche motivo il comando `ucm-update` non è disponibile (installazione molto vecchia): estrai il nuovo tar e lancia `sudo ./install.sh`, che fa la stessa sostituzione senza backup automatico.

**Con Docker**: `git pull`, poi `npm install && node standalone/build.js` e `docker compose -f standalone/docker-compose.yml up -d --build` (i dati stanno nel volume `ucm-data`).

## Compilare dai sorgenti
```bash
npm install
npm run build                # produce dist-standalone/ e release-standalone/ad-usecase-archive-linux-v<versione>.tar.gz
npm test                     # tipi, PDF/Excel e API del server (utenti, AI simulata, concorrenza…)
npm run test:update          # installazione e aggiornamento simulati (con ritorno alla versione precedente)
npm run release -- patch     # nuova versione: aggiorna deploy/ per ucm-update
```
