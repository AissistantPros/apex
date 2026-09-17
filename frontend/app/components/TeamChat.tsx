'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
// @ts-ignore — este proyecto no tiene @types/react-dom; createPortal existe en runtime
import { createPortal } from 'react-dom';
import { getSession } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const CANALES: { id: string; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '💬' },
  { id: 'recepcion', label: 'Recepción', icon: '🛎️' },
  { id: 'enfermeria', label: 'Enfermería', icon: '💉' },
  { id: 'medico', label: 'Médico', icon: '🩺' },
];
const ROLE_LABEL: Record<string, string> = { doctor: 'Médico', receptionist: 'Recepción', nurse: 'Enfermería', accounting: 'Contabilidad', marketing: 'Marketing' };
const ROLE_COLOR: Record<string, string> = { doctor: '#a78bfa', receptionist: '#0ea5e9', nurse: '#f97316', admin: '#a78bfa' };
// Canal de área → rol que lo atiende (para etiquetar el canal con la persona real)
const CHANNEL_ROLE: Record<string, string> = { recepcion: 'receptionist', enfermeria: 'nurse', medico: 'doctor' };

type Member = { id: string; display_name?: string; photo_url?: string; role?: string };

// Avatar: foto del perfil o inicial sobre un color de rol
function Avatar({ name, photo, color, size = 44 }: { name?: string; photo?: string; color?: string; size?: number }) {
  const c = color || '#7a95aa';
  if (photo) return <img src={photo} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size, border: `1.5px solid ${c}55` }} />;
  const ini = (name || '?').trim()[0]?.toUpperCase() || '?';
  return (
    <span className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: c + '22', color: c, fontSize: size * 0.42 }}>{ini}</span>
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}

type Msg = { id: string; canal: string; author_id?: string; author_name?: string; author_role?: string; content: string; created_at: string };

// Cómo se muestra un canal: la persona real (nombre + foto que puso en su perfil)
// en vez de la etiqueta genérica del rol.
function canalIdentidad(canalId: string, byRole: Record<string, Member>) {
  if (canalId === 'general') return { titulo: 'General (todo el equipo)', sub: 'Visible para todos', member: null as Member | null };
  const rol = CHANNEL_ROLE[canalId];
  const m = byRole[rol];
  const genLabel = ROLE_LABEL[rol] || canalId;
  const nombre = m?.display_name || genLabel;
  return { titulo: nombre, sub: `Mensaje directo · ${genLabel}`, member: m || null };
}

// A cada rol le corresponde SU canal de área — no debe poder mandarse mensajes a sí mismo.
const OWN_CHANNEL: Record<string, string> = { receptionist: 'recepcion', nurse: 'enfermeria', doctor: 'medico' };

export default function TeamChat() {
  const [enabled, setEnabled] = useState(false);
  const [role, setRoleState] = useState('');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'list' | 'chat'>('list');
  const [canal, setCanal] = useState('general');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [me, setMe] = useState('');
  const [byId, setById] = useState<Record<string, Member>>({});
  const [byRole, setByRole] = useState<Record<string, Member>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const lastSeenRef = useRef<string>(new Date(Date.now() - 86400000).toISOString());
  const prevTotalRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // El botón vive en la barra superior visible. Algunas páginas tienen su propio header que
  // tapa la barra estándar; como sus anclas aparecen DESPUÉS en el DOM, tomamos la ÚLTIMA
  // visible, que es la del header que realmente está arriba.
  useEffect(() => {
    const find = () => {
      const slots = Array.from(document.querySelectorAll<HTMLElement>('.apex-chat-slot'))
        .filter(el => el.offsetParent !== null);
      setSlot(slots[slots.length - 1] || null);
    };
    find();
    const t = setInterval(find, 800);
    return () => clearInterval(t);
  }, []);

  // Solo recepción, enfermería y médico (y admin) participan
  useEffect(() => {
    const r = getRole();
    setRoleState(r);
    setEnabled(['admin', 'doctor', 'receptionist', 'nurse'].includes(r));
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
          const rr = m.role === 'admin' ? 'doctor' : (m.role || '');
          // Si hay varios del mismo rol, se queda el que tenga foto/nombre configurado.
          if (!rol[rr] || (!rol[rr].photo_url && m.photo_url)) rol[rr] = m;
        });
        setById(id); setByRole(rol);
      } catch { /* silencioso */ }
    };
    cargarRoster();
    const t = setInterval(cargarRoster, 30000);
    return () => clearInterval(t);
  }, [enabled]);

  // Canales visibles: General + las OTRAS dos áreas (no la propia). Admin ve todas.
  const visibleCanales = CANALES.filter(c => c.id === 'general' || c.id !== OWN_CHANNEL[role]);
  useEffect(() => {
    if (!visibleCanales.some(c => c.id === canal)) setCanal('general');
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const cargar = useCallback(async (c: string) => {
    try {
      const r = await fetch(`${B()}/messages?canal=${c}`, { headers: await authHeaders() });
      if (!r.ok) return;
      const d = await r.json();
      setMsgs(d.messages || []); setMe(d.me || '');
    } catch { /* silencioso */ }
  }, []);

  // Polling de mensajes del canal abierto (solo en la vista de conversación)
  useEffect(() => {
    if (!enabled || !open || view !== 'chat') return;
    cargar(canal);
    const t = setInterval(() => cargar(canal), 4000);
    return () => clearInterval(t);
  }, [enabled, open, view, canal, cargar]);

  // Polling del badge de no leídos (aunque esté cerrado) + aviso de mensaje nuevo
  useEffect(() => {
    if (!enabled) return;
    const poll = async () => {
      try {
        const r = await fetch(`${B()}/messages/unread?after=${encodeURIComponent(lastSeenRef.current)}`, { headers: await authHeaders() });
        if (!r.ok) return;
        const counts = (await r.json()).counts || {};
        // Solo cuentan los canales que este rol puede ver
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

  // Cerrar el panel al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);

  // Al abrir/cambiar de canal, marcar visto
  useEffect(() => {
    if (open) { lastSeenRef.current = new Date().toISOString(); setUnread(u => ({ ...u, [canal]: 0 })); }
  }, [open, canal, msgs.length]);

  const enviar = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      await fetch(`${B()}/messages`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ canal, content: t }) });
      cargar(canal);
    } catch { setText(t); }
  };

  if (!enabled) return null;
  const totalUnread = visibleCanales.reduce((a, c) => a + (unread[c.id] || 0), 0);

  // Botón en la barra superior (con animación sutil constante) — se monta en el ancla del TopNav
  const triggerBtn = (
    <button ref={btnRef} onClick={() => { setOpen(o => !o); setView('list'); }}
      title="Chat del equipo"
      className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all"
      style={{
        background: open ? '#00e5a0' : 'rgba(0,229,160,0.12)',
        color: open ? '#000' : '#00e5a0',
        border: '1px solid rgba(0,229,160,0.35)',
      }}>
      {/* Punto "en vivo" con pulso sutil y constante */}
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: open ? '#000' : '#00e5a0', animation: 'apexPulse 2s ease-in-out infinite' }} />
        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: open ? '#000' : '#00e5a0' }} />
      </span>
      <span>Chat</span>
      {!open && totalUnread > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#f43f5e] text-white text-[10px] font-bold flex items-center justify-center">{totalUnread}</span>
      )}
      <style>{`@keyframes apexPulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(2.2);opacity:0}}`}</style>
    </button>
  );

  return (
    <>
      {/* El botón vive en la barra superior; si aún no hay ancla, cae a una esquina discreta */}
      {slot ? createPortal(triggerBtn, slot) : (
        <div className="fixed z-[90] top-3 right-3">{triggerBtn}</div>
      )}

      {/* Panel — debajo de la barra superior, a la derecha */}
      {open && (
        <div ref={panelRef} className="fixed z-[95] top-16 right-3 w-[min(94vw,380px)] h-[min(72vh,560px)] bg-[#0d1520] border border-[#1e2d3d] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

          {/* ── VISTA LISTA: elige a quién escribir (filas full-width, sin scroll horizontal) ── */}
          {view === 'list' && (
            <>
              <div className="px-4 py-3 border-b border-[#1e2d3d]">
                <p className="text-sm font-semibold text-[#dde6ef]">Chat del equipo</p>
                <p className="text-[11px] text-[#7a95aa]">Elige a quién escribir</p>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {visibleCanales.map(c => {
                  const n = unread[c.id] || 0;
                  const rol = CHANNEL_ROLE[c.id];
                  const col = c.id === 'general' ? '#00e5a0' : (ROLE_COLOR[rol] || '#7a95aa');
                  const info = canalIdentidad(c.id, byRole);
                  return (
                    <button key={c.id} onClick={() => { setCanal(c.id); setView('chat'); }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#111820] transition text-left">
                      {c.id === 'general'
                        ? <span className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0" style={{ background: col + '22' }}>{c.icon}</span>
                        : <Avatar name={info.titulo} photo={info.member?.photo_url} color={col} size={44} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#dde6ef] truncate">{info.titulo}</p>
                        <p className="text-[11px] text-[#7a95aa] truncate">{info.sub}</p>
                      </div>
                      {n > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#f43f5e] text-white text-[11px] font-bold flex items-center justify-center shrink-0">{n}</span>}
                      <span className="text-[#3d5870] shrink-0">›</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ── VISTA CONVERSACIÓN ── */}
          {view === 'chat' && (
            <>
              <div className="px-3 py-3 border-b border-[#1e2d3d] flex items-center gap-2.5">
                <button onClick={() => setView('list')} className="text-[#00e5a0] text-lg px-1" title="Volver">‹</button>
                {(() => {
                  const info = canalIdentidad(canal, byRole);
                  const col = canal === 'general' ? '#00e5a0' : (ROLE_COLOR[CHANNEL_ROLE[canal]] || '#7a95aa');
                  return canal === 'general'
                    ? <><span className="text-lg">💬</span><p className="text-sm font-semibold text-[#dde6ef]">General</p></>
                    : <><Avatar name={info.titulo} photo={info.member?.photo_url} color={col} size={32} /><p className="text-sm font-semibold text-[#dde6ef] truncate">{info.titulo}</p></>;
                })()}
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {msgs.length === 0 && <p className="text-xs text-[#3d5870] text-center mt-8">Aún no hay mensajes. Escribe el primero.</p>}
                {msgs.map(m => {
                  const mine = m.author_id === me;
                  const rol = m.author_role === 'admin' ? 'doctor' : (m.author_role || '');
                  const color = ROLE_COLOR[rol] || '#7a95aa';
                  const perfil = m.author_id ? byId[m.author_id] : undefined;
                  const nombre = perfil?.display_name || m.author_name || ROLE_LABEL[rol] || 'Alguien';
                  return (
                    <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                      {!mine && <Avatar name={nombre} photo={perfil?.photo_url} color={color} size={28} />}
                      <div className="max-w-[76%]">
                        {!mine && (
                          <p className="text-[10px] mb-0.5" style={{ color }}>
                            {nombre} · {ROLE_LABEL[rol] || ''}
                          </p>
                        )}
                        <div className="rounded-2xl px-3 py-2 text-sm"
                          style={{ background: mine ? '#00e5a0' : '#111820', color: mine ? '#000' : '#dde6ef' }}>
                          {m.content}
                        </div>
                        <p className="text-[9px] text-[#3d5870] mt-0.5" style={{ textAlign: mine ? 'right' : 'left' }}>
                          {new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="p-2.5 border-t border-[#1e2d3d] flex gap-2">
                <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()}
                  placeholder="Escribe un mensaje…"
                  className="flex-1 bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2 text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0]" />
                <button onClick={enviar} className="px-3.5 rounded-xl font-bold" style={{ background: '#00e5a0', color: '#000' }}>↑</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
