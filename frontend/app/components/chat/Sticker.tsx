import { buscarSticker } from '@/app/lib/chatStickers';

/** Un sticker: emoji grande con borde blanco recortado y, si lo tiene, su frase. */
export default function Sticker({ id, tamano = 88 }: { id: string; tamano?: number }) {
  const st = buscarSticker(id);
  if (!st) return <span className="wa-texto">Sticker</span>;
  return (
    <span className="wa-sticker" role="img" aria-label={`Sticker: ${st.texto || st.emoji}`} style={{ minWidth: tamano }}>
      <span className="wa-sticker-emoji" style={{ fontSize: tamano * 0.72 }}>{st.emoji}</span>
      {st.texto && (
        <span className="wa-sticker-texto" style={{ color: st.color, fontSize: Math.max(12, tamano * 0.19), maxWidth: tamano * 1.5 }}>
          {st.texto}
        </span>
      )}
    </span>
  );
}
