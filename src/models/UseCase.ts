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

/** Un caso progettuale così come è conservato nella lista SharePoint. */
export interface IUseCase {
  id?: number;
  /** odata.etag restituito da SharePoint: usato per il controllo di concorrenza. */
  etag?: string;

  // 1. Cliente
  cliente: string;
  settore: string;
  fatturato: number | null;
  localizzazione: string;

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
    fatturato: null,
    localizzazione: '',
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
    stato: 'Bozza',
    clienteCitabile: false,
    denominazioneAnonima: '',
    logoClienteUrl: '',
    logoUtilizzabile: false
  };
}

export interface IWebPartSettings {
  siteTitle: string;
  listTitle: string;
  assetsLibraryTitle: string;
  sectors: string[];
}

export interface IUserPermissions {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}
