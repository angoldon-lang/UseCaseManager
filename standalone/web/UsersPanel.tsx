import * as React from 'react';
import {
  Panel, PanelType, PrimaryButton, DefaultButton, TextField, Dropdown, IDropdownOption, MessageBar, MessageBarType, Spinner, SpinnerSize,
  Dialog, DialogFooter, DialogType, IconButton, TooltipHost
} from '@fluentui/react';
import { HttpClient, IMe } from './HttpBackend';

interface IUserRow {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: 'admin' | 'editor' | 'reader';
  disabled: boolean;
  created: string;
}

const ROLE_OPTIONS: IDropdownOption[] = [
  { key: 'reader', text: 'Sola lettura' },
  { key: 'editor', text: 'Editor' },
  { key: 'admin', text: 'Amministratore' }
];
const ROLE_HELP: { [r: string]: string } = {
  reader: 'Consulta, scarica PDF ed esporta in Excel.',
  editor: 'In più crea, modifica, duplica ed elimina i casi e carica i loghi dei clienti.',
  admin: 'In più gestisce gli utenti e cambia il logo aziendale.'
};

function generatePassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  let out = '';
  bytes.forEach(function (b) { out += chars[b % chars.length]; });
  return out;
}

const NEW_USER = { username: '', displayName: '', email: '', role: 'editor', password: '' };

export const UsersPanel: React.FC<{ http: HttpClient; me: IMe; onDismiss: () => void }> = function (props) {
  const [users, setUsers] = React.useState<IUserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [info, setInfo] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState(NEW_USER);
  const [showForm, setShowForm] = React.useState(false);
  const [formError, setFormError] = React.useState('');
  const [resetFor, setResetFor] = React.useState<IUserRow | null>(null);
  const [resetPwd, setResetPwd] = React.useState('');
  const [resetError, setResetError] = React.useState('');
  const [deleteFor, setDeleteFor] = React.useState<IUserRow | null>(null);

  const load = React.useCallback(function (): Promise<void> {
    return props.http.json<IUserRow[]>('GET', '/api/users').then(function (u) { setUsers(u); setError(''); })
      .catch(function (e) { setError((e as Error).message); })
      .then(function () { setLoading(false); });
  }, [props.http]);

  React.useEffect(function () { load(); }, [load]);

  const run = async function (action: () => Promise<unknown>, okMessage: string): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await action();
      setInfo(okMessage);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async function (): Promise<void> {
    setFormError('');
    setBusy(true);
    try {
      await props.http.json<IUserRow>('POST', '/api/users', form);
      setInfo('Utente "' + form.username + '" creato. Comunica la password all\'utente: potrà cambiarla dal proprio profilo.');
      setForm(NEW_USER);
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patch = function (u: IUserRow, body: object, message: string): Promise<boolean> {
    return run(function () { return props.http.json<IUserRow>('PATCH', '/api/users/' + u.id, body); }, message);
  };

  return (
    <Panel isOpen={true} type={PanelType.large} headerText="Gestione utenti" onDismiss={props.onDismiss} closeButtonAriaLabel="Chiudi">
      <p style={{ marginTop: 0, color: '#5b6b7b' }}>
        Crea gli utenti che possono accedere all'archivio e scegli cosa possono fare. Le modifiche di ruolo, password e disabilitazione chiudono le sessioni attive dell'utente.
      </p>
      {error && <MessageBar messageBarType={MessageBarType.error} isMultiline={true} onDismiss={function () { setError(''); }}>{error}</MessageBar>}
      {info && <MessageBar messageBarType={MessageBarType.success} isMultiline={true} onDismiss={function () { setInfo(''); }}>{info}</MessageBar>}

      <div style={{ margin: '12px 0' }}>
        <PrimaryButton iconProps={{ iconName: 'AddFriend' }} text="Nuovo utente" onClick={function () { setShowForm(true); setInfo(''); }} />
      </div>

      {showForm && (
        <div style={{ background: '#f3f8fd', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px' }}>Nuovo utente</h3>
          {formError && <MessageBar messageBarType={MessageBarType.error} isMultiline={true}>{formError}</MessageBar>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '4px 16px' }}>
            <TextField label="Nome utente" required={true} autoComplete="off" value={form.username}
              description="Es. mrossi (lettere, numeri, . - _ @)" onChange={function (_, v) { setForm(Object.assign({}, form, { username: v || '' })); }} />
            <TextField label="Nome visualizzato" required={true} autoComplete="off" value={form.displayName}
              onChange={function (_, v) { setForm(Object.assign({}, form, { displayName: v || '' })); }} />
            <TextField label="Email (facoltativa)" autoComplete="off" value={form.email}
              onChange={function (_, v) { setForm(Object.assign({}, form, { email: v || '' })); }} />
            <Dropdown label="Ruolo" required={true} options={ROLE_OPTIONS} selectedKey={form.role}
              onChange={function (_, o) { if (o) { setForm(Object.assign({}, form, { role: String(o.key) })); } }} />
          </div>
          <div style={{ fontSize: 12, color: '#5b6b7b', margin: '2px 0 8px' }}>{ROLE_HELP[form.role]}</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField label="Password (min. 10 caratteri)" required={true} type="password" canRevealPassword={true} autoComplete="new-password"
              value={form.password} styles={{ root: { minWidth: 260 } }}
              onChange={function (_, v) { setForm(Object.assign({}, form, { password: v || '' })); }} />
            <DefaultButton iconProps={{ iconName: 'Refresh' }} text="Genera password"
              onClick={function () { setForm(Object.assign({}, form, { password: generatePassword() })); }} />
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <PrimaryButton text="Crea utente" disabled={busy || !form.username || !form.displayName || form.password.length < 10} onClick={create} />
            <DefaultButton text="Annulla" onClick={function () { setShowForm(false); setForm(NEW_USER); setFormError(''); }} />
          </div>
        </div>
      )}

      {loading ? <Spinner size={SpinnerSize.large} label="Caricamento utenti…" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#5b6b7b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                <th style={{ padding: '8px 6px' }}>Utente</th><th style={{ padding: '8px 6px' }}>Ruolo</th><th style={{ padding: '8px 6px' }}>Stato</th><th style={{ padding: '8px 6px' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {users.map(function (u) {
                const self = u.id !== undefined && u.username.toLowerCase() === props.me.username.toLowerCase();
                return (
                  <tr key={u.id} style={{ borderTop: '1px solid #e3e9ef', opacity: u.disabled ? 0.6 : 1 }}>
                    <td style={{ padding: '8px 6px' }}>
                      <strong>{u.displayName}</strong>{self ? ' (tu)' : ''}<br />
                      <span style={{ color: '#5b6b7b', fontSize: 12 }}>{u.username}{u.email ? ' · ' + u.email : ''}</span>
                    </td>
                    <td style={{ padding: '8px 6px', minWidth: 150 }}>
                      <Dropdown options={ROLE_OPTIONS} selectedKey={u.role} disabled={busy || self} ariaLabel={'Ruolo di ' + u.username}
                        onChange={function (_, o) { if (o && o.key !== u.role) { patch(u, { role: o.key }, 'Ruolo di "' + u.username + '" aggiornato.'); } }} />
                    </td>
                    <td style={{ padding: '8px 6px' }}>{u.disabled ? 'Disabilitato' : 'Attivo'}</td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      <TooltipHost content="Reimposta password">
                        <IconButton iconProps={{ iconName: 'PasswordField' }} ariaLabel={'Reimposta password di ' + u.username} disabled={busy}
                          onClick={function () { setResetFor(u); setResetPwd(''); setResetError(''); }} />
                      </TooltipHost>
                      <TooltipHost content={u.disabled ? 'Riattiva' : 'Disabilita accesso'}>
                        <IconButton iconProps={{ iconName: u.disabled ? 'Accept' : 'Blocked2' }} ariaLabel={(u.disabled ? 'Riattiva ' : 'Disabilita ') + u.username} disabled={busy || self}
                          onClick={function () { patch(u, { disabled: !u.disabled }, 'Utente "' + u.username + '" ' + (u.disabled ? 'riattivato' : 'disabilitato') + '.'); }} />
                      </TooltipHost>
                      <TooltipHost content="Elimina utente">
                        <IconButton iconProps={{ iconName: 'Delete' }} ariaLabel={'Elimina ' + u.username} disabled={busy || self} styles={{ root: { color: '#a4262c' } }}
                          onClick={function () { setDeleteFor(u); }} />
                      </TooltipHost>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resetFor && (
        <Dialog hidden={false} onDismiss={function () { setResetFor(null); }}
          dialogContentProps={{ type: DialogType.normal, title: 'Reimposta password', subText: 'Nuova password per "' + resetFor.username + '". Le sue sessioni attive verranno chiuse.' }}>
          {resetError && <MessageBar messageBarType={MessageBarType.error} isMultiline={true}>{resetError}</MessageBar>}
          <TextField label="Nuova password (min. 10 caratteri)" type="password" canRevealPassword={true} autoComplete="new-password" value={resetPwd}
            onChange={function (_, v) { setResetPwd(v || ''); }} />
          <DefaultButton iconProps={{ iconName: 'Refresh' }} text="Genera password" styles={{ root: { marginTop: 8 } }} onClick={function () { setResetPwd(generatePassword()); }} />
          <DialogFooter>
            <PrimaryButton text="Aggiorna" disabled={busy || resetPwd.length < 10} onClick={function () {
              const target = resetFor;
              patch(target, { password: resetPwd }, 'Password di "' + target.username + '" aggiornata.').then(function (ok) {
                if (ok) { setResetFor(null); } else { setResetError('Aggiornamento non riuscito.'); }
              });
            }} />
            <DefaultButton text="Annulla" onClick={function () { setResetFor(null); }} />
          </DialogFooter>
        </Dialog>
      )}

      {deleteFor && (
        <Dialog hidden={false} onDismiss={function () { setDeleteFor(null); }}
          dialogContentProps={{ type: DialogType.normal, title: 'Elimina utente', subText: 'Eliminare l\'utente "' + deleteFor.username + '"? I casi che ha creato restano in archivio.' }}>
          <DialogFooter>
            <PrimaryButton text="Elimina" disabled={busy} styles={{ root: { background: '#a4262c', borderColor: '#a4262c' } }} onClick={function () {
              const target = deleteFor;
              run(function () { return props.http.json<unknown>('DELETE', '/api/users/' + target.id); }, 'Utente "' + target.username + '" eliminato.')
                .then(function () { setDeleteFor(null); });
            }} />
            <DefaultButton text="Annulla" onClick={function () { setDeleteFor(null); }} />
          </DialogFooter>
        </Dialog>
      )}
    </Panel>
  );
};
