'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import Icon from '@/app/components/Icon';
import { useEntitlements } from '@/app/lib/useEntitlements';
import { getRole } from '@/app/lib/role';
import CheckInModal from '@/app/components/CheckInModal';

export default function PatientsPage() {
  const router = useRouter();
  const { lite } = useEntitlements();
  const [role, setRole] = useState<string>('doctor');
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'alertas' | 'nuevos'>('todos');
  const [viewMode, setViewMode] = useState<'tabla' | 'tarjetas'>('tabla');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkInOpen, setCheckInOpen] = useState(false);

  useEffect(() => {
    setRole(getRole());
    getUser().then(u => {
      if (!u) router.push('/auth/login');
      else { setUser(u); fetchPatients(); }
    });
  }, [router]);

  const handleDeletePatient = async (patientId: string, fullName: string) => {
    const ok = window.confirm(`¿Está seguro que quiere borrar el registro de ${fullName}? Esto no se puede deshacer.`);
    if (!ok) return;
    try {
      const session = await getSession().catch(() => null);
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/patients/${patientId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || 'No se pudo borrar el registro');
      }
      setPatients(prev => prev.filter(p => p.id !== patientId));
      if (selectedPatient?.id === patientId) setSelectedPatient(null);
    } catch (e: any) {
      alert(e.message || `Error al eliminar a ${fullName}`);
    }
  };

  const fetchPatients = async () => {
    try {
      const session = await getSession().catch(() => null);
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/patients?limit=300`, { headers });
      const data = await res.json();
      const list = data.patients || [];
      setPatients(list);
      if (list.length > 0) setSelectedPatient(list[0]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Cálculo de pacientes nuevos en el mes en curso
  const nuevosEsteMes = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    return patients.filter(p => {
      if (!p.created_at) return false;
      const d = new Date(p.created_at);
      return d.getFullYear() === curYear && d.getMonth() === curMonth;
    }).length;
  }, [patients]);

  // Pacientes con alergias o enfermedades crónicas
  const conAlertas = useMemo(() => {
    return patients.filter(p => {
      const al = (p.allergies_medications || '').trim().toLowerCase();
      const cr = (p.chronic_diseases || '').trim().toLowerCase();
      const sinAlergias = ['', 'no', 'ninguna', 'ninguno', 'no refiere', 'alergias negadas'];
      const tieneAl = al && !sinAlergias.includes(al);
      const tieneCr = cr && !['', 'no', 'ninguna', 'ninguno', 'no refiere'].includes(cr);
      return tieneAl || tieneCr;
    }).length;
  }, [patients]);

  const filtered = useMemo(() => {
    return patients.filter(p => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (filtro === 'nuevos') {
        const now = new Date();
        const d = p.created_at ? new Date(p.created_at) : null;
        if (!d || d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) {
          return false;
        }
      } else if (filtro === 'alertas') {
        const al = (p.allergies_medications || '').trim().toLowerCase();
        const cr = (p.chronic_diseases || '').trim().toLowerCase();
        const sinAlergias = ['', 'no', 'ninguna', 'ninguno', 'no refiere', 'alergias negadas'];
        const tieneAl = al && !sinAlergias.includes(al);
        const tieneCr = cr && !['', 'no', 'ninguna', 'ninguno', 'no refiere'].includes(cr);
        if (!tieneAl && !tieneCr) return false;
      }

      return true;
    });
  }, [patients, search, filtro]);

  // Enlace WhatsApp directo para el paciente seleccionado
  const whatsappUrl = useMemo(() => {
    if (!selectedPatient?.phone) return null;
    const clean = selectedPatient.phone.replace(/\D/g, '');
    if (!clean) return null;
    const msg = encodeURIComponent(`Hola ${selectedPatient.full_name || 'paciente'}, le escribimos de Consultorio APEX.`);
    return `https://wa.me/${clean}?text=${msg}`;
  }, [selectedPatient]);

  return (
    <div className="min-h-screen bg-[#070a0e] text-[#dde6ef]">
      <main className="page-content pt-16 px-4 sm:px-6 py-6 max-w-7xl mx-auto space-y-6">

        {/* ── 1. CABECERA PRINCIPAL ── */}
        <div className="pb-3 border-b border-[#1e2d3d]/60 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-[#00e5a0]/15 text-[#00e5a0] flex items-center justify-center font-bold">
              <Icon name="users" size={20} />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#dde6ef]">Pacientes</h1>
              <p className="text-xs sm:text-sm text-[#7a95aa] mt-0.5">
                Directorio general y gestión de expedientes clínicos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setCheckInOpen(true)}
              className="px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl text-[#00e5a0] bg-[#00e5a0]/15 border border-[#00e5a0]/40 hover:bg-[#00e5a0]/25 transition flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
            >
              <span>📥</span>
              <span>Registrar Visita / Check-in</span>
            </button>

            <button
              type="button"
              onClick={() => router.push('/dashboard/new-patient')}
              className="px-5 py-2.5 text-xs sm:text-sm font-bold rounded-xl text-[#051b14] bg-[#00e5a0] hover:bg-[#00c98c] transition flex items-center gap-2 cursor-pointer shadow-[0_4px_16px_rgba(0,229,160,0.25)] active:scale-95"
            >
              <span className="text-base font-extrabold leading-none">+</span>
              <span>Nuevo paciente</span>
            </button>
          </div>
        </div>

        {/* ── 2. KPIS DEL DIRECTORIO DE PACIENTES ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-[#0d1520] border border-[#1e2d3d] flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#00e5a0]/15 text-[#00e5a0] flex items-center justify-center font-bold text-lg">
              {patients.length}
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#7a95aa]">Expedientes Registrados</p>
              <p className="text-xs text-[#00e5a0] font-semibold mt-0.5">Base de datos de la clínica</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0d1520] border border-[#1e2d3d] flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#38bdf8]/15 text-[#38bdf8] flex items-center justify-center font-bold text-lg">
              {nuevosEsteMes}
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#7a95aa]">Nuevos este Mes</p>
              <p className="text-xs text-[#38bdf8] font-semibold mt-0.5">Pacientes incorporados</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0d1520] border border-[#1e2d3d] flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#f59e0b]/15 text-[#f59e0b] flex items-center justify-center font-bold text-lg">
              {conAlertas}
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#7a95aa]">Alertas Médicas</p>
              <p className="text-xs text-[#f59e0b] font-semibold mt-0.5">Alergias o crónicos activos</p>
            </div>
          </div>
        </div>

        {/* ── 3. HERRAMIENTAS: BÚSQUEDA + CHIPS DE FILTRO + SELECTOR DE VISTA ── */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Buscador */}
          <div className="relative flex-1 max-w-xl">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4b6377]">
              <Icon name="search" size={16} />
            </span>
            <input
              type="text"
              placeholder="Buscar por nombre, ID, teléfono o correo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-[#0d1520] border border-[#1e2d3d] rounded-xl text-xs sm:text-sm text-[#dde6ef] placeholder-[#4b6377] outline-none focus:border-[#00e5a0] transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a95aa] hover:text-[#dde6ef] text-sm"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end md:self-center">
            {/* Chips de filtro */}
            <div className="inline-flex rounded-xl bg-[#0d1520] border border-[#1e2d3d] p-1 text-xs">
              <button
                type="button"
                onClick={() => setFiltro('todos')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  filtro === 'todos' ? 'bg-[#162231] text-[#00e5a0]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
              >
                Todos ({patients.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltro('alertas')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  filtro === 'alertas' ? 'bg-[#f59e0b]/15 text-[#f59e0b]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
              >
                Con alertas ({conAlertas})
              </button>
              <button
                type="button"
                onClick={() => setFiltro('nuevos')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  filtro === 'nuevos' ? 'bg-[#38bdf8]/15 text-[#38bdf8]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
              >
                Nuevos ({nuevosEsteMes})
              </button>
            </div>

            {/* Selector de Vista: Tabla | Tarjetas */}
            <div className="inline-flex rounded-xl bg-[#0d1520] border border-[#1e2d3d] p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('tabla')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  viewMode === 'tabla' ? 'bg-[#00e5a0] text-[#051b14]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
                title="Vista tabla"
              >
                Tabla
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tarjetas')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  viewMode === 'tarjetas' ? 'bg-[#00e5a0] text-[#051b14]' : 'text-[#7a95aa] hover:text-[#dde6ef]'
                }`}
                title="Vista tarjetas / mosaico"
              >
                Tarjetas
              </button>
            </div>
          </div>
        </div>

        {/* ── 4. CUERPO PRINCIPAL: MAESTRO-DETALLE (LISTA 65% + FICHA RÁPIDA 35%) ── */}
        {loading ? (
          <div className="text-center py-24 text-[#7a95aa] space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#00e5a0] border-t-transparent animate-spin mx-auto" />
            <p className="text-xs font-mono">Cargando directorio de pacientes…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-[#dde6ef]">
              {search ? 'Sin pacientes que coincidan con la búsqueda' : 'Aún no hay pacientes registrados en este consultorio'}
            </p>
            <p className="text-xs text-[#7a95aa]">
              {search ? 'Intenta con otro término o limpia el buscador.' : 'Comienza dando de alta a tu primer paciente.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => router.push('/dashboard/new-patient')}
                className="mt-3 px-5 py-2.5 rounded-xl text-xs font-bold text-[#051b14] bg-[#00e5a0] hover:bg-[#00c98c] transition cursor-pointer inline-block"
              >
                Dar de alta paciente
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* ── COLUMNA IZQUIERDA: LISTA / TABLA O MOSAICO (65%) ── */}
            <div className="lg:col-span-7 space-y-3">
              {viewMode === 'tabla' ? (
                /* ── VISTA TABLA CLÍNICA ── */
                <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden shadow-sm">
                  {/* Encabezados de tabla */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[#1e2d3d] bg-[#111820] text-[10px] font-mono text-[#7a95aa] uppercase tracking-wider font-bold">
                    <span className="col-span-6 sm:col-span-5">Paciente</span>
                    <span className="col-span-3 sm:col-span-3 hidden sm:block">ID Clínico</span>
                    <span className="col-span-3 sm:col-span-2 hidden md:block">Edad</span>
                    <span className="col-span-6 sm:col-span-2 text-right">Acción</span>
                  </div>

                  {/* Filas */}
                  <div className="divide-y divide-[#1e2d3d]/50 max-h-[640px] overflow-y-auto">
                    {filtered.map(p => {
                      const dob = p.date_of_birth || p.birth_date;
                      const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
                      const isSelected = selectedPatient?.id === p.id;
                      const hasAlert = p.allergies_medications && !['', 'no', 'ninguna', 'no refiere'].includes(p.allergies_medications.toLowerCase().trim());

                      return (
                        <div
                          key={p.id}
                          onClick={() => setSelectedPatient(p)}
                          className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-[#162231]/60 transition cursor-pointer ${
                            isSelected ? 'bg-[#162231] border-l-4 border-l-[#00e5a0]' : ''
                          }`}
                        >
                          {/* Paciente y foto/iniciales */}
                          <div className="col-span-6 sm:col-span-5 flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-[#111820] border border-[#1e2d3d] text-[#00e5a0] flex items-center justify-center text-xs font-bold shrink-0">
                              {p.full_name?.slice(0, 2).toUpperCase() || 'P'}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-[#dde6ef] truncate">{p.full_name || '—'}</p>
                              <p className="text-[11px] text-[#7a95aa] truncate font-mono">
                                {p.phone || p.email || 'Sin contacto directo'}
                              </p>
                              {hasAlert && (
                                <span className="inline-block text-[9px] font-bold text-[#f43f5e] bg-[#f43f5e]/15 px-1.5 rounded mt-0.5 truncate">
                                  ⚠️ {p.allergies_medications}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ID Clínico */}
                          <div className="col-span-3 sm:col-span-3 hidden sm:block">
                            <span className="font-mono text-[11px] text-[#7a95aa] bg-[#111820] px-2 py-0.5 rounded border border-[#1e2d3d]/50">
                              {p.id}
                            </span>
                          </div>

                          {/* Edad */}
                          <div className="col-span-3 sm:col-span-2 hidden md:block text-xs text-[#7a95aa]">
                            {age !== null ? `${age} años` : '—'}
                          </div>

                          {/* Acciones */}
                          <div className="col-span-6 sm:col-span-2 flex items-center justify-end gap-1.5" onClick={ev => ev.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/patient/${p.id}/${lite ? 'consulta' : 'new-visit'}`)}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c] transition cursor-pointer"
                              title="Iniciar consulta médica"
                            >
                              Consulta
                            </button>
                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/patient/${p.id}`)}
                              className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-[#111820] text-[#7a95aa] hover:text-[#dde6ef] border border-[#1e2d3d] transition cursor-pointer"
                              title="Abrir expediente completo"
                            >
                              Ficha
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* ── VISTA MOSAICO / TARJETAS ── */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[640px] overflow-y-auto">
                  {filtered.map(p => {
                    const dob = p.date_of_birth || p.birth_date;
                    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
                    const isSelected = selectedPatient?.id === p.id;

                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPatient(p)}
                        className={`p-4 rounded-2xl bg-[#0d1520] border transition cursor-pointer space-y-3 hover:border-[#00e5a0]/50 ${
                          isSelected ? 'border-[#00e5a0] shadow-md' : 'border-[#1e2d3d]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-[#162231] text-[#00e5a0] font-bold text-sm flex items-center justify-center shrink-0 border border-[#1e2d3d]">
                            {p.full_name?.slice(0, 2).toUpperCase() || 'P'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-[#dde6ef] truncate">{p.full_name}</p>
                            <p className="text-xs text-[#7a95aa]">
                              {age !== null ? `${age} años` : ''}
                              {p.phone ? ` · 📞 ${p.phone}` : ''}
                            </p>
                          </div>
                        </div>

                        {p.allergies_medications && (
                          <div className="text-[10px] text-[#f43f5e] bg-[#f43f5e]/15 px-2 py-1 rounded-lg font-semibold truncate">
                            ⚠️ Alergias: {p.allergies_medications}
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-2 border-t border-[#1e2d3d]" onClick={ev => ev.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => router.push(`/dashboard/patient/${p.id}/${lite ? 'consulta' : 'new-visit'}`)}
                            className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c] transition text-center cursor-pointer"
                          >
                            Consulta
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/dashboard/patient/${p.id}`)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#111820] text-[#7a95aa] hover:text-[#dde6ef] border border-[#1e2d3d] transition cursor-pointer"
                          >
                            Expediente
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-center text-xs text-[#4b6377] font-mono pt-1">
                Mostrando {filtered.length} de {patients.length} expedientes clínicos
              </p>
            </div>

            {/* ── COLUMNA DERECHA: FICHA RESUMEN INMEDIATA (35%) ── */}
            <div className="lg:col-span-5 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 shadow-sm space-y-4 sticky top-20">
              <div className="flex items-center justify-between border-b border-[#1e2d3d] pb-3">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#7a95aa]">
                  Ficha Resumen del Paciente
                </span>
                <span className="text-[10px] font-mono text-[#38bdf8] bg-[#38bdf8]/15 px-2 py-0.5 rounded-full font-bold">
                  Vista Express
                </span>
              </div>

              {selectedPatient ? (
                <div className="space-y-4">
                  {/* Avatar grande y datos generales */}
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-full bg-[#162231] border-2 border-[#00e5a0] text-[#00e5a0] font-bold text-xl flex items-center justify-center shrink-0 shadow-md">
                      {selectedPatient.full_name?.slice(0, 2).toUpperCase() || 'P'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-[#dde6ef] truncate">{selectedPatient.full_name}</h3>
                      <p className="text-xs text-[#7a95aa]">
                        ID: <span className="font-mono text-[#dde6ef]">{selectedPatient.id}</span>
                      </p>
                      {selectedPatient.care_type && (
                        <span className="inline-block text-[10px] font-mono text-[#a855f7] bg-[#a855f7]/15 px-2 py-0.5 rounded-md mt-1">
                          {selectedPatient.care_type}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Datos de contacto y WhatsApp directo */}
                  <div className="p-3.5 rounded-xl bg-[#111820] border border-[#1e2d3d] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#7a95aa]">Teléfono:</span>
                      <span className="font-mono text-[#dde6ef]">{selectedPatient.phone || 'No registrado'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7a95aa]">Correo:</span>
                      <span className="text-[#dde6ef] truncate max-w-[200px]">{selectedPatient.email || 'No registrado'}</span>
                    </div>

                    {whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#25D366] text-xs font-bold flex items-center justify-center gap-1.5 transition mt-2 cursor-pointer"
                      >
                        <span>💬 Abrir WhatsApp directo</span>
                      </a>
                    )}
                  </div>

                  {/* Alergias */}
                  {selectedPatient.allergies_medications && (
                    <div className="p-3 rounded-xl bg-[#f43f5e]/10 border border-[#f43f5e]/30 text-xs text-[#f43f5e] font-semibold">
                      ⚠️ Alergias: {selectedPatient.allergies_medications}
                    </div>
                  )}

                  {/* Padecimientos crónicos */}
                  {selectedPatient.chronic_diseases && (
                    <div className="p-3 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-xs text-[#f59e0b] font-semibold">
                      🩺 Padecimientos crónicos: {selectedPatient.chronic_diseases}
                    </div>
                  )}

                  {/* Acciones principales del paciente */}
                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/patient/${selectedPatient.id}/${lite ? 'consulta' : 'new-visit'}`)}
                      className="w-full py-2.5 rounded-xl text-xs font-bold text-[#051b14] bg-[#00e5a0] hover:bg-[#00c98c] transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <span>🩺 Iniciar nueva consulta</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/patient/${selectedPatient.id}`)}
                      className="w-full py-2.5 rounded-xl text-xs font-semibold text-[#dde6ef] bg-[#111820] border border-[#1e2d3d] hover:border-[#4b6377] transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>📂 Ver expediente clínico completo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push('/dashboard/agenda')}
                      className="w-full py-2 rounded-xl text-xs font-semibold text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>📅 Agendar cita en calendario</span>
                    </button>

                    {role === 'doctor' && (
                      <div className="pt-2 border-t border-[#1e2d3d]">
                        <button
                          type="button"
                          onClick={() => handleDeletePatient(selectedPatient.id, selectedPatient.full_name || 'este paciente')}
                          className="w-full py-1.5 rounded-lg text-xs font-semibold text-[#f43f5e] hover:bg-[#f43f5e]/10 border border-[#f43f5e]/30 transition cursor-pointer"
                        >
                          Eliminar paciente del consultorio
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-[#7a95aa] text-xs">
                  Selecciona a cualquier paciente de la lista para ver su ficha express aquí.
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Modal de Check-in y Filtro de Llegada */}
      <CheckInModal
        isOpen={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        onSuccess={(name) => {
          fetchPatients();
          router.push('/dashboard/sala');
        }}
        onOpenNewPatient={(prefillName) => {
          setCheckInOpen(false);
          router.push(`/dashboard/new-patient?name=${encodeURIComponent(prefillName || '')}`);
        }}
      />
    </div>
  );
}
