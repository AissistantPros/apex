// Piezas puras del chat del equipo: stickers dentro del texto, mensajes solo de emojis,
// etiquetas de fecha/hora y agrupación de mensajes como en WhatsApp.

// ── Stickers ────────────────────────────────────────────────────────────────
export const codificarSticker = (id: string) => `[[sticker:${id}]]`;

/** El id del sticker si el mensaje es exactamente un sticker; si no, null. */
export function leerSticker(contenido: string): string | null {
  const m = /^\[\[sticker:([a-z0-9-]+)\]\]$/.exec((contenido || '').trim());
  return m ? m[1] : null;
}

// ── Solo emojis ─────────────────────────────────────────────────────────────
const ES_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

function graphemes(texto: string): string[] {
  const Seg = (Intl as any).Segmenter;
  if (Seg) return Array.from(new Seg('es', { granularity: 'grapheme' }).segment(texto), (x: any) => x.segment as string);
  return Array.from(texto);
}

/** Cuántos emojis tiene el mensaje si SOLO tiene emojis (1 a 3, se muestran grandes); si no, 0. */
export function contarSoloEmojis(texto: string): number {
  const t = (texto || '').replace(/\s+/g, '');
  if (!t || t.length > 40) return 0;
  const gs = graphemes(t);
  if (gs.length < 1 || gs.length > 3) return 0;
  return gs.every(g => ES_EMOJI.test(g)) ? gs.length : 0;
}

// ── Fechas y horas ──────────────────────────────────────────────────────────
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const dos = (n: number) => String(n).padStart(2, '0');

export const mismoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const diasEntre = (antes: Date, despues: Date) => Math.round((inicioDelDia(despues) - inicioDelDia(antes)) / 86400000);

export const horaCorta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

const fechaCompleta = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Separador de día dentro de la conversación: "Hoy", "Ayer", "lunes" o "03/11/2026". */
export function etiquetaDia(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  const n = diasEntre(d, ahora);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Ayer';
  if (n > 1 && n < 7) return DIAS[d.getDay()];
  return fechaCompleta(d);
}

/** Hora a la derecha de cada chat en la lista: "18:05", "Ayer", "lunes" o "03/11/2026". */
export function etiquetaLista(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return diasEntre(d, ahora) === 0 ? horaCorta(iso) : etiquetaDia(iso, ahora);
}

/** Texto corto del mensaje para la lista de chats. */
export function vistaPrevia(contenido: string): string {
  const id = leerSticker(contenido);
  if (id) return 'Sticker';
  return (contenido || '').replace(/\s*\n+\s*/g, ' ').trim();
}

// ── Agrupación ──────────────────────────────────────────────────────────────
export interface MensajeBase {
  id: string;
  /** Identidad estable en pantalla: la de un mensaje propio recién enviado se conserva al confirmarlo el servidor. */
  clave?: string;
  author_id?: string;
  content: string;
  created_at: string;
}

export type ItemConversacion<M extends MensajeBase> =
  | { tipo: 'dia'; key: string; etiqueta: string }
  | { tipo: 'msg'; key: string; msg: M; primero: boolean; ultimo: boolean };

/** Varios mensajes seguidos de la misma persona (menos de 5 min) forman un bloque: solo el primero lleva cola y nombre. */
const VENTANA_BLOQUE_MS = 5 * 60 * 1000;

export function agruparMensajes<M extends MensajeBase>(msgs: M[], ahora = new Date()): ItemConversacion<M>[] {
  const out: ItemConversacion<M>[] = [];
  let prev: M | null = null;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const d = new Date(m.created_at);
    const pd = prev ? new Date(prev.created_at) : null;
    const otroDia = !pd || !mismoDia(d, pd);
    if (otroDia) out.push({ tipo: 'dia', key: `d-${m.id}`, etiqueta: etiquetaDia(m.created_at, ahora) });
    const continua = !otroDia && !!prev && prev.author_id === m.author_id && d.getTime() - pd!.getTime() < VENTANA_BLOQUE_MS;
    const sig = msgs[i + 1];
    const sigContinua = !!sig && sig.author_id === m.author_id && mismoDia(new Date(sig.created_at), d)
      && new Date(sig.created_at).getTime() - d.getTime() < VENTANA_BLOQUE_MS;
    out.push({ tipo: 'msg', key: m.clave ?? m.id, msg: m, primero: !continua, ultimo: !sigContinua });
    prev = m;
  }
  return out;
}

/** Índice (0-7) estable por persona, para darle su color al nombre en el chat grupal. */
export function indiceColor(id: string | undefined): number {
  let h = 0;
  for (const ch of id || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 8;
}
