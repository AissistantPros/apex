'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, signOut } from '@/app/lib/auth';
import type { User } from '@supabase/supabase-js';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await getUser();
      if (!currentUser) {
        router.push('/auth/login');
      } else {
        setUser(currentUser);
        fetchPatients();
      }
    };
    checkUser();
  }, [router]);

  const fetchPatients = async () => {
    try {
      const response = await fetch('http://localhost:8000/patients?limit=20', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      setPatients(data.patients || []);
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter(p =>
    (p.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLogout = async () => {
    await signOut();
    router.push('/auth/login');
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;

  return (
    <div className="h-screen bg-[#070a0e] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6 gap-2.5">
        <div className="flex items-center gap-2">
          <div className="text-base font-black text-[#00e5a0] tracking-wider">
            APEX
          </div>
          <span className="font-mono text-xs bg-[rgba(14,165,233,.1)] border border-[rgba(14,165,233,.2)] px-1.5 py-0.5 rounded text-[#0ea5e9]">
            PRO
          </span>
        </div>

        <div className="flex-1" />

        {/* Doctor Info */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-[#dde6ef]">
              Dr. {user?.user_metadata?.full_name || 'Doctor'}
            </p>
            <p className="font-mono text-xs text-[#3d5870]">médico</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-xs font-bold text-black border-2 border-[rgba(0,229,160,.3)]">
            {user?.email?.[0].toUpperCase() || 'D'}
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="ml-4 px-3 py-1 rounded text-xs font-mono text-[#7a95aa] hover:text-[#dde6ef] transition"
        >
          Salir
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden pt-14 pb-0 flex flex-col">
        <div className="flex-1 overflow-y-auto flex justify-center">
          <div className="w-full max-w-4xl px-6 py-8">
            {/* Welcome Section */}
            <div className="mb-10">
              <h1 className="text-3xl font-serif font-semibold text-[#dde6ef] mb-1">
                ¿En qué vamos a trabajar hoy?
              </h1>
              <p className="text-[#7a95aa]">
                Gestiona tus pacientes, analiza datos y genera protocolos personalizados
              </p>
            </div>

            {/* Search Bar */}
            <div className="mb-10">
              <input
                type="text"
                placeholder="Buscar paciente por nombre, apellido o ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] placeholder-[#3d5870] outline-none focus:border-[#00e5a0] focus:shadow-[0_0_0_3px_rgba(0,229,160,.08)]"
              />
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Nuevo Paciente */}
              <button
                onClick={() => router.push('/dashboard/new-patient')}
                className="p-6 bg-[#0d1520] border border-[#1e2d3d] rounded-lg hover:border-[#00e5a0] hover:shadow-lg transition-all group"
              >
                <div className="text-3xl mb-3 group-hover:scale-110 transition">👤</div>
                <h3 className="font-semibold text-[#dde6ef] mb-1">Nuevo Paciente</h3>
                <p className="text-xs text-[#7a95aa]">Registra un nuevo paciente en el sistema</p>
              </button>

              {/* Estadísticas */}
              <button
                onClick={() => router.push('/dashboard/stats')}
                className="p-6 bg-[#0d1520] border border-[#1e2d3d] rounded-lg hover:border-[#0ea5e9] hover:shadow-lg transition-all group"
              >
                <div className="text-3xl mb-3 group-hover:scale-110 transition">📊</div>
                <h3 className="font-semibold text-[#dde6ef] mb-1">Estadísticas</h3>
                <p className="text-xs text-[#7a95aa]">Ve tus métricas y análisis clínicos</p>
              </button>

              {/* Ayuda */}
              <button
                onClick={() => router.push('/dashboard/help')}
                className="p-6 bg-[#0d1520] border border-[#1e2d3d] rounded-lg hover:border-[#f97316] hover:shadow-lg transition-all group"
              >
                <div className="text-3xl mb-3 group-hover:scale-110 transition">❓</div>
                <h3 className="font-semibold text-[#dde6ef] mb-1">Ayuda</h3>
                <p className="text-xs text-[#7a95aa]">Tutoriales y soporte técnico</p>
              </button>
            </div>

            {/* Recent Patients */}
            <div className="mt-10">
              <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">
                {searchQuery ? 'Resultados de Búsqueda' : 'Pacientes Recientes'}
              </h2>
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg overflow-hidden">
                {filteredPatients.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-[#7a95aa]">
                      {patients.length === 0
                        ? 'No hay pacientes aún. Comienza creando un nuevo paciente.'
                        : 'No hay resultados para tu búsqueda.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#1e2d3d]">
                    {filteredPatients.map((patient) => (
                      <div
                        key={patient.id}
                        onClick={() => router.push(`/dashboard/patient/${patient.id}`)}
                        className="p-4 hover:bg-[#111820] transition cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <p className="font-semibold text-[#dde6ef]">{patient.full_name}</p>
                          <div className="flex gap-3 text-xs text-[#7a95aa] mt-1">
                            <span>ID: {patient.id}</span>
                            {patient.email && <span>📧 {patient.email}</span>}
                            {patient.phone && <span>📱 {patient.phone}</span>}
                          </div>
                        </div>
                        <div className="text-[#00e5a0]">→</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Chat - Placeholder */}
      <div className="fixed bottom-6 right-6 w-12 h-12 bg-[#00e5a0] rounded-full flex items-center justify-center text-black font-bold shadow-lg hover:scale-110 transition cursor-pointer">
        💬
      </div>
    </div>
  );
}
