'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';
import type { User } from '@supabase/supabase-js';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUser().then(u => {
      if (!u) router.push('/auth/login');
      else { setUser(u); fetchRecent(); }
    });
  }, [router]);

  const fetchRecent = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/patients?limit=5`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setRecentPatients(data.patients || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Doctor';

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">
      Cargando...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav userName={userName} />

      <main className="pt-16 max-w-5xl mx-auto px-6 py-10">

        {/* Bienvenida */}
        <div className="mb-10">
          <h1 className="text-3xl font-serif font-semibold text-[#dde6ef] mb-1">
            Buenos días, Dr. {userName} 👋
          </h1>
          <p className="text-[#7a95aa] text-base">
            ¿Con quién vas a trabajar hoy?
          </p>
        </div>

        {/* Acciones rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-12">
          <ActionCard
            icon="👤"
            title="Nuevo Paciente"
            desc="Registrar un paciente nuevo en el sistema"
            color="#00e5a0"
            onClick={() => router.push('/dashboard/new-patient')}
          />
          <ActionCard
            icon="👥"
            title="Ver Pacientes"
            desc="Lista completa de todos tus pacientes"
            color="#0ea5e9"
            onClick={() => router.push('/dashboard/patients')}
          />
          <ActionCard
            icon="🏥"
            title="Mi Clínica"
            desc="Configuración y datos de tu clínica"
            color="#f97316"
            onClick={() => router.push('/dashboard/clinic')}
          />
          <ActionCard
            icon="🩺"
            title="Staff"
            desc="Gestionar recepcionistas y enfermeras"
            color="#a78bfa"
            onClick={() => router.push('/dashboard/staff')}
          />
          <ActionCard
            icon="📊"
            title="Estadísticas"
            desc="Métricas y análisis de tu práctica"
            color="#0ea5e9"
            onClick={() => router.push('/dashboard/stats')}
          />
          <ActionCard
            icon="❓"
            title="Ayuda"
            desc="Tutoriales y soporte técnico"
            color="#f59e0b"
            onClick={() => router.push('/dashboard/help')}
          />
        </div>

        {/* Pacientes recientes */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[#dde6ef]">
                📋 Actividad reciente
              </h2>
              <p className="text-xs text-[#3d5870] mt-0.5">
                Pacientes con cambios o actualizaciones recientes
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/patients')}
              className="text-sm text-[#0ea5e9] hover:underline font-mono"
            >
              Ver todos →
            </button>
          </div>

          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl overflow-hidden">
            {recentPatients.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-4xl mb-3">🏥</p>
                <p className="text-[#7a95aa] text-base font-medium">No hay pacientes aún</p>
                <p className="text-[#3d5870] text-sm mt-1">Comienza registrando a tu primer paciente</p>
                <button
                  onClick={() => router.push('/dashboard/new-patient')}
                  className="mt-4 px-5 py-2.5 bg-[#00e5a0] text-black text-sm font-semibold rounded-lg hover:opacity-90 transition"
                >
                  + Nuevo Paciente
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#1e2d3d]">
                {recentPatients.map(p => (
                  <PatientRow key={p.id} patient={p} onClick={() => router.push(`/dashboard/patient/${p.id}`)} />
                ))}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────

function ActionCard({ icon, title, desc, color, onClick }: {
  icon: string; title: string; desc: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-6 bg-[#0d1520] border border-[#1e2d3d] rounded-xl hover:shadow-lg transition-all text-left group"
      style={{ '--c': color } as any}
      onMouseEnter={e => (e.currentTarget.style.borderColor = color + '55')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2d3d')}
    >
      <div className="text-4xl mb-3 group-hover:scale-110 transition-transform inline-block">{icon}</div>
      <h3 className="font-bold text-[#dde6ef] text-base mb-1">{title}</h3>
      <p className="text-xs text-[#7a95aa] leading-relaxed">{desc}</p>
    </button>
  );
}

function PatientRow({ patient, onClick }: { patient: any; onClick: () => void }) {
  const initials = `${patient.first_name?.[0] || ''}${patient.last_name?.[0] || ''}`.toUpperCase();
  const dob = patient.date_of_birth || patient.birth_date;
  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-4 hover:bg-[#111820] cursor-pointer transition"
    >
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
        {initials || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#dde6ef] truncate">{patient.full_name || '—'}</p>
        <p className="text-xs text-[#7a95aa] font-mono">{patient.id}</p>
      </div>
      {age !== null && (
        <span className="text-xs text-[#3d5870] hidden sm:block">{age} años</span>
      )}
      <span className="text-[#3d5870] text-lg">›</span>
    </div>
  );
}
