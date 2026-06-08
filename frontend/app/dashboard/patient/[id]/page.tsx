'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function PatientPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params?.id as string;
  const [patient, setPatient] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    fetchPatientData();
    fetchVisits();
  }, [patientId]);

  const fetchPatientData = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/patients/${patientId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      setPatient(data);
    } catch (error) {
      console.error('Error fetching patient:', error);
    }
  };

  const fetchVisits = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/visits/${patientId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      setVisits(data.visits || []);
    } catch (error) {
      console.error('Error fetching visits:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;

  return (
    <div className="h-screen bg-[#070a0e] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6">
        <button onClick={() => router.back()} className="text-[#00e5a0]">← Volver</button>
        <div className="flex-1" />
        <button onClick={() => router.push('/dashboard')} className="text-[#7a95aa]">Home</button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pt-14 flex justify-center">
        <div className="w-full max-w-4xl px-6 py-8">
          {/* Patient Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-serif font-semibold text-[#dde6ef] mb-2">
              {patient?.full_name}
            </h1>
            <div className="flex gap-4 text-sm text-[#7a95aa]">
              <span>ID: {patientId}</span>
              {patient?.email && <span>📧 {patient.email}</span>}
              {patient?.phone && <span>📱 {patient.phone}</span>}
            </div>
          </div>

          {/* Patient Info Card */}
          {patient && (
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">Información del Paciente</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[#7a95aa] text-xs">SX</p>
                  <p className="text-[#dde6ef]">
                    {patient.sexo_biologico
                      ? patient.sexo_biologico === 'Masculino' ? 'M'
                        : patient.sexo_biologico === 'Femenino' ? 'F'
                        : patient.sexo_biologico
                      : patient.sex || '—'}
                    {patient.genero_identidad ? ` · ${patient.genero_identidad}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-[#7a95aa] text-xs">Ocupación</p>
                  <p className="text-[#dde6ef]">{patient.occupation || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}

          {/* New Visit Button */}
          <button
            onClick={() => router.push(`/dashboard/patient/${patientId}/visit`)}
            className="w-full py-4 bg-[#00e5a0] text-black rounded-lg font-semibold hover:bg-[#00ffb0] mb-8 transition"
          >
            + Nueva Visita
          </button>

          {/* Visits History */}
          <div>
            <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">Historial de Visitas</h2>
            {visits.length === 0 ? (
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-8 text-center">
                <p className="text-[#7a95aa]">Sin visitas registradas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {visits.map((visit) => (
                  <div
                    key={visit.id}
                    onClick={() => router.push(`/dashboard/patient/${patientId}/visit/${visit.id}/analysis`)}
                    className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6 hover:border-[#00e5a0] transition cursor-pointer"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[#dde6ef] font-semibold">{visit.visit_reason}</p>
                        <p className="text-xs text-[#7a95aa] mt-1">
                          {new Date(visit.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-[#00e5a0]">→</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
