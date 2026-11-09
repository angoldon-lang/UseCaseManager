import * as React from 'react';
import {
  TextField, Dropdown, IDropdownOption, Checkbox, ChoiceGroup, IChoiceGroupOption, PrimaryButton, DefaultButton,
  MessageBar, MessageBarType, MessageBarButton, Spinner, SpinnerSize, Toggle
} from '@fluentui/react';
import styles from './UseCaseArchive.module.scss';
import { IUseCase, IUserPermissions, SERVIZI_AD, CaseStatus, FATTURATO_SCAGLIONI } from '../../../models/UseCase';
import { IAssetStore, IAiAssistant } from '../../../services/contracts';
import { ConflictError } from '../../../services/errors';
import { TagInput } from './TagInput';
import { LogoPicker } from './LogoPicker';
import { ConfirmDialog } from './ConfirmDialog';
import { findDuplicatesOf } from '../../../utils/duplicates';
import { validateBasic, validateComplete, missingRequiredLabels, defaultAnonymousName, FieldErrors } from '../../../utils/validation';
import { formatDateTime, parseNumber, uniqueSorted } from '../../../utils/format';

export interface ILogoChange {
  pending: string | null;
  removed: boolean;
}

export interface IUseCaseFormProps {
  initial: IUseCase;
  readOnly: boolean;
  sectors: string[];
  allItems: IUseCase[];
  assets: IAssetStore;
  /** Elaborazione AI dei testi (assente se non disponibile). */
  ai?: IAiAssistant;
  aiUnavailableReason?: string;
  permissions: IUserPermissions;
  onSave: (uc: IUseCase, logo: ILogoChange, force: boolean) => Promise<IUseCase>;
  onClose: () => void;
  onEdit: () => void;
  onPdf: (uc: IUseCase) => void;
  notify: (type: MessageBarType, text: string) => void;
}

const NO_LOGO_CHANGE: ILogoChange = { pending: null, removed: false };

function numToText(n: number | null): string {
  return n === null || n === undefined ? '' : String(n).replace('.', ',');
}

const Section: React.FC<{ n: number; title: string; children: React.ReactNode }> = function (props) {
  return (
    <section className={styles.section} aria-labelledby={'sec-' + props.n}>
      <h3 className={styles.sectionTitle} id={'sec-' + props.n}>
        <span className={styles.sectionNumber}>{props.n}</span>
        {props.title}
      </h3>
      <div className={styles.sectionBody}>{props.children}</div>
    </section>
  );
};

export const UseCaseForm: React.FC<IUseCaseFormProps> = function (props) {
  const [draft, setDraft] = React.useState<IUseCase>(props.initial);
  const [initialJson, setInitialJson] = React.useState<string>(JSON.stringify(props.initial));
  const [numText, setNumText] = React.useState({
    spesa: numToText(props.initial.spesa),
    anno: numToText(props.initial.anno)
  });
  const [logo, setLogo] = React.useState<ILogoChange>(NO_LOGO_CHANGE);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState<ConflictError | null>(null);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [completeMissing, setCompleteMissing] = React.useState<string[]>([]);
  const [generating, setGenerating] = React.useState(false);
  const [aiNotice, setAiNotice] = React.useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = React.useState(false);

  const mounted = React.useRef(true);
  React.useEffect(function () { return function () { mounted.current = false; }; }, []);

  const ro = props.readOnly;
  const dirty = !ro && (JSON.stringify(draft) !== initialJson || !!logo.pending || logo.removed);

  // Avviso del browser se si chiude la scheda con modifiche non salvate.
  React.useEffect(function () {
    if (!dirty) {
      return undefined;
    }
    const handler = function (e: BeforeUnloadEvent): string {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return function () { window.removeEventListener('beforeunload', handler); };
  }, [dirty]);

  const set = function <K extends keyof IUseCase>(field: K, value: IUseCase[K]): void {
    setDraft(function (d) { const n = Object.assign({}, d); n[field] = value; return n; });
    if (errors[field as string]) {
      setErrors(function (e) { const n = Object.assign({}, e); delete n[field as string]; return n; });
    }
  };

  const text = function (
    field: 'cliente' | 'localizzazione' | 'salesRiferimento' | 'nomeProgetto' | 'sintesi' | 'esigenza' | 'soluzioneProposta' | 'soluzioneImplementata' | 'benefici' | 'kpi' | 'denominazioneAnonima',
    label: string,
    opts?: { multiline?: boolean; rows?: number; required?: boolean; full?: boolean; placeholder?: string; description?: string }
  ): JSX.Element {
    const o = opts || {};
    return (
      <div className={o.full || o.multiline ? styles.full : undefined}>
        <TextField
          label={label}
          required={o.required}
          multiline={o.multiline}
          rows={o.rows || 4}
          autoAdjustHeight={o.multiline}
          resizable={false}
          value={draft[field]}
          placeholder={o.placeholder}
          description={o.description}
          readOnly={ro}
          errorMessage={errors[field]}
          onChange={function (_, v) { set(field, v || ''); }}
        />
      </div>
    );
  };

  const sectorOptions: IDropdownOption[] = React.useMemo(function () {
    const list = props.sectors.slice();
    if (draft.settore && list.indexOf(draft.settore) < 0) {
      list.push(draft.settore);
    }
    return list.map(function (s) { return { key: s, text: s }; });
  }, [props.sectors, draft.settore]);

  const vendorSuggestions = React.useMemo(function () {
    return uniqueSorted(props.allItems.reduce(function (acc: string[], i) { return acc.concat(i.vendor); }, []));
  }, [props.allItems]);
  const techSuggestions = React.useMemo(function () {
    return uniqueSorted(props.allItems.reduce(function (acc: string[], i) { return acc.concat(i.tecnologie); }, []));
  }, [props.allItems]);

  const duplicates = findDuplicatesOf(draft, props.allItems);

  const doSave = async function (status: CaseStatus, close: boolean, force: boolean = false): Promise<void> {
    const toSave: IUseCase = Object.assign({}, draft, { stato: status });
    if (!toSave.clienteCitabile && !(toSave.denominazioneAnonima || '').trim()) {
      toSave.denominazioneAnonima = defaultAnonymousName(toSave.settore);
    }
    const errs = status === 'Completo' ? validateComplete(toSave) : validateBasic(toSave);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setCompleteMissing(status === 'Completo' ? missingRequiredLabels(toSave) : []);
      props.notify(MessageBarType.error, 'Impossibile salvare: controlla i campi evidenziati.');
      return;
    }
    setCompleteMissing([]);
    setSaving(true);
    try {
      const saved = await props.onSave(toSave, logo, force);
      if (!mounted.current) {
        return;
      }
      setDraft(saved);
      setInitialJson(JSON.stringify(saved));
      setNumText({ spesa: numToText(saved.spesa), anno: numToText(saved.anno) });
      setLogo(NO_LOGO_CHANGE);
      setConflict(null);
      props.notify(MessageBarType.success, 'Caso "' + (saved.nomeProgetto || saved.cliente) + '" salvato correttamente.');
      if (close) {
        props.onClose();
      }
    } catch (e) {
      if (e instanceof ConflictError) {
        setConflict(e);
      } else {
        props.notify(MessageBarType.error, (e as Error).message || 'Salvataggio non riuscito.');
      }
    } finally {
      if (mounted.current) {
        setSaving(false);
      }
    }
  };

  const requestClose = function (): void {
    if (dirty) {
      setConfirmClose(true);
    } else {
      props.onClose();
    }
  };

  const TEXT_FIELDS: Array<'sintesi' | 'esigenza' | 'soluzioneProposta' | 'soluzioneImplementata' | 'benefici' | 'kpi'> = [
    'sintesi', 'esigenza', 'soluzioneProposta', 'soluzioneImplementata', 'benefici', 'kpi'
  ];

  const runGenerate = async function (): Promise<void> {
    if (!props.ai) {
      return;
    }
    setGenerating(true);
    try {
      const out = await props.ai.describe({
        appunti: draft.appuntiAI,
        nomeProgetto: draft.nomeProgetto,
        settore: draft.settore,
        anno: draft.anno,
        vendor: draft.vendor,
        tecnologie: draft.tecnologie,
        servizi: draft.servizi
      });
      if (!mounted.current) {
        return;
      }
      // I campi che l'AI lascia vuoti (es. KPI non presenti negli appunti) non cancellano quanto già scritto.
      setDraft(function (d) {
        const n = Object.assign({}, d);
        TEXT_FIELDS.forEach(function (f) { if (out[f] && out[f].trim()) { n[f] = out[f].trim(); } });
        return n;
      });
      setErrors(function (e) {
        const n = Object.assign({}, e);
        TEXT_FIELDS.forEach(function (f) { delete n[f]; });
        return n;
      });
      setAiNotice(true);
      props.notify(MessageBarType.success, 'Descrizione elaborata: controlla e modifica i testi prima di salvare.');
    } catch (e) {
      props.notify(MessageBarType.error, (e as Error).message || 'Elaborazione AI non riuscita.');
    } finally {
      if (mounted.current) {
        setGenerating(false);
      }
    }
  };

  const onGenerateClick = function (): void {
    if ((draft.appuntiAI || '').trim().length < 20) {
      setErrors(function (e) { return Object.assign({}, e, { appuntiAI: 'Scrivi qualche appunto in più (almeno 20 caratteri) perché l\'AI possa elaborare la descrizione.' }); });
      return;
    }
    const filled = TEXT_FIELDS.some(function (f) { return (draft[f] || '').trim().length > 0; });
    if (filled) {
      setConfirmOverwrite(true);
    } else {
      runGenerate();
    }
  };

  const statusOptions: IChoiceGroupOption[] = [
    { key: 'Bozza', text: 'Bozza' },
    { key: 'Completo', text: 'Completo' }
  ];

  const isNew = !draft.id;
  const title = ro ? 'Dettaglio caso' : isNew ? 'Nuovo caso' : 'Modifica caso';

  return (
    <div className={styles.form}>
      <div className={styles.formHeader}>
        <div>
          <h2 className={styles.formTitle}>{title}{draft.nomeProgetto ? ' — ' + draft.nomeProgetto : ''}</h2>
          {!ro && <div className={styles.hint}>I campi contrassegnati con * sono obbligatori per lo stato "Completo"; una "Bozza" può essere salvata anche incompleta.</div>}
        </div>
        <ChoiceGroup
          label="Stato del caso"
          selectedKey={draft.stato}
          options={statusOptions}
          disabled={ro}
          onChange={function (_, o) { if (o) { set('stato', o.key as CaseStatus); } }}
          styles={{ flexContainer: { display: 'flex', gap: 16 } }}
        />
      </div>

      {!isNew && (
        <div className={styles.meta}>
          <span><strong>ID:</strong> {draft.id}</span>
          <span><strong>Autore:</strong> {draft.autore || '—'}</span>
          <span><strong>Creato il:</strong> {formatDateTime(draft.created) || '—'}</span>
          <span><strong>Ultima modifica:</strong> {formatDateTime(draft.modified) || '—'}{draft.modificatoDa ? ' (' + draft.modificatoDa + ')' : ''}</span>
        </div>
      )}

      {duplicates.length > 0 && !ro && (
        <MessageBar messageBarType={MessageBarType.warning} styles={{ root: { marginBottom: 12 } }}>
          Possibile duplicato: esistono già {duplicates.length} caso/i con stesso cliente, progetto e anno (ID {duplicates.map(function (d) { return d.id; }).join(', ')}).
        </MessageBar>
      )}

      {completeMissing.length > 0 && (
        <MessageBar
          messageBarType={MessageBarType.error}
          styles={{ root: { marginBottom: 12 } }}
          actions={<div><MessageBarButton onClick={function () { doSave('Bozza', false); }}>Salva come bozza</MessageBarButton></div>}
        >
          Per impostare lo stato "Completo" compila: {completeMissing.join(', ')}.
        </MessageBar>
      )}

      <section className={styles.section} aria-labelledby="sec-mode">
        <h3 className={styles.sectionTitle} id="sec-mode">
          <span className={styles.sectionNumber} style={{ background: 'linear-gradient(135deg, #db0b5b, #a8084a)' }}>AI</span>
          Modalità di compilazione dei testi
        </h3>
        <div className={styles.sectionBody}>
          <div className={styles.full}>
            <ChoiceGroup
              selectedKey={draft.compilazioneAI ? 'ai' : 'manuale'}
              disabled={ro}
              options={[
                { key: 'manuale', text: 'Scrivo tutto a mano' },
                { key: 'ai', text: 'Elabora la descrizione dettagliata con l\'AI', disabled: !props.ai }
              ]}
              onChange={function (_, o) { if (o) { set('compilazioneAI', o.key === 'ai'); } }}
              styles={{ flexContainer: { display: 'flex', gap: 28, flexWrap: 'wrap' } }}
            />
            {!props.ai && props.aiUnavailableReason && <div className={styles.hint}>{props.aiUnavailableReason}</div>}
          </div>
          {draft.compilazioneAI && (
            <div className={styles.full}>
              <TextField
                label="Appunti sul caso"
                multiline={true}
                rows={5}
                autoAdjustHeight={true}
                resizable={false}
                value={draft.appuntiAI}
                readOnly={ro}
                errorMessage={errors.appuntiAI}
                placeholder="Es.: il cliente aveva una rete obsoleta e frequenti fermi; abbiamo fatto assessment e progettato una rete campus con 220 access point; migrazione di notte senza fermi produzione; dopo il go-live -60% di ticket di rete."
                description="Scrivi a punti cosa chiedeva il cliente, cosa è stato fatto e i risultati. L'AI userà solo queste informazioni (senza inventare dati)."
                onChange={function (_, v) { set('appuntiAI', v || ''); }}
              />
              {!ro && (
                <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <PrimaryButton
                    iconProps={{ iconName: 'Sparkle' }}
                    text={generating ? 'Elaborazione in corso…' : 'Elabora descrizione con AI'}
                    disabled={generating || !props.ai}
                    onClick={onGenerateClick}
                  />
                  {generating && <Spinner size={SpinnerSize.small} />}
                  <span className={styles.hint}>
                    Vengono inviati al servizio AI gli appunti, il nome del progetto, il settore, l'anno, vendor, tecnologie e servizi: mai il nome del cliente.
                  </span>
                </div>
              )}
              {aiNotice && (
                <MessageBar messageBarType={MessageBarType.info} onDismiss={function () { setAiNotice(false); }} styles={{ root: { marginTop: 10 } }}>
                  I testi qui sotto sono stati elaborati dall'AI: verificali e correggili prima di salvare. Restano modificabili a mano.
                </MessageBar>
              )}
            </div>
          )}
        </div>
      </section>

      <Section n={1} title="Cliente">
        {text('cliente', 'Cliente / Ragione sociale', { required: true })}
        <Dropdown
          label="Settore / Industry"
          required={true}
          selectedKey={draft.settore || null}
          options={sectorOptions}
          placeholder="Seleziona un settore"
          disabled={ro}
          errorMessage={errors.settore}
          onChange={function (_, o) { if (o) { set('settore', String(o.key)); } }}
        />
        <Dropdown
          label="Fatturato cliente (scaglione)"
          selectedKey={draft.fatturato || ''}
          options={[{ key: '', text: 'Non indicato' } as IDropdownOption].concat(
            FATTURATO_SCAGLIONI.map(function (s) { return { key: s.key, text: s.label }; })
          )}
          disabled={ro}
          onChange={function (_, o) { if (o) { set('fatturato', String(o.key)); } }}
        />
        {text('localizzazione', 'Localizzazione geografica')}
        {text('salesRiferimento', 'Sales di riferimento', { description: 'Facoltativo: il commerciale AD che segue il cliente.' })}
      </Section>

      <Section n={2} title="Progetto">
        {text('nomeProgetto', 'Nome progetto', { required: true })}
        <TextField
          label="Anno progetto"
          required={true}
          inputMode="numeric"
          value={numText.anno}
          readOnly={ro}
          errorMessage={errors.anno || (numText.anno && parseNumber(numText.anno) === null ? 'Inserisci un anno valido.' : undefined)}
          onChange={function (_, v) { setNumText(Object.assign({}, numText, { anno: v || '' })); set('anno', parseNumber(v || '')); }}
        />
        <TextField
          label="Spesa complessiva progetto (€)"
          prefix="€"
          inputMode="decimal"
          value={numText.spesa}
          readOnly={ro}
          errorMessage={errors.spesa || (numText.spesa && parseNumber(numText.spesa) === null ? 'Inserisci un importo numerico.' : undefined)}
          onChange={function (_, v) { setNumText(Object.assign({}, numText, { spesa: v || '' })); set('spesa', parseNumber(v || '')); }}
        />
        {text('sintesi', 'Sintesi del progetto (facoltativa)', { multiline: true, rows: 2, description: 'Breve presentazione mostrata sotto il titolo della scheda PDF.' })}
        {text('esigenza', 'Necessità / Esigenza del cliente', { multiline: true, rows: 5, required: true })}
      </Section>

      <Section n={3} title="Soluzione">
        {text('soluzioneProposta', 'Soluzione proposta', { multiline: true, rows: 5, required: true })}
        {text('soluzioneImplementata', 'Soluzione implementata', { multiline: true, rows: 5, required: true })}
      </Section>

      <Section n={4} title="Vendor e Tecnologie">
        <TagInput id="tags-vendor" label="Vendor" values={draft.vendor} suggestions={vendorSuggestions} disabled={ro}
          placeholder="Es. Microsoft, Cisco, Dell…" onChange={function (v) { set('vendor', v); }} />
        <TagInput id="tags-tech" label="Tecnologie / Prodotti" values={draft.tecnologie} suggestions={techSuggestions} disabled={ro}
          placeholder="Es. Microsoft 365, Azure, SD-WAN…" onChange={function (v) { set('tecnologie', v); }} />
      </Section>

      <Section n={5} title="Servizi AD">
        <div className={styles.full}>
          <div className={styles.checkGrid} role="group" aria-label="Servizi AD erogati">
            {SERVIZI_AD.map(function (s) {
              return (
                <Checkbox
                  key={s}
                  label={s}
                  checked={draft.servizi.indexOf(s) >= 0}
                  disabled={ro}
                  onChange={function (_, c) {
                    set('servizi', c ? draft.servizi.concat([s]) : draft.servizi.filter(function (x) { return x !== s; }));
                  }}
                />
              );
            })}
          </div>
        </div>
      </Section>

      <Section n={6} title="Benefici e Risultati">
        {text('benefici', 'Benefici ottenuti', { multiline: true, rows: 5, required: true })}
        {text('kpi', 'KPI / Risultati misurabili', { multiline: true, rows: 3, description: 'Es. -30% tempi di provisioning; 99,9% di disponibilità.' })}
      </Section>

      <Section n={7} title="Citabilità e logo del cliente">
        <div className={styles.full}>
          <Toggle
            label="Cliente citabile nella scheda"
            checked={draft.clienteCitabile}
            onText="Sì"
            offText="No"
            disabled={ro}
            onChange={function (_, c) { set('clienteCitabile', !!c); }}
          />
          <div className={styles.hint}>
            Se "No", la scheda PDF non riporta né il nome né il logo del cliente: l'archivio interno e l'export Excel conservano sempre i dati reali.
          </div>
        </div>
        {!draft.clienteCitabile && (
          <div className={styles.full}>
            <TextField
              label="Denominazione anonima per la scheda PDF"
              value={draft.denominazioneAnonima}
              readOnly={ro}
              placeholder={defaultAnonymousName(draft.settore)}
              description="Se lasciata vuota viene proposta una denominazione generica basata sul settore."
              onChange={function (_, v) { set('denominazioneAnonima', v || ''); }}
            />
          </div>
        )}
        <div className={styles.full}>
          <LogoPicker
            label="Logo del cliente (facoltativo)"
            assets={props.assets}
            savedUrl={draft.logoClienteUrl}
            pending={logo.pending}
            removed={logo.removed}
            disabled={ro}
            usable={draft.logoUtilizzabile}
            onUsableChange={function (u) { set('logoUtilizzabile', u); }}
            onPick={function (d) { setLogo({ pending: d, removed: false }); }}
            onRemove={function () {
              setLogo({ pending: null, removed: !!draft.logoClienteUrl });
              set('logoUtilizzabile', false);
            }}
            onError={function (m) { props.notify(MessageBarType.error, m); }}
          />
          {!draft.clienteCitabile && (draft.logoClienteUrl || logo.pending) && (
            <div className={styles.hint}>Il logo è conservato in archivio ma non verrà mostrato nella scheda PDF finché il cliente non è citabile.</div>
          )}
        </div>
      </Section>

      <div className={styles.stickyBar}>
        {ro ? (
          <>
            {props.permissions.canEdit && <PrimaryButton iconProps={{ iconName: 'Edit' }} text="Modifica" onClick={props.onEdit} />}
            <DefaultButton iconProps={{ iconName: 'PDF' }} text="Scarica PDF" onClick={function () { props.onPdf(draft); }} />
            <DefaultButton text="Chiudi" onClick={props.onClose} />
          </>
        ) : (
          <>
            <PrimaryButton iconProps={{ iconName: 'Save' }} text="Salva" disabled={saving} onClick={function () { doSave(draft.stato, false); }} />
            <DefaultButton iconProps={{ iconName: 'SaveAndClose' }} text="Salva e chiudi" disabled={saving} onClick={function () { doSave(draft.stato, true); }} />
            {!isNew && <DefaultButton iconProps={{ iconName: 'PDF' }} text="Scheda PDF" disabled={saving || dirty} title={dirty ? 'Salva le modifiche per generare la scheda' : undefined} onClick={function () { props.onPdf(draft); }} />}
            <DefaultButton text="Annulla" disabled={saving} onClick={requestClose} />
            {saving && <Spinner size={SpinnerSize.medium} label="Salvataggio in corso…" labelPosition="right" />}
            {dirty && !saving && <span className={styles.hint} style={{ alignSelf: 'center' }}>Modifiche non salvate</span>}
          </>
        )}
      </div>

      {confirmOverwrite && (
        <ConfirmDialog
          title="Sostituire i testi esistenti?"
          message="Alcuni testi (sintesi, esigenza, soluzione, benefici, KPI) sono già compilati: l'elaborazione AI li sostituirà con la nuova descrizione. I campi che l'AI lascia vuoti non vengono toccati."
          confirmText="Sostituisci con l'AI"
          onConfirm={function () { setConfirmOverwrite(false); runGenerate(); }}
          onCancel={function () { setConfirmOverwrite(false); }}
        />
      )}

      {confirmClose && (
        <ConfirmDialog
          title="Modifiche non salvate"
          message="Ci sono modifiche non salvate. Se chiudi ora andranno perse."
          confirmText="Esci senza salvare"
          cancelText="Continua a modificare"
          danger={true}
          onConfirm={function () { setConfirmClose(false); props.onClose(); }}
          onCancel={function () { setConfirmClose(false); }}
        />
      )}

      {conflict && (
        <ConfirmDialog
          title="Il caso è stato modificato da un altro utente"
          message={
            <div>
              <p>
                {conflict.latest
                  ? 'Dopo l\'apertura, "' + (conflict.latest.modificatoDa || 'un altro utente') + '" ha salvato una nuova versione il ' + formatDateTime(conflict.latest.modified) + '.'
                  : 'Il caso è stato modificato (o eliminato) da un altro utente dopo l\'apertura.'}
              </p>
              <p>Per evitare sovrascritture silenziose il salvataggio non è stato eseguito. Come vuoi procedere?</p>
            </div>
          }
          confirmText="Ricarica la versione aggiornata"
          extraText={conflict.latest ? 'Sovrascrivi con le mie modifiche' : undefined}
          cancelText="Annulla"
          onConfirm={function () {
            const latest = conflict.latest;
            setConflict(null);
            if (latest) {
              setDraft(latest);
              setInitialJson(JSON.stringify(latest));
              setNumText({ spesa: numToText(latest.spesa), anno: numToText(latest.anno) });
              setLogo(NO_LOGO_CHANGE);
              props.notify(MessageBarType.info, 'Caricata la versione più recente del caso.');
            } else {
              props.onClose();
            }
          }}
          onExtra={function () {
            setConflict(null);
            doSave(draft.stato, false, true);
          }}
          onCancel={function () { setConflict(null); }}
        />
      )}
    </div>
  );
};
