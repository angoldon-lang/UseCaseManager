import * as React from 'react';
import { Label } from '@fluentui/react';
import styles from './UseCaseArchive.module.scss';

export interface ITagInputProps {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
}

function mergeTags(current: string[], raw: string): string[] {
  const result = current.slice();
  raw.split(/[,;]/).forEach(function (piece) {
    const t = piece.trim();
    if (t && !result.some(function (r) { return r.toLowerCase() === t.toLowerCase(); })) {
      result.push(t);
    }
  });
  return result;
}

/** Campo a etichette: si aggiungono con virgola, invio o uscendo dal campo. */
export const TagInput: React.FC<ITagInputProps> = function (props) {
  const [text, setText] = React.useState('');

  const commit = function (raw: string): void {
    if (raw.trim()) {
      props.onChange(mergeTags(props.values, raw));
    }
    setText('');
  };

  const onChangeText = function (e: React.ChangeEvent<HTMLInputElement>): void {
    const v = e.target.value;
    if (/[,;]/.test(v)) {
      const idx = Math.max(v.lastIndexOf(','), v.lastIndexOf(';'));
      props.onChange(mergeTags(props.values, v.substring(0, idx)));
      setText(v.substring(idx + 1));
    } else {
      setText(v);
    }
  };

  const onKeyDown = function (e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(text);
    } else if (e.key === 'Backspace' && !text && props.values.length) {
      props.onChange(props.values.slice(0, -1));
    }
  };

  const listId = props.id + '-list';
  return (
    <div>
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className={styles.tagBox}>
        {props.values.map(function (v) {
          return (
            <span className={styles.tag} key={v}>
              {v}
              {!props.disabled && (
                <button
                  type="button"
                  className={styles.tagRemove}
                  aria-label={'Rimuovi ' + v}
                  onClick={function () { props.onChange(props.values.filter(function (x) { return x !== v; })); }}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        {!props.disabled && (
          <input
            id={props.id}
            className={styles.tagInput}
            value={text}
            list={listId}
            placeholder={props.values.length ? '' : props.placeholder}
            onChange={onChangeText}
            onKeyDown={onKeyDown}
            onBlur={function () { commit(text); }}
          />
        )}
      </div>
      {!props.disabled && <div className={styles.hint}>Separa i valori con una virgola o premi Invio.</div>}
      <datalist id={listId}>
        {(props.suggestions || []).map(function (s) { return <option key={s} value={s} />; })}
      </datalist>
    </div>
  );
};
