'use client';

/**
 * CHECK-IN MODAL / REGISTRAR VISITA (APEX RECEPTION COCKPIT)
 * Filtro de llegada inteligente para la clínica:
 * 1. Buscador instantáneo de pacientes existentes por Nombre o Celular WhatsApp.
 * 2. Visualización de citas programadas para hoy pendientes de llegada (Check-in 1-clic).
 * 3. Si ya existe: selección de médico, sede y motivo rápido para entrar a sala en 5 seg.
 * 4. Si no existe: botón directo para abrir el formulario de nuevo paciente con el nombre pre-llenado.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import Icon from '@/app/components/Icon';

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
    throw new Error('Error de conexión con el servidor.');
  }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.detail || `Error ${r.status}`);
  }
  return r.json();
}

const CHIPS_MOTIVO = [
  'Consulta general',
  'Control / Seguimiento',
  'Revisión de estudios / Labs',
  'Urgencia / Síntoma agudo',
  'Curación / Procedimiento',
  'Entrega de receta / Tratamiento',
];

interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (patientName: string) => void;
  onOpenNewPatient?: (prefillName?: string) => void;
}

export default function CheckInModal({
  isOpen,
  onClose,
  onSuccess,
  onOpenNewPatient,
}: CheckInModalProps) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Estado del buscador
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  // Paciente seleccionado para dar entrada
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);

  // Contexto de clínica (doctores, sedes)
  const [doctors, setDoctors] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [motivo, setMotivo] = useState('Consulta general');
  const [savingVisit, setSavingVisit] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Citas agendadas para hoy pendientes de check-in
  const [citasHoy, setCitasHoy] = useState<any[]>([]);
  const [loadingCitas, setLoadingCitas] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  // Cargar contexto y citas de hoy al abrir
  useEffect(() => {
    if (!isOpen) return;

    // Resetear formulario
    setQuery('');
    setResults([]);
    setSelectedPatient(null);
    setErrorMsg('');
    setSavingVisit(false);

    // Autofocus en el buscador tras montar
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);

    // Cargar doctores y sedes
    api('/appointments/context')
      .then(d => {
        setDoctors(d.doctors || []);
        setLocations(d.locations || []);
        if (d.doctors?.length) setSelectedDoctorId(d.doctors[0].id);
        if (d.locations?.length) setSelectedLocationId(d.locations[0].id);
      })
      .catch(() => {});

    // Cargar citas programadas de hoy
    setLoadingCitas(true);
    api('/appointments/waitroom')
      .then(d => {
        setCitasHoy(d.scheduled_today || []);
      })
      .catch(() => {})
      .finally(() => setLoadingCitas(false));
  }, [isOpen]);

  // Búsqueda en tiempo real con debounce
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      api(`/appointments/patient-search?q=${encodeURIComponent(q)}`)
        .then(d => {
          setResults(d.results || []);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => setSearching(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Check-in rápido de una cita agendada
  const handleCheckInCita = async (apptId: string, patientName: string) => {
    setCheckingInId(apptId);
    try {
      await api(`/appointments/${apptId}/check-in`, { method: 'POST' });
      onSuccess?.(patientName);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo registrar la llegada de la cita.');
    } finally {
      setCheckingInId(null);
    }
  };

  // Registrar visita y enviar a sala de espera para paciente existente
  const handleRegistrarVisitaExistente = async () => {
    if (!selectedPatient) return;
    setSavingVisit(true);
    setErrorMsg('');

    try {
      const nowIso = new Date().toISOString();

      // 1. Crear visita asociada
      await api('/visits', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          doctor_id: selectedDoctorId || null,
          location_id: selectedLocationId || null,
          motivo_visita: motivo || 'Consulta general',
          created_at: nowIso,
        }),
      });

      // 2. Marcar en recepción para que aparezca en la Sala de Espera de inmediato
      await api(`/patients/${selectedPatient.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          registration_phase: 'reception',
          updated_at: nowIso,
        }),
      });

      onSuccess?.(selectedPatient.full_name || 'Paciente');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo registrar la visita.');
    } finally {
      setSavingVisit(false);
    }
  };

  // Ir a registrar nuevo paciente pasando lo que se tecleó en el buscador
  const handleIrANuevoPaciente = () => {
    onClose();
    if (onOpenNewPatient) {
      onOpenNewPatient(query.trim());
    } else {
      router.push(`/dashboard/new-patient?name=${encodeURIComponent(query.trim())}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in select-none">
      <div
        className="w-full max-w-2xl bg-[#0d1520] border border-[#1e2d3d] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all"
        onClick={e => e.stopPropagation()}
      >
        {/* ── CABECERA ── */}
        <div className="p-4 sm:p-5 border-b border-[#1e2d3d] bg-[#111820]/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#00e5a0]/15 text-[#00e5a0] flex items-center justify-center font-bold text-lg shadow-sm">
              <Icon name="bell" size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#dde6ef] tracking-tight">
                Registrar Visita / Check-in
              </h2>
              <p className="text-xs text-[#7a95aa]">
                Filtro inicial de llegada. Busca al paciente o regístralo si es primera vez.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
            title="Cerrar ventana (Esc)"
          >
            ✕
          </button>
        </div>

        {/* ── CONTENIDO ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-[#f43f5e]/10 border border-[#f43f5e]/30 text-xs text-[#f43f5e]">
              {errorMsg}
            </div>
          )}

          {/* BUSCADOR INTELIGENTE PRINCIPAL */}
          <div className="relative">
            <label className="text-[11px] font-mono uppercase tracking-wider text-[#7a95aa] font-bold block mb-1.5">
              1. Buscar paciente por Nombre o Celular WhatsApp
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-[#7a95aa] pointer-events-none">
                <Icon name="search" size={18} />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  if (selectedPatient) setSelectedPatient(null);
                }}
                placeholder="Escribe ej. Carlos Méndez o 55 1234 5678..."
                className="w-full pl-10 pr-10 py-3 rounded-2xl bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] placeholder-[#4b6377] text-sm sm:text-base outline-none focus:border-[#00e5a0] transition shadow-inner"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setResults([]);
                    setSelectedPatient(null);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 p-1 rounded-lg text-[#7a95aa] hover:text-[#dde6ef] transition cursor-pointer text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* ── CASO A: PACIENTE SELECCIONADO PARA DAR ENTRADA EXPRESS ── */}
          {selectedPatient ? (
            <div className="p-4 sm:p-5 rounded-2xl bg-[#111820] border border-[#00e5a0]/50 space-y-4 shadow-lg animate-in fade-in">
              <div className="flex items-center justify-between border-b border-[#1e2d3d]/80 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#00e5a0] text-[#051b14] flex items-center justify-center font-bold text-base shadow">
                    {selectedPatient.full_name?.[0]?.toUpperCase() || 'P'}
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-[#00e5a0] font-bold uppercase tracking-wider">
                      ✓ Paciente Identificado
                    </span>
                    <h3 className="text-base font-bold text-[#dde6ef]">
                      {selectedPatient.full_name}
                    </h3>
                    <p className="text-xs text-[#7a95aa] font-mono">
                      {selectedPatient.phone ? `📱 ${selectedPatient.phone}` : 'Sin teléfono'} · {selectedPatient.email || 'Sin correo'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-[#7a95aa] hover:text-[#00e5a0] underline transition cursor-pointer"
                >
                  Cambiar paciente
                </button>
              </div>

              {/* Parámetros de la visita de hoy */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold block mb-1">
                    Médico de atención
                  </label>
                  <select
                    value={selectedDoctorId}
                    onChange={e => setSelectedDoctorId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#070a0e] border border-[#1e2d3d] rounded-xl text-xs text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                  >
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>{d.display_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold block mb-1">
                    Sede / Consultorio
                  </label>
                  <select
                    value={selectedLocationId}
                    onChange={e => setSelectedLocationId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#070a0e] border border-[#1e2d3d] rounded-xl text-xs text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                  >
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Motivo de la visita */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold block mb-1">
                  Motivo de la visita de hoy
                </label>
                <input
                  type="text"
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej. Control de presión arterial, Trae estudios..."
                  className="w-full px-3 py-2 bg-[#070a0e] border border-[#1e2d3d] rounded-xl text-xs text-[#dde6ef] outline-none focus:border-[#00e5a0] mb-2"
                />
                <div className="flex flex-wrap gap-1.5">
                  {CHIPS_MOTIVO.map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setMotivo(chip)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer border ${
                        motivo === chip
                          ? 'bg-[#00e5a0]/15 border-[#00e5a0] text-[#00e5a0]'
                          : 'bg-[#070a0e] border-[#1e2d3d] text-[#7a95aa] hover:text-[#dde6ef]'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botón de acción final para el paciente existente */}
              <div className="pt-2 flex justify-end gap-2 border-t border-[#1e2d3d]/60">
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#7a95aa] hover:text-[#dde6ef] transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingVisit}
                  onClick={handleRegistrarVisitaExistente}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c] transition cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  {savingVisit ? (
                    <span>Registrando...</span>
                  ) : (
                    <>
                      <span>✓</span>
                      <span>Registrar Visita y Pasar a Sala</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : query.trim().length >= 2 ? (
            /* ── CASO B: RESULTADOS DE BÚSQUEDA ── */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#7a95aa]">
                <span>
                  {searching ? 'Buscando en base de datos...' : `${results.length} paciente(s) encontrado(s)`}
                </span>
                <span className="font-mono text-[10px]">Presiona un paciente para registrarlo</span>
              </div>

              {results.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {results.map(p => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPatient(p)}
                      className="p-3 rounded-2xl bg-[#111820] border border-[#1e2d3d] hover:border-[#00e5a0]/60 hover:bg-[#162231] transition cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[#162231] text-[#00e5a0] group-hover:bg-[#00e5a0] group-hover:text-[#051b14] flex items-center justify-center font-bold text-sm shrink-0 transition">
                          {p.full_name?.[0]?.toUpperCase() || 'P'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#dde6ef] truncate group-hover:text-[#00e5a0] transition">
                            {p.full_name}
                          </p>
                          <p className="text-[11px] text-[#7a95aa] font-mono truncate">
                            {p.phone ? `📱 ${p.phone}` : 'Sin cel'} {p.email ? `· ✉ ${p.email}` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-xl bg-[#00e5a0]/15 text-[#00e5a0] group-hover:bg-[#00e5a0] group-hover:text-[#051b14] text-xs font-bold transition shrink-0"
                      >
                        Seleccionar →
                      </button>
                    </div>
                  ))}
                </div>
              ) : !searching ? (
                /* No se encontró paciente con esa búsqueda */
                <div className="p-5 rounded-2xl bg-[#111820] border border-dashed border-[#1e2d3d] text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-[#162231] text-[#7a95aa] flex items-center justify-center mx-auto text-lg">
                    🔍
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#dde6ef]">
                      No se encontró ningún paciente con &ldquo;{query}&rdquo;
                    </p>
                    <p className="text-[11px] text-[#7a95aa] mt-0.5">
                      Probablemente sea su primera visita en la clínica.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleIrANuevoPaciente}
                    className="px-4 py-2.5 rounded-xl bg-[#00e5a0] text-[#051b14] text-xs font-bold hover:bg-[#00c98c] transition cursor-pointer shadow-md inline-flex items-center gap-2"
                  >
                    <span>+</span>
                    <span>Registrar &ldquo;{query}&rdquo; como Nuevo Paciente</span>
                  </button>
                </div>
              ) : null}

              {/* Botón flotante al pie para forzar nuevo paciente si no es el que busca */}
              {results.length > 0 && (
                <div className="pt-2 text-center border-t border-[#1e2d3d]/60">
                  <button
                    type="button"
                    onClick={handleIrANuevoPaciente}
                    className="text-xs text-[#7a95aa] hover:text-[#00e5a0] underline transition cursor-pointer font-medium"
                  >
                    ¿Es un paciente distinto? Registrar como nuevo paciente &ldquo;{query}&rdquo; →
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── CASO C: PANTALLA INICIAL (BUSCADOR VACÍO) ── */
            <div className="space-y-4">
              {/* Acceso Rápido 1: Citas programadas para hoy */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#7a95aa] font-bold flex items-center gap-1.5">
                    <span>📅</span> Citas de hoy pendientes de llegada ({citasHoy.length})
                  </span>
                  <span className="text-[10px] text-[#7a95aa]">Check-in de 1 clic</span>
                </div>

                {loadingCitas ? (
                  <p className="text-xs text-[#7a95aa] italic py-2">Cargando citas de hoy...</p>
                ) : citasHoy.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {citasHoy.map(c => {
                      const hora = c.starts_at ? new Date(c.starts_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                      const isChecking = checkingInId === c.id;

                      return (
                        <div
                          key={c.id}
                          className="p-3 rounded-2xl bg-[#111820] border border-[#1e2d3d] flex items-center justify-between gap-2.5 hover:border-[#38bdf8]/50 transition"
                        >
                          <div className="min-w-0">
                            <span className="text-[10px] font-mono font-bold text-[#38bdf8] bg-[#38bdf8]/10 px-1.5 py-0.5 rounded">
                              {hora} hrs
                            </span>
                            <p className="text-xs font-bold text-[#dde6ef] truncate mt-1">
                              {c.patient_name}
                            </p>
                            <p className="text-[10px] text-[#7a95aa] truncate">
                              {c.reason || 'Consulta'}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isChecking}
                            onClick={() => handleCheckInCita(c.id, c.patient_name)}
                            className="px-2.5 py-1.5 rounded-xl bg-[#00e5a0]/15 hover:bg-[#00e5a0] text-[#00e5a0] hover:text-[#051b14] text-xs font-bold transition cursor-pointer shrink-0 shadow-sm"
                            title="Dar entrada y mandar a sala de espera"
                          >
                            {isChecking ? '...' : '✓ Llegó'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-[#111820]/60 border border-[#1e2d3d] text-center">
                    <p className="text-xs text-[#7a95aa]">
                      No hay citas programadas pendientes para hoy.
                    </p>
                  </div>
                )}
              </div>

              {/* Acceso Rápido 2: Botón directo para crear nuevo paciente */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#111820] to-[#162231] border border-[#1e2d3d] flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-[#dde6ef]">
                    ¿El paciente viene por primera vez?
                  </h4>
                  <p className="text-[11px] text-[#7a95aa]">
                    Abre el formulario guiado por slides para darlo de alta en el sistema.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleIrANuevoPaciente}
                  className="px-4 py-2 rounded-xl bg-[#00e5a0] text-[#051b14] text-xs font-bold hover:bg-[#00c98c] transition cursor-pointer shadow-md shrink-0 flex items-center gap-1.5"
                >
                  <span>+</span>
                  <span>Nuevo Paciente</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="p-3.5 border-t border-[#1e2d3d] bg-[#111820]/80 flex items-center justify-between text-xs text-[#7a95aa] shrink-0">
          <span>APEX Intake & Check-in System</span>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-[#dde6ef] underline transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
