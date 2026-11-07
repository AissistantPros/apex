'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '@/app/lib/auth';
import { mix } from '@/app/lib/ui';
import Icon from '@/app/components/Icon';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const DIAS_CORTO = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const DIAS_COL = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const ESTADO: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Por confirmar', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  confirmed: { label: 'Confirmada', color: '#00e5a0', bg: 'rgba(0, 229, 160, 0.15)' },
  arrived:   { label: 'En sala de espera', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
  done:      { label: 'Atendida', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
  cancelled: { label: 'Cancelada', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' },
  no_show:   { label: 'No asistió', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' },
};

const inp = 'w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] text-xs outline-none focus:border-[#00e5a0] transition placeholder-[#4b6377]';

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
const wdOf = (d: Date) => (d.getDay() + 6) % 7; // Lun=0, Dom=6

const HOUR_PX = 64;  // 64px por hora: cada media hora mide exactamente 32px
const SNAP_MIN = 30; // Snapping exacto a bloques claros de 30 minutos (:00 y :30)

/**
 * Snapping exacto a bloques de 30 minutos:
 * - 0 a 29 min (< :30) -> :00
 * - 30 a 59 min (>= :30) -> :30
 */
function snapToHalfHourMin(relY: number, minH: number, maxH: number): number {
  const maxRelY = Math.max(0, (maxH - minH) * HOUR_PX - 1);
  const clampedY = Math.max(0, Math.min(maxRelY, relY));
  const hourIdx = Math.floor(clampedY / HOUR_PX);
  const frac = (clampedY % HOUR_PX) / HOUR_PX;
  const half = frac < 0.5 ? 0 : 1;
  const totalMin = (minH + hourIdx) * 60 + half * 30;
  return Math.max(minH * 60, Math.min(maxH * 60, totalMin));
}

function formatoDuracion(min: number): string {
  if (!min || min <= 0) return '30 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h} hr${h > 1 ? 's' : ''}`;
  return `${m} min`;
}

function calcularHoraFin(horaInicio: string, durMin: number): string {
  if (!horaInicio) return '';
  const [h, m] = horaInicio.split(':').map(Number);
  const totalMin = (h || 0) * 60 + (m || 0) + (durMin || 30);
  return minToHM(totalMin);
}

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

// Determina cómo fue confirmada la cita leyendo el historial/etiquetas en notas
function infoConfirmacion(a: Appt) {
  const n = a.notes || '';
  if (a.status !== 'confirmed') {
    if (n.includes('recordatorio WhatsApp') || a.notify_whatsapp) {
      return { tipo: 'agent_sent', etiqueta: 'Recordatorio IA enviado', icon: 'clock', color: '#f59e0b' };
    }
    return { tipo: 'pending', etiqueta: 'Pendiente', icon: 'clock', color: '#f59e0b' };
  }
  if (n.includes('Agente IA') || n.includes('agente')) {
    return { tipo: 'agent', etiqueta: 'Confirmada por Agente IA', icon: 'check', color: '#00e5a0' };
  }
  return { tipo: 'manual', etiqueta: 'Confirmada a mano', icon: 'check', color: '#38bdf8' };
}

export default function AgendaPage() {
  // Vistas: 'day' (Día) | 'week' (Semana) | 'month' (Mes) | 'agenda' (Lista)
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'agenda'>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Filtros de navegación
  const [appts, setAppts] = useState<Appt[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [fLoc, setFLoc] = useState('');
  const [fDoc, setFDoc] = useState('');
  const [fStatus, setFStatus] = useState<string>('todos'); // 'todos' | 'pendientes' | 'confirmadas_ia' | 'confirmadas_manual'
  const [busqueda, setBusqueda] = useState('');
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState<any>(null); // Slide panel derecho que compacta el calendario
  const [hoursModal, setHoursModal] = useState(false);

  // Menú contextual flotante con clic derecho (Google Calendar Look & Feel)
  type CtxMenu = {
    visible: boolean;
    x: number;
    y: number;
    type: 'slot' | 'header' | 'appt' | 'block';
    day?: Date;
    startMin?: number;
    endMin?: number;
    appt?: Appt;
    block?: Block;
  };
  const [contextMenu, setContextMenu] = useState<CtxMenu>({ visible: false, x: 0, y: 0, type: 'slot' });

  // Cerrar menú contextual al hacer clic en cualquier parte de la ventana
  useEffect(() => {
    const closeMenu = () => {
      if (contextMenu.visible) setContextMenu(prev => ({ ...prev, visible: false }));
    };
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [contextMenu.visible]);

  // Drag para crear rango en vacío con snapping exacto de 15 minutos
  const [sel, setSel] = useState<{ day: string; a: number; b: number } | null>(null);
  const dragRef = useRef<{ day: Date; startMin: number; col: HTMLElement; startClientY: number } | null>(null);

  // Drag & drop fluido de citas estilo Google Calendar
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipDragRef = useRef<{
    appt: Appt;
    startX: number;
    startY: number;
    moved: boolean;
    offsetMin: number;
  } | null>(null);
  const [move, setMove] = useState<{ appt: Appt; offsetMin: number } | null>(null);
  const [preview, setPreview] = useState<{ di: number; startMin: number; ok: boolean } | null>(null);

  // Indicador de hora actual en vivo
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const flash = (t: string, ms = 4000) => {
    setMsg(t);
    setTimeout(() => setMsg(''), ms);
  };

  const wkStart = useMemo(() => monday(currentDate), [currentDate]);
  const monthStart = useMemo(() => firstOfMonth(currentDate), [currentDate]);

  const days7 = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(wkStart);
    d.setDate(d.getDate() + i);
    return d;
  }), [wkStart]);

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
      } else if (viewMode === 'day') {
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        desde = dayStart.toISOString();
        hasta = dayEnd.toISOString();
      } else if (viewMode === 'agenda') {
        const start = new Date(currentDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 14);
        desde = start.toISOString();
        hasta = end.toISOString();
      } else {
        desde = new Date(wkStart).toISOString();
        const end = new Date(wkStart);
        end.setDate(end.getDate() + 7);
        hasta = end.toISOString();
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
  }, [viewMode, wkStart, monthStart, currentDate, fLoc, fDoc]);

  useEffect(() => {
    load();
  }, [load]);

  // Teclas de acceso rápido estilo Google Calendar (T: hoy, D: día, W: semana, M: mes, A: agenda, Esc: cerrar panel)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        if (e.key === 'Escape' && modal) setModal(null);
        return;
      }
      if (e.key === 'Escape' && modal) {
        setModal(null);
      } else if (e.key === 't' || e.key === 'T') {
        setCurrentDate(new Date());
      } else if (e.key === 'd' || e.key === 'D') {
        setViewMode('day');
      } else if (e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S') {
        setViewMode('week');
      } else if (e.key === 'm' || e.key === 'M') {
        setViewMode('month');
      } else if (e.key === 'a' || e.key === 'A') {
        setViewMode('agenda');
      } else if (e.key === 'c' || e.key === 'C') {
        openCreateRange(new Date(), new Date(Date.now() + 30 * 60000));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  // Horarios visibles
  const scopeHours = useMemo(() => {
    if (!ctx) return [] as { weekday: number; open_min: number; close_min: number }[];
    const locs = fLoc ? [fLoc] : ctx.locations.map(l => l.id);
    const out: { weekday: number; open_min: number; close_min: number }[] = [];
    locs.forEach(id => (ctx.hours[id] || []).forEach(h => out.push(h)));
    return out;
  }, [ctx, fLoc]);

  const openWeekdays = useMemo(() => new Set(scopeHours.map(h => h.weekday)), [scopeHours]);
  const visibleDays = useMemo(() => {
    if (viewMode === 'day') return [currentDate];
    if (openWeekdays.size === 0) return days7;
    const filtered = days7.filter(d => openWeekdays.has(wdOf(d)));
    return filtered.length > 0 ? filtered : days7;
  }, [viewMode, currentDate, days7, openWeekdays]);

  // Eje vertical de horas
  const [minH, maxH] = useMemo(() => {
    if (!scopeHours.length) return [8, 20];
    const mn = Math.min(...scopeHours.map(h => h.open_min));
    const mx = Math.max(...scopeHours.map(h => h.close_min));
    return [Math.max(6, Math.floor(mn / 60)), Math.min(23, Math.ceil(mx / 60))];
  }, [scopeHours]);

  const hoursRows = useMemo(() => Array.from({ length: Math.max(1, maxH - minH) }, (_, i) => minH + i), [minH, maxH]);
  const gridH = (maxH - minH) * HOUR_PX;

  // Auto-scroll al horario de inicio de jornada (08:00 o la hora actual)
  useEffect(() => {
    if (scrollRef.current && (viewMode === 'day' || viewMode === 'week')) {
      const targetMin = Math.max(minH * 60, Math.min(maxH * 60, 8 * 60));
      const topPx = ((targetMin - minH * 60) / 60) * HOUR_PX;
      scrollRef.current.scrollTop = Math.max(0, topPx - 16);
    }
  }, [viewMode, minH, maxH]);

  const openIntervals = useCallback((day: Date) => {
    const wd = wdOf(day);
    return scopeHours.filter(h => h.weekday === wd).map(h => [h.open_min, h.close_min] as [number, number]);
  }, [scopeHours]);

  const pointToTime = useCallback((clientX: number, clientY: number) => {
    const el = gridRef.current;
    if (!el || !visibleDays.length) return null;
    const rect = el.getBoundingClientRect();
    const timeGutterW = 64;
    const colW = (rect.width - timeGutterW) / visibleDays.length;
    let di = Math.floor((clientX - rect.left - timeGutterW) / colW);
    di = Math.max(0, Math.min(visibleDays.length - 1, di));
    const relY = clientY - rect.top;
    const min = snapToHalfHourMin(relY, minH, maxH);
    return { di, min };
  }, [visibleDays, minH, maxH]);

  const apptDur = (a: Appt) => (a.ends_at ? Math.round((+new Date(a.ends_at) - +new Date(a.starts_at)) / 60000) : 30);

  const canPlace = useCallback((appt: Appt, day: Date, startMin: number) => {
    const dur = apptDur(appt);
    const endMin = startMin + dur;
    const intervals = openIntervals(day);
    if (intervals.length > 0 && !intervals.some(([o, c]) => startMin >= o && endMin <= c)) return false;
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

  // Arrastre fluido estilo Google Calendar
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

  const doMoveInstant = async (appt: Appt, day: Date, startMin: number) => {
    const dur = apptDur(appt);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(startMin);
    const end = new Date(+start + dur * 60000);

    const oldStarts = appt.starts_at;
    const oldEnds = appt.ends_at;

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
      setAppts(prev =>
        prev.map(a => (a.id === appt.id ? { ...a, starts_at: oldStarts, ends_at: oldEnds } : a))
      );
      flash(`No se pudo mover: ${e.message}`, 4500);
    }
  };

  const locColor = (id?: string) => ctx?.locations.find(l => l.id === id)?.color || 'var(--c-blue)';
  const docName = (id?: string) => ctx?.doctors.find(d => d.id === id)?.display_name || '';

  // Inicio de selección por clic o arrastre (bloques de 30 minutos)
  const onDown = (day: Date, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Solo clic principal izquierdo
    const col = e.currentTarget as HTMLElement;
    const rect = col.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const startMin = snapToHalfHourMin(relY, minH, maxH);
    dragRef.current = { day, startMin, col, startClientY: e.clientY };
    setSel({ day: ymd(day), a: startMin, b: Math.min(maxH * 60, startMin + 30) });
    if (contextMenu.visible) setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const onMove = (e: React.MouseEvent) => {
    if (chipDragRef.current) {
      const dist = Math.hypot(e.clientX - chipDragRef.current.startX, e.clientY - chipDragRef.current.startY);
      if (dist > 5) {
        chipDragRef.current.moved = true;
        setMove({ appt: chipDragRef.current.appt, offsetMin: chipDragRef.current.offsetMin });
        const pt = pointToTime(e.clientX, e.clientY);
        if (pt) {
          const rawStart = pt.min - chipDragRef.current.offsetMin;
          const startMin = Math.round(rawStart / SNAP_MIN) * SNAP_MIN;
          setPreview({ di: pt.di, startMin, ok: canPlace(chipDragRef.current.appt, visibleDays[pt.di], startMin) });
        }
      }
      return;
    }

    if (!dragRef.current) return;
    const distY = Math.abs(e.clientY - dragRef.current.startClientY);
    if (distY > 6) {
      const rect = dragRef.current.col.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const currMin = snapToHalfHourMin(relY, minH, maxH);
      if (currMin >= dragRef.current.startMin) {
        setSel({
          day: ymd(dragRef.current.day),
          a: dragRef.current.startMin,
          b: Math.min(maxH * 60, currMin + 30),
        });
      } else {
        setSel({
          day: ymd(dragRef.current.day),
          a: Math.max(minH * 60, currMin),
          b: dragRef.current.startMin + 30,
        });
      }
    }
  };

  const onUp = async () => {
    if (chipDragRef.current) {
      const dragInfo = chipDragRef.current;
      chipDragRef.current = null;
      const p = preview;
      setMove(null);
      setPreview(null);

      if (!dragInfo.moved) {
        openEdit(dragInfo.appt);
        return;
      }

      if (p) {
        if (!p.ok) {
          flash('Horario no disponible para mover esta cita (fuera de horario o conflicto con otra cita/bloqueo).');
        } else {
          await doMoveInstant(dragInfo.appt, visibleDays[p.di], p.startMin);
        }
      }
      return;
    }

    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !sel) return;

    const start = new Date(d.day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(sel.a);
    const end = new Date(d.day);
    end.setHours(0, 0, 0, 0);
    end.setMinutes(sel.b);

    // Abrimos el panel para el rango seleccionado exacto
    // IMPORTANTE: NO hacemos setSel(null) aquí: la selección se queda fija en el calendario
    // para que el usuario vea exactamente el bloque que apartó (ej. de 10am a 2pm / 4 horas)
    openCreateRange(start, end, 'appointment');
  };

  // Abrir panel lateral para agendar cita o bloquear horario
  const openCreateRange = (start: Date, end: Date, tab: 'appointment' | 'block' = 'appointment') => {
    const dur = Math.max(30, Math.round((+end - +start) / 60000));
    const startMin = start.getHours() * 60 + start.getMinutes();
    setModal({
      mode: 'create',
      tab,
      fecha: ymd(start),
      hora: hm(start),
      hora_fin: hm(end),
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
      all_day: false,
    });
    setSel({ day: ymd(start), a: startMin, b: startMin + dur });
  };

  // Sincronización cuando el usuario cambia la duración o la hora desde el panel
  const handlePanelDurationChange = (newDur: number) => {
    if (!modal) return;
    const horaFin = calcularHoraFin(modal.hora, newDur);
    setModal((prev: any) => ({ ...prev, dur: newDur, hora_fin: horaFin }));
    if (sel) {
      setSel(prev => (prev ? { ...prev, b: prev.a + newDur } : null));
    }
  };

  const handlePanelHoraChange = (newHora: string) => {
    if (!modal) return;
    const horaFin = calcularHoraFin(newHora, modal.dur);
    const [h, m] = newHora.split(':').map(Number);
    const startMin = (h || 0) * 60 + (m || 0);
    setModal((prev: any) => ({ ...prev, hora: newHora, hora_fin: horaFin }));
    if (sel) {
      setSel(prev => (prev ? { ...prev, a: startMin, b: startMin + modal.dur } : null));
    }
  };

  const closeModal = () => {
    setModal(null);
    setSel(null);
  };

  // Abrir directamente en la pestaña de bloqueo
  const openCreateBlock = (day: Date, startMin: number, endMin: number, allDay = false) => {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(startMin);
    const end = new Date(day);
    end.setHours(0, 0, 0, 0);
    end.setMinutes(endMin);
    const dur = Math.max(30, endMin - startMin);
    setModal({
      mode: 'create',
      tab: 'block',
      fecha: ymd(day),
      hora: hm(start),
      hora_fin: hm(end),
      dur,
      all_day: allDay,
      doctor_id: fDoc || '',
      location_id: fLoc || ctx?.locations[0]?.id || '',
      patient_name: '',
      reason: '',
      notes: '',
      status: 'scheduled',
    });
    if (!allDay) {
      setSel({ day: ymd(day), a: startMin, b: endMin });
    }
  };

  // Abrir inspector para ver o eliminar un bloqueo existente
  const openViewBlock = (b: Block) => {
    const s = new Date(b.starts_at);
    const e = new Date(b.ends_at);
    setModal({
      mode: 'view_block',
      id: b.id,
      block: b,
      reason: b.reason || 'Horario bloqueado',
      fecha: ymd(s),
      hora: hm(s),
      hora_fin: hm(e),
      all_day: b.all_day || false,
      location_id: b.location_id || '',
    });
  };

  // Guardar bloqueo de horario en backend
  const saveBlock = async () => {
    const m = modal;
    const start = m.all_day
      ? new Date(`${m.fecha}T00:00:00`)
      : new Date(`${m.fecha}T${m.hora}`);
    const end = m.all_day
      ? new Date(`${m.fecha}T23:59:59`)
      : new Date(+start + (m.dur || 60) * 60000);

    const payload = {
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      location_id: m.location_id || null,
      doctor_id: m.doctor_id || null,
      all_day: Boolean(m.all_day),
      reason: (m.reason || '').trim() || 'Horario bloqueado',
    };

    try {
      await api('/appointments/blocks', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setModal(null);
      setSel(null);
      load();
      flash('✓ Horario bloqueado con éxito.');
    } catch (e: any) {
      setModal({ ...m, error: e.message });
    }
  };

  // Eliminar bloqueo de horario
  const deleteBlockById = async (blockId: string) => {
    try {
      await api(`/appointments/blocks/${blockId}`, { method: 'DELETE' });
      if (modal?.id === blockId) setModal(null);
      setSel(null);
      load();
      flash('Bloqueo eliminado correctamente.');
    } catch (e: any) {
      flash(e.message);
    }
  };

  // Bloqueo rápido de 1 clic desde el menú contextual
  const quickBlockRange = async (day: Date, startMin: number, endMin: number, reason = 'Horario bloqueado') => {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(startMin);
    const end = new Date(day);
    end.setHours(0, 0, 0, 0);
    end.setMinutes(endMin);
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
      flash(`✓ Bloqueado ${minToHM(startMin)} - ${minToHM(endMin)}.`);
      setSel(null);
      load();
    } catch (e: any) {
      flash(e.message);
    }
  };

  // Manejadores de menú contextual de clic derecho
  const handleColContextMenu = (day: Date, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const col = e.currentTarget as HTMLElement;
    const rect = col.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const clickedMin = snapToHalfHourMin(relY, minH, maxH);
    let a = clickedMin;
    let b = Math.min(maxH * 60, clickedMin + 30);
    if (sel && sel.day === ymd(day) && clickedMin >= sel.a && clickedMin <= sel.b) {
      a = sel.a;
      b = sel.b;
    } else {
      setSel({ day: ymd(day), a, b });
    }
    setContextMenu({
      visible: true,
      x: Math.min(window.innerWidth - 250, e.clientX),
      y: Math.min(window.innerHeight - 280, e.clientY),
      type: 'slot',
      day,
      startMin: a,
      endMin: b,
    });
  };

  const handleHeaderContextMenu = (day: Date, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: Math.min(window.innerWidth - 250, e.clientX),
      y: Math.min(window.innerHeight - 220, e.clientY),
      type: 'header',
      day,
    });
  };

  const handleApptContextMenu = (appt: Appt, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: Math.min(window.innerWidth - 250, e.clientX),
      y: Math.min(window.innerHeight - 280, e.clientY),
      type: 'appt',
      appt,
    });
  };

  const handleBlockContextMenu = (block: Block, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: Math.min(window.innerWidth - 250, e.clientX),
      y: Math.min(window.innerHeight - 200, e.clientY),
      type: 'block',
      block,
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

  // Confirmar cita a mano (Recepción / Doctor)
  const confirmarAMano = async (apptId: string) => {
    try {
      const r = await api(`/appointments/${apptId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ method: 'manual' }),
      });
      flash('✓ Cita confirmada a mano por recepción.');
      if (modal && modal.id === apptId) {
        setModal({ ...modal, status: 'confirmed', notes: r.notes || modal.notes });
      }
      load();
    } catch (e: any) {
      flash(e.message);
    }
  };

  // Disparar confirmación con Agente IA (WhatsApp)
  const confirmarConAgente = async (apptId: string) => {
    try {
      const r = await api(`/appointments/${apptId}/agent-dispatch`, { method: 'POST' });
      flash('🤖 Agente IA activado: solicitud de confirmación enviada por WhatsApp al paciente.');
      if (modal && modal.id === apptId) {
        setModal({ ...modal, notify_whatsapp: true, notes: r.notes || modal.notes });
      }
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

  // Citas filtradas por estado o búsqueda
  const apptsFiltradas = useMemo(() => {
    return appts.filter(a => {
      if (a.status === 'cancelled') return false;
      if (fStatus === 'pendientes' && a.status === 'confirmed') return false;
      if (fStatus === 'confirmadas_ia') {
        const conf = infoConfirmacion(a);
        if (conf.tipo !== 'agent') return false;
      }
      if (fStatus === 'confirmadas_manual') {
        const conf = infoConfirmacion(a);
        if (conf.tipo !== 'manual') return false;
      }
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const pac = (a.patient_name || '').toLowerCase();
        const mot = (a.reason || '').toLowerCase();
        const tel = (a.patient_phone || '').toLowerCase();
        if (!pac.includes(q) && !mot.includes(q) && !tel.includes(q)) return false;
      }
      return true;
    });
  }, [appts, fStatus, busqueda]);

  // Contadores de confirmación para los badges
  const statsConfirmacion = useMemo(() => {
    let pendientes = 0, agent = 0, manual = 0;
    appts.forEach(a => {
      if (a.status === 'cancelled') return;
      const c = infoConfirmacion(a);
      if (c.tipo === 'agent') agent++;
      else if (c.tipo === 'manual') manual++;
      else pendientes++;
    });
    return { pendientes, agent, manual, total: pendientes + agent + manual };
  }, [appts]);

  const todayStr = ymd(now);
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const colW = visibleDays.length ? `repeat(${visibleDays.length}, minmax(${viewMode === 'day' ? '300px' : '130px'}, 1fr))` : '1fr';

  // Navegación de fecha
  const saltarAtras = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else if (viewMode === 'agenda') d.setDate(d.getDate() - 14);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };
  const saltarAdelante = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else if (viewMode === 'agenda') d.setDate(d.getDate() + 14);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };
  const irAHoy = () => setCurrentDate(new Date());

  return (
    <div className="h-full flex-1 flex flex-col bg-[#070a0e] text-[#dde6ef] overflow-hidden select-none" onMouseUp={onUp} onMouseMove={onMove}>
      {/* ── 1. BARRA SUPERIOR AUTÉNTICA DE GOOGLE CALENDAR ── */}
      <header className="h-16 border-b border-[#1e2d3d] bg-[#0d1520] px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0 z-30 select-none">
        {/* Izquierda: Toggle Sidebar + Logo + Botón Hoy + Flechas + Mes/Año */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(s => !s)}
            className="p-2 rounded-full text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
            title="Menú principal (abrir/cerrar barra lateral)"
          >
            <Icon name="menu" size={20} />
          </button>

          <div className="flex items-center gap-2 mr-2">
            <span className="w-9 h-9 rounded-xl bg-[#00e5a0]/15 text-[#00e5a0] flex items-center justify-center font-bold">
              <Icon name="calendar" size={19} />
            </span>
            <span className="font-bold text-lg tracking-tight text-[#dde6ef] hidden md:inline">
              Agenda
            </span>
          </div>

          <button
            type="button"
            onClick={irAHoy}
            className="px-4 py-1.5 rounded-full border border-[#2d3f52] bg-[#111820] text-xs font-semibold text-[#dde6ef] hover:border-[#00e5a0] hover:text-[#00e5a0] hover:bg-[#162231] active:scale-95 transition cursor-pointer"
            title="Ir al día de hoy (T)"
          >
            Hoy
          </button>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={saltarAtras}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
              title="Anterior"
            >
              <Icon name="back" size={17} />
            </button>
            <button
              type="button"
              onClick={saltarAdelante}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
              title="Siguiente"
            >
              <span className="rotate-180 inline-block"><Icon name="back" size={17} /></span>
            </button>
          </div>

          {/* Título de Fecha Grande estilo Google Calendar */}
          <div className="flex items-baseline gap-2 pl-1">
            <h1 className="text-base sm:text-xl font-medium tracking-tight text-[#dde6ef] capitalize">
              {viewMode === 'month'
                ? `${MESES[monthStart.getMonth()]} de ${monthStart.getFullYear()}`
                : viewMode === 'day'
                ? `${DIAS_LARGO[wdOf(currentDate)]} ${currentDate.getDate()} de ${MESES[currentDate.getMonth()]}`
                : viewMode === 'agenda'
                ? `Próximas citas · ${MESES[currentDate.getMonth()]}`
                : `${MESES[days7[0].getMonth()]} de ${days7[0].getFullYear()}`}
            </h1>
            {viewMode === 'week' && (
              <span className="text-xs text-[#7a95aa] hidden xl:inline font-mono">
                ({days7[0].getDate()} al {days7[6].getDate()} de {MESES[days7[6].getMonth()]})
              </span>
            )}
          </div>
        </div>

        {/* Centro / Derecha: Buscador + Selector de Vista + Botón "+ Crear Cita" */}
        <div className="flex items-center gap-2.5">
          {/* Buscador Rápido de Pacientes en Agenda */}
          <div className="relative hidden md:block w-48 lg:w-64">
            <input
              type="text"
              placeholder="Buscar paciente, motivo o teléfono..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-full bg-[#111820] border border-[#1e2d3d] text-xs text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#4b6377]"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4b6377]">
              <Icon name="search" size={14} />
            </span>
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7a95aa] hover:text-[#dde6ef] text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Selector de Vista: Día | Semana | Mes | Agenda (Google Calendar segmented control) */}
          <div className="inline-flex rounded-full bg-[#111820] border border-[#1e2d3d] p-1">
            {(['day', 'week', 'month', 'agenda'] as const).map(mode => {
              const active = viewMode === mode;
              const labels = { day: 'Día', week: 'Semana', month: 'Mes', agenda: 'Agenda' };
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                    active ? 'bg-[#00e5a0] text-[#051b14] shadow-sm' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                  }`}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>

          {/* Botón "+ Crear Cita" Elevado (Google Calendar Look) */}
          <button
            type="button"
            onClick={() => openCreateRange(new Date(), new Date(Date.now() + 30 * 60000))}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-[#051b14] bg-[#00e5a0] hover:bg-[#00c98c] shadow-[0_4px_16px_rgba(0,229,160,0.3)] active:scale-95 transition cursor-pointer"
            title="Crear nueva cita (C)"
          >
            <span className="text-base font-extrabold leading-none">+</span>
            <span className="hidden sm:inline">Nueva cita</span>
          </button>
        </div>
      </header>

      {/* Notificación Toast Flotante */}
      {msg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-[#0d1520] border border-[#00e5a0]/60 text-[#00e5a0] text-xs sm:text-sm font-semibold shadow-2xl flex items-center gap-3 animate-in fade-in">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="text-[#7a95aa] hover:text-[#00e5a0] text-base leading-none">✕</button>
        </div>
      )}

      {/* ── 2. CUERPO PRINCIPAL: SIDEBAR + TIME GRID / LISTA + SLIDE INSPECTOR ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* ── BARRA LATERAL IZQUIERDA (MINI CALENDARIO + FILTROS DE CONFIRMACIÓN Y DOCTORES) ── */}
        <aside
          className={`transition-all duration-300 ease-in-out shrink-0 bg-[#0d1520] border-r border-[#1e2d3d] flex flex-col z-20 ${
            sidebarOpen ? 'w-64 p-4 opacity-100 overflow-y-auto' : 'w-0 p-0 opacity-0 overflow-hidden border-r-0'
          }`}
        >
          {/* Botón Flotante Icónico de Google Calendar "+ Crear cita" en la barra lateral */}
          <button
            type="button"
            onClick={() => {
              const start = new Date(currentDate);
              start.setHours(9, 0, 0, 0);
              const end = new Date(+start + 30 * 60000);
              openCreateRange(start, end, 'appointment');
            }}
            className="w-full flex items-center justify-center gap-3 py-3 px-5 rounded-full bg-[#00e5a0] text-[#051b14] font-bold text-sm shadow-[0_4px_16px_rgba(0,229,160,0.3)] hover:shadow-[0_6px_22px_rgba(0,229,160,0.45)] hover:scale-[1.02] active:scale-95 transition-all cursor-pointer mb-5"
          >
            <span className="text-2xl font-black leading-none">+</span>
            <span className="tracking-wide">Crear cita</span>
          </button>

          {/* Mini Calendario Mensual Interactivo (Google Calendar Signature Widget) */}
          <div className="mb-5 select-none">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-[#dde6ef] capitalize">
                {MESES[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(currentDate);
                    d.setMonth(d.getMonth() - 1);
                    setCurrentDate(d);
                  }}
                  className="w-6 h-6 rounded-full hover:bg-[#162231] text-[#7a95aa] hover:text-[#dde6ef] flex items-center justify-center transition"
                  title="Mes anterior"
                >
                  <Icon name="back" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(currentDate);
                    d.setMonth(d.getMonth() + 1);
                    setCurrentDate(d);
                  }}
                  className="w-6 h-6 rounded-full hover:bg-[#162231] text-[#7a95aa] hover:text-[#dde6ef] flex items-center justify-center transition"
                  title="Mes siguiente"
                >
                  <span className="rotate-180 inline-block"><Icon name="back" size={13} /></span>
                </button>
              </div>
            </div>

            {/* Días de la semana abreviados */}
            <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-[#7a95aa] mb-1">
              {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((letra, idx) => (
                <div key={idx} className="py-1">{letra}</div>
              ))}
            </div>

            {/* Celdas del mini mes con círculos hover estilo Google Calendar */}
            <div className="grid grid-cols-7 text-center text-xs gap-y-0.5">
              {(() => {
                const primerDia = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                const diaSemanaInicio = primerDia.getDay(); // 0 es domingo
                const totalDiasMes = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
                const totalDiasMesAnt = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();

                const celdas = [];
                // Días previos
                for (let i = diaSemanaInicio - 1; i >= 0; i--) {
                  celdas.push({ dia: totalDiasMesAnt - i, actual: false });
                }
                // Días actuales
                for (let i = 1; i <= totalDiasMes; i++) {
                  celdas.push({ dia: i, actual: true });
                }
                // Días siguientes hasta llenar 35 o 42
                const restantes = 35 - celdas.length;
                for (let i = 1; i <= (restantes < 0 ? 42 - celdas.length : restantes); i++) {
                  celdas.push({ dia: i, actual: false });
                }

                return celdas.map((c, i) => {
                  const esHoy = c.actual && c.dia === now.getDate() && currentDate.getMonth() === now.getMonth() && currentDate.getFullYear() === now.getFullYear();
                  const esSeleccionado = c.actual && c.dia === currentDate.getDate();

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const target = new Date(currentDate.getFullYear(), currentDate.getMonth(), c.dia);
                        setCurrentDate(target);
                      }}
                      className={`h-7 w-7 mx-auto rounded-full text-[11px] font-semibold flex items-center justify-center transition cursor-pointer ${
                        !c.actual ? 'text-[#3d5870]' : 'text-[#dde6ef] hover:bg-[#162231]'
                      } ${esHoy ? 'bg-[#00e5a0] text-[#051b14] font-bold shadow-sm' : ''} ${
                        esSeleccionado && !esHoy ? 'bg-[#1e2d3d] text-[#00e5a0] font-bold' : ''
                      }`}
                    >
                      {c.dia}
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          <hr className="border-[#1e2d3d]/60 mb-4" />

          {/* ── FILTRO DE CONFIRMACIÓN DE CITAS (EL CORE DE LA CLÍNICA) ── */}
          <div className="mb-5 space-y-2">
            <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#7a95aa]">
              Estado de Confirmación
            </p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setFStatus('todos')}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  fStatus === 'todos' ? 'bg-[#162231] text-[#00e5a0]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
              >
                <span>Todas las citas</span>
                <span className="font-mono text-[10px] bg-[#111820] px-1.5 py-0.5 rounded-md">{statsConfirmacion.total}</span>
              </button>

              <button
                type="button"
                onClick={() => setFStatus('confirmadas_ia')}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  fStatus === 'confirmadas_ia' ? 'bg-[#00e5a0]/15 text-[#00e5a0]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#00e5a0]" />
                  <span>🤖 Confirmadas por IA</span>
                </span>
                <span className="font-mono text-[10px] bg-[#111820] px-1.5 py-0.5 rounded-md text-[#00e5a0]">{statsConfirmacion.agent}</span>
              </button>

              <button
                type="button"
                onClick={() => setFStatus('confirmadas_manual')}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  fStatus === 'confirmadas_manual' ? 'bg-[#38bdf8]/15 text-[#38bdf8]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
                  <span>👤 Confirmadas a mano</span>
                </span>
                <span className="font-mono text-[10px] bg-[#111820] px-1.5 py-0.5 rounded-md text-[#38bdf8]">{statsConfirmacion.manual}</span>
              </button>

              <button
                type="button"
                onClick={() => setFStatus('pendientes')}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  fStatus === 'pendientes' ? 'bg-[#f59e0b]/15 text-[#f59e0b]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                  <span>⏳ Por confirmar</span>
                </span>
                <span className="font-mono text-[10px] bg-[#111820] px-1.5 py-0.5 rounded-md text-[#f59e0b]">{statsConfirmacion.pendientes}</span>
              </button>
            </div>
          </div>

          <hr className="border-[#1e2d3d]/60 mb-4" />

          {/* ── FILTRO DE DOCTORES / ESPECIALISTAS (GOOGLE CALENDAR "MIS CALENDARIOS") ── */}
          {ctx && ctx.doctors.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#7a95aa]">
                Médicos
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setFDoc('')}
                  className={`w-full text-left px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    !fDoc ? 'bg-[#162231] text-[#00e5a0]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                  }`}
                >
                  Todos los médicos
                </button>
                {ctx.doctors.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setFDoc(prev => (prev === d.id ? '' : d.id))}
                    className={`w-full flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      fDoc === d.id ? 'bg-[#162231] text-[#dde6ef]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: fDoc === d.id ? 'var(--c-green)' : '#4b6377' }} />
                    <span className="truncate">{d.display_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── FILTRO DE SEDES / CONSULTORIOS ── */}
          {ctx && ctx.locations.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#7a95aa]">
                Sedes
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setFLoc('')}
                  className={`w-full text-left px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    !fLoc ? 'bg-[#162231] text-[#00e5a0]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                  }`}
                >
                  Todas las sedes
                </button>
                {ctx.locations.map(l => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setFLoc(prev => (prev === l.id ? '' : l.id))}
                    className={`w-full flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      fLoc === l.id ? 'bg-[#162231] text-[#dde6ef]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color || 'var(--c-blue)' }} />
                    <span className="truncate">{l.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Herramientas de Administrador */}
          {ctx?.can_manage && (
            <div className="mt-auto pt-3 border-t border-[#1e2d3d]/60 space-y-1.5">
              <button
                type="button"
                onClick={() => setHoursModal(true)}
                className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-[#111820] border border-[#1e2d3d] text-[#7a95aa] hover:text-[#dde6ef] hover:border-[#4b6377] transition cursor-pointer flex items-center justify-between"
              >
                <span>Configurar horario</span>
                <span>⚙</span>
              </button>
            </div>
          )}
        </aside>

        {/* ── 3. ÁREA DEL CALENDARIO (FLEX-1: SE COMPACTA SUAVEMENTE CUANDO EL PANEL DERECHO SE ABRE) ── */}
        <div className="flex-1 min-w-0 flex flex-col transition-all duration-300 ease-in-out overflow-hidden bg-[#070a0e]">
          {viewMode === 'month' ? (
            /* ── VISTA MENSUAL (GOOGLE CALENDAR 7x6 GRID) ── */
            <div className="flex-1 flex flex-col overflow-hidden select-none">
              {/* Encabezado LUN - DOM */}
              <div className="grid grid-cols-7 border-b border-[#1e2d3d] bg-[#0d1520] shrink-0">
                {DIAS_COL.map((d, i) => (
                  <div key={i} className="py-2.5 text-center text-xs font-mono font-bold text-[#7a95aa] border-r last:border-r-0 border-[#1e2d3d]">
                    {d}
                  </div>
                ))}
              </div>
              {/* Cuadrícula de 6 semanas */}
              <div className="grid grid-cols-7 flex-1 overflow-y-auto">
                {monthCells.map((day, idx) => {
                  const dayStr = ymd(day);
                  const inMonth = day.getMonth() === monthStart.getMonth();
                  const isToday = dayStr === todayStr;
                  const dayAppts = apptsFiltradas
                    .filter(a => ymd(new Date(a.starts_at)) === dayStr)
                    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
                  const dayBlocks = blocks.filter(b => ymd(new Date(b.starts_at)) === dayStr);

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        const start = new Date(day);
                        start.setHours(9, 0, 0, 0);
                        const end = new Date(+start + 30 * 60000);
                        openCreateRange(start, end, 'appointment');
                      }}
                      onContextMenu={e => handleHeaderContextMenu(day, e)}
                      className={`min-h-[105px] border-b border-r last:border-r-0 border-[#1e2d3d] p-1.5 flex flex-col gap-1 cursor-pointer hover:bg-[#111820]/70 transition ${
                        !inMonth ? 'opacity-30 bg-[#070a0e]/40' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setCurrentDate(day);
                            setViewMode('day');
                          }}
                          title="Ver este día a detalle"
                          className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#162231] transition ${
                            isToday ? 'bg-[#00e5a0] text-[#051b14]' : 'text-[#dde6ef]'
                          }`}
                        >
                          {day.getDate()}
                        </button>
                        {dayAppts.length > 0 && (
                          <span className="text-[10px] font-mono text-[#7a95aa]">
                            {dayAppts.length}
                          </span>
                        )}
                      </div>

                      {dayBlocks.length > 0 && (
                        <div
                          onClick={e => {
                            e.stopPropagation();
                            openViewBlock(dayBlocks[0]);
                          }}
                          onContextMenu={e => handleBlockContextMenu(dayBlocks[0], e)}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30 truncate hover:bg-[#f43f5e]/25 cursor-pointer"
                          title="Clic para ver o eliminar este bloqueo"
                        >
                          🚫 {dayBlocks[0].reason || 'Bloqueado'}
                        </div>
                      )}

                      <div className="space-y-1 overflow-y-auto max-h-[76px]">
                        {dayAppts.slice(0, 3).map(a => {
                          const s = new Date(a.starts_at);
                          const col = locColor(a.location_id);
                          const conf = infoConfirmacion(a);
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                openEdit(a);
                              }}
                              className="w-full text-left px-1.5 py-0.5 rounded-md text-[10px] truncate block hover:brightness-110 transition flex items-center justify-between cursor-pointer"
                              style={{
                                background: mix(col, 20),
                                borderLeft: `3px solid ${col}`,
                                color: '#dde6ef',
                              }}
                            >
                              <span className="truncate">
                                <span className="font-mono text-[9px] opacity-80 mr-1">{hm(s)}</span>
                                {a.patient_name}
                              </span>
                              <span className="text-[9px] shrink-0 ml-1">
                                {conf.tipo === 'agent' ? '🤖' : conf.tipo === 'manual' ? '👤' : '⏳'}
                              </span>
                            </button>
                          );
                        })}
                        {dayAppts.length > 3 && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setCurrentDate(day);
                              setViewMode('day');
                            }}
                            className="text-[10px] font-mono text-[#00e5a0] hover:underline pl-1 cursor-pointer"
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
          ) : viewMode === 'agenda' ? (
            /* ── VISTA DE AGENDA / LISTA CRONOLÓGICA (CAL.COM & NOTION CALENDAR STYLE) ── */
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[#dde6ef]">Próximas citas agendadas</h2>
                  <span className="text-xs font-mono text-[#7a95aa]">{apptsFiltradas.length} citas encontradas</span>
                </div>

                {apptsFiltradas.length === 0 ? (
                  <div className="text-center py-16 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6">
                    <p className="text-sm font-semibold text-[#dde6ef]">No hay citas en este rango de fechas</p>
                    <p className="text-xs text-[#7a95aa] mt-1">Usa el botón "+ Nueva cita" o haz clic en cualquier fecha para programar.</p>
                  </div>
                ) : (
                  Array.from(new Set(apptsFiltradas.map(a => ymd(new Date(a.starts_at))))).sort().map(fechaStr => {
                    const [y, m, d] = fechaStr.split('-').map(Number);
                    const fechaObj = new Date(y, m - 1, d);
                    const citasDia = apptsFiltradas.filter(a => ymd(new Date(a.starts_at)) === fechaStr);
                    const esHoy = fechaStr === todayStr;

                    return (
                      <div key={fechaStr} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                            esHoy ? 'bg-[#00e5a0] text-[#051b14]' : 'bg-[#162231] text-[#7a95aa]'
                          }`}>
                            {esHoy ? 'Hoy · ' : ''}{DIAS_LARGO[wdOf(fechaObj)]} {d} de {MESES[m - 1]}
                          </span>
                          <span className="text-[11px] font-mono text-[#4b6377]">({citasDia.length} citas)</span>
                        </div>

                        <div className="space-y-2">
                          {citasDia.map(a => {
                            const s = new Date(a.starts_at);
                            const e = a.ends_at ? new Date(a.ends_at) : new Date(+s + 30 * 60000);
                            const col = locColor(a.location_id);
                            const conf = infoConfirmacion(a);
                            const doc = docName(a.doctor_id);

                            return (
                              <div
                                key={a.id}
                                onClick={() => openEdit(a)}
                                className="p-3.5 rounded-2xl bg-[#0d1520] border border-[#1e2d3d] hover:border-[#00e5a0]/40 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:shadow-md"
                              >
                                <div className="flex items-start sm:items-center gap-3">
                                  <div className="w-14 shrink-0 text-center py-1 rounded-xl bg-[#111820] border border-[#1e2d3d]">
                                    <p className="font-mono text-xs font-bold text-[#dde6ef]">{hm(s)}</p>
                                    <p className="font-mono text-[10px] text-[#7a95aa]">{hm(e)}</p>
                                  </div>

                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-bold text-[#dde6ef]">{a.patient_name}</p>
                                      <span
                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
                                        style={{ background: conf.color + '22', color: conf.color }}
                                      >
                                        <span>{conf.tipo === 'agent' ? '🤖' : conf.tipo === 'manual' ? '👤' : '⏳'}</span>
                                        <span>{conf.etiqueta}</span>
                                      </span>
                                    </div>
                                    <p className="text-xs text-[#7a95aa]">
                                      {doc ? `Con ${doc} · ` : ''}{a.reason || 'Consulta médica'}
                                      {a.patient_phone ? ` · 📞 ${a.patient_phone}` : ''}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-center" onClick={ev => ev.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => confirmarAMano(a.id)}
                                    className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30 hover:bg-[#38bdf8]/20 transition cursor-pointer"
                                    title="Confirmar asistencia a mano"
                                  >
                                    👤 Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => confirmarConAgente(a.id)}
                                    className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-[#00e5a0]/10 text-[#00e5a0] border border-[#00e5a0]/30 hover:bg-[#00e5a0]/20 transition cursor-pointer"
                                    title="Confirmar con Agente IA vía WhatsApp"
                                  >
                                    🤖 Agente IA
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* ── VISTA SEMANAL Y DIARIA (TIME GRID AUTÉNTICO DE GOOGLE CALENDAR) ── */
            <div className="flex-1 flex flex-col overflow-x-auto select-none">
              <div style={{ minWidth: 64 + visibleDays.length * (viewMode === 'day' ? 300 : 130) }} className="flex-1 flex flex-col min-h-0">
                {/* Encabezado sticky de columnas de días */}
                <div
                  className="grid border-b border-[#1e2d3d] bg-[#0d1520] shrink-0 sticky top-0 z-20"
                  style={{ gridTemplateColumns: `64px ${colW}` }}
                >
                  {/* Esquina superior izquierda con zona horaria */}
                  <div className="border-r border-[#1e2d3d] flex items-center justify-center text-[10px] font-mono text-[#7a95aa]">
                    GMT-5
                  </div>

                  {visibleDays.map((d, i) => {
                    const isToday = ymd(d) === todayStr;
                    return (
                      <div
                        key={i}
                        onContextMenu={e => handleHeaderContextMenu(d, e)}
                        className="border-r last:border-r-0 border-[#1e2d3d] py-2 px-1 text-center select-none"
                      >
                        <p className={`text-[11px] font-bold uppercase tracking-wider ${isToday ? 'text-[#00e5a0]' : 'text-[#7a95aa]'}`}>
                          {DIAS_COL[wdOf(d)]}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentDate(d);
                            setViewMode('day');
                          }}
                          className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mt-1 text-base font-bold transition cursor-pointer ${
                            isToday ? 'bg-[#00e5a0] text-[#051b14] shadow-md' : 'text-[#dde6ef] hover:bg-[#162231]'
                          }`}
                          title="Hacer clic para ver solo este día (D)"
                        >
                          {d.getDate()}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Contenedor scrolleable del time grid */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
                  <div ref={gridRef} className="grid relative" style={{ gridTemplateColumns: `64px ${colW}`, height: gridH }}>
                    {/* Columna de etiquetas de horas */}
                    <div className="select-none bg-[#070a0e]/50">
                      {hoursRows.map(h => (
                        <div
                          key={h}
                          className="border-r border-b border-[#1e2d3d] text-[11px] font-mono text-[#7a95aa] pr-2 text-right flex items-start justify-end pt-1"
                          style={{ height: HOUR_PX }}
                        >
                          {pad(h)}:00
                        </div>
                      ))}
                    </div>

                    {/* Columnas de los días */}
                    {visibleDays.map((day, di) => {
                      const intervals = openIntervals(day);
                      const isToday = ymd(day) === todayStr;

                      return (
                        <div
                          key={di}
                          className="relative border-r last:border-r-0 border-[#1e2d3d]"
                          style={{ height: gridH }}
                          onMouseDown={e => onDown(day, e)}
                          onContextMenu={e => handleColContextMenu(day, e)}
                        >
                          {/* Líneas horizontales de horas (sólida para hora, sutil para media hora) */}
                          {hoursRows.map(h => (
                            <div
                              key={h}
                              className="border-b border-[#1e2d3d]/50 relative"
                              style={{ height: HOUR_PX }}
                            >
                              <div
                                className="border-b border-[#1e2d3d]/20 absolute left-0 right-0 pointer-events-none"
                                style={{ top: HOUR_PX / 2 }}
                              />
                            </div>
                          ))}

                          {/* Zonas cerradas fuera del horario médico */}
                          <ClosedOverlays minH={minH} maxH={maxH} intervals={intervals} />

                          {/* LÍNEA ROJA DE HORA ACTUAL (GOOGLE CALENDAR ICONIC LINE) */}
                          {isToday && currentMin >= minH * 60 && currentMin <= maxH * 60 && (
                            <div
                              className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                              style={{ top: ((currentMin - minH * 60) / 60) * HOUR_PX }}
                            >
                              <div className="w-2.5 h-2.5 rounded-full bg-[#f43f5e] -ml-1.5 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                              <div className="flex-1 h-[2px] bg-[#f43f5e]" />
                            </div>
                          )}

                          {/* Rango en selección visible: PERMANECE en el calendario marcando el bloque exacto */}
                          {sel && sel.day === ymd(day) && (() => {
                            const durMin = Math.max(30, sel.b - sel.a);
                            const top = ((sel.a - minH * 60) / 60) * HOUR_PX;
                            const height = Math.max(28, (durMin / 60) * HOUR_PX);
                            const isBlock = modal?.tab === 'block';
                            const accentColor = isBlock ? '#f43f5e' : '#00e5a0';

                            return (
                              <div
                                className="absolute left-1 right-1 rounded-xl pointer-events-none z-20 shadow-2xl overflow-hidden animate-in fade-in transition-all flex flex-col justify-between p-2"
                                style={{
                                  top,
                                  height,
                                  background: isBlock ? 'rgba(244, 63, 94, 0.22)' : 'rgba(0, 229, 160, 0.22)',
                                  border: `2px solid ${accentColor}`,
                                }}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded-md text-white bg-[#0d1520]/95 shadow-sm flex items-center gap-1">
                                    <span>{isBlock ? '🚫' : '🩺'}</span>
                                    <span>{minToHM(sel.a)} – {minToHM(sel.b)}</span>
                                  </span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ color: accentColor, background: '#0d1520' }}>
                                    {formatoDuracion(durMin)}
                                  </span>
                                </div>

                                {height > 55 && (
                                  <p className="text-[11px] font-semibold text-[#dde6ef] drop-shadow truncate">
                                    {isBlock ? 'Horario a bloquear' : 'Apartando cita / estudio médico'}
                                  </p>
                                )}
                              </div>
                            );
                          })()}

                          {/* Bloqueos de agenda */}
                          {blocks
                            .filter(b => ymd(new Date(b.starts_at)) === ymd(day))
                            .map(b => {
                              const s = new Date(b.starts_at);
                              const e = new Date(b.ends_at);
                              const top = (s.getHours() + s.getMinutes() / 60 - minH) * HOUR_PX;
                              const height = Math.max(16, ((+e - +s) / 3600000) * HOUR_PX);
                              const isSelected = modal?.id === b.id;
                              return (
                                <div
                                  key={b.id}
                                  onMouseDown={ev => ev.stopPropagation()}
                                  onClick={() => openViewBlock(b)}
                                  onContextMenu={ev => handleBlockContextMenu(b, ev)}
                                  title="Clic para ver o eliminar este bloqueo (o clic derecho para opciones)"
                                  className={`absolute left-1 right-1 rounded-lg overflow-hidden cursor-pointer z-10 transition hover:brightness-125 ${
                                    isSelected ? 'ring-2 ring-[#f43f5e] shadow-lg' : ''
                                  }`}
                                  style={{
                                    top: Math.max(0, top),
                                    height,
                                    background:
                                      'repeating-linear-gradient(45deg,#f43f5e22,#f43f5e22 6px,#0d152080 6px,#0d152080 12px)',
                                    border: '1px solid #f43f5e77',
                                  }}
                                >
                                  <p className="text-[10px] font-semibold text-[#f43f5e] px-1.5 pt-0.5 truncate flex items-center gap-1">
                                    <span>🚫</span>
                                    <span>{b.reason || 'Horario bloqueado'}</span>
                                  </p>
                                </div>
                              );
                            })}

                          {/* CITAS MÉDICAS (CHIPS ESTILO GOOGLE CALENDAR CON BADGE DE CONFIRMACIÓN) */}
                          {apptsFiltradas
                            .filter(a => ymd(new Date(a.starts_at)) === ymd(day))
                            .map(a => {
                              const s = new Date(a.starts_at);
                              const durMin = a.ends_at ? (+new Date(a.ends_at) - +s) / 60000 : 30;
                              const top = (s.getHours() + s.getMinutes() / 60 - minH) * HOUR_PX;
                              const height = Math.max(26, (durMin / 60) * HOUR_PX - 2);
                              const col = locColor(a.location_id);
                              const isSelected = modal?.id === a.id;
                              const isBeingDragged = move?.appt.id === a.id;
                              const conf = infoConfirmacion(a);

                              return (
                                <div
                                  key={a.id}
                                  onMouseDown={e => startMoveAppt(a, e)}
                                  onContextMenu={e => handleApptContextMenu(a, e)}
                                  className={`absolute left-1 right-1 rounded-xl px-2.5 py-1 text-left overflow-hidden cursor-grab active:cursor-grabbing transition-all select-none shadow-sm hover:brightness-110 ${
                                    isSelected ? 'ring-2 ring-[#00e5a0] shadow-xl z-20' : 'hover:shadow-md'
                                  }`}
                                  style={{
                                    top,
                                    height,
                                    background: mix(col, 22),
                                    borderLeft: `4px solid ${col}`,
                                    opacity: isBeingDragged ? 0.35 : 1,
                                  }}
                                  title={`${hm(s)} – ${a.patient_name} (${conf.etiqueta})`}
                                >
                                  <div className="flex items-center justify-between gap-1 leading-tight">
                                    <span className="text-[11px] font-mono font-bold text-[#dde6ef]">
                                      {hm(s)}
                                    </span>

                                    {/* Badge de confirmación visual */}
                                    <span
                                      className="px-1.5 py-0.2 rounded-full text-[9px] font-bold shrink-0 flex items-center gap-1"
                                      style={{ background: conf.color + '22', color: conf.color }}
                                    >
                                      <span>{conf.tipo === 'agent' ? '🤖' : conf.tipo === 'manual' ? '👤' : '⏳'}</span>
                                      <span className="hidden xl:inline">{conf.tipo === 'agent' ? 'IA' : conf.tipo === 'manual' ? 'Manual' : 'Pendiente'}</span>
                                    </span>
                                  </div>

                                  <p className="text-xs font-bold text-[#dde6ef] truncate leading-tight mt-0.5">
                                    {a.patient_name}
                                  </p>

                                  {height > 40 && (
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
                            const h = Math.max(26, (dur / 60) * HOUR_PX - 2);
                            const col = preview.ok ? 'var(--c-green)' : 'var(--c-red)';
                            return (
                              <div
                                className="absolute left-1 right-1 rounded-xl px-2 py-1 pointer-events-none z-30 shadow-2xl"
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
                                  {preview.ok ? 'Soltar para mover' : 'Horario no disponible'}
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
            </div>
          )}
        </div>

        {/* ── 4. SLIDE POPUP INSPECTOR DERECHO (COMPACTA EL CALENDARIO, NO LO TAPA) ── */}
        <aside
          className={`transition-all duration-300 ease-in-out shrink-0 bg-[#0d1520] border-l border-[#1e2d3d] flex flex-col z-30 ${
            modal
              ? 'w-full sm:w-[420px] lg:w-[460px] opacity-100'
              : 'w-0 opacity-0 overflow-hidden pointer-events-none border-l-0 p-0 m-0'
          }`}
        >
          {modal && (
            <ApptSlidePanel
              ctx={ctx}
              modal={modal}
              setModal={setModal}
              onDurationChange={handlePanelDurationChange}
              onHoraChange={handlePanelHoraChange}
              onSave={save}
              onSaveBlock={saveBlock}
              onDeleteBlock={deleteBlockById}
              onCancel={cancelar}
              onConfirmManual={() => confirmarAMano(modal.id)}
              onConfirmAgent={() => confirmarConAgente(modal.id)}
              onClose={closeModal}
            />
          )}
        </aside>
      </div>

      {/* ── MENÚ CONTEXTUAL FLOTANTE (CLIC DERECHO) ESTILO GOOGLE CALENDAR ── */}
      {contextMenu.visible && (
        <div
          className="fixed z-50 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl shadow-2xl py-1.5 w-60 text-xs backdrop-blur-md animate-in fade-in select-none"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.type === 'slot' && (
            <>
              <div className="px-3 py-1.5 border-b border-[#1e2d3d]/60 text-[10px] font-mono text-[#7a95aa] flex items-center justify-between">
                <span>{contextMenu.day ? `${DIAS_CORTO[wdOf(contextMenu.day)]} ${contextMenu.day.getDate()}` : ''}</span>
                <span className="font-bold text-[#dde6ef]">
                  {minToHM(contextMenu.startMin || 0)} - {minToHM(contextMenu.endMin || 0)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const day = contextMenu.day || currentDate;
                  const start = new Date(day);
                  start.setHours(0, 0, 0, 0);
                  start.setMinutes(contextMenu.startMin || 0);
                  const end = new Date(day);
                  end.setHours(0, 0, 0, 0);
                  end.setMinutes(contextMenu.endMin || (contextMenu.startMin || 0) + 30);
                  openCreateRange(start, end, 'appointment');
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#dde6ef] hover:bg-[#162231] hover:text-[#00e5a0] flex items-center gap-2 font-semibold transition cursor-pointer"
              >
                <span>🩺</span>
                <span>Agendar cita médica</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const day = contextMenu.day || currentDate;
                  openCreateBlock(day, contextMenu.startMin || 0, contextMenu.endMin || (contextMenu.startMin || 0) + 60);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#f43f5e] hover:bg-[#f43f5e]/15 flex items-center gap-2 font-semibold transition cursor-pointer"
              >
                <span>🚫</span>
                <span>Bloquear este horario</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const day = contextMenu.day || currentDate;
                  quickBlockRange(day, contextMenu.startMin || 0, contextMenu.endMin || (contextMenu.startMin || 0) + 60);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] flex items-center gap-2 transition cursor-pointer text-[11px]"
              >
                <span>⚡</span>
                <span>Bloqueo rápido 1-clic</span>
              </button>

              <div className="border-t border-[#1e2d3d]/60 my-1" />

              <button
                type="button"
                onClick={() => {
                  const day = contextMenu.day || currentDate;
                  openCreateBlock(day, 0, 24 * 60, true);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] flex items-center gap-2 transition cursor-pointer"
              >
                <span>📅</span>
                <span>Bloquear todo el día</span>
              </button>
            </>
          )}

          {contextMenu.type === 'header' && (
            <>
              <div className="px-3 py-1.5 border-b border-[#1e2d3d]/60 text-[10px] font-mono text-[#7a95aa]">
                {contextMenu.day ? `${DIAS_LARGO[wdOf(contextMenu.day)]} ${contextMenu.day.getDate()}` : ''}
              </div>
              <button
                type="button"
                onClick={() => {
                  const day = contextMenu.day || currentDate;
                  openCreateBlock(day, 0, 24 * 60, true);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#f43f5e] hover:bg-[#f43f5e]/15 flex items-center gap-2 font-semibold transition cursor-pointer"
              >
                <span>📅</span>
                <span>Bloquear todo el día</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const day = contextMenu.day || currentDate;
                  const start = new Date(day);
                  start.setHours(9, 0, 0, 0);
                  const end = new Date(+start + 30 * 60000);
                  openCreateRange(start, end, 'appointment');
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#dde6ef] hover:bg-[#162231] hover:text-[#00e5a0] flex items-center gap-2 transition cursor-pointer"
              >
                <span>🩺</span>
                <span>Agendar cita a las 09:00</span>
              </button>
            </>
          )}

          {contextMenu.type === 'appt' && contextMenu.appt && (
            <>
              <div className="px-3 py-1.5 border-b border-[#1e2d3d]/60 text-[10px] font-mono text-[#7a95aa] truncate">
                {contextMenu.appt.patient_name}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.appt) confirmarAMano(contextMenu.appt.id);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#38bdf8] hover:bg-[#38bdf8]/15 flex items-center gap-2 font-semibold transition cursor-pointer"
              >
                <span>👤</span>
                <span>Confirmar a mano</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.appt) confirmarConAgente(contextMenu.appt.id);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#00e5a0] hover:bg-[#00e5a0]/15 flex items-center gap-2 font-semibold transition cursor-pointer"
              >
                <span>🤖</span>
                <span>Confirmar con Agente IA</span>
              </button>
              {contextMenu.appt.patient_phone && (
                <button
                  type="button"
                  onClick={() => {
                    const cleanPhone = (contextMenu.appt?.patient_phone || '').replace(/\D/g, '');
                    const s = new Date(contextMenu.appt?.starts_at || '');
                    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                      `Hola ${contextMenu.appt?.patient_name || ''}, te escribimos de Consultorio APEX para confirmar tu cita médica programada para el día ${ymd(s)} a las ${hm(s)} hrs.`
                    )}`;
                    window.open(url, '_blank');
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-3 py-2 text-[#25D366] hover:bg-[#25D366]/15 flex items-center gap-2 font-semibold transition cursor-pointer"
                >
                  <span>💬</span>
                  <span>WhatsApp directo</span>
                </button>
              )}
              <div className="border-t border-[#1e2d3d]/60 my-1" />
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.appt) openEdit(contextMenu.appt);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#dde6ef] hover:bg-[#162231] flex items-center gap-2 transition cursor-pointer"
              >
                <span>✏️</span>
                <span>Ver y editar detalles</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (contextMenu.appt && confirm(`¿Cancelar la cita de ${contextMenu.appt.patient_name}?`)) {
                    try {
                      await api(`/appointments/${contextMenu.appt.id}`, { method: 'DELETE' });
                      flash('Cita cancelada.');
                      load();
                    } catch (err: any) {
                      flash(err.message);
                    }
                  }
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#f43f5e] hover:bg-[#f43f5e]/15 flex items-center gap-2 transition cursor-pointer"
              >
                <span>🗑️</span>
                <span>Cancelar cita</span>
              </button>
            </>
          )}

          {contextMenu.type === 'block' && contextMenu.block && (
            <>
              <div className="px-3 py-1.5 border-b border-[#1e2d3d]/60 text-[10px] font-mono text-[#f43f5e] truncate">
                {contextMenu.block.reason || 'Bloqueo'}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.block) openViewBlock(contextMenu.block);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#dde6ef] hover:bg-[#162231] flex items-center gap-2 font-semibold transition cursor-pointer"
              >
                <span>ℹ️</span>
                <span>Ver detalles</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (contextMenu.block) {
                    await deleteBlockById(contextMenu.block.id);
                  }
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-3 py-2 text-[#f43f5e] hover:bg-[#f43f5e]/15 flex items-center gap-2 font-semibold transition cursor-pointer"
              >
                <span>🗑️</span>
                <span>Eliminar bloqueo</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Modal de Horario de Consultas */}
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

// Zonas cerradas (fuera de horario de atención médica)
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

// ── SLIDE POPUP INSPECTOR: CITAS MÉDICAS + BLOQUEO DE HORARIOS ESTILO GOOGLE CALENDAR ──
function ApptSlidePanel({
  ctx,
  modal,
  setModal,
  onDurationChange,
  onHoraChange,
  onSave,
  onSaveBlock,
  onDeleteBlock,
  onCancel,
  onConfirmManual,
  onConfirmAgent,
  onClose,
}: {
  ctx: Ctx | null;
  modal: any;
  setModal: (m: any) => void;
  onDurationChange?: (dur: number) => void;
  onHoraChange?: (hora: string) => void;
  onSave: () => void;
  onSaveBlock: () => void;
  onDeleteBlock: (id: string) => void;
  onCancel: () => void;
  onConfirmManual: () => void;
  onConfirmAgent: () => void;
  onClose: () => void;
}) {
  const [sug, setSug] = useState<any[]>([]);
  const [openSug, setOpenSug] = useState(false);
  const [showAgentPreview, setShowAgentPreview] = useState(false);
  const tRef = useRef<any>(null);

  const horaFinActual = modal.hora_fin || calcularHoraFin(modal.hora, modal.dur);

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
        /* */
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

  const confInfo = infoConfirmacion(modal as Appt);

  // Link para abrir WhatsApp web directo con mensaje pre-redactado
  const whatsappUrl = useMemo(() => {
    if (!modal.patient_phone) return null;
    const cleanPhone = modal.patient_phone.replace(/\D/g, '');
    if (!cleanPhone) return null;
    const msg = encodeURIComponent(
      `Hola ${modal.patient_name || 'paciente'}, te escribimos de Consultorio APEX para confirmar tu cita médica programada para el día ${modal.fecha} a las ${modal.hora} hrs. ¿Nos confirmas tu asistencia?`
    );
    return `https://wa.me/${cleanPhone}?text=${msg}`;
  }, [modal.patient_phone, modal.patient_name, modal.fecha, modal.hora]);

  // Si estamos inspeccionando un bloqueo existente
  if (modal.mode === 'view_block') {
    const locName = ctx?.locations.find(l => l.id === modal.location_id)?.name || 'Todas las sedes';
    return (
      <div className="flex flex-col h-full bg-[#0d1520]">
        <div className="p-4 border-b border-[#1e2d3d] flex items-center justify-between gap-3 bg-[#111820]/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#f43f5e]/15 text-[#f43f5e]">
              <span className="text-base">🚫</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#dde6ef]">Horario Bloqueado</h2>
              <p className="text-[11px] text-[#7a95aa]">Espacio reservado en agenda</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
            title="Cerrar panel (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="p-4 rounded-2xl bg-[#111820] border border-[#1e2d3d] space-y-3">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#7a95aa]">
              Motivo del Bloqueo
            </span>
            <p className="text-base font-bold text-[#dde6ef]">
              {modal.reason || 'Sin motivo especificado'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#111820] border border-[#1e2d3d] space-y-2.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#7a95aa]">
              Fecha y Horario
            </span>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#dde6ef]">
              <span>📅 {modal.fecha}</span>
              <span className="text-[#7a95aa]">·</span>
              <span>{modal.all_day ? 'Todo el día' : `${modal.hora} a ${modal.hora_fin} hrs`}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#111820] border border-[#1e2d3d] space-y-2.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#7a95aa]">
              Sede Aplicable
            </span>
            <p className="text-xs font-semibold text-[#dde6ef] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e]" />
              <span>{locName}</span>
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-[#1e2d3d] bg-[#111820]/80 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onDeleteBlock(modal.id)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#f43f5e] bg-[#f43f5e]/15 border border-[#f43f5e]/30 hover:bg-[#f43f5e]/25 transition cursor-pointer flex items-center gap-1.5"
          >
            <span>🗑️</span>
            <span>Eliminar bloqueo</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const isBlockTab = modal.tab === 'block';

  return (
    <div className="flex flex-col h-full bg-[#0d1520]">
      {/* Cabecera del Panel */}
      <div className="p-4 border-b border-[#1e2d3d] flex items-center justify-between gap-3 bg-[#111820]/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
            isBlockTab ? 'bg-[#f43f5e]/15 text-[#f43f5e]' : 'bg-[#00e5a0]/15 text-[#00e5a0]'
          }`}>
            {isBlockTab ? <span className="text-base">🚫</span> : <Icon name="calendar" size={17} />}
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#dde6ef]">
              {modal.mode === 'create'
                ? isBlockTab ? 'Bloquear Horario en Agenda' : 'Apartar Cita o Estudio'
                : 'Detalles de la Cita'}
            </h2>
            <p className="text-[11px] text-[#7a95aa]">
              {modal.mode === 'create'
                ? isBlockTab ? 'Inhabilita citas para cirugías o descansos' : 'Programa una consulta o estudio médico'
                : 'Gestiona y confirma la cita'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
          title="Cerrar panel (Esc)"
        >
          ✕
        </button>
      </div>

      {/* Contenido con scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* PREGUNTA Y SELECTOR ESTELAR CUANDO SE SELECCIONA UN BLOQUE EN EL CALENDARIO */}
        {modal.mode === 'create' && (
          <div className="p-3.5 rounded-2xl bg-[#111820] border border-[#1e2d3d] space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#7a95aa]">
                Bloque seleccionado
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-[#070a0e] text-[#00e5a0] border border-[#00e5a0]/30">
                {formatoDuracion(modal.dur)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-[#dde6ef]">
              <span>📅 {modal.fecha}</span>
              <span className="text-[#7a95aa]">·</span>
              <span className="font-mono text-[#00e5a0]">{modal.hora}</span>
              <span className="text-[#7a95aa]">a</span>
              <span className="font-mono text-[#00e5a0]">{horaFinActual} hrs</span>
            </div>

            <div className="pt-2 border-t border-[#1e2d3d]/60">
              <p className="text-[11px] font-bold text-[#dde6ef] mb-2">
                ¿Qué deseas hacer con este bloque de tiempo?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModal({ ...modal, tab: 'appointment' })}
                  className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                    !isBlockTab
                      ? 'bg-[#00e5a0]/15 border-[#00e5a0] text-[#dde6ef] shadow-md ring-1 ring-[#00e5a0]'
                      : 'bg-[#0d1520] border-[#1e2d3d] text-[#7a95aa] hover:border-[#4b6377] hover:text-[#dde6ef]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base">🩺</span>
                    {!isBlockTab && <span className="text-xs text-[#00e5a0] font-bold">✓</span>}
                  </div>
                  <p className="text-xs font-bold leading-tight text-[#dde6ef]">Cita o Estudio</p>
                  <p className="text-[10px] text-[#7a95aa] mt-0.5 leading-snug">
                    Apartar para paciente o estudio clínico (1h, 2h, 3h, 4h)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setModal({ ...modal, tab: 'block' })}
                  className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                    isBlockTab
                      ? 'bg-[#f43f5e]/15 border-[#f43f5e] text-[#dde6ef] shadow-md ring-1 ring-[#f43f5e]'
                      : 'bg-[#0d1520] border-[#1e2d3d] text-[#7a95aa] hover:border-[#4b6377] hover:text-[#dde6ef]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base">🚫</span>
                    {isBlockTab && <span className="text-xs text-[#f43f5e] font-bold">✓</span>}
                  </div>
                  <p className="text-xs font-bold leading-tight text-[#dde6ef]">Bloquear Horario</p>
                  <p className="text-[10px] text-[#7a95aa] mt-0.5 leading-snug">
                    Inhabilitar para cirugías, comida o descanso
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODO BLOQUEO DE HORARIO O DÍA ── */}
        {isBlockTab ? (
          <div className="space-y-4 animate-in fade-in">
            {/* Motivo del Bloqueo + Chips rápidos */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
                Motivo del Bloqueo *
              </label>
              <input
                className={inp}
                placeholder="Razón (ej. Cirugía, Congreso, Descanso)"
                value={modal.reason || ''}
                onChange={e => setModal({ ...modal, reason: e.target.value, error: '' })}
              />

              {/* Chips rápidos de motivos comunes */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: '🏥 Cirugía', val: 'Cirugía programada' },
                  { label: '👥 Reunión / Ateneo', val: 'Reunión médica / Ateneo' },
                  { label: '🍽️ Comida / Personal', val: 'Horario de comida / Asunto personal' },
                  { label: '📑 Trámites', val: 'Trámites administrativos' },
                  { label: '🌴 Vacaciones', val: 'Vacaciones / Descanso' },
                  { label: '🚨 Urgencia', val: 'Atención de urgencia' },
                ].map(chip => (
                  <button
                    key={chip.val}
                    type="button"
                    onClick={() => setModal({ ...modal, reason: chip.val, error: '' })}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                      modal.reason === chip.val
                        ? 'bg-[#f43f5e]/20 border-[#f43f5e] text-[#f43f5e]'
                        : 'bg-[#111820] border-[#1e2d3d] text-[#7a95aa] hover:text-[#dde6ef] hover:border-[#4b6377]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Checkbox de Todo el Día */}
            <div className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] flex items-center justify-between cursor-pointer" onClick={() => setModal({ ...modal, all_day: !modal.all_day })}>
              <div>
                <p className="text-xs font-bold text-[#dde6ef]">Bloquear todo el día</p>
                <p className="text-[11px] text-[#7a95aa]">Inhabilita todo el día para citas</p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(modal.all_day)}
                onChange={e => setModal({ ...modal, all_day: e.target.checked })}
                className="w-4 h-4 accent-[#f43f5e] cursor-pointer"
              />
            </div>

            {/* Fecha y Horario */}
            <div className="space-y-2.5 pt-2 border-t border-[#1e2d3d]/60">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
                  Fecha y Horario *
                </label>
                {!modal.all_day && (
                  <span className="text-[11px] font-mono text-[#f43f5e] font-semibold">
                    Término: {horaFinActual} ({formatoDuracion(modal.dur)})
                  </span>
                )}
              </div>
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
                {!modal.all_day ? (
                  <div>
                    <label className="text-[10px] text-[#7a95aa]">Hora de inicio</label>
                    <input
                      type="time"
                      className={inp}
                      value={modal.hora}
                      onChange={e => {
                        if (onHoraChange) onHoraChange(e.target.value);
                        else setModal({ ...modal, hora: e.target.value, error: '' });
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center text-xs text-[#00e5a0] font-mono font-semibold pt-5">
                    ✓ 00:00 a 23:59 hrs
                  </div>
                )}
              </div>

              {!modal.all_day && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-[#7a95aa]">Duración del bloqueo</label>
                    <span className="text-[10px] text-[#7a95aa] font-mono">Total: {formatoDuracion(modal.dur)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {[
                      { d: 30, lbl: '30m' },
                      { d: 60, lbl: '1h' },
                      { d: 120, lbl: '2h' },
                      { d: 180, lbl: '3h' },
                      { d: 240, lbl: '4h' },
                      { d: 480, lbl: '8h' },
                    ].map(({ d, lbl }) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          if (onDurationChange) onDurationChange(d);
                          else setModal({ ...modal, dur: d, error: '' });
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer"
                        style={{
                          background: modal.dur === d ? '#f43f5e' : '#111820',
                          borderColor: modal.dur === d ? '#f43f5e' : '#1e2d3d',
                          color: modal.dur === d ? '#fff' : '#dde6ef',
                        }}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sede y Profesional */}
            <div className="space-y-2.5 pt-2 border-t border-[#1e2d3d]/60">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
                Alcance del Bloqueo
              </label>
              <div>
                <label className="text-[10px] text-[#7a95aa]">Sede / Consultorio</label>
                <select
                  className={inp}
                  value={modal.location_id || ''}
                  onChange={e => setModal({ ...modal, location_id: e.target.value })}
                >
                  <option value="">— Todas las sedes de la clínica —</option>
                  {ctx?.locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              {ctx && ctx.doctors.length > 0 && (
                <div>
                  <label className="text-[10px] text-[#7a95aa]">Médico afectado (opcional)</label>
                  <select
                    className={inp}
                    value={modal.doctor_id || ''}
                    onChange={e => setModal({ ...modal, doctor_id: e.target.value })}
                  >
                    <option value="">— Toda la clínica / Sin médico específico —</option>
                    {ctx.doctors.map(d => (
                      <option key={d.id} value={d.id}>{d.display_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {modal.error && (
              <div className="text-xs text-[#f43f5e] bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-xl p-3">
                {modal.error}
              </div>
            )}
          </div>
        ) : (
          /* ── MODO CITA MÉDICA / ESTUDIO ── */
          <>
            {/* ── SECCIÓN ESTELAR: CONFIRMACIÓN DE CITA (MANUAL VS AGENTE IA) ── */}
            {modal.mode === 'edit' && (
              <div className="p-3.5 rounded-2xl bg-[#111820] border border-[#1e2d3d] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#7a95aa]">
                    Confirmación de Asistencia
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
                    style={{ background: confInfo.color + '22', color: confInfo.color }}
                  >
                    <span>{confInfo.tipo === 'agent' ? '🤖' : confInfo.tipo === 'manual' ? '👤' : '⏳'}</span>
                    <span>{confInfo.etiqueta}</span>
                  </span>
                </div>

                {/* Botones de acción rápida: A mano y Con Agente */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onConfirmManual}
                    className="py-2 px-3 rounded-xl bg-[#38bdf8]/10 hover:bg-[#38bdf8]/20 border border-[#38bdf8]/30 text-[#38bdf8] text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                    title="Confirmar inmediatamente en el sistema que el paciente asistirá"
                  >
                    <span>👤</span>
                    <span>Confirmar a mano</span>
                  </button>

                  <button
                    type="button"
                    onClick={onConfirmAgent}
                    className="py-2 px-3 rounded-xl bg-[#00e5a0]/10 hover:bg-[#00e5a0]/20 border border-[#00e5a0]/30 text-[#00e5a0] text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                    title="Enviar mensaje de WhatsApp interactivo para que el Agente IA confirme"
                  >
                    <span>🤖</span>
                    <span>Confirmar con Agente</span>
                  </button>
                </div>

                {/* Vista previa del mensaje del Agente IA y enlace WhatsApp */}
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAgentPreview(p => !p)}
                    className="text-[#7a95aa] hover:text-[#00e5a0] underline transition cursor-pointer"
                  >
                    {showAgentPreview ? 'Ocultar plantilla del Agente' : 'Ver mensaje del Agente IA'}
                  </button>

                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#25D366] hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>💬 WhatsApp directo</span>
                    </a>
                  )}
                </div>

                {showAgentPreview && (
                  <div className="p-2.5 rounded-xl bg-[#070a0e] border border-[#1e2d3d] text-[11px] text-[#7a95aa] leading-relaxed space-y-1">
                    <p className="text-[#dde6ef] font-semibold text-[10px] uppercase font-mono">Mensaje automático WhatsApp:</p>
                    <p>
                      &ldquo;Hola <b>{modal.patient_name || 'Paciente'}</b>, te escribimos de Consultorio APEX para confirmar tu cita médica agendada para el <b>{modal.fecha}</b> a las <b>{modal.hora} hrs</b>.
                      <br />Responde: <b>1</b> para Confirmar o <b>2</b> para Reprogramar.&rdquo;
                    </p>
                  </div>
                )}
              </div>
            )}

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
                  <div className="absolute z-40 left-0 right-0 mt-1 bg-[#111820] border border-[#1e2d3d] rounded-xl shadow-2xl overflow-hidden max-h-52 overflow-y-auto">
                    {sug.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pick(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-[#162231] text-xs text-[#dde6ef] border-b last:border-b-0 border-[#1e2d3d]/50 flex items-center justify-between cursor-pointer"
                      >
                        <span className="font-semibold">{p.full_name}</span>
                        <span className="text-[11px] text-[#7a95aa] font-mono">{p.phone || p.email || ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                {modal.patient_id && (
                  <p className="text-[10px] text-[#00e5a0] mt-1 flex items-center gap-1 font-semibold">
                    <span>✓</span> Paciente registrado en el sistema
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa]">Teléfono</label>
                  <input
                    className={inp}
                    placeholder="Teléfono (para WhatsApp)"
                    value={modal.patient_phone || ''}
                    onChange={e => setModal({ ...modal, patient_phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa]">Correo</label>
                  <input
                    className={inp}
                    placeholder="Correo electrónico"
                    value={modal.patient_email || ''}
                    onChange={e => setModal({ ...modal, patient_email: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Fecha y Horario (Soporta consultas y estudios clínicos largos de 1h, 2h, 3h, 4h) */}
            <div className="space-y-2.5 pt-2 border-t border-[#1e2d3d]/60">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
                  Fecha y Horario *
                </label>
                <span className="text-[11px] font-mono text-[#00e5a0] font-semibold">
                  Término: {horaFinActual} hrs ({formatoDuracion(modal.dur)})
                </span>
              </div>
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
                    onChange={e => {
                      if (onHoraChange) onHoraChange(e.target.value);
                      else setModal({ ...modal, hora: e.target.value, error: '' });
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-[#7a95aa]">Duración (consultas y estudios largos)</label>
                  <span className="text-[10px] text-[#7a95aa] font-mono">Total: {formatoDuracion(modal.dur)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {[
                    { d: 30, lbl: '30m' },
                    { d: 45, lbl: '45m' },
                    { d: 60, lbl: '1h' },
                    { d: 90, lbl: '1.5h' },
                    { d: 120, lbl: '2h' },
                    { d: 180, lbl: '3h' },
                    { d: 240, lbl: '4h' },
                  ].map(({ d, lbl }) => {
                    const active = modal.dur === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          if (onDurationChange) onDurationChange(d);
                          else setModal({ ...modal, dur: d, error: '' });
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          active
                            ? 'bg-[#00e5a0] text-[#051b14] border-[#00e5a0] shadow-sm font-bold'
                            : 'bg-[#111820] border-[#1e2d3d] text-[#dde6ef] hover:border-[#4b6377]'
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                  <div className="flex items-center gap-1 ml-1">
                    <input
                      type="number"
                      min={10}
                      step={15}
                      value={modal.dur}
                      onChange={e => {
                        const val = Math.max(10, +e.target.value || 30);
                        if (onDurationChange) onDurationChange(val);
                        else setModal({ ...modal, dur: val, error: '' });
                      }}
                      className="w-16 px-2 py-1 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-xs text-center outline-none focus:border-[#00e5a0]"
                      title="Minutos personalizados"
                    />
                    <span className="text-[11px] text-[#7a95aa]">min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Profesional y Sede */}
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
                Detalles y Notas
              </label>
              <input
                className={inp}
                placeholder="Motivo de consulta o estudio (ej. Tomografía 3h, Primera vez, Control)"
                value={modal.reason || ''}
                onChange={e => setModal({ ...modal, reason: e.target.value })}
              />
              <textarea
                className={inp}
                placeholder="Notas internas de recepción o historial de confirmación..."
                rows={2}
                value={modal.notes || ''}
                onChange={e => setModal({ ...modal, notes: e.target.value })}
              />
            </div>

            {/* Selector de Estado */}
            {modal.mode === 'edit' && (
              <div className="space-y-2 pt-2 border-t border-[#1e2d3d]/60">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold">
                  Estado de la Cita
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(ESTADO).map(([k, v]) => {
                    const active = modal.status === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setModal({ ...modal, status: k })}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5"
                        style={{
                          background: active ? v.bg : '#111820',
                          borderColor: active ? v.color : '#1e2d3d',
                          color: active ? v.color : '#7a95aa',
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />
                        <span className="truncate">{v.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Error */}
            {modal.error && (
              <div className="text-xs text-[#f43f5e] bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-xl p-3">
                {modal.error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#1e2d3d] bg-[#111820]/80 flex items-center gap-2 shrink-0">
        {modal.mode === 'edit' && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-[#f43f5e] border border-[#f43f5e]/30 hover:bg-[#f43f5e]/10 transition cursor-pointer"
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
        {isBlockTab ? (
          <button
            type="button"
            onClick={onSaveBlock}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#f43f5e] hover:bg-[#e11d48] transition cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <span>🚫</span>
            <span>Guardar bloqueo ({formatoDuracion(modal.dur)})</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-md flex items-center gap-1.5"
            style={{ background: 'var(--c-green)', color: 'var(--c-primary-fg)' }}
          >
            <span>{modal.mode === 'create' ? '🩺' : '✓'}</span>
            <span>
              {modal.mode === 'create'
                ? `Apartar cita / estudio (${formatoDuracion(modal.dur)})`
                : 'Guardar cambios'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── MODAL DE CONFIGURACIÓN DE HORARIOS DE CONSULTA ──
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
    <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <p className="font-bold text-[#dde6ef] text-base mb-1">Horario de Consultas</p>
        <p className="text-xs text-[#7a95aa] mb-4">Define los días y franjas horarias en que se atienden pacientes.</p>

        {ctx.locations.length > 1 && (
          <select value={locId} onChange={e => setLocId(e.target.value)} className={`${inp} mb-4 text-xs`}>
            {ctx.locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}

        <div className="space-y-2">
          {rows.map((r, wd) => (
            <div key={wd} className="flex items-center gap-2 flex-wrap p-2 rounded-xl bg-[#111820] border border-[#1e2d3d]/50">
              <label className="flex items-center gap-2 w-24 shrink-0 text-xs font-bold text-[#dde6ef] cursor-pointer">
                <input
                  type="checkbox"
                  checked={r.abierto}
                  onChange={e => upd(wd, 'abierto', e.target.checked)}
                  className="accent-[#00e5a0]"
                />
                {DIAS_LARGO[wd].slice(0, 3)}
              </label>

              {r.abierto ? (
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <input
                    type="time"
                    value={r.m_o}
                    onChange={e => upd(wd, 'm_o', e.target.value)}
                    className="px-2 py-1 bg-[#070a0e] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-xs font-mono"
                  />
                  <span className="text-[#7a95aa]">–</span>
                  <input
                    type="time"
                    value={r.m_c}
                    onChange={e => upd(wd, 'm_c', e.target.value)}
                    className="px-2 py-1 bg-[#070a0e] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-xs font-mono"
                  />
                  <span className="text-[#4b6377] mx-1">y</span>
                  <input
                    type="time"
                    value={r.t_o}
                    onChange={e => upd(wd, 't_o', e.target.value)}
                    className="px-2 py-1 bg-[#070a0e] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-xs font-mono"
                    placeholder="tarde"
                  />
                  <span className="text-[#7a95aa]">–</span>
                  <input
                    type="time"
                    value={r.t_c}
                    onChange={e => upd(wd, 't_c', e.target.value)}
                    className="px-2 py-1 bg-[#070a0e] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-xs font-mono"
                  />
                </div>
              ) : (
                <span className="text-xs text-[#4b6377] italic">Cerrado</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-[#7a95aa] hover:text-[#dde6ef] transition cursor-pointer">
            Cerrar
          </button>
          <button
            onClick={save}
            className="px-5 py-2 rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
            style={{ background: 'var(--c-green)', color: 'var(--c-primary-fg)' }}
          >
            Guardar horario
          </button>
        </div>
      </div>
    </div>
  );
}
