import { IBackend, IAssetStore, IUseCaseStore } from '../../src/services/contracts';
import { AppError, ConflictError } from '../../src/services/errors';
import { IUseCase, IUserPermissions } from '../../src/models/UseCase';
import { dataUrlToBlob } from './dataUrl';

const AD_LOGO = 'ad-consulting-logo.png';

export interface IMe {
  username: string;
  displayName: string;
  role: 'admin' | 'editor' | 'reader';
  permissions: IUserPermissions;
  canManageSettings: boolean;
}

export interface IAppConfig {
  siteTitle: string;
  sectors: string[];
}

export class HttpClient {
  constructor(private onUnauthorized: () => void) {}

  public async request(method: string, url: string, body?: BodyInit | null, headers?: { [k: string]: string }): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: method,
        credentials: 'same-origin',
        headers: Object.assign({ 'X-Requested-With': 'ucm' }, headers || {}),
        body: body
      });
    } catch (e) {
      throw new AppError('Impossibile contattare il server. Controlla la connessione di rete.');
    }
    if (response.status === 401 && ['/api/login', '/api/me', '/api/logout'].indexOf(url) < 0) {
      this.onUnauthorized();
    }
    return response;
  }

  public async json<T>(method: string, url: string, payload?: unknown, headers?: { [k: string]: string }): Promise<T> {
    const response = await this.request(
      method, url, payload === undefined ? undefined : JSON.stringify(payload),
      Object.assign(payload === undefined ? {} : { 'Content-Type': 'application/json' }, headers || {})
    );
    if (!response.ok) {
      throw await toError(response);
    }
    return (await response.json()) as T;
  }
}

async function toError(response: Response): Promise<AppError> {
  let message = '';
  let latest: IUseCase | undefined;
  try {
    const j = await response.json();
    message = j.error || '';
    latest = j.latest;
  } catch (e) {
    // corpo non JSON
  }
  if (response.status === 412) {
    return new ConflictError(latest);
  }
  return new AppError(message || 'Errore del server (' + response.status + ').', response.status);
}

class HttpUseCaseStore implements IUseCaseStore {
  private perms?: IUserPermissions;

  constructor(private http: HttpClient, private me: IMe) {}

  public getAll(): Promise<IUseCase[]> {
    return this.http.json<IUseCase[]>('GET', '/api/items');
  }

  public getById(id: number): Promise<IUseCase> {
    return this.http.json<IUseCase>('GET', '/api/items/' + id);
  }

  public getPermissions(): Promise<IUserPermissions> {
    return Promise.resolve(this.me.permissions);
  }

  public create(uc: IUseCase): Promise<IUseCase> {
    return this.http.json<IUseCase>('POST', '/api/items', uc);
  }

  public async update(uc: IUseCase, force: boolean = false): Promise<IUseCase> {
    return this.http.json<IUseCase>('PUT', '/api/items/' + uc.id, uc, { 'If-Match': force || !uc.etag ? '*' : uc.etag });
  }

  public async remove(uc: IUseCase): Promise<void> {
    await this.http.json<unknown>('DELETE', '/api/items/' + uc.id, undefined, { 'If-Match': uc.etag || '*' });
  }
}

class HttpAssetStore implements IAssetStore {
  private cache: { [name: string]: string | null } = {};

  constructor(private http: HttpClient) {}

  public async getDataUrl(name: string): Promise<string | null> {
    if (!name) {
      return null;
    }
    if (this.cache[name] !== undefined) {
      return this.cache[name];
    }
    const response = await this.http.request('GET', '/api/assets/' + encodeURIComponent(name));
    if (response.status === 404) {
      this.cache[name] = null;
      return null;
    }
    if (!response.ok) {
      throw await toError(response);
    }
    const blob = await response.blob();
    const dataUrl = await new Promise<string>(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(r.result as string); };
      r.onerror = function () { reject(new AppError('Impossibile leggere il logo.')); };
      r.readAsDataURL(blob);
    });
    this.cache[name] = dataUrl;
    return dataUrl;
  }

  public async uploadPng(fileName: string, dataUrl: string): Promise<string> {
    const response = await this.http.request('PUT', '/api/assets/' + encodeURIComponent(fileName), dataUrlToBlob(dataUrl), { 'Content-Type': 'image/png' });
    if (!response.ok) {
      throw await toError(response);
    }
    delete this.cache[fileName];
    return fileName;
  }

  public async deleteFile(name: string): Promise<void> {
    if (!name) {
      return;
    }
    try {
      await this.http.request('DELETE', '/api/assets/' + encodeURIComponent(name));
    } catch (e) {
      // un logo non eliminabile non deve bloccare il salvataggio del caso
    }
    delete this.cache[name];
  }

  public getAdLogo(): Promise<string | null> {
    return this.getDataUrl(AD_LOGO);
  }

  public async setAdLogo(dataUrl: string): Promise<void> {
    await this.uploadPng(AD_LOGO, dataUrl);
  }

  public async removeAdLogo(): Promise<void> {
    await this.deleteFile(AD_LOGO);
  }
}

export function createHttpBackend(http: HttpClient, me: IMe): IBackend {
  return {
    service: new HttpUseCaseStore(http, me),
    assets: new HttpAssetStore(http),
    canManageSettings: me.canManageSettings,
    storageDescription: 'I dati sono salvati nel database del server'
  };
}
