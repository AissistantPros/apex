// Subida de imágenes de marca (foto del doctor, logotipos). El servidor las reduce al tamaño
// en que se usan y las convierte a WebP; aquí solo se manda el archivo y se avisa del cambio.
import { getSession } from '@/app/lib/auth';

export type ImgKind = 'photo' | 'logo' | 'logo_dark';

export interface ResultadoSubida { url: string; kind: ImgKind; bytes: number; ancho: number; alto: number }

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
export { MAX_ENTRADA, kb, dataUrlABlob, comprimirImagenWebp } from '@/app/lib/imgutil';
import { MAX_ENTRADA } from '@/app/lib/imgutil';

/** Que la barra de navegación y demás pantallas vuelvan a leer la marca del consultorio. */
export function avisarCambioDeMarca() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('apex:brand-updated'));
}

async function cabecera(): Promise<Record<string, string>> {
  const s = await getSession();
  return s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {};
}

export async function subirImagen(kind: ImgKind, archivo: Blob, nombre = 'imagen'): Promise<ResultadoSubida> {
  if (archivo.size > MAX_ENTRADA) throw new Error('La imagen pesa más de 12 MB. Elige una más ligera.');
  const fd = new FormData();
  fd.append('kind', kind);
  fd.append('file', archivo, nombre);
  const r = await fetch(`${BACKEND()}/doctor/images`, { method: 'POST', headers: await cabecera(), body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || 'No se pudo subir la imagen. Inténtalo de nuevo.');
  avisarCambioDeMarca();
  return j as ResultadoSubida;
}

export async function quitarImagen(kind: ImgKind): Promise<void> {
  const r = await fetch(`${BACKEND()}/doctor/images/${kind}`, { method: 'DELETE', headers: await cabecera() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'No se pudo quitar la imagen.');
  avisarCambioDeMarca();
}
