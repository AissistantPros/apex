'use client';

// Chat del equipo (recepción, enfermería y médico) con el aspecto de WhatsApp para iPhone.
// Se abre desde el botón "Chat" del menú: sube desde abajo, a la izquierda y junto al menú
// (sin taparlo). Envío al instante (el mensaje aparece antes de que responda el servidor),
// Enter envía y Shift+Enter hace salto de línea, con emojis y stickers.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';
import Icon from '@/app/components/Icon';
import BandejaEmojis from '@/app/components/chat/BandejaEmojis';
import Sticker from '@/app/components/chat/Sticker';
import {
  agruparMensajes, codificarSticker, contarSoloEmojis, etiquetaLista, horaCorta, indiceColor, leerSticker, vistaPrevia,
} from '@/app/lib/chatFormato';
import '@/app/components/chat/chat.css';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const CANALES: { id: string; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'recepcion', label: 'Recepción' },
  { id: 'enfermeria', label: 'Enfermería' },
  { id: 'medico', label: 'Médico' },
];
const ROLE_LABEL: Record<string, string> = { doctor: 'Médico', receptionist: 'Recepción', nurse: 'Enfermería', accounting: 'Contabilidad', marketing: 'Marketing', admin: 'Médico' };
const ROLE_COLOR: Record<string, string> = { doctor: '#7048e8', receptionist: '#1c7ed6', nurse: '#e8590c', admin: '#7048e8' };
// Canal de área → rol que lo atiende (para etiquetar el canal con la persona real)
const CHANNEL_ROLE: Record<string, string> = { recepcion: 'receptionist', enfermeria: 'nurse', medico: 'doctor' };
// A cada rol le corresponde SU canal de área — no debe poder mandarse mensajes a sí mismo.
const OWN_CHANNEL: Record<string, string> = { receptionist: 'recepcion', nurse: 'enfermeria', doctor: 'medico' };

type Member = { id: string; display_name?: string; photo_url?: string; role?: string };
type Msg = {
  id: string; clave?: string; canal: string; author_id?: string; author_name?: string; author_role?: string;
  content: string; created_at: string; pending?: boolean; failed?: boolean;
};
type Preview = { content: string; created_at: string; author_id?: string; author_name?: string; author_role?: string };

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}

const esTactil = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const sinAcentosRol = (r?: string) => (r === 'admin' ? 'doctor' : r || '');

// Cómo se muestra un canal: la persona real (nombre + foto de su perfil) en vez de la etiqueta del rol.
function canalIdentidad(canalId: string, byRole: Record<string, Member>) {
  if (canalId === 'general') return { titulo: 'General', sub: 'Todo el equipo', member: null as Member | null };
  const rol = CHANNEL_ROLE[canalId];
  const m = byRole[rol];
  const genLabel = ROLE_LABEL[rol] || canalId;
  return { titulo: m?.display_name || genLabel, sub: `Mensaje directo · ${genLabel}`, member: m || null };
}

function Avatar({ nombre, foto, color, tamano = 52, general }: { nombre?: string; foto?: string; color?: string; tamano?: number; general?: boolean }) {
  const estilo = { width: tamano, height: tamano, fontSize: tamano * 0.42 } as const;
  if (general) {
    return (
      <span className="shrink-0 rounded-full flex items-center justify-center text-white" style={{ ...estilo, background: 'var(--wa-accent)' }} aria-hidden>
        <Icon name="users" size={tamano * 0.5} />
      </span>
    );
  }
  if (foto) return <img src={foto} alt="" className="shrink-0 rounded-full object-cover" style={{ width: tamano, height: tamano }} />;
  const c = color || '#7a95aa';
  return (
    <span className="shrink-0 rounded-full flex items-center justify-center font-semibold" style={{ ...estilo, background: c + '26', color: c }} aria-hidden>
      {(nombre || '?').trim()[0]?.toUpperCase() || '?'}
    </span>
  );
}

function Estado({ msg, sobreSuelto }: { msg: Msg; sobreSuelto?: boolean }) {
  if (msg.failed) return <Icon name="close" size={12} />;
  if (msg.pending) return <Icon name="clock" size={12} />;
  return <span style={{ color: sobreSuelto ? '#fff' : 'var(--wa-tick)', display: 'inline-flex' }}><Icon name="tick" size={14} title="Enviado" /></span>;
}

// ── Una burbuja ──────────────────────────────────────────────────────────────────────────
const Burbuja = memo(function Burbuja({
  msg, mio, primero, mostrarNombre, nombre, colorIdx, nuevo, onReintentar,
}: {
  msg: Msg; mio: boolean; primero: boolean; mostrarNombre: boolean; nombre: string; colorIdx: number; nuevo: boolean;
  onReintentar: (m: Msg) => void;
}) {
  const hora = horaCorta(msg.created_at);
  const stickerId = leerSticker(msg.content);
  const soloEmojis = stickerId ? 0 : contarSoloEmojis(msg.content);

  let cuerpo;
  if (stickerId || soloEmojis) {
    cuerpo = (
      <div className="wa-suelto" data-mio={mio}>
        {stickerId ? <Sticker id={stickerId} tamano={104} /> : (
          <span className="wa-suelto-emoji" style={{ fontSize: soloEmojis === 1 ? 58 : soloEmojis === 2 ? 46 : 38 }}>{msg.content.trim()}</span>
        )}
        <span className="wa-suelto-meta">{hora}{mio && <Estado msg={msg} sobreSuelto />}</span>
      </div>
    );
  } else {
    cuerpo = (
      <div className="wa-burbuja" data-mio={mio} data-cola={primero}>
        {mostrarNombre && <div className="wa-autor" style={{ color: `var(--wa-n${colorIdx})` }}>{nombre}</div>}
        <span className="wa-texto">{msg.content}</span>
        <span className="wa-meta">{hora}{mio && <Estado msg={msg} />}</span>
      </div>
    );
  }

  return (
    <div className="wa-fila-msg" data-mio={mio} data-primero={primero} data-nuevo={nuevo}>
      <div style={{ maxWidth: '84%', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: mio ? 'flex-end' : 'flex-start' }}>
        {cuerpo}
        {msg.failed && (
          <button type="button" className="wa-fallo" onClick={() => onReintentar(msg)}>
            No se envió · Reintentar
          </button>
        )}
      </div>
    </div>
  );
});

export default function TeamChat() {
  const [enabled, setEnabled] = useState(false);
  const [role, setRoleState] = useState('');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'list' | 'chat'>('list');
  const [canal, setCanal] = useState('general');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pend, setPend] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [me, setMe] = useState('');
  const [byId, setById] = useState<Record<string, Member>>({});
  const [byRole, setByRole] = useState<Record<string, Member>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [bandeja, setBandeja] = useState(false);
  const [bajarVisible, setBajarVisible] = useState(false);
  const [nuevosAbajo, setNuevosAbajo] = useState(0);

  const lastSeenRef = useRef<string>(new Date(Date.now() - 86400000).toISOString());
  const prevTotalRef = useRef<number>(0);
  const msgsRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const cursorRef = useRef<number | null>(null);
  const cacheRef = useRef<Record<string, Msg[]>>({});
  const firmaRef = useRef('');
  const pegado = useRef(true);
  const primeraCarga = useRef(true);
  const prevCantidad = useRef(0);
  const contador = useRef(0);

  // Sincronizar estado abierto con la app (TopNav)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('apex:chat-state', { detail: { open } }));
  }, [open]);

  // Botón "Chat" del menú lateral
  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('apex:toggle-chat', handler);
    return () => window.removeEventListener('apex:toggle-chat', handler);
  }, []);

  // Solo recepción, enfermería y médico (y admin) participan
  useEffect(() => {
    const r = getRole();
    setRoleState(r);
    const elegible = ['admin', 'doctor', 'receptionist', 'nurse'].includes(r);
    setEnabled(elegible);
    // Si el consultorio no tiene chat de equipo contratado (p. ej. Apex Lite), no se muestra.
    if (elegible && r !== 'admin') {
      (async () => {
        try {
          const rs = await fetch(`${B()}/staff/entitlements`, { headers: await authHeaders() });
          if (rs.ok && (await rs.json()).features?.chat_equipo === false) setEnabled(false);
        } catch { /* sin datos del plan: se deja como estaba */ }
      })();
    }
    // Permiso de notificaciones (para avisar de mensajes nuevos)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Roster de la clínica: nombre + foto que cada quien puso en su perfil.
  useEffect(() => {
    if (!enabled) return;
    const cargarRoster = async () => {
      try {
        const r = await fetch(`${B()}/messages/roster`, { headers: await authHeaders() });
        if (!r.ok) return;
        const d = await r.json();
        const id: Record<string, Member> = {};
        const rol: Record<string, Member> = {};
        (d.members || []).forEach((m: Member) => {
          id[m.id] = m;
          const rr = sinAcentosRol(m.role);
          // Si hay varios del mismo rol, se queda el que tenga foto/nombre configurado.
          if (!rol[rr] || (!rol[rr].photo_url && m.photo_url)) rol[rr] = m;
        });
        setById(id); setByRole(rol);
        if (d.me) setMe(d.me); // se sabe quién soy desde la lista de chats ("Tú: …")
      } catch { /* silencioso */ }
    };
    cargarRoster();
    const t = setInterval(cargarRoster, 30000);
    return () => clearInterval(t);
  }, [enabled]);

  // Canales visibles: General + las OTRAS dos áreas (no la propia).
  const visibleCanales = useMemo(() => CANALES.filter(c => c.id === 'general' || c.id !== OWN_CHANNEL[role]), [role]);
  useEffect(() => {
    if (!visibleCanales.some(c => c.id === canal)) setCanal('general');
  }, [visibleCanales, canal]);

  const totalUnread = useMemo(
    () => visibleCanales.reduce((a, c) => a + (unread[c.id] || 0), 0),
    [visibleCanales, unread]
  );

  // Sincronizar conteo de no leídos con el menú lateral
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('apex:chat-unread', { detail: { count: totalUnread } }));
  }, [totalUnread]);

  // Sonido corto (Web Audio) al llegar un mensaje nuevo
  const beep = () => {
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      const ctx = new AC();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = 660;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      o.start(); o.stop(ctx.currentTime + 0.36);
    } catch { /* silencioso */ }
  };

  // Carga de la conversación. Solo toca el estado si algo cambió (así no hay parpadeos al sondear).
  const cargar = useCallback(async (c: string) => {
    try {
      const r = await fetch(`${B()}/messages?canal=${c}&limit=100`, { headers: await authHeaders() });
      if (!r.ok) return;
      const d = await r.json();
      const lista: Msg[] = d.messages || [];
      const firma = `${c}:${lista.length}:${lista[lista.length - 1]?.id || ''}`;
      if (d.me) setMe(d.me);
      if (firma === firmaRef.current) return;
      firmaRef.current = firma;
      setMsgs(prev => {
        // Conserva la identidad en pantalla de los mensajes propios ya mostrados (sin parpadeo).
        const claves = new Map(prev.filter(m => m.clave).map(m => [m.id, m.clave!]));
        const resultado = lista.map(m => (claves.has(m.id) ? { ...m, clave: claves.get(m.id) } : m));
        cacheRef.current[c] = resultado;
        return resultado;
      });
    } catch { /* silencioso */ }
  }, []);

  const entrarAlChat = useCallback((c: string) => {
    firmaRef.current = '';
    primeraCarga.current = true;
    prevCantidad.current = 0;
    pegado.current = true;
    setNuevosAbajo(0);
    setBajarVisible(false);
    setBandeja(false);
    setMsgs(cacheRef.current[c] || []);
    setCanal(c);
    setView('chat');
  }, []);

  // Sondeo de la conversación abierta
  useEffect(() => {
    if (!enabled || !open || view !== 'chat') return;
    cargar(canal);
    const t = setInterval(() => cargar(canal), 4000);
    return () => clearInterval(t);
  }, [enabled, open, view, canal, cargar]);

  // Último mensaje de cada chat (para la lista)
  useEffect(() => {
    if (!enabled || !open || view !== 'list') return;
    let vivo = true;
    const traer = async () => {
      try {
        const r = await fetch(`${B()}/messages/previews`, { headers: await authHeaders() });
        if (r.ok && vivo) setPreviews((await r.json()).previews || {});
      } catch { /* silencioso */ }
    };
    traer();
    const t = setInterval(traer, 6000);
    return () => { vivo = false; clearInterval(t); };
  }, [enabled, open, view]);

  // Sondeo del badge de no leídos (aunque esté cerrado) + aviso de mensaje nuevo
  useEffect(() => {
    if (!enabled) return;
    const poll = async () => {
      try {
        const r = await fetch(`${B()}/messages/unread?after=${encodeURIComponent(lastSeenRef.current)}`, { headers: await authHeaders() });
        if (!r.ok) return;
        const counts = (await r.json()).counts || {};
        const visibles = new Set(CANALES.filter(c => c.id === 'general' || c.id !== OWN_CHANNEL[getRole()]).map(c => c.id));
        const total = Object.entries(counts).reduce((a, [k, v]: any) => a + (visibles.has(k) ? v : 0), 0);
        if (total > prevTotalRef.current) {
          beep();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
            try { new Notification('APEX · Nuevo mensaje del equipo'); } catch { /* */ }
          }
        }
        prevTotalRef.current = total;
        setUnread(counts);
      } catch { /* */ }
    };
    poll();
    const t = setInterval(poll, 8000);
    return () => clearInterval(t);
  }, [enabled]);

  // Al leer una conversación, se marca como vista
  useEffect(() => {
    if (open && view === 'chat') { lastSeenRef.current = new Date().toISOString(); setUnread(u => ({ ...u, [canal]: 0 })); }
  }, [open, view, canal, msgs.length]);

  // ── Mensajes visibles: lo del servidor + lo que se está enviando ──
  const visibles = useMemo(() => [...msgs, ...pend.filter(p => p.canal === canal)], [msgs, pend, canal]);
  const items = useMemo(() => agruparMensajes(visibles), [visibles]);

  const bajar = useCallback((suave: boolean) => {
    const el = msgsRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
  }, []);

  // Después de pintar: primera carga → abajo sin animar; mensaje nuevo → baja si estabas abajo, si no, cuenta.
  useLayoutEffect(() => {
    if (view !== 'chat') return;
    const n = visibles.length;
    if (primeraCarga.current) {
      if (n > 0) { bajar(false); primeraCarga.current = false; }
    } else if (n > prevCantidad.current) {
      if (pegado.current) bajar(true);
      else {
        const ultimo = visibles[n - 1];
        if (ultimo && ultimo.author_id !== me && !ultimo.pending) setNuevosAbajo(x => x + (n - prevCantidad.current));
      }
    }
    prevCantidad.current = n;
  }, [visibles, view, me, bajar]);

  // Si cambia el alto de la zona de mensajes (bandeja, campo que crece, teclado), se mantiene el final a la vista.
  useEffect(() => {
    const el = msgsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (pegado.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, open]);

  const alScrollMensajes = () => {
    const el = msgsRef.current;
    if (!el) return;
    const cerca = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pegado.current = cerca;
    setBajarVisible(prev => (prev === !cerca ? prev : !cerca));
    if (cerca) setNuevosAbajo(0);
  };

  // Altura del campo de texto (hasta ~5 líneas)
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    if (cursorRef.current !== null) {
      el.setSelectionRange(cursorRef.current, cursorRef.current);
      cursorRef.current = null;
    }
  }, [text, view]);

  // Al abrir una conversación en escritorio, el cursor queda listo para escribir
  useEffect(() => {
    if (!open || view !== 'chat' || esTactil()) return;
    const t = setTimeout(() => areaRef.current?.focus({ preventScroll: true }), 380);
    return () => clearTimeout(t);
  }, [open, view, canal]);

  // ── Envío ──
  const publicar = useCallback(async (contenido: string, previo?: Msg) => {
    const t = contenido.trim();
    if (!t) return;
    const clave = previo?.clave || `tmp-${Date.now()}-${++contador.current}`;
    const tmp: Msg = { id: previo?.id || clave, clave, canal, author_id: me, content: t, created_at: previo?.created_at || new Date().toISOString(), pending: true };
    pegado.current = true;
    setPend(p => (previo ? p.map(x => (x.clave === clave ? { ...tmp } : x)) : [...p, tmp]));
    try {
      const r = await fetch(`${B()}/messages`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ canal, content: t }) });
      if (!r.ok) throw new Error('no se envió');
      const fila = await r.json();
      const confirmado: Msg = { ...fila, canal, clave };
      setPend(p => p.filter(x => x.clave !== clave));
      setMsgs(m => {
        if (m.some(x => x.id === confirmado.id)) return m.map(x => (x.id === confirmado.id ? { ...x, clave } : x));
        const nueva = [...m, confirmado];
        cacheRef.current[canal] = nueva;
        firmaRef.current = `${canal}:${nueva.length}:${confirmado.id}`;
        return nueva;
      });
      setPreviews(pr => ({ ...pr, [canal]: { content: t, created_at: confirmado.created_at, author_id: me } }));
    } catch {
      setPend(p => p.map(x => (x.clave === clave ? { ...x, pending: false, failed: true } : x)));
    }
  }, [canal, me]);

  const enviarTexto = useCallback(() => {
    const t = text.trim();
    if (!t) return;
    setText('');
    publicar(t);
    if (!esTactil()) areaRef.current?.focus({ preventScroll: true });
  }, [text, publicar]);

  const enviarSticker = useCallback((id: string) => { publicar(codificarSticker(id)); }, [publicar]);

  const insertarEmoji = useCallback((e: string) => {
    const el = areaRef.current;
    const ini = el?.selectionStart ?? text.length;
    const fin = el?.selectionEnd ?? ini;
    cursorRef.current = ini + e.length;
    setText(text.slice(0, ini) + e + text.slice(fin));
  }, [text]);

  const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envía; Shift+Enter hace salto de línea. En pantallas táctiles Enter es salto de línea (como WhatsApp en iPhone).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !esTactil()) {
      e.preventDefault();
      enviarTexto();
    }
  };

  const alternarBandeja = () => {
    setBandeja(b => {
      const abre = !b;
      if (abre && esTactil()) areaRef.current?.blur(); // el teclado cede su lugar a la bandeja
      if (!abre) areaRef.current?.focus({ preventScroll: true });
      return abre;
    });
  };

  const cerrar = () => { setOpen(false); setBandeja(false); };
  const alTeclearPanel = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (bandeja) setBandeja(false); else cerrar();
  };

  if (!enabled) return null;

  const identidad = canalIdentidad(canal, byRole);
  const colorCanal = canal === 'general' ? undefined : (ROLE_COLOR[CHANNEL_ROLE[canal]] || '#7a95aa');
  const inertSi = (cond: boolean) => (cond ? { inert: '' as any } : {});
  const quien = (m: { author_id?: string; author_name?: string; author_role?: string }) => {
    const perfil = m.author_id ? byId[m.author_id] : undefined;
    return perfil?.display_name || m.author_name || ROLE_LABEL[sinAcentosRol(m.author_role)] || 'Alguien';
  };

  return (
    <div
      className="wa wa-panel"
      data-abierto={open}
      role="dialog"
      aria-label="Chat del equipo"
      aria-hidden={!open}
      onKeyDown={alTeclearPanel}
      {...inertSi(!open)}
    >
        {/* ── LISTA DE CHATS ── */}
        <section className="wa-capa wa-lista" data-atras={view === 'chat'} aria-hidden={view === 'chat'} {...inertSi(view === 'chat')}>
          <header className="wa-head" style={{ paddingLeft: 12, minHeight: 56 }}>
            <h2 className="flex-1" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Chats</h2>
            <button type="button" className="wa-icono" data-gris="true" onClick={cerrar} aria-label="Cerrar chat"><Icon name="close" size={20} /></button>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
            {visibleCanales.map(c => {
              const n = unread[c.id] || 0;
              const info = canalIdentidad(c.id, byRole);
              const col = c.id === 'general' ? undefined : (ROLE_COLOR[CHANNEL_ROLE[c.id]] || '#7a95aa');
              const pv = previews[c.id];
              const mio = !!pv && !!me && pv.author_id === me;
              const prefijo = !pv ? '' : mio ? 'Tú: ' : c.id === 'general' ? `${quien(pv).split(' ')[0]}: ` : '';
              return (
                <button key={c.id} type="button" className="wa-fila" onClick={() => entrarAlChat(c.id)}>
                  <Avatar general={c.id === 'general'} nombre={info.titulo} foto={info.member?.photo_url} color={col} tamano={52} />
                  <div className="wa-fila-cuerpo">
                    <div className="wa-fila-arriba">
                      <span className="wa-nombre">{info.titulo}</span>
                      {pv && <span className="wa-hora" data-nuevo={n > 0}>{etiquetaLista(pv.created_at)}</span>}
                    </div>
                    <div className="wa-fila-abajo">
                      <span className="wa-previa">
                        {pv ? <>{mio && <span style={{ color: 'var(--wa-tick)', display: 'inline-flex' }}><Icon name="tick" size={15} /></span>}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{prefijo}{vistaPrevia(pv.content)}</span></> : info.sub}
                      </span>
                      {n > 0 && <span className="wa-insignia" aria-label={`${n} mensajes sin leer`}>{n}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── CONVERSACIÓN ── */}
        <section className="wa-capa wa-conv" data-visible={view === 'chat'} aria-hidden={view !== 'chat'} {...inertSi(view !== 'chat')}>
          <header className="wa-head">
            <button type="button" className="wa-icono" onClick={() => { setBandeja(false); setView('list'); }} aria-label="Volver a la lista de chats"><Icon name="back" size={24} /></button>
            <Avatar general={canal === 'general'} nombre={identidad.titulo} foto={identidad.member?.photo_url} color={colorCanal} tamano={38} />
            <div className="flex-1 min-w-0" style={{ lineHeight: 1.2 }}>
              <div className="wa-nombre" style={{ fontSize: 16.5 }}>{identidad.titulo}</div>
              <div className="wa-sub">{identidad.sub}</div>
            </div>
            <button type="button" className="wa-icono" data-gris="true" onClick={cerrar} aria-label="Cerrar chat"><Icon name="close" size={20} /></button>
          </header>

          <div className="relative flex-1 min-h-0 flex flex-col">
            <div ref={msgsRef} className="wa-mensajes" role="log" aria-live="polite" aria-label={`Mensajes de ${identidad.titulo}`} onScroll={alScrollMensajes}>
              {visibles.length === 0 && (
                <div className="wa-aviso">
                  {canal === 'general' ? 'Aún no hay mensajes. Lo que escribas aquí lo ve todo el equipo.' : 'Aún no hay mensajes. Escribe el primero.'}
                </div>
              )}
              {items.map(it => it.tipo === 'dia' ? (
                <div key={it.key} className="wa-dia">{it.etiqueta}</div>
              ) : (
                <Burbuja
                  key={it.key}
                  msg={it.msg as Msg}
                  mio={!!it.msg.clave || (!!me && it.msg.author_id === me)}
                  primero={it.primero}
                  mostrarNombre={canal === 'general' && it.primero && !(it.msg.clave || (me && it.msg.author_id === me))}
                  nombre={quien(it.msg as Msg)}
                  colorIdx={indiceColor(it.msg.author_id)}
                  nuevo={!!it.msg.clave || Date.now() - new Date(it.msg.created_at).getTime() < 6000}
                  onReintentar={m => publicar(m.content, m)}
                />
              ))}
            </div>
            <button type="button" className="wa-bajar" data-visible={bajarVisible} onClick={() => bajar(true)} aria-label="Ir al último mensaje" tabIndex={bajarVisible ? 0 : -1}>
              {nuevosAbajo > 0 && <span className="wa-bajar-n">{nuevosAbajo}</span>}
              <Icon name="down" size={20} />
            </button>
          </div>

          <div className="wa-barra">
            <div className="wa-campo">
              <button type="button" className="wa-icono" onClick={alternarBandeja} aria-label={bandeja ? 'Volver al teclado' : 'Emojis y stickers'} aria-expanded={bandeja}>
                <Icon name={bandeja ? 'keyboard' : 'smile'} size={22} />
              </button>
              <textarea
                ref={areaRef}
                rows={1}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={alTeclear}
                onFocus={() => { if (bandeja && !esTactil()) return; if (bandeja) setBandeja(false); }}
                placeholder="Mensaje"
                aria-label="Escribe un mensaje"
                enterKeyHint="enter"
                className="wa-area"
              />
            </div>
            <button type="button" className="wa-enviar" onClick={enviarTexto} disabled={!text.trim()} aria-label="Enviar mensaje">
              <Icon name="send" size={22} />
            </button>
          </div>

          <div className="wa-bandeja" data-abierta={bandeja}>
            <BandejaEmojis abierta={bandeja && view === 'chat'} onEmoji={insertarEmoji} onSticker={enviarSticker} />
          </div>
        </section>
      </div>
  );
}
