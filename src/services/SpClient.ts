import { SPHttpClient, SPHttpClientResponse, ISPHttpClientOptions } from '@microsoft/sp-http';
import { AppError } from './errors';


export function escapeODataString(value: string): string {
  return encodeURIComponent(value.replace(/'/g, "''"));
}

const VERBOSE_HEADERS: { [k: string]: string } = {
  'Accept': 'application/json;odata=verbose',
  'Content-Type': 'application/json;odata=verbose',
  'odata-version': ''
};

export function describeHttpError(status: number, serverMessage?: string): string {
  switch (status) {
    case 401:
      return 'Sessione scaduta o non autenticata. Ricarica la pagina e riprova.';
    case 403:
      return 'Non hai i permessi necessari per eseguire questa operazione.';
    case 404:
      return 'Elemento, lista o libreria non trovati. Verifica i nomi configurati nelle proprietà della web part.';
    case 409:
      return 'Operazione in conflitto con lo stato corrente dei dati. Ricarica e riprova.';
    case 412:
      return 'L\'elemento è stato modificato da un altro utente.';
    case 429:
    case 503:
      return 'SharePoint è temporaneamente sovraccarico. Attendi qualche istante e riprova.';
    default:
      return 'Errore SharePoint (' + status + ')' + (serverMessage ? ': ' + serverMessage : '.');
  }
}

export class SpClient {
  constructor(private http: SPHttpClient, public webUrl: string) {}

  public api(path: string): string {
    return this.webUrl.replace(/\/$/, '') + '/_api/' + path.replace(/^\//, '');
  }

  private async toError(response: SPHttpClientResponse): Promise<AppError> {
    let serverMessage = '';
    try {
      const json = await response.json();
      const m = json && (json['odata.error'] || json.error);
      serverMessage = m && m.message ? (m.message.value || m.message) : '';
    } catch (e) {
      // corpo non JSON: ignora
    }
    return new AppError(describeHttpError(response.status, serverMessage), response.status, serverMessage);
  }

  /** GET di JSON (odata=minimalmetadata, quindi include odata.etag per ogni elemento). */
  public async getJson<T>(url: string): Promise<T> {
    let response: SPHttpClientResponse;
    try {
      response = await this.http.get(url, SPHttpClient.configurations.v1, {
        headers: { 'Accept': 'application/json;odata=minimalmetadata' }
      });
    } catch (e) {
      throw new AppError('Impossibile contattare SharePoint. Controlla la connessione di rete.');
    }
    if (!response.ok) {
      throw await this.toError(response);
    }
    return (await response.json()) as T;
  }

  public async getBlob(url: string): Promise<Blob | undefined> {
    const response = await this.http.get(url, SPHttpClient.configurations.v1, {});
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw await this.toError(response);
    }
    return await response.blob();
  }

  /** POST con corpo JSON verbose. Restituisce lo status e il JSON (se presente). */
  public async postJson(url: string, body: unknown, extraHeaders?: { [k: string]: string }): Promise<{ status: number; json: any }> {
    const headers: { [k: string]: string } = {};
    Object.keys(VERBOSE_HEADERS).forEach(function (k) { headers[k] = VERBOSE_HEADERS[k]; });
    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
    }
    const options: ISPHttpClientOptions = { headers: headers, body: body === undefined ? undefined : JSON.stringify(body) };
    let response: SPHttpClientResponse;
    try {
      response = await this.http.post(url, SPHttpClient.configurations.v1, options);
    } catch (e) {
      throw new AppError('Impossibile contattare SharePoint. Controlla la connessione di rete.');
    }
    if (!response.ok) {
      throw await this.toError(response);
    }
    let json: any = undefined;
    if (response.status !== 204) {
      try {
        json = await response.json();
      } catch (e) {
        json = undefined;
      }
    }
    return { status: response.status, json: json };
  }

  public async postBinary(url: string, data: ArrayBuffer): Promise<void> {
    let response: SPHttpClientResponse;
    try {
      response = await this.http.post(url, SPHttpClient.configurations.v1, {
        headers: { 'Accept': 'application/json;odata=nometadata', 'odata-version': '', 'Content-Type': 'application/octet-stream' },
        body: data
      });
    } catch (e) {
      throw new AppError('Impossibile contattare SharePoint. Controlla la connessione di rete.');
    }
    if (!response.ok) {
      throw await this.toError(response);
    }
  }
}
