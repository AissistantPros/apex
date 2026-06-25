'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/app/lib/auth';

export default function NursePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState({
    // BLOQUE 3: Antecedentes Heredofamiliares
    family_history: '',
    // BLOQUE 4: Antecedentes Personales Patológicos
    chronic_diseases: '',
    surgeries: '',
    hospitalizations: '',
    fractures: '',
    allergies_medications: '',
    allergies_foods: '',
    allergies_environmental: '',
    transfusions: '',
    childhood_diseases: '',
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
    setStep(2);
  };

  const handleBack = () => {
    router.back();
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;

  return (
    <div className="h-screen bg-[#070a0e] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6">
        <button onClick={handleBack} className="text-[#00e5a0]">← Volver</button>
        <div className="flex-1" />
        <div className="text-sm font-mono text-[#7a95aa]">🟨 FASE 2 - ENFERMERA</div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-14 flex justify-center">
        <div className="page-content px-6 py-8 pb-40">
          {/* Progress */}
          <div className="mb-8">
            <div className="text-sm font-mono text-[#f97316] mb-2">BLOQUE {step + 2} DE 4</div>
            <h1 className="text-3xl font-serif text-[#dde6ef] mb-2">
              {step === 1 ? 'Antecedentes Heredofamiliares' : 'Antecedentes Personales Patológicos'}
            </h1>
            <p className="text-[#7a95aa]">
              {step === 1
                ? 'Enfermedades en la familia del paciente'
                : 'Enfermedades, cirugías y alergias personales'}
            </p>
            <div className="flex gap-2 mt-4">
              <div className={`h-1 flex-1 rounded ${step >= 1 ? 'bg-[#f97316]' : 'bg-[#1e2d3d]'}`}></div>
              <div className={`h-1 flex-1 rounded ${step >= 2 ? 'bg-[#f97316]' : 'bg-[#1e2d3d]'}`}></div>
            </div>
          </div>

          {/* BLOQUE 3: Heredofamiliares */}
          {step === 1 && (
            <div className="space-y-6 mb-8">
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">🧬 Antecedentes Heredofamiliares</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">
                      ENFERMEDADES EN FAMILIA (padre, madre, abuelos, hermanos)
                    </label>
                    <textarea
                      value={formData.family_history}
                      onChange={(e) => handleInputChange('family_history', e.target.value)}
                      placeholder="Ej: Padre con diabetes tipo 2, madre con hipertensión, abuelo paterno con cáncer de próstata..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none min-h-[150px]"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">✝️ Causas de muerte relevantes</h2>
                <p className="text-xs text-[#7a95aa] mb-4">Opcional: Si algún familiar falleci ó, ¿cuál fue la causa?</p>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">CAUSAS DE MUERTE</label>
                    <textarea
                      placeholder="Ej: Padre - Infarto, Abuelo - Cáncer de pulmón..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none min-h-[100px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BLOQUE 4: Personales Patológicos */}
          {step === 2 && (
            <div className="space-y-6 mb-8">
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">🏥 Enfermedades crónicas</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">ENFERMEDADES DIAGNOSTICADAS</label>
                    <textarea
                      value={formData.chronic_diseases}
                      onChange={(e) => handleInputChange('chronic_diseases', e.target.value)}
                      placeholder="Ej: Diabetes tipo 2 (2018), Hipertensión (2020), Hipotiroidismo (2015)..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none min-h-[100px]"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">🔪 Cirugías y hospitalizaciones</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">CIRUGÍAS (nombre y año)</label>
                    <textarea
                      value={formData.surgeries}
                      onChange={(e) => handleInputChange('surgeries', e.target.value)}
                      placeholder="Ej: Apendicectomía (2010), Cesárea (2015)..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none min-h-[80px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">HOSPITALIZACIONES (motivo y año)</label>
                    <textarea
                      value={formData.hospitalizations}
                      onChange={(e) => handleInputChange('hospitalizations', e.target.value)}
                      placeholder="Ej: Neumonía (2019), Accidente (2012)..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none min-h-[80px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">FRACTURAS Y TRAUMATISMOS</label>
                    <input
                      type="text"
                      value={formData.fractures}
                      onChange={(e) => handleInputChange('fractures', e.target.value)}
                      placeholder="Ej: Fractura de cadera izquierda (2021)..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">⚠️ Alergias conocidas</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">ALERGIAS A MEDICAMENTOS</label>
                    <input
                      type="text"
                      value={formData.allergies_medications}
                      onChange={(e) => handleInputChange('allergies_medications', e.target.value)}
                      placeholder="Penicilina, AINEs, yodo..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">ALERGIAS A ALIMENTOS</label>
                    <input
                      type="text"
                      value={formData.allergies_foods}
                      onChange={(e) => handleInputChange('allergies_foods', e.target.value)}
                      placeholder="Mariscos, lácteos, nueces..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">ALERGIAS AMBIENTALES / OTROS</label>
                    <input
                      type="text"
                      value={formData.allergies_environmental}
                      onChange={(e) => handleInputChange('allergies_environmental', e.target.value)}
                      placeholder="Polen, polvo, látex..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">🩸 Otros antecedentes</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">TRANSFUSIONES</label>
                    <input
                      type="text"
                      value={formData.transfusions}
                      onChange={(e) => handleInputChange('transfusions', e.target.value)}
                      placeholder="Ej: Post-operatorio 2018..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">ENFERMEDADES DE LA INFANCIA RELEVANTES</label>
                    <input
                      type="text"
                      value={formData.childhood_diseases}
                      onChange={(e) => handleInputChange('childhood_diseases', e.target.value)}
                      placeholder="Fiebre reumática, meningitis..."
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#f97316] outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="sticky bottom-0 left-0 right-0 bg-[#070a0e] border-t border-[#1e2d3d] px-6 py-4 flex justify-between z-40">
            <button
              onClick={() => step === 2 ? setStep(1) : handleBack()}
              className="px-4 py-2 text-[#7a95aa] border border-[#1e2d3d] rounded hover:border-[#f97316]"
            >
              ← Anterior
            </button>
            <button
              onClick={handleNext}
              disabled={step === 2}
              className="px-4 py-2 bg-[#f97316] text-black rounded font-semibold hover:bg-[#f97316]/90 disabled:opacity-50"
            >
              {step === 1 ? 'Siguiente →' : 'Completado ✓'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
