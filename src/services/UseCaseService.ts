import { SpClient, escapeODataString } from './SpClient';
import { AppError, ConflictError } from './errors';
import { IUseCaseStore } from './contracts';
import { IUseCase, IUserPermissions, CaseStatus } from '../models/UseCase';
import { joinList, splitList } from '../utils/format';


const SELECT = [
  'Id', 'Title', 'Settore', 'FatturatoCliente', 'Localizzazione', 'NomeProgetto', 'AnnoProgetto', 'SpesaProgetto',
  'SintesiProgetto', 'Esigenza', 'SoluzioneProposta', 'SoluzioneImplementata', 'Vendor', 'Tecnologie', 'ServiziAD',
  'Benefici', 'KPI', 'StatoCaso', 'ClienteCitabile', 'DenominazioneAnonima', 'LogoClienteUrl', 'LogoUtilizzabile',
  'Created', 'Modified', 'Author/Title', 'Author/EMail', 'Editor/Title'
].join(',');

export class UseCaseService implements IUseCaseStore {
  private entityType?: string;

  constructor(private sp: SpClient, private listTitle: string) {}

  private get listUrl(): string {
    return this.sp.api("web/lists/getbytitle('" + escapeODataString(this.listTitle) + "')");
  }

  public static fromRaw(raw: any): IUseCase {
    return {
      id: raw.Id,
      etag: raw['odata.etag'],
      cliente: raw.Title || '',
      settore: raw.Settore || '',
      fatturato: raw.FatturatoCliente === undefined ? null : raw.FatturatoCliente,
      localizzazione: raw.Localizzazione || '',
      nomeProgetto: raw.NomeProgetto || '',
      anno: raw.AnnoProgetto === undefined ? null : raw.AnnoProgetto,
      spesa: raw.SpesaProgetto === undefined ? null : raw.SpesaProgetto,
      sintesi: raw.SintesiProgetto || '',
      esigenza: raw.Esigenza || '',
      soluzioneProposta: raw.SoluzioneProposta || '',
      soluzioneImplementata: raw.SoluzioneImplementata || '',
      vendor: splitList(raw.Vendor),
      tecnologie: splitList(raw.Tecnologie),
      servizi: splitList(raw.ServiziAD),
      benefici: raw.Benefici || '',
      kpi: raw.KPI || '',
      stato: (raw.StatoCaso === 'Completo' ? 'Completo' : 'Bozza') as CaseStatus,
      clienteCitabile: !!raw.ClienteCitabile,
      denominazioneAnonima: raw.DenominazioneAnonima || '',
      logoClienteUrl: raw.LogoClienteUrl || '',
      logoUtilizzabile: !!raw.LogoUtilizzabile,
      created: raw.Created,
      modified: raw.Modified,
      autore: raw.Author ? raw.Author.Title : '',
      autoreEmail: raw.Author ? raw.Author.EMail : '',
      modificatoDa: raw.Editor ? raw.Editor.Title : ''
    };
  }

  private static toPayload(uc: IUseCase): { [k: string]: unknown } {
    return {
      Title: (uc.cliente || '').trim() || '(Cliente non indicato)',
      Settore: uc.settore,
      FatturatoCliente: uc.fatturato,
      Localizzazione: uc.localizzazione,
      NomeProgetto: uc.nomeProgetto,
      AnnoProgetto: uc.anno,
      SpesaProgetto: uc.spesa,
      SintesiProgetto: uc.sintesi,
      Esigenza: uc.esigenza,
      SoluzioneProposta: uc.soluzioneProposta,
      SoluzioneImplementata: uc.soluzioneImplementata,
      Vendor: joinList(uc.vendor),
      Tecnologie: joinList(uc.tecnologie),
      ServiziAD: joinList(uc.servizi),
      Benefici: uc.benefici,
      KPI: uc.kpi,
      StatoCaso: uc.stato,
      ClienteCitabile: uc.clienteCitabile,
      DenominazioneAnonima: uc.denominazioneAnonima,
      LogoClienteUrl: uc.logoClienteUrl,
      LogoUtilizzabile: uc.logoUtilizzabile
    };
  }

  /** Recupera TUTTI i casi accessibili all'utente, seguendo la paginazione di SharePoint. */
  public async getAll(): Promise<IUseCase[]> {
    const result: IUseCase[] = [];
    let url: string | undefined = this.listUrl + '/items?$select=' + SELECT + '&$expand=Author,Editor&$orderby=Id desc&$top=500';
    let guard = 0;
    while (url && guard < 1000) {
      const page: any = await this.sp.getJson<any>(url);
      (page.value || []).forEach(function (raw: any) { result.push(UseCaseService.fromRaw(raw)); });
      url = page['odata.nextLink'] || page['@odata.nextLink'];
      guard++;
    }
    return result;
  }

  public async getById(id: number): Promise<IUseCase> {
    const raw = await this.sp.getJson<any>(this.listUrl + '/items(' + id + ')?$select=' + SELECT + '&$expand=Author,Editor');
    return UseCaseService.fromRaw(raw);
  }

  private async getEntityType(): Promise<string> {
    if (!this.entityType) {
      const info = await this.sp.getJson<any>(this.listUrl + '?$select=ListItemEntityTypeFullName');
      this.entityType = info.ListItemEntityTypeFullName;
    }
    return this.entityType as string;
  }

  public async getPermissions(): Promise<IUserPermissions> {
    try {
      const info = await this.sp.getJson<any>(this.listUrl + '?$select=EffectiveBasePermissions');
      const low = Number(info.EffectiveBasePermissions.Low);
      return { canAdd: (low & 0x2) !== 0, canEdit: (low & 0x4) !== 0, canDelete: (low & 0x8) !== 0 };
    } catch (e) {
      if (e instanceof AppError && e.status === 404) {
        throw e;
      }
      return { canAdd: true, canEdit: true, canDelete: true };
    }
  }

  public async create(uc: IUseCase): Promise<IUseCase> {
    const type = await this.getEntityType();
    const payload = UseCaseService.toPayload(uc);
    payload.__metadata = { type: type };
    const res = await this.sp.postJson(this.listUrl + '/items', payload);
    const id = res.json && res.json.d && res.json.d.Id;
    return this.getById(id);
  }

  /**
   * Aggiorna un caso con controllo ottimistico di concorrenza (If-Match = etag letto in apertura).
   * Con force = true l'utente ha scelto esplicitamente di sovrascrivere la versione più recente.
   */
  public async update(uc: IUseCase, force: boolean = false): Promise<IUseCase> {
    const type = await this.getEntityType();
    const payload = UseCaseService.toPayload(uc);
    payload.__metadata = { type: type };
    try {
      await this.sp.postJson(this.listUrl + '/items(' + uc.id + ')', payload, {
        'IF-MATCH': force || !uc.etag ? '*' : uc.etag,
        'X-HTTP-Method': 'MERGE'
      });
    } catch (e) {
      if (e instanceof AppError && e.status === 412) {
        throw new ConflictError(await this.safeGet(uc.id as number));
      }
      throw e;
    }
    return this.getById(uc.id as number);
  }

  /** Sposta il caso nel cestino del sito (recuperabile dall'amministratore). */
  public async remove(uc: IUseCase): Promise<void> {
    try {
      await this.sp.postJson(this.listUrl + '/items(' + uc.id + ')/recycle', undefined, { 'IF-MATCH': uc.etag || '*' });
    } catch (e) {
      if (e instanceof AppError && e.status === 412) {
        throw new ConflictError(await this.safeGet(uc.id as number));
      }
      throw e;
    }
  }

  private async safeGet(id: number): Promise<IUseCase | undefined> {
    try {
      return await this.getById(id);
    } catch (e) {
      return undefined;
    }
  }
}
