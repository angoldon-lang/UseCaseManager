import * as React from 'react';
import {
  DetailsList, DetailsListLayoutMode, SelectionMode, IColumn, IconButton, TooltipHost, Icon, SearchBox, Dropdown, IDropdownOption,
  DefaultButton
} from '@fluentui/react';
import styles from './UseCaseArchive.module.scss';
import { IUseCase, IUserPermissions, SERVIZI_AD } from '../../../models/UseCase';
import { duplicateKey, findDuplicateGroups } from '../../../utils/duplicates';
import { formatDateTime, normalize, uniqueSorted } from '../../../utils/format';

export interface IFilters {
  search: string;
  settori: string[];
  anni: string[];
  vendor: string[];
  servizi: string[];
  stati: string[];
}

export const EMPTY_FILTERS: IFilters = { search: '', settori: [], anni: [], vendor: [], servizi: [], stati: [] };

export interface IUseCaseTableProps {
  items: IUseCase[];
  filters: IFilters;
  onFiltersChange: (f: IFilters) => void;
  permissions: IUserPermissions;
  onOpen: (uc: IUseCase) => void;
  onEdit: (uc: IUseCase) => void;
  onDuplicate: (uc: IUseCase) => void;
  onDelete: (uc: IUseCase) => void;
  onPdf: (uc: IUseCase) => void;
}

function searchHaystack(uc: IUseCase): string {
  return normalize([
    uc.cliente, uc.nomeProgetto, uc.sintesi, uc.esigenza, uc.soluzioneProposta, uc.soluzioneImplementata,
    uc.benefici, uc.kpi, uc.localizzazione, uc.vendor.join(' '), uc.tecnologie.join(' '), uc.settore
  ].join(' '));
}

export function applyFilters(items: IUseCase[], f: IFilters): IUseCase[] {
  const terms = normalize(f.search).split(' ').filter(Boolean);
  return items.filter(function (uc) {
    if (terms.length) {
      const hay = searchHaystack(uc);
      if (!terms.every(function (t) { return hay.indexOf(t) >= 0; })) { return false; }
    }
    if (f.settori.length && f.settori.indexOf(uc.settore) < 0) { return false; }
    if (f.anni.length && f.anni.indexOf(String(uc.anno)) < 0) { return false; }
    if (f.vendor.length && !f.vendor.some(function (v) { return uc.vendor.indexOf(v) >= 0; })) { return false; }
    if (f.servizi.length && !f.servizi.some(function (s) { return uc.servizi.indexOf(s) >= 0; })) { return false; }
    if (f.stati.length && f.stati.indexOf(uc.stato) < 0) { return false; }
    return true;
  });
}

const toOptions = function (values: string[]): IDropdownOption[] {
  return values.map(function (v) { return { key: v, text: v }; });
};

function multi(
  label: string, options: string[], selected: string[], onChange: (v: string[]) => void
): JSX.Element {
  return (
    <Dropdown
      label={label}
      multiSelect={true}
      options={toOptions(options)}
      selectedKeys={selected}
      placeholder="Tutti"
      onChange={function (_, o) {
        if (o) {
          const k = String(o.key);
          onChange(o.selected ? selected.concat([k]) : selected.filter(function (x) { return x !== k; }));
        }
      }}
    />
  );
}

export const FilterBar: React.FC<{ items: IUseCase[]; sectors: string[]; filters: IFilters; onChange: (f: IFilters) => void }> = function (props) {
  const f = props.filters;
  const set = function (patch: Partial<IFilters>): void { props.onChange(Object.assign({}, f, patch)); };
  const settori = uniqueSorted(props.sectors.concat(props.items.map(function (i) { return i.settore; })));
  const anni = uniqueSorted(props.items.map(function (i) { return i.anno === null ? '' : String(i.anno); })).reverse();
  const vendor = uniqueSorted(props.items.reduce(function (a: string[], i) { return a.concat(i.vendor); }, []));
  const active = f.search || f.settori.length || f.anni.length || f.vendor.length || f.servizi.length || f.stati.length;
  return (
    <div className={styles.filters} role="search">
      <SearchBox
        placeholder="Cerca per cliente, progetto, contenuti…"
        value={f.search}
        onChange={function (_, v) { set({ search: v || '' }); }}
        onClear={function () { set({ search: '' }); }}
        ariaLabel="Ricerca testuale"
      />
      {multi('Settore', settori, f.settori, function (v) { set({ settori: v }); })}
      {multi('Anno', anni, f.anni, function (v) { set({ anni: v }); })}
      {multi('Vendor', vendor, f.vendor, function (v) { set({ vendor: v }); })}
      {multi('Servizi AD', SERVIZI_AD, f.servizi, function (v) { set({ servizi: v }); })}
      {multi('Stato', ['Bozza', 'Completo'], f.stati, function (v) { set({ stati: v }); })}
      {active ? <DefaultButton text="Azzera filtri" iconProps={{ iconName: 'ClearFilter' }} onClick={function () { props.onChange(EMPTY_FILTERS); }} /> : null}
    </div>
  );
};

const StatusBadge: React.FC<{ stato: string }> = function (props) {
  return <span className={styles.badge + ' ' + (props.stato === 'Completo' ? styles.badgeDone : styles.badgeDraft)}>{props.stato}</span>;
};

type SortKey = 'cliente' | 'nomeProgetto' | 'settore' | 'anno' | 'stato' | 'modified';

function sortItems(items: IUseCase[], key: SortKey, desc: boolean): IUseCase[] {
  const copy = items.slice();
  copy.sort(function (a, b) {
    const av: any = (a as any)[key];
    const bv: any = (b as any)[key];
    let r: number;
    if (typeof av === 'number' || typeof bv === 'number') {
      r = (av || 0) - (bv || 0);
    } else {
      r = String(av || '').localeCompare(String(bv || ''), 'it', { sensitivity: 'base' });
    }
    return desc ? -r : r;
  });
  return copy;
}

export const UseCaseTable: React.FC<IUseCaseTableProps> = function (props) {
  const [sortKey, setSortKey] = React.useState<SortKey>('modified');
  const [desc, setDesc] = React.useState(true);
  const [narrow, setNarrow] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(function () {
    const el = wrapRef.current;
    if (!el) { return undefined; }
    const measure = function (): void { setNarrow(el.clientWidth < 760); };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return function () { ro.disconnect(); };
    }
    window.addEventListener('resize', measure);
    return function () { window.removeEventListener('resize', measure); };
  }, []);

  const dupGroups = React.useMemo(function () { return findDuplicateGroups(props.items); }, [props.items]);
  const rows = React.useMemo(function () {
    return sortItems(applyFilters(props.items, props.filters), sortKey, desc);
  }, [props.items, props.filters, sortKey, desc]);

  const dupInfo = function (uc: IUseCase): string {
    const ids = dupGroups[duplicateKey(uc)];
    return ids ? 'Possibile duplicato: stesso cliente, progetto e anno (ID ' + ids.filter(function (i) { return i !== uc.id; }).join(', ') + ')' : '';
  };

  const actions = function (uc: IUseCase): JSX.Element {
    return (
      <div style={{ display: 'flex', flexWrap: 'nowrap' }}>
        <IconButton iconProps={{ iconName: 'View' }} title="Apri" ariaLabel={'Apri ' + uc.nomeProgetto} onClick={function () { props.onOpen(uc); }} />
        <IconButton iconProps={{ iconName: 'Edit' }} title="Modifica" ariaLabel={'Modifica ' + uc.nomeProgetto} disabled={!props.permissions.canEdit} onClick={function () { props.onEdit(uc); }} />
        <IconButton iconProps={{ iconName: 'Copy' }} title="Duplica" ariaLabel={'Duplica ' + uc.nomeProgetto} disabled={!props.permissions.canAdd} onClick={function () { props.onDuplicate(uc); }} />
        <IconButton iconProps={{ iconName: 'PDF' }} title="Scarica PDF" ariaLabel={'Scarica PDF ' + uc.nomeProgetto} onClick={function () { props.onPdf(uc); }} />
        <IconButton iconProps={{ iconName: 'Delete' }} title="Elimina" ariaLabel={'Elimina ' + uc.nomeProgetto} disabled={!props.permissions.canDelete} onClick={function () { props.onDelete(uc); }} styles={{ root: { color: '#a4262c' } }} />
      </div>
    );
  };

  const sortable = function (key: SortKey, name: string, minWidth: number, extra: Partial<IColumn>): IColumn {
    return Object.assign({
      key: key, name: name, fieldName: key, minWidth: minWidth, isResizable: true,
      isSorted: sortKey === key, isSortedDescending: sortKey === key && desc,
      onColumnClick: function () {
        if (sortKey === key) { setDesc(!desc); } else { setSortKey(key); setDesc(false); }
      }
    }, extra) as IColumn;
  };

  const columns: IColumn[] = [
    sortable('cliente', 'Cliente', 140, {
      maxWidth: 220,
      onRender: function (uc: IUseCase) {
        const d = dupInfo(uc);
        return (
          <span>
            <button className={styles.link} onClick={function () { props.onOpen(uc); }}>{uc.cliente}</button>
            {d && <TooltipHost content={d}><Icon iconName="Warning" className={styles.dupe} aria-label={d} /></TooltipHost>}
          </span>
        );
      }
    }),
    sortable('nomeProgetto', 'Progetto', 160, { maxWidth: 260 }),
    sortable('settore', 'Settore', 110, { maxWidth: 160 }),
    sortable('anno', 'Anno', 50, { maxWidth: 60 }),
    { key: 'vendor', name: 'Vendor', minWidth: 110, maxWidth: 180, isResizable: true, isMultiline: true, onRender: function (uc: IUseCase) { return uc.vendor.join(', '); } },
    { key: 'servizi', name: 'Servizi AD', minWidth: 140, maxWidth: 240, isResizable: true, isMultiline: true, onRender: function (uc: IUseCase) { return uc.servizi.join(', '); } },
    sortable('stato', 'Stato', 80, { maxWidth: 90, onRender: function (uc: IUseCase) { return <StatusBadge stato={uc.stato} />; } }),
    sortable('modified', 'Ultima modifica', 120, {
      maxWidth: 150,
      onRender: function (uc: IUseCase) { return <span title={uc.modificatoDa}>{formatDateTime(uc.modified)}</span>; }
    }),
    { key: 'azioni', name: 'Azioni', minWidth: 190, maxWidth: 200, onRender: actions }
  ];

  return (
    <div ref={wrapRef}>
      <div className={styles.summary}>
        <span aria-live="polite">{rows.length} di {props.items.length} casi</span>
        <span>
          <Icon iconName="Warning" className={styles.dupe} /> = possibile duplicato (stesso cliente, progetto e anno)
        </span>
      </div>
      {rows.length === 0 ? (
        <div className={styles.empty}>Nessun caso trovato. Modifica i filtri oppure crea un nuovo caso.</div>
      ) : narrow ? (
        <div className={styles.cards}>
          {rows.map(function (uc) {
            const d = dupInfo(uc);
            return (
              <div className={styles.card} key={uc.id}>
                <div className={styles.cardTitle}>
                  <button className={styles.link} onClick={function () { props.onOpen(uc); }}>{uc.cliente}</button>
                  {d && <TooltipHost content={d}><Icon iconName="Warning" className={styles.dupe} /></TooltipHost>}
                </div>
                <div>{uc.nomeProgetto}</div>
                <div className={styles.cardMeta}>
                  {uc.settore} · {uc.anno} · <StatusBadge stato={uc.stato} /> · {formatDateTime(uc.modified)}
                </div>
                {uc.vendor.length > 0 && <div className={styles.cardMeta}>Vendor: {uc.vendor.join(', ')}</div>}
                {uc.servizi.length > 0 && <div className={styles.cardMeta}>Servizi: {uc.servizi.join(', ')}</div>}
                {actions(uc)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <DetailsList
            items={rows}
            columns={columns}
            selectionMode={SelectionMode.none}
            layoutMode={DetailsListLayoutMode.justified}
            getKey={function (uc: IUseCase) { return String(uc.id); }}
            ariaLabelForGrid="Elenco degli use case"
            compact={false}
          />
        </div>
      )}
    </div>
  );
};
