# Archivio Use Case — AD Consulting

Applicazione web interna per raccogliere i casi progettuali, consultarli, generare la scheda PDF (con anonimizzazione dei clienti non citabili) ed esportare tutto in Excel. Gira su un **server Linux**: Node.js + database SQLite, accesso con utente e password e ruoli (lettura, editor, amministratore).

## Guide
- **[Installazione, utenti, AI, backup](standalone/README.md)** — come installare e usare l'applicazione sul server.
- **[Aggiornamento](#aggiornamento)** — `sudo ucm-update`.
- [Novità per versione](CHANGELOG.md).

## Aggiornamento
Sul server, per portare l'applicazione all'ultima versione:
```bash
sudo ucm-update
```
Il comando scarica l'ultima versione, verifica il pacchetto, fa un **backup dei dati**, installa, controlla che il servizio risponda con la nuova versione e, se qualcosa non va, **torna da solo alla versione precedente**. Altre opzioni: `--check` (mostra versione installata e disponibile senza installare), `--file PACCHETTO.tar.gz` (usa un pacchetto copiato a mano), `--force`.
La versione in uso si vede in basso nell'app («v2.0.0 · build 09/11/2026 · commit») e con `ucm version` da terminale.

## Pubblicare una nuova versione (per chi sviluppa)
```bash
npm install                 # una tantum
npm run release -- patch    # oppure minor / major / 2.1.0
```
Aumenta la versione, aggiunge il titolo in `CHANGELOG.md` (da completare con le novità), esegue i test, compila e mette il pacchetto in `deploy/ad-usecase-archive-latest.tar.gz`. Poi `git add -A && git commit && git push`: il server si aggiorna con `sudo ucm-update`.

## Struttura
```
src/components/      interfaccia (tabella, form, PDF, impostazioni, tema con i colori AD)
src/models, utils/   modello dati, validazione, duplicati, formattazione
src/services/        generazione PDF (pdfmake), export Excel (ExcelJS), contratti verso il server
standalone/server/   server Node.js (API REST, SQLite, utenti, AI con SDK Anthropic) e comando ucm
standalone/web/      avvio dell'app nel browser, login, gestione utenti, versione
standalone/install/  installer systemd, ucm-update, esempi di configurazione
standalone/test/     test del server e dell'aggiornamento
scripts/             test di PDF/Excel e script di rilascio
deploy/              pacchetto pronto per l'installazione e per ucm-update
```

## Sviluppo
```bash
npm install
npm test                    # tipi, logica PDF/Excel, API del server
npm run test:update         # simulazione di installazione e aggiornamento (circa 1 minuto)
npm run build               # dist-standalone/ e release-standalone/*.tar.gz
```
Requisiti: Node.js ≥ 22.13.
