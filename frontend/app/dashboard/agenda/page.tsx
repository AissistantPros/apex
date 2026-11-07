'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '@/app/lib/auth';
import { mix } from '@/app/lib/ui';
import Icon from '@/app/components/Icon';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const HOUR_PX = 60; // 1 hora = 60px (1px por minuto exacto, estilo Google Calendar)
const SNAP = 5;     // Salto a 5 minutos
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const ESTADO: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Agendada', color: '#38bdf8' },
  confirmed: { label: 'Confirmada', color: '#00e5a0' },
  arrived:   { label: 'En sala', color: '#f59e0b' },
  done:      { label: 'Atendida', color: '#94a3b8' },
  cancelled: { label: 'Cancelada', color: '#f43f5e' },
  no_show:   { label: 'No asistió', color: '#f43f5e' },
};
const inp = 'w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870]';

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

function monday(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function firstOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const minToHM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const wdOf = (d: Date) => (d.getDay() + 6) % 7; // Lun=0

type Appt = {
  id: string;
  starts_at: string;
  ends_at?: string;
  location_id?: string;
  doctor_id?: string;
  patient_name?: string;
  patient_phone?: string;
  patient_email?: string;
  reason?: string;
  notes?: string;
  status: string;
  notify_email?: boolean;
  notify_whatsapp?: boolean;
};
type Block = { id: string; starts_at: string; ends_at: string; location_id?: string; reason?: string; all_day?: boolean };
type Loc = { id: string; name: string; color?: string };
type Ctx = {
  locations: Loc[];
  doctors: { id: string; display_name: string }[];
  role: string;
  can_manage: boolean;
  hours: Record<string, { weekday: number; open_min: number; close_min: number }[]>;
};

export default function AgendaPage() {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [wkStart, setWkStart] = useState(() => monday(new Date()));
  const [monthStart, setMonthStart] = useState(() => firstOfMonth(new Date()));
  const [appts, setAppts] = useState<Appt[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [fLoc, setFLoc] = useState('');
  const [fDoc, setFDoc] = useState('');
  const [blockMode, setBlockMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState<any>(null); // Slide panel derecho para editar/crear
  const [hoursModal, setHoursModal] = useState(false);

  // Selección de rango arrastrando sobre slots vacíos
  const [sel, setSel] = useState<{ day: string; a: number; b: number } | null>(null);
  const dragRef = useRef<{ day: Date; startY: number; col: HTMLElement } | null>(null);

  // Arrastre fluido estilo Google Calendar
  const gridRef = useRef<HTMLDivElement>(null);
  const chipDragRef = useRef<{
    appt: Appt;
    startX: number;
    startY: number;
    moved: boolean;
    offsetMin: number;
  } | null>(null);
  const [move, setMove] = useState<{ appt: Appt; offsetMin: number } | null>(null);
  const [preview, setPreview] = useState<{ di: number; startMin: number; ok: boolean } | null>(null);

  // Reloj en vivo para indicador de hora actual
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const flash = (t: string, ms = 3800) => {
    setMsg(t);
    setTimeout(() => setMsg(''), ms);
  };

  const days7 = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(wkStart);
    d.setDate(d.getDate() + i);
    return d;
  }), [wkStart]);

  // Celdas del calendario mensual (6 semanas completas)
  const monthCells = useMemo(() => {
    const startGrid = monday(monthStart);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(startGrid);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [monthStart]);

  useEffect(() => {
    api('/appointments/context').then(setCtx).catch(e => flash(e.message));
  }, []);

  const load = useCallback(async () => {
    try {
      let desde: string;
      let hasta: string;
      if (viewMode === 'month') {
        const startGrid = monday(monthStart);
        const endGrid = new Date(startGrid);
        endGrid.setDate(endGrid.getDate() + 42);
        desde = startGrid.toISOString();
        hasta = endGrid.toISOString();
      } else {
        desde = new Date(wkStart).toISOString();
        hasta = new Date(new Date(wkStart).setDate(wkStart.getDate() + 7)).toISOString();
      }
      const qs = new URLSearchParams({ desde, hasta });
      if (fLoc) qs.set('location_id', fLoc);
      if (fDoc) qs.set('doctor_id', fDoc);
      const d = await api(`/appointments?${qs.toString()}`);
      setAppts(d.appointments || []);
      setBlocks(d.blocks || []);
    } catch (e: any) {
      flash(e.message);
    }
  }, [viewMode, wkStart, monthStart, fLoc, fDoc]);

  useEffect(() => {
    load();
  }, [load]);

  // Tecla Escape cierra el panel lateral
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal) setModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  // Horarios visibles según la(s) sede(s) seleccionada(s)
  const scopeHours = useMemo(() => {
    if (!ctx) return [] as { weekday: number; open_min: number; close_min: number }[];
    const locs = fLoc ? [fLoc] : ctx.locations.map(l => l.id);
    const out: { weekday: number; open_min: number; close_min: number }[] = [];
    locs.forEach(id => (ctx.hours[id] || []).forEach(h => out.push(h)));
    return out;
  }, [ctx, fLoc]);

  const openWeekdays = useMemo(() => new Set(scopeHours.map(h => h.weekday)), [scopeHours]);
  const days = useMemo(() => {
    if (openWeekdays.size === 0) return days7;
    const filtered = days7.filter(d => openWeekdays.has(wdOf(d)));
    return filtered.length > 0 ? filtered : days7;
  }, [days7, openWeekdays]);

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

  // Traduce coordenadas del cursor a {columna(día), minuto del día}
  const pointToTime = useCallback((clientX: number, clientY: number) => {
    const el = gridRef.current;
    if (!el || !days.length) return null;
    const rect = el.getBoundingClientRect();
    const timeGutterW = 60;
    const colW = (rect.width - timeGutterW) / days.length;
    let di = Math.floor((clientX - rect.left - timeGutterW) / colW);
    di = Math.max(0, Math.min(days.length - 1, di));
    let min = minH * 60 + ((clientY - rect.top) / HOUR_PX) * 60;
    min = Math.max(minH * 60, Math.min(maxH * 60, Math.round(min / SNAP) * SNAP));
    return { di, min };
  }, [days, minH, maxH]);

  const apptDur = (a: Appt) => (a.ends_at ? Math.round((+new Date(a.ends_at) - +new Date(a.starts_at)) / 60000) : 30);

  // ¿Se puede colocar la cita en ese día/minuto? (dentro del horario, sin choques)
  const canPlace = useCallback((appt: Appt, day: Date, startMin: number) => {
    const dur = apptDur(appt);
    const endMin = startMin + dur;
    const intervals = openIntervals(day);
    if (!intervals.some(([o, c]) => startMin >= o && endMin <= c)) return false;
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(startMin);
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

  // Inicia preparación para mover o hacer clic en una cita
  const startMoveAppt = (a: Appt, e: React.MouseEvent) => {
    e.stopPropagation();
    const pt = pointToTime(e.clientX, e.clientY);
    const s = new Date(a.starts_at);
    const apptStartMin = s.getHours() * 60 + s.getMinutes();
    chipDragRef.current = {
      appt: a,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      offsetMin: pt ? pt.min - apptStartMin : 0,
    };
  };

  // Mover instantáneamente estilo Google Calendar (optimista)
  const doMoveInstant = async (appt: Appt, day: Date, startMin: number) => {
    const dur = apptDur(appt);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(startMin);
    const end = new Date(+start + dur * 60000);

    const oldStarts = appt.starts_at;
    const oldEnds = appt.ends_at;

    // Actualización optimista inmediata
    setAppts(prev =>
      prev.map(a =>
        a.id === appt.id
          ? { ...a, starts_at: start.toISOString(), ends_at: end.toISOString() }
          : a
      )
    );
    flash(`Cita de ${appt.patient_name} movida al ${DIAS_LARGO[wdOf(day)]} ${day.getDate()} a las ${minToHM(startMin)}.`);

    try {
      await api(`/appointments/${appt.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          location_id: appt.location_id,
          doctor_id: appt.doctor_id,
        }),
      });
      load();
    } catch (e: any) {
      // Revertir optimismo si falla
      setAppts(prev =>
        prev.map(a => (a.id === appt.id ? { ...a, starts_at: oldStarts, ends_at: oldEnds } : a))
      );
      flash(`No se pudo mover: ${e.message}`, 4500);
    }
  };

  const locColor = (id?: string) => ctx?.locations.find(l => l.id === id)?.color || 'var(--c-blue)';
  const docName = (id?: string) => ctx?.doctors.find(d => d.id === id)?.display_name || '';

  const yToMin = (col: HTMLElement, clientY: number) => {
    const rect = col.getBoundingClientRect();
    const m = minH * 60 + ((clientY - rect.top) / HOUR_PX) * 60;
    return Math.max(minH * 60, Math.min(maxH * 60, Math.round(m / SNAP) * SNAP));
  };

  // Drag para seleccionar rango en vacío
  const onDown = (day: Date, e: React.MouseEvent) => {
    const col = e.currentTarget as HTMLElement;
    const y = yToMin(col, e.clientY);
    dragRef.current = { day, startY: y, col };
    setSel({ day: ymd(day), a: y, b: y + (blockMode ? 30 : 30) });
  };

  const onMove = (e: React.MouseEvent) => {
    if (chipDragRef.current) {
      const dist = Math.hypot(e.clientX - chipDragRef.current.startX, e.clientY - chipDragRef.current.startY);
      if (dist > 6) {
        chipDragRef.current.moved = true;
        setMove({ appt: chipDragRef.current.appt, offsetMin: chipDragRef.current.offsetMin });
        const pt = pointToTime(e.clientX, e.clientY);
        if (pt) {
          const startMin = Math.round((pt.min - chipDragRef.current.offsetMin) / SNAP) * SNAP;
          setPreview({ di: pt.di, startMin, ok: canPlace(chipDragRef.current.appt, days[pt.di], startMin) });
        }
      }
      return;
    }

    if (!dragRef.current) return;
    const y = yToMin(dragRef.current.col, e.clientY);
    const a = Math.min(dragRef.current.startY, y),
      b = Math.max(dragRef.current.startY, y);
    setSel({ day: ymd(dragRef.current.day), a, b: Math.max(b, a + SNAP) });
  };

  const onUp = async () => {
    if (chipDragRef.current) {
      const dragInfo = chipDragRef.current;
      chipDragRef.current = null;
      const p = preview;
      setMove(null);
      setPreview(null);

      if (!dragInfo.moved) {
        // Clic simple: abrir el panel slide para editar la cita
        openEdit(dragInfo.appt);
        return;
      }

      if (p) {
        if (!p.ok) {
          flash('No es posible mover la cita a ese horario (fuera de horario o conflicto con otra cita/bloqueo).');
        } else {
          await doMoveInstant(dragInfo.appt, days[p.di], p.startMin);
        }
      }
      return;
    }

    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !sel) return;
    const dur = Math.max(SNAP, sel.b - sel.a);
    const day = d.day;
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(sel.a);
    const end = new Date(day);
    end.setHours(0, 0, 0, 0);
    end.setMinutes(sel.a + (dur < SNAP * 2 ? 30 : dur));

    if (blockMode) {
      const reason = prompt('Bloquear este horario. Razón (opcional):', '') ?? '';
      try {
        await api('/appointments/blocks', {
          method: 'POST',
          body: JSON.stringify({
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            location_id: fLoc || null,
            reason,
          }),
        });
        setSel(null);
        load();
      } catch (e: any) {
        flash(e.message);
        setSel(null);
      }
    } else {
      openCreateRange(start, end);
      setSel(null);
    }
  };

  const openCreateRange = (start: Date, end: Date) => {
    const dur = Math.max(15, Math.round((+end - +start) / 60000));
    setModal({
      mode: 'create',
      fecha: ymd(start),
      hora: hm(start),
      dur,
      doctor_id: fDoc || ctx?.doctors[0]?.id || '',
      location_id: fLoc || ctx?.locations[0]?.id || '',
      patient_name: '',
      patient_phone: '',
      patient_email: '',
      reason: '',
      notes: '',
      status: 'scheduled',
      notify_email: false,
      notify_whatsapp: false,
    });
  };

  const openEdit = (a: Appt) => {
    const s = new Date(a.starts_at);
    const dur = a.ends_at ? Math.round((+new Date(a.ends_at) - +s) / 60000) : 30;
    setModal({
      mode: 'edit',
      id: a.id,
      fecha: ymd(s),
      hora: hm(s),
      dur,
      doctor_id: a.doctor_id || '',
      location_id: a.location_id || '',
      patient_name: a.patient_name || '',
      patient_phone: a.patient_phone || '',
      patient_email: a.patient_email || '',
      reason: a.reason || '',
      notes: a.notes || '',
      status: a.status,
      notify_email: a.notify_email || false,
      notify_whatsapp: a.notify_whatsapp || false,
    });
  };

  const blockWholeDay = async (day: Date) => {
    if (!ctx?.can_manage) return;
    const reason = prompt(`Bloquear todo el ${DIAS_LARGO[wdOf(day)]} ${day.getDate()}. Razón (opcional):`, '') ?? '';
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 0, 0);
    try {
      await api('/appointments/blocks', {
        method: 'POST',
        body: JSON.stringify({
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          all_day: true,
          location_id: fLoc || null,
          reason,
        }),
      });
      load();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const delBlock = async (b: Block) => {
    if (!ctx?.can_manage) return;
    if (!confirm('¿Quitar este bloqueo?')) return;
    try {
      await api(`/appointments/blocks/${b.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const save = async () => {
    const m = modal;
    if (!m.patient_name.trim()) return flash('Escribe el nombre del paciente');
    if (!m.location_id) return flash('Elige la ubicación de la cita');
    const start = new Date(`${m.fecha}T${m.hora}`);
    const end = new Date(+start + m.dur * 60000);
    const payload = {
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      location_id: m.location_id,
      doctor_id: m.doctor_id || null,
      patient_id: m.patient_id || null,
      patient_name: m.patient_name,
      patient_phone: m.patient_phone,
      patient_email: m.patient_email,
      reason: m.reason,
      notes: m.notes,
      status: m.status,
      notify_email: m.notify_email,
      notify_whatsapp: m.notify_whatsapp,
    };
    try {
      if (m.mode === 'create') await api('/appointments', { method: 'POST', body: JSON.stringify(payload) });
      else await api(`/appointments/${m.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setModal(null);
      load();
      flash(m.mode === 'create' ? 'Cita agendada con éxito.' : 'Cambios guardados con éxito.');
    } catch (e: any) {
      setModal({ ...m, error: e.message });
    }
  };

  const cancelar = async () => {
    if (!confirm('¿Cancelar esta cita?')) return;
    try {
      await api(`/appointments/${modal.id}`, { method: 'DELETE' });
      setModal(null);
      load();
      flash('Cita cancelada.');
    } catch (e: any) {
      flash(e.message);
    }
  };

  const today = ymd(now);
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const colW = days.length ? `repeat(${days.length}, minmax(130px, 1fr))` : '1fr';

  return (
    <div className="min-h-screen bg-[#070a0e] flex flex-col" onMouseUp={onUp} onMouseMove={onMove}>
      <main className="page-content pt-16 px-4 sm:px-6 pb-6 w-full flex-1 flex flex-col">
        {/* Cabecera Principal Estandarizada */}
        <div className="pb-3 border-b border-[#1e2d3d]/60 mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#dde6ef]">Agenda</h1>
            <p className="text-xs sm:text-sm text-[#7a95aa] mt-1">Calendario de consultas y citas médicas</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de vista: Semana | Mes */}
            <div className="inline-flex rounded-xl bg-[#0d1520] border border-[#1e2d3d] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                style={{
                  background: viewMode === 'week' ? 'var(--c-green)' : 'transparent',
                  color: viewMode === 'week' ? 'var(--c-primary-fg)' : 'var(--c-text-2)',
                }}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => {
                  setMonthStart(firstOfMonth(wkStart));
                  setViewMode('month');
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                style={{
                  background: viewMode === 'month' ? 'var(--c-green)' : 'transparent',
                  color: viewMode === 'month' ? 'var(--c-primary-fg)' : 'var(--c-text-2)',
                }}
              >
                Mes
              </button>
            </div>

            {/* Configuración de horario y bloqueo */}
            {ctx?.can_manage && (
              <>
                <button
                  onClick={() => setBlockMode(v => !v)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer"
                  style={{
                    background: blockMode ? 'var(--c-red)' : 'var(--c-card)',
                    borderColor: blockMode ? 'var(--c-red)' : 'var(--c-border)',
                    color: blockMode ? '#fff' : 'var(--c-red)',
                  }}
                >
                  {blockMode ? '● Modo bloqueo ON' : 'Bloquear horarios'}
                </button>
                <button
                  onClick={() => setHoursModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#0d1520] border border-[#1e2d3d] text-[#7a95aa] hover:text-[#dde6ef] text-xs font-semibold transition cursor-pointer"
                >
                  Horario
                </button>
              </>
            )}

            {/* Botón "+ Nueva cita" */}
            <button
              onClick={() => openCreateRange(new Date(), new Date(Date.now() + 30 * 60000))}
              className="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              style={{ background: 'var(--c-green)', color: 'var(--c-green-fg)' }}
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>Nueva cita</span>
            </button>
          </div>
        </div>

        {/* Barra de navegación estilo Google Calendar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (viewMode === 'week') setWkStart(monday(new Date()));
                else setMonthStart(firstOfMonth(new Date()));
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef] text-xs font-semibold hover:border-[#00e5a0] transition cursor-pointer"
            >
              Hoy
            </button>
            <div className="inline-flex rounded-xl bg-[#0d1520] border border-[#1e2d3d] p-0.5">
              <button
                onClick={() => {
                  if (viewMode === 'week') setWkStart(w => { const x = new Date(w); x.setDate(x.getDate() - 7); return x; });
                  else setMonthStart(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
                }}
                className="p-1.5 rounded-lg text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
                title="Anterior"
              >
                <Icon name="back" size={16} />
              </button>
              <button
                onClick={() => {
                  if (viewMode === 'week') setWkStart(w => { const x = new Date(w); x.setDate(x.getDate() + 7); return x; });
                  else setMonthStart(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
                }}
                className="p-1.5 rounded-lg text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
                title="Siguiente"
              >
                <span className="rotate-180 inline-block"><Icon name="back" size={16} /></span>
              </button>
            </div>

            <span className="text-base sm:text-lg font-semibold text-[#dde6ef] capitalize ml-1">
              {viewMode === 'week' ? (
                `${days7[0].toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`
              ) : (
                `${monthStart.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`
              )}
            </span>
            {viewMode === 'week' && (
              <span className="text-xs text-[#7a95aa] hidden sm:inline-block">
                ({days7[0].getDate()} – {days7[6].getDate()} de {days7[6].toLocaleDateString('es-MX', { month: 'short' })})
              </span>
            )}
          </div>

          {/* Filtros sedes y doctores */}
          <div className="flex flex-wrap items-center gap-2">
            {ctx && ctx.locations.length > 0 && (
              <select
                value={fLoc}
                onChange={e => setFLoc(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef] text-xs font-medium outline-none focus:border-[#00e5a0] cursor-pointer"
              >
                <option value="">Todas las sedes</option>
                {ctx.locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            )}
            {ctx && ctx.doctors.length > 1 && (
              <select
                value={fDoc}
                onChange={e => setFDoc(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef] text-xs font-medium outline-none focus:border-[#00e5a0] cursor-pointer"
              >
                <option value="">Todos los doctores</option>
                {ctx.doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.display_name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Leyenda de sedes */}
        {ctx && ctx.locations.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {ctx.locations.map(l => (
              <span key={l.id} className="flex items-center gap-1.5 text-[11px] text-[#7a95aa]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color || 'var(--c-blue)' }} />
                <span>{l.name}</span>
              </span>
            ))}
          </div>
        )}

        {blockMode && (
          <p className="text-xs text-[#f43f5e] mb-3 bg-[#f43f5e]/10 border border-[#f43f5e]/30 px-3 py-2 rounded-xl">
            Modo bloqueo activo: arrastra sobre cualquier franja horaria para bloquearla, o haz clic en el encabezado de un día para bloquear el día completo.
          </p>
        )}

        {msg && (
          <div className="mb-3 text-xs sm:text-sm px-4 py-2.5 rounded-xl bg-[#00e5a0]/15 border border-[#00e5a0]/40 text-[#00e5a0] flex items-center justify-between animate-in fade-in">
            <span>{msg}</span>
            <button onClick={() => setMsg('')} className="font-bold text-base leading-none text-[#00e5a0] ml-3">×</button>
          </div>
        )}

        {/* CONTENEDOR FLEX: CALENDARIO (FLEX-1) + SLIDE PANEL DERECHO QUE COMPACTA */}
        <div className="flex-1 flex min-h-0 gap-4 overflow-hidden relative">
          {/* 1. Calendario: se compacta suavemente con transition */}
          <div className="flex-1 min-w-0 flex flex-col transition-all duration-300 ease-in-out overflow-hidden">
            {viewMode === 'month' ? (
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden select-none flex-1 flex flex-col">
                {/* Encabezado Lun - Dom */}
                <div className="grid grid-cols-7 border-b border-[#1e2d3d] bg-[#111820]">
                  {DIAS.map((d, i) => (
                    <div key={i} className="py-2.5 text-center text-xs font-mono font-semibold text-[#7a95aa] border-r last:border-r-0 border-[#1e2d3d]">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Cuadrícula de 6 semanas (42 días) */}
                <div className="grid grid-cols-7 flex-1">
                  {monthCells.map((day, idx) => {
                    const dayStr = ymd(day);
                    const inMonth = day.getMonth() === monthStart.getMonth();
                    const isToday = dayStr === today;
                    const dayAppts = appts
                      .filter(a => ymd(new Date(a.starts_at)) === dayStr && a.status !== 'cancelled')
                      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
                    const dayBlocks = blocks.filter(b => ymd(new Date(b.starts_at)) === dayStr);

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (blockMode) {
                            blockWholeDay(day);
                            return;
                          }
                          const start = new Date(day);
                          start.setHours(9, 0, 0, 0);
                          const end = new Date(+start + 30 * 60000);
                          openCreateRange(start, end);
                        }}
                        className={`min-h-[105px] border-b border-r border-[#1e2d3d] p-1.5 flex flex-col gap-1 cursor-pointer hover:bg-[#111820]/70 transition ${
                          !inMonth ? 'opacity-35 bg-[#070a0e]/40' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setWkStart(monday(day));
                              setViewMode('week');
                            }}
                            title="Ver semana a detalle"
                            className="text-xs font-bold px-1.5 py-0.5 rounded-md hover:underline"
                            style={{
                              background: isToday ? 'var(--c-green)' : 'transparent',
                              color: isToday ? 'var(--c-primary-fg)' : 'var(--c-text)',
                            }}
                          >
                            {day.getDate()}
                          </button>
                          {dayAppts.length > 0 && (
                            <span className="text-[10px] font-mono text-[#7a95aa]">
                              {dayAppts.length} cita{dayAppts.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {dayBlocks.length > 0 && (
                          <div className="text-[9px] px-1.5 py-0.5 rounded bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30 truncate">
                            Bloqueado {dayBlocks[0].reason ? `· ${dayBlocks[0].reason}` : ''}
                          </div>
                        )}
                        <div className="space-y-1 overflow-y-auto max-h-[76px]">
                          {dayAppts.slice(0, 3).map(a => {
                            const s = new Date(a.starts_at);
                            const col = locColor(a.location_id);
                            return (
                              <button
                                key={a.id}
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  openEdit(a);
                                }}
                                className="w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate block hover:brightness-110 transition"
                                style={{
                                  background: mix(col, 20),
                                  borderLeft: `3px solid ${col}`,
                                  color: '#dde6ef',
                                }}
                              >
                                <span className="font-mono text-[9px] opacity-80">{hm(s)}</span> {a.patient_name}
                              </button>
                            );
                          })}
                          {dayAppts.length > 3 && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setWkStart(monday(day));
                                setViewMode('week');
                              }}
                              className="text-[10px] font-mono text-[#00e5a0] hover:underline pl-1"
                            >
                              +{dayAppts.length - 3} más →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : days.length === 0 ? (
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-8 text-center text-[#7a95aa]">
                No hay horario de consultas configurado para esta semana.
                {ctx?.can_manage && (
                  <button
                    onClick={() => setHoursModal(true)}
                    className="block mx-auto mt-3 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
                    style={{ background: 'var(--c-green)', color: 'var(--c-primary-fg)' }}
                  >
                    Configurar horario
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-x-auto select-none flex-1 flex flex-col">
                <div style={{ minWidth: 60 + days.length * 130 }} className="flex-1 flex flex-col">
                  {/* Encabezado estilo Google Calendar (LUN 10 con círculo para hoy) */}
                  <div className="grid border-b border-[#1e2d3d] bg-[#111820]" style={{ gridTemplateColumns: `60px ${colW}` }}>
                    <div className="border-r border-[#1e2d3d] flex items-center justify-center text-[10px] font-mono text-[#7a95aa]">
                      GMT
                    </div>
                    {days.map((d, i) => {
                      const isToday = ymd(d) === today;
                      return (
                        <div
                          key={i}
                          onClick={() => blockMode && blockWholeDay(d)}
                          className={`border-r last:border-r-0 border-[#1e2d3d] py-2 px-1 text-center select-none ${
                            blockMode ? 'cursor-pointer hover:bg-[#f43f5e]/10' : ''
                          }`}
                        >
                          <p
                            className={`text-[11px] font-bold uppercase tracking-wider ${
                              isToday ? 'text-[#00e5a0]' : 'text-[#7a95aa]'
                            }`}
                          >
                            {DIAS[wdOf(d)]}
                          </p>
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center mx-auto mt-0.5 text-xs font-bold transition ${
                              isToday
                                ? 'bg-[#00e5a0] text-[#051b14] shadow-sm'
                                : 'text-[#dde6ef] hover:bg-[#162231]'
                            }`}
                          >
                            {d.getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Rejilla horaria semanal con scroll suave */}
                  <div ref={gridRef} className="grid relative flex-1" style={{ gridTemplateColumns: `60px ${colW}` }}>
                    {/* Columna izquierda de horas */}
                    <div className="select-none">
                      {hoursRows.map(h => (
                        <div
                          key={h}
                          className="border-r border-b border-[#1e2d3d] text-[10px] font-mono text-[#7a95aa] pr-2 text-right flex items-start justify-end pt-1"
                          style={{ height: HOUR_PX }}
                        >
                          {pad(h)}:00
                        </div>
                      ))}
                    </div>

                    {/* Columnas de cada día */}
                    {days.map((day, di) => {
                      const intervals = openIntervals(day);
                      const isToday = ymd(day) === today;

                      return (
                        <div
                          key={di}
                          className="relative border-r last:border-r-0 border-[#1e2d3d]"
                          style={{ height: gridH }}
                          onMouseDown={e => onDown(day, e)}
                        >
                          {/* Líneas de hora horizontales */}
                          {hoursRows.map(h => (
                            <div
                              key={h}
                              className="border-b border-[#1e2d3d]/50 relative"
                              style={{ height: HOUR_PX }}
                            >
                              {/* Línea sutil de media hora */}
                              <div
                                className="border-b border-[#1e2d3d]/20 absolute left-0 right-0 pointer-events-none"
                                style={{ top: HOUR_PX / 2 }}
                              />
                            </div>
                          ))}

                          {/* Zonas cerradas (fuera de horario de consulta) */}
                          <ClosedOverlays minH={minH} maxH={maxH} intervals={intervals} />

                          {/* Indicador de hora actual estilo Google Calendar (línea roja con punto pulsante) */}
                          {isToday && currentMin >= minH * 60 && currentMin <= maxH * 60 && (
                            <div
                              className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                              style={{ top: ((currentMin - minH * 60) / 60) * HOUR_PX }}
                            >
                              <div className="w-2.5 h-2.5 rounded-full bg-[#f43f5e] -ml-1.5 shadow-[0_0_8px_rgba(244,63,94,0.7)]" />
                              <div className="flex-1 h-[2px] bg-[#f43f5e]" />
                            </div>
                          )}

                          {/* Selección activa arrastrando en vacío */}
                          {sel && sel.day === ymd(day) && (
                            <div
                              className="absolute left-1 right-1 rounded-xl pointer-events-none z-10"
                              style={{
                                top: ((sel.a - minH * 60) / 60) * HOUR_PX,
                                height: Math.max(8, ((sel.b - sel.a) / 60) * HOUR_PX),
                                background: blockMode ? mix('var(--c-red)', 30) : mix('var(--c-green)', 25),
                                border: `1.5px dashed ${blockMode ? 'var(--c-red)' : 'var(--c-green)'}`,
                              }}
                            />
                          )}

                          {/* Bloqueos de agenda */}
                          {blocks
                            .filter(b => ymd(new Date(b.starts_at)) === ymd(day))
                            .map(b => {
                              const s = new Date(b.starts_at);
                              const e = new Date(b.ends_at);
                              const top = (s.getHours() + s.getMinutes() / 60 - minH) * HOUR_PX;
                              const height = Math.max(12, ((+e - +s) / 3600000) * HOUR_PX);
                              return (
                                <div
                                  key={b.id}
                                  onMouseDown={ev => ev.stopPropagation()}
                                  onClick={() => delBlock(b)}
                                  title={ctx?.can_manage ? 'Clic para quitar este bloqueo' : ''}
                                  className="absolute left-1 right-1 rounded-lg overflow-hidden cursor-pointer z-10"
                                  style={{
                                    top: Math.max(0, top),
                                    height,
                                    background:
                                      'repeating-linear-gradient(45deg,#f43f5e22,#f43f5e22 6px,#0d152080 6px,#0d152080 12px)',
                                    border: '1px solid #f43f5e55',
                                  }}
                                >
                                  <p className="text-[10px] font-semibold text-[#f43f5e] px-1.5 pt-0.5 truncate">
                                    {b.reason || 'Horario bloqueado'}
                                  </p>
                                </div>
                              );
                            })}

                          {/* Citas médicas (Chips interactivos estilo Google Calendar) */}
                          {appts
                            .filter(a => ymd(new Date(a.starts_at)) === ymd(day) && a.status !== 'cancelled')
                            .map(a => {
                              const s = new Date(a.starts_at);
                              const durMin = a.ends_at ? (+new Date(a.ends_at) - +s) / 60000 : 30;
                              const top = (s.getHours() + s.getMinutes() / 60 - minH) * HOUR_PX;
                              const height = Math.max(24, (durMin / 60) * HOUR_PX - 2);
                              const col = locColor(a.location_id);
                              const isSelected = modal?.id === a.id;
                              const isBeingDragged = move?.appt.id === a.id;
                              const stInfo = ESTADO[a.status] || { label: a.status, color: 'var(--c-text-2)' };

                              return (
                                <div
                                  key={a.id}
                                  onMouseDown={e => startMoveAppt(a, e)}
                                  className={`absolute left-1 right-1 rounded-xl px-2 py-1 text-left overflow-hidden cursor-grab active:cursor-grabbing transition-all select-none shadow-sm hover:brightness-110 ${
                                    isSelected ? 'ring-2 ring-[#00e5a0] shadow-md' : ''
                                  }`}
                                  style={{
                                    top,
                                    height,
                                    background: mix(col, 22),
                                    borderLeft: `4px solid ${col}`,
                                    opacity: isBeingDragged ? 0.35 : 1,
                                  }}
                                  title={`${hm(s)} – ${a.patient_name} (${stInfo.label})`}
                                >
                                  <div className="flex items-center justify-between gap-1 leading-tight">
                                    <span className="text-[11px] font-mono font-bold text-[#dde6ef]">
                                      {hm(s)}
                                    </span>
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ background: stInfo.color }}
                                      title={stInfo.label}
                                    />
                                  </div>
                                  <p className="text-xs font-semibold text-[#dde6ef] truncate leading-tight mt-0.5">
                                    {a.patient_name}
                                  </p>
                                  {height > 38 && (
                                    <p className="text-[10px] text-[#7a95aa] truncate leading-tight mt-0.5">
                                      {docName(a.doctor_id) || a.reason || 'Consulta'}
                                    </p>
                                  )}
                                </div>
                              );
                            })}

                          {/* Fantasma visual de la cita mientras se arrastra */}
                          {move && preview && preview.di === di && (() => {
                            const dur = apptDur(move.appt);
                            const top = ((preview.startMin - minH * 60) / 60) * HOUR_PX;
                            const h = Math.max(24, (dur / 60) * HOUR_PX - 2);
                            const col = preview.ok ? 'var(--c-green)' : 'var(--c-red)';
                            return (
                              <div
                                className="absolute left-1 right-1 rounded-xl px-2 py-1 pointer-events-none z-30 shadow-lg"
                                style={{
                                  top,
                                  height: h,
                                  background: mix(col, 30),
                                  border: `2px dashed ${col}`,
                                }}
                              >
                                <p className="text-[11px] font-mono font-bold truncate leading-tight" style={{ color: col }}>
                                  {minToHM(preview.startMin)} · {move.appt.patient_name}
                                </p>
                                <p className="text-[9px] font-semibold" style={{ color: col }}>
                                  {preview.ok ? 'Mover aquí' : 'Horario no disponible'}
                                </p>
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
            <p className="text-[11px] text-[#7a95aa] mt-2">
              Haz clic en cualquier cita para ver y editar sus detalles, o arrástrala para cambiarla de día y hora. Arrastra en un espacio vacío para crear una nueva cita.
            </p>
          </div>

          {/* 2. Slide Popup Derecho: compacto, NO tapa el calendario, lo contrae a la izquierda */}
          <aside
            className={`transition-all duration-300 ease-in-out shrink-0 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl flex flex-col overflow-hidden z-20 ${
              modal
                ? 'w-full sm:w-[400px] lg:w-[440px] opacity-100'
                : 'w-0 opacity-0 overflow-hidden pointer-events-none border-0 p-0 m-0'
            }`}
          >
            {modal && (
              <ApptSlidePanel
                ctx={ctx}
                modal={modal}
                setModal={setModal}
                onSave={save}
                onCancel={cancelar}
                onClose={() => setModal(null)}
              />
            )}
          </aside>
        </div>
      </main>

      {/* Modal de Horario de Consultas (Configuración Administrativa) */}
      {hoursModal && ctx && (
        <HoursModal
          ctx={ctx}
          onClose={() => setHoursModal(false)}
          onSaved={async () => {
            setHoursModal(false);
            setCtx(await api('/appointments/context'));
          }}
          flash={flash}
        />
      )}
    </div>
  );
}

// Zonas cerradas (gris) fuera de los intervalos abiertos del día
function ClosedOverlays({ minH, maxH, intervals }: { minH: number; maxH: number; intervals: [number, number][] }) {
  const segs: [number, number][] = [];
  let cursor = minH * 60;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  for (const [o, c] of sorted) {
    if (o > cursor) segs.push([cursor, o]);
    cursor = Math.max(cursor, c);
  }
  if (cursor < maxH * 60) segs.push([cursor, maxH * 60]);
  if (!intervals.length) {
    segs.length = 0;
    segs.push([minH * 60, maxH * 60]);
  }
  return (
    <>
      {segs.map(([a, b], i) => (
        <div
          key={i}
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: ((a - minH * 60) / 60) * HOUR_PX,
            height: ((b - a) / 60) * HOUR_PX,
            background: 'color-mix(in srgb, var(--c-text-3) 14%, transparent)',
          }}
        />
      ))}
    </>
  );
}

// ── Panel Lateral Derecho de Cita (Slide Popup compacto) ──
function ApptSlidePanel({
  ctx,
  modal,
  setModal,
  onSave,
  onCancel,
  onClose,
}: {
  ctx: Ctx | null;
  modal: any;
  setModal: (m: any) => void;
  onSave: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const [sug, setSug] = useState<any[]>([]);
  const [openSug, setOpenSug] = useState(false);
  const tRef = useRef<any>(null);

  const searchPatient = (q: string) => {
    setModal({ ...modal, patient_name: q, patient_id: null, error: '' });
    clearTimeout(tRef.current);
    if (q.trim().length < 2) {
      setSug([]);
      return;
    }
    tRef.current = setTimeout(async () => {
      try {
        const r = await api(`/appointments/patient-search?q=${encodeURIComponent(q)}`);
        setSug(r.results || []);
        setOpenSug(true);
      } catch {
        /* error silencioso */
      }
    }, 200);
  };

  const pick = (p: any) => {
    setModal({
      ...modal,
      patient_name: p.full_name,
      patient_id: p.id,
      patient_phone: p.phone || modal.patient_phone,
      patient_email: p.email || modal.patient_email,
    });
    setOpenSug(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1520]">
      {/* Cabecera del Panel */}
      <div className="p-4 border-b border-[#1e2d3d] flex items-center justify-between gap-3 bg-[#111820]/60 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#00e5a0]/15 text-[#00e5a0]">
            <Icon name="calendar" size={17} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#dde6ef]">
              {modal.mode === 'create' ? 'Nueva Cita' : 'Detalles de la Cita'}
            </h2>
            <p className="text-[11px] text-[#7a95aa]">
              {modal.mode === 'create' ? 'Programa una atención médica' : 'Edita o gestiona la cita'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
          title="Cerrar panel (Esc)"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {/* Contenido del Formulario */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Paciente y Contacto */}
        <div className="space-y-2.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
            Paciente *
          </label>
          <div className="relative">
            <input
              className={inp}
              placeholder="Escribe el nombre del paciente (busca existente)"
              value={modal.patient_name}
              onChange={e => searchPatient(e.target.value)}
              onFocus={() => sug.length > 0 && setOpenSug(true)}
            />
            {openSug && sug.length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-[#111820] border border-[#1e2d3d] rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                {sug.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pick(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-[#162231] text-xs text-[#dde6ef] border-b last:border-b-0 border-[#1e2d3d]/50 flex items-center justify-between"
                  >
                    <span className="font-semibold">{p.full_name}</span>
                    <span className="text-[11px] text-[#7a95aa] font-mono">{p.phone || p.email || ''}</span>
                  </button>
                ))}
              </div>
            )}
            {modal.patient_id && (
              <p className="text-[10px] text-[#00e5a0] mt-1 flex items-center gap-1">
                <span>✓</span> Paciente registrado en el sistema
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa]">Teléfono</label>
              <input
                className={inp}
                placeholder="Teléfono"
                value={modal.patient_phone || ''}
                onChange={e => setModal({ ...modal, patient_phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa]">Correo</label>
              <input
                className={inp}
                placeholder="Correo"
                value={modal.patient_email || ''}
                onChange={e => setModal({ ...modal, patient_email: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Fecha y Horario */}
        <div className="space-y-2.5 pt-2 border-t border-[#1e2d3d]/60">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
            Fecha y Horario *
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[#7a95aa]">Fecha</label>
              <input
                type="date"
                className={inp}
                value={modal.fecha}
                onChange={e => setModal({ ...modal, fecha: e.target.value, error: '' })}
              />
            </div>
            <div>
              <label className="text-[10px] text-[#7a95aa]">Hora de inicio</label>
              <input
                type="time"
                className={inp}
                value={modal.hora}
                onChange={e => setModal({ ...modal, hora: e.target.value, error: '' })}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-[#7a95aa]">Duración</label>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {[15, 20, 30, 45, 60].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setModal({ ...modal, dur: d, error: '' })}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer"
                  style={{
                    background: modal.dur === d ? 'var(--c-green)' : '#111820',
                    borderColor: modal.dur === d ? 'var(--c-green)' : '#1e2d3d',
                    color: modal.dur === d ? 'var(--c-primary-fg)' : '#dde6ef',
                  }}
                >
                  {d}m
                </button>
              ))}
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={modal.dur}
                  onChange={e => setModal({ ...modal, dur: Math.max(5, +e.target.value || 20), error: '' })}
                  className="w-16 px-2 py-1.5 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-xs text-center outline-none focus:border-[#00e5a0]"
                />
                <span className="text-[11px] text-[#7a95aa]">min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Doctor y Sede */}
        <div className="space-y-2.5 pt-2 border-t border-[#1e2d3d]/60">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
            Profesional y Sede *
          </label>
          {ctx && ctx.doctors.length > 0 && (
            <div>
              <label className="text-[10px] text-[#7a95aa]">Médico / Especialista</label>
              <select
                className={inp}
                value={modal.doctor_id}
                onChange={e => setModal({ ...modal, doctor_id: e.target.value, error: '' })}
              >
                <option value="">— Sin asignar —</option>
                {ctx.doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.display_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-[10px] text-[#7a95aa]">Sede / Consultorio *</label>
            <select
              className={inp}
              value={modal.location_id}
              onChange={e => setModal({ ...modal, location_id: e.target.value, error: '' })}
            >
              <option value="">— Elige la sede —</option>
              {ctx?.locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Motivo y Notas */}
        <div className="space-y-2.5 pt-2 border-t border-[#1e2d3d]/60">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
            Detalles de la Consulta
          </label>
          <input
            className={inp}
            placeholder="Motivo de la cita (ej. Primera consulta, Revisión)"
            value={modal.reason || ''}
            onChange={e => setModal({ ...modal, reason: e.target.value })}
          />
          <textarea
            className={inp}
            placeholder="Notas internas del consultorio o recepción..."
            rows={2}
            value={modal.notes || ''}
            onChange={e => setModal({ ...modal, notes: e.target.value })}
          />
        </div>

        {/* Estado de la cita (solo en modo edición) */}
        {modal.mode === 'edit' && (
          <div className="space-y-2 pt-2 border-t border-[#1e2d3d]/60">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
              Estado de la Cita
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ESTADO).map(([k, v]) => {
                const active = modal.status === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setModal({ ...modal, status: k })}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5"
                    style={{
                      background: active ? v.color : '#111820',
                      borderColor: active ? v.color : '#1e2d3d',
                      color: active ? '#051b14' : '#dde6ef',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: active ? '#051b14' : v.color }}
                    />
                    <span>{v.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Notificaciones */}
        <div className="space-y-1.5 pt-2 border-t border-[#1e2d3d]/60">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
            Notificaciones al Paciente
          </label>
          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-[#dde6ef] cursor-pointer">
              <input
                type="checkbox"
                checked={modal.notify_whatsapp || false}
                onChange={e => setModal({ ...modal, notify_whatsapp: e.target.checked })}
                className="accent-[#25D366]"
              />
              <span>Avisar por WhatsApp</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#dde6ef] cursor-pointer">
              <input
                type="checkbox"
                checked={modal.notify_email || false}
                onChange={e => setModal({ ...modal, notify_email: e.target.checked })}
                className="accent-[#00e5a0]"
              />
              <span>Avisar por correo</span>
            </label>
          </div>
        </div>

        {/* Alerta de Error */}
        {modal.error && (
          <div className="text-xs text-[#f43f5e] bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-xl p-3">
            {modal.error}
          </div>
        )}
      </div>

      {/* Acciones del pie del panel */}
      <div className="p-4 border-t border-[#1e2d3d] bg-[#111820]/60 flex items-center gap-2 shrink-0">
        {modal.mode === 'edit' && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#f43f5e] border border-[#f43f5e]/30 hover:bg-[#f43f5e]/10 transition cursor-pointer"
          >
            Cancelar cita
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
        >
          Cerrar
        </button>
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
          style={{ background: 'var(--c-green)', color: 'var(--c-primary-fg)' }}
        >
          {modal.mode === 'create' ? 'Agendar cita' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

// ── Modal de Configuración de Horario de Consultas ──
function HoursModal({
  ctx,
  onClose,
  onSaved,
  flash,
}: {
  ctx: Ctx;
  onClose: () => void;
  onSaved: () => void;
  flash: (t: string) => void;
}) {
  const [locId, setLocId] = useState(ctx.locations[0]?.id || '');
  const build = (id: string) => {
    const hrs = ctx.hours[id] || [];
    return Array.from({ length: 7 }, (_, wd) => {
      const rs = hrs.filter(h => h.weekday === wd).sort((a, b) => a.open_min - b.open_min);
      return {
        abierto: rs.length > 0,
        m_o: minToHM(rs[0]?.open_min ?? 540),
        m_c: minToHM(rs[0]?.close_min ?? 840),
        t_o: rs[1] ? minToHM(rs[1].open_min) : '',
        t_c: rs[1] ? minToHM(rs[1].close_min) : '',
      };
    });
  };

  const [rows, setRows] = useState(() => build(locId));
  useEffect(() => {
    setRows(build(locId));
  }, [locId]); // eslint-disable-line

  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + (m || 0);
  };

  const save = async () => {
    const ranges: any[] = [];
    rows.forEach((r, wd) => {
      if (!r.abierto) return;
      if (r.m_o && r.m_c) ranges.push({ weekday: wd, open_min: toMin(r.m_o), close_min: toMin(r.m_c) });
      if (r.t_o && r.t_c) ranges.push({ weekday: wd, open_min: toMin(r.t_o), close_min: toMin(r.t_c) });
    });
    try {
      await api('/appointments/hours', { method: 'PUT', body: JSON.stringify({ location_id: locId, ranges }) });
      onSaved();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const upd = (wd: number, k: string, v: any) =>
    setRows(rs => rs.map((r, i) => (i === wd ? { ...r, [k]: v } : r)));

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <p className="font-semibold text-[#dde6ef] mb-1">Horario de consultas</p>
        <p className="text-[11px] text-[#7a95aa] mb-3">El calendario solo muestra los días y horas que definas aquí.</p>
        {ctx.locations.length > 1 && (
          <select value={locId} onChange={e => setLocId(e.target.value)} className={`${inp} mb-3`}>
            {ctx.locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
        <div className="space-y-1.5">
          {rows.map((r, wd) => (
            <div key={wd} className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 w-24 shrink-0 text-sm text-[#dde6ef]">
                <input
                  type="checkbox"
                  checked={r.abierto}
                  onChange={e => upd(wd, 'abierto', e.target.checked)}
                />
                {DIAS_LARGO[wd].slice(0, 3)}
              </label>
              {r.abierto ? (
                <div className="flex items-center gap-1 flex-wrap text-[11px]">
                  <input
                    type="time"
                    value={r.m_o}
                    onChange={e => upd(wd, 'm_o', e.target.value)}
                    className="px-1.5 py-1 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef]"
                  />
                  <span className="text-[#7a95aa]">–</span>
                  <input
                    type="time"
                    value={r.m_c}
                    onChange={e => upd(wd, 'm_c', e.target.value)}
                    className="px-1.5 py-1 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef]"
                  />
                  <span className="text-[#3d5870] mx-1">y</span>
                  <input
                    type="time"
                    value={r.t_o}
                    onChange={e => upd(wd, 't_o', e.target.value)}
                    className="px-1.5 py-1 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef]"
                    placeholder="tarde"
                  />
                  <span className="text-[#7a95aa]">–</span>
                  <input
                    type="time"
                    value={r.t_c}
                    onChange={e => upd(wd, 't_c', e.target.value)}
                    className="px-1.5 py-1 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef]"
                  />
                </div>
              ) : (
                <span className="text-[12px] text-[#3d5870]">Cerrado</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-[#7a95aa]">
            Cerrar
          </button>
          <button
            onClick={save}
            className="px-5 py-2.5 rounded-lg text-sm font-bold"
            style={{ background: 'var(--c-green)', color: 'var(--c-primary-fg)' }}
          >
            Guardar horario
          </button>
        </div>
      </div>
    </div>
  );
}
