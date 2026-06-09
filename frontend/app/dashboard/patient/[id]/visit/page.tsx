'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const inp = 'w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm outline-none placeholder-[#3d5870]';
const focusGreen  = 'focus:border-[#00e5a0]';
const focusBlue   = 'focus:border-[#0ea5e9]';
const focusPurple = 'focus:border-[#a78bfa]';

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <label className="text-xs font-mono text-[#7a95aa] mb-1.5 block">{label}</label>
    {children}
    {hint && <p className="text-xs text-[#3d5870] mt-1">{hint}</p>}
  </div>
);

const Slider = ({ label, value, onChange, color = '#00e5a0' }: {
  label: string; value: number; onChange: (v: number) => void; color?: string;
}) => (
  <div>
    <div className="flex justify-between items-center mb-1">
      <label className="text-xs font-mono text-[#7a95aa]">{label}</label>
      <span className="font-mono text-sm font-bold" style={{ color }}>{value}</span>
    </div>
    <input type="range" min={1} max={10} value={value}
      onChange={e => onChange(parseInt(e.target.value))}
      className="w-full accent-[--c]" style={{ '--c': color } as any} />
  </div>
);

// IMC calculado
const calcIMC = (weight: string, height: string) => {
  const w = parseFloat(weight);
  const h = parseFloat(height) / 100; // cm → m
  if (!w || !h || h === 0) return null;
  return (w / (h * h)).toFixed(1);
};

// Interpretación velocidad marcha
const interpMarcha = (seg: string) => {
  const s = parseFloat(seg);
  if (!s) return null;
  const mps = 4 / s;
  if (mps >= 1.0) return { label: 'Normal', color: '#00e5a0' };
  if (mps >= 0.6) return { label: 'Lento — revisar', color: '#f59e0b' };
  return { label: 'Alerta sarcopenia', color: '#f43f5e' };
};

// Interpretación equilibrio
const interpEquilibrio = (seg: string, age: number | null) => {
  const s = parseFloat(seg);
  if (!s) return null;
  if (age && age < 60 && s < 10) return { label: '⚠️ <10s en menor de 60', color: '#f43f5e' };
  if (s >= 10) return { label: 'Normal', color: '#00e5a0' };
  return null;
};

// Colores orina
const ORINA_COLORS = [
  { label: 'Muy pálido', hex: '#FFF9C4', text: 'Bien hidratado' },
  { label: 'Amarillo pálido', hex: '#FFF176', text: 'Hidratación normal' },
  { label: 'Amarillo', hex: '#FFD600', text: 'Hidratación aceptable' },
  { label: 'Amarillo intenso', hex: '#F9A825', text: 'Poca hidratación' },
  { label: 'Naranja', hex: '#E65100', text: 'Deshidratación / revisar' },
  { label: 'Naranja oscuro', hex: '#BF360C', text: 'Alerta — evaluar' },
];

const ANIMO_OPTS = ['Estable', 'Ansioso', 'Irritable', 'Triste', 'Sin motivación', 'Bien', 'Otro'];
const DIGESTION_OPTS = ['Sin problemas', 'Distensión', 'Estreñimiento', 'Diarrea', 'Reflujo', 'Náuseas', 'Otro'];

// ─────────────────────────────────────────────
// Steps config: 2B = enfermera (steps 1-3), 2C = médico (steps 4-7)
// ─────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Signos Vitales',    role: '2B', icon: '❤️',  color: '#0ea5e9' },
  { id: 2, label: 'Composición',       role: '2B', icon: '⚖️',  color: '#0ea5e9' },
  { id: 3, label: 'Pruebas Func.',     role: '2B', icon: '💪',  color: '#0ea5e9' },
  { id: 4, label: 'Motivo de visita',  role: '2C', icon: '📋',  color: '#a78bfa' },
  { id: 5, label: 'Reporte subjetivo', role: '2C', icon: '🧠',  color: '#a78bfa' },
  { id: 6, label: 'Exploración',       role: '2C', icon: '🔬',  color: '#a78bfa' },
  { id: 7, label: 'Laboratorios',      role: '2C', icon: '🧪',  color: '#a78bfa' },
];

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────
export default function VisitPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params?.id as string;
  const [user, setUser] = useState<any>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [patientAge, setPatientAge] = useState<number | null>(null);

  // Multi-selects
  const [animo, setAnimo]         = useState<string[]>([]);
  const [digestion, setDigestion] = useState<string[]>([]);

  const [form, setForm] = useState({
    // ── 2B: Signos vitales ──
    pa_der_sistolica: '', pa_der_diastolica: '',
    pa_izq_sistolica: '', pa_izq_diastolica: '',
    pa_brazo_mayor: '',          // 'derecho' | 'izquierdo'
    fc: '', temperatura: '', spo2: '',
    glucosa: '', glucosa_ayuno: '',
    ecg_realizado: false,

    // ── 2B: Composición ──
    peso: '', talla: '',
    circ_abdominal: '', circ_cintura: '', circ_cadera: '',
    circ_cuello: '', circ_biceps: '', circ_muneca: '',
    inbody_grasa: '', inbody_musculo: '', inbody_agua: '', inbody_visceral: '',
    actividad_tipo: '', actividad_frecuencia: '', actividad_intensidad: '',

    // ── 2B: Pruebas funcionales ──
    agarre_der: '', agarre_izq: '',
    marcha_seg: '', syl_reps: '', equilibrio_seg: '', vo2max: '',

    // ── 2C: Motivo ──
    motivo_visita: '',
    motivo_intensidad: 5,
    motivo_desde: '',
    motivo_primera_vez: '',      // 'si' | 'no' | 'episodios'
    cambios_meds: '',

    // ── 2C: Subjetivo ──
    energia_manana: 5, energia_mediodia: 5, energia_tarde: 5,
    sueno_calidad: 5, sueno_horas: '', sueno_reparador: '',
    // animo y digestion → estados separados (multi-select)
    libido_hoy: 5,
    orina_color: '',
    dolor_hoy: false,
    dolor_ubicacion: '', dolor_intensidad: 5,
    metas_paciente: '',

    // ── 2C: Exploración ──
    exp_general: '', ecg_interpretacion: '',
    exp_piel: '', exp_ojos: '', exp_boca: '',
    exp_tiroides: '', exp_abdomen: '', exp_neurologico: '', exp_otros: '',
    img_tipo: '', img_interpretacion: '',
    cognitivo_realizado: false,
    cognitivo_palabras: '', cognitivo_reloj: '', cognitivo_notas: '',

    // ── 2C: Labs ──
    labs_pdf_url: '', lab_notas: '',
  });

  const set = (field: string, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const toggleMulti = (arr: string[], setArr: (a: string[]) => void, val: string) =>
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  useEffect(() => {
    getUser().then(u => {
      if (!u) router.push('/auth/login');
      else {
        setUser(u);
        // Obtener edad del paciente para interpretaciones
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/patients/${patientId}`, {
          headers: { Authorization: `Bearer ${u.id}` },
        }).then(r => r.json()).then(p => {
          if (p.date_of_birth || p.birth_date) {
            const dob = p.date_of_birth || p.birth_date;
            const age = Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
            setPatientAge(age);
          }
        }).catch(() => {});
      }
    });
  }, [router, patientId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Mapear nombres del frontend → nombres canónicos del backend / prompts IA
      const mapped = {
        // Motivo
        visit_reason:          form.motivo_visita,
        discomfort_intensity:  form.motivo_intensidad,
        symptom_since:         form.motivo_desde,
        first_time:            form.motivo_primera_vez,
        medication_changes:    form.cambios_meds,
        // Signos vitales
        pa_der_sistolica:      form.pa_der_sistolica,
        pa_der_diastolica:     form.pa_der_diastolica,
        pa_izq_sistolica:      form.pa_izq_sistolica,
        pa_izq_diastolica:     form.pa_izq_diastolica,
        pa_dominant_arm:       form.pa_brazo_mayor,
        heart_rate:            form.fc,
        temperature:           form.temperatura,
        spo2:                  form.spo2,
        glucose:               form.glucosa,
        glucose_fasting_hours: form.glucosa_ayuno,
        ecg_done:              form.ecg_realizado,
        // Composición
        weight:                form.peso,
        height:                form.talla,
        circ_abdominal:        form.circ_abdominal,
        circ_waist:            form.circ_cintura,
        circ_hip:              form.circ_cadera,
        circ_neck:             form.circ_cuello,
        circ_biceps:           form.circ_biceps,
        circ_wrist:            form.circ_muneca,
        inbody_fat_pct:        form.inbody_grasa,
        inbody_muscle_kg:      form.inbody_musculo,
        inbody_water_pct:      form.inbody_agua,
        inbody_visceral:       form.inbody_visceral,
        activity_type:         form.actividad_tipo,
        activity_frequency:    form.actividad_frecuencia,
        activity_intensity:    form.actividad_intensidad,
        // Funcionales
        grip_right:            form.agarre_der,
        grip_left:             form.agarre_izq,
        walk_4m_seconds:       form.marcha_seg,
        sit_stand_30s:         form.syl_reps,
        balance_seconds:       form.equilibrio_seg,
        vo2max:                form.vo2max,
        // Subjetivo
        energy_morning:        form.energia_manana,
        energy_noon:           form.energia_mediodia,
        energy_evening:        form.energia_tarde,
        sleep_quality:         form.sueno_calidad,
        sleep_hours:           form.sueno_horas,
        wakes_rested:          form.sueno_reparador,
        mood:                  animo,                 // array
        libido:                form.libido_hoy,
        digestion:             digestion,             // array
        urine_color:           form.orina_color,
        pain_today:            form.dolor_hoy,
        pain_location:         form.dolor_ubicacion,
        pain_intensity:        form.dolor_intensidad,
        patient_goals:         form.metas_paciente,
        // Exploración
        general_inspection:    form.exp_general,
        ecg_interpretation:    form.ecg_interpretacion,
        skin_findings:         form.exp_piel,
        eye_findings:          form.exp_ojos,
        mouth_findings:        form.exp_boca,
        thyroid_findings:      form.exp_tiroides,
        abdomen_findings:      form.exp_abdomen,
        neuro_findings:        form.exp_neurologico,
        other_findings:        form.exp_otros,
        imaging_type:          form.img_tipo,
        imaging_findings:      form.img_interpretacion,
        minicog_done:          form.cognitivo_realizado,
        minicog_words:         form.cognitivo_palabras,
        minicog_clock:         form.cognitivo_reloj,
        minicog_notes:         form.cognitivo_notas,
        // Labs
        labs_pdf_url:          form.labs_pdf_url,
        labs_notes:            form.lab_notas,
        // Meta
        patient_id:            patientId,
      };

      // Limpiar: strings vacíos → null, strings numéricos → number
      const clean = Object.fromEntries(
        Object.entries(mapped).map(([k, v]) => {
          if (v === '' || v === null || v === undefined) return [k, null];
          if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return [k, parseFloat(v)];
          return [k, v];
        })
      );

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/visits/${patientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.id}` },
        body: JSON.stringify(clean),
      });

      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Error'); }
      const visit = await res.json();
      router.push(`/dashboard/patient/${patientId}/visit/${visit.id}/analysis`);
    } catch (e: any) {
      alert('Error: ' + e.message);
      setSaving(false);
    }
  };

  const currentStep = STEPS[step - 1];
  const imc = calcIMC(form.peso, form.talla);
  const marchaInterp = interpMarcha(form.marcha_seg);
  const equilibrioInterp = interpEquilibrio(form.equilibrio_seg, patientAge);

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav />

      <main className="pt-16 pb-36">
        <div className="max-w-2xl mx-auto px-4 py-8">

          {/* Stepper */}
          <div className="flex gap-1 mb-2">
            {STEPS.map(s => (
              <button key={s.id} onClick={() => setStep(s.id)}
                className="flex-1 h-1.5 rounded-full transition-all"
                style={{ background: s.id <= step ? s.color : '#1e2d3d' }} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] font-mono text-[#3d5870] mb-8">
            <span>Enfermera (1-3)</span>
            <span>{step}/7</span>
            <span>Médico (4-7)</span>
          </div>

          {/* ══ STEP 1: Signos Vitales (Enfermera) ══ */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-serif text-[#dde6ef]">❤️ Signos Vitales</h2>

              {/* PA */}
              <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-lg p-5">
                <p className="text-xs font-mono text-[#0ea5e9] mb-4">PRESIÓN ARTERIAL</p>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs text-[#7a95aa] mb-2">Brazo derecho</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="SISTÓLICA">
                        <input type="number" className={`${inp} ${focusBlue}`} placeholder="120"
                          value={form.pa_der_sistolica} onChange={e => set('pa_der_sistolica', e.target.value)} />
                      </Field>
                      <Field label="DIASTÓLICA">
                        <input type="number" className={`${inp} ${focusBlue}`} placeholder="80"
                          value={form.pa_der_diastolica} onChange={e => set('pa_der_diastolica', e.target.value)} />
                      </Field>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-[#7a95aa] mb-2">Brazo izquierdo</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="SISTÓLICA">
                        <input type="number" className={`${inp} ${focusBlue}`} placeholder="120"
                          value={form.pa_izq_sistolica} onChange={e => set('pa_izq_sistolica', e.target.value)} />
                      </Field>
                      <Field label="DIASTÓLICA">
                        <input type="number" className={`${inp} ${focusBlue}`} placeholder="80"
                          value={form.pa_izq_diastolica} onChange={e => set('pa_izq_diastolica', e.target.value)} />
                      </Field>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-xs font-mono text-[#7a95aa] mb-2">¿QUÉ BRAZO DIO LECTURA MÁS ALTA?</p>
                  <div className="flex gap-4">
                    {['Derecho', 'Izquierdo', 'Igual'].map(b => (
                      <label key={b} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="pa_brazo" value={b.toLowerCase()}
                          checked={form.pa_brazo_mayor === b.toLowerCase()}
                          onChange={e => set('pa_brazo_mayor', e.target.value)}
                          className="w-4 h-4 accent-[#0ea5e9]" />
                        <span className="text-sm text-[#dde6ef]">{b}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Resto de vitales */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="FC (lpm)">
                  <input type="number" className={`${inp} ${focusBlue}`} placeholder="72"
                    value={form.fc} onChange={e => set('fc', e.target.value)} />
                </Field>
                <Field label="TEMPERATURA (°C)">
                  <input type="number" step="0.1" className={`${inp} ${focusBlue}`} placeholder="36.5"
                    value={form.temperatura} onChange={e => set('temperatura', e.target.value)} />
                </Field>
                <Field label="SpO2 (%)">
                  <input type="number" className={`${inp} ${focusBlue}`} placeholder="98"
                    value={form.spo2} onChange={e => set('spo2', e.target.value)} />
                </Field>
                <Field label="GLUCOSA CAPILAR (mg/dL)">
                  <input type="number" className={`${inp} ${focusBlue}`} placeholder="95"
                    value={form.glucosa} onChange={e => set('glucosa', e.target.value)} />
                </Field>
              </div>
              {form.glucosa && (
                <Field label="HORAS DESDE ÚLTIMA COMIDA" hint="Requerido para interpretar glucosa">
                  <input type="number" className={`${inp} ${focusBlue}`} placeholder="8"
                    value={form.glucosa_ayuno} onChange={e => set('glucosa_ayuno', e.target.value)} />
                </Field>
              )}

              {/* ECG */}
              <div className="bg-[#0d1520] border border-[#0ea5e9]/20 rounded-lg p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.ecg_realizado}
                    onChange={e => set('ecg_realizado', e.target.checked)}
                    className="w-4 h-4 accent-[#0ea5e9]" />
                  <span className="text-sm text-[#dde6ef]">Se realizó ECG hoy</span>
                </label>
                {form.ecg_realizado && (
                  <p className="text-xs text-[#7a95aa] mt-2 ml-7">La interpretación del ECG la captura el médico en Exploración Clínica.</p>
                )}
              </div>
            </div>
          )}

          {/* ══ STEP 2: Composición Corporal (Enfermera) ══ */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-serif text-[#dde6ef]">⚖️ Composición Corporal</h2>

              <div className="grid grid-cols-2 gap-4">
                <Field label="PESO (kg)">
                  <input type="number" step="0.1" className={`${inp} ${focusBlue}`} placeholder="75.0"
                    value={form.peso} onChange={e => set('peso', e.target.value)} />
                </Field>
                <Field label="TALLA (cm)">
                  <input type="number" className={`${inp} ${focusBlue}`} placeholder="170"
                    value={form.talla} onChange={e => set('talla', e.target.value)} />
                </Field>
              </div>

              {imc && (
                <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-lg px-4 py-3 flex items-center gap-3">
                  <span className="text-xs font-mono text-[#7a95aa]">IMC CALCULADO</span>
                  <span className="text-2xl font-mono font-bold" style={{
                    color: parseFloat(imc) < 18.5 ? '#f59e0b' : parseFloat(imc) < 25 ? '#00e5a0' : parseFloat(imc) < 30 ? '#f59e0b' : '#f43f5e'
                  }}>{imc}</span>
                  <span className="text-xs text-[#7a95aa]">kg/m²</span>
                </div>
              )}

              {/* Circunferencias */}
              <div>
                <p className="text-xs font-mono text-[#7a95aa] mb-3">CIRCUNFERENCIAS (cm)</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'circ_abdominal', label: 'Abdominal' },
                    { key: 'circ_cintura',   label: 'Cintura' },
                    { key: 'circ_cadera',    label: 'Cadera' },
                    { key: 'circ_cuello',    label: 'Cuello' },
                    { key: 'circ_biceps',    label: 'Bíceps dom.' },
                    { key: 'circ_muneca',    label: 'Muñeca' },
                  ].map(({ key, label }) => (
                    <Field key={key} label={label}>
                      <input type="number" step="0.5" className={`${inp} ${focusBlue}`} placeholder="—"
                        value={form[key as keyof typeof form] as string}
                        onChange={e => set(key, e.target.value)} />
                    </Field>
                  ))}
                </div>
              </div>

              {/* InBody */}
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-4">
                <p className="text-xs font-mono text-[#7a95aa] mb-3">INBODY (si disponible — opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="% GRASA CORPORAL">
                    <input type="number" step="0.1" className={`${inp} ${focusBlue}`} placeholder="—"
                      value={form.inbody_grasa} onChange={e => set('inbody_grasa', e.target.value)} />
                  </Field>
                  <Field label="MASA MUSCULAR (kg)">
                    <input type="number" step="0.1" className={`${inp} ${focusBlue}`} placeholder="—"
                      value={form.inbody_musculo} onChange={e => set('inbody_musculo', e.target.value)} />
                  </Field>
                  <Field label="AGUA CORPORAL (%)">
                    <input type="number" step="0.1" className={`${inp} ${focusBlue}`} placeholder="—"
                      value={form.inbody_agua} onChange={e => set('inbody_agua', e.target.value)} />
                  </Field>
                  <Field label="GRASA VISCERAL (nivel)">
                    <input type="number" className={`${inp} ${focusBlue}`} placeholder="—"
                      value={form.inbody_visceral} onChange={e => set('inbody_visceral', e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Actividad física */}
              <div>
                <p className="text-xs font-mono text-[#7a95aa] mb-3">ACTIVIDAD FÍSICA ACTUAL</p>
                <div className="space-y-3">
                  <Field label="TIPO DE EJERCICIO">
                    <input className={`${inp} ${focusBlue}`} placeholder="Caminata, gym, natación..."
                      value={form.actividad_tipo} onChange={e => set('actividad_tipo', e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="FRECUENCIA">
                      <select className={`${inp} ${focusBlue}`} value={form.actividad_frecuencia}
                        onChange={e => set('actividad_frecuencia', e.target.value)}>
                        <option value="">Seleccionar</option>
                        <option>Sedentario</option>
                        <option>1-2 días/sem</option>
                        <option>3-4 días/sem</option>
                        <option>5+ días/sem</option>
                      </select>
                    </Field>
                    <Field label="INTENSIDAD">
                      <select className={`${inp} ${focusBlue}`} value={form.actividad_intensidad}
                        onChange={e => set('actividad_intensidad', e.target.value)}>
                        <option value="">Seleccionar</option>
                        <option>Baja</option>
                        <option>Moderada</option>
                        <option>Alta</option>
                      </select>
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ STEP 3: Pruebas Funcionales (Enfermera) ══ */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-serif text-[#dde6ef]">💪 Pruebas Funcionales</h2>
              <p className="text-xs text-[#7a95aa]">Si no se puede realizar alguna prueba, dejar vacío. El sistema usará el dato de la visita anterior.</p>

              {/* Agarre */}
              <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-lg p-5">
                <p className="text-xs font-mono text-[#0ea5e9] mb-3">FUERZA DE AGARRE — DINAMÓMETRO (kg)</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="MANO DERECHA">
                    <input type="number" step="0.5" className={`${inp} ${focusBlue}`} placeholder="35"
                      value={form.agarre_der} onChange={e => set('agarre_der', e.target.value)} />
                  </Field>
                  <Field label="MANO IZQUIERDA">
                    <input type="number" step="0.5" className={`${inp} ${focusBlue}`} placeholder="33"
                      value={form.agarre_izq} onChange={e => set('agarre_izq', e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Marcha */}
              <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-lg p-5">
                <p className="text-xs font-mono text-[#0ea5e9] mb-3">VELOCIDAD DE MARCHA — 4 METROS (segundos)</p>
                <Field label="TIEMPO EN SEGUNDOS">
                  <input type="number" step="0.1" className={`${inp} ${focusBlue}`} placeholder="3.5"
                    value={form.marcha_seg} onChange={e => set('marcha_seg', e.target.value)} />
                </Field>
                {marchaInterp && (
                  <p className="text-xs mt-2 font-mono" style={{ color: marchaInterp.color }}>
                    {marchaInterp.label} ({(4 / parseFloat(form.marcha_seg)).toFixed(2)} m/s)
                  </p>
                )}
              </div>

              {/* Sentarse/Levantarse */}
              <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-lg p-5">
                <p className="text-xs font-mono text-[#0ea5e9] mb-3">SENTARSE Y LEVANTARSE — 30 SEGUNDOS (sin apoyo de brazos)</p>
                <Field label="REPETICIONES">
                  <input type="number" className={`${inp} ${focusBlue}`} placeholder="15"
                    value={form.syl_reps} onChange={e => set('syl_reps', e.target.value)} />
                </Field>
              </div>

              {/* Equilibrio */}
              <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-lg p-5">
                <p className="text-xs font-mono text-[#0ea5e9] mb-3">EQUILIBRIO MONOPODAL — OJOS CERRADOS (segundos)</p>
                <Field label="SEGUNDOS">
                  <input type="number" step="0.5" className={`${inp} ${focusBlue}`} placeholder="12"
                    value={form.equilibrio_seg} onChange={e => set('equilibrio_seg', e.target.value)} />
                </Field>
                {equilibrioInterp && (
                  <p className="text-xs mt-2 font-mono" style={{ color: equilibrioInterp.color }}>
                    {equilibrioInterp.label}
                  </p>
                )}
              </div>

              <Field label="VO2 MAX ESTIMADO (opcional — wearable o test Cooper)">
                <input type="number" step="0.1" className={`${inp} ${focusBlue}`} placeholder="—"
                  value={form.vo2max} onChange={e => set('vo2max', e.target.value)} />
              </Field>
            </div>
          )}

          {/* ══ STEP 4: Motivo de Visita (Médico) ══ */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-xl font-serif text-[#dde6ef]">📋 Motivo de Visita</h2>

              <Field label="¿A QUÉ VIENE HOY? ¿QUÉ LE MOLESTA?">
                <textarea rows={4} className={`${inp} ${focusPurple}`} value={form.motivo_visita}
                  onChange={e => set('motivo_visita', e.target.value)}
                  placeholder="Describe con las palabras del paciente el motivo de consulta..." />
              </Field>

              <Slider label="INTENSIDAD DEL MALESTAR PRINCIPAL" value={form.motivo_intensidad}
                onChange={v => set('motivo_intensidad', v)} color="#a78bfa" />

              <Field label="¿DESDE CUÁNDO?">
                <input className={`${inp} ${focusPurple}`} placeholder="3 días, 2 semanas, 1 mes..."
                  value={form.motivo_desde} onChange={e => set('motivo_desde', e.target.value)} />
              </Field>

              <div>
                <p className="text-xs font-mono text-[#7a95aa] mb-3">¿ES LA PRIMERA VEZ QUE PRESENTA ESTO?</p>
                <div className="flex gap-4 flex-wrap">
                  {[
                    { val: 'si', label: 'Sí, primera vez' },
                    { val: 'no', label: 'No, recurrente' },
                    { val: 'episodios', label: 'Ha tenido episodios antes' },
                  ].map(({ val, label }) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="primera_vez" value={val}
                        checked={form.motivo_primera_vez === val}
                        onChange={e => set('motivo_primera_vez', e.target.value)}
                        className="w-4 h-4 accent-[#a78bfa]" />
                      <span className="text-sm text-[#dde6ef]">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Field label="CAMBIOS EN MEDICAMENTOS DESDE LA ÚLTIMA VISITA">
                <input className={`${inp} ${focusPurple}`} placeholder="Inició metformina, suspendió atorvastatina..."
                  value={form.cambios_meds} onChange={e => set('cambios_meds', e.target.value)} />
              </Field>
            </div>
          )}

          {/* ══ STEP 5: Reporte Subjetivo (Médico) ══ */}
          {step === 5 && (
            <div className="space-y-6">
              <h2 className="text-xl font-serif text-[#dde6ef]">🧠 Reporte Subjetivo</h2>
              <p className="text-xs text-[#7a95aa]">El médico captura lo que el paciente reporta hoy.</p>

              {/* Energía */}
              <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-lg p-5 space-y-4">
                <p className="text-xs font-mono text-[#a78bfa]">ENERGÍA HOY</p>
                <Slider label="AL DESPERTAR" value={form.energia_manana}
                  onChange={v => set('energia_manana', v)} color="#a78bfa" />
                <Slider label="A MEDIODÍA" value={form.energia_mediodia}
                  onChange={v => set('energia_mediodia', v)} color="#a78bfa" />
                <Slider label="AL FINAL DEL DÍA" value={form.energia_tarde}
                  onChange={v => set('energia_tarde', v)} color="#a78bfa" />
              </div>

              {/* Sueño */}
              <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-lg p-5 space-y-4">
                <p className="text-xs font-mono text-[#a78bfa]">SUEÑO</p>
                <Slider label="CALIDAD DEL SUEÑO" value={form.sueno_calidad}
                  onChange={v => set('sueno_calidad', v)} color="#a78bfa" />
                <Field label="HORAS POR NOCHE">
                  <input type="number" step="0.5" className={`${inp} ${focusPurple}`} placeholder="7.5"
                    value={form.sueno_horas} onChange={e => set('sueno_horas', e.target.value)} />
                </Field>
                <div>
                  <p className="text-xs font-mono text-[#7a95aa] mb-2">¿SE DESPIERTA DESCANSADO?</p>
                  <div className="flex gap-4">
                    {['Sí', 'No', 'A veces'].map(o => (
                      <label key={o} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="sueno_rep" value={o}
                          checked={form.sueno_reparador === o}
                          onChange={e => set('sueno_reparador', e.target.value)}
                          className="w-4 h-4 accent-[#a78bfa]" />
                        <span className="text-sm text-[#dde6ef]">{o}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ánimo multi-select */}
              <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-lg p-5">
                <p className="text-xs font-mono text-[#a78bfa] mb-3">ESTADO DE ÁNIMO ESTA SEMANA (selecciona los que apliquen)</p>
                <div className="flex flex-wrap gap-2">
                  {ANIMO_OPTS.map(o => (
                    <button key={o} type="button"
                      onClick={() => toggleMulti(animo, setAnimo, o)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition"
                      style={{
                        background: animo.includes(o) ? '#a78bfa' : '#1e2d3d',
                        color: animo.includes(o) ? '#000' : '#7a95aa',
                      }}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              {/* Libido */}
              <Slider label="LIBIDO ACTUAL" value={form.libido_hoy}
                onChange={v => set('libido_hoy', v)} color="#a78bfa" />

              {/* Digestión multi-select */}
              <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-lg p-5">
                <p className="text-xs font-mono text-[#a78bfa] mb-3">DIGESTIÓN (selecciona los que apliquen)</p>
                <div className="flex flex-wrap gap-2">
                  {DIGESTION_OPTS.map(o => (
                    <button key={o} type="button"
                      onClick={() => toggleMulti(digestion, setDigestion, o)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition"
                      style={{
                        background: digestion.includes(o) ? '#a78bfa' : '#1e2d3d',
                        color: digestion.includes(o) ? '#000' : '#7a95aa',
                      }}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color orina */}
              <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-lg p-5">
                <p className="text-xs font-mono text-[#a78bfa] mb-3">COLOR DE ORINA EN LA MAÑANA</p>
                <div className="flex gap-2 flex-wrap">
                  {ORINA_COLORS.map(c => (
                    <button key={c.hex} type="button"
                      onClick={() => set('orina_color', c.label)}
                      className="flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition"
                      style={{
                        borderColor: form.orina_color === c.label ? '#a78bfa' : '#1e2d3d',
                        background: form.orina_color === c.label ? '#a78bfa11' : 'transparent',
                      }}>
                      <div className="w-8 h-8 rounded-full border border-[#1e2d3d]" style={{ background: c.hex }} />
                      <span className="text-[10px] text-[#7a95aa] text-center max-w-[60px] leading-tight">{c.text}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dolor */}
              <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-lg p-5 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.dolor_hoy}
                    onChange={e => set('dolor_hoy', e.target.checked)}
                    className="w-4 h-4 accent-[#a78bfa]" />
                  <span className="text-sm text-[#dde6ef] font-semibold">Tiene dolor hoy</span>
                </label>
                {form.dolor_hoy && (
                  <>
                    <Field label="DÓNDE">
                      <input className={`${inp} ${focusPurple}`} placeholder="Cabeza, espalda, articulaciones..."
                        value={form.dolor_ubicacion} onChange={e => set('dolor_ubicacion', e.target.value)} />
                    </Field>
                    <Slider label="INTENSIDAD DEL DOLOR" value={form.dolor_intensidad}
                      onChange={v => set('dolor_intensidad', v)} color="#f43f5e" />
                  </>
                )}
              </div>

              <Field label="METAS DEL PACIENTE — ¿QUÉ LE GUSTARÍA MEJORAR?">
                <textarea rows={3} className={`${inp} ${focusPurple}`} value={form.metas_paciente}
                  onChange={e => set('metas_paciente', e.target.value)}
                  placeholder="Bajar de peso, tener más energía, dormir mejor, reducir el dolor..." />
              </Field>
            </div>
          )}

          {/* ══ STEP 6: Exploración Clínica (Médico) ══ */}
          {step === 6 && (
            <div className="space-y-5">
              <h2 className="text-xl font-serif text-[#dde6ef]">🔬 Exploración Clínica</h2>
              <p className="text-xs text-[#7a95aa]">No obligatorio campo por campo. Documenta solo lo relevante.</p>

              <Field label="IMPRESIÓN GENERAL">
                <textarea rows={3} className={`${inp} ${focusPurple}`} value={form.exp_general}
                  onChange={e => set('exp_general', e.target.value)}
                  placeholder="Paciente en buen estado general, consciente, orientado, normohidratado..." />
              </Field>

              {form.ecg_realizado && (
                <Field label="INTERPRETACIÓN ECG">
                  <textarea rows={3} className={`${inp} ${focusPurple}`} value={form.ecg_interpretacion}
                    onChange={e => set('ecg_interpretacion', e.target.value)}
                    placeholder="Ritmo sinusal regular, eje normal, sin alteraciones del ST-T..." />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'exp_piel',         label: 'PIEL Y MUCOSAS',  ph: 'Coloración, ictericia, acné, rosácea...' },
                  { key: 'exp_ojos',         label: 'OJOS',            ph: 'Ictericia escleral, xantelasmas, exoftalmos...' },
                  { key: 'exp_boca',         label: 'BOCA',            ph: 'Estado dental, lengua, faringe...' },
                  { key: 'exp_tiroides',     label: 'TIROIDES',        ph: 'Palpación, tamaño, nódulos...' },
                  { key: 'exp_abdomen',      label: 'ABDOMEN',         ph: 'Hepatomegalia, esplenomegalia, masas...' },
                  { key: 'exp_neurologico',  label: 'NEUROLÓGICO',     ph: 'Temblor, marcha, coordinación, reflejos...' },
                ].map(({ key, label, ph }) => (
                  <Field key={key} label={label}>
                    <input className={`${inp} ${focusPurple}`} placeholder={ph}
                      value={form[key as keyof typeof form] as string}
                      onChange={e => set(key, e.target.value)} />
                  </Field>
                ))}
              </div>

              <Field label="OTROS HALLAZGOS RELEVANTES">
                <textarea rows={2} className={`${inp} ${focusPurple}`} value={form.exp_otros}
                  onChange={e => set('exp_otros', e.target.value)} placeholder="Cualquier otro hallazgo clínico..." />
              </Field>

              {/* Estudios de imagen */}
              <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-lg p-5 space-y-3">
                <p className="text-xs font-mono text-[#a78bfa]">ESTUDIOS DE IMAGEN</p>
                <p className="text-xs text-[#7a95aa]">APEX no lee imágenes. El médico describe los hallazgos y la IA los integra.</p>
                <Field label="TIPO DE ESTUDIO">
                  <input className={`${inp} ${focusPurple}`} placeholder="RX tórax, TAC abdomen, US tiroides..."
                    value={form.img_tipo} onChange={e => set('img_tipo', e.target.value)} />
                </Field>
                <Field label="DESCRIPCIÓN / HALLAZGOS">
                  <textarea rows={3} className={`${inp} ${focusPurple}`} value={form.img_interpretacion}
                    onChange={e => set('img_interpretacion', e.target.value)}
                    placeholder="RX tórax: sin infiltrados, silueta cardíaca normal, senos costofrénicos libres..." />
                </Field>
              </div>

              {/* Mini-Cog */}
              <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-lg p-5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.cognitivo_realizado}
                    onChange={e => set('cognitivo_realizado', e.target.checked)}
                    className="w-4 h-4 accent-[#a78bfa]" />
                  <span className="text-sm text-[#dde6ef] font-semibold">Se realizó Mini-Cog hoy</span>
                </label>
                {form.cognitivo_realizado && (
                  <div className="mt-4 space-y-3">
                    <Field label="PALABRAS RECORDADAS (0-3)">
                      <input type="number" min={0} max={3} className={`${inp} ${focusPurple}`}
                        value={form.cognitivo_palabras} onChange={e => set('cognitivo_palabras', e.target.value)} />
                    </Field>
                    <div>
                      <p className="text-xs font-mono text-[#7a95aa] mb-2">RELOJ CORRECTO</p>
                      <div className="flex gap-4">
                        {['Sí', 'No', 'Parcial'].map(o => (
                          <label key={o} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="reloj" value={o}
                              checked={form.cognitivo_reloj === o}
                              onChange={e => set('cognitivo_reloj', e.target.value)}
                              className="w-4 h-4 accent-[#a78bfa]" />
                            <span className="text-sm text-[#dde6ef]">{o}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <Field label="OBSERVACIONES">
                      <input className={`${inp} ${focusPurple}`} placeholder="Notas adicionales..."
                        value={form.cognitivo_notas} onChange={e => set('cognitivo_notas', e.target.value)} />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ STEP 7: Laboratorios (Médico) ══ */}
          {step === 7 && (
            <div className="space-y-5">
              <h2 className="text-xl font-serif text-[#dde6ef]">🧪 Laboratorios</h2>

              <div className="bg-[#0d1520] border border-[#a78bfa]/30 rounded-lg p-5">
                <p className="text-xs font-mono text-[#a78bfa] mb-3">SUBIR REPORTE DE LABORATORIO</p>
                <p className="text-xs text-[#7a95aa] mb-4">PDF o foto del reporte. El sistema extrae los valores automáticamente. (Upload directo próximamente.)</p>
                <Field label="URL DEL PDF / FOTO">
                  <input type="url" className={`${inp} ${focusPurple}`} placeholder="https://..."
                    value={form.labs_pdf_url} onChange={e => set('labs_pdf_url', e.target.value)} />
                </Field>
              </div>

              <Field label="NOTAS SOBRE LOS LABORATORIOS">
                <textarea rows={4} className={`${inp} ${focusPurple}`} value={form.lab_notas}
                  onChange={e => set('lab_notas', e.target.value)}
                  placeholder="Resultados relevantes, valores que llaman la atención, contexto de la muestra..." />
              </Field>

              {/* Resumen antes de guardar */}
              <div className="bg-[#00e5a0]/5 border border-[#00e5a0]/20 rounded-lg p-5">
                <p className="text-xs font-mono text-[#00e5a0] mb-3">RESUMEN DE LA VISITA</p>
                <div className="space-y-1 text-xs text-[#7a95aa]">
                  {form.motivo_visita && <p>📋 Motivo: {form.motivo_visita.slice(0, 60)}{form.motivo_visita.length > 60 ? '...' : ''}</p>}
                  {form.peso && form.talla && <p>⚖️ IMC: {imc ?? '—'} | Peso: {form.peso}kg | Talla: {form.talla}cm</p>}
                  {form.fc && <p>❤️ FC: {form.fc} lpm{form.pa_der_sistolica ? ` | PA: ${form.pa_der_sistolica}/${form.pa_der_diastolica} mmHg` : ''}</p>}
                  {animo.length > 0 && <p>🧠 Ánimo: {animo.join(', ')}</p>}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Barra de acciones fija */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#070a0e] border-t border-[#1e2d3d] px-6 py-4 flex justify-between items-center z-40">
        <button
          onClick={() => step > 1 && setStep(step - 1)}
          disabled={step === 1}
          className="px-5 py-2.5 text-sm text-[#7a95aa] border border-[#1e2d3d] rounded-lg hover:border-[#00e5a0] disabled:opacity-30 transition"
        >
          ← Anterior
        </button>
        {step < 7 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="px-6 py-2.5 text-sm font-semibold rounded-lg transition"
            style={{ background: currentStep.color, color: '#000' }}
          >
            Siguiente →
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold bg-[#00e5a0] text-black rounded-lg hover:bg-[#00ffb0] disabled:opacity-50 transition"
          >
            {saving ? 'Guardando...' : '🔬 Guardar y Analizar con APEX'}
          </button>
        )}
      </div>
    </div>
  );
}
