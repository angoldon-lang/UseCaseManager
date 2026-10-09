import { SpClient, AppError, escapeODataString } from './SpClient';

interface IFieldDef {
  name: string;
  title: string;
  xml: string;
}

function attrs(type: string, name: string): string {
  return 'Type="' + type + '" Name="' + name + '" StaticName="' + name + '" DisplayName="' + name + '"';
}
const text = (name: string, title: string, max: number = 255): IFieldDef => ({
  name, title, xml: '<Field ' + attrs('Text', name) + ' MaxLength="' + max + '" />'
});
const note = (name: string, title: string): IFieldDef => ({
  name, title,
  xml: '<Field ' + attrs('Note', name) + ' NumLines="8" RichText="FALSE" RichTextMode="Compatible" IsolateStyles="FALSE" AppendOnly="FALSE" />'
});
const num = (name: string, title: string, decimals: number): IFieldDef => ({
  name, title, xml: '<Field ' + attrs('Number', name) + ' Decimals="' + decimals + '" />'
});
const bool = (name: string, title: string): IFieldDef => ({
  name, title, xml: '<Field ' + attrs('Boolean', name) + '><Default>0</Default></Field>'
});

/** Definizione delle colonne della lista "Use Cases" (la colonna Title contiene il Cliente). */
export const LIST_FIELDS: IFieldDef[] = [
  text('Settore', 'Settore'),
  num('FatturatoCliente', 'Fatturato cliente (€)', 2),
  text('Localizzazione', 'Localizzazione geografica'),
  text('NomeProgetto', 'Nome progetto'),
  num('AnnoProgetto', 'Anno progetto', 0),
  num('SpesaProgetto', 'Spesa complessiva progetto (€)', 2),
  note('SintesiProgetto', 'Sintesi progetto'),
  note('Esigenza', 'Necessità / Esigenza del cliente'),
  note('SoluzioneProposta', 'Soluzione proposta'),
  note('SoluzioneImplementata', 'Soluzione implementata'),
  note('Vendor', 'Vendor (separati da ;)'),
  note('Tecnologie', 'Tecnologie / Prodotti (separati da ;)'),
  note('ServiziAD', 'Servizi AD (separati da ;)'),
  note('Benefici', 'Benefici ottenuti'),
  note('KPI', 'KPI / Risultati misurabili'),
  {
    name: 'StatoCaso',
    title: 'Stato del caso',
    xml: '<Field ' + attrs('Choice', 'StatoCaso') + ' Format="Dropdown" FillInChoice="FALSE"><Default>Bozza</Default>' +
      '<CHOICES><CHOICE>Bozza</CHOICE><CHOICE>Completo</CHOICE></CHOICES></Field>'
  },
  bool('ClienteCitabile', 'Cliente citabile nella scheda'),
  text('DenominazioneAnonima', 'Denominazione anonima'),
  text('LogoClienteUrl', 'Logo cliente (percorso)'),
  bool('LogoUtilizzabile', 'Logo utilizzabile nella scheda')
];

/** Crea (se mancano) la lista dei casi e la libreria dei loghi. Richiede il permesso "Gestisci liste". */
export class ProvisioningService {
  constructor(private sp: SpClient, private listTitle: string, private libraryTitle: string) {}

  private async listExists(title: string): Promise<boolean> {
    try {
      await this.sp.getJson(this.sp.api("web/lists/getbytitle('" + escapeODataString(title) + "')?$select=Id"));
      return true;
    } catch (e) {
      if (e instanceof AppError && e.status === 404) {
        return false;
      }
      throw e;
    }
  }

  private async createList(title: string, template: number, description: string): Promise<void> {
    await this.sp.postJson(this.sp.api('web/lists'), {
      __metadata: { type: 'SP.List' },
      BaseTemplate: template,
      Title: title,
      Description: description,
      EnableVersioning: true
    });
  }

  public async provision(): Promise<string[]> {
    const log: string[] = [];

    if (await this.listExists(this.libraryTitle)) {
      log.push('Libreria "' + this.libraryTitle + '": già presente.');
    } else {
      await this.createList(this.libraryTitle, 101, 'Loghi e immagini dell\'Archivio Use Case');
      log.push('Libreria "' + this.libraryTitle + '": creata.');
    }

    const listApi = this.sp.api("web/lists/getbytitle('" + escapeODataString(this.listTitle) + "')");
    if (await this.listExists(this.listTitle)) {
      log.push('Lista "' + this.listTitle + '": già presente.');
    } else {
      await this.createList(this.listTitle, 100, 'Archivio dei casi progettuali di AD Consulting');
      log.push('Lista "' + this.listTitle + '": creata.');
    }

    const existing = await this.sp.getJson<any>(listApi + '/fields?$select=InternalName&$top=500');
    const names: { [n: string]: boolean } = {};
    (existing.value || []).forEach(function (f: any) { names[f.InternalName] = true; });

    for (const def of LIST_FIELDS) {
      if (names[def.name]) {
        continue;
      }
      await this.sp.postJson(listApi + '/fields/createfieldasxml', {
        parameters: {
          __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
          Options: 16,
          SchemaXml: def.xml
        }
      });
      try {
        await this.sp.postJson(listApi + "/fields/getbyinternalnameortitle('" + def.name + "')", {
          __metadata: { type: 'SP.Field' },
          Title: def.title
        }, { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' });
      } catch (e) {
        // il nome visualizzato è solo estetico
      }
      log.push('Colonna "' + def.name + '": creata.');
    }

    try {
      await this.sp.postJson(listApi + "/fields/getbyinternalnameortitle('Title')", {
        __metadata: { type: 'SP.Field' },
        Title: 'Cliente / Ragione sociale'
      }, { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' });
    } catch (e) {
      // ignora
    }
    log.push('Provisioning completato.');
    return log;
  }
}
