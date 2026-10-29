import { IUseCase } from '../models/UseCase';

/** Errore applicativo con messaggio già in italiano, pronto per essere mostrato. */
export class AppError extends Error {
  public status: number;
  public code: string;

  constructor(message: string, status: number = 0, code: string = '') {
    super(message);
    this.status = status;
    this.code = code;
    // Necessario con target ES5 per mantenere instanceof.
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/** Sollevata quando la scrittura è rifiutata (HTTP 412): qualcun altro ha modificato il caso. */
export class ConflictError extends AppError {
  public latest?: IUseCase;

  constructor(latest?: IUseCase) {
    super('Il caso è stato modificato da un altro utente.', 412);
    this.latest = latest;
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}
