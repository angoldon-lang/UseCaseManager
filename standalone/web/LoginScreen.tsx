import * as React from 'react';
import { TextField, PrimaryButton, MessageBar, MessageBarType, Spinner, SpinnerSize, ThemeProvider } from '@fluentui/react';
import { HttpClient, IMe } from './HttpBackend';
import { brandTheme } from '../../src/webparts/useCaseArchive/components/brandTheme';
import { DEFAULT_AD_LOGO } from '../../src/assets/adLogo';

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
    <ThemeProvider theme={brandTheme}>
      <form
        onSubmit={submit}
        style={{
          maxWidth: 400, margin: '9vh auto 0', padding: '32px 32px 28px', background: '#fff', borderRadius: 18, position: 'relative',
          boxShadow: '0 2px 4px rgba(15,23,32,.05), 0 18px 48px rgba(0,115,199,.16)', overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 5, background: 'linear-gradient(90deg,#0098ff 0,#0098ff 78%,#db0b5b 78%)' }} />
        <img src={DEFAULT_AD_LOGO} alt="AD Consulting" style={{ height: 56, display: 'block', margin: '4px 0 18px' }} />
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 650, color: '#1b2733' }}>{props.title}</h1>
        <p style={{ margin: '0 0 16px', color: '#5b6b7b', fontSize: 14 }}>Accedi per consultare e gestire i casi progettuali.</p>
        {props.expired && <MessageBar messageBarType={MessageBarType.warning}>Sessione scaduta: accedi di nuovo.</MessageBar>}
        {error && <MessageBar messageBarType={MessageBarType.error} isMultiline={true}>{error}</MessageBar>}
        <TextField label="Nome utente" autoComplete="username" value={username} required={true} autoFocus={true}
          onChange={function (_, v) { setUsername(v || ''); }} />
        <TextField label="Password" type="password" canRevealPassword={true} autoComplete="current-password" value={password} required={true}
          onChange={function (_, v) { setPassword(v || ''); }} />
        <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
          <PrimaryButton type="submit" text="Accedi" disabled={busy || !username || !password} styles={{ root: { minWidth: 110, height: 38 } }} />
          {busy && <Spinner size={SpinnerSize.small} />}
        </div>
      </form>
    </ThemeProvider>
  );
};
