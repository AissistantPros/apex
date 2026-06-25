'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/app/lib/auth';

export default function ReceptionistPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    // BLOQUE 1: Identificación y Contacto
    first_name: '',
    last_name: '',
    date_of_birth: '',
    sex: '',
    occupation: '',
    email: '',
    phone: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_email: '',
    emergency_contact_relationship: '',
    // BLOQUE 2: Marketing
    source_of_contact: '',
    referred_by: '',
    reviewed_social_media: false,
    reviewed_website: false,
    reviewed_google_maps: false,
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
    if (step === 1) {
      // Validar Bloque 1
      if (!formData.first_name || !formData.last_name || !formData.date_of_birth || !formData.sex || !formData.email || !formData.phone) {
        alert('Nombre(s), Apellido(s), Fecha de nacimiento, Sexo, Email y Teléfono son obligatorios');
        return;
      }
      setStep(2);
    }
  };

  const handleSave = async () => {
    if (!formData.first_name || !formData.last_name || !formData.date_of_birth || !formData.sex || !formData.email || !formData.phone) {
      alert('Nombre(s), Apellido(s), Fecha de nacimiento, Sexo, Email y Teléfono son obligatorios');
      return;
    }

    // Combinar nombre y apellido para compatibilidad con backend
    const dataToSend = {
      ...formData,
      full_name: `${formData.first_name} ${formData.last_name}`,
      birth_date: formData.date_of_birth,
    };

    setSaving(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/patients/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.id}`,
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error saving patient');
      }

      const patientData = await response.json();
      router.push(`/dashboard/patient/${patientData.id}`);
    } catch (error: any) {
      alert('Error: ' + error.message);
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;

  return (
    <div className="h-screen bg-[#070a0e] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6">
        <button onClick={() => router.back()} className="text-[#00e5a0]">← Volver</button>
        <div className="flex-1" />
        <div className="text-sm font-mono text-[#7a95aa]">🟦 FASE 1 - RECEPCIONISTA</div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-14 flex justify-center">
        <div className="page-content px-6 py-8 pb-40">
          {/* Progress */}
          <div className="mb-8">
            <div className="text-sm font-mono text-[#0ea5e9] mb-2">BLOQUE {step} DE 2</div>
            <h1 className="text-3xl font-serif text-[#dde6ef] mb-2">
              {step === 1 ? 'Identificación y Contacto' : 'Cómo nos conoció'}
            </h1>
            <p className="text-[#7a95aa]">
              {step === 1
                ? 'Datos personales y de contacto del paciente'
                : 'Información sobre cómo llegó a tu clínica'}
            </p>
            <div className="flex gap-2 mt-4">
              <div className={`h-1 flex-1 rounded ${step >= 1 ? 'bg-[#0ea5e9]' : 'bg-[#1e2d3d]'}`}></div>
              <div className={`h-1 flex-1 rounded ${step >= 2 ? 'bg-[#0ea5e9]' : 'bg-[#1e2d3d]'}`}></div>
            </div>
          </div>

          {/* BLOQUE 1: Identificación y Contacto */}
          {step === 1 && (
            <div className="space-y-6 mb-8">
              {/* Datos Personales */}
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">👤 Datos Personales</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-2 block">NOMBRE(S) *</label>
                      <input
                        type="text"
                        value={formData.first_name}
                        onChange={(e) => handleInputChange('first_name', e.target.value)}
                        placeholder="Juan"
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-2 block">APELLIDO(S) *</label>
                      <input
                        type="text"
                        value={formData.last_name}
                        onChange={(e) => handleInputChange('last_name', e.target.value)}
                        placeholder="Pérez García"
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">FECHA DE NACIMIENTO *</label>
                    <input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-2 block">SEXO BIOLÓGICO</label>
                      <select
                        value={formData.sex}
                        onChange={(e) => handleInputChange('sex', e.target.value)}
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                      >
                        <option value="">Seleccionar</option>
                        <option value="M">Masculino</option>
                        <option value="F">Femenino</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-2 block">OCUPACIÓN</label>
                      <input
                        type="text"
                        value={formData.occupation}
                        onChange={(e) => handleInputChange('occupation', e.target.value)}
                        placeholder="Médico, Ingeniero..."
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contacto */}
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">📱 Contacto Principal</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-2 block">CORREO ELECTRÓNICO *</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="correo@ejemplo.com"
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-2 block">TELÉFONO *</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="+52 55 1234 5678"
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contacto de Emergencia */}
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">🆘 Contacto de Emergencia</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">NOMBRE</label>
                    <input
                      type="text"
                      value={formData.emergency_contact_name}
                      onChange={(e) => handleInputChange('emergency_contact_name', e.target.value)}
                      placeholder="Nombre completo"
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-2 block">RELACIÓN</label>
                      <input
                        type="text"
                        value={formData.emergency_contact_relationship}
                        onChange={(e) => handleInputChange('emergency_contact_relationship', e.target.value)}
                        placeholder="Esposa, hijo, madre..."
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-2 block">TELÉFONO</label>
                      <input
                        type="tel"
                        value={formData.emergency_contact_phone}
                        onChange={(e) => handleInputChange('emergency_contact_phone', e.target.value)}
                        placeholder="+52 55 9876 5432"
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BLOQUE 2: Marketing */}
          {step === 2 && (
            <div className="space-y-6 mb-8">
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">📍 ¿Cómo nos conoció?</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-3 block">FUENTE DE LLEGADA</label>
                    <div className="space-y-2">
                      {['Recomendación paciente', 'Recomendación médico', 'Redes sociales', 'Búsqueda internet', 'Página web', 'Google Maps', 'Publicidad', 'Otro'].map((source) => (
                        <label key={source} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name="source"
                            value={source}
                            checked={formData.source_of_contact === source}
                            onChange={(e) => handleInputChange('source_of_contact', e.target.value)}
                            className="w-4 h-4"
                          />
                          <span className="text-[#dde6ef]">{source}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {formData.source_of_contact?.includes('Recomendación') && (
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-2 block">¿QUIÉN RECOMENDÓ?</label>
                      <input
                        type="text"
                        value={formData.referred_by}
                        onChange={(e) => handleInputChange('referred_by', e.target.value)}
                        placeholder="Nombre de la persona"
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#0ea5e9] outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">🔍 Investigación Previa</h2>
                <p className="text-[#7a95aa] text-sm mb-4">Antes de agendar, ¿qué revisó el paciente?</p>
                <div className="space-y-2">
                  {[
                    { key: 'reviewed_social_media', label: '📱 Redes sociales' },
                    { key: 'reviewed_website', label: '🌐 Página web' },
                    { key: 'reviewed_google_maps', label: '📍 Google Maps' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData[key as keyof typeof formData] as boolean}
                        onChange={(e) => handleInputChange(key, e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-[#dde6ef]">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="sticky bottom-0 left-0 right-0 bg-[#070a0e] border-t border-[#1e2d3d] px-6 py-4 flex justify-between z-40">
            <button
              onClick={() => step === 2 && setStep(1)}
              disabled={step === 1}
              className="px-4 py-2 text-[#7a95aa] border border-[#1e2d3d] rounded hover:border-[#00e5a0] disabled:opacity-50"
            >
              ← Anterior
            </button>
            <div className="space-x-3">
              {step === 1 && (
                <button
                  onClick={handleNext}
                  className="px-4 py-2 bg-[#0ea5e9] text-black rounded font-semibold hover:bg-[#0ea5e9]/90"
                >
                  Siguiente →
                </button>
              )}
              {step === 2 && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-[#00e5a0] text-black rounded font-semibold hover:bg-[#00ffb0] disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Registrar Paciente'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
