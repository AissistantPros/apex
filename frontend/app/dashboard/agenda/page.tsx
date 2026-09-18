'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '@/app/lib/auth';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const HOUR_PX = 54, SNAP = 5;
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const ESTADO: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Agendada', color: '#0ea5e9' },
  confirmed: { label: 'Confirmada', color: '#00e5a0' },
  arrived:   { label: 'En sala', color: '#f59e0b' },
  done:      { label: 'Atendida', color: '#7a95aa' },
  cancelled: { label: 'Cancelada', color: '#f43f5e' },
  no_show:   { label: 'No asistió', color: '#f43f5e' },
};
const inp = 'w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870]';

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}
async function api(path: string, opts: RequestInit = {}) {
  let r: Response;
  try {
    r = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
  }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Tu sesión expiró. Cierra sesión y vuelve a entrar.');
    throw new Error(d.detail || `Ocurrió un problema (error ${r.status}).`);
  }
  return r.json();
}

function monday(d: Date) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const minToHM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const wdOf = (d: Date) => (d.getDay() + 6) % 7; // Lun=0

type Appt = { id: string; starts_at: string; ends_at?: string; location_id?: string; doctor_id?: string; patient_name?: string; patient_phone?: string; reason?: string; notes?: string; status: string };
type Block = { id: string; starts_at: string; ends_at: string; location_id?: string; reason?: string; all_day?: boolean };
type Loc = { id: string; name: string; color?: string };
type Ctx = { locations: Loc[]; doctors: { id: string; display_name: string }[]; role: string; can_manage: boolean; hours: Record<string, { weekday: number; open_min: number; close_min: number }[]> };

export default function AgendaPage() {
  const [wkStart, setWkStart] = useState(() => monday(new Date()));
  const [appts, setAppts] = useState<Appt[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [fLoc, setFLoc] = useState('');
  const [fDoc, setFDoc] = useState('');
  const [blockMode, setBlockMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState<any>(null);
  const [hoursModal, setHoursModal] = useState(false);
  const [sel, setSel] = useState<{ day: string; a: number; b: number } | null>(null);
  const dragRef = useRef<{ day: Date; startY: number; col: HTMLElement } | null>(null);
  // Arrastre de citas (mover como Google Calendar)
  const gridRef = useRef<HTMLDivElement>(null);
  const [move, setMove] = useState<{ appt: Appt; offsetMin: number } | null>(null);
  const [preview, setPreview] = useState<{ di: number; startMin: number; ok: boolean } | null>(null);
  const apptMovedRef = useRef(false);
  const [confirmMove, setConfirmMove] = useState<{ appt: Appt; day: Date; startMin: number } | null>(null);
  const flash = (t: string, ms = 3500) => { setMsg(t); setTimeout(() => setMsg(''), ms); };

  const days7 = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(wkStart); d.setDate(d.getDate() + i); return d; }), [wkStart]);

  useEffect(() => { api('/appointments/context').then(setCtx).catch(e => flash(e.message)); }, []);

  const load = useCallback(async () => {
    try {
      const desde = new Date(wkStart).toISOString();
      const hasta = new Date(new Date(wkStart).setDate(wkStart.getDate() + 7)).toISOString();
      const qs = new URLSearchParams({ desde, hasta });
      if (fLoc) qs.set('location_id', fLoc);
      if (fDoc) qs.set('doctor_id', fDoc);
      const d = await api(`/appointments?${qs.toString()}`);
      setAppts(d.appointments || []); setBlocks(d.blocks || []);
    } catch (e: any) { flash(e.message); }
  }, [wkStart, fLoc, fDoc]);
  useEffect(() => { load(); }, [load]);

  // Horarios visibles según la(s) sede(s) seleccionada(s)
  const scopeHours = useMemo(() => {
    if (!ctx) return [] as { weekday: number; open_min: number; close_min: number }[];
    const locs = fLoc ? [fLoc] : ctx.locations.map(l => l.id);
    const out: { weekday: number; open_min: number; close_min: number }[] = [];
    locs.forEach(id => (ctx.hours[id] || []).forEach(h => out.push(h)));
    return out;
  }, [ctx, fLoc]);

  const openWeekdays = useMemo(() => new Set(scopeHours.map(h => h.weekday)), [scopeHours]);
  const days = useMemo(() => days7.filter(d => openWeekdays.has(wdOf(d))), [days7, openWeekdays]);
  const [minH, maxH] = useMemo(() => {
    if (!scopeHours.length) return [8, 20];
    const mn = Math.min(...scopeHours.map(h => h.open_min));
    const mx = Math.max(...scopeHours.map(h => h.close_min));
    return [Math.floor(mn / 60), Math.ceil(mx / 60)];
  }, [scopeHours]);
  const hoursRows = useMemo(() => Array.from({ length: Math.max(1, maxH - minH) }, (_, i) => minH + i), [minH, maxH]);
  const gridH = (maxH - minH) * HOUR_PX;

  // Intervalos abiertos de un día concreto (unión de sedes del scope)
  const openIntervals = useCallback((day: Date) => {
    const wd = wdOf(day);
    return scopeHours.filter(h => h.weekday === wd).map(h => [h.open_min, h.close_min] as [number, number]);
  }, [scopeHours]);

  // Traduce un punto del cursor a {columna(día), minuto del día}
  const pointToTime = useCallback((clientX: number, clientY: number) => {
    const el = gridRef.current; if (!el || !days.length) return null;
    const rect = el.getBoundingClientRect();
    const colW = (rect.width - 56) / days.length;
    let di = Math.floor((clientX - rect.left - 56) / colW);
    di = Math.max(0, Math.min(days.length - 1, di));
    let min = minH * 60 + ((clientY - rect.top) / HOUR_PX) * 60;
    min = Math.max(minH * 60, Math.min(maxH * 60, Math.round(min / SNAP) * SNAP));
    return { di, min };
  }, [days, minH, maxH]);

  const apptDur = (a: Appt) => a.ends_at ? Math.round((+new Date(a.ends_at) - +new Date(a.starts_at)) / 60000) : 20;

  // ¿Se puede colocar la cita en ese día/minuto? (dentro del horario, sin choques)
  const canPlace = useCallback((appt: Appt, day: Date, startMin: number) => {
    const dur = apptDur(appt);
    const endMin = startMin + dur;
    const intervals = openIntervals(day);
    if (!intervals.some(([o, c]) => startMin >= o && endMin <= c)) return false;
    const start = new Date(day); start.setHours(0, 0, 0, 0); start.setMinutes(startMin);
    const end = new Date(+start + dur * 60000);
    for (const a of appts) {
      if (a.id === appt.id || a.status === 'cancelled' || !a.ends_at) continue;
      const same = (appt.doctor_id && a.doctor_id === appt.doctor_id) || (appt.location_id && a.location_id === appt.location_id);
      if (same && start < new Date(a.ends_at) && end > new Date(a.starts_at)) return false;
    }
    for (const b of blocks) {
      if (appt.location_id && b.location_id && b.location_id !== appt.location_id) continue;
      if (start < new Date(b.ends_at) && end > new Date(b.starts_at)) return false;
    }
    return true;
  }, [appts, blocks, openIntervals]);

  const startMoveAppt = (a: Appt, e: React.MouseEvent) => {
    const pt = pointToTime(e.clientX, e.clientY);
    const s = new Date(a.starts_at);
    const apptStartMin = s.getHours() * 60 + s.getMinutes();
    setMove({ appt: a, offsetMin: pt ? pt.min - apptStartMin : 0 });
    apptMovedRef.current = false;
  };

  const doMove = async () => {
    if (!confirmMove) return;
    const { appt, day, startMin } = confirmMove;
    const dur = apptDur(appt);
    const start = new Date(day); start.setHours(0, 0, 0, 0); start.setMinutes(startMin);
    const end = new Date(+start + dur * 60000);
    try {
      await api(`/appointments/${appt.id}`, { method: 'PUT', body: JSON.stringify({
        starts_at: start.toISOString(), ends_at: end.toISOString(),
        location_id: appt.location_id, doctor_id: appt.doctor_id }) });
      setConfirmMove(null); load();
    } catch (e: any) { setConfirmMove(null); flash(e.message); }
  };

  const locColor = (id?: string) => ctx?.locations.find(l => l.id === id)?.color || '#0ea5e9';
  const docName = (id?: string) => ctx?.doctors.find(d => d.id === id)?.display_name || '';
  const yToMin = (col: HTMLElement, clientY: number) => {
    const rect = col.getBoundingClientRect();
    const m = minH * 60 + ((clientY - rect.top) / HOUR_PX) * 60;
    return Math.max(minH * 60, Math.min(maxH * 60, Math.round(m / SNAP) * SNAP));
  };

  // ── Drag para seleccionar rango ──
  const onDown = (day: Date, e: React.MouseEvent) => {
    const col = e.currentTarget as HTMLElement;
    const y = yToMin(col, e.clientY);
    dragRef.current = { day, startY: y, col };
    setSel({ day: ymd(day), a: y, b: y + (blockMode ? 30 : 20) });
  };
  const onMove = (e: React.MouseEvent) => {
    if (move) {
      const pt = pointToTime(e.clientX, e.clientY);
      if (!pt) return;
      const startMin = Math.round((pt.min - move.offsetMin) / SNAP) * SNAP;
      apptMovedRef.current = true;
      setPreview({ di: pt.di, startMin, ok: canPlace(move.appt, days[pt.di], startMin) });
      return;
    }
    if (!dragRef.current) return;
    const y = yToMin(dragRef.current.col, e.clientY);
    const a = Math.min(dragRef.current.startY, y), b = Math.max(dragRef.current.startY, y);
    setSel({ day: ymd(dragRef.current.day), a, b: Math.max(b, a + SNAP) });
  };
  const onUp = async () => {
    if (move) {
      const m = move; const p = preview; setMove(null); setPreview(null);
      if (apptMovedRef.current && p) {
        if (!p.ok) { flash('No es posible mover la cita a ese horario (fuera de horario o se empalma con otra cita/bloqueo).'); }
        else setConfirmMove({ appt: m.appt, day: days[p.di], startMin: p.startMin });
      }
      return;
    }
    const d = dragRef.current; dragRef.current = null;
    if (!d || !sel) return;
    const dur = Math.max(SNAP, sel.b - sel.a);
    const day = d.day;
    const start = new Date(day); start.setHours(0, 0, 0, 0); start.setMinutes(sel.a);
    const end = new Date(day); end.setHours(0, 0, 0, 0); end.setMinutes(sel.a + (dur < SNAP * 2 ? 20 : dur));
    if (blockMode) {
      const reason = prompt('Bloquear este horario. Razón (opcional):', '') ?? '';
      try {
        await api('/appointments/blocks', { method: 'POST', body: JSON.stringify({
          starts_at: start.toISOString(), ends_at: end.toISOString(),
          location_id: fLoc || null, reason,
        }) });
        setSel(null); load();
      } catch (e: any) { flash(e.message); setSel(null); }
    } else {
      openCreateRange(start, end);
      setSel(null);
    }
  };

  const openCreateRange = (start: Date, end: Date) => {
    const dur = Math.max(20, Math.round((+end - +start) / 60000));
    setModal({ mode: 'create', fecha: ymd(start), hora: hm(start), dur,
      doctor_id: fDoc || ctx?.doctors[0]?.id || '', location_id: fLoc || ctx?.locations[0]?.id || '',
      patient_name: '', patient_phone: '', patient_email: '', reason: '', notes: '', status: 'scheduled',
      notify_email: false, notify_whatsapp: false });
  };
  const openEdit = (a: Appt) => {
    const s = new Date(a.starts_at);
    const dur = a.ends_at ? Math.round((+new Date(a.ends_at) - +s) / 60000) : 20;
    setModal({ mode: 'edit', id: a.id, fecha: ymd(s), hora: hm(s), dur,
      doctor_id: a.doctor_id || '', location_id: a.location_id || '',
      patient_name: a.patient_name || '', patient_phone: a.patient_phone || '', patient_email: (a as any).patient_email || '',
      reason: a.reason || '', notes: a.notes || '', status: a.status,
      notify_email: (a as any).notify_email || false, notify_whatsapp: (a as any).notify_whatsapp || false });
  };

  const blockWholeDay = async (day: Date) => {
    if (!ctx?.can_manage) return;
    const reason = prompt(`Bloquear todo el ${DIAS_LARGO[wdOf(day)]} ${day.getDate()}. Razón (opcional):`, '') ?? '';
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = new Date(day); end.setHours(23, 59, 0, 0);
    try {
      await api('/appointments/blocks', { method: 'POST', body: JSON.stringify({
        starts_at: start.toISOString(), ends_at: end.toISOString(), all_day: true, location_id: fLoc || null, reason }) });
      load();
    } catch (e: any) { flash(e.message); }
  };
  const delBlock = async (b: Block) => {
    if (!ctx?.can_manage) return;
    if (!confirm('¿Quitar este bloqueo?')) return;
    try { await api(`/appointments/blocks/${b.id}`, { method: 'DELETE' }); load(); } catch (e: any) { flash(e.message); }
  };

  const save = async () => {
    const m = modal;
    if (!m.patient_name.trim()) return flash('Escribe el nombre del paciente');
    if (!m.location_id) return flash('Elige la ubicación de la cita');
    const start = new Date(`${m.fecha}T${m.hora}`);
    const end = new Date(+start + m.dur * 60000);
    const payload = {
      starts_at: start.toISOString(), ends_at: end.toISOString(),
      location_id: m.location_id, doctor_id: m.doctor_id || null,
      patient_id: m.patient_id || null, patient_name: m.patient_name, patient_phone: m.patient_phone,
      patient_email: m.patient_email, reason: m.reason, notes: m.notes, status: m.status,
      notify_email: m.notify_email, notify_whatsapp: m.notify_whatsapp,
    };
    try {
      if (m.mode === 'create') await api('/appointments', { method: 'POST', body: JSON.stringify(payload) });
      else await api(`/appointments/${m.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setModal(null); load();
    } catch (e: any) {
      // Choque de horario → 409: se muestra dentro del modal y NO se guarda.
      setModal({ ...m, error: e.message });
    }
  };
  const cancelar = async () => {
    if (!confirm('¿Cancelar esta cita?')) return;
    try { await api(`/appointments/${modal.id}`, { method: 'DELETE' }); setModal(null); load(); } catch (e: any) { flash(e.message); }
  };

  const today = ymd(new Date());
  const colW = days.length ? `repeat(${days.length}, 1fr)` : '1fr';

  return (
    <div className="min-h-screen bg-[#070a0e]" onMouseUp={onUp} onMouseMove={onMove}>
      <main className="page-content pt-16 px-4 sm:px-6 py-6 max-w-[1100px] mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h1 className="text-2xl font-serif font-semibold text-[#dde6ef]">📅 Agenda</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setWkStart(w => { const x = new Date(w); x.setDate(x.getDate() - 7); return x; })} className="px-2.5 py-1.5 rounded-lg bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef]">‹</button>
            <button onClick={() => setWkStart(monday(new Date()))} className="px-3 py-1.5 rounded-lg bg-[#0d1520] border border-[#1e2d3d] text-[#00e5a0] text-sm">Hoy</button>
            <button onClick={() => setWkStart(w => { const x = new Date(w); x.setDate(x.getDate() + 7); return x; })} className="px-2.5 py-1.5 rounded-lg bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef]">›</button>
          </div>
          <span className="text-sm text-[#7a95aa]">{days7[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – {days7[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <div className="flex-1" />
          {ctx && ctx.locations.length > 0 && (
            <select value={fLoc} onChange={e => setFLoc(e.target.value)} className="px-3 py-1.5 rounded-lg bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef] text-sm">
              <option value="">Todas las sedes</option>
              {ctx.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {ctx && ctx.doctors.length > 1 && (
            <select value={fDoc} onChange={e => setFDoc(e.target.value)} className="px-3 py-1.5 rounded-lg bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef] text-sm">
              <option value="">Todos los doctores</option>
              {ctx.doctors.map(d => <option key={d.id} value={d.id}>{d.display_name}</option>)}
            </select>
          )}
          {ctx?.can_manage && (
            <>
              <button onClick={() => setBlockMode(v => !v)} className="px-3 py-1.5 rounded-lg text-sm font-semibold border transition"
                style={{ background: blockMode ? '#f43f5e' : '#0d1520', borderColor: blockMode ? '#f43f5e' : '#1e2d3d', color: blockMode ? '#fff' : '#f43f5e' }}>
                {blockMode ? '● Modo bloqueo ON' : 'Bloquear horarios'}
              </button>
              <button onClick={() => setHoursModal(true)} className="px-3 py-1.5 rounded-lg bg-[#0d1520] border border-[#1e2d3d] text-[#7a95aa] text-sm">⚙ Horario</button>
            </>
          )}
          <button onClick={() => openCreateRange(new Date(), new Date(Date.now() + 20 * 60000))} className="px-4 py-1.5 rounded-lg text-sm font-semibold" style={{ background: '#00e5a0', color: '#000' }}>+ Cita</button>
        </div>

        {/* Leyenda de sedes */}
        {ctx && ctx.locations.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-3">
            {ctx.locations.map(l => (
              <span key={l.id} className="flex items-center gap-1.5 text-[11px] text-[#7a95aa]">
                <span className="w-3 h-3 rounded-full" style={{ background: l.color || '#0ea5e9' }} />{l.name}
              </span>
            ))}
          </div>
        )}
        {blockMode && <p className="text-[12px] text-[#f43f5e] mb-2">Modo bloqueo: arrastra sobre un horario para bloquearlo, o toca el encabezado de un día para bloquearlo completo.</p>}
        {msg && <div className="mb-3 text-sm px-4 py-2 rounded-lg bg-[rgba(244,63,94,.1)] border border-[#f43f5e44] text-[#f43f5e]">{msg}</div>}

        {days.length === 0 ? (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-8 text-center text-[#7a95aa]">
            No hay horario de consultas configurado para esta semana.
            {ctx?.can_manage && <button onClick={() => setHoursModal(true)} className="block mx-auto mt-3 px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#00e5a0', color: '#000' }}>Configurar horario</button>}
          </div>
        ) : (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-x-auto select-none">
            <div style={{ minWidth: 120 + days.length * 110 }}>
              {/* Encabezado */}
              <div className="grid" style={{ gridTemplateColumns: `56px ${colW}` }}>
                <div className="border-b border-r border-[#1e2d3d]" />
                {days.map((d, i) => (
                  <div key={i} onClick={() => blockMode && blockWholeDay(d)}
                    className={`border-b border-r border-[#1e2d3d] px-2 py-2 text-center ${blockMode ? 'cursor-pointer hover:bg-[#f43f5e]/10' : ''}`}>
                    <p className="text-[11px] text-[#7a95aa]">{DIAS[wdOf(d)]}</p>
                    <p className="text-sm font-semibold" style={{ color: ymd(d) === today ? '#00e5a0' : '#dde6ef' }}>{d.getDate()}</p>
                  </div>
                ))}
              </div>
              {/* Rejilla */}
              <div ref={gridRef} className="grid relative" style={{ gridTemplateColumns: `56px ${colW}` }}>
                <div>{hoursRows.map(h => <div key={h} className="border-r border-b border-[#1e2d3d] text-[10px] text-[#7a95aa] pr-1 text-right" style={{ height: HOUR_PX }}>{pad(h)}:00</div>)}</div>
                {days.map((day, di) => {
                  const intervals = openIntervals(day);
                  return (
                    <div key={di} className="relative border-r border-[#1e2d3d]" style={{ height: gridH }}
                      onMouseDown={e => onDown(day, e)}>
                      {/* líneas de hora */}
                      {hoursRows.map(h => <div key={h} className="border-b border-[#1e2d3d]" style={{ height: HOUR_PX }} />)}
                      {/* zonas cerradas (fuera del horario) en gris */}
                      <ClosedOverlays minH={minH} maxH={maxH} intervals={intervals} />
                      {/* selección en curso */}
                      {sel && sel.day === ymd(day) && (
                        <div className="absolute left-0.5 right-0.5 rounded-md pointer-events-none"
                          style={{ top: (sel.a - minH * 60) / 60 * HOUR_PX, height: Math.max(6, (sel.b - sel.a) / 60 * HOUR_PX), background: blockMode ? 'rgba(244,63,94,.35)' : 'rgba(0,229,160,.3)', border: `1px dashed ${blockMode ? '#f43f5e' : '#00e5a0'}` }} />
                      )}
                      {/* bloqueos */}
                      {blocks.filter(b => ymd(new Date(b.starts_at)) === ymd(day)).map(b => {
                        const s = new Date(b.starts_at), e = new Date(b.ends_at);
                        const top = ((s.getHours() + s.getMinutes() / 60) - minH) * HOUR_PX;
                        const height = Math.max(10, ((+e - +s) / 3600000) * HOUR_PX);
                        return (
                          <div key={b.id} onMouseDown={ev => ev.stopPropagation()} onClick={() => delBlock(b)}
                            title={ctx?.can_manage ? 'Clic para quitar el bloqueo' : ''}
                            className="absolute left-0.5 right-0.5 rounded-md overflow-hidden cursor-pointer"
                            style={{ top: Math.max(0, top), height, background: 'repeating-linear-gradient(45deg,#f43f5e22,#f43f5e22 6px,#0d152080 6px,#0d152080 12px)', border: '1px solid #f43f5e55' }}>
                            <p className="text-[9px] text-[#f43f5e] px-1 pt-0.5 truncate">🚫 {b.reason || 'Bloqueado'}</p>
                          </div>
                        );
                      })}
                      {/* citas */}
                      {appts.filter(a => ymd(new Date(a.starts_at)) === ymd(day) && a.status !== 'cancelled').map(a => {
                        const s = new Date(a.starts_at);
                        const durMin = a.ends_at ? (+new Date(a.ends_at) - +s) / 60000 : 20;
                        const top = ((s.getHours() + s.getMinutes() / 60) - minH) * HOUR_PX;
                        const height = Math.max(18, (durMin / 60) * HOUR_PX - 2);
                        const col = locColor(a.location_id);
                        return (
                          <button key={a.id}
                            onMouseDown={e => { e.stopPropagation(); startMoveAppt(a, e); }}
                            onClick={e => { e.stopPropagation(); if (apptMovedRef.current) { apptMovedRef.current = false; return; } openEdit(a); }}
                            className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-left overflow-hidden"
                            style={{ top, height, background: col + '2e', borderLeft: `3px solid ${col}`, opacity: move?.appt.id === a.id ? 0.35 : 1, cursor: 'grab' }}>
                            <p className="text-[10px] font-semibold text-[#dde6ef] truncate leading-tight">{hm(s)} {a.patient_name}</p>
                            {height > 28 && <p className="text-[9px] text-[#7a95aa] truncate">{docName(a.doctor_id) || a.reason || ''}</p>}
                          </button>
                        );
                      })}
                      {/* Fantasma de la cita mientras se arrastra */}
                      {move && preview && preview.di === di && (() => {
                        const dur = apptDur(move.appt);
                        const top = (preview.startMin - minH * 60) / 60 * HOUR_PX;
                        const h = Math.max(18, dur / 60 * HOUR_PX - 2);
                        const col = preview.ok ? '#00e5a0' : '#f43f5e';
                        return (
                          <div className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 pointer-events-none z-10"
                            style={{ top, height: h, background: col + '33', border: `1.5px solid ${col}` }}>
                            <p className="text-[10px] font-semibold truncate leading-tight" style={{ color: col }}>
                              {minToHM(preview.startMin)} {move.appt.patient_name}
                            </p>
                            {!preview.ok && <p className="text-[8px] text-[#f43f5e]">no disponible</p>}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <p className="text-[11px] text-[#3d5870] mt-2">Arrastra para elegir el horario de una cita. Toca una cita para editarla.</p>
      </main>

      {/* Confirmar mover cita */}
      {confirmMove && (() => {
        const fmt = (d: Date) => d.toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
        const oldD = new Date(confirmMove.appt.starts_at);
        const newD = new Date(confirmMove.day); newD.setHours(0, 0, 0, 0); newD.setMinutes(confirmMove.startMin);
        return (
          <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4" onClick={() => setConfirmMove(null)}>
            <div className="bg-[#0d1520] border border-[#00e5a0]/40 rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <p className="text-3xl text-center mb-2">🔄</p>
              <p className="text-center text-[#dde6ef] text-sm leading-relaxed">
                ¿Quieres cambiar la cita de <b>{confirmMove.appt.patient_name}</b><br />
                del <span className="text-[#7a95aa]">{fmt(oldD)}</span><br />
                al <span className="text-[#00e5a0] font-semibold">{fmt(newD)}</span>?
              </p>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setConfirmMove(null)} className="flex-1 py-2.5 rounded-lg text-sm text-[#7a95aa] border border-[#1e2d3d]">No, dejar igual</button>
                <button onClick={doMove} className="flex-1 py-2.5 rounded-lg text-sm font-bold" style={{ background: '#00e5a0', color: '#000' }}>Sí, cambiar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {modal && <ApptModal ctx={ctx} modal={modal} setModal={setModal} onSave={save} onCancel={cancelar} />}
      {hoursModal && ctx && <HoursModal ctx={ctx} onClose={() => setHoursModal(false)} onSaved={async () => { setHoursModal(false); setCtx(await api('/appointments/context')); }} flash={flash} />}
    </div>
  );
}

// Zonas cerradas (gris) fuera de los intervalos abiertos del día
function ClosedOverlays({ minH, maxH, intervals }: { minH: number; maxH: number; intervals: [number, number][] }) {
  const segs: [number, number][] = [];
  let cursor = minH * 60;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  for (const [o, c] of sorted) { if (o > cursor) segs.push([cursor, o]); cursor = Math.max(cursor, c); }
  if (cursor < maxH * 60) segs.push([cursor, maxH * 60]);
  if (!intervals.length) segs.length = 0, segs.push([minH * 60, maxH * 60]);
  return (<>{segs.map(([a, b], i) => (
    <div key={i} className="absolute left-0 right-0 pointer-events-none"
      style={{ top: (a - minH * 60) / 60 * HOUR_PX, height: (b - a) / 60 * HOUR_PX, background: 'rgba(7,10,14,.55)' }} />
  ))}</>);
}

// ── Modal de cita (con autocompletar paciente + choque) ──
function ApptModal({ ctx, modal, setModal, onSave, onCancel }: { ctx: Ctx | null; modal: any; setModal: (m: any) => void; onSave: () => void; onCancel: () => void }) {
  const [sug, setSug] = useState<any[]>([]);
  const [openSug, setOpenSug] = useState(false);
  const tRef = useRef<any>(null);
  const searchPatient = (q: string) => {
    setModal({ ...modal, patient_name: q, patient_id: null, error: '' });
    clearTimeout(tRef.current);
    if (q.trim().length < 2) { setSug([]); return; }
    tRef.current = setTimeout(async () => {
      try { const r = await api(`/appointments/patient-search?q=${encodeURIComponent(q)}`); setSug(r.results || []); setOpenSug(true); } catch { /* */ }
    }, 250);
  };
  const pick = (p: any) => {
    setModal({ ...modal, patient_name: p.full_name, patient_id: p.id, patient_phone: p.phone || modal.patient_phone, patient_email: p.email || modal.patient_email });
    setOpenSug(false);
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={() => setModal(null)}>
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <p className="font-semibold text-[#dde6ef] mb-3">{modal.mode === 'create' ? 'Nueva cita' : 'Editar cita'}</p>
        <div className="space-y-2.5">
          <div className="relative">
            <input className={inp} placeholder="Nombre del paciente (busca si ya existe)" value={modal.patient_name}
              onChange={e => searchPatient(e.target.value)} onFocus={() => sug.length && setOpenSug(true)} />
            {openSug && sug.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-[#111820] border border-[#1e2d3d] rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                {sug.map(p => (
                  <button key={p.id} onClick={() => pick(p)} className="w-full text-left px-3 py-2 hover:bg-[#0d1520] text-sm text-[#dde6ef]">
                    {p.full_name} <span className="text-[11px] text-[#7a95aa]">{p.phone || ''}</span>
                  </button>
                ))}
              </div>
            )}
            {modal.patient_id && <p className="text-[10px] text-[#00e5a0] mt-1">✓ Paciente existente — datos vinculados</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inp} placeholder="Teléfono" value={modal.patient_phone} onChange={e => setModal({ ...modal, patient_phone: e.target.value })} />
            <input className={inp} placeholder="Correo" value={modal.patient_email} onChange={e => setModal({ ...modal, patient_email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[10px] text-[#7a95aa] uppercase">Fecha</label><input type="date" className={inp} value={modal.fecha} onChange={e => setModal({ ...modal, fecha: e.target.value, error: '' })} /></div>
            <div><label className="text-[10px] text-[#7a95aa] uppercase">Hora</label><input type="time" className={inp} value={modal.hora} onChange={e => setModal({ ...modal, hora: e.target.value, error: '' })} /></div>
          </div>
          <div>
            <label className="text-[10px] text-[#7a95aa] uppercase">Duración</label>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {[15, 20, 25, 30].map(d => (
                <button key={d} onClick={() => setModal({ ...modal, dur: d, error: '' })}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition"
                  style={{ background: modal.dur === d ? '#00e5a0' : '#111820', borderColor: modal.dur === d ? '#00e5a0' : '#2a3a4d', color: modal.dur === d ? '#000' : '#dde6ef' }}>{d}m</button>
              ))}
              <input type="number" min={5} step={5} value={modal.dur} onChange={e => setModal({ ...modal, dur: Math.max(5, +e.target.value || 20), error: '' })}
                className="w-20 px-2 py-1.5 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-xs" />
              <span className="text-[11px] text-[#7a95aa]">min</span>
            </div>
          </div>
          {ctx && ctx.doctors.length > 0 && (
            <div><label className="text-[10px] text-[#7a95aa] uppercase">Doctor</label>
              <select className={inp} value={modal.doctor_id} onChange={e => setModal({ ...modal, doctor_id: e.target.value, error: '' })}>
                <option value="">— Sin asignar —</option>
                {ctx.doctors.map(d => <option key={d.id} value={d.id}>{d.display_name}</option>)}
              </select></div>
          )}
          <div><label className="text-[10px] text-[#7a95aa] uppercase">Ubicación *</label>
            <select className={inp} value={modal.location_id} onChange={e => setModal({ ...modal, location_id: e.target.value, error: '' })}>
              <option value="">— Elige la sede —</option>
              {ctx?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></div>
          <input className={inp} placeholder="Motivo (opcional)" value={modal.reason} onChange={e => setModal({ ...modal, reason: e.target.value })} />
          <textarea className={inp} placeholder="Notas (opcional)" rows={2} value={modal.notes} onChange={e => setModal({ ...modal, notes: e.target.value })} />
          <div className="flex flex-wrap gap-3 pt-1">
            <label className="flex items-center gap-1.5 text-[12px] text-[#dde6ef] cursor-pointer">
              <input type="checkbox" checked={modal.notify_email} onChange={e => setModal({ ...modal, notify_email: e.target.checked })} /> Avisar por correo</label>
            <label className="flex items-center gap-1.5 text-[12px] text-[#dde6ef] cursor-pointer">
              <input type="checkbox" checked={modal.notify_whatsapp} onChange={e => setModal({ ...modal, notify_whatsapp: e.target.checked })} /> Avisar por WhatsApp</label>
          </div>
          <p className="text-[10px] text-[#3d5870]">El envío de avisos se activa cuando conectemos correo/WhatsApp; por ahora queda registrada la intención.</p>
          {modal.mode === 'edit' && (
            <div><label className="text-[10px] text-[#7a95aa] uppercase">Estado</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(ESTADO).map(([k, v]) => (
                  <button key={k} onClick={() => setModal({ ...modal, status: k })} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition"
                    style={{ background: modal.status === k ? v.color : '#111820', borderColor: modal.status === k ? v.color : '#2a3a4d', color: modal.status === k ? '#000' : '#dde6ef' }}>{v.label}</button>
                ))}
              </div></div>
          )}
          {modal.error && <p className="text-[13px] text-[#f43f5e] bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-lg px-3 py-2">⚠️ {modal.error}</p>}
        </div>
        <div className="flex gap-2 mt-4">
          {modal.mode === 'edit' && <button onClick={onCancel} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[#f43f5e] border border-[#f43f5e]/40">Cancelar cita</button>}
          <div className="flex-1" />
          <button onClick={() => setModal(null)} className="px-4 py-2.5 rounded-lg text-sm text-[#7a95aa]">Cerrar</button>
          <button onClick={onSave} className="px-5 py-2.5 rounded-lg text-sm font-bold" style={{ background: '#00e5a0', color: '#000' }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de horario de consultas ──
function HoursModal({ ctx, onClose, onSaved, flash }: { ctx: Ctx; onClose: () => void; onSaved: () => void; flash: (t: string) => void }) {
  const [locId, setLocId] = useState(ctx.locations[0]?.id || '');
  // Estado por día: {abierto, m_o, m_c, t_o, t_c}
  const build = (id: string) => {
    const hrs = ctx.hours[id] || [];
    return Array.from({ length: 7 }, (_, wd) => {
      const rs = hrs.filter(h => h.weekday === wd).sort((a, b) => a.open_min - b.open_min);
      return {
        abierto: rs.length > 0,
        m_o: minToHM(rs[0]?.open_min ?? 540), m_c: minToHM(rs[0]?.close_min ?? 840),
        t_o: rs[1] ? minToHM(rs[1].open_min) : '', t_c: rs[1] ? minToHM(rs[1].close_min) : '',
      };
    });
  };
  const [rows, setRows] = useState(() => build(locId));
  useEffect(() => { setRows(build(locId)); }, [locId]); // eslint-disable-line
  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const save = async () => {
    const ranges: any[] = [];
    rows.forEach((r, wd) => {
      if (!r.abierto) return;
      if (r.m_o && r.m_c) ranges.push({ weekday: wd, open_min: toMin(r.m_o), close_min: toMin(r.m_c) });
      if (r.t_o && r.t_c) ranges.push({ weekday: wd, open_min: toMin(r.t_o), close_min: toMin(r.t_c) });
    });
    try { await api('/appointments/hours', { method: 'PUT', body: JSON.stringify({ location_id: locId, ranges }) }); onSaved(); }
    catch (e: any) { flash(e.message); }
  };
  const upd = (wd: number, k: string, v: any) => setRows(rs => rs.map((r, i) => i === wd ? { ...r, [k]: v } : r));
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <p className="font-semibold text-[#dde6ef] mb-1">⚙ Horario de consultas</p>
        <p className="text-[11px] text-[#7a95aa] mb-3">El calendario solo muestra los días y horas que definas aquí.</p>
        {ctx.locations.length > 1 && (
          <select value={locId} onChange={e => setLocId(e.target.value)} className={`${inp} mb-3`}>
            {ctx.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <div className="space-y-1.5">
          {rows.map((r, wd) => (
            <div key={wd} className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 w-24 shrink-0 text-sm text-[#dde6ef]">
                <input type="checkbox" checked={r.abierto} onChange={e => upd(wd, 'abierto', e.target.checked)} />{DIAS_LARGO[wd].slice(0, 3)}
              </label>
              {r.abierto ? (
                <div className="flex items-center gap-1 flex-wrap text-[11px]">
                  <input type="time" value={r.m_o} onChange={e => upd(wd, 'm_o', e.target.value)} className="px-1.5 py-1 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef]" />
                  <span className="text-[#7a95aa]">–</span>
                  <input type="time" value={r.m_c} onChange={e => upd(wd, 'm_c', e.target.value)} className="px-1.5 py-1 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef]" />
                  <span className="text-[#3d5870] mx-1">y</span>
                  <input type="time" value={r.t_o} onChange={e => upd(wd, 't_o', e.target.value)} className="px-1.5 py-1 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef]" placeholder="tarde" />
                  <span className="text-[#7a95aa]">–</span>
                  <input type="time" value={r.t_c} onChange={e => upd(wd, 't_c', e.target.value)} className="px-1.5 py-1 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef]" />
                </div>
              ) : <span className="text-[12px] text-[#3d5870]">Cerrado</span>}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-[#7a95aa]">Cerrar</button>
          <button onClick={save} className="px-5 py-2.5 rounded-lg text-sm font-bold" style={{ background: '#00e5a0', color: '#000' }}>Guardar horario</button>
        </div>
      </div>
    </div>
  );
}
