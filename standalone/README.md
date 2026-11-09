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
- **Citabilità/PDF/Excel**: identici alla versione SharePoint; l'export Excel include sempre tutti i casi, ignorando i filtri.

## Aggiornamento
Scompatta il nuovo pacchetto ed esegui di nuovo `sudo ./install.sh`. Disinstallazione: `sudo /opt/ad-usecase-archive/uninstall.sh` (`--purge` per eliminare anche i dati).

## Compilare dai sorgenti
```bash
npm install
node standalone/build.js     # produce dist-standalone/ e release-standalone/ad-usecase-archive-linux-v<versione>.tar.gz
npm run test:standalone      # test delle API del server (utenti, AI simulata, concorrenza…)
```
