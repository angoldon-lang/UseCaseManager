'use strict';

const TEXT_MAX = 50000;
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

const STRING_FIELDS = [
  'cliente', 'settore', 'localizzazione', 'nomeProgetto', 'sintesi', 'esigenza', 'soluzioneProposta',
  'soluzioneImplementata', 'benefici', 'kpi', 'denominazioneAnonima'
];
const NUMBER_FIELDS = ['fatturato', 'spesa', 'anno'];
const LIST_FIELDS = ['vendor', 'tecnologie', 'servizi'];

class ValidationError extends Error {}

function cleanList(v, field) {
  if (!Array.isArray(v)) {
    throw new ValidationError('Campo "' + field + '" non valido.');
  }
  return v.slice(0, 200).map((x) => String(x).trim().slice(0, 200).replace(/;/g, ',')).filter(Boolean);
}

/** Accetta solo i campi noti con il tipo atteso; ignora qualunque altro campo (id, etag, autore…). */
function sanitizeCase(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Corpo della richiesta non valido.');
  }
  const out = {};
  for (const f of STRING_FIELDS) {
    const v = body[f] === undefined || body[f] === null ? '' : body[f];
    if (typeof v !== 'string') {
      throw new ValidationError('Campo "' + f + '" non valido.');
    }
    out[f] = v.slice(0, TEXT_MAX);
  }
  for (const f of NUMBER_FIELDS) {
    const v = body[f];
    if (v === undefined || v === null || v === '') {
      out[f] = null;
    } else if (typeof v === 'number' && isFinite(v)) {
      out[f] = v;
    } else {
      throw new ValidationError('Campo "' + f + '" non valido.');
    }
  }
  for (const f of LIST_FIELDS) {
    out[f] = cleanList(body[f] === undefined ? [] : body[f], f);
  }
  out.stato = body.stato === 'Completo' ? 'Completo' : 'Bozza';
  out.clienteCitabile = body.clienteCitabile === true;
  out.logoUtilizzabile = body.logoUtilizzabile === true;
  const logo = typeof body.logoClienteUrl === 'string' ? body.logoClienteUrl : '';
  if (logo && !ASSET_NAME.test(logo)) {
    throw new ValidationError('Riferimento al logo non valido.');
  }
  out.logoClienteUrl = logo;
  if (!out.cliente.trim() && !out.nomeProgetto.trim()) {
    throw new ValidationError('Indica almeno il cliente o il nome del progetto.');
  }
  if (out.anno !== null && (out.anno < 1990 || out.anno > 2100)) {
    throw new ValidationError('Anno non valido.');
  }
  if ((out.fatturato !== null && out.fatturato < 0) || (out.spesa !== null && out.spesa < 0)) {
    throw new ValidationError('Gli importi non possono essere negativi.');
  }
  return out;
}

function isPng(buffer) {
  return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

module.exports = { sanitizeCase, ValidationError, ASSET_NAME, isPng };
