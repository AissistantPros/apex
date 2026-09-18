'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSession } from '@/app/lib/auth';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const HOUR_START = 7, HOUR_END = 21, HOUR_PX = 54;
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

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
  const r = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
  return r.json();
}

function monday(d: Date) {
  const x = new Date(d); const day = (x.getDay() + 6) % 7; // Lun=0
  x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x;
}
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

type Appt = {
  id: string; starts_at: string; ends_at?: string; location_id?: string; doctor_id?: string;
  patient_name?: string; patient_phone?: string; reason?: string; notes?: string; status: string;
};
type Ctx = { locations: { id: string; name: string }[]; doctors: { id: string; display_name: string }[]; role: string };

export default function AgendaPage() {
  const [wkStart, setWkStart] = useState(() => monday(new Date()));
  const [appts, setAppts] = useState<Appt[]>([]);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [fLoc, setFLoc] = useState('');
  const [fDoc, setFDoc] = useState('');
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState<any>(null); // {mode:'create'|'edit', ...}
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(wkStart); d.setDate(d.getDate() + i); return d; }), [wkStart]);
  const hours = useMemo(() => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i), []);

  useEffect(() => { api('/appointments/context').then(setCtx).catch(e => flash(e.message)); }, []);

  const load = useCallback(async () => {
    try {
      const desde = new Date(wkStart).toISOString();
      const hasta = new Date(new Date(wkStart).setDate(wkStart.getDate() + 7)).toISOString();
      const qs = new URLSearchParams({ desde, hasta });
      if (fLoc) qs.set('location_id', fLoc);
      if (fDoc) qs.set('doctor_id', fDoc);
      const d = await api(`/appointments?${qs.toString()}`);
      setAppts(d.appointments || []);
    } catch (e: any) { flash(e.message); }
  }, [wkStart, fLoc, fDoc]);
  useEffect(() => { load(); }, [load]);

  const docName = (id?: string) => ctx?.doctors.find(d => d.id === id)?.display_name || '';
  const locName = (id?: string) => ctx?.locations.find(l => l.id === id)?.name || '';

  const openCreate = (day: Date, hour: number, min = 0) => {
    const start = new Date(day); start.setHours(hour, min, 0, 0);
    setModal({ mode: 'create', fecha: ymd(start), hora: hm(start), dur: 30,
      doctor_id: fDoc || ctx?.doctors[0]?.id || '', location_id: fLoc || ctx?.locations[0]?.id || '',
      patient_name: '', patient_phone: '', reason: '', notes: '', status: 'scheduled' });
  };
  const openEdit = (a: Appt) => {
    const s = new Date(a.starts_at);
    const dur = a.ends_at ? Math.round((+new Date(a.ends_at) - +s) / 60000) : 30;
    setModal({ mode: 'edit', id: a.id, fecha: ymd(s), hora: hm(s), dur,
      doctor_id: a.doctor_id || '', location_id: a.location_id || '',
      patient_name: a.patient_name || '', patient_phone: a.patient_phone || '',
      reason: a.reason || '', notes: a.notes || '', status: a.status });
  };

  const save = async () => {
    const m = modal;
    if (!m.patient_name.trim()) return flash('Escribe el nombre del paciente');
    const start = new Date(`${m.fecha}T${m.hora}`);
    const end = new Date(+start + m.dur * 60000);
    const payload = {
      starts_at: start.toISOString(), ends_at: end.toISOString(),
      location_id: m.location_id || null, doctor_id: m.doctor_id || null,
      patient_name: m.patient_name, patient_phone: m.patient_phone, reason: m.reason,
      notes: m.notes, status: m.status,
    };
    try {
      if (m.mode === 'create') await api('/appointments', { method: 'POST', body: JSON.stringify(payload) });
      else await api(`/appointments/${m.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setModal(null); load();
    } catch (e: any) { flash(e.message); }
  };
  const cancelar = async () => {
    if (!confirm('¿Cancelar esta cita?')) return;
    try { await api(`/appointments/${modal.id}`, { method: 'DELETE' }); setModal(null); load(); } catch (e: any) { flash(e.message); }
  };

  const today = ymd(new Date());

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-6 max-w-[1100px] mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h1 className="text-2xl font-serif font-semibold text-[#dde6ef]">📅 Agenda</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setWkStart(w => { const x = new Date(w); x.setDate(x.getDate() - 7); return x; })} className="px-2.5 py-1.5 rounded-lg bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef]">‹</button>
            <button onClick={() => setWkStart(monday(new Date()))} className="px-3 py-1.5 rounded-lg bg-[#0d1520] border border-[#1e2d3d] text-[#00e5a0] text-sm">Hoy</button>
            <button onClick={() => setWkStart(w => { const x = new Date(w); x.setDate(x.getDate() + 7); return x; })} className="px-2.5 py-1.5 rounded-lg bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef]">›</button>
          </div>
          <span className="text-sm text-[#7a95aa]">
            {days[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
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
          <button onClick={() => openCreate(new Date(), Math.max(HOUR_START, Math.min(HOUR_END - 1, new Date().getHours())))}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold" style={{ background: '#00e5a0', color: '#000' }}>+ Nueva cita</button>
        </div>

        {msg && <div className="mb-3 text-sm px-4 py-2 rounded-lg bg-[rgba(244,63,94,.1)] border border-[#f43f5e44] text-[#f43f5e]">{msg}</div>}

        {/* Calendario semanal */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-x-auto">
          <div className="min-w-[760px]">
            {/* Encabezado de días */}
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
              <div className="border-b border-r border-[#1e2d3d]" />
              {days.map((d, i) => {
                const isToday = ymd(d) === today;
                return (
                  <div key={i} className="border-b border-r border-[#1e2d3d] px-2 py-2 text-center">
                    <p className="text-[11px] text-[#7a95aa]">{DIAS[i]}</p>
                    <p className="text-sm font-semibold" style={{ color: isToday ? '#00e5a0' : '#dde6ef' }}>{d.getDate()}</p>
                  </div>
                );
              })}
            </div>
            {/* Rejilla de horas */}
            <div className="grid relative" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
              {/* Gutter de horas */}
              <div>
                {hours.map(h => (
                  <div key={h} className="border-r border-b border-[#1e2d3d] text-[10px] text-[#7a95aa] pr-1 text-right" style={{ height: HOUR_PX }}>{pad(h)}:00</div>
                ))}
              </div>
              {/* Columnas de días */}
              {days.map((day, di) => (
                <div key={di} className="relative border-r border-[#1e2d3d]">
                  {hours.map(h => (
                    <div key={h} className="border-b border-[#1e2d3d] hover:bg-[#111820] cursor-pointer transition"
                      style={{ height: HOUR_PX }}
                      onClick={e => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const min = Math.round(((e.clientY - rect.top) / HOUR_PX) * 60 / 15) * 15;
                        openCreate(day, h, Math.min(45, min));
                      }} />
                  ))}
                  {/* Citas del día */}
                  {appts.filter(a => ymd(new Date(a.starts_at)) === ymd(day)).map(a => {
                    const s = new Date(a.starts_at);
                    const durMin = a.ends_at ? (+new Date(a.ends_at) - +s) / 60000 : 30;
                    const top = ((s.getHours() + s.getMinutes() / 60) - HOUR_START) * HOUR_PX;
                    const height = Math.max(20, (durMin / 60) * HOUR_PX - 2);
                    const col = ESTADO[a.status]?.color || '#0ea5e9';
                    if (top < -HOUR_PX) return null;
                    return (
                      <button key={a.id} onClick={(e) => { e.stopPropagation(); openEdit(a); }}
                        className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 text-left overflow-hidden"
                        style={{ top, height, background: col + '26', borderLeft: `3px solid ${col}` }}>
                        <p className="text-[10px] font-semibold text-[#dde6ef] truncate leading-tight">{hm(s)} {a.patient_name}</p>
                        {height > 30 && <p className="text-[9px] text-[#7a95aa] truncate">{docName(a.doctor_id) || a.reason || ''}</p>}
                        {a.status === 'cancelled' && <span className="text-[8px] text-[#f43f5e]">cancelada</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-[#3d5870] mt-2">Toca un espacio libre para agendar, o una cita para editarla.</p>
      </main>

      {/* Modal crear/editar */}
      {modal && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[#dde6ef] mb-3">{modal.mode === 'create' ? 'Nueva cita' : 'Editar cita'}</p>
            <div className="space-y-2.5">
              <input className={inp} placeholder="Nombre del paciente" value={modal.patient_name} onChange={e => setModal({ ...modal, patient_name: e.target.value })} />
              <input className={inp} placeholder="Teléfono (opcional)" value={modal.patient_phone} onChange={e => setModal({ ...modal, patient_phone: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] text-[#7a95aa] uppercase">Fecha</label><input type="date" className={inp} value={modal.fecha} onChange={e => setModal({ ...modal, fecha: e.target.value })} /></div>
                <div><label className="text-[10px] text-[#7a95aa] uppercase">Hora</label><input type="time" className={inp} value={modal.hora} onChange={e => setModal({ ...modal, hora: e.target.value })} /></div>
              </div>
              <div><label className="text-[10px] text-[#7a95aa] uppercase">Duración</label>
                <select className={inp} value={modal.dur} onChange={e => setModal({ ...modal, dur: +e.target.value })}>
                  {[15, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
              {ctx && ctx.doctors.length > 0 && (
                <div><label className="text-[10px] text-[#7a95aa] uppercase">Doctor</label>
                  <select className={inp} value={modal.doctor_id} onChange={e => setModal({ ...modal, doctor_id: e.target.value })}>
                    <option value="">— Sin asignar —</option>
                    {ctx.doctors.map(d => <option key={d.id} value={d.id}>{d.display_name}</option>)}
                  </select>
                </div>
              )}
              {ctx && ctx.locations.length > 0 && (
                <div><label className="text-[10px] text-[#7a95aa] uppercase">Ubicación</label>
                  <select className={inp} value={modal.location_id} onChange={e => setModal({ ...modal, location_id: e.target.value })}>
                    <option value="">— Sin ubicación —</option>
                    {ctx.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              <input className={inp} placeholder="Motivo (opcional)" value={modal.reason} onChange={e => setModal({ ...modal, reason: e.target.value })} />
              <textarea className={inp} placeholder="Notas (opcional)" rows={2} value={modal.notes} onChange={e => setModal({ ...modal, notes: e.target.value })} />
              {modal.mode === 'edit' && (
                <div><label className="text-[10px] text-[#7a95aa] uppercase">Estado</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {Object.entries(ESTADO).map(([k, v]) => (
                      <button key={k} onClick={() => setModal({ ...modal, status: k })}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition"
                        style={{ background: modal.status === k ? v.color : '#111820', borderColor: modal.status === k ? v.color : '#2a3a4d', color: modal.status === k ? '#000' : '#dde6ef' }}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              {modal.mode === 'edit' && <button onClick={cancelar} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-[#f43f5e] border border-[#f43f5e]/40">Cancelar cita</button>}
              <div className="flex-1" />
              <button onClick={() => setModal(null)} className="px-4 py-2.5 rounded-lg text-sm text-[#7a95aa]">Cerrar</button>
              <button onClick={save} className="px-5 py-2.5 rounded-lg text-sm font-bold" style={{ background: '#00e5a0', color: '#000' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
