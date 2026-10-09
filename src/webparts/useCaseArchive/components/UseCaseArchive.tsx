import * as React from 'react';
import { SPHttpClient } from '@microsoft/sp-http';
import {
  PrimaryButton, DefaultButton, MessageBar, MessageBarType, Spinner, SpinnerSize
} from '@fluentui/react';
import styles from './UseCaseArchive.module.scss';
import { IUseCase, IUserPermissions, IWebPartSettings, emptyUseCase } from '../../../models/UseCase';
import { SpClient, AppError } from '../../../services/SpClient';
import { UseCaseService } from '../../../services/UseCaseService';
import { AssetService } from '../../../services/AssetService';
import { ProvisioningService } from '../../../services/ProvisioningService';
import { exportToExcel } from '../../../services/ExcelService';
import { UseCaseTable, FilterBar, IFilters, EMPTY_FILTERS } from './UseCaseTable';
import { UseCaseForm, ILogoChange } from './UseCaseForm';
import { PdfDialog } from './PdfDialog';
import { SettingsPanel } from './SettingsPanel';
import { ConfirmDialog } from './ConfirmDialog';
import { Notifications, INotification } from './Notifications';

export interface IUseCaseArchiveProps {
  spHttpClient: SPHttpClient;
  webUrl: string;
  settings: IWebPartSettings;
}

type View =
  | { kind: 'list' }
  | { kind: 'form'; uc: IUseCase; readOnly: boolean; key: string };

const ALL_PERMISSIONS: IUserPermissions = { canAdd: true, canEdit: true, canDelete: true };

let notificationSeq = 1;

const UseCaseArchive: React.FC<IUseCaseArchiveProps> = function (props) {
  const settings = props.settings;
  const sp = React.useMemo(function () { return new SpClient(props.spHttpClient, props.webUrl); }, [props.spHttpClient, props.webUrl]);
  const service = React.useMemo(function () { return new UseCaseService(sp, settings.listTitle); }, [sp, settings.listTitle]);
  const assets = React.useMemo(function () { return new AssetService(sp, settings.assetsLibraryTitle); }, [sp, settings.assetsLibraryTitle]);
  const provisioning = React.useMemo(function () {
    return new ProvisioningService(sp, settings.listTitle, settings.assetsLibraryTitle);
  }, [sp, settings.listTitle, settings.assetsLibraryTitle]);

  const [items, setItems] = React.useState<IUseCase[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<AppError | null>(null);
  const [permissions, setPermissions] = React.useState<IUserPermissions>(ALL_PERMISSIONS);
  const [view, setView] = React.useState<View>({ kind: 'list' });
  const [filters, setFilters] = React.useState<IFilters>(EMPTY_FILTERS);
  const [notes, setNotes] = React.useState<INotification[]>([]);
  const [adLogo, setAdLogo] = React.useState<string | null>(null);
  const [pdfFor, setPdfFor] = React.useState<IUseCase | null>(null);
  const [deleteFor, setDeleteFor] = React.useState<IUseCase | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);

  const dismiss = React.useCallback(function (id: number): void {
    setNotes(function (n) { return n.filter(function (x) { return x.id !== id; }); });
  }, []);

  const notify = React.useCallback(function (type: MessageBarType, text: string): void {
    const id = notificationSeq++;
    setNotes(function (n) { return n.concat([{ id: id, type: type, text: text }]); });
    setTimeout(function () { dismiss(id); }, type === MessageBarType.error ? 9000 : 4500);
  }, [dismiss]);

  const refresh = React.useCallback(async function (): Promise<IUseCase[]> {
    try {
      const all = await service.getAll();
      setItems(all);
      setLoadError(null);
      return all;
    } catch (e) {
      setLoadError(e instanceof AppError ? e : new AppError((e as Error).message));
      return [];
    }
  }, [service]);

  React.useEffect(function () {
    let cancelled = false;
    setLoading(true);
    Promise.all([refresh(), service.getPermissions().catch(function () { return ALL_PERMISSIONS; })]).then(function (r) {
      if (!cancelled) {
        setPermissions(r[1]);
        setLoading(false);
      }
    });
    assets.getAdLogo().then(function (l) { if (!cancelled) { setAdLogo(l); } }).catch(function () { /* logo opzionale */ });
    return function () { cancelled = true; };
  }, [service, assets]);

  // ---- azioni --------------------------------------------------------------------------------------

  const openForm = function (uc: IUseCase, readOnly: boolean): void {
    setView({ kind: 'form', uc: uc, readOnly: readOnly, key: (uc.id || 'new') + '-' + Date.now() });
  };

  const newCase = function (): void {
    openForm(emptyUseCase(), false);
  };

  const openExisting = async function (uc: IUseCase, readOnly: boolean): Promise<void> {
    // Rilegge il caso per avere dati ed etag aggiornati prima di modificarlo.
    try {
      const fresh = await service.getById(uc.id as number);
      openForm(fresh, readOnly);
    } catch (e) {
      notify(MessageBarType.error, (e as Error).message);
      refresh();
    }
  };

  const duplicate = function (uc: IUseCase): void {
    const copy: IUseCase = Object.assign({}, uc, {
      id: undefined, etag: undefined, created: undefined, modified: undefined, autore: undefined, autoreEmail: undefined, modificatoDa: undefined,
      nomeProgetto: uc.nomeProgetto ? uc.nomeProgetto + ' (copia)' : '',
      stato: 'Bozza' as const
    });
    openForm(copy, false);
    notify(MessageBarType.info, 'Copia creata come bozza: verifica i dati e salva.');
  };

  const saveCase = async function (uc: IUseCase, logo: ILogoChange, force: boolean): Promise<IUseCase> {
    const working = Object.assign({}, uc);
    const previousLogo = uc.logoClienteUrl;
    let uploaded = '';
    if (logo.pending) {
      const name = 'logo-cliente-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.png';
      uploaded = await assets.uploadPng(name, logo.pending);
      working.logoClienteUrl = uploaded;
    } else if (logo.removed) {
      working.logoClienteUrl = '';
      working.logoUtilizzabile = false;
    }
    let saved: IUseCase;
    try {
      saved = uc.id ? await service.update(working, force) : await service.create(working);
    } catch (e) {
      if (uploaded) {
        await assets.deleteFile(uploaded);
      }
      throw e;
    }
    const all = await refresh();
    // Elimina il vecchio logo solo se nessun altro caso lo utilizza (le copie ne condividono il riferimento).
    if (previousLogo && previousLogo !== saved.logoClienteUrl) {
      const stillUsed = all.some(function (i) { return i.logoClienteUrl === previousLogo; });
      if (!stillUsed) {
        await assets.deleteFile(previousLogo);
      }
    }
    return saved;
  };

  const confirmDelete = async function (): Promise<void> {
    if (!deleteFor) { return; }
    setDeleting(true);
    try {
      await service.remove(deleteFor);
      const all = await refresh();
      const logo = deleteFor.logoClienteUrl;
      if (logo && !all.some(function (i) { return i.logoClienteUrl === logo; })) {
        await assets.deleteFile(logo);
      }
      notify(MessageBarType.success, 'Caso eliminato (spostato nel cestino del sito).');
      setDeleteFor(null);
    } catch (e) {
      notify(MessageBarType.error, (e as Error).message + ' Il caso potrebbe essere stato modificato da un altro utente: aggiorna l\'elenco.');
      setDeleteFor(null);
      refresh();
    } finally {
      setDeleting(false);
    }
  };

  const exportAll = async function (): Promise<void> {
    setExporting(true);
    try {
      // Rilettura completa (con paginazione), indipendente dai filtri attivi.
      const all = await service.getAll();
      await exportToExcel(all);
      notify(MessageBarType.success, 'Esportati ' + all.length + ' use case in Excel.');
    } catch (e) {
      notify(MessageBarType.error, 'Esportazione non riuscita: ' + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const openPdf = function (uc: IUseCase): void {
    setPdfFor(uc);
  };

  // ---- rendering ------------------------------------------------------------------------------------

  const header = (
    <div className={styles.header}>
      {adLogo ? <img className={styles.logo} src={adLogo} alt="AD Consulting" /> : <span className={styles.brandText}>AD Consulting</span>}
      <h1 className={styles.title}>{settings.siteTitle}</h1>
      <div className={styles.toolbar}>
        {view.kind === 'list' && !loadError && (
          <>
            <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nuovo caso" disabled={!permissions.canAdd} onClick={newCase} />
            <DefaultButton iconProps={{ iconName: 'ExcelDocument' }} text={exporting ? 'Esportazione…' : 'Esporta tutti in Excel'} disabled={exporting || loading} onClick={exportAll} />
            <DefaultButton iconProps={{ iconName: 'Refresh' }} text="Aggiorna" disabled={loading} onClick={function () { setLoading(true); refresh().then(function () { setLoading(false); }); }} />
          </>
        )}
        <DefaultButton iconProps={{ iconName: 'Settings' }} text="Impostazioni" onClick={function () { setShowSettings(true); }} />
      </div>
    </div>
  );

  let body: JSX.Element;
  if (loading) {
    body = <Spinner size={SpinnerSize.large} label="Caricamento dell'archivio…" style={{ padding: 40 }} />;
  } else if (loadError) {
    body = (
      <div className={styles.setupBox}>
        <MessageBar messageBarType={MessageBarType.error} isMultiline={true}>
          {loadError.message}
          {loadError.status === 404 && (
            <div style={{ marginTop: 6 }}>
              La lista "{settings.listTitle}" o la libreria "{settings.assetsLibraryTitle}" non esistono ancora in questo sito. Se hai il permesso
              "Gestisci liste" puoi crearle dalle Impostazioni; in alternativa usa lo script di provisioning fornito.
            </div>
          )}
        </MessageBar>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <PrimaryButton text="Apri impostazioni" iconProps={{ iconName: 'Settings' }} onClick={function () { setShowSettings(true); }} />
          <DefaultButton text="Riprova" onClick={function () { setLoading(true); refresh().then(function () { setLoading(false); }); }} />
        </div>
      </div>
    );
  } else if (view.kind === 'form') {
    body = (
      <UseCaseForm
        key={view.key}
        initial={view.uc}
        readOnly={view.readOnly}
        sectors={settings.sectors}
        allItems={items}
        assets={assets}
        permissions={permissions}
        onSave={saveCase}
        onClose={function () { setView({ kind: 'list' }); }}
        onEdit={function () { if (view.uc.id) { openExisting(view.uc, false); } }}
        onPdf={openPdf}
        notify={notify}
      />
    );
  } else {
    body = (
      <>
        <FilterBar items={items} sectors={settings.sectors} filters={filters} onChange={setFilters} />
        <UseCaseTable
          items={items}
          filters={filters}
          onFiltersChange={setFilters}
          permissions={permissions}
          onOpen={function (uc) { openExisting(uc, true); }}
          onEdit={function (uc) { openExisting(uc, false); }}
          onDuplicate={duplicate}
          onDelete={setDeleteFor}
          onPdf={openPdf}
        />
      </>
    );
  }

  return (
    <div className={styles.app}>
      <Notifications items={notes} onDismiss={dismiss} />
      {header}
      {body}

      {pdfFor && (
        <PdfDialog uc={pdfFor} assets={assets} adLogo={adLogo} notify={notify} onDismiss={function () { setPdfFor(null); }} />
      )}

      {deleteFor && (
        <ConfirmDialog
          title="Elimina caso"
          message={'Vuoi eliminare il caso "' + deleteFor.nomeProgetto + '" (' + deleteFor.cliente + ')? Verrà spostato nel cestino del sito.'}
          confirmText="Elimina"
          danger={true}
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={function () { setDeleteFor(null); }}
        />
      )}

      {showSettings && (
        <SettingsPanel
          assets={assets}
          provisioning={provisioning}
          settings={settings}
          adLogo={adLogo}
          onAdLogoChanged={setAdLogo}
          onProvisioned={function () { setLoading(true); refresh().then(function () { setLoading(false); }); }}
          notify={notify}
          onDismiss={function () { setShowSettings(false); }}
        />
      )}
    </div>
  );
};

export default UseCaseArchive;
