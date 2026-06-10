'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ─── Helpers de estilo ────────────────────────────────────────────────
const inp   = 'w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm outline-none placeholder-[#3d5870] transition';
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

const Slider = ({ label, value, onChange, color = '#a78bfa' }: {
  label: string; value: number; onChange: (v: number) => void; color?: string;
}) => (
  <div>
    <div className="flex justify-between items-center mb-1">
      <label className="text-xs font-mono text-[#7a95aa]">{label}</label>
      <span className="font-mono text-sm font-bold" style={{ color }}>{value}</span>
    </div>
    <input type="range" min={1} max={10} value={value}
      onChange={e => onChange(parseInt(e.target.value))}
      className="w-full" style={{ accentColor: color }} />
  </div>
);

const ReadNote = ({ label, text, color }: { label: string; text: string; color: string }) => (
  text ? (
    <div className="rounded-xl p-4 mb-4" style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
      <p className="text-xs font-mono mb-2" style={{ color }}>{label}</p>
      <p className="text-sm text-[#dde6ef] whitespace-pre-wrap leading-relaxed">{text}</p>
    </div>
  ) : null
);

const calcIMC = (weight: string, height: string) => {
  const w = parseFloat(weight), h = parseFloat(height) / 100;
  if (!w || !h) return null;
  return (w / (h * h)).toFixed(1);
};

const interpMarcha = (seg: string) => {
  const s = parseFloat(seg); if (!s) return null;
  const mps = 4 / s;
  if (mps >= 1.0) return { label: 'Normal', color: '#00e5a0' };
  if (mps >= 0.6) return { label: 'Lento — revisar', color: '#f59e0b' };
  return { label: 'Alerta sarcopenia', color: '#f43f5e' };
};

const ORINA_COLORS = [
  { label: 'Muy pálido',      hex: '#FFF9C4', text: 'Bien hidratado' },
  { label: 'Amarillo pálido', hex: '#FFF176', text: 'Hidratación normal' },
  { label: 'Amarillo',        hex: '#FFD600', text: 'Hidratación aceptable' },
  { label: 'Amarillo intenso',hex: '#F9A825', text: 'Poca hidratación' },
  { label: 'Naranja',         hex: '#E65100', text: 'Deshidratación' },
  { label: 'Naranja oscuro',  hex: '#BF360C', text: 'Alerta — evaluar' },
];
const ANIMO_OPTS     = ['Estable','Ansioso','Irritable','Triste','Sin motivación','Bien','Otro'];
const DIGESTION_OPTS = ['Sin problemas','Distensión','Estreñimiento','Diarrea','Reflujo','Náuseas','Otro'];

// ─── Tipos ───────────────────────────────────────────────────────────
type Phase = 'reception' | 'nursing' | 'doctor';

// ─── Componente ──────────────────────────────────────────────────────
export default function NewVisitPage() {
  const router    = useRouter();
  const params    = useParams();
  const patientId = params?.id as string;

  const [user,    setUser]    = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [visits,  setVisits]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // ── Fases ──
  const [phase,       setPhase]       = useState<Phase>('reception');
  const [nursingStep, setNursingStep] = useState(1);   // 1-3
  const [doctorStep,  setDoctorStep]  = useState(0);   // 0=resumen, 1-4=formulario

  // ── Notas por rol ──
  const [receptionNotes, setReceptionNotes] = useState('');
  const [nursingNotes,   setNursingNotes]   = useState('');

  // ── Multi-selects ──
  const [animo,     setAnimo]     = useState<string[]>([]);
  const [digestion, setDigestion] = useState<string[]>([]);

  // ── Formulario clínico ──
  const [form, setForm] = useState({
    // Signos vitales
    pa_der_sistolica: '', pa_der_diastolica: '',
    pa_izq_sistolica: '', pa_izq_diastolica: '',
    pa_brazo_mayor: '', fc: '', temperatura: '', spo2: '',
    glucosa: '', glucosa_ayuno: '', ecg_realizado: false,
    // Composición
    peso: '', talla: '',
    circ_abdominal: '', circ_cintura: '', circ_cadera: '',
    circ_cuello: '', circ_biceps: '', circ_muneca: '',
    inbody_grasa: '', inbody_musculo: '', inbody_agua: '', inbody_visceral: '',
    actividad_tipo: '', actividad_frecuencia: '', actividad_intensidad: '',
    // Funcionales
    agarre_der: '', agarre_izq: '', marcha_seg: '',
    syl_reps: '', equilibrio_seg: '', vo2max: '',
    // Motivo (médico)
    motivo_visita: '', motivo_intensidad: 5, motivo_desde: '',
    motivo_primera_vez: '', cambios_meds: '',
    // Subjetivo
    energia_manana: 5, energia_mediodia: 5, energia_tarde: 5,
    sueno_calidad: 5, sueno_horas: '', sueno_reparador: '',
    libido_hoy: 5, orina_color: '',
    dolor_hoy: false, dolor_ubicacion: '', dolor_intensidad: 5,
    metas_paciente: '',
    // Exploración
    exp_general: '', ecg_interpretacion: '',
    exp_piel: '', exp_ojos: '', exp_boca: '',
    exp_tiroides: '', exp_abdomen: '', exp_neurologico: '', exp_otros: '',
    img_tipo: '', img_interpretacion: '',
    cognitivo_realizado: false, cognitivo_palabras: '',
    cognitivo_reloj: '', cognitivo_notas: '',
    // Labs
    labs_pdf_url: '', lab_notas: '',
  });

  const set = (field: string, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const toggleMulti = (arr: string[], setArr: (a: string[]) => void, val: string) =>
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  // ── Scroll suave al top en cada cambio de paso ──
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase, nursingStep, doctorStep]);

  // ── Carga inicial ──
  useEffect(() => {
    getUser().then(async u => {
      if (!u) { router.push('/auth/login'); return; }
      setUser(u);
      try {
        const session = await getSession();
        const token   = session?.access_token;
        const headers: Record<string,string> = token ? { Authorization: `Bearer ${token}` } : {};
        const [pRes, vRes] = await Promise.all([
          fetch(`${BACKEND()}/patients/${patientId}`,  { headers }),
          fetch(`${BACKEND()}/visits/${patientId}`,    { headers }),
        ]);
        setPatient(await pRes.json());
        const vData = await vRes.json();
        setVisits(vData.visits || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    });
  }, [patientId, router]);

  // ── Guardar visita ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const session = await getSession();
      const token   = session?.access_token;
      const headers: Record<string,string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const mapped = {
        // Notas de roles
        reception_notes: receptionNotes,
        nursing_notes:   nursingNotes,
        // Motivo
        visit_reason: form.motivo_visita, discomfort_intensity: form.motivo_intensidad,
        symptom_since: form.motivo_desde, first_time: form.motivo_primera_vez,
        medication_changes: form.cambios_meds,
        // Signos vitales
        pa_der_sistolica: form.pa_der_sistolica, pa_der_diastolica: form.pa_der_diastolica,
        pa_izq_sistolica: form.pa_izq_sistolica, pa_izq_diastolica: form.pa_izq_diastolica,
        pa_dominant_arm: form.pa_brazo_mayor, heart_rate: form.fc,
        temperature: form.temperatura, spo2: form.spo2,
        glucose: form.glucosa, glucose_fasting_hours: form.glucosa_ayuno,
        ecg_done: form.ecg_realizado,
        // Composición
        weight: form.peso, height: form.talla,
        circ_abdominal: form.circ_abdominal, circ_waist: form.circ_cintura,
        circ_hip: form.circ_cadera, circ_neck: form.circ_cuello,
        circ_biceps: form.circ_biceps, circ_wrist: form.circ_muneca,
        inbody_fat_pct: form.inbody_grasa, inbody_muscle_kg: form.inbody_musculo,
        inbody_water_pct: form.inbody_agua, inbody_visceral: form.inbody_visceral,
        activity_type: form.actividad_tipo, activity_frequency: form.actividad_frecuencia,
        activity_intensity: form.actividad_intensidad,
        // Funcionales
        grip_right: form.agarre_der, grip_left: form.agarre_izq,
        walk_4m_seconds: form.marcha_seg, sit_stand_30s: form.syl_reps,
        balance_seconds: form.equilibrio_seg, vo2max: form.vo2max,
        // Subjetivo
        energy_morning: form.energia_manana, energy_noon: form.energia_mediodia,
        energy_evening: form.energia_tarde, sleep_quality: form.sueno_calidad,
        sleep_hours: form.sueno_horas, wakes_rested: form.sueno_reparador,
        mood: animo, libido: form.libido_hoy, digestion,
        urine_color: form.orina_color, pain_today: form.dolor_hoy,
        pain_location: form.dolor_ubicacion, pain_intensity: form.dolor_intensidad,
        patient_goals: form.metas_paciente,
        // Exploración
        general_inspection: form.exp_general, ecg_interpretation: form.ecg_interpretacion,
        skin_findings: form.exp_piel, eye_findings: form.exp_ojos,
        mouth_findings: form.exp_boca, thyroid_findings: form.exp_tiroides,
        abdomen_findings: form.exp_abdomen, neuro_findings: form.exp_neurologico,
        other_findings: form.exp_otros, imaging_type: form.img_tipo,
        imaging_findings: form.img_interpretacion, minicog_done: form.cognitivo_realizado,
        minicog_words: form.cognitivo_palabras, minicog_clock: form.cognitivo_reloj,
        minicog_notes: form.cognitivo_notas,
        // Labs
        labs_pdf_url: form.labs_pdf_url, labs_notes: form.lab_notas,
        // Meta
        patient_id: patientId,
      };

      const clean = Object.fromEntries(
        Object.entries(mapped).map(([k, v]) => {
          if (v === '' || v === null || v === undefined) return [k, null];
          if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return [k, parseFloat(v)];
          return [k, v];
        })
      );

      const res = await fetch(`${BACKEND()}/visits/${patientId}`, {
        method: 'POST', headers, body: JSON.stringify(clean),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Error'); }
      const visit = await res.json();
      router.push(`/dashboard/patient/${patientId}/visit/${visit.id}/analysis`);
    } catch (e: any) {
      alert('Error al guardar: ' + e.message);
      setSaving(false);
    }
  };

  // ── Datos derivados ──
  const dob      = patient?.date_of_birth || patient?.birth_date;
  const age      = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000*60*60*24*365.25)) : null;
  const initials = `${patient?.first_name?.[0]||''}${patient?.last_name?.[0]||''}`.toUpperCase();
  const imc      = calcIMC(form.peso, form.talla);
  const marchInterp = interpMarcha(form.marcha_seg);

  // ── Indicador de fase ──
  const phases = [
    { id: 'reception', label: 'Recepción', icon: '🏥', color: '#00e5a0', step: 1 },
    { id: 'nursing',   label: 'Enfermería', icon: '💊', color: '#0ea5e9', step: 2 },
    { id: 'doctor',    label: 'Médico',     icon: '🩺', color: '#a78bfa', step: 3 },
  ];
  const phaseIdx = phases.findIndex(p => p.id === phase);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">
      Cargando...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav />

      <main className="pt-16 pb-36">
        <div className="max-w-2xl mx-auto px-4 py-8">

          {/* ─── Indicador de fases ─── */}
          <div className="flex items-center mb-8 gap-2">
            {phases.map((p, i) => {
              const isActive  = p.id === phase;
              const isDone    = i < phaseIdx;
              return (
                <div key={p.id} className="flex items-center gap-2 flex-1">
                  <div className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-xl transition-all ${isActive ? 'border' : 'opacity-40'}`}
                    style={{
                      background: isActive ? `${p.color}15` : 'transparent',
                      borderColor: isActive ? p.color : 'transparent',
                    }}>
                    <span className="text-base">{isDone ? '✅' : p.icon}</span>
                    <div>
                      <p className="text-xs font-mono" style={{ color: isActive ? p.color : '#3d5870' }}>
                        Fase {p.step}
                      </p>
                      <p className="text-xs font-semibold" style={{ color: isActive ? '#dde6ef' : '#3d5870' }}>
                        {p.label}
                      </p>
                    </div>
                  </div>
                  {i < phases.length - 1 && (
                    <div className="w-6 h-px flex-shrink-0" style={{
                      background: i < phaseIdx ? '#00e5a0' : '#1e2d3d',
                    }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* ══════════════════════════════════════════
              FASE 1 — RECEPCIÓN
          ══════════════════════════════════════════ */}
          {phase === 'reception' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-serif text-[#dde6ef] mb-1">🏥 Recepción</h2>
                <p className="text-xs text-[#7a95aa]">Revisa los datos del paciente y agrega notas para enfermería y el médico.</p>
              </div>

              {/* Tarjeta del paciente (solo lectura) */}
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-xl font-black text-white flex-shrink-0">
                    {initials || '?'}
                  </div>
                  <div>
                    <p className="font-bold text-[#dde6ef] text-lg">{patient?.full_name || '—'}</p>
                    <p className="text-xs text-[#3d5870] font-mono">{patientId}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Edad',     val: age !== null ? `${age} años` : '—' },
                    { label: 'Sexo',     val: patient?.sexo_biologico || '—' },
                    { label: 'Teléfono', val: patient?.phone || '—' },
                    { label: 'Correo',   val: patient?.email || '—' },
                    { label: 'Visitas',  val: `${visits.length} visita${visits.length !== 1 ? 's' : ''} previas` },
                    { label: 'Última visita', val: visits[0]?.created_at
                      ? new Date(visits[0].created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
                      : 'Primera visita' },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-[#111820] rounded-lg px-3 py-2">
                      <p className="text-xs text-[#3d5870] font-mono">{label}</p>
                      <p className="text-sm text-[#dde6ef] mt-0.5 truncate">{val}</p>
                    </div>
                  ))}
                </div>
                {patient?.allergies && (
                  <div className="mt-3 bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-lg px-3 py-2">
                    <p className="text-xs font-mono text-[#f43f5e]">⚠️ ALERGIAS</p>
                    <p className="text-sm text-[#dde6ef] mt-0.5">{patient.allergies}</p>
                  </div>
                )}
                {patient?.current_medications && (
                  <div className="mt-3 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg px-3 py-2">
                    <p className="text-xs font-mono text-[#f59e0b]">💊 MEDICAMENTOS ACTUALES</p>
                    <p className="text-sm text-[#dde6ef] mt-0.5">{patient.current_medications}</p>
                  </div>
                )}
              </div>

              {/* Notas de recepción */}
              <div>
                <label className="text-xs font-mono text-[#00e5a0] mb-1.5 block">
                  📝 NOTAS DE RECEPCIÓN
                  <span className="text-[#3d5870] ml-2">(visibles para enfermería y médico)</span>
                </label>
                <textarea
                  rows={4}
                  value={receptionNotes}
                  onChange={e => setReceptionNotes(e.target.value)}
                  className={`${inp} ${focusGreen}`}
                  placeholder="Paciente llegó en ayuno, menciona que tiene 3 días con dolor de cabeza. Trae estudios de laboratorio del mes pasado..."
                />
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              FASE 2 — ENFERMERÍA (steps 1-3)
          ══════════════════════════════════════════ */}
          {phase === 'nursing' && (
            <div className="space-y-6">

              {/* Nota de recepción visible */}
              <ReadNote label="📩 NOTA DE RECEPCIÓN" text={receptionNotes} color="#00e5a0" />

              {/* Stepper interno enfermería */}
              <div>
                <div className="flex gap-1 mb-1">
                  {[1,2,3].map(s => (
                    <button key={s} onClick={() => setNursingStep(s)}
                      className="flex-1 h-1.5 rounded-full transition-all"
                      style={{ background: s <= nursingStep ? '#0ea5e9' : '#1e2d3d' }} />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] font-mono text-[#3d5870]">
                  <span className={nursingStep === 1 ? 'text-[#0ea5e9]' : ''}>Signos Vitales</span>
                  <span className={nursingStep === 2 ? 'text-[#0ea5e9]' : ''}>Composición</span>
                  <span className={nursingStep === 3 ? 'text-[#0ea5e9]' : ''}>Pruebas Func.</span>
                </div>
              </div>

              {/* ── E1: Signos vitales ── */}
              {nursingStep === 1 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-serif text-[#dde6ef]">❤️ Signos Vitales</h2>

                  <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-xl p-5">
                    <p className="text-xs font-mono text-[#0ea5e9] mb-4">PRESIÓN ARTERIAL (mmHg)</p>
                    <div className="grid grid-cols-2 gap-5">
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
                      <p className="text-xs font-mono text-[#7a95aa] mb-2">BRAZO CON LECTURA MÁS ALTA</p>
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
                    <Field label="GLUCOSA (mg/dL)">
                      <input type="number" className={`${inp} ${focusBlue}`} placeholder="95"
                        value={form.glucosa} onChange={e => set('glucosa', e.target.value)} />
                    </Field>
                  </div>
                  {form.glucosa && (
                    <Field label="HORAS DESDE ÚLTIMA COMIDA" hint="Para interpretar glucosa correctamente">
                      <input type="number" className={`${inp} ${focusBlue}`} placeholder="8"
                        value={form.glucosa_ayuno} onChange={e => set('glucosa_ayuno', e.target.value)} />
                    </Field>
                  )}
                  <div className="bg-[#0d1520] border border-[#0ea5e9]/20 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={form.ecg_realizado}
                        onChange={e => set('ecg_realizado', e.target.checked)}
                        className="w-4 h-4 accent-[#0ea5e9]" />
                      <span className="text-sm text-[#dde6ef]">Se realizó ECG hoy</span>
                    </label>
                  </div>
                </div>
              )}

              {/* ── E2: Composición corporal ── */}
              {nursingStep === 2 && (
                <div className="space-y-5">
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

                  <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-4">
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

              {/* ── E3: Pruebas funcionales ── */}
              {nursingStep === 3 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-serif text-[#dde6ef]">💪 Pruebas Funcionales</h2>
                  <p className="text-xs text-[#7a95aa]">Si no se puede realizar, dejar vacío.</p>

                  <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-xl p-5">
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

                  <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-xl p-5">
                    <p className="text-xs font-mono text-[#0ea5e9] mb-3">VELOCIDAD DE MARCHA — 4 METROS (seg)</p>
                    <Field label="SEGUNDOS">
                      <input type="number" step="0.1" className={`${inp} ${focusBlue}`} placeholder="3.5"
                        value={form.marcha_seg} onChange={e => set('marcha_seg', e.target.value)} />
                    </Field>
                    {marchInterp && (
                      <p className="text-xs mt-2 font-mono" style={{ color: marchInterp.color }}>
                        {marchInterp.label} ({(4 / parseFloat(form.marcha_seg)).toFixed(2)} m/s)
                      </p>
                    )}
                  </div>

                  <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-xl p-5">
                    <p className="text-xs font-mono text-[#0ea5e9] mb-3">SENTARSE Y LEVANTARSE — 30 SEG (reps sin brazos)</p>
                    <Field label="REPETICIONES">
                      <input type="number" className={`${inp} ${focusBlue}`} placeholder="15"
                        value={form.syl_reps} onChange={e => set('syl_reps', e.target.value)} />
                    </Field>
                  </div>

                  <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-xl p-5">
                    <p className="text-xs font-mono text-[#0ea5e9] mb-3">EQUILIBRIO MONOPODAL — OJOS CERRADOS (seg)</p>
                    <Field label="SEGUNDOS">
                      <input type="number" step="0.5" className={`${inp} ${focusBlue}`} placeholder="12"
                        value={form.equilibrio_seg} onChange={e => set('equilibrio_seg', e.target.value)} />
                    </Field>
                  </div>

                  <Field label="VO2 MAX ESTIMADO (opcional)">
                    <input type="number" step="0.1" className={`${inp} ${focusBlue}`} placeholder="—"
                      value={form.vo2max} onChange={e => set('vo2max', e.target.value)} />
                  </Field>

                  {/* Notas de enfermería */}
                  <div className="bg-[#0d1520] border border-[#0ea5e9]/20 rounded-xl p-5">
                    <label className="text-xs font-mono text-[#0ea5e9] mb-1.5 block">
                      📝 NOTAS DE ENFERMERÍA
                      <span className="text-[#3d5870] ml-2">(visibles para el médico)</span>
                    </label>
                    <textarea rows={3} value={nursingNotes} onChange={e => setNursingNotes(e.target.value)}
                      className={`${inp} ${focusBlue}`}
                      placeholder="Paciente refirió dificultad durante la prueba de equilibrio. PA brazo derecho notablemente mayor. Se notó edema leve en miembros inferiores..." />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════
              FASE 3 — MÉDICO
          ══════════════════════════════════════════ */}
          {phase === 'doctor' && (
            <div className="space-y-6">

              {/* D0: Resumen del paciente */}
              {doctorStep === 0 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-serif text-[#dde6ef] mb-1">🩺 Resumen del Paciente</h2>
                    <p className="text-xs text-[#7a95aa]">Contexto antes de iniciar la consulta.</p>
                  </div>

                  {/* Datos del paciente */}
                  <div className="bg-[#0d1520] border border-[#a78bfa]/30 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#a78bfa] to-[#6366f1] flex items-center justify-center text-lg font-black text-white">
                        {initials || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-[#dde6ef] text-base">{patient?.full_name}</p>
                        <p className="text-xs text-[#7a95aa]">
                          {age !== null ? `${age} años` : '—'}
                          {patient?.sexo_biologico ? ` · ${patient.sexo_biologico}` : ''}
                        </p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-2xl font-mono font-black text-[#a78bfa]">{visits.length}</p>
                        <p className="text-xs text-[#3d5870]">visita{visits.length !== 1 ? 's' : ''} prev.</p>
                      </div>
                    </div>

                    {/* Métricas de última visita */}
                    {visits.length > 0 && visits[0] && (
                      <div className="border-t border-[#1e2d3d] pt-4 mt-4">
                        <p className="text-xs font-mono text-[#a78bfa] mb-3">ÚLTIMA VISITA
                          <span className="text-[#3d5870] ml-2">
                            {new Date(visits[0].created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })}
                          </span>
                        </p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {visits[0].visit_reason && (
                            <div className="col-span-3 bg-[#111820] rounded-lg p-2">
                              <p className="text-[#3d5870]">Motivo</p>
                              <p className="text-[#dde6ef] mt-0.5 line-clamp-2">{visits[0].visit_reason}</p>
                            </div>
                          )}
                          {visits[0].weight && (
                            <div className="bg-[#111820] rounded-lg p-2">
                              <p className="text-[#3d5870]">Peso</p>
                              <p className="text-[#dde6ef] font-mono">{visits[0].weight} kg</p>
                            </div>
                          )}
                          {(visits[0].pa_der_sistolica || visits[0].heart_rate) && (
                            <div className="bg-[#111820] rounded-lg p-2">
                              <p className="text-[#3d5870]">PA / FC</p>
                              <p className="text-[#dde6ef] font-mono text-[10px]">
                                {visits[0].pa_der_sistolica ? `${visits[0].pa_der_sistolica}/${visits[0].pa_der_diastolica}` : '—'}
                                {visits[0].heart_rate ? ` · ${visits[0].heart_rate}lpm` : ''}
                              </p>
                            </div>
                          )}
                          {visits[0].glucose && (
                            <div className="bg-[#111820] rounded-lg p-2">
                              <p className="text-[#3d5870]">Glucosa</p>
                              <p className="text-[#dde6ef] font-mono">{visits[0].glucose} mg/dL</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Medicamentos y alergias */}
                    {(patient?.allergies || patient?.current_medications) && (
                      <div className="border-t border-[#1e2d3d] pt-4 mt-4 space-y-2">
                        {patient?.allergies && (
                          <div className="flex gap-2 items-start">
                            <span className="text-[#f43f5e] text-xs font-mono flex-shrink-0">⚠️ ALERGIAS</span>
                            <span className="text-xs text-[#dde6ef]">{patient.allergies}</span>
                          </div>
                        )}
                        {patient?.current_medications && (
                          <div className="flex gap-2 items-start">
                            <span className="text-[#f59e0b] text-xs font-mono flex-shrink-0">💊 MEDS</span>
                            <span className="text-xs text-[#dde6ef]">{patient.current_medications}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Notas previas */}
                  <ReadNote label="📩 NOTA DE RECEPCIÓN" text={receptionNotes} color="#00e5a0" />
                  <ReadNote label="💊 NOTA DE ENFERMERÍA" text={nursingNotes} color="#0ea5e9" />

                  {/* Métricas de enfermería tomadas hoy */}
                  {(form.peso || form.fc || form.pa_der_sistolica || form.glucosa) && (
                    <div className="bg-[#0ea5e9]/10 border border-[#0ea5e9]/30 rounded-xl p-4">
                      <p className="text-xs font-mono text-[#0ea5e9] mb-3">📊 MEDICIONES TOMADAS HOY (enfermería)</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {form.pa_der_sistolica && (
                          <div className="bg-[#111820] rounded-lg p-2">
                            <p className="text-[#3d5870]">PA derecho</p>
                            <p className="text-[#dde6ef] font-mono">{form.pa_der_sistolica}/{form.pa_der_diastolica}</p>
                          </div>
                        )}
                        {form.fc && (
                          <div className="bg-[#111820] rounded-lg p-2">
                            <p className="text-[#3d5870]">FC</p>
                            <p className="text-[#dde6ef] font-mono">{form.fc} lpm</p>
                          </div>
                        )}
                        {form.spo2 && (
                          <div className="bg-[#111820] rounded-lg p-2">
                            <p className="text-[#3d5870]">SpO₂</p>
                            <p className="text-[#dde6ef] font-mono">{form.spo2}%</p>
                          </div>
                        )}
                        {form.glucosa && (
                          <div className="bg-[#111820] rounded-lg p-2">
                            <p className="text-[#3d5870]">Glucosa</p>
                            <p className="text-[#dde6ef] font-mono">{form.glucosa} mg/dL</p>
                          </div>
                        )}
                        {form.peso && (
                          <div className="bg-[#111820] rounded-lg p-2">
                            <p className="text-[#3d5870]">Peso</p>
                            <p className="text-[#dde6ef] font-mono">{form.peso} kg</p>
                          </div>
                        )}
                        {imc && (
                          <div className="bg-[#111820] rounded-lg p-2">
                            <p className="text-[#3d5870]">IMC</p>
                            <p className="font-mono" style={{
                              color: parseFloat(imc) < 25 ? '#00e5a0' : parseFloat(imc) < 30 ? '#f59e0b' : '#f43f5e'
                            }}>{imc}</p>
                          </div>
                        )}
                        {form.temperatura && (
                          <div className="bg-[#111820] rounded-lg p-2">
                            <p className="text-[#3d5870]">Temperatura</p>
                            <p className="text-[#dde6ef] font-mono">{form.temperatura}°C</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* D1: Motivo de visita */}
              {doctorStep === 1 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-serif text-[#dde6ef]">📋 Motivo de Visita</h2>
                  <ReadNote label="📩 NOTA DE RECEPCIÓN" text={receptionNotes} color="#00e5a0" />
                  <ReadNote label="💊 NOTA DE ENFERMERÍA" text={nursingNotes} color="#0ea5e9" />

                  <Field label="¿A QUÉ VIENE HOY? ¿QUÉ LE MOLESTA?">
                    <textarea rows={4} className={`${inp} ${focusPurple}`} value={form.motivo_visita}
                      onChange={e => set('motivo_visita', e.target.value)}
                      placeholder="Describe con las palabras del paciente el motivo de consulta..." />
                  </Field>

                  <Slider label="INTENSIDAD DEL MALESTAR PRINCIPAL" value={form.motivo_intensidad}
                    onChange={v => set('motivo_intensidad', v)} />

                  <Field label="¿DESDE CUÁNDO?">
                    <input className={`${inp} ${focusPurple}`} placeholder="3 días, 2 semanas, 1 mes..."
                      value={form.motivo_desde} onChange={e => set('motivo_desde', e.target.value)} />
                  </Field>

                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-3">¿ES LA PRIMERA VEZ QUE PRESENTA ESTO?</p>
                    <div className="flex gap-4 flex-wrap">
                      {[
                        { val: 'si',       label: 'Sí, primera vez' },
                        { val: 'no',       label: 'No, recurrente' },
                        { val: 'episodios',label: 'Ha tenido episodios antes' },
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
                    <input className={`${inp} ${focusPurple}`}
                      placeholder="Inició metformina, suspendió atorvastatina..."
                      value={form.cambios_meds} onChange={e => set('cambios_meds', e.target.value)} />
                  </Field>
                </div>
              )}

              {/* D2: Reporte subjetivo */}
              {doctorStep === 2 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-serif text-[#dde6ef]">🧠 Reporte Subjetivo</h2>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-4">
                    <p className="text-xs font-mono text-[#a78bfa]">ENERGÍA HOY</p>
                    <Slider label="AL DESPERTAR"     value={form.energia_manana}   onChange={v => set('energia_manana', v)} />
                    <Slider label="A MEDIODÍA"        value={form.energia_mediodia} onChange={v => set('energia_mediodia', v)} />
                    <Slider label="AL FINAL DEL DÍA" value={form.energia_tarde}    onChange={v => set('energia_tarde', v)} />
                  </div>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-4">
                    <p className="text-xs font-mono text-[#a78bfa]">SUEÑO</p>
                    <Slider label="CALIDAD DEL SUEÑO" value={form.sueno_calidad} onChange={v => set('sueno_calidad', v)} />
                    <Field label="HORAS POR NOCHE">
                      <input type="number" step="0.5" className={`${inp} ${focusPurple}`} placeholder="7.5"
                        value={form.sueno_horas} onChange={e => set('sueno_horas', e.target.value)} />
                    </Field>
                    <div>
                      <p className="text-xs font-mono text-[#7a95aa] mb-2">¿SE DESPIERTA DESCANSADO?</p>
                      <div className="flex gap-4">
                        {['Sí','No','A veces'].map(o => (
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

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5">
                    <p className="text-xs font-mono text-[#a78bfa] mb-3">ESTADO DE ÁNIMO (selecciona los que apliquen)</p>
                    <div className="flex flex-wrap gap-2">
                      {ANIMO_OPTS.map(o => (
                        <button key={o} type="button" onClick={() => toggleMulti(animo, setAnimo, o)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold transition"
                          style={{ background: animo.includes(o) ? '#a78bfa' : '#1e2d3d', color: animo.includes(o) ? '#000' : '#7a95aa' }}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Slider label="LIBIDO ACTUAL" value={form.libido_hoy} onChange={v => set('libido_hoy', v)} />

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5">
                    <p className="text-xs font-mono text-[#a78bfa] mb-3">DIGESTIÓN (selecciona los que apliquen)</p>
                    <div className="flex flex-wrap gap-2">
                      {DIGESTION_OPTS.map(o => (
                        <button key={o} type="button" onClick={() => toggleMulti(digestion, setDigestion, o)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold transition"
                          style={{ background: digestion.includes(o) ? '#a78bfa' : '#1e2d3d', color: digestion.includes(o) ? '#000' : '#7a95aa' }}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5">
                    <p className="text-xs font-mono text-[#a78bfa] mb-3">COLOR DE ORINA EN LA MAÑANA</p>
                    <div className="flex gap-2 flex-wrap">
                      {ORINA_COLORS.map(c => (
                        <button key={c.hex} type="button" onClick={() => set('orina_color', c.label)}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition"
                          style={{
                            borderColor: form.orina_color === c.label ? '#a78bfa' : '#1e2d3d',
                            background:  form.orina_color === c.label ? '#a78bfa11' : 'transparent',
                          }}>
                          <div className="w-8 h-8 rounded-full border border-[#1e2d3d]" style={{ background: c.hex }} />
                          <span className="text-[10px] text-[#7a95aa] text-center max-w-[60px] leading-tight">{c.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-4">
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
                      placeholder="Bajar de peso, tener más energía, dormir mejor..." />
                  </Field>
                </div>
              )}

              {/* D3: Exploración clínica */}
              {doctorStep === 3 && (
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
                      { key: 'exp_piel',       label: 'PIEL Y MUCOSAS',  ph: 'Coloración, ictericia, acné...' },
                      { key: 'exp_ojos',       label: 'OJOS',            ph: 'Ictericia escleral, xantelasmas...' },
                      { key: 'exp_boca',       label: 'BOCA',            ph: 'Estado dental, lengua, faringe...' },
                      { key: 'exp_tiroides',   label: 'TIROIDES',        ph: 'Palpación, tamaño, nódulos...' },
                      { key: 'exp_abdomen',    label: 'ABDOMEN',         ph: 'Hepatomegalia, masas...' },
                      { key: 'exp_neurologico',label: 'NEUROLÓGICO',     ph: 'Temblor, marcha, reflejos...' },
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
                      onChange={e => set('exp_otros', e.target.value)}
                      placeholder="Cualquier otro hallazgo clínico..." />
                  </Field>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-3">
                    <p className="text-xs font-mono text-[#a78bfa]">ESTUDIOS DE IMAGEN</p>
                    <p className="text-xs text-[#7a95aa]">El médico describe los hallazgos — APEX los integra al análisis.</p>
                    <Field label="TIPO DE ESTUDIO">
                      <input className={`${inp} ${focusPurple}`} placeholder="RX tórax, TAC abdomen, US tiroides..."
                        value={form.img_tipo} onChange={e => set('img_tipo', e.target.value)} />
                    </Field>
                    <Field label="DESCRIPCIÓN / HALLAZGOS">
                      <textarea rows={3} className={`${inp} ${focusPurple}`} value={form.img_interpretacion}
                        onChange={e => set('img_interpretacion', e.target.value)}
                        placeholder="RX tórax: sin infiltrados, silueta cardíaca normal..." />
                    </Field>
                  </div>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5">
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
                            {['Sí','No','Parcial'].map(o => (
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

              {/* D4: Laboratorios */}
              {doctorStep === 4 && (
                <div className="space-y-5">
                  <h2 className="text-xl font-serif text-[#dde6ef]">🧪 Laboratorios</h2>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/30 rounded-xl p-5">
                    <p className="text-xs font-mono text-[#a78bfa] mb-3">SUBIR REPORTE DE LABORATORIO</p>
                    <p className="text-xs text-[#7a95aa] mb-4">PDF o foto del reporte. (Upload directo próximamente.)</p>
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

                  {/* Resumen final antes de analizar */}
                  <div className="bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-xl p-5">
                    <p className="text-xs font-mono text-[#a78bfa] mb-3">✅ RESUMEN DE LA VISITA</p>
                    <div className="space-y-1 text-xs text-[#7a95aa]">
                      {patient?.full_name && <p>👤 Paciente: {patient.full_name}{age !== null ? ` · ${age} años` : ''}</p>}
                      {form.motivo_visita && <p>📋 Motivo: {form.motivo_visita.slice(0, 80)}{form.motivo_visita.length > 80 ? '...' : ''}</p>}
                      {form.peso && form.talla && <p>⚖️ IMC: {imc ?? '—'} · Peso {form.peso}kg · Talla {form.talla}cm</p>}
                      {form.pa_der_sistolica && <p>❤️ PA: {form.pa_der_sistolica}/{form.pa_der_diastolica} mmHg{form.fc ? ` · FC ${form.fc}lpm` : ''}</p>}
                      {receptionNotes && <p>🏥 Nota recepción: {receptionNotes.slice(0, 60)}...</p>}
                      {nursingNotes   && <p>💊 Nota enfermería: {nursingNotes.slice(0, 60)}...</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* ─── Barra de navegación fija ─── */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#070a0e]/95 backdrop-blur border-t border-[#1e2d3d] px-6 py-4 flex justify-between items-center z-40">

        {/* Botón atrás */}
        <button
          onClick={() => {
            if (phase === 'reception') {
              router.push(`/dashboard/patient/${patientId}`);
            } else if (phase === 'nursing') {
              if (nursingStep > 1) setNursingStep(n => n - 1);
              else setPhase('reception');
            } else if (phase === 'doctor') {
              if (doctorStep > 0) setDoctorStep(d => d - 1);
              else { setPhase('nursing'); setNursingStep(3); }
            }
          }}
          className="px-5 py-2.5 text-sm text-[#7a95aa] border border-[#1e2d3d] rounded-xl hover:border-[#7a95aa] transition"
        >
          ← Anterior
        </button>

        {/* Contador central */}
        <div className="text-center">
          {phase === 'reception' && (
            <p className="text-xs font-mono text-[#3d5870]">Fase 1 de 3</p>
          )}
          {phase === 'nursing' && (
            <p className="text-xs font-mono text-[#3d5870]">Enfermería {nursingStep}/3</p>
          )}
          {phase === 'doctor' && doctorStep > 0 && (
            <p className="text-xs font-mono text-[#3d5870]">Médico {doctorStep}/4</p>
          )}
        </div>

        {/* Botón adelante / guardar */}
        {phase === 'reception' && (
          <button
            onClick={() => { setPhase('nursing'); setNursingStep(1); }}
            className="px-6 py-2.5 text-sm font-bold rounded-xl transition"
            style={{ background: '#00e5a0', color: '#000' }}
          >
            Continuar → Enfermería
          </button>
        )}

        {phase === 'nursing' && nursingStep < 3 && (
          <button
            onClick={() => setNursingStep(n => n + 1)}
            className="px-6 py-2.5 text-sm font-bold rounded-xl transition"
            style={{ background: '#0ea5e9', color: '#000' }}
          >
            Siguiente →
          </button>
        )}

        {phase === 'nursing' && nursingStep === 3 && (
          <button
            onClick={() => { setPhase('doctor'); setDoctorStep(0); }}
            className="px-6 py-2.5 text-sm font-bold rounded-xl transition"
            style={{ background: '#a78bfa', color: '#000' }}
          >
            Continuar → Médico
          </button>
        )}

        {phase === 'doctor' && doctorStep === 0 && (
          <button
            onClick={() => setDoctorStep(1)}
            className="px-6 py-2.5 text-sm font-bold rounded-xl transition"
            style={{ background: '#a78bfa', color: '#000' }}
          >
            Iniciar consulta →
          </button>
        )}

        {phase === 'doctor' && doctorStep > 0 && doctorStep < 4 && (
          <button
            onClick={() => setDoctorStep(d => d + 1)}
            className="px-6 py-2.5 text-sm font-bold rounded-xl transition"
            style={{ background: '#a78bfa', color: '#000' }}
          >
            Siguiente →
          </button>
        )}

        {phase === 'doctor' && doctorStep === 4 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 text-sm font-bold bg-[#00e5a0] text-black rounded-xl hover:bg-[#00ffb0] disabled:opacity-50 transition"
          >
            {saving ? 'Guardando...' : '🔬 Guardar y Analizar con APEX'}
          </button>
        )}
      </div>
    </div>
  );
}
