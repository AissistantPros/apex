'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/app/lib/auth';
import { patientsAPI } from '@/app/lib/api';
import type { User } from '@supabase/supabase-js';

export default function NewPatientPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    // Step 1: Identificación
    fullName: '',
    birthDate: '',
    sex: 'M',
    occupation: '',
    photo: null as File | null,
    // Step 2: Contacto
    email: '',
    phone: '',
    emergencyName: '',
    emergencyPhone: '',
    emergencyEmail: '',
    // Step 3: Antecedentes familiares
    familyHistory: {} as Record<string, string>,
    // Step 4: Antecedentes personales
    pastMedicalHistory: {} as Record<string, string>,
    // Step 5: Medicamentos
    medications: [] as Array<{ name: string; dosage: string }>,
  });

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await getUser();
      if (!currentUser) {
        router.push('/auth/login');
      } else {
        setUser(currentUser);
        setFormData(prev => ({ ...prev, email: currentUser.email || '' }));
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < 5) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Enviar datos al backend
      const response = await patientsAPI.create({
        full_name: formData.fullName,
        birth_date: formData.birthDate,
        sex: formData.sex,
        occupation: formData.occupation,
        email: formData.email,
        phone: formData.phone,
        emergency_contact_name: formData.emergencyName,
        emergency_contact_phone: formData.emergencyPhone,
        emergency_contact_email: formData.emergencyEmail,
        source_of_contact: 'other',
        reviewed_social_media: false,
        reviewed_website: false,
        reviewed_google_maps: false,
      });

      const patientId = response.data.id;
      console.log('Paciente creado:', patientId);

      // Redirigir a la ficha del paciente
      router.push(`/dashboard/patient/${patientId}`);
    } catch (error: any) {
      console.error('Error al guardar paciente:', error);
      alert('Error al guardar el paciente: ' + (error.response?.data?.detail || error.message));
      setLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;

  return (
    <div className="h-screen bg-[#070a0e] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6">
        <button onClick={() => router.back()} className="text-[#00e5a0] hover:text-white">← Volver</button>
        <div className="flex-1" />
        <span className="font-mono text-xs text-[#3d5870]">Paso {step} de 5</span>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pt-14 flex justify-center">
        <div className="w-full max-w-2xl px-6 py-8">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full transition ${
                    i <= step ? 'bg-[#00e5a0]' : 'bg-[#1e2d3d]'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Form */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Identificación del Paciente</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-mono text-[#7a95aa] mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    placeholder="Ej: Juan Pérez García"
                    className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-mono text-[#7a95aa] mb-1">Fecha de Nacimiento *</label>
                  <input
                    type="date"
                    value={formData.birthDate}
                    onChange={(e) => handleInputChange('birthDate', e.target.value)}
                    className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-mono text-[#7a95aa] mb-1">Sexo Biológico *</label>
                    <select
                      value={formData.sex}
                      onChange={(e) => handleInputChange('sex', e.target.value)}
                      className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                    >
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-mono text-[#7a95aa] mb-1">Ocupación</label>
                    <input
                      type="text"
                      value={formData.occupation}
                      onChange={(e) => handleInputChange('occupation', e.target.value)}
                      placeholder="Ej: Ingeniero"
                      className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Contacto</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-mono text-[#7a95aa] mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-mono text-[#7a95aa] mb-1">Teléfono *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                  />
                </div>
                <div className="border-t border-[#1e2d3d] pt-4 mt-6">
                  <h3 className="font-semibold text-[#dde6ef] mb-4">Contacto de Emergencia</h3>
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={formData.emergencyName}
                      onChange={(e) => handleInputChange('emergencyName', e.target.value)}
                      placeholder="Nombre"
                      className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                    />
                    <input
                      type="tel"
                      value={formData.emergencyPhone}
                      onChange={(e) => handleInputChange('emergencyPhone', e.target.value)}
                      placeholder="Teléfono"
                      className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Antecedentes Familiares</h2>
              <p className="text-[#7a95aa] mb-4">Indica si hay antecedentes en familiares directos</p>
              <div className="space-y-3">
                {['Diabetes', 'Hipertensión', 'Cáncer', 'Cardiopatía', 'Demencia', 'Depresión'].map(condition => (
                  <label key={condition} className="flex items-center gap-3 p-3 bg-[#111820] border border-[#1e2d3d] rounded-lg cursor-pointer hover:border-[#00e5a0]">
                    <input type="checkbox" className="w-4 h-4" />
                    <span className="text-[#dde6ef]">{condition}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Antecedentes Personales</h2>
              <p className="text-[#7a95aa] mb-4">Indica enfermedades crónicas, cirugías y alergias</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-mono text-[#7a95aa] mb-1">Enfermedades Crónicas</label>
                  <textarea
                    placeholder="Ej: Diabetes tipo 2 (2015), Hipertensión (2018)"
                    className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0] h-24"
                  />
                </div>
                <div>
                  <label className="block text-sm font-mono text-[#7a95aa] mb-1">Cirugías</label>
                  <textarea
                    placeholder="Ej: Apendicectomía (2010), Colecistectomía (2015)"
                    className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0] h-24"
                  />
                </div>
                <div>
                  <label className="block text-sm font-mono text-[#7a95aa] mb-1">Alergias</label>
                  <textarea
                    placeholder="Ej: Penicilina, Camarones, Latex"
                    className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0] h-24"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="text-2xl font-serif text-[#dde6ef] mb-6">Medicamentos Actuales</h2>
              <p className="text-[#7a95aa] mb-4">Lista los medicamentos que toma realmente el paciente</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-mono text-[#7a95aa] mb-1">Medicamento 1</label>
                  <input
                    type="text"
                    placeholder="Ej: Atorvastatina 40mg"
                    className="w-full px-4 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                  />
                </div>
                <button className="w-full py-2 border border-dashed border-[#1e2d3d] rounded-lg text-[#00e5a0] hover:border-[#00e5a0] transition">
                  + Agregar medicamento
                </button>
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
            {step < 5 ? (
              <button
                onClick={handleNext}
                className="flex-1 py-3 px-4 bg-[#00e5a0] text-black rounded-lg font-semibold hover:bg-[#00ffb0] transition"
              >
                Siguiente →
              </button>
            ) : (
              <button
                onClick={handleSave}
                className="flex-1 py-3 px-4 bg-[#0ea5e9] text-white rounded-lg font-semibold hover:bg-[#0d96d1] transition"
              >
                Guardar Paciente
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
