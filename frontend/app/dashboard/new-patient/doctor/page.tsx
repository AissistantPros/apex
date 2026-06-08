'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/app/lib/auth';

export default function DoctorPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState({
    // BLOQUE 5: Antecedentes No Patológicos
    smoking_status: '',
    smoking_count: '',
    smoking_since: '',
    alcohol_status: '',
    alcohol_type: '',
    recreational_drugs: '',
    physical_activity: '',
    stress_level: '5',
    // BLOQUE 6: Historia Reproductiva
    sex: '',
    // Mujeres
    menarca_age: '',
    menstrual_cycles: '',
    pregnancies: '',
    births: '',
    miscarriages: '',
    menopausal: false,
    menopausal_age: '',
    contraceptive: '',
    // Hombres
    erectile_dysfunction: '',
    testosterone_use: '',
    children: '',
    psa: '',
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
        <div className="text-sm font-mono text-[#7a95aa]">🟥 FASE 3 - DOCTOR</div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-14 flex justify-center">
        <div className="w-full max-w-3xl px-6 py-8 pb-40">
          {/* Progress */}
          <div className="mb-8">
            <div className="text-sm font-mono text-[#a78bfa] mb-2">BLOQUE {step + 4} DE 6</div>
            <h1 className="text-3xl font-serif text-[#dde6ef] mb-2">
              {step === 1 ? 'Antecedentes No Patológicos' : 'Historia Reproductiva'}
            </h1>
            <p className="text-[#7a95aa]">
              {step === 1
                ? 'Hábitos, sustancias y nivel de estrés'
                : 'Información reproductiva y sexual'}
            </p>
            <div className="flex gap-2 mt-4">
              <div className={`h-1 flex-1 rounded ${step >= 1 ? 'bg-[#a78bfa]' : 'bg-[#1e2d3d]'}`}></div>
              <div className={`h-1 flex-1 rounded ${step >= 2 ? 'bg-[#a78bfa]' : 'bg-[#1e2d3d]'}`}></div>
            </div>
          </div>

          {/* BLOQUE 5: No Patológicos */}
          {step === 1 && (
            <div className="space-y-6 mb-8">
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">🚬 Tabaquismo</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-3 block">ESTATUS</label>
                    <div className="space-y-2">
                      {['Nunca fumó', 'Ex-fumador', 'Fumador activo'].map((status) => (
                        <label key={status} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name="smoking"
                            value={status}
                            checked={formData.smoking_status === status}
                            onChange={(e) => handleInputChange('smoking_status', e.target.value)}
                            className="w-4 h-4"
                          />
                          <span className="text-[#dde6ef]">{status}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {formData.smoking_status && formData.smoking_status !== 'Nunca fumó' && (
                    <>
                      <input
                        type="number"
                        placeholder="Cigarros por día"
                        value={formData.smoking_count}
                        onChange={(e) => handleInputChange('smoking_count', e.target.value)}
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Desde/hasta año"
                        value={formData.smoking_since}
                        onChange={(e) => handleInputChange('smoking_since', e.target.value)}
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none"
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">🍷 Consumo de alcohol</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-3 block">FRECUENCIA</label>
                    <div className="space-y-2">
                      {['Nunca', 'Ocasional', 'Frecuente', 'Diario'].map((freq) => (
                        <label key={freq} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name="alcohol"
                            value={freq}
                            checked={formData.alcohol_status === freq}
                            onChange={(e) => handleInputChange('alcohol_status', e.target.value)}
                            className="w-4 h-4"
                          />
                          <span className="text-[#dde6ef]">{freq}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {formData.alcohol_status && formData.alcohol_status !== 'Nunca' && (
                    <>
                      <input
                        type="text"
                        placeholder="Tipo de bebida"
                        value={formData.alcohol_type}
                        onChange={(e) => handleInputChange('alcohol_type', e.target.value)}
                        className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none"
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">🌿 Otras sustancias</h2>
                <p className="text-xs text-[#7a95aa] mb-4">Confidencial - solo visible para el médico</p>
                <input
                  type="text"
                  placeholder="Cannabis, suplementos, etc."
                  value={formData.recreational_drugs}
                  onChange={(e) => handleInputChange('recreational_drugs', e.target.value)}
                  className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none"
                />
              </div>

              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">💪 Actividad física y estrés</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">TIPO Y FRECUENCIA</label>
                    <input
                      type="text"
                      placeholder="Ej: Caminata diaria, gym 3x/semana..."
                      value={formData.physical_activity}
                      onChange={(e) => handleInputChange('physical_activity', e.target.value)}
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-2 block">NIVEL DE ESTRÉS (1-10)</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={formData.stress_level}
                        onChange={(e) => handleInputChange('stress_level', e.target.value)}
                        className="flex-1"
                      />
                      <span className="text-[#a78bfa] font-mono text-lg min-w-[30px]">{formData.stress_level}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BLOQUE 6: Reproductiva */}
          {step === 2 && (
            <div className="space-y-6 mb-8">
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                <label className="text-xs font-mono text-[#7a95aa] mb-3 block">SEXO BIOLÓGICO</label>
                <div className="space-y-2">
                  {['Femenino', 'Masculino'].map((sex) => (
                    <label key={sex} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="sex"
                        value={sex}
                        checked={formData.sex === sex}
                        onChange={(e) => handleInputChange('sex', e.target.value)}
                        className="w-4 h-4"
                      />
                      <span className="text-[#dde6ef]">{sex}</span>
                    </label>
                  ))}
                </div>
              </div>

              {formData.sex === 'Femenino' && (
                <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">🌸 Historia gineco-obstétrica</h2>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <input type="number" placeholder="Edad menarca" value={formData.menarca_age} onChange={(e) => handleInputChange('menarca_age', e.target.value)} className="px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none" />
                      <input type="text" placeholder="Ciclos menstruales" value={formData.menstrual_cycles} onChange={(e) => handleInputChange('menstrual_cycles', e.target.value)} className="px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none" />
                      <input type="number" placeholder="Nº embarazos" value={formData.pregnancies} onChange={(e) => handleInputChange('pregnancies', e.target.value)} className="px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none" />
                      <input type="text" placeholder="Partos/Cesáreas" value={formData.births} onChange={(e) => handleInputChange('births', e.target.value)} className="px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none" />
                      <input type="number" placeholder="Abortos" value={formData.miscarriages} onChange={(e) => handleInputChange('miscarriages', e.target.value)} className="px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none" />
                      <input type="text" placeholder="Método anticonceptivo" value={formData.contraceptive} onChange={(e) => handleInputChange('contraceptive', e.target.value)} className="px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none" />
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer mt-4">
                      <input
                        type="checkbox"
                        checked={formData.menopausal}
                        onChange={(e) => handleInputChange('menopausal', e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-[#dde6ef]">Menopáusica</span>
                    </label>
                    {formData.menopausal && (
                      <input type="number" placeholder="Edad menopausia" value={formData.menopausal_age} onChange={(e) => handleInputChange('menopausal_age', e.target.value)} className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none" />
                    )}
                  </div>
                </div>
              )}

              {formData.sex === 'Masculino' && (
                <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-[#dde6ef] mb-4">💪 Historia reproductiva masculina</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-3 block">DISFUNCIÓN ERÉCTIL</label>
                      <div className="space-y-2">
                        {['No refiere', 'Ocasional', 'Frecuente', 'Severa'].map((option) => (
                          <label key={option} className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name="ed"
                              value={option}
                              checked={formData.erectile_dysfunction === option}
                              onChange={(e) => handleInputChange('erectile_dysfunction', e.target.value)}
                              className="w-4 h-4"
                            />
                            <span className="text-[#dde6ef]">{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-mono text-[#7a95aa] mb-3 block">USO TESTOSTERONA EXÓGENA</label>
                      <div className="space-y-2">
                        {['Nunca', 'En el pasado', 'Actualmente'].map((option) => (
                          <label key={option} className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name="test"
                              value={option}
                              checked={formData.testosterone_use === option}
                              onChange={(e) => handleInputChange('testosterone_use', e.target.value)}
                              className="w-4 h-4"
                            />
                            <span className="text-[#dde6ef]">{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input type="number" placeholder="Nº hijos" value={formData.children} onChange={(e) => handleInputChange('children', e.target.value)} className="px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none" />
                      <input type="text" placeholder="Último PSA (año)" value={formData.psa} onChange={(e) => handleInputChange('psa', e.target.value)} className="px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm focus:border-[#a78bfa] outline-none" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Actions */}
          <div className="sticky bottom-0 left-0 right-0 bg-[#070a0e] border-t border-[#1e2d3d] px-6 py-4 flex justify-between z-40">
            <button
              onClick={() => step === 2 ? setStep(1) : handleBack()}
              className="px-4 py-2 text-[#7a95aa] border border-[#1e2d3d] rounded hover:border-[#a78bfa]"
            >
              ← Anterior
            </button>
            <button
              onClick={handleNext}
              disabled={step === 2}
              className="px-4 py-2 bg-[#a78bfa] text-black rounded font-semibold hover:bg-[#a78bfa]/90 disabled:opacity-50"
            >
              {step === 1 ? 'Siguiente →' : 'Completado ✓'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
