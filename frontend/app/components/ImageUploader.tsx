'use client';

// Subir / cambiar / quitar una imagen de marca. Reemplaza a los campos de URL y al base64:
// el archivo se manda al servidor, que lo reduce y lo convierte a WebP (ver backend/services/imagenes.py).

import { useRef, useState } from 'react';
import PhotoCropModal from '@/app/components/PhotoCropModal';
import { dataUrlABlob, kb, MAX_ENTRADA, quitarImagen, subirImagen, type ImgKind } from '@/app/lib/imagenes';

interface Props {
  kind: ImgKind;
  label: string;
  hint?: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** Fondo de la vista previa: el logo claro se ve sobre fondo claro, el logo para fondo oscuro sobre uno oscuro. */
  fondo?: 'claro' | 'oscuro';
  /** Letra que se muestra cuando no hay foto (solo foto de perfil). */
  inicial?: string;
}

export default function ImageUploader({ kind, label, hint, value, onChange, fondo = 'claro', inicial }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [recorte, setRecorte] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const esFoto = kind === 'photo';

  const subir = async (archivo: Blob, nombre: string) => {
    setOcupado(true); setError(''); setInfo('');
    try {
      const r = await subirImagen(kind, archivo, nombre);
      onChange(r.url);
      setInfo(`Lista: ${kb(r.bytes)} · ${r.ancho}×${r.alto} px (WebP). Ya se ve en todo el sistema.`);
    } catch (e: any) {
      setError(e?.message || 'No se pudo subir la imagen.');
    } finally {
      setOcupado(false);
    }
  };

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Elige un archivo de imagen (JPG, PNG o WebP).'); return; }
    if (f.size > MAX_ENTRADA) { setError('La imagen pesa más de 12 MB. Elige una más ligera.'); return; }
    setError(''); setInfo('');
    if (esFoto) setRecorte(f);            // la foto se encuadra antes de subir
    else subir(f, f.name);
  };

  const quitar = async () => {
    setOcupado(true); setError(''); setInfo('');
    try { await quitarImagen(kind); onChange(null); setInfo('Imagen quitada.'); }
    catch (e: any) { setError(e?.message || 'No se pudo quitar la imagen.'); }
    finally { setOcupado(false); }
  };

  const plato = fondo === 'oscuro' ? '#0e1622' : '#ffffff';

  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--c-text-2)' }}>{label}</p>
      <div className="flex items-center gap-4">
        {esFoto ? (
          value
            ? <img src={value} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" style={{ border: '1px solid var(--c-border-2)' }} />
            : <div className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-semibold flex-shrink-0"
                style={{ background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}>{inicial || 'D'}</div>
        ) : (
          <div className="h-16 min-w-[160px] max-w-[260px] rounded-lg flex items-center justify-center px-3 flex-shrink-0"
            style={{ background: plato, border: '1px solid var(--c-border-2)' }}>
            {value
              ? <img src={value} alt="" className="max-h-12 w-auto object-contain" />
              : <span className="text-xs" style={{ color: fondo === 'oscuro' ? '#9aa6b8' : '#6b7385' }}>Sin imagen</span>}
          </div>
        )}

        <div className="flex flex-col items-start gap-2">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={alElegir} />
          <div className="flex gap-2 flex-wrap">
            <button type="button" disabled={ocupado} onClick={() => inputRef.current?.click()}
              className="px-4 min-h-[40px] rounded-lg text-[14px] font-semibold disabled:opacity-60 hover:opacity-90"
              style={{ background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}>
              {ocupado ? 'Procesando…' : value ? 'Cambiar imagen' : 'Subir imagen'}
            </button>
            {value && (
              <button type="button" disabled={ocupado} onClick={quitar}
                className="px-3 min-h-[40px] rounded-lg text-[14px] font-medium hover:bg-[var(--c-subtle-2)] disabled:opacity-60"
                style={{ color: 'var(--c-danger)', border: '1px solid var(--c-border-2)' }}>Quitar</button>
            )}
          </div>
        </div>
      </div>
      {hint && !error && !info && <p className="text-xs mt-1.5" style={{ color: 'var(--c-text-3)' }}>{hint}</p>}
      {info && <p role="status" className="text-xs mt-1.5" style={{ color: 'var(--c-success)' }}>{info}</p>}
      {error && <p role="alert" className="text-xs mt-1.5" style={{ color: 'var(--c-danger)' }}>{error}</p>}

      {recorte && (
        <PhotoCropModal file={recorte} onCancel={() => setRecorte(null)}
          onSave={(b64) => { setRecorte(null); subir(dataUrlABlob(b64), 'foto.jpg'); }} />
      )}
    </div>
  );
}
