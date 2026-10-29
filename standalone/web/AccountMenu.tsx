import * as React from 'react';
import { DefaultButton, Dialog, DialogFooter, DialogType, PrimaryButton, TextField, MessageBar, MessageBarType } from '@fluentui/react';
import { HttpClient, IMe } from './HttpBackend';

const ROLE_LABEL: { [r: string]: string } = { admin: 'Amministratore', editor: 'Editor', reader: 'Sola lettura' };

export const AccountMenu: React.FC<{ http: HttpClient; me: IMe; onLogout: () => void }> = function (props) {
  const [open, setOpen] = React.useState(false);
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const change = async function (): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      await props.http.json<unknown>('POST', '/api/me/password', { current: current, next: next });
      setMsg({ ok: true, text: 'Password aggiornata.' });
      setCurrent('');
      setNext('');
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const logout = async function (): Promise<void> {
    try {
      await props.http.request('POST', '/api/logout');
    } finally {
      props.onLogout();
    }
  };

  return (
    <>
      <DefaultButton iconProps={{ iconName: 'Contact' }} text={props.me.displayName + ' (' + ROLE_LABEL[props.me.role] + ')'} onClick={function () { setOpen(true); }} />
      <DefaultButton iconProps={{ iconName: 'SignOut' }} text="Esci" onClick={logout} />
      {open && (
        <Dialog hidden={false} onDismiss={function () { setOpen(false); setMsg(null); }}
          dialogContentProps={{ type: DialogType.normal, title: 'Cambia password' }}>
          {msg && <MessageBar messageBarType={msg.ok ? MessageBarType.success : MessageBarType.error}>{msg.text}</MessageBar>}
          <TextField label="Password attuale" type="password" autoComplete="current-password" value={current} onChange={function (_, v) { setCurrent(v || ''); }} />
          <TextField label="Nuova password (min. 10 caratteri)" type="password" autoComplete="new-password" value={next} onChange={function (_, v) { setNext(v || ''); }} />
          <DialogFooter>
            <PrimaryButton text="Aggiorna" disabled={busy || !current || next.length < 10} onClick={change} />
            <DefaultButton text="Chiudi" onClick={function () { setOpen(false); setMsg(null); }} />
          </DialogFooter>
        </Dialog>
      )}
    </>
  );
};
