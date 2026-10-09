/* Test della logica pura (PDF, Excel, duplicati, anonimizzazione). Uso: npm run test:logic */
const { execSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
execSync('npx tsc -p scripts/tsconfig.test.json', { cwd: root, stdio: 'inherit' });

const out = path.join(root, 'temp', 'test');
const pdf = require(path.join(out, 'services', 'PdfService.js'));
const excel = require(path.join(out, 'services', 'ExcelService.js'));
const dup = require(path.join(out, 'utils', 'duplicates.js'));
const val = require(path.join(out, 'utils', 'validation.js'));
const PdfPrinter = require(path.join(root, 'node_modules', 'pdfmake', 'src', 'printer.js'));
const vfs = require(path.join(root, 'node_modules', 'pdfmake', 'build', 'vfs_fonts.js'));

const font = (n) => Buffer.from(vfs[n], 'base64');
const printer = new PdfPrinter({
  Roboto: { normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf'), italics: font('Roboto-Italic.ttf'), bolditalics: font('Roboto-MediumItalic.ttf') }
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const long = (n) => Array(n).fill('Lorem ipsum dolor sit amet consectetur.').join(' ');

function base(extra) {
  return Object.assign({
    id: 42, cliente: 'Acme Industries S.p.A.', settore: 'Manifatturiero', fatturato: 5000000, localizzazione: 'Milano',
    nomeProgetto: 'Migrazione ERP', anno: 2025, spesa: 120000, sintesi: 'Sintesi breve.', esigenza: 'Esigenza di Acme Industries.',
    soluzioneProposta: 'Proposta', soluzioneImplementata: 'Implementata', vendor: ['SAP', 'Microsoft'], tecnologie: ['S/4HANA'],
    servizi: ['Assessment', 'Migrazione', 'Formazione'], benefici: 'Meno costi', kpi: '-30% tempi', stato: 'Completo',
    clienteCitabile: false, denominazioneAnonima: '', logoClienteUrl: '/x/logo.png', logoUtilizzabile: true,
    modified: '2026-03-01T10:00:00Z'
  }, extra || {});
}

async function render(uc, texts, opts) {
  const tracker = pdf.newTracker();
  const input = { uc, options: Object.assign({ includeFatturato: false, includeSpesa: false, texts: texts || pdf.defaultTexts(uc) }, opts || {}), adLogo: PNG, clientLogo: PNG };
  const def = pdf.buildDocDefinition(input, tracker);
  const doc = printer.createPdfKitDocument(def);
  const chunks = [];
  await new Promise((res) => { doc.on('data', (c) => chunks.push(c)); doc.on('end', res); doc.end(); });
  return { buf: Buffer.concat(chunks), tracker, def };
}

(async () => {
  // 1. Cliente non citabile: nessun nome/logo reale nel PDF e nel nome file
  let uc = base();
  let texts = pdf.defaultTexts(uc);
  assert.strictEqual(texts.denominazione, 'Primaria azienda del settore manifatturiero');
  assert.deepStrictEqual(pdf.findIdentifyingReferences(uc, texts), ['esigenza']);
  texts = pdf.anonymizeTexts(uc, texts);
  assert.ok(texts.esigenza.indexOf('Acme') < 0, 'anonimizzazione');
  assert.deepStrictEqual(pdf.findIdentifyingReferences(uc, texts), []);
  const fn = pdf.buildFileName(uc);
  assert.ok(!/acme|erp|migrazione/i.test(fn), 'nome file anonimo: ' + fn);
  let r = await render(uc, texts);
  assert.ok(r.buf.length > 1000);
  assert.ok(!('clientLogo' in r.def.images), 'logo cliente omesso se non citabile');
  assert.ok(JSON.stringify(r.def.content).indexOf('Acme') < 0, 'nome cliente omesso');
  assert.ok(!/Acme/.test(r.def.info.title));
  assert.strictEqual(r.tracker.pageCount, 1);
  assert.deepStrictEqual(pdf.overflowSectionsOf(r.tracker), []);

  // 2. Citabile con logo / senza logo utilizzabile
  uc = base({ clienteCitabile: true });
  r = await render(uc);
  assert.ok('clientLogo' in r.def.images && 'adLogo' in r.def.images);
  assert.ok(JSON.stringify(r.def.content).indexOf('Acme Industries S.p.A.') >= 0);
  assert.ok(/acme/.test(pdf.buildFileName(uc)));
  r = await render(base({ clienteCitabile: true, logoUtilizzabile: false }));
  assert.ok(!('clientLogo' in r.def.images));
  assert.ok(JSON.stringify(r.def.content).indexOf('Acme Industries S.p.A.') >= 0);

  // 3. Fatturato e spesa esclusi di default, inclusi su richiesta
  r = await render(base({ clienteCitabile: true }));
  assert.ok(JSON.stringify(r.def.content).indexOf('Fatturato cliente') < 0);
  r = await render(base({ clienteCitabile: true }), null, { includeFatturato: true, includeSpesa: true });
  const s = JSON.stringify(r.def.content);
  assert.ok(s.indexOf('Fatturato cliente') >= 0 && s.indexOf('Spesa progetto') >= 0);

  // 4. Overflow: testi lunghi => più pagine e sezioni segnalate, senza tagliare il testo
  uc = base({ clienteCitabile: true, esigenza: long(40), soluzioneProposta: long(40), soluzioneImplementata: long(40), benefici: long(30) });
  r = await render(uc);
  assert.ok(r.tracker.pageCount >= 2, 'pagine: ' + r.tracker.pageCount);
  const over = pdf.overflowSectionsOf(r.tracker);
  assert.ok(over.length >= 1, 'sezioni in overflow: ' + over);
  assert.ok(JSON.stringify(r.def.content).indexOf(long(30)) >= 0, 'testo non tagliato');

  // 5. Duplicati e validazione
  const a = base({ id: 1 }), b = base({ id: 2, cliente: ' ACME industries s.p.a. ', nomeProgetto: 'migrazione erp' });
  assert.deepStrictEqual(Object.values(dup.findDuplicateGroups([a, b]))[0], [1, 2]);
  assert.strictEqual(dup.findDuplicatesOf(a, [a, b]).length, 1);
  assert.ok(Object.keys(val.validateComplete(Object.assign({}, a, { esigenza: '' }))).indexOf('esigenza') >= 0);
  assert.strictEqual(Object.keys(val.validateBasic(Object.assign({}, a, { esigenza: '', benefici: '' }))).length, 0);

  // 6. Excel: formattazione, testi come stringhe, separatori ";"
  const items = [base({ id: 1, cliente: '=SUM(A1:A2)', esigenza: '+cmd|calc\nriga2', vendor: ['A', 'B'], created: '2026-01-02T09:00:00Z', autore: 'Mario Rossi' }), base({ id: 2 })];
  const blob = await excel.buildWorkbookBlob(items);
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  const ws = wb.worksheets[0];
  assert.strictEqual(ws.rowCount, 3);
  assert.strictEqual(ws.views[0].state, 'frozen');
  assert.strictEqual(ws.views[0].ySplit, 1);
  assert.strictEqual(ws.views[0].showGridLines, true);
  assert.strictEqual(ws.getRow(1).getCell(1).fill.fgColor.argb, 'FF0F4C81');
  assert.strictEqual(ws.getCell('B2').value, '=SUM(A1:A2)');
  assert.strictEqual(typeof ws.getCell('B2').value, 'string');
  assert.strictEqual(ws.getCell('N2').alignment.wrapText, true);
  assert.strictEqual(ws.getCell('Q2').value, 'A; B');
  assert.strictEqual(ws.getCell('H2').numFmt, '#,##0.00 "€"');
  assert.strictEqual(ws.getCell('B2').numFmt, '@');
  assert.ok(ws.getCell('X2').value instanceof Date);
  assert.strictEqual(ws.getCell('C2').value, 'No');
  assert.strictEqual(ws.getCell('B2').value, '=SUM(A1:A2)');
  console.log('OK: tutti i test di logica superati (pagine overflow: ' + r.tracker.pageCount + ', sezioni: ' + over.join(', ') + ')');
})().catch((e) => { console.error('FALLITO:', e); process.exit(1); });
