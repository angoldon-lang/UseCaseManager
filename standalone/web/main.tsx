import * as React from 'react';
import * as ReactDom from 'react-dom';
import { initializeIcons, Spinner, SpinnerSize } from '@fluentui/react';
import UseCaseArchive from '../../src/webparts/useCaseArchive/components/UseCaseArchive';
import { DEFAULT_SECTORS } from '../../src/models/UseCase';
import { HttpClient, IAppConfig, IMe, createHttpBackend } from './HttpBackend';
import { LoginScreen } from './LoginScreen';
import { AccountMenu } from './AccountMenu';

// Icone servite dal server stesso (nessuna dipendenza da CDN esterne).
initializeIcons('/fonts/');

const App: React.FC = function () {
  const [config, setConfig] = React.useState<IAppConfig>({ siteTitle: 'Archivio Use Case', sectors: DEFAULT_SECTORS });
  const [me, setMe] = React.useState<IMe | null | undefined>(undefined);
  const [expired, setExpired] = React.useState(false);

  const http = React.useMemo(function () {
    return new HttpClient(function () { setExpired(true); setMe(null); });
  }, []);

  React.useEffect(function () {
    http.json<IAppConfig>('GET', '/api/config').then(setConfig).catch(function () { /* valori predefiniti */ });
    http.json<IMe>('GET', '/api/me').then(setMe).catch(function () { setMe(null); });
  }, [http]);

  const backend = React.useMemo(function () { return me ? createHttpBackend(http, me) : null; }, [http, me]);

  document.title = config.siteTitle;

  if (me === undefined) {
    return <Spinner size={SpinnerSize.large} style={{ marginTop: '20vh' }} />;
  }
  if (!me || !backend) {
    return <LoginScreen http={http} title={config.siteTitle} expired={expired} onLogin={function (m) { setExpired(false); setMe(m); }} />;
  }
  return (
    <UseCaseArchive
      backend={backend}
      settings={{ siteTitle: config.siteTitle, listTitle: '', assetsLibraryTitle: '', sectors: config.sectors }}
      headerExtra={<AccountMenu http={http} me={me} onLogout={function () { setExpired(false); setMe(null); }} />}
    />
  );
};

ReactDom.render(<App />, document.getElementById('root'));
