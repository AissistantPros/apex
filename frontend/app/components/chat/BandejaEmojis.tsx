'use client';

// Bandeja de emojis y stickers que se abre bajo el campo de texto (como en WhatsApp).
// Los emojis se cargan solo al abrirla por primera vez (≈100 KB) y se pueden buscar en español.

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/app/components/Icon';
import Sticker from './Sticker';
import { normalizar } from '@/app/lib/buscar';
import { PAQUETES } from '@/app/lib/chatStickers';

type EmojiRow = [string, string, string]; // [emoji, nombre, palabras clave]
interface Grupo { id: string; nombre: string; emojis: EmojiRow[] }

const ICONO_GRUPO: Record<string, string> = {
  recientes: '', 'smileys-emotion': '😀', 'people-body': '🧑', 'animals-nature': '🐻', 'food-drink': '🍔',
  'travel-places': '✈️', activities: '⚽', objects: '💡', symbols: '🔣', flags: '🚩',
};
const CLAVE_RECIENTES = 'apex_chat_emojis_recientes';
const MAX_RECIENTES = 24;

function leerRecientes(): string[] {
  try { const v = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || '[]'); return Array.isArray(v) ? v.slice(0, MAX_RECIENTES) : []; } catch { return []; }
}

export default function BandejaEmojis({
  abierta, onEmoji, onSticker,
}: { abierta: boolean; onEmoji: (e: string) => void; onSticker: (id: string) => void }) {
  const [tab, setTab] = useState<'emoji' | 'sticker'>('emoji');
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [recientes, setRecientes] = useState<string[]>([]);
  const [consulta, setConsulta] = useState('');
  const [paquete, setPaquete] = useState(PAQUETES[0].id);
  const [catActiva, setCatActiva] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const cargando = useRef(false);

  // Carga diferida: solo la primera vez que se abre.
  useEffect(() => {
    if (!abierta || grupos || cargando.current) return;
    cargando.current = true;
    import('@/app/lib/emojis-es.json').then(m => setGrupos((m.default || m) as unknown as Grupo[])).catch(() => { cargando.current = false; });
    setRecientes(leerRecientes());
  }, [abierta, grupos]);

  const lista: Grupo[] = useMemo(() => {
    if (!grupos) return [];
    const rec: Grupo = { id: 'recientes', nombre: 'Usados con frecuencia', emojis: recientes.map(e => [e, '', ''] as EmojiRow) };
    return recientes.length ? [rec, ...grupos] : grupos;
  }, [grupos, recientes]);

  const q = normalizar(consulta);
  const resultados = useMemo(() => {
    if (q.length < 2 || !grupos) return null;
    const palabras = q.split(' ');
    const out: EmojiRow[] = [];
    for (const g of grupos) for (const e of g.emojis) {
      const txt = normalizar(`${e[1]} ${e[2]}`);
      if (palabras.every(p => txt.includes(p))) out.push(e);
      if (out.length >= 160) return out;
    }
    return out;
  }, [q, grupos]);

  const elegir = (e: string) => {
    onEmoji(e);
    setRecientes(prev => {
      const nuevo = [e, ...prev.filter(x => x !== e)].slice(0, MAX_RECIENTES);
      try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(nuevo)); } catch { /* sin storage */ }
      return nuevo;
    });
  };

  // Categoría resaltada según el scroll.
  const alScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    let actual = lista[0]?.id || '';
    box.querySelectorAll<HTMLElement>('[data-grupo]').forEach(el => {
      if (el.offsetTop - box.offsetTop <= box.scrollTop + 8) actual = el.dataset.grupo || actual;
    });
    setCatActiva(prev => (prev === actual ? prev : actual));
  };
  const irA = (id: string) => {
    const box = scrollRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-grupo="${id}"]`);
    if (box && el) box.scrollTo({ top: el.offsetTop - box.offsetTop, behavior: 'smooth' });
  };

  const sinFoco = (e: React.MouseEvent) => e.preventDefault(); // el campo de texto conserva el cursor
  const activa = catActiva || lista[0]?.id || '';

  return (
    <div className="wa-bandeja-in" aria-hidden={!abierta}>
      <div className="wa-b-top">
        <div className="wa-b-tabs" role="tablist" aria-label="Emojis o stickers">
          <button type="button" role="tab" aria-selected={tab === 'emoji'} aria-label="Emojis" className="wa-b-tab" onMouseDown={sinFoco} onClick={() => setTab('emoji')}>
            <Icon name="smile" size={19} />
          </button>
          <button type="button" role="tab" aria-selected={tab === 'sticker'} aria-label="Stickers" className="wa-b-tab" onMouseDown={sinFoco} onClick={() => setTab('sticker')}>
            <Icon name="sticker" size={19} />
          </button>
        </div>
        {tab === 'emoji' && (
          <label className="wa-b-buscar-caja">
            <Icon name="search" size={15} />
            <input
              className="wa-b-buscar"
              type="search"
              placeholder="Buscar emoji"
              aria-label="Buscar emoji"
              value={consulta}
              onChange={e => setConsulta(e.target.value)}
              tabIndex={abierta ? 0 : -1}
            />
          </label>
        )}
      </div>

      {tab === 'emoji' ? (
        <>
          {!resultados && (
            <div className="wa-b-cats" role="tablist" aria-label="Categorías">
              {lista.map(g => (
                <button
                  key={g.id}
                  type="button"
                  className="wa-b-cat"
                  aria-label={g.nombre}
                  title={g.nombre}
                  aria-current={activa === g.id}
                  onMouseDown={sinFoco}
                  onClick={() => irA(g.id)}
                >
                  {g.id === 'recientes' ? <Icon name="clock" size={18} /> : ICONO_GRUPO[g.id]}
                </button>
              ))}
            </div>
          )}
          <div ref={scrollRef} className="wa-b-scroll" onScroll={alScroll}>
            {!grupos && <p className="wa-b-vacio">Cargando emojis…</p>}
            {resultados ? (
              resultados.length ? (
                <div className="wa-b-grid">
                  {resultados.map(e => (
                    <button key={e[0]} type="button" className="wa-b-emoji" title={e[1]} aria-label={e[1]} onMouseDown={sinFoco} onClick={() => elegir(e[0])}>{e[0]}</button>
                  ))}
                </div>
              ) : <p className="wa-b-vacio">No hay emojis para «{consulta.trim()}».</p>
            ) : lista.map(g => (
              <section key={g.id} data-grupo={g.id} className="wa-b-grupo">
                <h3 className="wa-b-titulo">{g.nombre}</h3>
                <div className="wa-b-grid">
                  {g.emojis.map(e => (
                    <button key={e[0]} type="button" className="wa-b-emoji" title={e[1]} aria-label={e[1] || e[0]} onMouseDown={sinFoco} onClick={() => elegir(e[0])}>{e[0]}</button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="wa-b-scroll">
            <div className="wa-b-stickers">
              {PAQUETES.find(p => p.id === paquete)?.stickers.map(st => (
                <button key={st.id} type="button" className="wa-b-sticker" aria-label={st.texto || st.emoji} onMouseDown={sinFoco} onClick={() => onSticker(st.id)}>
                  <Sticker id={st.id} tamano={70} />
                </button>
              ))}
            </div>
          </div>
          <div className="wa-b-paquetes" role="tablist" aria-label="Paquetes de stickers">
            {PAQUETES.map(p => (
              <button key={p.id} type="button" role="tab" aria-selected={paquete === p.id} className="wa-b-paquete" onMouseDown={sinFoco} onClick={() => setPaquete(p.id)}>
                <span aria-hidden>{p.icono}</span>{p.nombre}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
