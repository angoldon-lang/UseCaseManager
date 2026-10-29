import * as React from 'react';
import { TextField, PrimaryButton, MessageBar, MessageBarType, Spinner, SpinnerSize } from '@fluentui/react';
import { HttpClient, IMe } from './HttpBackend';

export const LoginScreen: React.FC<{ http: HttpClient; title: string; onLogin: (me: IMe) => void; expired: boolean }> = function (props) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const submit = async function (e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const me = await props.http.json<IMe>('POST', '/api/login', { username: username, password: password });
      props.onLogin(me);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 380, margin: '10vh auto', padding: 24, border: '1px solid #d0d7de', borderRadius: 8, background: '#fff' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, color: '#0f4c81' }}>{props.title}</h1>
      <p style={{ marginTop: 0, color: '#5a6472' }}>AD Consulting — accedi per continuare</p>
      {props.expired && <MessageBar messageBarType={MessageBarType.warning}>Sessione scaduta: accedi di nuovo.</MessageBar>}
      {error && <MessageBar messageBarType={MessageBarType.error} isMultiline={true}>{error}</MessageBar>}
      <TextField label="Nome utente" autoComplete="username" value={username} required={true} autoFocus={true}
        onChange={function (_, v) { setUsername(v || ''); }} />
      <TextField label="Password" type="password" canRevealPassword={true} autoComplete="current-password" value={password} required={true}
        onChange={function (_, v) { setPassword(v || ''); }} />
      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <PrimaryButton type="submit" text="Accedi" disabled={busy || !username || !password} />
        {busy && <Spinner size={SpinnerSize.small} />}
      </div>
    </form>
  );
};
