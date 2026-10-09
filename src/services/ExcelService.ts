import { IUseCase } from '../models/UseCase';
import { downloadBlob } from '../utils/format';

interface IColumn {
  header: string;
  width: number;
  kind: 'text' | 'euro' | 'year' | 'int' | 'date';
  value: (uc: IUseCase) => string | number | Date | null;
}

function toDate(iso?: string): Date | null {
  if (!iso) {
    return null;
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export const EXCEL_COLUMNS: IColumn[] = [
  { header: 'ID caso', width: 9, kind: 'int', value: function (u) { return u.id === undefined ? null : u.id; } },
  { header: 'Cliente / Ragione sociale', width: 30, kind: 'text', value: function (u) { return u.cliente; } },
  { header: 'Cliente citabile nella scheda', width: 14, kind: 'text', value: function (u) { return u.clienteCitabile ? 'Sì' : 'No'; } },
  { header: 'Denominazione anonima', width: 34, kind: 'text', value: function (u) { return u.denominazioneAnonima; } },
  { header: 'Logo cliente (percorso)', width: 34, kind: 'text', value: function (u) { return u.logoClienteUrl; } },
  { header: 'Logo utilizzabile nella scheda', width: 14, kind: 'text', value: function (u) { return u.logoClienteUrl ? (u.logoUtilizzabile ? 'Sì' : 'No') : ''; } },
  { header: 'Settore / Industry', width: 22, kind: 'text', value: function (u) { return u.settore; } },
  { header: 'Fatturato cliente (€)', width: 18, kind: 'euro', value: function (u) { return u.fatturato; } },
  { header: 'Localizzazione geografica', width: 22, kind: 'text', value: function (u) { return u.localizzazione; } },
  { header: 'Nome progetto', width: 32, kind: 'text', value: function (u) { return u.nomeProgetto; } },
  { header: 'Anno progetto', width: 10, kind: 'year', value: function (u) { return u.anno; } },
  { header: 'Spesa complessiva progetto (€)', width: 20, kind: 'euro', value: function (u) { return u.spesa; } },
  { header: 'Sintesi progetto', width: 45, kind: 'text', value: function (u) { return u.sintesi; } },
  { header: 'Necessità / Esigenza del cliente', width: 60, kind: 'text', value: function (u) { return u.esigenza; } },
  { header: 'Soluzione proposta', width: 60, kind: 'text', value: function (u) { return u.soluzioneProposta; } },
  { header: 'Soluzione implementata', width: 60, kind: 'text', value: function (u) { return u.soluzioneImplementata; } },
  { header: 'Vendor', width: 28, kind: 'text', value: function (u) { return u.vendor.join('; '); } },
  { header: 'Tecnologie / Prodotti', width: 34, kind: 'text', value: function (u) { return u.tecnologie.join('; '); } },
  { header: 'Servizi AD', width: 36, kind: 'text', value: function (u) { return u.servizi.join('; '); } },
  { header: 'Benefici ottenuti', width: 60, kind: 'text', value: function (u) { return u.benefici; } },
  { header: 'KPI / Risultati misurabili', width: 45, kind: 'text', value: function (u) { return u.kpi; } },
  { header: 'Stato', width: 11, kind: 'text', value: function (u) { return u.stato; } },
  { header: 'Autore', width: 22, kind: 'text', value: function (u) { return u.autore || ''; } },
  { header: 'Data di creazione', width: 17, kind: 'date', value: function (u) { return toDate(u.created); } },
  { header: 'Ultima modifica', width: 17, kind: 'date', value: function (u) { return toDate(u.modified); } },
  { header: 'Modificato da', width: 22, kind: 'text', value: function (u) { return u.modificatoDa || ''; } }
];

/** Limite di Excel per una singola cella di testo. */
const MAX_CELL_CHARS = 32767;

/** Crea il file .xlsx formattato (una riga per use case, tutti i campi, testi completi). */
export async function buildWorkbookBlob(items: IUseCase[]): Promise<Blob> {
  const mod: any = await import(/* webpackChunkName: 'exceljs' */ 'exceljs');
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AD Consulting - Archivio Use Case';
  wb.created = new Date();
  const ws = wb.addWorksheet('Use Case', { views: [{ state: 'frozen', ySplit: 1, showGridLines: true }] });

  ws.columns = EXCEL_COLUMNS.map(function (c) { return { header: c.header, width: c.width }; });

  const header = ws.getRow(1);
  header.height = 36;
  header.eachCell(function (cell: any) {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C81' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  items.forEach(function (uc) {
    const row = ws.addRow(EXCEL_COLUMNS.map(function (c) {
      const v = c.value(uc);
      return typeof v === 'string' && v.length > MAX_CELL_CHARS
        ? v.substring(0, MAX_CELL_CHARS - 40) + ' [… testo troncato: limite di Excel]'
        : v;
    }));
    row.alignment = { vertical: 'top', wrapText: true };
    EXCEL_COLUMNS.forEach(function (c, i) {
      const cell = row.getCell(i + 1);
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: c.kind === 'text' ? 'left' : 'right' };
      cell.border = { top: { style: 'thin', color: { argb: 'FFD0D7DE' } }, left: { style: 'thin', color: { argb: 'FFD0D7DE' } }, bottom: { style: 'thin', color: { argb: 'FFD0D7DE' } }, right: { style: 'thin', color: { argb: 'FFD0D7DE' } } };
      switch (c.kind) {
        case 'euro': cell.numFmt = '#,##0.00 "€"'; break;
        case 'year': cell.numFmt = '0'; break;
        case 'int': cell.numFmt = '0'; break;
        case 'date': cell.numFmt = 'dd/mm/yyyy hh:mm'; break;
        default:
          // Formato Testo: impedisce qualunque interpretazione come formula o numero.
          cell.numFmt = '@';
      }
    });
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, items.length + 1), column: EXCEL_COLUMNS.length } };

  const buffer: ArrayBuffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function excelFileName(): string {
  const d = new Date();
  const pad = function (n: number): string { return n < 10 ? '0' + n : String(n); };
  return 'Archivio_UseCase_AD_Consulting_' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.xlsx';
}

export async function exportToExcel(items: IUseCase[]): Promise<void> {
  const blob = await buildWorkbookBlob(items);
  downloadBlob(blob, excelFileName());
}
