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
              Selecciona por cuál fase deseas completar el registro
            </p>
          </div>

          {/* Fases Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* FLUJO CONTINUO */}
            <button
              onClick={() => router.push('/dashboard/new-patient/flow')}
              className="group relative bg-[#0d1520] border-2 border-[#00e5a0] rounded-xl p-8 hover:shadow-lg hover:shadow-[rgba(0,229,160,.2)] transition-all md:col-span-3"
            >
              <div className="absolute top-4 right-4 bg-[#00e5a0] text-black text-xs font-mono font-bold px-3 py-1 rounded">
                FLUJO COMPLETO
              </div>
              <div className="text-5xl mb-4">✨</div>
              <h2 className="text-2xl font-semibold text-[#dde6ef] mb-3">
                Registro Completo de Paciente
              </h2>
              <p className="text-sm text-[#7a95aa] mb-4 text-left">
                Completa todas las fases en un flujo continuo. Cada fase está claramente marcada y será registrada en el sistema.
              </p>
              <div className="text-xs font-mono text-[#00e5a0] bg-[rgba(0,229,160,.1)] px-3 py-2 rounded text-left space-y-2">
                <div className="flex gap-2">
                  <span>🟦 FASE 1:</span> <span>Recepcionista (Identificación + Contacto + Marketing)</span>
                </div>
                <div className="flex gap-2">
                  <span>🟨 FASE 2:</span> <span>Enfermera (Heredofamiliares + Patológicos)</span>
                </div>
                <div className="flex gap-2">
                  <span>🟥 FASE 3:</span> <span>Doctor (Hábitos + Reproductiva)</span>
                </div>
              </div>
            </button>
          </div>

          {/* Info Box */}
          <div className="mt-12 bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
            <h3 className="text-sm font-semibold text-[#dde6ef] mb-2">💡 Cómo funciona</h3>
            <p className="text-sm text-[#7a95aa]">
              Cada fase del registro corresponde a un rol específico. Puedes completar cualquier fase en cualquier momento. Al dar de alta al paciente, el doctor decidirá qué permisos darle a cada persona.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
