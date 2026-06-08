'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';

export default function PatientsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUser().then(u => {
      if (!u) router.push('/auth/login');
      else { setUser(u); fetchPatients(); }
    });
  }, [router]);

  const fetchPatients = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/patients?limit=200`);
      const data = await res.json();
      setPatients(data.patients || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = patients.filter(p => {
    const q = search.toLowerCase();
    return (
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.id || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q)
    );
  });

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Doctor';

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav userName={userName} />

      <main className="pt-16 max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-serif font-semibold text-[#dde6ef]">
              👥 Mis Pacientes
            </h1>
            <p className="text-[#7a95aa] text-sm mt-1">
              {patients.length} paciente{patients.length !== 1 ? 's' : ''} registrado{patients.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/new-patient')}
            className="px-5 py-2.5 bg-[#00e5a0] text-black text-sm font-bold rounded-xl hover:opacity-90 transition"
          >
            + Nuevo Paciente
          </button>
        </div>

        {/* Buscador */}
        <div className="relative mb-6">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nombre, ID, correo o teléfono..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-[#0d1520] border border-[#1e2d3d] rounded-xl text-[#dde6ef] text-base placeholder-[#3d5870] outline-none focus:border-[#0ea5e9] transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3d5870] hover:text-[#dde6ef] text-xl"
            >×</button>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-20 text-[#7a95aa]">Cargando pacientes...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">{search ? '🔍' : '🏥'}</p>
            <p className="text-[#7a95aa] text-lg font-medium">
              {search ? 'Sin resultados para tu búsqueda' : 'Aún no tienes pacientes registrados'}
            </p>
            {!search && (
              <button
                onClick={() => router.push('/dashboard/new-patient')}
                className="mt-5 px-6 py-3 bg-[#00e5a0] text-black font-bold rounded-xl hover:opacity-90 transition"
              >
                Registrar primer paciente
              </button>
            )}
          </div>
        ) : (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl overflow-hidden">
            {/* Header tabla */}
            <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-[#1e2d3d] bg-[#0a1018]">
              <span className="col-span-5 text-xs font-mono text-[#3d5870] uppercase tracking-wider">Paciente</span>
              <span className="col-span-3 text-xs font-mono text-[#3d5870] uppercase tracking-wider hidden sm:block">ID</span>
              <span className="col-span-2 text-xs font-mono text-[#3d5870] uppercase tracking-wider hidden md:block">Edad</span>
              <span className="col-span-2 text-xs font-mono text-[#3d5870] uppercase tracking-wider text-right">Acción</span>
            </div>

            <div className="divide-y divide-[#1e2d3d]">
              {filtered.map(p => {
                const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
                const dob = p.date_of_birth || p.birth_date;
                const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;

                return (
                  <div key={p.id} className="grid grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-[#111820] transition">
                    {/* Nombre */}
                    <div className="col-span-5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                        {initials || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[#dde6ef] truncate text-sm">{p.full_name || '—'}</p>
                        <p className="text-xs text-[#3d5870] truncate">{p.email || 'Sin correo'}</p>
                      </div>
                    </div>

                    {/* ID */}
                    <div className="col-span-3 hidden sm:block">
                      <span className="font-mono text-xs text-[#7a95aa] bg-[#111820] px-2 py-1 rounded">{p.id}</span>
                    </div>

                    {/* Edad */}
                    <div className="col-span-2 hidden md:block">
                      <span className="text-sm text-[#7a95aa]">{age !== null ? `${age} años` : '—'}</span>
                    </div>

                    {/* Acciones */}
                    <div className="col-span-2 flex justify-end">
                      <button
                        onClick={() => router.push(`/dashboard/patient/${p.id}`)}
                        className="px-3 py-1.5 bg-[#0ea5e9] text-black text-xs font-bold rounded-lg hover:opacity-90 transition"
                      >
                        Ver ficha
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Contador */}
        {search && filtered.length > 0 && (
          <p className="text-center text-xs text-[#3d5870] mt-4 font-mono">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para "{search}"
          </p>
        )}

      </main>
    </div>
  );
}
