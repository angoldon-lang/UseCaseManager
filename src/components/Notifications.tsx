import * as React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react';
import styles from './UseCaseArchive.module.scss';

export interface INotification {
  id: number;
  type: MessageBarType;
  text: string;
}

export const Notifications: React.FC<{ items: INotification[]; onDismiss: (id: number) => void }> = function (props) {
  return (
    <div className={styles.notifications} aria-live="polite">
      {props.items.map(function (n) {
        return (
          <MessageBar
            key={n.id}
            messageBarType={n.type}
            isMultiline={true}
            onDismiss={function () { props.onDismiss(n.id); }}
            dismissButtonAriaLabel="Chiudi"
          >
            {n.text}
          </MessageBar>
        );
      })}
    </div>
  );
};
