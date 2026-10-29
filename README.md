# Archivio Use Case — AD Consulting (SPFx)

Web part SharePoint Framework 1.21.1 (React 17, TypeScript, Fluent UI v8) per raccogliere i casi progettuali, generare la scheda PDF (con anonimizzazione dei clienti non citabili) ed esportare tutto in Excel.

- Dati: lista SharePoint **Use Cases**; loghi: libreria **Use Case Assets**; nomi configurabili nelle proprietà della web part.
- PDF: [pdfmake](http://pdfmake.org) (testo selezionabile, A4, immagini incorporate, anteprima, testi modificabili al volo, segnalazione sezioni oltre una pagina).
- Excel: [ExcelJS](https://github.com/exceljs/exceljs) (.xlsx nativo con intestazioni evidenziate, riga bloccata, wrap text, testi forzati a stringa).
- Concorrenza ottimistica con `odata.etag` / `If-Match`.

## Due modi di usarlo
| | Web part SharePoint | **Standalone Linux** |
|---|---|---|
| Pacchetto | `deploy/ad-usecase-archive.sppkg` | `deploy/ad-usecase-archive-linux-v1.0.0.tar.gz` |
| Dati | lista SharePoint + libreria | SQLite + file sul server |
| Accesso | account Microsoft 365 | utenti locali (admin / editor / reader) |
| Guida | [docs/GUIDA-AMMINISTRATORE.md](docs/GUIDA-AMMINISTRATORE.md) | [standalone/README.md](standalone/README.md) |

La stessa interfaccia, le stesse schede PDF e lo stesso export Excel sono condivisi: i componenti React dipendono solo dai contratti in `src/services/contracts.ts`, implementati da `SharePointBackend` e da `standalone/web/HttpBackend.ts`.

## Struttura
```
src/
  models/UseCase.ts                 modello, servizi AD, settori
  services/                         SpClient, UseCaseService (REST + etag + paginazione), AssetService,
                                    ProvisioningService, PdfService, ExcelService
  utils/                            formattazione, validazione, duplicati, elaborazione immagini
  webparts/useCaseArchive/          web part, manifest, loc, components (tabella, form, PDF, impostazioni)
config/                             configurazione SPFx e package-solution
provision/Provision-UseCaseArchive.ps1   provisioning PnP PowerShell
deploy/ad-usecase-archive.sppkg     pacchetto pronto per l'App Catalog
docs/GUIDA-AMMINISTRATORE.md        guida passo-passo
scripts/test-logic.js               test di PDF/Excel/duplicati/anonimizzazione (npm run test:logic)
standalone/                         versione per Linux: server Node.js + SQLite, web app, installer systemd, Dockerfile
                                    (node standalone/build.js; npm run test:standalone)
```

## Comandi
```bash
npm install
npx gulp serve                       # workbench (https://<tenant>/_layouts/workbench.aspx)
npx gulp clean && npx gulp bundle --ship && npx gulp package-solution --ship
npm run test:logic
```
Vedi la [guida per l'amministratore](docs/GUIDA-AMMINISTRATORE.md) per il deploy.
