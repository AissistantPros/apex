// Utilidades puras de imágenes (sin red ni sesión), para poder probarlas.
export const MAX_ENTRADA = 12 * 1024 * 1024;

export const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

/** Convierte un data:image/...;base64 (lo que entrega el recortador) en un archivo para subir. */
export function dataUrlABlob(dataUrl: string): Blob {
  const [cab, b64] = dataUrl.split(',');
  const tipo = /data:([^;]+)/.exec(cab)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}
