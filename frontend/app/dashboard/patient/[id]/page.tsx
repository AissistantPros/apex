'use client';

import { useRouter, useParams } from 'next/navigation';

export default function PatientPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params?.id;

  return (
    <div className="h-screen bg-[#070a0e] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6">
        <button onClick={() => router.back()} className="text-[#00e5a0] hover:text-white">← Volver</button>
        <div className="flex-1" />
        <button onClick={() => router.push('/dashboard')} className="text-[#7a95aa] hover:text-[#dde6ef]">Home</button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pt-14 flex justify-center">
        <div className="w-full max-w-4xl px-6 py-8">
          <h1 className="text-3xl font-serif font-semibold text-[#dde6ef] mb-4">Ficha del Paciente</h1>
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-8">
            <p className="text-[#7a95aa] mb-4">Paciente ID: {patientId}</p>
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-2">Próximos pasos:</h2>
                <ul className="text-[#7a95aa] space-y-2">
                  <li>✅ Paciente creado en base de datos</li>
                  <li>⏳ ETAPA 2: Enfermera cargará antecedentes y signos vitales</li>
                  <li>⏳ ETAPA 3: Médico completará datos privados y análisis</li>
                </ul>
              </div>
              <button
                onClick={() => router.push('/dashboard')}
                className="mt-6 px-4 py-2 bg-[#00e5a0] text-black rounded-lg font-semibold hover:bg-[#00ffb0]"
              >
                Volver al Dashboard
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
