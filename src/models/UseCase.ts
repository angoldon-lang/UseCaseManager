export type CaseStatus = 'Bozza' | 'Completo';

export const SERVIZI_AD: string[] = [
  'Assessment',
  'Consulenza',
  'Progettazione',
  'Fornitura',
  'Installazione',
  'Configurazione',
  'Migrazione',
  'System Integration',
  'Formazione',
  'Assistenza',
  'Managed Services',
  'Manutenzione'
];

export const DEFAULT_SECTORS: string[] = [
  'Manifatturiero',
  'Servizi finanziari',
  'Sanità',
  'Pubblica Amministrazione',
  'Retail e GDO',
  'Energia e Utilities',
  'Trasporti e Logistica',
  'Telecomunicazioni',
  'Education',
  'Turismo e Hospitality',
  'Servizi professionali',
  'Altro'
];

/** Scaglioni di fatturato del cliente (si salva la chiave, si mostra l'etichetta). */
export interface IFatturatoScaglione {
  key: string;
  label: string;
}

export const FATTURATO_SCAGLIONI: IFatturatoScaglione[] = [
  { key: '0-2M', label: 'Fino a 2 M€' },
  { key: '2-10M', label: 'Da 2 a 10 M€' },
  { key: '10-50M', label: 'Da 10 a 50 M€' },
  { key: '50-250M', label: 'Da 50 a 250 M€' },
  { key: '250M-1Mld', label: 'Da 250 M€ a 1 Mld€' },
  { key: '>1Mld', label: 'Oltre 1 Mld€' }
];

export function fatturatoLabel(key: string | null | undefined): string {
  const found = FATTURATO_SCAGLIONI.filter(function (s) { return s.key === key; })[0];
  return found ? found.label : '';
}

/** Converte un importo (dati precedenti alla suddivisione in scaglioni) nel relativo scaglione. */
export function scaglioneFromAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount) || amount < 0) {
    return '';
  }
  const m = amount / 1000000;
  return m < 2 ? '0-2M' : m < 10 ? '2-10M' : m < 50 ? '10-50M' : m < 250 ? '50-250M' : m < 1000 ? '250M-1Mld' : '>1Mld';
}

/** Un caso progettuale così come è conservato nella lista SharePoint. */
export interface IUseCase {
  id?: number;
  /** odata.etag restituito da SharePoint: usato per il controllo di concorrenza. */
  etag?: string;

  // 1. Cliente
  cliente: string;
  settore: string;
  /** Chiave dello scaglione di fatturato ('' = non indicato). */
  fatturato: string;
  localizzazione: string;
  /** Sales di riferimento (facoltativo). */
  salesRiferimento: string;

  // 2. Progetto
  nomeProgetto: string;
  anno: number | null;
  spesa: number | null;
  sintesi: string;
  esigenza: string;

  // 3. Soluzione
  soluzioneProposta: string;
  soluzioneImplementata: string;

  // 4. Vendor e tecnologie
  vendor: string[];
  tecnologie: string[];

  // 5. Servizi AD
  servizi: string[];

  // 6. Benefici
  benefici: string;
  kpi: string;

  // Compilazione dei testi
  /** true = i testi sono stati elaborati con l'AI a partire dagli appunti. */
  compilazioneAI: boolean;
  appuntiAI: string;

  // Stato e citabilità
  stato: CaseStatus;
  clienteCitabile: boolean;
  denominazioneAnonima: string;
  /** URL server-relative del logo cliente nella libreria asset. */
  logoClienteUrl: string;
  logoUtilizzabile: boolean;

  // Metadati di sistema (sola lettura)
  created?: string;
  modified?: string;
  autore?: string;
  autoreEmail?: string;
  modificatoDa?: string;
}

export function emptyUseCase(): IUseCase {
  return {
    cliente: '',
    settore: '',
    fatturato: '',
    localizzazione: '',
    salesRiferimento: '',
    nomeProgetto: '',
    anno: new Date().getFullYear(),
    spesa: null,
    sintesi: '',
    esigenza: '',
    soluzioneProposta: '',
    soluzioneImplementata: '',
    vendor: [],
    tecnologie: [],
    servizi: [],
    benefici: '',
    kpi: '',
    compilazioneAI: false,
    appuntiAI: '',
    stato: 'Bozza',
    clienteCitabile: false,
    denominazioneAnonima: '',
    logoClienteUrl: '',
    logoUtilizzabile: false
  };
}

export interface IAppSettings {
  siteTitle: string;
  sectors: string[];
}

export interface IUserPermissions {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}
