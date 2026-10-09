import { SpClient, AppError, escapeODataString } from './SpClient';

const AD_LOGO_NAME = 'ad-consulting-logo.png';

/** Gestione dei loghi nella libreria documentale "Use Case Assets". */
export class AssetService {
  private folderUrl?: string;
  private cache: { [url: string]: string | null } = {};

  constructor(private sp: SpClient, private libraryTitle: string) {}

  public async getFolderUrl(): Promise<string> {
    if (!this.folderUrl) {
      const res = await this.sp.getJson<any>(
        this.sp.api("web/lists/getbytitle('" + escapeODataString(this.libraryTitle) + "')/rootFolder?$select=ServerRelativeUrl")
      );
      this.folderUrl = res.ServerRelativeUrl as string;
    }
    return this.folderUrl;
  }

  private fileApi(serverRelativeUrl: string): string {
    return this.sp.api("web/GetFileByServerRelativeUrl('" + encodeURI(serverRelativeUrl).replace(/'/g, "''") + "')");
  }

  /** Carica un PNG (data URL) nella libreria e restituisce l'URL server-relative. */
  public async uploadPng(fileName: string, dataUrl: string): Promise<string> {
    const folder = await this.getFolderUrl();
    const blob = dataUrlToBlob(dataUrl);
    const buffer = await new Promise<ArrayBuffer>(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(r.result as ArrayBuffer); };
      r.onerror = function () { reject(new AppError('Impossibile leggere l\'immagine selezionata.')); };
      r.readAsArrayBuffer(blob);
    });
    const url = this.sp.api(
      "web/GetFolderByServerRelativeUrl('" + encodeURI(folder).replace(/'/g, "''") + "')/Files/add(url='" +
      encodeURIComponent(fileName) + "',overwrite=true)"
    );
    await this.sp.postBinary(url, buffer);
    const full = folder.replace(/\/$/, '') + '/' + fileName;
    delete this.cache[full];
    return full;
  }

  public async deleteFile(serverRelativeUrl: string): Promise<void> {
    if (!serverRelativeUrl) {
      return;
    }
    try {
      await this.sp.postJson(this.fileApi(serverRelativeUrl) + '/recycle', undefined, { 'IF-MATCH': '*' });
    } catch (e) {
      // Un logo già rimosso o non eliminabile non deve bloccare il salvataggio del caso.
    }
    delete this.cache[serverRelativeUrl];
  }

  /** Scarica il file e lo restituisce come data URL (cache in memoria). */
  public async getDataUrl(serverRelativeUrl: string): Promise<string | null> {
    if (!serverRelativeUrl) {
      return null;
    }
    if (this.cache[serverRelativeUrl] !== undefined) {
      return this.cache[serverRelativeUrl];
    }
    const blob = await this.sp.getBlob(this.fileApi(serverRelativeUrl) + '/$value');
    if (!blob) {
      this.cache[serverRelativeUrl] = null;
      return null;
    }
    const dataUrl = await new Promise<string>(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(r.result as string); };
      r.onerror = function () { reject(new AppError('Impossibile leggere il logo.')); };
      r.readAsDataURL(blob);
    });
    this.cache[serverRelativeUrl] = dataUrl;
    return dataUrl;
  }

  // ---- Logo aziendale AD Consulting -------------------------------------------------------------

  public async getAdLogo(): Promise<string | null> {
    const folder = await this.getFolderUrl();
    return this.getDataUrl(folder.replace(/\/$/, '') + '/' + AD_LOGO_NAME);
  }

  public async setAdLogo(dataUrl: string): Promise<void> {
    await this.uploadPng(AD_LOGO_NAME, dataUrl);
  }

  public async removeAdLogo(): Promise<void> {
    const folder = await this.getFolderUrl();
    await this.deleteFile(folder.replace(/\/$/, '') + '/' + AD_LOGO_NAME);
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
  const bin = atob(parts[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}
