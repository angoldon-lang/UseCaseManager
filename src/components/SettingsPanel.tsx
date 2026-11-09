import * as React from 'react';
import { Panel, PanelType, PrimaryButton, MessageBar, MessageBarType, Spinner, SpinnerSize } from '@fluentui/react';
import { IBackend } from '../services/contracts';
import { LogoPicker } from './LogoPicker';

export interface ISettingsPanelProps {
  backend: IBackend;
  adLogo: string | null;
  defaultLogo: string;
  onAdLogoChanged: (dataUrl: string | null) => void;
  notify: (type: MessageBarType, text: string) => void;
  onDismiss: () => void;
}

export const SettingsPanel: React.FC<ISettingsPanelProps> = function (props) {
  const backend = props.backend;
  const [pending, setPending] = React.useState<string | null>(null);
  const [removed, setRemoved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
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
            fallbackPreview={props.defaultLogo}
            fallbackCaption="In uso il logo AD Consulting predefinito. Carica un file per sostituirlo (meglio se ad alta risoluzione, anche per la stampa del PDF)."

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
      {busy && <Spinner size={SpinnerSize.small} label="Operazione in corso…" labelPosition="right" style={{ marginTop: 8 }} />}
    </Panel>
  );
};
