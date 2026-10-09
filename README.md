# Archivio Use Case — AD Consulting (SPFx)

Web part SharePoint Framework 1.21.1 (React 17, TypeScript, Fluent UI v8) per raccogliere i casi progettuali, generare la scheda PDF (con anonimizzazione dei clienti non citabili) ed esportare tutto in Excel.

- Dati: lista SharePoint **Use Cases**; loghi: libreria **Use Case Assets**; nomi configurabili nelle proprietà della web part.
- PDF: [pdfmake](http://pdfmake.org) (testo selezionabile, A4, immagini incorporate, anteprima, testi modificabili al volo, segnalazione sezioni oltre una pagina).
- Excel: [ExcelJS](https://github.com/exceljs/exceljs) (.xlsx nativo con intestazioni evidenziate, riga bloccata, wrap text, testi forzati a stringa).
- Concorrenza ottimistica con `odata.etag` / `If-Match`.

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
```

## Comandi
```bash
npm install
npx gulp serve                       # workbench (https://<tenant>/_layouts/workbench.aspx)
npx gulp clean && npx gulp bundle --ship && npx gulp package-solution --ship
npm run test:logic
```
Vedi la [guida per l'amministratore](docs/GUIDA-AMMINISTRATORE.md) per il deploy.
