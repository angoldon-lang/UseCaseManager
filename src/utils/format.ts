const IT = 'it-IT';

export function formatDate(iso?: string): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString(IT, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso?: string): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleString(IT, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '';
  }
  return value.toLocaleString(IT, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

/** Converte una stringa digitata dall'utente in numero (accetta "1.234,56" e "1234.56"). */
export function parseNumber(text: string): number | null {
  const t = (text || '').trim();
  if (!t) {
    return null;
  }
  let normalized = t.replace(/\s/g, '');
  if (normalized.indexOf(',') >= 0) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(normalized);
  return isNaN(n) ? null : n;
}

/** Normalizza un testo per ricerche e confronti (minuscolo, senza accenti). */
export function normalize(text: string | undefined | null): string {
  return (text || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trasforma un testo in un frammento sicuro per nomi di file. */
export function slug(text: string, maxLength: number = 50): string {
  const s = normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.substring(0, maxLength).replace(/-+$/g, '');
}

export function splitList(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/;|\r?\n/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

export function joinList(values: string[]): string {
  return (values || []).map(function (s) { return s.replace(/;/g, ',').trim(); }).filter(Boolean).join(';');
}

export function uniqueSorted(values: string[]): string[] {
  const seen: { [k: string]: boolean } = {};
  const out: string[] = [];
  values.forEach(function (v) {
    if (v && !seen[v]) {
      seen[v] = true;
      out.push(v);
    }
  });
  return out.sort(function (a, b) { return a.localeCompare(b, IT); });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}
