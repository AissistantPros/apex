'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
const ROLE_COLOR: Record<string, string> = { doctor: '#a78bfa', receptionist: '#0ea5e9', nurse: '#f97316' };

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}

type Msg = { id: string; canal: string; author_id?: string; author_name?: string; author_role?: string; content: string; created_at: string };

export default function TeamChat() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [canal, setCanal] = useState('general');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [me, setMe] = useState('');
  const [unread, setUnread] = useState<Record<string, number>>({});
  const lastSeenRef = useRef<string>(new Date(Date.now() - 86400000).toISOString());
  const bottomRef = useRef<HTMLDivElement>(null);

  // Solo recepción, enfermería y médico participan
  useEffect(() => {
    const r = getRole();
    setEnabled(['doctor', 'receptionist', 'nurse'].includes(r));
  }, []);

  const cargar = useCallback(async (c: string) => {
    try {
      const r = await fetch(`${B()}/messages?canal=${c}`, { headers: await authHeaders() });
      if (!r.ok) return;
      const d = await r.json();
      setMsgs(d.messages || []); setMe(d.me || '');
    } catch { /* silencioso */ }
  }, []);

  // Polling de mensajes del canal abierto
  useEffect(() => {
    if (!enabled || !open) return;
    cargar(canal);
    const t = setInterval(() => cargar(canal), 4000);
    return () => clearInterval(t);
  }, [enabled, open, canal, cargar]);

  // Polling del badge de no leídos (aunque esté cerrado)
  useEffect(() => {
    if (!enabled) return;
    const poll = async () => {
      try {
        const r = await fetch(`${B()}/messages/unread?after=${encodeURIComponent(lastSeenRef.current)}`, { headers: await authHeaders() });
        if (r.ok) setUnread((await r.json()).counts || {});
      } catch { /* */ }
    };
    poll();
    const t = setInterval(poll, 8000);
    return () => clearInterval(t);
  }, [enabled]);

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
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  return (
    <>
      {/* Botón flotante */}
      <button onClick={() => setOpen(o => !o)}
        className="fixed z-[90] bottom-5 left-5 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition"
        style={{ background: '#00e5a0', color: '#000' }} title="Chat del equipo">
        <span className="text-2xl">{open ? '×' : '💬'}</span>
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#f43f5e] text-white text-[11px] font-bold flex items-center justify-center">{totalUnread}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed z-[90] bottom-24 left-5 w-[min(92vw,380px)] h-[min(70vh,540px)] bg-[#0d1520] border border-[#1e2d3d] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2d3d]">
            <p className="text-sm font-semibold text-[#dde6ef]">Chat del equipo</p>
            <p className="text-[11px] text-[#7a95aa]">Recepción · Enfermería · Médico</p>
          </div>

          {/* Canales */}
          <div className="flex gap-1 px-2 py-2 border-b border-[#1e2d3d] overflow-x-auto">
            {CANALES.map(c => (
              <button key={c.id} onClick={() => setCanal(c.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition relative"
                style={{ background: canal === c.id ? '#00e5a0' : '#111820', color: canal === c.id ? '#000' : '#7a95aa' }}>
                {c.icon} {c.label}
                {canal !== c.id && unread[c.id] > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#f43f5e]" />
                )}
              </button>
            ))}
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {msgs.length === 0 && <p className="text-xs text-[#3d5870] text-center mt-8">Sin mensajes en este canal.</p>}
            {msgs.map(m => {
              const mine = m.author_id === me;
              const color = ROLE_COLOR[m.author_role || ''] || '#7a95aa';
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%]">
                    {!mine && (
                      <p className="text-[10px] mb-0.5" style={{ color }}>
                        {m.author_name || ROLE_LABEL[m.author_role || ''] || 'Alguien'} · {ROLE_LABEL[m.author_role || ''] || ''}
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

          {/* Input */}
          <div className="p-2.5 border-t border-[#1e2d3d] flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()}
              placeholder={`Mensaje a ${CANALES.find(c => c.id === canal)?.label}…`}
              className="flex-1 bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2 text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0]" />
            <button onClick={enviar} className="px-3.5 rounded-xl font-bold" style={{ background: '#00e5a0', color: '#000' }}>↑</button>
          </div>
        </div>
      )}
    </>
  );
}
