'use client';

/**
 * SALA DE ESPERA — COCKPIT CLÍNICO DEL DÍA (APEX COMMAND CENTER)
 * Centro de operaciones clínicas en tiempo real para médico y recepción:
 * 1. KPIs del pulso del día (En sala ahora, Programados hoy, Atendidos hoy, Tiempo prom).
 * 2. Hero Card del paciente siguiente en turno (#1 "SIGUE") con alertas médicas y botón directo.
 * 3. Cola activa de espera (#2, #3...).
 * 4. Pestaña de citas programadas para hoy (con check-in a sala en 1 clic) y citas atendidas hoy.
 * 5. Panel lateral de Pre-consulta Express (ficha rápida, WhatsApp directo, resumen IA y pizarra de notas).
 */

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';
import { useEntitlements } from '@/app/lib/useEntitlements';
import { mix } from '@/app/lib/ui';
import Icon from '@/app/components/Icon';
import CheckInModal from '@/app/components/CheckInModal';
import TriajeModal from '@/app/components/TriajeModal';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

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
    throw new Error(d.detail || `Ocurrió un problema (error ${r.status}).`);
  }
  return r.json();
}

const STAGE: Record<string, { label: string; color: string; phase: number }> = {
  nursing: { label: 'Espera enfermería', color: 'var(--c-orange)', phase: 2 },
  doctor:  { label: 'Espera doctor',     color: 'var(--c-violet)', phase: 3 },
};

const esperaMin = (iso?: string) => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
};

const formatoEspera = (iso?: string) => {
  const min = esperaMin(iso);
  if (min < 1) return 'recién llegado';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h}h ${min % 60}m`;
};

const hm = (iso?: string) => {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function SalaPage() {
  const router = useRouter();
  const { lite, team } = useEntitlements();
  const [waiting, setWaiting] = useState<any[]>([]);
  const [scheduledToday, setScheduledToday] = useState<any[]>([]);
  const [attendedToday, setAttendedToday] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ waiting: 0, scheduled_today: 0, attended_today: 0, total_today: 0 });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [tabDia, setTabDia] = useState<'programados' | 'atendidos'>('programados');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [brief, setBrief] = useState<any>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [doctorStatus, setDoctorStatus] = useState<'disponible' | 'en_consulta' | 'receso'>('disponible');
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [triajeModalOpen, setTriajeModalOpen] = useState(false);
  const [triajePatient, setTriajePatient] = useState<any | null>(null);

  const abrirTriaje = (p: any) => {
    setTriajePatient(p);
    setTriajeModalOpen(true);
  };

  // Pizarra de notas rápidas de sala (persistida en localStorage)
  const [notasPizarra, setNotasPizarra] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('apex_sala_pizarra') || '';
  });

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(''), 4000);
  };

  const load = () => {
    api('/appointments/waitroom')
      .then(d => {
        setWaiting(d.waiting || []);
        setScheduledToday(d.scheduled_today || []);
        setAttendedToday(d.attended_today || []);
        setStats(d.stats || { waiting: (d.waiting || []).length, scheduled_today: 0, attended_today: 0, total_today: 0 });
        setLoading(false);
        // Si no hay seleccionado o el seleccionado ya no está, auto-seleccionar el #1
        if (!selectedPatient && d.waiting && d.waiting.length > 0) {
          setSelectedPatient(d.waiting[0]);
        }
      })
      .catch(e => {
        flash(e.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    const role = getRole();
    if (role !== 'doctor' && role !== 'nurse' && role !== 'receptionist' && role !== 'admin') {
      router.replace('/dashboard');
      return;
    }
    load();
    const t = setInterval(load, 20000); // Actualización en vivo cada 20 segundos
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  const isDoctor = getRole() === 'doctor';

  const atender = (p: any) => {
    if (isDoctor && lite) {
      router.push(`/dashboard/patient/${p.id}/consulta`);
      return;
    }
    const ph = (!team.has_nurse && isDoctor) ? 2 : (STAGE[p.stage]?.phase || 2);
    router.push(`/dashboard/new-patient/flow?patient_id=${p.id}&phase=${ph}`);
  };

  const verResumen = async (p: any) => {
    setBrief({ loading: true, p });
    setBriefLoading(true);
    try {
      const d = await api(`/appointments/patient-brief/${p.id}`);
      setBrief({ ...d, p });
    } catch (e: any) {
      flash(e.message);
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
  };

  // Check-in de paciente programado para pasarlo a sala de espera
  const checkInCita = async (apptId: string) => {
    try {
      await api(`/appointments/${apptId}/check-in`, { method: 'POST' });
      flash('✓ Paciente registrado en sala de espera.');
      load();
    } catch (e: any) {
      flash(e.message);
    }
  };

  // Guardar notas en pizarra
  const guardarNotaPizarra = (val: string) => {
    setNotasPizarra(val);
    try {
      localStorage.setItem('apex_sala_pizarra', val);
    } catch {
      /* */
    }
  };

  // Tiempo promedio de espera en minutos
  const tiempoPromedioEspera = useMemo(() => {
    if (!waiting.length) return 0;
    const total = waiting.reduce((acc, p) => acc + esperaMin(p.esperando_desde), 0);
    return Math.round(total / waiting.length);
  }, [waiting]);

  // Paciente en turno #1 (SIGUE)
  const primerPaciente = waiting[0] || null;

  // Paciente actualmente inspeccionado en el panel derecho (por defecto el #1 o el seleccionado)
  const activoPreview = selectedPatient || primerPaciente || (scheduledToday[0] ? {
    id: scheduledToday[0].patient_id,
    full_name: scheduledToday[0].patient_name,
    phone: scheduledToday[0].patient_phone,
    email: scheduledToday[0].patient_email,
    nota_recepcion: scheduledToday[0].notes || scheduledToday[0].reason,
    alergias: '',
  } : null);

  const whatsappDirectoUrl = useMemo(() => {
    if (!activoPreview?.phone) return null;
    const clean = activoPreview.phone.replace(/\D/g, '');
    if (!clean) return null;
    const msg = encodeURIComponent(`Hola ${activoPreview.full_name || 'paciente'}, le escribimos de Consultorio APEX respecto a su turno de atención.`);
    return `https://wa.me/${clean}?text=${msg}`;
  }, [activoPreview]);

  return (
    <div className="min-h-screen bg-[#070a0e] text-[#dde6ef]">
      <main className="page-content pt-16 px-4 sm:px-6 py-6 max-w-7xl mx-auto space-y-6">

        {/* ── 1. CABECERA PRINCIPAL & ESTADO DEL MÉDICO ── */}
        <div className="pb-3 border-b border-[#1e2d3d]/60 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-[#00e5a0]/15 text-[#00e5a0] flex items-center justify-center font-bold">
                <Icon name="bell" size={20} />
              </span>
              <div>
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#dde6ef]">Sala de Espera</h1>
                <p className="text-xs sm:text-sm text-[#7a95aa] mt-0.5">Centro de operaciones y flujo de pacientes en vivo</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Selector de estado del médico en consultorio */}
            <div className="inline-flex rounded-xl bg-[#111820] border border-[#1e2d3d] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDoctorStatus('disponible')}
                className={`px-3 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  doctorStatus === 'disponible' ? 'bg-[#00e5a0]/15 text-[#00e5a0] font-bold' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#00e5a0]" />
                <span>Disponible</span>
              </button>
              <button
                type="button"
                onClick={() => setDoctorStatus('en_consulta')}
                className={`px-3 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  doctorStatus === 'en_consulta' ? 'bg-[#f59e0b]/15 text-[#f59e0b] font-bold' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                <span>En consulta</span>
              </button>
              <button
                type="button"
                onClick={() => setDoctorStatus('receso')}
                className={`px-3 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  doctorStatus === 'receso' ? 'bg-[#94a3b8]/20 text-[#94a3b8] font-bold' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#94a3b8]" />
                <span>En pausa</span>
              </button>
            </div>

            {/* Botón estelar: Registrar Visita / Check-in */}
            <button
              type="button"
              onClick={() => setCheckInModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#00e5a0] text-[#051b14] text-xs font-bold hover:bg-[#00c98c] transition cursor-pointer shadow-md flex items-center gap-1.5 active:scale-95"
            >
              <span>📥</span>
              <span>Registrar Visita / Check-in</span>
            </button>

            {/* Botón de refresco manual */}
            <button
              type="button"
              onClick={load}
              className="p-2 rounded-xl bg-[#111820] border border-[#1e2d3d] text-[#7a95aa] hover:text-[#dde6ef] hover:border-[#00e5a0] transition cursor-pointer"
              title="Actualizar lista ahora"
            >
              <Icon name="search" size={16} />
            </button>
          </div>
        </div>

        {msg && (
          <div className="text-sm px-4 py-2.5 rounded-xl bg-[#f43f5e]/10 border border-[#f43f5e]/30 text-[#f43f5e] animate-in fade-in">
            {msg}
          </div>
        )}

        {/* ── 2. PULSO OPERATIVO DEL DÍA (4 KPIS EN VIVO) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-[#0d1520] border border-[#1e2d3d] shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#00e5a0]/15 text-[#00e5a0] flex items-center justify-center font-bold text-lg">
              {waiting.length}
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#7a95aa]">En Sala Ahora</p>
              <p className="text-xs text-[#00e5a0] font-semibold mt-0.5">
                {waiting.length === 0 ? 'Sin fila física' : `Espera prom: ${tiempoPromedioEspera}m`}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0d1520] border border-[#1e2d3d] shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#38bdf8]/15 text-[#38bdf8] flex items-center justify-center font-bold text-lg">
              {stats.scheduled_today || scheduledToday.length}
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#7a95aa]">Citas de Hoy</p>
              <p className="text-xs text-[#38bdf8] font-semibold mt-0.5">Por llegar a consulta</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0d1520] border border-[#1e2d3d] shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#a855f7]/15 text-[#a855f7] flex items-center justify-center font-bold text-lg">
              {stats.attended_today || attendedToday.length}
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#7a95aa]">Atendidos Hoy</p>
              <p className="text-xs text-[#a855f7] font-semibold mt-0.5">Consultas concluidas</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0d1520] border border-[#1e2d3d] shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#f59e0b]/15 text-[#f59e0b] flex items-center justify-center font-bold text-lg">
              {stats.total_today || (waiting.length + scheduledToday.length + attendedToday.length)}
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#7a95aa]">Total del Día</p>
              <p className="text-xs text-[#f59e0b] font-semibold mt-0.5">Pacientes en agenda</p>
            </div>
          </div>
        </div>

        {/* ── 3. CUERPO PRINCIPAL: 2 COLUMNAS (FLUJO DEL DÍA 65% + COCKPIT AUXILIAR 35%) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* ── COLUMNA IZQUIERDA: HERO CARD + COLA + PESTAÑAS DEL DÍA (65%) ── */}
          <div className="lg:col-span-7 space-y-6">

            {/* A. HERO CARD: SIGUIENTE PACIENTE EN TURNO (#1 "SIGUE") */}
            {primerPaciente ? (
              <div className="bg-[#0d1520] border-2 border-[#00e5a0] rounded-2xl p-5 sm:p-6 shadow-[0_0_30px_rgba(0,229,160,0.12)] relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-[#00e5a0] text-[#051b14] font-bold text-[10px] uppercase font-mono tracking-wider px-3 py-1 rounded-bl-xl shadow-sm">
                  Turno #1 · Siguiente en Consulta
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-1">
                  {/* Avatar circular con badge de orden */}
                  <div className="relative shrink-0">
                    <div className="w-16 h-16 rounded-full bg-[#162231] border-2 border-[#00e5a0] text-[#00e5a0] font-bold text-2xl flex items-center justify-center shadow-md">
                      {primerPaciente.full_name?.slice(0, 2).toUpperCase() || 'P'}
                    </div>
                    <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#00e5a0] text-[#051b14] text-xs font-black flex items-center justify-center shadow-md">
                      1
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-[#dde6ef] truncate">{primerPaciente.full_name}</h2>
                      {primerPaciente.edad != null && (
                        <span className="text-xs font-mono text-[#7a95aa] bg-[#111820] px-2 py-0.5 rounded-md">
                          {primerPaciente.edad} años
                        </span>
                      )}
                      {primerPaciente.sexo && (
                        <span className="text-xs font-mono text-[#7a95aa] bg-[#111820] px-2 py-0.5 rounded-md capitalize">
                          {primerPaciente.sexo}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#7a95aa]">
                      <span className="inline-flex items-center gap-1 font-semibold text-[#00e5a0]">
                        <span className="w-2 h-2 rounded-full bg-[#00e5a0] animate-pulse" />
                        Esperando {formatoEspera(primerPaciente.esperando_desde)}
                      </span>
                      <span>·</span>
                      <span className="text-[#a78bfa]">{STAGE[primerPaciente.stage]?.label || 'Espera doctor'}</span>
                    </div>

                    {/* Alergias en alerta médica roja destacada */}
                    {primerPaciente.alergias && (
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#f43f5e] bg-[#f43f5e]/15 border border-[#f43f5e]/30 px-2.5 py-1 rounded-lg mt-1">
                        <span>⚠️ Alergias:</span>
                        <span>{primerPaciente.alergias}</span>
                      </div>
                    )}

                    {/* Enfermedades crónicas */}
                    {primerPaciente.chronic_diseases && (
                      <p className="text-xs text-[#f59e0b] truncate">
                        <b>Crónicas:</b> {primerPaciente.chronic_diseases}
                      </p>
                    )}

                    {/* Nota de recepción */}
                    {primerPaciente.nota_recepcion && (
                      <p className="text-xs text-[#7a95aa] bg-[#111820] p-2 rounded-xl border border-[#1e2d3d]/60 mt-1 line-clamp-2">
                        <span className="text-[#38bdf8] font-semibold">Nota de recepción:</span> {primerPaciente.nota_recepcion}
                      </p>
                    )}
                  </div>
                </div>

                {/* Acciones principales de atención */}
                <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-[#1e2d3d]">
                  <button
                    type="button"
                    onClick={() => atender(primerPaciente)}
                    className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-[#051b14] bg-[#00e5a0] hover:bg-[#00c98c] shadow-[0_4px_16px_rgba(0,229,160,0.3)] active:scale-95 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>🩺</span>
                    <span>Atender consulta ahora</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => abrirTriaje(primerPaciente)}
                    className="py-2.5 px-3.5 rounded-xl text-xs font-bold text-[#38bdf8] bg-[#38bdf8]/10 border border-[#38bdf8]/30 hover:bg-[#38bdf8]/20 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>📋</span>
                    <span>Signos / Triaje</span>
                  </button>

                  {isDoctor && (
                    <button
                      type="button"
                      onClick={() => verResumen(primerPaciente)}
                      className="py-2.5 px-3.5 rounded-xl text-xs font-bold text-[#a78bfa] bg-[#a78bfa]/10 border border-[#a78bfa]/30 hover:bg-[#a78bfa]/20 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>🤖</span>
                      <span>Resumen IA</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/patient/${primerPaciente.id}`)}
                    className="py-2.5 px-3.5 rounded-xl text-xs font-semibold text-[#7a95aa] bg-[#111820] border border-[#1e2d3d] hover:text-[#dde6ef] hover:border-[#4b6377] transition cursor-pointer"
                  >
                    Expediente completo
                  </button>
                </div>
              </div>
            ) : (
              /* Tarjeta de sala despejada */
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#00e5a0]/15 text-[#00e5a0] flex items-center justify-center mx-auto text-xl">
                  ✓
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#dde6ef]">La sala de espera física está despejada</h3>
                  <p className="text-xs text-[#7a95aa] mt-1">
                    No hay pacientes esperando en este momento. Revisa las citas programadas abajo para dar check-in al llegar.
                  </p>
                </div>
              </div>
            )}

            {/* B. COLA ACTIVA DE ESPERA (Pacientes #2, #3...) */}
            {waiting.length > 1 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#7a95aa]">
                    Siguientes en fila de espera ({waiting.length - 1})
                  </h3>
                  <span className="text-[11px] text-[#4b6377]">En orden de llegada</span>
                </div>

                <div className="space-y-2">
                  {waiting.slice(1).map((p, idx) => {
                    const st = STAGE[p.stage] || { label: p.stage, color: 'var(--c-text-2)' };
                    const isSelected = selectedPatient?.id === p.id;
                    const mins = esperaMin(p.esperando_desde);

                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPatient(p)}
                        className={`bg-[#0d1520] border rounded-2xl p-3.5 flex items-center justify-between gap-3 hover:border-[#00e5a0]/50 transition cursor-pointer ${
                          isSelected ? 'border-[#00e5a0] shadow-md' : 'border-[#1e2d3d]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#162231] text-[#7a95aa] font-bold text-xs flex items-center justify-center shrink-0">
                            #{idx + 2}
                          </div>

                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-[#dde6ef] truncate">{p.full_name}</p>
                            <div className="flex items-center gap-2 text-[11px] text-[#7a95aa] mt-0.5">
                              {p.edad != null && <span>{p.edad} años ·</span>}
                              <span className={mins > 25 ? 'text-[#f59e0b] font-semibold' : ''}>
                                {formatoEspera(p.esperando_desde)}
                              </span>
                              {p.alergias && <span className="text-[#f43f5e] truncate">⚠️ {p.alergias}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ color: st.color, background: mix(st.color, 12) }}>
                            {st.label}
                          </span>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              abrirTriaje(p);
                            }}
                            className="px-2.5 py-1 rounded-xl text-xs font-bold text-[#38bdf8] bg-[#38bdf8]/10 border border-[#38bdf8]/30 hover:bg-[#38bdf8]/20 transition cursor-pointer"
                          >
                            Triaje
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              atender(p);
                            }}
                            className="px-3 py-1 rounded-xl text-xs font-bold text-[#051b14] bg-[#00e5a0] hover:bg-[#00c98c] transition cursor-pointer"
                          >
                            Atender
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* C. PESTAÑAS DE LA JORNADA: PROGRAMADOS HOY Y ATENDIDOS HOY */}
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden shadow-sm">
              <div className="border-b border-[#1e2d3d] bg-[#111820] px-4 py-2 flex items-center justify-between">
                <div className="inline-flex rounded-xl bg-[#070a0e] border border-[#1e2d3d] p-0.5">
                  <button
                    type="button"
                    onClick={() => setTabDia('programados')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      tabDia === 'programados' ? 'bg-[#38bdf8]/20 text-[#38bdf8] font-bold' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                    }`}
                  >
                    📅 Citas de hoy ({scheduledToday.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTabDia('atendidos')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      tabDia === 'atendidos' ? 'bg-[#a855f7]/20 text-[#a855f7] font-bold' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                    }`}
                  >
                    ✅ Atendidos hoy ({attendedToday.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => router.push('/dashboard/agenda')}
                  className="text-xs text-[#00e5a0] hover:underline font-semibold"
                >
                  Ver agenda completa →
                </button>
              </div>

              <div className="p-4">
                {tabDia === 'programados' ? (
                  scheduledToday.length === 0 ? (
                    <div className="text-center py-8 text-[#7a95aa] text-xs">
                      No hay citas adicionales programadas para el resto de hoy.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scheduledToday.map(a => {
                        const esConfirmed = a.status === 'confirmed';
                        const esIA = (a.notes || '').includes('Agente IA');

                        return (
                          <div
                            key={a.id}
                            onClick={() => setSelectedPatient({
                              id: a.patient_id,
                              full_name: a.patient_name,
                              phone: a.patient_phone,
                              email: a.patient_email,
                              nota_recepcion: a.notes || a.reason,
                              alergias: '',
                            })}
                            className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] hover:border-[#38bdf8]/40 transition flex items-center justify-between gap-3 cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono text-xs font-bold text-[#dde6ef] bg-[#070a0e] px-2 py-1 rounded-lg border border-[#1e2d3d]">
                                {hm(a.starts_at)}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[#dde6ef] truncate">{a.patient_name}</p>
                                <p className="text-[11px] text-[#7a95aa] truncate">
                                  {a.reason || 'Consulta médica'}
                                  {a.patient_phone ? ` · 📞 ${a.patient_phone}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0" onClick={ev => ev.stopPropagation()}>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  esConfirmed
                                    ? esIA ? 'bg-[#00e5a0]/15 text-[#00e5a0]' : 'bg-[#38bdf8]/15 text-[#38bdf8]'
                                    : 'bg-[#f59e0b]/15 text-[#f59e0b]'
                                }`}
                              >
                                {esConfirmed ? (esIA ? '🤖 Confirmada IA' : '👤 Confirmada') : '⏳ Por confirmar'}
                              </span>

                              <button
                                type="button"
                                onClick={() => checkInCita(a.id)}
                                className="px-3 py-1 rounded-lg text-xs font-bold text-[#051b14] bg-[#00e5a0] hover:bg-[#00c98c] active:scale-95 transition cursor-pointer shadow-sm"
                                title="Marcar que el paciente llegó físicamente a la clínica"
                              >
                                Llegó a sala
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  attendedToday.length === 0 ? (
                    <div className="text-center py-8 text-[#7a95aa] text-xs">
                      Aún no se han completado consultas hoy.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {attendedToday.map(a => (
                        <div
                          key={a.id}
                          className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-xs font-semibold text-[#a855f7] bg-[#070a0e] px-2 py-1 rounded-lg border border-[#1e2d3d]">
                              {hm(a.ends_at || a.starts_at)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-[#dde6ef] truncate">{a.patient_name}</p>
                              <p className="text-[11px] text-[#7a95aa] truncate">{a.reason || 'Consulta atendida'}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-mono text-[#00e5a0] bg-[#00e5a0]/10 px-2 py-0.5 rounded-full font-bold">
                              ✓ Completada
                            </span>
                            {a.patient_id && (
                              <button
                                type="button"
                                onClick={() => router.push(`/dashboard/patient/${a.patient_id}`)}
                                className="px-2.5 py-1 rounded-lg text-[11px] text-[#7a95aa] hover:text-[#dde6ef] bg-[#070a0e] border border-[#1e2d3d] transition cursor-pointer"
                              >
                                Expediente
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>

          </div>

          {/* ── COLUMNA DERECHA: COCKPIT AUXILIAR & PRE-CONSULTA EXPRESS (35%) ── */}
          <div className="lg:col-span-5 space-y-5">

            {/* A. PRE-CONSULTA INSTANTÁNEA (FICHA RÁPIDA DEL PACIENTE SELECCIONADO) */}
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#1e2d3d] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#7a95aa]">
                    Ficha Rápida de Atención
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[#00e5a0] bg-[#00e5a0]/15 px-2 py-0.5 rounded-full font-bold">
                  Pre-Consulta
                </span>
              </div>

              {activoPreview ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-full bg-[#162231] border border-[#1e2d3d] text-[#00e5a0] font-bold text-lg flex items-center justify-center shrink-0">
                      {activoPreview.full_name?.slice(0, 2).toUpperCase() || 'P'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[#dde6ef] truncate">{activoPreview.full_name}</p>
                      <p className="text-xs text-[#7a95aa]">
                        {activoPreview.edad != null ? `${activoPreview.edad} años` : ''}
                        {activoPreview.sexo ? ` · ${activoPreview.sexo}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Contacto rápido y WhatsApp */}
                  <div className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#7a95aa]">Teléfono:</span>
                      <span className="font-mono text-[#dde6ef]">{activoPreview.phone || 'No registrado'}</span>
                    </div>
                    {whatsappDirectoUrl && (
                      <a
                        href={whatsappDirectoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-1.5 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#25D366] text-xs font-bold flex items-center justify-center gap-1.5 transition mt-2 cursor-pointer"
                      >
                        <span>💬 Abrir WhatsApp directo</span>
                      </a>
                    )}
                  </div>

                  {/* Alergias */}
                  {activoPreview.alergias && (
                    <div className="p-2.5 rounded-xl bg-[#f43f5e]/10 border border-[#f43f5e]/30 text-xs text-[#f43f5e] font-semibold">
                      ⚠️ Alergias reportadas: {activoPreview.alergias}
                    </div>
                  )}

                  {/* Nota clínica de recepción */}
                  {activoPreview.nota_recepcion && (
                    <div className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] text-xs space-y-1">
                      <p className="text-[10px] font-mono text-[#38bdf8] uppercase font-bold">Motivo / Nota de llegada:</p>
                      <p className="text-[#dde6ef] leading-relaxed">{activoPreview.nota_recepcion}</p>
                    </div>
                  )}

                  {/* Botones de acción express */}
                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={() => atender(activoPreview)}
                      className="w-full py-2.5 rounded-xl text-xs font-bold text-[#051b14] bg-[#00e5a0] hover:bg-[#00c98c] transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <span>🩺 Iniciar consulta</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => abrirTriaje(activoPreview)}
                      className="w-full py-2 rounded-xl text-xs font-bold text-[#38bdf8] bg-[#38bdf8]/10 border border-[#38bdf8]/30 hover:bg-[#38bdf8]/20 transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>📋 Capturar Signos / Triaje</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      {isDoctor && (
                        <button
                          type="button"
                          onClick={() => verResumen(activoPreview)}
                          className="py-2 px-3 rounded-xl text-xs font-bold text-[#a78bfa] bg-[#a78bfa]/10 border border-[#a78bfa]/30 hover:bg-[#a78bfa]/20 transition cursor-pointer"
                        >
                          🤖 Resumen IA
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/patient/${activoPreview.id}`)}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold text-[#7a95aa] bg-[#111820] border border-[#1e2d3d] hover:text-[#dde6ef] transition cursor-pointer ${
                          !isDoctor ? 'col-span-2' : ''
                        }`}
                      >
                        Expediente
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-[#7a95aa] text-xs">
                  Selecciona a cualquier paciente de la sala o de la agenda para previsualizar su expediente aquí.
                </div>
              )}
            </div>

            {/* B. PIZARRA DE AVISOS INTERNOS DEL CONSULTORIO (STICKY NOTES) */}
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#7a95aa]">
                  📌 Pizarra de Avisos del Día
                </span>
                <span className="text-[10px] text-[#4b6377]">Notas internas</span>
              </div>
              <textarea
                value={notasPizarra}
                onChange={e => guardarNotaPizarra(e.target.value)}
                placeholder="Escribe notas rápidas del día para el equipo (ej: 'El laboratorio entrega resultados a las 14:00', 'Paciente de 13:00 necesita factura con CFDI 4.0')..."
                rows={3}
                className="w-full p-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-xs text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#4b6377] resize-none leading-relaxed"
              />
            </div>

          </div>

        </div>

      </main>

      {/* Modal de Resumen Clínico con IA */}
      {brief && (
        <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setBrief(null)}>
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            {brief.loading || briefLoading ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#00e5a0] border-t-transparent animate-spin mx-auto" />
                <p className="text-[#00e5a0] text-xs font-mono">Consultando antecedentes clínicos con IA…</p>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <h3 className="font-bold text-[#dde6ef] text-lg">{brief.patient?.full_name}</h3>
                  {brief.patient?.edad != null && <span className="text-xs text-[#7a95aa]">({brief.patient.edad} años)</span>}
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {brief.patient?.allergies_medications && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f43f5e]/15 text-[#f43f5e] font-semibold">
                      Alergias: {brief.patient.allergies_medications}
                    </span>
                  )}
                  {brief.patient?.chronic_diseases && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f59e0b]/15 text-[#f59e0b] font-semibold">
                      Crónicas: {brief.patient.chronic_diseases}
                    </span>
                  )}
                </div>

                <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-4 mb-3 space-y-1">
                  <p className="text-[10px] font-mono text-[#a78bfa] uppercase font-bold tracking-wider">Resumen Clínico Inteligente</p>
                  <p className="text-xs text-[#dde6ef] whitespace-pre-wrap leading-relaxed">{brief.resumen_ia}</p>
                </div>

                <div className="flex gap-2 mt-4 justify-end">
                  <button
                    onClick={() => setBrief(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c] transition cursor-pointer"
                  >
                    Entendido
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de Check-in y Filtro de Llegada */}
      <CheckInModal
        isOpen={checkInModalOpen}
        onClose={() => setCheckInModalOpen(false)}
        onSuccess={(name) => {
          flash(`✓ ${name} registrado en sala de espera.`);
          load();
        }}
        onOpenNewPatient={(prefillName) => {
          setCheckInModalOpen(false);
          router.push(`/dashboard/new-patient?name=${encodeURIComponent(prefillName || '')}`);
        }}
      />

      {/* Modal de Triaje y Signos Vitales (NOM-004) */}
      <TriajeModal
        isOpen={triajeModalOpen}
        onClose={() => {
          setTriajeModalOpen(false);
          setTriajePatient(null);
        }}
        patient={triajePatient}
        onSuccess={(m) => {
          flash(m);
          load();
        }}
      />
    </div>
  );
}
