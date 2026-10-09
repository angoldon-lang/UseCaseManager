import { IUseCase } from '../models/UseCase';
import { normalize } from './format';

export function duplicateKey(uc: Pick<IUseCase, 'cliente' | 'nomeProgetto' | 'anno'>): string {
  return [normalize(uc.cliente), normalize(uc.nomeProgetto), uc.anno === null ? '' : String(uc.anno)].join('|');
}

/** Restituisce, per ogni chiave duplicata, l'elenco degli ID che la condividono. */
export function findDuplicateGroups(items: IUseCase[]): { [key: string]: number[] } {
  const groups: { [key: string]: number[] } = {};
  items.forEach(function (it) {
    if (!it.cliente || !it.nomeProgetto) {
      return;
    }
    const k = duplicateKey(it);
    (groups[k] = groups[k] || []).push(it.id as number);
  });
  const result: { [key: string]: number[] } = {};
  Object.keys(groups).forEach(function (k) {
    if (groups[k].length > 1) {
      result[k] = groups[k];
    }
  });
  return result;
}

/** Altri casi con la stessa combinazione cliente + progetto + anno. */
export function findDuplicatesOf(candidate: IUseCase, items: IUseCase[]): IUseCase[] {
  if (!candidate.cliente || !candidate.nomeProgetto) {
    return [];
  }
  const k = duplicateKey(candidate);
  return items.filter(function (it) { return it.id !== candidate.id && duplicateKey(it) === k; });
}
