'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser } from '@/app/lib/auth';
import { patientsAPI } from '@/app/lib/api';
import type { User } from '@supabase/supabase-js';

export default function VisitPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params?.id;
  const [user, setUser] = useState<User | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    // Bloque A
    visit_reason: '',
    discomfort_intensity: 5,
    first_time: false,
    // Bloque B
    pa_right: '',
    pa_left: '',
    heart_rate: '',
    temperature: '',
    spo2: '',
    glucose: '',
    glucose_fasting_hours: '',
    // Bloque C
    weight: '',
    height: '',
    circumference_abdominal: '',
    circumference_waist: '',
    circumference_hip: '',
    // Bloque D
    grip_strength_left: '',
    grip_strength_right: '',
    walk_speed_4m: '',
    sit_stand_30s: '',
    // Bloque E
    energy_morning: 5,
    energy_noon: 5,
    energy_evening: 5,
    sleep_quality: 5,
    sleep_hours: '',
    mood: 'stable',
    libido: 5,
    // Bloque F
    general_inspection: '',
    skin_mucous: '',
    eyes: '',
    // Bloque G
    labs_pdf_url: '',
  });

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

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < 7) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/visits/${patientId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.id}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Error saving visit');

      const visit = await response.json();
      router.push(`/dashboard/patient/${patientId}`);
    } catch (error: any) {
      alert('Error: ' + error.message);
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
        <span className="font-mono text-xs text-[#3d5870]">Bloque {step} de 7</span>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pt-14 flex justify-center">
        <div className="w-full max-w-2xl px-6 py-8">
          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map(i => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full transition ${
                    i <= step ? 'bg-[#00e5a0]' : 'bg-[#1e2d3d]'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Forms */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Bloque A: Motivo de Visita</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#7a95aa] mb-2">¿Qué lo trae hoy?</label>
                  <textarea
                    value={formData.visit_reason}
                    onChange={(e) => handleInputChange('visit_reason', e.target.value)}
                    placeholder="Describe el motivo de la consulta"
                    className="w-full px-4 py-3 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0] h-24"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#7a95aa] mb-2">Intensidad del malestar (1-10)</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={formData.discomfort_intensity}
                    onChange={(e) => handleInputChange('discomfort_intensity', parseInt(e.target.value))}
                    className="w-full"
                  />
                  <span className="text-[#00e5a0] font-mono">{formData.discomfort_intensity}</span>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.first_time}
                    onChange={(e) => handleInputChange('first_time', e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-[#dde6ef]">¿Primera vez?</span>
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Bloque B: Signos Vitales</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">PA Derecha</label>
                  <input type="number" placeholder="mmHg" value={formData.pa_right} onChange={(e) => handleInputChange('pa_right', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">PA Izquierda</label>
                  <input type="number" placeholder="mmHg" value={formData.pa_left} onChange={(e) => handleInputChange('pa_left', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">FC</label>
                  <input type="number" placeholder="lpm" value={formData.heart_rate} onChange={(e) => handleInputChange('heart_rate', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">Temperatura</label>
                  <input type="number" placeholder="°C" value={formData.temperature} onChange={(e) => handleInputChange('temperature', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">SpO2</label>
                  <input type="number" placeholder="%" value={formData.spo2} onChange={(e) => handleInputChange('spo2', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">Glucosa</label>
                  <input type="number" placeholder="mg/dL" value={formData.glucose} onChange={(e) => handleInputChange('glucose', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Bloque C: Composición Corporal</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">Peso (kg)</label>
                  <input type="number" placeholder="kg" value={formData.weight} onChange={(e) => handleInputChange('weight', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">Altura (m)</label>
                  <input type="number" placeholder="m" value={formData.height} onChange={(e) => handleInputChange('height', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">Cintura Abdominal</label>
                  <input type="number" placeholder="cm" value={formData.circumference_abdominal} onChange={(e) => handleInputChange('circumference_abdominal', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">Cadera</label>
                  <input type="number" placeholder="cm" value={formData.circumference_hip} onChange={(e) => handleInputChange('circumference_hip', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Bloque D: Pruebas Funcionales</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">Agarre Izquierdo (kg)</label>
                  <input type="number" value={formData.grip_strength_left} onChange={(e) => handleInputChange('grip_strength_left', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">Agarre Derecho (kg)</label>
                  <input type="number" value={formData.grip_strength_right} onChange={(e) => handleInputChange('grip_strength_right', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">Velocidad 4m (s)</label>
                  <input type="number" value={formData.walk_speed_4m} onChange={(e) => handleInputChange('walk_speed_4m', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#7a95aa] mb-1">Sentarse/Levantarse 30s</label>
                  <input type="number" value={formData.sit_stand_30s} onChange={(e) => handleInputChange('sit_stand_30s', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm" />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Bloque E: Reporte Subjetivo</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#7a95aa] mb-2">Energía Mañana</label>
                  <input type="range" min="1" max="10" value={formData.energy_morning} onChange={(e) => handleInputChange('energy_morning', parseInt(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="block text-sm text-[#7a95aa] mb-2">Energía Mediodía</label>
                  <input type="range" min="1" max="10" value={formData.energy_noon} onChange={(e) => handleInputChange('energy_noon', parseInt(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="block text-sm text-[#7a95aa] mb-2">Energía Tarde/Noche</label>
                  <input type="range" min="1" max="10" value={formData.energy_evening} onChange={(e) => handleInputChange('energy_evening', parseInt(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="block text-sm text-[#7a95aa] mb-2">Calidad Sueño</label>
                  <input type="range" min="1" max="10" value={formData.sleep_quality} onChange={(e) => handleInputChange('sleep_quality', parseInt(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="block text-sm text-[#7a95aa] mb-2">Estado de Ánimo</label>
                  <select value={formData.mood} onChange={(e) => handleInputChange('mood', e.target.value)} className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef]">
                    <option>stable</option>
                    <option>anxious</option>
                    <option>irritable</option>
                    <option>sad</option>
                    <option>unmotivated</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Bloque F: Observaciones Clínicas</h2>
              <div className="space-y-3">
                <textarea placeholder="Inspección General" value={formData.general_inspection} onChange={(e) => handleInputChange('general_inspection', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm h-16" />
                <textarea placeholder="Piel y Mucosas" value={formData.skin_mucous} onChange={(e) => handleInputChange('skin_mucous', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm h-16" />
                <textarea placeholder="Ojos" value={formData.eyes} onChange={(e) => handleInputChange('eyes', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm h-16" />
              </div>
            </div>
          )}

          {step === 7 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Bloque G: Laboratorios</h2>
              <div>
                <label className="block text-sm text-[#7a95aa] mb-2">URL del PDF o Foto</label>
                <input type="url" placeholder="https://..." value={formData.labs_pdf_url} onChange={(e) => handleInputChange('labs_pdf_url', e.target.value)} className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef]" />
                <p className="text-xs text-[#7a95aa] mt-2">Por ahora, pega el link. Pronto agregaremos upload directo.</p>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-4 mt-8">
            <button
              onClick={handlePrev}
              disabled={step === 1}
              className="flex-1 py-3 px-4 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] font-semibold hover:border-[#7a95aa] transition disabled:opacity-50"
            >
              ← Anterior
            </button>
            {step < 7 ? (
              <button
                onClick={handleNext}
                className="flex-1 py-3 px-4 bg-[#00e5a0] text-black rounded-lg font-semibold hover:bg-[#00ffb0] transition"
              >
                Siguiente →
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 py-3 px-4 bg-[#0ea5e9] text-white rounded-lg font-semibold hover:bg-[#0d96d1] transition disabled:opacity-50"
              >
                {loading ? 'Guardando...' : 'Guardar Visita'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
