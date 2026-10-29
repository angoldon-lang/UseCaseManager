import { AppError } from '../services/errors';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 800;

export interface IProcessedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Valida un file PNG/JPEG e lo ricodifica in PNG (la trasparenza è mantenuta), ridimensionandolo
 * se necessario nel rispetto delle proporzioni.
 */
export function processLogoFile(file: File): Promise<IProcessedImage> {
  const okType = /^image\/(png|jpeg)$/i.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
  if (!okType) {
    return Promise.reject(new AppError('Formato non supportato: seleziona un file PNG o JPEG.'));
  }
  if (file.size > MAX_BYTES) {
    return Promise.reject(new AppError('Il file supera la dimensione massima di 5 MB.'));
  }
  return new Promise<IProcessedImage>(function (resolve, reject) {
    const reader = new FileReader();
    reader.onerror = function () { reject(new AppError('Impossibile leggere il file selezionato.')); };
    reader.onload = function () {
      const img = new Image();
      img.onerror = function () { reject(new AppError('Il file selezionato non è un\'immagine valida.')); };
      img.onload = function () {
        const ratio = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new AppError('Il browser non supporta l\'elaborazione delle immagini.'));
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: w, height: h });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
