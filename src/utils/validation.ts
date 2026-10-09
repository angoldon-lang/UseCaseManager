import { IUseCase } from '../models/UseCase';

export type FieldErrors = { [field: string]: string };

const REQUIRED_FOR_COMPLETE: Array<{ field: keyof IUseCase; label: string }> = [
  { field: 'cliente', label: 'Cliente / Ragione sociale' },
  { field: 'settore', label: 'Settore / Industry' },
  { field: 'nomeProgetto', label: 'Nome progetto' },
  { field: 'anno', label: 'Anno progetto' },
  { field: 'esigenza', label: 'Necessità / Esigenza del cliente' },
  { field: 'soluzioneProposta', label: 'Soluzione proposta' },
  { field: 'soluzioneImplementata', label: 'Soluzione implementata' },
  { field: 'benefici', label: 'Benefici ottenuti' }
];

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && isNaN(v));
}

/** Errori bloccanti: validi sia per Bozza sia per Completo. */
export function validateBasic(uc: IUseCase): FieldErrors {
  const errors: FieldErrors = {};
  if (isEmpty(uc.cliente) && isEmpty(uc.nomeProgetto)) {
    errors.cliente = 'Indica almeno il cliente o il nome del progetto per salvare una bozza.';
  }
  if (uc.anno !== null && (uc.anno < 1990 || uc.anno > 2100)) {
    errors.anno = 'Inserisci un anno compreso tra 1990 e 2100.';
  }
  if (uc.fatturato !== null && uc.fatturato < 0) {
    errors.fatturato = 'Il fatturato non può essere negativo.';
  }
  if (uc.spesa !== null && uc.spesa < 0) {
    errors.spesa = 'La spesa non può essere negativa.';
  }
  return errors;
}

/** Errori per lo stato "Completo": tutti i campi obbligatori devono essere compilati. */
export function validateComplete(uc: IUseCase): FieldErrors {
  const errors = validateBasic(uc);
  REQUIRED_FOR_COMPLETE.forEach(function (r) {
    if (isEmpty(uc[r.field])) {
      errors[r.field as string] = 'Campo obbligatorio per lo stato "Completo".';
    }
  });
  if (!uc.clienteCitabile && isEmpty(uc.denominazioneAnonima)) {
    // Non bloccante: verrà proposta una denominazione automatica nel PDF.
  }
  return errors;
}

export function missingRequiredLabels(uc: IUseCase): string[] {
  return REQUIRED_FOR_COMPLETE.filter(function (r) { return isEmpty(uc[r.field]); }).map(function (r) { return r.label; });
}

export function defaultAnonymousName(settore: string): string {
  const s = (settore || '').trim();
  return s ? 'Primaria azienda del settore ' + s.toLowerCase() : 'Primaria azienda cliente';
}
