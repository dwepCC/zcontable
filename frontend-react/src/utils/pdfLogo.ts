import axios from 'axios';
import { resolveBackendUrl } from '../api/client';

function authHeader(): Record<string, string> {
  const h: Record<string, string> = {};
  try {
    if (typeof window === 'undefined') return h;
    const t = window.sessionStorage.getItem('token') || window.localStorage.getItem('token');
    if (t) h.Authorization = `Bearer ${t}`;
  } catch {
    /* ignore */
  }
  return h;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(blob);
  });
}

/**
 * PDFKit (usado por @react-pdf) no dibuja WebP/GIF de forma fiable; normalizamos a PNG en el navegador.
 */
async function toPngDataUrlForPdf(dataUrl: string): Promise<string | null> {
  const head = dataUrl.slice(0, 80).toLowerCase();
  if (head.includes('image/png') || head.includes('image/jpeg') || head.includes('image/jpg')) {
    return dataUrl;
  }
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return dataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 512;
        let w = img.naturalWidth || 256;
        let h = img.naturalHeight || 256;
        if (w > maxSide) {
          h = Math.max(1, Math.round((h * maxSide) / w));
          w = maxSide;
        }
        if (h > maxSide) {
          w = Math.max(1, Math.round((w * maxSide) / h));
          h = maxSide;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** URL lista para fetch (misma lógica que API + origen actual si la ruta es relativa). */
function resolveLogoFetchUrl(logoPath: string): string {
  let resolved = resolveBackendUrl(logoPath);
  if (resolved.startsWith('data:') || resolved.startsWith('http://') || resolved.startsWith('https://')) {
    return resolved;
  }
  if (typeof window !== 'undefined') {
    const path = resolved.startsWith('/') ? resolved : `/${resolved}`;
    return `${window.location.origin}${path}`;
  }
  return resolved;
}

/**
 * Descarga el logo del estudio y devuelve un data URL en PNG/JPEG compatible con PDFs @react-pdf.
 * No usa credentials en fetch (evita bloqueo CORS con Allow-Origin: *).
 */
export async function loadLogoDataUrlForPdf(logoUrl: string | undefined | null): Promise<string | null> {
  const url = (logoUrl ?? '').trim();
  if (!url) return null;

  if (url.startsWith('data:')) {
    return toPngDataUrlForPdf(url);
  }

  const resolved = resolveLogoFetchUrl(url);
  if (resolved.startsWith('data:')) {
    return toPngDataUrlForPdf(resolved);
  }

  const headers = authHeader();
  let blob: Blob | null = null;

  try {
    const res = await fetch(resolved, { headers, mode: 'cors' });
    if (res.ok) {
      blob = await res.blob();
    }
  } catch {
    /* siguiente intento */
  }

  if (!blob || blob.size === 0) {
    try {
      const r = await axios.get(resolved, {
        responseType: 'arraybuffer',
        headers,
        validateStatus: (s) => s >= 200 && s < 400,
      });
      if (r.data && r.data.byteLength > 0) {
        blob = new Blob([r.data]);
      }
    } catch {
      return null;
    }
  }

  if (!blob || blob.size === 0) return null;

  try {
    const dataUrl = await blobToDataUrl(blob);
    return await toPngDataUrlForPdf(dataUrl);
  } catch {
    return null;
  }
}
