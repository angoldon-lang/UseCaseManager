# Archivio Use Case — Guida per l'amministratore

## 1. Prerequisiti
- Tenant Microsoft 365 con SharePoint Online e un **App Catalog** (di tenant o di sito).
- Ruolo **SharePoint Administrator** (o *Site Collection App Catalog Admin*) per caricare l'app.
- Un sito SharePoint dove installare l'archivio e **proprietario del sito** per creare lista e libreria.
- Solo per la compilazione: Node.js 22.14+ (o 18.17) e npm.

## 2. Compilazione e pacchetto (facoltativa: `deploy/ad-usecase-archive.sppkg` è già pronto)
```bash
npm install
npx gulp clean
npx gulp bundle --ship
npx gulp package-solution --ship
# output: sharepoint/solution/ad-usecase-archive.sppkg
```
Test logica PDF/Excel senza SharePoint: `npm run test:logic`.

## 3. Distribuzione nell'App Catalog
1. Admin center SharePoint → **Altre funzionalità → App → Apri** (oppure *Site Contents → Apps for SharePoint* del Site Collection App Catalog).
2. **Carica** `ad-usecase-archive.sppkg`.
3. Nella finestra di conferma spunta *"Rendi disponibile questa soluzione a tutti i siti"* (solo con catalogo di tenant) e scegli **Distribuisci**.
4. **Permessi API: nessuna concessione necessaria.** La web part usa solo le API REST di SharePoint con l'identità dell'utente connesso e non richiede approvazioni in *Accesso API* (`webApiPermissionRequests` è vuoto). Se il catalogo non è "tenant-wide", aggiungi l'app al sito da *Contenuti del sito → Nuovo → App*.

## 4. Creazione di lista e libreria
Due alternative equivalenti (idempotenti):
- **Automatica dalla web part**: aggiungi la web part alla pagina, apri **Impostazioni → Verifica / crea lista e libreria** (richiede il permesso *Gestisci liste*).
- **Script PnP PowerShell**: `./provision/Provision-UseCaseArchive.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<sito>`

Vengono creati: lista **Use Cases** (colonna `Title` = Cliente + 19 colonne dedicate, versioning attivo) e libreria documenti **Use Case Assets**. Nomi diversi si impostano sia nello script sia nelle proprietà della web part.

## 5. Inserimento nella pagina moderna
1. Crea/modifica una pagina → **+** → cerca **Archivio Use Case**.
2. Per la tabella usa preferibilmente una sezione a **tutta larghezza** (o l'app come *pagina a pagina intera*: tipo di pagina *Single-part app page*).
3. Pannello proprietà: titolo applicazione, nome lista, nome libreria, elenco settori (separati da virgola).
4. Pubblica la pagina. Il logo AD Consulting è già incorporato nell'app (interfaccia e schede PDF); per sostituirlo con una versione ad alta risoluzione apri **Impostazioni → Logo AD Consulting** (salvato come `ad-consulting-logo.png` nella libreria).

## 6. Permessi
| Operazione | Permesso minimo |
|---|---|
| Consultare, scaricare PDF, esportare Excel | Lettura su lista e libreria |
| Creare / modificare casi, caricare loghi | Collaborazione (Contribute) su lista e libreria |
| Eliminare | *Elimina elementi* (i casi vanno nel cestino del sito) |
| Creare lista/libreria dalla web part | Proprietari del sito |

Excel e tabella mostrano solo ciò che l'utente può leggere (anche con permessi a livello di elemento).

## 7. Comportamento da conoscere
- **Concorrenza**: ogni scrittura invia `If-Match` con l'`odata.etag` letto all'apertura. Se un altro utente ha salvato nel frattempo, compare una finestra che propone di ricaricare la versione aggiornata o di sovrascrivere esplicitamente.
- **Loghi**: convertiti in PNG (trasparenza preservata, max 800 px) e salvati in `Use Case Assets`; nel PDF sono incorporati come immagini, quindi il file resta valido offline.
- **Anonimizzazione**: se il cliente non è citabile il PDF omette nome e logo; il nome file contiene solo ID, settore e anno. L'app avvisa se i testi contengono il nome del cliente.
- **Excel**: una riga per caso, tutti i casi accessibili (bozze incluse, filtri ignorati, paginazione SharePoint gestita), valori multipli separati da `;`. Limite di Excel: 32.767 caratteri per cella.
- **Aggiornamenti**: incrementa `version` in `config/package-solution.json`, ricompila e ricarica il `.sppkg` nell'App Catalog.

## 8. Aggiornamento da una versione precedente: nuove colonne
La versione corrente aggiunge alla lista **Use Cases** le colonne *Fatturato cliente (scaglione)*, *Sales di riferimento*, *Testi elaborati con AI* e *Appunti per l'AI*. Dopo aver caricato il nuovo `.sppkg`, apri la web part: se compare il messaggio che la lista non contiene tutte le colonne, vai in **Impostazioni → Verifica / crea lista e libreria** (o riesegui lo script PnP) per aggiungerle. I fatturati inseriti in precedenza come importo vengono mostrati nel relativo scaglione. La gestione utenti da pagina e l'elaborazione AI dei testi esistono solo nella versione Linux standalone: su SharePoint gli utenti sono quelli di Microsoft 365 e i testi si scrivono a mano.

## 9. Risoluzione problemi
| Sintomo | Causa / rimedio |
|---|---|
| "Elemento, lista o libreria non trovati" | Lista/libreria mancanti o nome diverso nelle proprietà: usare §4. |
| "Non hai i permessi…" | Concedere Collaborazione sulla lista/libreria. |
| Anteprima PDF vuota | Il browser blocca i PDF in iframe: usare **Scarica PDF**. |
| Icone mancanti | Il tenant blocca la CDN dei font Office UI Fabric. |
