import * as React from 'react';
import { DefaultButton, Checkbox, Label } from '@fluentui/react';
import styles from './UseCaseArchive.module.scss';
import { IAssetStore } from '../../../services/contracts';
import { processLogoFile } from '../../../utils/image';

export interface ILogoPickerProps {
  label: string;
  assets: IAssetStore;
  /** URL server-relative del logo salvato (se esiste). */
  savedUrl: string;
  /** Nuovo logo scelto ma non ancora salvato (data URL PNG). */
  pending: string | null;
  removed: boolean;
  disabled?: boolean;
  usable?: boolean;
  onUsableChange?: (usable: boolean) => void;
  onPick: (dataUrl: string) => void;
  onRemove: () => void;
  onError: (message: string) => void;
}

export const LogoPicker: React.FC<ILogoPickerProps> = function (props) {
  const [savedPreview, setSavedPreview] = React.useState<string | null>(null);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(function () {
    let cancelled = false;
    setSavedPreview(null);
    setLoadFailed(false);
    if (props.savedUrl) {
      props.assets.getDataUrl(props.savedUrl).then(function (d) {
        if (!cancelled) {
          setSavedPreview(d);
          setLoadFailed(!d);
        }
      }).catch(function () { if (!cancelled) { setLoadFailed(true); } });
    }
    return function () { cancelled = true; };
  }, [props.savedUrl]);

  const shown = props.pending || (props.removed ? null : savedPreview);
  const hasLogo = !!props.pending || (!props.removed && !!props.savedUrl);

  const onFile = function (e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    processLogoFile(file).then(function (img) { props.onPick(img.dataUrl); }).catch(function (err) { props.onError(err.message); });
  };

  return (
    <div>
      <Label>{props.label}</Label>
      <div className={styles.logoRow}>
        <div className={styles.logoPreview}>
          {shown ? <img src={shown} alt="Anteprima logo" /> : <span>{hasLogo && !loadFailed ? 'Caricamento…' : hasLogo ? 'Logo non disponibile' : 'Nessun logo'}</span>}
        </div>
        {!props.disabled && (
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={onFile} />
            <DefaultButton
              iconProps={{ iconName: 'Upload' }}
              text={hasLogo ? 'Sostituisci logo' : 'Carica logo'}
              onClick={function () { if (fileRef.current) { fileRef.current.click(); } }}
            />
            {hasLogo && <DefaultButton style={{ marginLeft: 8 }} iconProps={{ iconName: 'Delete' }} text="Rimuovi" onClick={props.onRemove} />}
            <div className={styles.hint}>PNG o JPEG, max 5 MB. La trasparenza e le proporzioni sono mantenute.</div>
          </div>
        )}
      </div>
      {props.onUsableChange && hasLogo && (
        <Checkbox
          label="Il logo è utilizzabile nella scheda PDF"
          checked={!!props.usable}
          disabled={props.disabled}
          onChange={function (_, c) { if (props.onUsableChange) { props.onUsableChange(!!c); } }}
          styles={{ root: { marginTop: 8 } }}
        />
      )}
    </div>
  );
};
