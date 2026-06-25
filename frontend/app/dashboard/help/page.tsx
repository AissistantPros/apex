'use client';

import { useRouter } from 'next/navigation';

export default function HelpPage() {
  const router = useRouter();

  return (
    <div className="h-screen bg-[#070a0e] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6 gap-2.5">
        <button onClick={() => router.back()} className="text-[#00e5a0] hover:text-white transition">← Volver</button>
        <div className="flex-1" />
        <button onClick={() => router.push('/dashboard')} className="text-[#7a95aa] hover:text-[#dde6ef]">Home</button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pt-14 flex justify-center">
        <div className="page-content px-6 py-8">
          <h1 className="text-3xl font-serif font-semibold text-[#dde6ef] mb-4">Ayuda</h1>
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-8">
            <h2 className="text-xl font-semibold text-[#dde6ef] mb-4">Bienvenido a APEX</h2>
            <div className="space-y-4 text-[#7a95aa]">
              <p>• Comienza creando un nuevo paciente</p>
              <p>• Registra datos de una visita</p>
              <p>• El sistema generará análisis con IA</p>
              <p>• Descarga protocolos y recetas</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
