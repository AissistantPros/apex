'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/app/lib/auth';

export default function NewPatientPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await getUser();
      if (!currentUser) {
        router.push('/auth/login');
      } else {
        setUser(currentUser);
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;

  return (
    <div className="h-screen bg-[#070a0e] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6">
        <button onClick={() => router.back()} className="text-[#00e5a0]">← Volver</button>
        <div className="flex-1" />
        <div className="text-sm font-mono text-[#7a95aa]">NUEVO PACIENTE</div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-14 flex justify-center items-center">
        <div className="w-full max-w-4xl px-6 py-8">
          {/* Welcome Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-serif text-[#dde6ef] mb-3">
              Nuevo Paciente
            </h1>
            <p className="text-lg text-[#7a95aa]">
              Inicia el registro del paciente
            </p>
          </div>

          {/* Botón principal */}
          <div className="flex justify-center">
            <button
              onClick={() => router.push('/dashboard/new-patient/flow')}
              className="group bg-[#0d1520] border-2 border-[#00e5a0] rounded-xl p-10 hover:shadow-lg hover:shadow-[rgba(0,229,160,.2)] transition-all flex flex-col items-center gap-4 w-full max-w-sm"
            >
              <div className="text-6xl">👤</div>
              <div className="text-xl font-semibold text-[#dde6ef]">Iniciar registro</div>
              <div className="text-sm text-[#7a95aa]">Nuevo paciente</div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
