'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/app/lib/auth';

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────
type Familiar = 'padre' | 'madre' | 'hermanos';
type Enfermedad = 'diabetes' | 'hipertension' | 'cancer' | 'cardiopatia';

const FAMILIARES: { key: Familiar; label: string }[] = [
  { key: 'padre', label: 'Padre' },
  { key: 'madre', label: 'Madre' },
  { key: 'hermanos', label: 'Hermano(s)' },
];

const ENFERMEDADES: { key: Enfermedad; label: string }[] = [
  { key: 'diabetes',     label: 'Diabetes' },
  { key: 'hipertension', label: 'Hipertensión' },
  { key: 'cancer',       label: 'Cáncer' },
  { key: 'cardiopatia',  label: 'Cardiopatía' },
];

const SOURCES = [
  'Recomendación de paciente',
  'Recomendación de médico',
  'Redes sociales',
  'Búsqueda en internet',
  'Página web',
  'Google Maps',
  'Publicidad pagada',
  'Otro',
];

// ─────────────────────────────────────────────
// Componentes pequeños reutilizables
// ─────────────────────────────────────────────
const Field = ({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div>
    <label className="text-xs font-mono text-[#7a95aa] mb-1.5 block">
      {label}{required && <span className="text-[#f43f5e] ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

// Card fuera del componente para evitar re-montaje en cada render
const Card = ({ children, title, icon, color }: { children: React.ReactNode; title: string; icon: string; color: string }) => (
  <div className="bg-[#0d1520] rounded-lg p-6 mb-4" style={{ border: `1px solid ${color}33` }}>
    <h2 className="text-base font-semibold text-[#dde6ef] mb-5 flex items-center gap-2">
      <span>{icon}</span>{title}
    </h2>
    {children}
  </div>
);

const inp = "w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm outline-none placeholder-[#3d5870]";
const focusBlue = "focus:border-[#0ea5e9]";
const focusOrange = "focus:border-[#f97316]";
const focusPurple = "focus:border-[#a78bfa]";

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────
export default function FlowPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState(1);
  const [saving, setSaving] = useState(false);

  // ── Estado heredofamiliar ──
  type FamilyRow = Record<Enfermedad, boolean> & {
    otra: string; vivo: boolean; causa_muerte: string; edad_muerte: string;
  };
  const emptyFamilyRow = (): FamilyRow => ({
    diabetes: false, hipertension: false, cancer: false, cardiopatia: false,
    otra: '', vivo: true, causa_muerte: '', edad_muerte: '',
  });
  const [familyTable, setFamilyTable] = useState<Record<Familiar, FamilyRow>>({
    padre:    emptyFamilyRow(),
    madre:    emptyFamilyRow(),
    hermanos: emptyFamilyRow(),
  });

  // ── Medicamentos actuales (dinámico) ──
  const [medications, setMedications] = useState<Array<{
    nombre: string; dosis: string; frecuencia: string; adherencia: string; desde: string;
  }>>([]);

  // ── Fuentes de llegada (multi-checkbox) ──
  const [sources, setSources] = useState<string[]>([]);

  // ── Formdata principal ──
  const [formData, setFormData] = useState({
    // 1A — Recepcionista
    first_name: '',
    last_name: '',
    date_of_birth: '',
    occupation: '',
    city: '',
    email: '',
    phone: '',
    phone_landline: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_email: '',
    emergency_contact_relationship: '',
    referred_by: '',
    referred_type: '',    // 'paciente' | 'medico'
    prev_redes: false,
    prev_web: false,
    prev_gmaps: false,

    // 1B — Enfermera
    chronic_diseases: '',
    surgeries: '',
    hospitalizations: '',
    fractures: '',
    transfusions: '',
    childhood_diseases: '',
    allergies_medications: '',
    allergies_foods: '',
    allergies_environmental: '',
    med_notas: '',
    // hábitos (enfermera pregunta)
    smoking_status: '',           // Nunca / Exfumador / Activo
    smoking_count: '',
    smoking_since: '',
    smoking_until: '',
    alcohol_status: '',           // Nunca / Ocasional / Frecuente / Diario
    alcohol_type: '',
    alcohol_amount: '',

    // 1C — Doctor
    sexo_biologico: '',           // Masculino / Femenino / Intersex  ← REQUERIDO
    genero_identidad: '',
    sust_recreativas: '',
    libido_basal: '5',
    salud_sexual_notas: '',
    dx_psiquiatrico: '',
    med_psiquiatrica: '',
    trauma_relevante: '',
    // reproductiva femenina
    menarca_age: '',
    ciclos_regulares: '',
    pregnancies: '',
    births: '',
    miscarriages: '',
    menopausal: false,
    menopausal_age: '',
    menopausal_tipo: '',
    contraceptive: '',
    pap_ultimo: '',
    masto_ultima: '',
    colpo_ultima: '',
    // reproductiva masculina
    erectile_dysfunction: '',
    testosterone_use: '',
    testosterone_detalle: '',
    children: '',
    psa_ultimo: '',
    psa_valor: '',
  });

  useEffect(() => {
    getUser().then(u => {
      if (!u) router.push('/auth/login');
      else { setUser(u); setLoading(false); }
    });
  }, [router]);

  const set = (field: string, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const toggleSource = (s: string) =>
    setSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const toggleFamilyDisease = (familiar: Familiar, enfermedad: Enfermedad) =>
    setFamilyTable(prev => ({
      ...prev,
      [familiar]: { ...prev[familiar], [enfermedad]: !prev[familiar][enfermedad] },
    }));

  const setFamilyField = (familiar: Familiar, field: keyof FamilyRow, value: any) =>
    setFamilyTable(prev => ({ ...prev, [familiar]: { ...prev[familiar], [field]: value } }));

  const addMed = () =>
    setMedications(prev => [...prev, { nombre: '', dosis: '', frecuencia: '', adherencia: '', desde: '' }]);

  const setMed = (i: number, field: string, value: string) =>
    setMedications(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));

  const removeMed = (i: number) =>
    setMedications(prev => prev.filter((_, idx) => idx !== i));

  // ── Edad calculada ──
  const calcAge = () => {
    if (!formData.date_of_birth) return null;
    const diff = Date.now() - new Date(formData.date_of_birth).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  };

  // ── Validaciones por fase ──
  const canProceed = (p: number) => {
    if (p === 1) return !!formData.first_name && !!formData.last_name && !!formData.date_of_birth;
    if (p === 2) return true; // todo opcional en enfermera
    return true;
  };

  const canSave = () => !!formData.sexo_biologico; // único campo requerido en 1C

  // ── Guardar ──
  const handleSave = async () => {
    if (!canSave()) {
      alert('El sexo biológico es necesario para que APEX pueda hacer análisis precisos.\nEl médico puede observarlo, preguntarlo o inferirlo según el caso clínico.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        full_name: `${formData.first_name} ${formData.last_name}`.trim(),
        birth_date: formData.date_of_birth,
        sources_of_contact: sources,
        family_history_table: familyTable,
        medications,
        phases_completed: ['receptionist', 'nurse', 'doctor'],
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/patients/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user?.id}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Error'); }
      const data = await res.json();
      router.push(`/dashboard/patient/${data.id}`);
    } catch (e: any) {
      alert('Error: ' + e.message);
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">Cargando...</div>;

  const phaseConfig = {
    1: { color: '#0ea5e9', label: '🟦 RECEPCIONISTA', title: 'Datos generales' },
    2: { color: '#f97316', label: '🟨 ENFERMERA', title: 'Historial médico' },
    3: { color: '#a78bfa', label: '🟣 MÉDICO', title: 'Historia clínica privada' },
  };
  const pc = phaseConfig[phase as 1 | 2 | 3];

  const age = calcAge();

  return (
    <div className="bg-[#070a0e]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6 gap-4">
        <button onClick={() => router.back()} className="text-[#00e5a0] text-sm">← Volver</button>
        <div className="flex-1" />
        <span className="text-xs font-mono" style={{ color: pc.color }}>{pc.label}</span>
      </header>

      <main className="pt-14 min-h-screen">
        <div className="max-w-3xl mx-auto px-4 py-8 pb-36">

          {/* Stepper */}
          <div className="flex gap-2 mb-6">
            {([1, 2, 3] as const).map(p => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: p === phase ? pc.color : p < phase ? '#00e5a0' : '#1e2d3d',
                  color: p <= phase ? '#000' : '#7a95aa',
                }}
              >
                {p === 1 ? '1 Recepcionista' : p === 2 ? '2 Enfermera' : '3 Médico'}
              </button>
            ))}
          </div>

          <p className="text-xs font-mono text-[#3d5870] mb-8 uppercase tracking-widest">{pc.title}</p>

          {/* ══════════════════════════════════════════
              FASE 1 — RECEPCIONISTA
          ══════════════════════════════════════════ */}
          {phase === 1 && (
            <>
              <Card title="Datos personales" icon="👤" color={pc.color}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="NOMBRE(S)" required>
                      <input className={`${inp} ${focusBlue}`} value={formData.first_name}
                        onChange={e => set('first_name', e.target.value)} placeholder="Juan" />
                    </Field>
                    <Field label="APELLIDO(S)" required>
                      <input className={`${inp} ${focusBlue}`} value={formData.last_name}
                        onChange={e => set('last_name', e.target.value)} placeholder="Pérez García" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="FECHA DE NACIMIENTO" required>
                      <input type="date" className={`${inp} ${focusBlue}`} value={formData.date_of_birth}
                        onChange={e => set('date_of_birth', e.target.value)} />
                    </Field>
                    <Field label="EDAD">
                      <div className="px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#00e5a0] font-mono text-sm">
                        {age !== null ? `${age} años` : '—'}
                      </div>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="OCUPACIÓN">
                      <input className={`${inp} ${focusBlue}`} value={formData.occupation}
                        onChange={e => set('occupation', e.target.value)} placeholder="Ingeniero, docente..." />
                    </Field>
                    <Field label="CIUDAD / ESTADO">
                      <input className={`${inp} ${focusBlue}`} value={formData.city}
                        onChange={e => set('city', e.target.value)} placeholder="CDMX, Guadalajara..." />
                    </Field>
                  </div>
                </div>
              </Card>

              <Card title="Contacto" icon="📱" color={pc.color}>
                <div className="space-y-4">
                  <Field label="CORREO ELECTRÓNICO">
                    <input type="email" className={`${inp} ${focusBlue}`} value={formData.email}
                      onChange={e => set('email', e.target.value)} placeholder="correo@ejemplo.com" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="CELULAR">
                      <input type="tel" className={`${inp} ${focusBlue}`} value={formData.phone}
                        onChange={e => set('phone', e.target.value)} placeholder="+52 55 1234 5678" />
                    </Field>
                    <Field label="TELÉFONO FIJO">
                      <input type="tel" className={`${inp} ${focusBlue}`} value={formData.phone_landline}
                        onChange={e => set('phone_landline', e.target.value)} placeholder="(55) 1234-5678" />
                    </Field>
                  </div>
                </div>
              </Card>

              <Card title="Contacto de emergencia" icon="🆘" color={pc.color}>
                <div className="space-y-4">
                  <Field label="NOMBRE COMPLETO">
                    <input className={`${inp} ${focusBlue}`} value={formData.emergency_contact_name}
                      onChange={e => set('emergency_contact_name', e.target.value)} placeholder="María López" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="RELACIÓN">
                      <input className={`${inp} ${focusBlue}`} value={formData.emergency_contact_relationship}
                        onChange={e => set('emergency_contact_relationship', e.target.value)} placeholder="Esposa, hijo..." />
                    </Field>
                    <Field label="CELULAR">
                      <input type="tel" className={`${inp} ${focusBlue}`} value={formData.emergency_contact_phone}
                        onChange={e => set('emergency_contact_phone', e.target.value)} placeholder="+52 55..." />
                    </Field>
                  </div>
                  <Field label="CORREO (OPCIONAL)">
                    <input type="email" className={`${inp} ${focusBlue}`} value={formData.emergency_contact_email}
                      onChange={e => set('emergency_contact_email', e.target.value)} placeholder="emergencia@ejemplo.com" />
                  </Field>
                </div>
              </Card>

              <Card title="¿Cómo nos conoció?" icon="📍" color={pc.color}>
                <div className="space-y-2 mb-4">
                  {SOURCES.map(s => (
                    <label key={s} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={sources.includes(s)} onChange={() => toggleSource(s)}
                        className="w-4 h-4 accent-[#0ea5e9]" />
                      <span className="text-sm text-[#dde6ef]">{s}</span>
                    </label>
                  ))}
                </div>
                {(sources.includes('Recomendación de paciente') || sources.includes('Recomendación de médico')) && (
                  <div className="mt-4 space-y-3 pt-4 border-t border-[#1e2d3d]">
                    <Field label="NOMBRE DE QUIEN RECOMENDÓ">
                      <input className={`${inp} ${focusBlue}`} value={formData.referred_by}
                        onChange={e => set('referred_by', e.target.value)} placeholder="Dr. García / Paciente Martínez" />
                    </Field>
                    <Field label="ES UN...">
                      <div className="flex gap-4">
                        {['Paciente', 'Médico'].map(t => (
                          <label key={t} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="ref_type" value={t.toLowerCase()}
                              checked={formData.referred_type === t.toLowerCase()}
                              onChange={e => set('referred_type', e.target.value)}
                              className="w-4 h-4 accent-[#0ea5e9]" />
                            <span className="text-sm text-[#dde6ef]">{t}</span>
                          </label>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-[#1e2d3d]">
                  <p className="text-xs font-mono text-[#7a95aa] mb-3">¿REVISÓ ANTES DE VENIR?</p>
                  <div className="flex gap-6">
                    {[
                      { key: 'prev_redes', label: 'Redes sociales' },
                      { key: 'prev_web', label: 'Página web' },
                      { key: 'prev_gmaps', label: 'Google Maps' },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox"
                          checked={formData[key as keyof typeof formData] as boolean}
                          onChange={e => set(key, e.target.checked)}
                          className="w-4 h-4 accent-[#0ea5e9]" />
                        <span className="text-sm text-[#dde6ef]">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </Card>
            </>
          )}

          {/* ══════════════════════════════════════════
              FASE 2 — ENFERMERA
          ══════════════════════════════════════════ */}
          {phase === 2 && (
            <>
              {/* Tabla heredofamiliar — Padre, Madre, Hermanos */}
              <Card title="Antecedentes heredofamiliares" icon="🧬" color={pc.color}>
                <div className="space-y-4">
                  {FAMILIARES.map(f => {
                    const row = familyTable[f.key];
                    return (
                      <div key={f.key} className="bg-[#111820] border border-[#1e2d3d] rounded-lg p-4">
                        {/* Nombre + Vive/Fallecido */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-[#dde6ef]">{f.label}</span>
                          <div className="flex gap-3">
                            {[{ val: true, label: 'Vive' }, { val: false, label: 'Falleció' }].map(opt => (
                              <label key={String(opt.val)} className="flex items-center gap-1.5 cursor-pointer">
                                <input type="radio" name={`vivo_${f.key}`} value={String(opt.val)}
                                  checked={row.vivo === opt.val}
                                  onChange={() => setFamilyField(f.key, 'vivo', opt.val)}
                                  className="w-3.5 h-3.5 accent-[#f97316]" />
                                <span className="text-xs text-[#dde6ef]">{opt.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Enfermedades — 4 checkboxes */}
                        <div className="flex flex-wrap gap-3 mb-3">
                          {ENFERMEDADES.map(e => (
                            <label key={e.key} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox"
                                checked={row[e.key]}
                                onChange={() => toggleFamilyDisease(f.key, e.key)}
                                className="w-4 h-4 accent-[#f97316]" />
                              <span className="text-xs text-[#dde6ef]">{e.label}</span>
                            </label>
                          ))}
                        </div>

                        {/* Otra enfermedad */}
                        <input className="w-full px-2 py-1.5 bg-[#0d1520] border border-[#1e2d3d] rounded text-[#dde6ef] text-xs focus:border-[#f97316] outline-none mb-2 placeholder-[#3d5870]"
                          value={row.otra} placeholder="Otra enfermedad relevante..."
                          onChange={e => setFamilyField(f.key, 'otra', e.target.value)} />

                        {/* Si falleció: causa + edad */}
                        {!row.vivo && (
                          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#1e2d3d]">
                            <input className="px-2 py-1.5 bg-[#0d1520] border border-[#1e2d3d] rounded text-[#dde6ef] text-xs focus:border-[#f97316] outline-none placeholder-[#3d5870]"
                              value={row.causa_muerte} placeholder="Causa de muerte"
                              onChange={e => setFamilyField(f.key, 'causa_muerte', e.target.value)} />
                            <input type="number" className="px-2 py-1.5 bg-[#0d1520] border border-[#1e2d3d] rounded text-[#dde6ef] text-xs focus:border-[#f97316] outline-none placeholder-[#3d5870]"
                              value={row.edad_muerte} placeholder="Edad al fallecer"
                              onChange={e => setFamilyField(f.key, 'edad_muerte', e.target.value)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Antecedentes personales */}
              <Card title="Antecedentes personales patológicos" icon="🏥" color={pc.color}>
                <div className="space-y-4">
                  <Field label="ENFERMEDADES CRÓNICAS">
                    <textarea rows={3} className={`${inp} ${focusOrange}`} value={formData.chronic_diseases}
                      onChange={e => set('chronic_diseases', e.target.value)}
                      placeholder="Diabetes tipo 2 (2018), Hipertensión (2020)..." />
                  </Field>
                  <Field label="CIRUGÍAS (nombre y año)">
                    <textarea rows={2} className={`${inp} ${focusOrange}`} value={formData.surgeries}
                      onChange={e => set('surgeries', e.target.value)}
                      placeholder="Apendicectomía (2010), Cesárea (2015)..." />
                  </Field>
                  <Field label="HOSPITALIZACIONES">
                    <textarea rows={2} className={`${inp} ${focusOrange}`} value={formData.hospitalizations}
                      onChange={e => set('hospitalizations', e.target.value)}
                      placeholder="Neumonía (2019)..." />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="FRACTURAS / TRAUMATISMOS">
                      <input className={`${inp} ${focusOrange}`} value={formData.fractures}
                        onChange={e => set('fractures', e.target.value)} placeholder="Fractura cadera (2021)..." />
                    </Field>
                    <Field label="TRANSFUSIONES">
                      <input className={`${inp} ${focusOrange}`} value={formData.transfusions}
                        onChange={e => set('transfusions', e.target.value)} placeholder="Post-op 2018..." />
                    </Field>
                  </div>
                  <Field label="ENFERMEDADES RELEVANTES DE LA INFANCIA">
                    <input className={`${inp} ${focusOrange}`} value={formData.childhood_diseases}
                      onChange={e => set('childhood_diseases', e.target.value)}
                      placeholder="Fiebre reumática, meningitis..." />
                  </Field>
                </div>
              </Card>

              {/* Alergias */}
              <Card title="Alergias conocidas" icon="⚠️" color={pc.color}>
                <div className="space-y-3">
                  <Field label="ALERGIAS A MEDICAMENTOS">
                    <input className={`${inp} ${focusOrange}`} value={formData.allergies_medications}
                      onChange={e => set('allergies_medications', e.target.value)}
                      placeholder="Penicilina, AINEs, yodo..." />
                  </Field>
                  <Field label="ALERGIAS A ALIMENTOS">
                    <input className={`${inp} ${focusOrange}`} value={formData.allergies_foods}
                      onChange={e => set('allergies_foods', e.target.value)}
                      placeholder="Mariscos, lácteos, nueces..." />
                  </Field>
                  <Field label="ALERGIAS AMBIENTALES / OTRAS">
                    <input className={`${inp} ${focusOrange}`} value={formData.allergies_environmental}
                      onChange={e => set('allergies_environmental', e.target.value)}
                      placeholder="Polen, polvo, látex..." />
                  </Field>
                </div>
              </Card>

              {/* Medicamentos actuales */}
              <Card title="Medicamentos que toma actualmente" icon="💊" color={pc.color}>
                <p className="text-xs text-[#7a95aa] mb-4">Los que realmente toma, no los que debería tomar.</p>
                <div className="space-y-3">
                  {medications.map((m, i) => (
                    <div key={i} className="bg-[#111820] border border-[#1e2d3d] rounded-lg p-4 relative">
                      <button onClick={() => removeMed(i)}
                        className="absolute top-3 right-3 text-[#f43f5e] text-xs hover:opacity-80">✕</button>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="MEDICAMENTO">
                          <input className={`${inp} ${focusOrange}`} value={m.nombre}
                            onChange={e => setMed(i, 'nombre', e.target.value)} placeholder="Metformina..." />
                        </Field>
                        <Field label="DOSIS">
                          <input className={`${inp} ${focusOrange}`} value={m.dosis}
                            onChange={e => setMed(i, 'dosis', e.target.value)} placeholder="850mg" />
                        </Field>
                        <Field label="FRECUENCIA REAL">
                          <select className={`${inp} ${focusOrange}`} value={m.frecuencia}
                            onChange={e => setMed(i, 'frecuencia', e.target.value)}>
                            <option value="">Seleccionar</option>
                            <option>Diario</option>
                            <option>Cada 12h</option>
                            <option>Cada 8h</option>
                            <option>Semanal</option>
                            <option>Ocasional</option>
                          </select>
                        </Field>
                        <Field label="ADHERENCIA">
                          <select className={`${inp} ${focusOrange}`} value={m.adherencia}
                            onChange={e => setMed(i, 'adherencia', e.target.value)}>
                            <option value="">Seleccionar</option>
                            <option>Siempre</option>
                            <option>Casi siempre</option>
                            <option>A veces</option>
                            <option>Casi nunca</option>
                          </select>
                        </Field>
                        <Field label="DESDE CUÁNDO">
                          <input className={`${inp} ${focusOrange}`} value={m.desde}
                            onChange={e => setMed(i, 'desde', e.target.value)} placeholder="2018, 3 meses..." />
                        </Field>
                      </div>
                    </div>
                  ))}
                  <button onClick={addMed}
                    className="w-full py-2.5 border border-dashed border-[#f97316] text-[#f97316] rounded-lg text-sm hover:bg-[#f97316]/5 transition">
                    + Agregar medicamento
                  </button>
                </div>
                <Field label="OBSERVACIONES (automedicación, remedios caseros, herbolaria)">
                  <textarea rows={2} className={`${inp} ${focusOrange} mt-4`} value={formData.med_notas}
                    onChange={e => set('med_notas', e.target.value)}
                    placeholder="Toma aspirina de vez en cuando, tés de manzanilla..." />
                </Field>
              </Card>

              {/* Hábitos — Tabaco y Alcohol (enfermera puede preguntar) */}
              <Card title="Hábitos" icon="🚬" color={pc.color}>
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-3">TABAQUISMO</p>
                    <div className="flex gap-4 flex-wrap">
                      {['Nunca fumó', 'Exfumador', 'Fumador activo'].map(s => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="smoking" value={s}
                            checked={formData.smoking_status === s}
                            onChange={e => set('smoking_status', e.target.value)}
                            className="w-4 h-4 accent-[#f97316]" />
                          <span className="text-sm text-[#dde6ef]">{s}</span>
                        </label>
                      ))}
                    </div>
                    {(formData.smoking_status === 'Fumador activo' || formData.smoking_status === 'Exfumador') && (
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <Field label="CIGARROS/DÍA">
                          <input type="number" className={`${inp} ${focusOrange}`} value={formData.smoking_count}
                            onChange={e => set('smoking_count', e.target.value)} placeholder="10" />
                        </Field>
                        <Field label="DESDE AÑO">
                          <input type="number" className={`${inp} ${focusOrange}`} value={formData.smoking_since}
                            onChange={e => set('smoking_since', e.target.value)} placeholder="2005" />
                        </Field>
                        {formData.smoking_status === 'Exfumador' && (
                          <Field label="DEJÓ EN AÑO">
                            <input type="number" className={`${inp} ${focusOrange}`} value={formData.smoking_until}
                              onChange={e => set('smoking_until', e.target.value)} placeholder="2020" />
                          </Field>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-3">ALCOHOL</p>
                    <div className="flex gap-4 flex-wrap">
                      {['Nunca', 'Ocasional', 'Frecuente', 'Diario'].map(s => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="alcohol" value={s}
                            checked={formData.alcohol_status === s}
                            onChange={e => set('alcohol_status', e.target.value)}
                            className="w-4 h-4 accent-[#f97316]" />
                          <span className="text-sm text-[#dde6ef]">{s}</span>
                        </label>
                      ))}
                    </div>
                    {formData.alcohol_status && formData.alcohol_status !== 'Nunca' && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <Field label="TIPO DE BEBIDA">
                          <input className={`${inp} ${focusOrange}`} value={formData.alcohol_type}
                            onChange={e => set('alcohol_type', e.target.value)} placeholder="Cerveza, vino..." />
                        </Field>
                        <Field label="CANTIDAD APROX.">
                          <input className={`${inp} ${focusOrange}`} value={formData.alcohol_amount}
                            onChange={e => set('alcohol_amount', e.target.value)} placeholder="2 cervezas fin de semana..." />
                        </Field>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </>
          )}

          {/* ══════════════════════════════════════════
              FASE 3 — MÉDICO
          ══════════════════════════════════════════ */}
          {phase === 3 && (
            <>
              {/* SEXO BIOLÓGICO — Campo crítico requerido */}
              <div className="bg-[#0d1520] border-2 border-[#a78bfa] rounded-lg p-6 mb-4">
                <h2 className="text-base font-semibold text-[#dde6ef] mb-1 flex items-center gap-2">
                  🧬 Sexo biológico de nacimiento
                  <span className="text-[#f43f5e] text-xs font-mono ml-1">REQUERIDO</span>
                </h2>
                <p className="text-xs text-[#7a95aa] mb-4">
                  El médico puede observarlo, preguntarlo o inferirlo. Requerido para análisis precisos de la IA.
                </p>
                <div className="flex gap-6">
                  {['Masculino', 'Femenino', 'Intersex'].map(s => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="sexo_biologico" value={s}
                        checked={formData.sexo_biologico === s}
                        onChange={e => set('sexo_biologico', e.target.value)}
                        className="w-4 h-4 accent-[#a78bfa]" />
                      <span className="text-[#dde6ef]">{s}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4">
                  <Field label="GÉNERO CON QUE SE IDENTIFICA (OPCIONAL)">
                    <input className={`${inp} ${focusPurple}`} value={formData.genero_identidad}
                      onChange={e => set('genero_identidad', e.target.value)}
                      placeholder="Campo libre, solo si el paciente lo menciona..." />
                  </Field>
                </div>
              </div>

              {/* Sustancias recreativas */}
              <Card title="Sustancias recreativas o de uso regular" icon="🌿" color={pc.color}>
                <p className="text-xs text-[#7a95aa] mb-3">
                  Confidencial — visible solo para el médico tratante. Relevante para interacciones y diagnóstico.
                </p>
                <textarea rows={3} className={`${inp} ${focusPurple}`} value={formData.sust_recreativas}
                  onChange={e => set('sust_recreativas', e.target.value)}
                  placeholder="Marihuana, cannabis medicinal, cocaína, MDMA, estimulantes no prescritos..." />
              </Card>

              {/* Historia reproductiva — FEMENINA */}
              {formData.sexo_biologico === 'Femenino' && (
                <Card title="Historia gineco-obstétrica" icon="🌸" color={pc.color}>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="EDAD DE MENARCA">
                        <input type="number" className={`${inp} ${focusPurple}`} value={formData.menarca_age}
                          onChange={e => set('menarca_age', e.target.value)} placeholder="12" />
                      </Field>
                      <Field label="CICLOS MENSTRUALES">
                        <select className={`${inp} ${focusPurple}`} value={formData.ciclos_regulares}
                          onChange={e => set('ciclos_regulares', e.target.value)}>
                          <option value="">Seleccionar</option>
                          <option>Regulares</option>
                          <option>Irregulares</option>
                          <option>Amenorrea</option>
                        </select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="EMBARAZOS">
                        <input type="number" className={`${inp} ${focusPurple}`} value={formData.pregnancies}
                          onChange={e => set('pregnancies', e.target.value)} placeholder="2" />
                      </Field>
                      <Field label="PARTOS / CESÁREAS">
                        <input className={`${inp} ${focusPurple}`} value={formData.births}
                          onChange={e => set('births', e.target.value)} placeholder="1P / 1C" />
                      </Field>
                      <Field label="ABORTOS">
                        <input className={`${inp} ${focusPurple}`} value={formData.miscarriages}
                          onChange={e => set('miscarriages', e.target.value)} placeholder="0" />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="MENOPAUSIA">
                        <select className={`${inp} ${focusPurple}`} value={formData.menopausal_tipo}
                          onChange={e => set('menopausal_tipo', e.target.value)}>
                          <option value="">No aplica / activa</option>
                          <option>Natural</option>
                          <option>Quirúrgica</option>
                          <option>Prematura</option>
                        </select>
                      </Field>
                      {formData.menopausal_tipo && formData.menopausal_tipo !== '' && (
                        <Field label="EDAD DE MENOPAUSIA">
                          <input type="number" className={`${inp} ${focusPurple}`} value={formData.menopausal_age}
                            onChange={e => set('menopausal_age', e.target.value)} placeholder="50" />
                        </Field>
                      )}
                    </div>
                    <Field label="MÉTODO ANTICONCEPTIVO ACTUAL">
                      <input className={`${inp} ${focusPurple}`} value={formData.contraceptive}
                        onChange={e => set('contraceptive', e.target.value)}
                        placeholder="DIU, hormonal, barrera, ninguno..." />
                    </Field>
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="ÚLTIMO PAP (AÑO)">
                        <input className={`${inp} ${focusPurple}`} value={formData.pap_ultimo}
                          onChange={e => set('pap_ultimo', e.target.value)} placeholder="2023" />
                      </Field>
                      <Field label="ÚLTIMA MASTOGRAFÍA">
                        <input className={`${inp} ${focusPurple}`} value={formData.masto_ultima}
                          onChange={e => set('masto_ultima', e.target.value)} placeholder="2022" />
                      </Field>
                      <Field label="ÚLTIMA COLPOSCOPÍA">
                        <input className={`${inp} ${focusPurple}`} value={formData.colpo_ultima}
                          onChange={e => set('colpo_ultima', e.target.value)} placeholder="2021" />
                      </Field>
                    </div>
                  </div>
                </Card>
              )}

              {/* Historia reproductiva — MASCULINA */}
              {formData.sexo_biologico === 'Masculino' && (
                <Card title="Historia reproductiva masculina" icon="💪" color={pc.color}>
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs font-mono text-[#7a95aa] mb-3">DISFUNCIÓN ERÉCTIL</p>
                      <div className="flex gap-4 flex-wrap">
                        {['No refiere', 'Ocasional', 'Frecuente', 'Siempre'].map(o => (
                          <label key={o} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="ed" value={o}
                              checked={formData.erectile_dysfunction === o}
                              onChange={e => set('erectile_dysfunction', e.target.value)}
                              className="w-4 h-4 accent-[#a78bfa]" />
                            <span className="text-sm text-[#dde6ef]">{o}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-[#7a95aa] mb-3">USO DE TESTOSTERONA EXÓGENA</p>
                      <div className="flex gap-4">
                        {['No', 'En el pasado', 'Actualmente'].map(o => (
                          <label key={o} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="test" value={o}
                              checked={formData.testosterone_use === o}
                              onChange={e => set('testosterone_use', e.target.value)}
                              className="w-4 h-4 accent-[#a78bfa]" />
                            <span className="text-sm text-[#dde6ef]">{o}</span>
                          </label>
                        ))}
                      </div>
                      {(formData.testosterone_use === 'En el pasado' || formData.testosterone_use === 'Actualmente') && (
                        <textarea rows={2} className={`${inp} ${focusPurple} mt-3`} value={formData.testosterone_detalle}
                          onChange={e => set('testosterone_detalle', e.target.value)}
                          placeholder="Cuándo, cuánto tiempo, tipo de compuesto..." />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="NÚMERO DE HIJOS">
                        <input type="number" className={`${inp} ${focusPurple}`} value={formData.children}
                          onChange={e => set('children', e.target.value)} placeholder="2" />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="ÚLTIMO PSA (AÑO)">
                        <input className={`${inp} ${focusPurple}`} value={formData.psa_ultimo}
                          onChange={e => set('psa_ultimo', e.target.value)} placeholder="2023" />
                      </Field>
                      <Field label="RESULTADO PSA (ng/mL)">
                        <input className={`${inp} ${focusPurple}`} value={formData.psa_valor}
                          onChange={e => set('psa_valor', e.target.value)} placeholder="1.2" />
                      </Field>
                    </div>
                  </div>
                </Card>
              )}

              {/* Salud sexual (ambos) */}
              {formData.sexo_biologico && (
                <Card title="Salud sexual" icon="💛" color={pc.color}>
                  <p className="text-xs text-[#7a95aa] mb-4">Confidencial — solo visible para el médico tratante.</p>
                  <div className="space-y-4">
                    <Field label="LIBIDO EN CONDICIONES NORMALES (no hoy, en general) — 1 a 10">
                      <div className="flex items-center gap-4">
                        <input type="range" min={1} max={10} value={formData.libido_basal}
                          onChange={e => set('libido_basal', e.target.value)} className="flex-1" />
                        <span className="text-[#a78bfa] font-mono text-lg min-w-[30px]">{formData.libido_basal}</span>
                      </div>
                    </Field>
                    <Field label="NOTAS DE SALUD SEXUAL (ETS previas, disfunciones, preocupaciones del paciente)">
                      <textarea rows={3} className={`${inp} ${focusPurple}`} value={formData.salud_sexual_notas}
                        onChange={e => set('salud_sexual_notas', e.target.value)}
                        placeholder="Solo registrar si el paciente lo menciona o es clínicamente relevante..." />
                    </Field>
                  </div>
                </Card>
              )}

              {/* Salud mental */}
              <Card title="Salud mental" icon="🧠" color={pc.color}>
                <p className="text-xs text-[#7a95aa] mb-4">Confidencial — solo visible para el médico tratante.</p>
                <div className="space-y-4">
                  <Field label="DIAGNÓSTICOS PSIQUIÁTRICOS PREVIOS O ACTUALES">
                    <textarea rows={2} className={`${inp} ${focusPurple}`} value={formData.dx_psiquiatrico}
                      onChange={e => set('dx_psiquiatrico', e.target.value)}
                      placeholder="Depresión mayor (2019), Ansiedad generalizada, TDAH..." />
                  </Field>
                  <Field label="MEDICAMENTOS PSIQUIÁTRICOS ACTUALES O PREVIOS">
                    <textarea rows={2} className={`${inp} ${focusPurple}`} value={formData.med_psiquiatrica}
                      onChange={e => set('med_psiquiatrica', e.target.value)}
                      placeholder="Sertralina 50mg, Alprazolam 0.5mg (suspendido 2022)..." />
                  </Field>
                  <Field label="EVENTOS TRAUMÁTICOS RELEVANTES (opcional)">
                    <textarea rows={2} className={`${inp} ${focusPurple}`} value={formData.trauma_relevante}
                      onChange={e => set('trauma_relevante', e.target.value)}
                      placeholder="Solo registrar si el paciente lo menciona espontáneamente..." />
                  </Field>
                </div>
              </Card>

              {/* Aviso si no hay sexo biológico seleccionado */}
              {!formData.sexo_biologico && (
                <div className="bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-lg p-4 mb-4">
                  <p className="text-sm text-[#f43f5e]">
                    ⚠️ El campo <strong>Sexo biológico</strong> es requerido para completar el alta.
                    Sin él, no se podrá crear la primera visita ni ejecutar análisis con APEX.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Barra de acciones ── */}
          <div className="fixed bottom-0 left-0 right-0 bg-[#070a0e] border-t border-[#1e2d3d] px-6 py-4 flex justify-between items-center z-40">
            <button
              onClick={() => phase > 1 && setPhase(phase - 1)}
              disabled={phase === 1}
              className="px-5 py-2.5 text-sm text-[#7a95aa] border border-[#1e2d3d] rounded-lg hover:border-[#00e5a0] disabled:opacity-30 transition"
            >
              ← Anterior
            </button>
            <div className="flex gap-3 items-center">
              {phase < 3 && (
                <button
                  onClick={() => setPhase(phase + 1)}
                  disabled={!canProceed(phase)}
                  className="px-5 py-2.5 text-sm font-semibold rounded-lg disabled:opacity-40 transition"
                  style={{ background: pc.color, color: '#000' }}
                >
                  Siguiente →
                </button>
              )}
              {phase === 3 && (
                <button
                  onClick={handleSave}
                  disabled={saving || !canSave()}
                  className="px-6 py-2.5 text-sm font-semibold rounded-lg disabled:opacity-40 transition"
                  style={{ background: canSave() ? '#00e5a0' : '#3d5870', color: canSave() ? '#000' : '#7a95aa' }}
                >
                  {saving ? 'Guardando...' : 'Dar de alta paciente ✓'}
                </button>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
