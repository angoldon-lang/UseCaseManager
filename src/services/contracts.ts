import { IUseCase, IUserPermissions } from '../models/UseCase';

/** Archivio dei casi: implementato da SharePoint (lista) e dal server standalone (SQLite). */
export interface IUseCaseStore {
  getAll(): Promise<IUseCase[]>;
  getById(id: number): Promise<IUseCase>;
  getPermissions(): Promise<IUserPermissions>;
  create(uc: IUseCase): Promise<IUseCase>;
  /** Controllo di concorrenza con etag; force = sovrascrittura esplicita. Solleva ConflictError. */
  update(uc: IUseCase, force?: boolean): Promise<IUseCase>;
  remove(uc: IUseCase): Promise<void>;
}

/** Archivio dei loghi (PNG). Il "riferimento" restituito è salvato nel caso. */
export interface IAssetStore {
  getDataUrl(reference: string): Promise<string | null>;
  uploadPng(fileName: string, dataUrl: string): Promise<string>;
  deleteFile(reference: string): Promise<void>;
  getAdLogo(): Promise<string | null>;
  setAdLogo(dataUrl: string): Promise<void>;
  removeAdLogo(): Promise<void>;
}

export interface IProvisioner {
  provision(): Promise<string[]>;
}

/** Dati inviati all'AI: solo appunti e contesto, mai il nome del cliente. */
export interface IAiInput {
  appunti: string;
  nomeProgetto: string;
  settore: string;
  anno: number | null;
  vendor: string[];
  tecnologie: string[];
  servizi: string[];
}

export interface IAiDraft {
  sintesi: string;
  esigenza: string;
  soluzioneProposta: string;
  soluzioneImplementata: string;
  benefici: string;
  kpi: string;
}

export interface IAiAssistant {
  describe(input: IAiInput): Promise<IAiDraft>;
}

export interface IBackend {
  service: IUseCaseStore;
  assets: IAssetStore;
  /** Presente solo su SharePoint (creazione lista e libreria). */
  provisioning?: IProvisioner;
  /** Elaborazione dei testi con l'AI (assente se non disponibile). */
  ai?: IAiAssistant;
  /** Perché l'AI non è disponibile (mostrato nel form). */
  aiUnavailableReason?: string;
  /** Chi può cambiare il logo aziendale. */
  canManageSettings: boolean;
  /** Descrizione della destinazione dati mostrata nelle impostazioni. */
  storageDescription: string;
}
