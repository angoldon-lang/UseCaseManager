import * as React from 'react';
import {
  Modal, IconButton, TextField, Toggle, PrimaryButton, DefaultButton, MessageBar, MessageBarType, MessageBarButton, Spinner, SpinnerSize
} from '@fluentui/react';
import styles from './UseCaseArchive.module.scss';
import { IUseCase } from '../../../models/UseCase';
import { AssetService } from '../../../services/AssetService';
import {
  IPdfTexts, IPdfResult, renderPdf, defaultTexts, findIdentifyingReferences, anonymizeTexts, labelOfTextField,
  FIELD_SECTION, SECTION_LABELS, showClientLogo
} from '../../../services/PdfService';
import { downloadBlob } from '../../../utils/format';

export interface IPdfDialogProps {
  uc: IUseCase;
  assets: AssetService;
  adLogo: string | null;
  onDismiss: () => void;
  notify: (type: MessageBarType, text: string) => void;
}

const TEXT_FIELDS: Array<{ key: keyof IPdfTexts; label: string; rows: number }> = [
  { key: 'titolo', label: 'Titolo della scheda', rows: 1 },
  { key: 'sintesi', label: 'Sintesi (Contesto)', rows: 2 },
  { key: 'esigenza', label: 'Esigenza', rows: 4 },
  { key: 'soluzioneProposta', label: 'Soluzione proposta', rows: 4 },
  { key: 'soluzioneImplementata', label: 'Soluzione implementata', rows: 4 },
  { key: 'benefici', label: 'Benefici ottenuti', rows: 4 },
  { key: 'kpi', label: 'KPI / Risultati misurabili', rows: 3 }
];

export const PdfDialog: React.FC<IPdfDialogProps> = function (props) {
  const uc = props.uc;
  const [texts, setTexts] = React.useState<IPdfTexts>(defaultTexts(uc));
  const [includeFatturato, setIncludeFatturato] = React.useState(false);
  const [includeSpesa, setIncludeSpesa] = React.useState(false);
  const [clientLogo, setClientLogo] = React.useState<string | null>(null);
  const [logoReady, setLogoReady] = React.useState(false);
  const [logoWarning, setLogoWarning] = React.useState('');
  const [busy, setBusy] = React.useState(true);
  const [result, setResult] = React.useState<IPdfResult | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string>('');
  const [error, setError] = React.useState('');
  const [ignoreRefs, setIgnoreRefs] = React.useState(false);

  // Il logo cliente si carica solo se può comparire nella scheda; viene poi incorporato nel PDF.
  React.useEffect(function () {
    let cancelled = false;
    if (uc.clienteCitabile && uc.logoUtilizzabile && uc.logoClienteUrl) {
      props.assets.getDataUrl(uc.logoClienteUrl).then(function (d) {
        if (cancelled) { return; }
        setClientLogo(d);
        if (!d) { setLogoWarning('Il logo del cliente non è raggiungibile: la scheda riporterà solo il nome.'); }
        setLogoReady(true);
      }).catch(function () {
        if (cancelled) { return; }
        setLogoWarning('Impossibile leggere il logo del cliente: la scheda riporterà solo il nome.');
        setLogoReady(true);
      });
    } else {
      setLogoReady(true);
    }
    return function () { cancelled = true; };
  }, [uc.id]);

  // Rigenera l'anteprima (con debounce) a ogni modifica di testi/opzioni.
  React.useEffect(function () {
    if (!logoReady) {
      return undefined;
    }
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(function () {
      renderPdf({ uc: uc, options: { includeFatturato: includeFatturato, includeSpesa: includeSpesa, texts: texts }, adLogo: props.adLogo, clientLogo: clientLogo })
        .then(function (r) {
          if (cancelled) { return; }
          setResult(r);
          setError('');
          setPreviewUrl(function (old) {
            if (old) { URL.revokeObjectURL(old); }
            return URL.createObjectURL(r.blob);
          });
        })
        .catch(function (e) { if (!cancelled) { setError('Generazione del PDF non riuscita: ' + ((e && e.message) || e)); } })
        .then(function () { if (!cancelled) { setBusy(false); } });
    }, 600);
    return function () { cancelled = true; clearTimeout(timer); };
  }, [texts, includeFatturato, includeSpesa, logoReady]);

  React.useEffect(function () {
    return function () { setPreviewUrl(function (old) { if (old) { URL.revokeObjectURL(old); } return ''; }); };
  }, []);

  const refs = findIdentifyingReferences(uc, texts);
  const blocked = refs.length > 0 && !ignoreRefs;
  const overflow = result ? result.overflowSections : [];
  const overflowKeys = Object.keys(SECTION_LABELS).filter(function (k) { return overflow.indexOf(SECTION_LABELS[k]) >= 0; });
  const logoShown = showClientLogo(uc, clientLogo);

  const download = function (): void {
    if (result) {
      downloadBlob(result.blob, result.fileName);
      props.notify(MessageBarType.success, 'Scheda PDF generata: ' + result.fileName);
    }
  };

  const fields = TEXT_FIELDS.slice();
  return (
    <Modal isOpen={true} onDismiss={props.onDismiss} isBlocking={false} containerClassName={undefined}
      styles={{ main: { width: 'min(1280px, 96vw)', maxWidth: '96vw', maxHeight: '96vh' }, scrollableContent: { overflow: 'auto' } }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px 8px' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Scheda PDF — {uc.clienteCitabile ? uc.nomeProgetto : 'versione anonima'}</h2>
        <IconButton iconProps={{ iconName: 'Cancel' }} ariaLabel="Chiudi" onClick={props.onDismiss} />
      </div>
      <div className={styles.pdfLayout}>
        <div className={styles.pdfControls}>
          <MessageBar messageBarType={uc.clienteCitabile ? MessageBarType.info : MessageBarType.warning} isMultiline={true}>
            {uc.clienteCitabile
              ? 'Cliente citabile: nella scheda compaiono il nome' + (logoShown ? ' e il logo' : '') + ' del cliente.'
              : 'Cliente non citabile: nome e logo reali sono omessi; la scheda usa la denominazione anonima.'}
          </MessageBar>
          {logoWarning && <MessageBar messageBarType={MessageBarType.warning}>{logoWarning}</MessageBar>}
          {!props.adLogo && <MessageBar messageBarType={MessageBarType.info}>Logo AD Consulting non configurato (Impostazioni): verrà usato il testo "AD Consulting".</MessageBar>}

          <Toggle label="Includi fatturato cliente" checked={includeFatturato} onText="Incluso" offText="Escluso (predefinito)"
            disabled={uc.fatturato === null} onChange={function (_, c) { setIncludeFatturato(!!c); }} />
          <Toggle label="Includi spesa del progetto" checked={includeSpesa} onText="Inclusa" offText="Esclusa (predefinito)"
            disabled={uc.spesa === null} onChange={function (_, c) { setIncludeSpesa(!!c); }} />

          {!uc.clienteCitabile && (
            <TextField label="Denominazione anonima" value={texts.denominazione}
              onChange={function (_, v) { setTexts(Object.assign({}, texts, { denominazione: v || '' })); }} />
          )}

          <div className={styles.hint}>
            Puoi sintetizzare i testi qui sotto: le modifiche valgono solo per questa scheda e non alterano l'archivio.
          </div>

          {fields.map(function (f) {
            const section = FIELD_SECTION[f.key];
            const over = !!section && overflowKeys.indexOf(section) >= 0;
            return (
              <TextField
                key={f.key}
                label={f.label}
                multiline={f.rows > 1}
                rows={f.rows}
                autoAdjustHeight={f.rows > 1}
                resizable={false}
                className={over ? styles.overflowField : undefined}
                value={texts[f.key]}
                description={(over ? '⚠ Sezione "' + SECTION_LABELS[section] + '" oltre la prima pagina — ' : '') + texts[f.key].length + ' caratteri'}
                onChange={function (_, v) { setTexts(Object.assign({}, texts, { [f.key]: v || '' })); }}
              />
            );
          })}

          <DefaultButton text="Ripristina testi originali" iconProps={{ iconName: 'Undo' }} onClick={function () { setTexts(defaultTexts(uc)); }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
          {refs.length > 0 && (
            <MessageBar
              messageBarType={MessageBarType.severeWarning}
              isMultiline={true}
              actions={
                <div>
                  <MessageBarButton onClick={function () { setTexts(anonymizeTexts(uc, texts)); }}>Sostituisci con la denominazione anonima</MessageBarButton>
                </div>
              }
            >
              Il cliente non è citabile ma il nome compare in: {refs.map(labelOfTextField).join(', ')}. Rimuovilo prima di scaricare la scheda.
              <div style={{ marginTop: 4 }}>
                <label><input type="checkbox" checked={ignoreRefs} onChange={function (e) { setIgnoreRefs(e.target.checked); }} /> Ho verificato: non si tratta di un riferimento identificativo</label>
              </div>
            </MessageBar>
          )}
          {result && result.pageCount > 1 && (
            <MessageBar messageBarType={MessageBarType.warning} isMultiline={true}>
              La scheda occupa {result.pageCount} pagine; il testo non viene tagliato. Per contenerla in una pagina sintetizza
              {overflow.length ? ' le sezioni: ' + overflow.join(', ') + '.' : ' i testi più lunghi.'}
            </MessageBar>
          )}
          {result && result.pageCount === 1 && !busy && !error && (
            <MessageBar messageBarType={MessageBarType.success}>La scheda è contenuta in una pagina A4.</MessageBar>
          )}
          <div className={styles.pdfPreview} style={{ flex: 1 }}>
            {busy && <div className={styles.previewBusy}><Spinner size={SpinnerSize.small} label="Aggiornamento anteprima…" labelPosition="right" /></div>}
            {previewUrl && <iframe title="Anteprima scheda PDF" src={previewUrl} />}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <PrimaryButton iconProps={{ iconName: 'Download' }} text="Scarica PDF" disabled={!result || busy || blocked || !!error} onClick={download} />
            <DefaultButton text="Chiudi" onClick={props.onDismiss} />
            {result && <span className={styles.hint}>File: {result.fileName}</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
};
