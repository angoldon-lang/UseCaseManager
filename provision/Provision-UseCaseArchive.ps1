<#
.SYNOPSIS
  Crea la lista "Use Cases" e la libreria "Use Case Assets" per l'app Archivio Use Case di AD Consulting.
.DESCRIPTION
  Richiede il modulo PnP.PowerShell e il ruolo di proprietario del sito.
  Lo script è idempotente: può essere rieseguito senza duplicare nulla.
.EXAMPLE
  .\Provision-UseCaseArchive.ps1 -SiteUrl https://contoso.sharepoint.com/sites/adconsulting
#>
param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [string]$ListTitle = 'Use Cases',
  [string]$LibraryTitle = 'Use Case Assets'
)

$ErrorActionPreference = 'Stop'
Connect-PnPOnline -Url $SiteUrl -Interactive

if (-not (Get-PnPList -Identity $LibraryTitle -ErrorAction SilentlyContinue)) {
  New-PnPList -Title $LibraryTitle -Template DocumentLibrary -OnQuickLaunch | Out-Null
  Write-Host "Libreria '$LibraryTitle' creata."
} else { Write-Host "Libreria '$LibraryTitle' già presente." }

if (-not (Get-PnPList -Identity $ListTitle -ErrorAction SilentlyContinue)) {
  New-PnPList -Title $ListTitle -Template GenericList -OnQuickLaunch -EnableVersioning | Out-Null
  Write-Host "Lista '$ListTitle' creata."
} else { Write-Host "Lista '$ListTitle' già presente." }

# Nome interno, titolo visualizzato, tipo
$fields = @(
  @('Settore', 'Settore', 'Text'),
  @('FatturatoCliente', 'Fatturato cliente (€)', 'Number'),
  @('Localizzazione', 'Localizzazione geografica', 'Text'),
  @('NomeProgetto', 'Nome progetto', 'Text'),
  @('AnnoProgetto', 'Anno progetto', 'Number'),
  @('SpesaProgetto', 'Spesa complessiva progetto (€)', 'Number'),
  @('SintesiProgetto', 'Sintesi progetto', 'Note'),
  @('Esigenza', 'Necessità / Esigenza del cliente', 'Note'),
  @('SoluzioneProposta', 'Soluzione proposta', 'Note'),
  @('SoluzioneImplementata', 'Soluzione implementata', 'Note'),
  @('Vendor', 'Vendor (separati da ;)', 'Note'),
  @('Tecnologie', 'Tecnologie / Prodotti (separati da ;)', 'Note'),
  @('ServiziAD', 'Servizi AD (separati da ;)', 'Note'),
  @('Benefici', 'Benefici ottenuti', 'Note'),
  @('KPI', 'KPI / Risultati misurabili', 'Note'),
  @('StatoCaso', 'Stato del caso', 'Choice'),
  @('ClienteCitabile', 'Cliente citabile nella scheda', 'Boolean'),
  @('DenominazioneAnonima', 'Denominazione anonima', 'Text'),
  @('LogoClienteUrl', 'Logo cliente (percorso)', 'Text'),
  @('LogoUtilizzabile', 'Logo utilizzabile nella scheda', 'Boolean')
)

foreach ($f in $fields) {
  $internal = $f[0]; $title = $f[1]; $type = $f[2]
  if (Get-PnPField -List $ListTitle -Identity $internal -ErrorAction SilentlyContinue) { continue }
  # DisplayName = nome interno al momento della creazione, poi si rinomina: così il nome interno resta privo di spazi.
  if ($type -eq 'Choice') {
    Add-PnPField -List $ListTitle -InternalName $internal -DisplayName $internal -Type Choice -Choices 'Bozza','Completo' -AddToDefaultView | Out-Null
    Set-PnPField -List $ListTitle -Identity $internal -Values @{ DefaultValue = 'Bozza' }
  } else {
    Add-PnPField -List $ListTitle -InternalName $internal -DisplayName $internal -Type $type -AddToDefaultView | Out-Null
  }
  Set-PnPField -List $ListTitle -Identity $internal -Values @{ Title = $title }
  Write-Host "Colonna $internal creata."
}
Set-PnPField -List $ListTitle -Identity 'Title' -Values @{ Title = 'Cliente / Ragione sociale' }
Write-Host 'Provisioning completato.'
