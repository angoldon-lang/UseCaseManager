import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { IPropertyPaneConfiguration, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { initializeIcons } from '@fluentui/react';

import * as strings from 'UseCaseArchiveWebPartStrings';
import UseCaseArchive, { IUseCaseArchiveProps } from './components/UseCaseArchive';
import { DEFAULT_SECTORS } from '../../models/UseCase';
import { IBackend } from '../../services/contracts';
import { createSharePointBackend } from '../../services/SharePointBackend';

export interface IUseCaseArchiveWebPartProps {
  siteTitle: string;
  listTitle: string;
  assetsLibraryTitle: string;
  sectors: string;
}

export default class UseCaseArchiveWebPart extends BaseClientSideWebPart<IUseCaseArchiveWebPartProps> {
  private backend?: IBackend;
  private backendKey = '';

  protected onInit(): Promise<void> {
    try {
      initializeIcons();
    } catch (e) {
      // le icone sono già registrate dalla pagina
    }
    return super.onInit();
  }

  public render(): void {
    const p = this.properties;
    const sectors = (p.sectors || '')
      .split(/[,\n;]/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    const settings = {
      siteTitle: (p.siteTitle || '').trim() || 'Archivio Use Case',
      listTitle: (p.listTitle || '').trim() || 'Use Cases',
      assetsLibraryTitle: (p.assetsLibraryTitle || '').trim() || 'Use Case Assets',
      sectors: sectors.length ? sectors : DEFAULT_SECTORS
    };

    const key = settings.listTitle + '|' + settings.assetsLibraryTitle;
    if (!this.backend || this.backendKey !== key) {
      this.backend = createSharePointBackend(this.context.spHttpClient, this.context.pageContext.web.absoluteUrl, settings);
      this.backendKey = key;
    }

    const element: React.ReactElement<IUseCaseArchiveProps> = React.createElement(UseCaseArchive, {
      key: key,
      backend: this.backend,
      settings: settings
    });

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: strings.PropertyPaneDescription },
          groups: [
            {
              groupName: strings.GeneralGroupName,
              groupFields: [
                PropertyPaneTextField('siteTitle', { label: strings.SiteTitleFieldLabel }),
                PropertyPaneTextField('listTitle', { label: strings.ListTitleFieldLabel }),
                PropertyPaneTextField('assetsLibraryTitle', { label: strings.AssetsLibraryFieldLabel }),
                PropertyPaneTextField('sectors', {
                  label: strings.SectorsFieldLabel,
                  description: strings.SectorsFieldDescription,
                  multiline: true,
                  rows: 6
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
