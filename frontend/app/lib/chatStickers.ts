// Stickers del chat del equipo. Un sticker se manda como el texto `[[sticker:<id>]]` (el backend
// solo guarda texto) y cada pantalla lo dibuja: emoji grande con borde blanco recortado y, si lo
// tiene, una frase corta, como los stickers de WhatsApp.

export interface Sticker {
  id: string;
  emoji: string;
  /** Frase corta bajo el emoji (opcional). */
  texto?: string;
  /** Color de la frase. */
  color: string;
}

export interface PaqueteStickers {
  id: string;
  nombre: string;
  /** Emoji que identifica el paquete en la barra inferior de la bandeja. */
  icono: string;
  stickers: Sticker[];
}

const s = (id: string, emoji: string, texto: string | undefined, color: string): Sticker => ({ id, emoji, texto, color });

export const PAQUETES: PaqueteStickers[] = [
  {
    id: 'equipo',
    nombre: 'Equipo',
    icono: '👋',
    stickers: [
      s('equipo-buen-dia', '👋', 'Buen día', '#e8590c'),
      s('equipo-gracias', '🙏', 'Gracias', '#0b7285'),
      s('equipo-enterado', '👍', 'Enterado', '#2b8a3e'),
      s('equipo-listo', '✅', 'Listo', '#2b8a3e'),
      s('equipo-momento', '⏳', 'Un momento', '#e67700'),
      s('equipo-voy', '🏃', 'Voy para allá', '#1971c2'),
      s('equipo-urgente', '🚨', 'Urgente', '#e03131'),
      s('equipo-cafe', '☕', '¿Un café?', '#862e0b'),
      s('equipo-acuerdo', '🤝', 'De acuerdo', '#1864ab'),
      s('equipo-excelente', '🙌', 'Excelente', '#c2255c'),
      s('equipo-felicidades', '🎉', '¡Felicidades!', '#9c36b5'),
      s('equipo-descanso', '😴', 'Descanso', '#5f3dc4'),
    ],
  },
  {
    id: 'consultorio',
    nombre: 'Consultorio',
    icono: '🩺',
    stickers: [
      s('con-consulta', '🩺', 'En consulta', '#0b7285'),
      s('con-aplicando', '💉', 'Aplicando', '#c92a2a'),
      s('con-receta', '💊', 'Receta lista', '#9c36b5'),
      s('con-resultados', '🧪', 'Resultados', '#2b8a3e'),
      s('con-hospital', '🏥', 'En hospital', '#1864ab'),
      s('con-urgencia', '🚑', 'Urgencia', '#e03131'),
      s('con-curacion', '🩹', 'Curación', '#e8590c'),
      s('con-signos', '🫀', 'Signos vitales', '#c2255c'),
      s('con-expediente', '📋', 'Expediente', '#495057'),
      s('con-cita', '🗓️', 'Cita agendada', '#1971c2'),
      s('con-pago', '💳', 'Pagó', '#2b8a3e'),
      s('con-factura', '🧾', 'Factura', '#e67700'),
    ],
  },
  {
    id: 'animo',
    nombre: 'Ánimo',
    icono: '😂',
    stickers: [
      s('animo-jaja', '😂', 'Jajaja', '#e67700'),
      s('animo-amor', '😍', '¡Me encanta!', '#c2255c'),
      s('animo-uf', '😅', 'Uf…', '#e8590c'),
      s('animo-wow', '🤯', '¡Wow!', '#9c36b5'),
      s('animo-nooo', '😭', 'Noooo', '#1971c2'),
      s('animo-cool', '😎', 'Todo bien', '#0b7285'),
      s('animo-fiesta', '🥳', '¡Fiesta!', '#c2255c'),
      s('animo-mmm', '🤔', 'Mmm…', '#495057'),
      s('animo-ya', '😤', '¡Ya!', '#e03131'),
      s('animo-ternura', '🥹', 'Gracias', '#2b8a3e'),
      s('animo-fuerza', '💪', '¡Con todo!', '#e8590c'),
      s('animo-corazon', '❤️', 'Con cariño', '#e03131'),
    ],
  },
];

const POR_ID = new Map(PAQUETES.flatMap(p => p.stickers).map(x => [x.id, x]));

export const buscarSticker = (id: string): Sticker | undefined => POR_ID.get(id);
