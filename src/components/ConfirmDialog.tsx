import * as React from 'react';
import { Dialog, DialogType, DialogFooter, PrimaryButton, DefaultButton } from '@fluentui/react';

export interface IConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmText: string;
  cancelText?: string;
  /** Pulsante alternativo opzionale (es. "Sovrascrivi"). */
  extraText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onExtra?: () => void;
}

export const ConfirmDialog: React.FC<IConfirmDialogProps> = function (props) {
  return (
    <Dialog
      hidden={false}
      onDismiss={props.onCancel}
      dialogContentProps={{ type: DialogType.normal, title: props.title, subText: typeof props.message === 'string' ? props.message : undefined }}
      modalProps={{ isBlocking: true }}
    >
      {typeof props.message !== 'string' && props.message}
      <DialogFooter>
        <PrimaryButton
          onClick={props.onConfirm}
          text={props.confirmText}
          disabled={props.busy}
          styles={props.danger ? { root: { background: '#a4262c', borderColor: '#a4262c' }, rootHovered: { background: '#8e1f24', borderColor: '#8e1f24' } } : undefined}
        />
        {props.extraText && <DefaultButton onClick={props.onExtra} text={props.extraText} disabled={props.busy} />}
        <DefaultButton onClick={props.onCancel} text={props.cancelText || 'Annulla'} disabled={props.busy} />
      </DialogFooter>
    </Dialog>
  );
};
