'use client';

import { useRouter } from 'next/navigation';

export default function StatsPage() {
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
        <div className="w-full max-w-6xl px-6 py-8">
          <h1 className="text-3xl font-serif font-semibold text-[#dde6ef] mb-4">Estadísticas</h1>
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-8 text-center">
            <p className="text-[#7a95aa]">Módulo en desarrollo. Aquí irán tus métricas clínicas.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
