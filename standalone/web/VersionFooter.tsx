import * as React from 'react';
import { DefaultButton, Dialog, DialogFooter, DialogType } from '@fluentui/react';
import { IAppVersion } from './HttpBackend';
import changelog from '../../CHANGELOG.md';

export function versionLabel(v?: IAppVersion): string {
  if (!v) {
    return '';
  }
  const parts = ['v' + v.version];
  if (v.build) {
    parts.push('build ' + v.build.split('-').reverse().join('/'));
  }
  if (v.commit) {
    parts.push(v.commit);
  }
  return parts.join(' · ');
}

/** Versione dell'applicazione in basso, con l'elenco delle novità. */
export const VersionFooter: React.FC<{ version?: IAppVersion; title: string }> = function (props) {
  const [open, setOpen] = React.useState(false);
  return (
    <footer style={{ marginTop: 28, padding: '10px 4px', fontSize: 12, color: '#5b6b7b', textAlign: 'center' }}>
      {props.title} · AD Consulting · <span title="Versione dell'applicazione in esecuzione sul server">{versionLabel(props.version)}</span>
      {' · '}
      <button
        type="button"
        onClick={function () { setOpen(true); }}
        style={{ background: 'none', border: 'none', padding: 0, color: '#0073c7', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
      >
        Novità
      </button>
      {open && (
        <Dialog
          hidden={false}
          onDismiss={function () { setOpen(false); }}
          dialogContentProps={{ type: DialogType.normal, title: 'Novità', subText: 'Versione in uso: ' + versionLabel(props.version) }}
          minWidth={520}
        >
          <div style={{ textAlign: 'left', maxHeight: '50vh', overflow: 'auto', fontSize: 13, lineHeight: 1.45 }}>
            {changelog.replace(/^# .*\n+/, '').split('\n').map(function (line, i) {
              const plain = line.replace(/\*\*/g, '').replace(/`/g, '');
              if (/^## /.test(plain)) {
                return <div key={i} style={{ fontWeight: 650, marginTop: i ? 14 : 0 }}>{plain.replace(/^## /, '')}</div>;
              }
              if (/^- /.test(plain)) {
                return <div key={i} style={{ paddingLeft: 14, textIndent: -10 }}>• {plain.replace(/^- /, '')}</div>;
              }
              return plain.trim() ? <div key={i}>{plain}</div> : null;
            })}
          </div>
          <DialogFooter>
            <DefaultButton text="Chiudi" onClick={function () { setOpen(false); }} />
          </DialogFooter>
        </Dialog>
      )}
    </footer>
  );
};
