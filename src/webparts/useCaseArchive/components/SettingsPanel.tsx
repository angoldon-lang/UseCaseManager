import * as React from 'react';
import { Panel, PanelType, PrimaryButton, MessageBar, MessageBarType, Spinner, SpinnerSize, Separator } from '@fluentui/react';
import { IBackend } from '../../../services/contracts';
import { LogoPicker } from './LogoPicker';

export interface ISettingsPanelProps {
  backend: IBackend;
  adLogo: string | null;
  onAdLogoChanged: (dataUrl: string | null) => void;
  onProvisioned: () => void;
  notify: (type: MessageBarType, text: string) => void;
  onDismiss: () => void;
}

export const SettingsPanel: React.FC<ISettingsPanelProps> = function (props) {
  const backend = props.backend;
  const [pending, setPending] = React.useState<string | null>(null);
  const [removed, setRemoved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [log, setLog] = React.useState<string[]>([]);
  const dirty = !!pending || removed;

  const saveLogo = async function (): Promise<void> {
    setBusy(true);
    try {
      if (pending) {
        await backend.assets.setAdLogo(pending);
        props.onAdLogoChanged(pending);
      } else if (removed) {
        await backend.assets.removeAdLogo();
        props.onAdLogoChanged(null);
      }
      setPending(null);
      setRemoved(false);
      props.notify(MessageBarType.success, 'Logo AD Consulting aggiornato.');
    } catch (e) {
      props.notify(MessageBarType.error, (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const provision = async function (): Promise<void> {
    if (!backend.provisioning) {
      return;
    }
    setBusy(true);
    try {
      setLog(await backend.provisioning.provision());
      props.onProvisioned();
    } catch (e) {
      props.notify(MessageBarType.error, (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel isOpen={true} type={PanelType.medium} headerText="Impostazioni" onDismiss={props.onDismiss} closeButtonAriaLabel="Chiudi">
      <h3>Logo AD Consulting</h3>
      <p>Il logo compare nell'intestazione dell'applicazione e delle schede PDF. {backend.storageDescription}.</p>
      {backend.canManageSettings ? (
        <>
          <LogoPicker
            label="Logo aziendale"
            assets={backend.assets}
            savedUrl=""
            pending={pending || (removed ? null : props.adLogo)}
            removed={removed}
            onPick={function (d) { setPending(d); setRemoved(false); }}
            onRemove={function () { setPending(null); setRemoved(true); }}
            onError={function (m) { props.notify(MessageBarType.error, m); }}
          />
          <div style={{ marginTop: 12 }}>
            <PrimaryButton text="Salva logo" disabled={!dirty || busy} onClick={saveLogo} />
          </div>
        </>
      ) : (
        <MessageBar messageBarType={MessageBarType.info}>Solo un amministratore può modificare il logo aziendale.</MessageBar>
      )}
      {backend.provisioning && (
        <>
          <Separator />
          <h3>Lista e libreria SharePoint</h3>
          <p>Il pulsante crea gli elementi mancanti (serve il permesso "Gestisci liste", tipicamente proprietario del sito).</p>
          <PrimaryButton text="Verifica / crea lista e libreria" iconProps={{ iconName: 'Settings' }} disabled={busy} onClick={provision} />
        </>
      )}
      {busy && <Spinner size={SpinnerSize.small} label="Operazione in corso…" labelPosition="right" style={{ marginTop: 8 }} />}
      {log.length > 0 && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline={true} styles={{ root: { marginTop: 12 } }}>
          {log.map(function (l, i) { return <div key={i}>{l}</div>; })}
        </MessageBar>
      )}
    </Panel>
  );
};
