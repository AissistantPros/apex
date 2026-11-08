// Utilidades puras de imágenes (sin red ni sesión), para poder probarlas.
export const MAX_ENTRADA = 35 * 1024 * 1024;

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

/**
 * Comprime de forma transparente cualquier imagen en el navegador antes de subirla:
 * - Limita la dimensión máxima a 1920px (alta definición clínica)
 * - Convierte a formato WebP
 * - Garantiza que el archivo pese como máximo 1 MB (default 1000 KB) sin molestar con alertas al usuario.
 */
export async function comprimirImagenWebp(
  archivo: File,
  maxDimension = 1920,
  maxBytes = 1000 * 1024
): Promise<File> {
  const tipo = archivo.type.toLowerCase();
  const ext = archivo.name.toLowerCase().split('.').pop() || '';
  const esImagen = tipo.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext);

  if (!esImagen) return archivo;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(archivo);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        let calidad = 0.82;
        const exportar = (q: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(archivo);
                return;
              }
              // Si aún supera 1 MB y la calidad se puede bajar, iterar
              if (blob.size > maxBytes && q > 0.4) {
                exportar(q - 0.12);
              } else {
                const nombreBase = archivo.name.replace(/\.[^/.]+$/, '');
                const archivoWebp = new File([blob], `${nombreBase}.webp`, {
                  type: 'image/webp',
                  lastModified: Date.now(),
                });
                resolve(archivoWebp);
              }
            },
            'image/webp',
            q
          );
        };

        exportar(calidad);
      };
      img.onerror = () => resolve(archivo);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(archivo);
    reader.readAsDataURL(archivo);
  });
}
