'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser } from '@/app/lib/auth';
import type { User } from '@supabase/supabase-js';

export default function AnalysisPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params?.id;
  const visitId = params?.visitId;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState('');

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await getUser();
      if (!currentUser) {
        router.push('/auth/login');
      } else {
        setUser(currentUser);
        fetchAnalysis();
      }
    };
    checkUser();
  }, []);

  const fetchAnalysis = async () => {
    try {
      const response = await fetch(`http://localhost:8000/analysis/${visitId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.id}`,
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      setAnalysis(data.analysis || 'Análisis no disponible');
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };

  const downloadPDF = async (type: string) => {
    try {
      const response = await fetch(
        `http://localhost:8000/analysis/${visitId}/pdf?pdf_type=${type}`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${user?.id}` } }
      );
      const data = await response.json();
      alert(`${type.toUpperCase()}: ${data.content}`);
    } catch (error) {
      alert('Error descargando PDF');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Analizando...</div>;

  return (
    <div className="h-screen bg-[#070a0e] flex flex-col">
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6">
        <button onClick={() => router.back()} className="text-[#00e5a0]">← Volver</button>
        <div className="flex-1" />
        <button onClick={() => router.push('/dashboard')} className="text-[#7a95aa]">Home</button>
      </header>

      <main className="flex-1 overflow-y-auto pt-14 flex justify-center">
        <div className="w-full max-w-4xl px-6 py-8">
          <h1 className="text-3xl font-serif text-[#dde6ef] mb-6">Análisis Clínico</h1>

          {/* Análisis */}
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6 mb-6">
            <div className="prose prose-invert max-w-none">
              <p className="text-[#dde6ef] whitespace-pre-wrap">{analysis}</p>
            </div>
          </div>

          {/* Descargar PDFs */}
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => downloadPDF('recipe')}
              className="p-4 bg-[#0d1520] border border-[#1e2d3d] rounded-lg hover:border-[#00e5a0] transition"
            >
              <div className="text-2xl mb-2">📋</div>
              <h3 className="font-semibold text-[#dde6ef]">Receta Médica</h3>
              <p className="text-xs text-[#7a95aa]">Descargar NOM-168</p>
            </button>

            <button
              onClick={() => downloadPDF('report')}
              className="p-4 bg-[#0d1520] border border-[#1e2d3d] rounded-lg hover:border-[#0ea5e9] transition"
            >
              <div className="text-2xl mb-2">📊</div>
              <h3 className="font-semibold text-[#dde6ef]">Reporte del Paciente</h3>
              <p className="text-xs text-[#7a95aa]">Números clave + protocolo</p>
            </button>

            <button
              onClick={() => downloadPDF('studies')}
              className="p-4 bg-[#0d1520] border border-[#1e2d3d] rounded-lg hover:border-[#f97316] transition"
            >
              <div className="text-2xl mb-2">🔬</div>
              <h3 className="font-semibold text-[#dde6ef]">Solicitud Estudios</h3>
              <p className="text-xs text-[#7a95aa]">Sin justificación</p>
            </button>
          </div>

          {/* Actions */}
          <div className="mt-8 flex gap-4">
            <button
              onClick={() => router.push(`/dashboard/patient/${patientId}`)}
              className="flex-1 py-3 bg-[#00e5a0] text-black rounded-lg font-semibold hover:bg-[#00ffb0]"
            >
              Volver a Ficha del Paciente
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 py-3 bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef] rounded-lg hover:border-[#7a95aa]"
            >
              Volver a Dashboard
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
