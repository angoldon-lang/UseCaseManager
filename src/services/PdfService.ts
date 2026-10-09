import { IUseCase } from '../models/UseCase';
import { defaultAnonymousName } from '../utils/validation';
import { formatDate, formatEuro, normalize, slug } from '../utils/format';

export interface IPdfTexts {
  titolo: string;
  sintesi: string;
  esigenza: string;
  soluzioneProposta: string;
  soluzioneImplementata: string;
  benefici: string;
  kpi: string;
  /** Denominazione usata al posto del cliente quando non è citabile. */
  denominazione: string;
}

export interface IPdfOptions {
  includeFatturato: boolean;
  includeSpesa: boolean;
  texts: IPdfTexts;
}

export interface IPdfInput {
  uc: IUseCase;
  options: IPdfOptions;
  adLogo: string | null;
  clientLogo: string | null;
}

export interface IPdfResult {
  blob: Blob;
  fileName: string;
  pageCount: number;
  /** Sezioni che hanno contenuto oltre la prima pagina (da sintetizzare). */
  overflowSections: string[];
}

export const SECTION_LABELS: { [key: string]: string } = {
  contesto: 'Contesto',
  esigenza: 'Esigenza',
  soluzione: 'Soluzione',
  attivita: 'Attività AD',
  benefici: 'Benefici e risultati'
};
const SECTION_ORDER = ['contesto', 'esigenza', 'soluzione', 'attivita', 'benefici'];

/** Campo del form di generazione → sezione del PDF (per evidenziare dove sintetizzare). */
export const FIELD_SECTION: { [field: string]: string } = {
  sintesi: 'contesto',
  esigenza: 'esigenza',
  soluzioneProposta: 'soluzione',
  soluzioneImplementata: 'soluzione',
  benefici: 'benefici',
  kpi: 'benefici'
};

const BRAND = '#0F4C81';
const GREY = '#5A6472';
const LIGHT = '#EEF3F8';

export function defaultTexts(uc: IUseCase): IPdfTexts {
  return {
    titolo: uc.nomeProgetto || '',
    sintesi: uc.sintesi || '',
    esigenza: uc.esigenza || '',
    soluzioneProposta: uc.soluzioneProposta || '',
    soluzioneImplementata: uc.soluzioneImplementata || '',
    benefici: uc.benefici || '',
    kpi: uc.kpi || '',
    denominazione: uc.denominazioneAnonima || defaultAnonymousName(uc.settore)
  };
}

export function showClientName(uc: IUseCase): boolean {
  return uc.clienteCitabile;
}

export function showClientLogo(uc: IUseCase, clientLogo: string | null): boolean {
  return uc.clienteCitabile && uc.logoUtilizzabile && !!clientLogo;
}

const LEGAL_SUFFIX = /\b(s\.?\s?p\.?\s?a\.?|s\.?\s?r\.?\s?l\.?s?\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?|gmbh|ltd|inc|llc|plc|ag|sa|bv|spa|srl|srls|snc|sas)\b\.?/gi;

/** Nome "essenziale" del cliente (senza forma giuridica) usato per cercare riferimenti identificativi. */
export function clientCoreName(cliente: string): string {
  const core = (cliente || '').replace(LEGAL_SUFFIX, ' ').replace(/[,.;]+/g, ' ').replace(/\s+/g, ' ').trim();
  return core.length >= 3 ? core : (cliente || '').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Elenca i testi della scheda che nominano il cliente quando questo non è citabile. */
export function findIdentifyingReferences(uc: IUseCase, texts: IPdfTexts): string[] {
  if (uc.clienteCitabile || !uc.cliente || uc.cliente.trim().length < 3) {
    return [];
  }
  const full = normalize(uc.cliente);
  const core = normalize(clientCoreName(uc.cliente));
  const labels: { [k: string]: string } = {
    titolo: 'Titolo', sintesi: 'Sintesi', esigenza: 'Esigenza', soluzioneProposta: 'Soluzione proposta',
    soluzioneImplementata: 'Soluzione implementata', benefici: 'Benefici', kpi: 'KPI', denominazione: 'Denominazione anonima'
  };
  const found: string[] = [];
  Object.keys(labels).forEach(function (k) {
    const t = normalize((texts as any)[k]);
    if (t && ((full && t.indexOf(full) >= 0) || (core && t.indexOf(core) >= 0))) {
      found.push(k);
    }
  });
  return found;
}

export function labelOfTextField(key: string): string {
  const m: { [k: string]: string } = {
    titolo: 'Titolo', sintesi: 'Sintesi', esigenza: 'Esigenza', soluzioneProposta: 'Soluzione proposta',
    soluzioneImplementata: 'Soluzione implementata', benefici: 'Benefici', kpi: 'KPI', denominazione: 'Denominazione anonima'
  };
  return m[key] || key;
}

/** Sostituisce ogni occorrenza del nome del cliente con la denominazione anonima. */
export function anonymizeTexts(uc: IUseCase, texts: IPdfTexts): IPdfTexts {
  const result: any = {};
  const candidates = [uc.cliente.trim(), clientCoreName(uc.cliente)]
    .filter(function (c, i, a) { return c.length >= 3 && a.indexOf(c) === i; })
    .sort(function (a, b) { return b.length - a.length; });
  Object.keys(texts).forEach(function (k) {
    let v: string = (texts as any)[k] || '';
    if (k !== 'denominazione') {
      candidates.forEach(function (c) {
        v = v.replace(new RegExp(escapeRegExp(c), 'gi'), texts.denominazione || 'il cliente');
      });
    } else {
      candidates.forEach(function (c) {
        v = v.replace(new RegExp(escapeRegExp(c), 'gi'), '').trim();
      });
    }
    result[k] = v;
  });
  return result as IPdfTexts;
}

/**
 * Nome file. Per le schede anonime non compaiono né il cliente né il nome del progetto
 * (che potrebbe contenerlo): si usano solo ID, settore e anno.
 */
export function buildFileName(uc: IUseCase): string {
  const id = uc.id ? String(uc.id) : 'nuovo';
  if (uc.clienteCitabile) {
    return ['Scheda_UseCase', slug(uc.cliente, 30), slug(uc.nomeProgetto, 40), id].filter(Boolean).join('_') + '.pdf';
  }
  return ['Scheda_UseCase', id, slug(uc.settore, 30), uc.anno || ''].filter(Boolean).join('_') + '.pdf';
}

// ---------------------------------------------------------------------------------------------------

interface ITracker {
  pageCount: number;
  sectionMaxPage: { [section: string]: number };
}

function para(text: string, extra?: any): any {
  const t = (text || '').trim();
  if (!t) {
    return Object.assign({ text: 'Non indicato', italics: true, color: '#8A94A0' }, extra || {});
  }
  return Object.assign({ text: t, alignment: 'left' }, extra || {});
}

function heading(section: string, index: number): any[] {
  return [
    {
      text: index + '. ' + SECTION_LABELS[section].toUpperCase(),
      id: 'h:' + section,
      color: BRAND,
      bold: true,
      fontSize: 10.5,
      margin: [0, 11, 0, 2],
      characterSpacing: 0.4
    },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.6, lineColor: '#C9D6E4' }], margin: [0, 0, 0, 5] }
  ];
}

function label(text: string): any {
  return { text: text, bold: true, color: BRAND, fontSize: 9, margin: [0, 4, 0, 1] };
}

function kv(k: string, v: string): any[] {
  return [{ text: k, color: GREY, fontSize: 8.5 }, { text: v || '—', bold: true }];
}

/** Costruisce la definizione pdfmake. Funzione pura, testabile senza browser. */
export function buildDocDefinition(input: IPdfInput, tracker: ITracker): any {
  const uc = input.uc;
  const t = input.options.texts;
  const anonymous = !showClientName(uc);
  const clientLabel = anonymous ? (t.denominazione || defaultAnonymousName(uc.settore)) : uc.cliente;
  const logoOk = showClientLogo(uc, input.clientLogo);

  const images: { [k: string]: string } = {};
  if (input.adLogo) {
    images.adLogo = input.adLogo;
  }
  if (logoOk && input.clientLogo) {
    images.clientLogo = input.clientLogo;
  }

  const headerLeft: any = input.adLogo
    ? { image: 'adLogo', fit: [140, 46], width: 150 }
    : { text: 'AD Consulting', bold: true, fontSize: 16, color: BRAND, width: 150 };
  const headerRight: any = logoOk
    ? { image: 'clientLogo', fit: [140, 46], alignment: 'right', width: '*' }
    : { text: '', width: '*' };

  // Dati di contesto
  const facts: any[][] = [];
  facts.push(kv('Cliente', clientLabel));
  facts.push(kv('Settore', uc.settore));
  facts.push(kv('Localizzazione', uc.localizzazione));
  facts.push(kv('Anno', uc.anno ? String(uc.anno) : ''));
  if (input.options.includeFatturato && uc.fatturato !== null) {
    facts.push(kv('Fatturato cliente', formatEuro(uc.fatturato)));
  }
  if (input.options.includeSpesa && uc.spesa !== null) {
    facts.push(kv('Spesa progetto', formatEuro(uc.spesa)));
  }
  const factRows: any[][] = [];
  for (let i = 0; i < facts.length; i += 2) {
    factRows.push(facts[i].concat(facts[i + 1] || [{ text: '' }, { text: '' }]));
  }

  const servizi = uc.servizi || [];
  const third = Math.ceil(servizi.length / 3) || 1;
  const serviziCols = [0, 1, 2].map(function (i) {
    return { ul: servizi.slice(i * third, (i + 1) * third), markerColor: BRAND, width: '*' };
  });

  const content: any[] = [
    { columns: [headerLeft, headerRight], columnGap: 10 },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.8, lineColor: BRAND }], margin: [0, 6, 0, 0] },
    { text: 'SCHEDA USE CASE', color: GREY, fontSize: 8, characterSpacing: 1.2, margin: [0, 12, 0, 2] },
    { text: t.titolo || uc.nomeProgetto || 'Use case', fontSize: 18, bold: true, color: BRAND, margin: [0, 0, 0, 2], id: 'title:contesto' }
  ];

  // 1. Contesto
  content.push.apply(content, heading('contesto', 1));
  content.push({
    table: { widths: [78, '*', 78, '*'], body: factRows },
    layout: 'noBorders',
    id: 'b:contesto:facts'
  });
  if ((t.sintesi || '').trim()) {
    content.push({ text: t.sintesi.trim(), italics: true, color: '#33414F', margin: [0, 6, 0, 0], id: 'b:contesto:sintesi' });
  }

  // 2. Esigenza
  content.push.apply(content, heading('esigenza', 2));
  content.push(para(t.esigenza, { id: 'b:esigenza:testo' }));

  // 3. Soluzione
  content.push.apply(content, heading('soluzione', 3));
  content.push(Object.assign(label('Soluzione proposta'), { id: 'b:soluzione:l1' }));
  content.push(para(t.soluzioneProposta, { id: 'b:soluzione:proposta' }));
  content.push(Object.assign(label('Soluzione implementata'), { id: 'b:soluzione:l2' }));
  content.push(para(t.soluzioneImplementata, { id: 'b:soluzione:implementata' }));
  if ((uc.vendor || []).length || (uc.tecnologie || []).length) {
    content.push({
      margin: [0, 6, 0, 0],
      id: 'b:soluzione:tech',
      table: {
        widths: [78, '*'],
        body: [
          [{ text: 'Vendor', color: GREY, fontSize: 8.5 }, { text: (uc.vendor || []).join(', ') || '—', bold: true }],
          [{ text: 'Tecnologie / Prodotti', color: GREY, fontSize: 8.5 }, { text: (uc.tecnologie || []).join(', ') || '—', bold: true }]
        ]
      },
      layout: 'noBorders'
    });
  }

  // 4. Attività AD
  content.push.apply(content, heading('attivita', 4));
  content.push(
    servizi.length
      ? { columns: serviziCols, columnGap: 10, id: 'b:attivita:servizi' }
      : para('', { id: 'b:attivita:servizi' })
  );

  // 5. Benefici e risultati
  content.push.apply(content, heading('benefici', 5));
  content.push(para(t.benefici, { id: 'b:benefici:testo' }));
  if ((t.kpi || '').trim()) {
    content.push({
      margin: [0, 6, 0, 0],
      id: 'b:benefici:kpi',
      table: {
        widths: ['*'],
        body: [[{ stack: [{ text: 'KPI / Risultati misurabili', bold: true, color: BRAND, fontSize: 9, margin: [0, 0, 0, 2] }, { text: t.kpi.trim() }], fillColor: LIGHT, margin: [6, 5, 6, 5] }]]
      },
      layout: 'noBorders'
    });
  }

  const updated = formatDate(uc.modified);
  return {
    pageSize: 'A4',
    pageMargins: [40, 34, 40, 50],
    info: {
      title: anonymous ? (t.titolo || 'Scheda Use Case') : (t.titolo || uc.nomeProgetto) + ' - ' + uc.cliente,
      author: 'AD Consulting',
      subject: 'Scheda Use Case',
      creator: 'AD Consulting - Archivio Use Case'
    },
    images: images,
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.18 },
    content: content,
    footer: function (currentPage: number, pageCount: number): any {
      tracker.pageCount = pageCount;
      return {
        margin: [40, 12, 40, 0],
        columns: [
          { text: 'ID caso: ' + (uc.id || '—') + (updated ? '  ·  Aggiornato il ' + updated : ''), color: GREY, fontSize: 8 },
          { text: 'AD Consulting  ·  Pagina ' + currentPage + ' di ' + pageCount, color: GREY, fontSize: 8, alignment: 'right' }
        ]
      };
    },
    pageBreakBefore: function (node: any): boolean {
      // Registra la pagina più alta raggiunta da ogni sezione (nessuna interruzione forzata).
      const id: string = node.id || '';
      const m = /^(?:h|b|title):([a-z]+)/.exec(id);
      if (m && node.pageNumbers && node.pageNumbers.length) {
        const max = Math.max.apply(null, node.pageNumbers);
        tracker.sectionMaxPage[m[1]] = Math.max(tracker.sectionMaxPage[m[1]] || 0, max);
      }
      return false;
    }
  };
}

export function overflowSectionsOf(tracker: ITracker): string[] {
  return SECTION_ORDER.filter(function (s) { return (tracker.sectionMaxPage[s] || 1) > 1; }).map(function (s) { return s; });
}

export function newTracker(): ITracker {
  return { pageCount: 1, sectionMaxPage: {} };
}

let pdfMakeLoader: Promise<any> | undefined;

function loadPdfMake(): Promise<any> {
  if (!pdfMakeLoader) {
    pdfMakeLoader = Promise.all([
      import(/* webpackChunkName: 'pdfmake' */ 'pdfmake/build/pdfmake'),
      import(/* webpackChunkName: 'pdfmake-fonts' */ 'pdfmake/build/vfs_fonts')
    ]).then(function (mods: any[]) {
      const pdfMake = mods[0].default || mods[0];
      const fonts = mods[1].default || mods[1];
      const vfs = (fonts.pdfMake && fonts.pdfMake.vfs) || fonts;
      if (typeof pdfMake.addVirtualFileSystem === 'function') {
        pdfMake.addVirtualFileSystem(vfs);
      } else {
        pdfMake.vfs = vfs;
      }
      return pdfMake;
    });
  }
  return pdfMakeLoader;
}

/** Genera il PDF (testo selezionabile, immagini incorporate come data URL). */
export async function renderPdf(input: IPdfInput): Promise<IPdfResult> {
  const pdfMake = await loadPdfMake();
  const tracker = newTracker();
  const def = buildDocDefinition(input, tracker);
  const blob: Blob = await new Promise<Blob>(function (resolve, reject) {
    try {
      pdfMake.createPdf(def).getBlob(function (b: Blob) { resolve(b); });
    } catch (e) {
      reject(e);
    }
  });
  return {
    blob: blob,
    fileName: buildFileName(input.uc),
    pageCount: tracker.pageCount,
    overflowSections: overflowSectionsOf(tracker).map(function (s) { return SECTION_LABELS[s]; })
  };
}
