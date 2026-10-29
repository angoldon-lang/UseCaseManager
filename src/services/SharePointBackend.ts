import { SPHttpClient } from '@microsoft/sp-http';
import { IBackend } from './contracts';
import { IWebPartSettings } from '../models/UseCase';
import { SpClient } from './SpClient';
import { UseCaseService } from './UseCaseService';
import { AssetService } from './AssetService';
import { ProvisioningService } from './ProvisioningService';

export function createSharePointBackend(http: SPHttpClient, webUrl: string, settings: IWebPartSettings): IBackend {
  const sp = new SpClient(http, webUrl);
  return {
    service: new UseCaseService(sp, settings.listTitle),
    assets: new AssetService(sp, settings.assetsLibraryTitle),
    provisioning: new ProvisioningService(sp, settings.listTitle, settings.assetsLibraryTitle),
    canManageSettings: true,
    storageDescription: 'Lista: ' + settings.listTitle + ' · Libreria: ' + settings.assetsLibraryTitle
  };
}
