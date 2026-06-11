'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ─── Estilos base ─────────────────────────────────────────────────────────────
const inp = (tablet: boolean) =>
  `w-full px-3 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none placeholder-[#3d5870] transition focus:border-[#0ea5e9] ${tablet ? 'py-3.5 text-base min-h-[52px]' : 'py-2 text-sm'}`;

const btn = (color: string, tablet: boolean, extra = '') =>
  `px-6 font-bold rounded-xl transition ${tablet ? 'py-4 text-base min-h-[56px]' : 'py-2.5 text-sm'} ${extra}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const Field = ({ label, hint, children, tablet }: { label: string; hint?: string; children: React.ReactNode; tablet?: boolean }) => (
  <div>
    <label className={`font-mono text-[#7a95aa] mb-1.5 block ${tablet ? 'text-sm' : 'text-xs'}`}>{label}</label>
    {children}
    {hint && <p className="text-xs text-[#3d5870] mt-1">{hint}</p>}
  </div>
);

const Slider = ({ label, value, onChange, color = '#a78bfa', tablet }: {
  label: string; value: number; onChange: (v: number) => void; color?: string; tablet?: boolean;
}) => (
  <div>
    <div className="flex justify-between items-center mb-2">
      <label className={`font-mono text-[#7a95aa] ${tablet ? 'text-sm' : 'text-xs'}`}>{label}</label>
      <span className={`font-mono font-black ${tablet ? 'text-2xl' : 'text-lg'}`} style={{ color }}>{value}</span>
    </div>
    <input type="range" min={1} max={10} value={value}
      onChange={e => onChange(parseInt(e.target.value))}
      className={`w-full ${tablet ? 'h-4' : 'h-2'}`}
      style={{ accentColor: color }} />
    <div className="flex justify-between text-[10px] text-[#3d5870] mt-1">
      <span>1</span><span>10</span>
    </div>
  </div>
);

// Nota de solo lectura para mostrar notas de roles anteriores
const ReadNote = ({ label, text, color, compact }: { label: string; text: string; color: string; compact?: boolean }) =>
  text ? (
    <div className={`rounded-xl ${compact ? 'p-3' : 'p-4'}`} style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
      <p className="text-xs font-mono mb-1.5" style={{ color }}>{label}</p>
      <p className={`text-[#dde6ef] whitespace-pre-wrap leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}>{text}</p>
    </div>
  ) : null;

// Input numérico grande optimizado para tablet (con +/-)
const NumInput = ({ value, onChange, placeholder, unit, tablet }: {
  value: string; onChange: (v: string) => void; placeholder: string; unit?: string; tablet?: boolean;
}) => {
  const adjust = (delta: number) => {
    const current = parseFloat(value) || 0;
    const step = delta > 0 ? 1 : -1;
    onChange(Math.max(0, current + step).toString());
  };
  return (
    <div className="flex items-center gap-1">
      {tablet && (
        <button type="button" onClick={() => adjust(-1)}
          className="w-10 h-10 flex-shrink-0 bg-[#1e2d3d] hover:bg-[#2a3a4d] rounded-lg text-[#dde6ef] text-xl font-bold flex items-center justify-center transition">
          −
        </button>
      )}
      <div className="flex-1 relative">
        <input type="number" value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-center outline-none focus:border-[#0ea5e9] transition ${tablet ? 'py-3 text-xl font-bold' : 'py-2 text-sm'}`} />
        {unit && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#3d5870] font-mono">{unit}</span>
        )}
      </div>
      {tablet && (
        <button type="button" onClick={() => adjust(1)}
          className="w-10 h-10 flex-shrink-0 bg-[#1e2d3d] hover:bg-[#2a3a4d] rounded-lg text-[#dde6ef] text-xl font-bold flex items-center justify-center transition">
          +
        </button>
      )}
    </div>
  );
};

const calcIMC = (weightStr: string, heightCm: string | number | null | undefined) => {
  const w = parseFloat(weightStr);
  const rawH = typeof heightCm === 'number' ? heightCm : parseFloat(heightCm || '');
  const h = rawH > 3 ? rawH / 100 : rawH; // acepta cm o m
  if (!w || !h) return null;
  return (w / (h * h)).toFixed(1);
};

const interpMarcha = (seg: string) => {
  const s = parseFloat(seg); if (!s) return null;
  const mps = 4 / s;
  if (mps >= 1.0) return { label: 'Normal', color: '#00e5a0' };
  if (mps >= 0.6) return { label: 'Lento — revisar', color: '#f59e0b' };
  return { label: '⚠️ Alerta sarcopenia', color: '#f43f5e' };
};

const ORINA_COLORS = [
  { label: 'Muy pálido',       hex: '#FFF9C4', text: 'Bien hidratado' },
  { label: 'Amarillo pálido',  hex: '#FFF176', text: 'Normal' },
  { label: 'Amarillo',         hex: '#FFD600', text: 'Aceptable' },
  { label: 'Amarillo intenso', hex: '#F9A825', text: 'Poca hidratación' },
  { label: 'Naranja',          hex: '#E65100', text: 'Deshidratación' },
  { label: 'Naranja oscuro',   hex: '#BF360C', text: 'Alerta — evaluar' },
];
const ANIMO_OPTS     = ['Estable','Ansioso','Irritable','Triste','Sin motivación','Bien','Otro'];
const DIGESTION_OPTS = ['Sin problemas','Distensión','Estreñimiento','Diarrea','Reflujo','Náuseas','Otro'];

// ─── Modal: ficha completa del paciente ───────────────────────────────────────
const PatientModal = ({ patient, visits, onClose }: { patient: any; visits: any[]; onClose: () => void }) => {
  const dob = patient?.date_of_birth || patient?.birth_date;
  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000*60*60*24*365.25)) : null;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-5">
      <p className="text-xs font-mono text-[#7a95aa] mb-3 uppercase tracking-wider border-b border-[#1e2d3d] pb-1">{title}</p>
      {children}
    </div>
  );

  const Row = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex gap-3 py-1.5 border-b border-[#111820]">
        <span className="text-xs text-[#3d5870] w-36 flex-shrink-0">{label}</span>
        <span className="text-sm text-[#dde6ef] flex-1">{value}</span>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(7,10,14,0.92)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2d3d] flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#dde6ef]">{patient?.full_name}</h2>
            <p className="text-xs text-[#3d5870] font-mono mt-0.5">{patient?.id}</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#1e2d3d] hover:bg-[#2a3a4d] text-[#7a95aa] hover:text-[#dde6ef] text-xl transition">
            ×
          </button>
        </div>
        {/* Contenido scrolleable */}
        <div className="overflow-y-auto p-6 flex-1">
          <Section title="Identificación">
            <Row label="Nombre completo"   value={patient?.full_name} />
            <Row label="Fecha nacimiento"  value={dob ? new Date(dob+'T00:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}) : null} />
            <Row label="Edad"              value={age !== null ? `${age} años` : null} />
            <Row label="Sexo biológico"    value={patient?.sexo_biologico} />
            <Row label="Ocupación"         value={patient?.occupation} />
            <Row label="Ciudad"            value={patient?.city} />
            <Row label="Correo"            value={patient?.email} />
            <Row label="Teléfono"          value={patient?.phone} />
            <Row label="Teléfono fijo"     value={patient?.phone_landline} />
          </Section>

          <Section title="Contacto de emergencia">
            <Row label="Nombre"       value={patient?.emergency_contact_name} />
            <Row label="Teléfono"     value={patient?.emergency_contact_phone} />
            <Row label="Relación"     value={patient?.emergency_contact_relationship} />
          </Section>

          <Section title="Antecedentes">
            <Row label="Alergias"             value={patient?.allergies} />
            <Row label="Enfermedades crónicas" value={patient?.chronic_conditions} />
            <Row label="Cirugías previas"     value={patient?.past_surgeries} />
            <Row label="Medicamentos actuales" value={patient?.current_medications} />
            <Row label="Tabaco"               value={patient?.tobacco_use} />
            <Row label="Alcohol"              value={patient?.alcohol_use} />
            <Row label="Drogas"               value={patient?.drug_use} />
          </Section>

          <Section title="Antecedentes familiares">
            <Row label="Padre"    value={patient?.family_history_father} />
            <Row label="Madre"    value={patient?.family_history_mother} />
            <Row label="Hermanos" value={patient?.family_history_siblings} />
          </Section>

          <Section title="Medidas base">
            <Row label="Talla" value={patient?.height ? `${patient.height} cm` : null} />
            <Row label="Tipo de sangre" value={patient?.blood_type} />
          </Section>

          {visits.length > 0 && (
            <Section title={`Historial de visitas (${visits.length})`}>
              {visits.slice(0, 5).map((v, i) => (
                <div key={v.id || i} className="py-2 border-b border-[#111820]">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#7a95aa]">
                      {v.created_at ? new Date(v.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : `Visita ${i+1}`}
                    </span>
                    {v.weight && <span className="text-xs text-[#3d5870]">{v.weight} kg</span>}
                  </div>
                  {v.visit_reason && <p className="text-xs text-[#dde6ef] mt-0.5 line-clamp-1">{v.visit_reason}</p>}
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Phase = 'reception' | 'nursing' | 'doctor';

// ─── Componente principal ─────────────────────────────────────────────────────
export default function NewVisitPage() {
  const router    = useRouter();
  const params    = useParams();
  const patientId = params?.id as string;

  const [user,    setUser]    = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [visits,  setVisits]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // Modo tablet (touch-optimizado)
  const [tabletMode, setTabletMode] = useState(false);
  // Modal ficha completa
  const [showModal, setShowModal] = useState(false);

  // Fases
  const [phase,       setPhase]       = useState<Phase>('reception');
  const [nursingStep, setNursingStep] = useState(1);
  const [doctorStep,  setDoctorStep]  = useState(0);

  // Notas por rol
  const [receptionNotes, setReceptionNotes] = useState('');
  const [nursingNotes,   setNursingNotes]   = useState('');

  // Multi-selects
  const [animo,     setAnimo]     = useState<string[]>([]);
  const [digestion, setDigestion] = useState<string[]>([]);

  // Formulario clínico — sin talla (se usa la registrada), sin cintura ni cadera
  const [form, setForm] = useState({
    // Signos vitales
    pa_der_sistolica: '', pa_der_diastolica: '',
    pa_izq_sistolica: '', pa_izq_diastolica: '',
    pa_brazo_mayor: '', fc: '', temperatura: '', spo2: '',
    glucosa: '', glucosa_ayuno: '', ecg_realizado: false,
    // Composición (sin talla)
    peso: '',
    circ_abdominal: '', circ_cuello: '', circ_biceps: '', circ_muneca: '',
    inbody_grasa: '', inbody_musculo: '', inbody_agua: '', inbody_visceral: '',
    actividad_tipo: '', actividad_frecuencia: '', actividad_intensidad: '',
    // Funcionales
    agarre_der: '', agarre_izq: '',
    marcha_seg: '', syl_reps: '', equilibrio_seg: '', vo2max: '',
    // Motivo médico
    motivo_visita: '', motivo_intensidad: 5, motivo_desde: '',
    motivo_primera_vez: '', cambios_meds: '',
    // Subjetivo
    energia_manana: 5, energia_mediodia: 5, energia_tarde: 5,
    sueno_calidad: 5, sueno_horas: '', sueno_reparador: '',
    libido_hoy: 5, orina_color: '', orina_color_tarde: '',
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

  const set = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));
  const toggleMulti = (arr: string[], setArr: (a: string[]) => void, val: string) =>
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  // Scroll suave al top en cambio de paso
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase, nursingStep, doctorStep]);

  // Carga inicial
  useEffect(() => {
    getUser().then(async u => {
      if (!u) { router.push('/auth/login'); return; }
      setUser(u);
      try {
        const session = await getSession();
        const token   = session?.access_token;
        const headers: Record<string,string> = token ? { Authorization: `Bearer ${token}` } : {};
        const [pRes, vRes] = await Promise.all([
          fetch(`${BACKEND()}/patients/${patientId}`, { headers }),
          fetch(`${BACKEND()}/visits/${patientId}`,   { headers }),
        ]);
        setPatient(await pRes.json());
        const vData = await vRes.json();
        setVisits(vData.visits || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    });
  }, [patientId, router]);

  // Guardar visita
  const handleSave = async () => {
    setSaving(true);
    try {
      const session = await getSession();
      const token   = session?.access_token;
      const headers: Record<string,string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const patientHeight = patient?.height || patient?.talla_cm || null;
      const mapped = {
        reception_notes: receptionNotes,
        nursing_notes:   nursingNotes,
        visit_reason: form.motivo_visita, discomfort_intensity: form.motivo_intensidad,
        symptom_since: form.motivo_desde, first_time: form.motivo_primera_vez,
        medication_changes: form.cambios_meds,
        pa_der_sistolica: form.pa_der_sistolica, pa_der_diastolica: form.pa_der_diastolica,
        pa_izq_sistolica: form.pa_izq_sistolica, pa_izq_diastolica: form.pa_izq_diastolica,
        pa_dominant_arm: form.pa_brazo_mayor, heart_rate: form.fc,
        temperature: form.temperatura, spo2: form.spo2,
        glucose: form.glucosa, glucose_fasting_hours: form.glucosa_ayuno,
        ecg_done: form.ecg_realizado,
        weight: form.peso,
        height: patientHeight, // altura del registro, no cambia por visita
        circ_abdominal: form.circ_abdominal, circ_neck: form.circ_cuello,
        circ_biceps: form.circ_biceps, circ_wrist: form.circ_muneca,
        inbody_fat_pct: form.inbody_grasa, inbody_muscle_kg: form.inbody_musculo,
        inbody_water_pct: form.inbody_agua, inbody_visceral: form.inbody_visceral,
        activity_type: form.actividad_tipo, activity_frequency: form.actividad_frecuencia,
        activity_intensity: form.actividad_intensidad,
        grip_right: form.agarre_der, grip_left: form.agarre_izq,
        walk_4m_seconds: form.marcha_seg, sit_stand_30s: form.syl_reps,
        balance_seconds: form.equilibrio_seg, vo2max: form.vo2max,
        energy_morning: form.energia_manana, energy_noon: form.energia_mediodia,
        energy_evening: form.energia_tarde, sleep_quality: form.sueno_calidad,
        sleep_hours: form.sueno_horas, wakes_rested: form.sueno_reparador,
        mood: animo, libido: form.libido_hoy, digestion,
        urine_color: form.orina_color, urine_color_afternoon: form.orina_color_tarde, pain_today: form.dolor_hoy,
        pain_location: form.dolor_ubicacion, pain_intensity: form.dolor_intensidad,
        patient_goals: form.metas_paciente,
        general_inspection: form.exp_general, ecg_interpretation: form.ecg_interpretacion,
        skin_findings: form.exp_piel, eye_findings: form.exp_ojos,
        mouth_findings: form.exp_boca, thyroid_findings: form.exp_tiroides,
        abdomen_findings: form.exp_abdomen, neuro_findings: form.exp_neurologico,
        other_findings: form.exp_otros, imaging_type: form.img_tipo,
        imaging_findings: form.img_interpretacion, minicog_done: form.cognitivo_realizado,
        minicog_words: form.cognitivo_palabras, minicog_clock: form.cognitivo_reloj,
        minicog_notes: form.cognitivo_notas,
        labs_pdf_url: form.labs_pdf_url, labs_notes: form.lab_notas,
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

  // Datos derivados
  const dob         = patient?.date_of_birth || patient?.birth_date;
  const age         = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000*60*60*24*365.25)) : null;
  const initials    = `${patient?.first_name?.[0]||''}${patient?.last_name?.[0]||''}`.toUpperCase();
  // Talla: viene del primer registro de visita (no cambia entre visitas)
  const patientH    = visits.find(v => v.height || v.talla)?.height
                   || visits.find(v => v.height || v.talla)?.talla
                   || patient?.height || patient?.talla_cm || null;
  const imc         = calcIMC(form.peso, patientH);
  const marchInterp = interpMarcha(form.marcha_seg);
  const tb          = tabletMode; // alias corto

  // Indicador de fases
  const phases = [
    { id: 'reception', label: 'Recepción', icon: '🏥', color: '#00e5a0' },
    { id: 'nursing',   label: 'Enfermería', icon: '💊', color: '#0ea5e9' },
    { id: 'doctor',    label: 'Médico',     icon: '🩺', color: '#a78bfa' },
  ];
  const phaseIdx = phases.findIndex(p => p.id === phase);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">Cargando...</div>
  );

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav />

      {/* Modal ficha completa */}
      {showModal && <PatientModal patient={patient} visits={visits} onClose={() => setShowModal(false)} />}

      {/* Botón modo tablet (flotante) */}
      <button
        onClick={() => setTabletMode(t => !t)}
        title={tabletMode ? 'Cambiar a modo escritorio' : 'Cambiar a modo tablet'}
        className="fixed top-20 right-4 z-30 w-10 h-10 flex items-center justify-center rounded-xl transition text-base shadow-lg"
        style={{
          background: tabletMode ? '#0ea5e9' : '#1e2d3d',
          color: tabletMode ? '#000' : '#7a95aa',
          border: `1px solid ${tabletMode ? '#0ea5e9' : '#2a3a4d'}`,
        }}
      >
        {tabletMode ? '🖥' : '📱'}
      </button>

      <main className="pt-16 pb-36">
        {/* Contenedor responsive: se expande con el monitor */}
        <div className="mx-auto px-4 py-8 w-full max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">

          {/* ─── Indicador de fases ─── */}
          <div className="flex items-center gap-3 mb-8">
            {phases.map((p, i) => {
              const isActive = p.id === phase;
              const isDone   = i < phaseIdx;
              return (
                <div key={p.id} className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`flex items-center gap-2 flex-1 min-w-0 px-3 py-2.5 rounded-xl transition-all ${isActive ? 'border' : 'opacity-40'}`}
                    style={{ background: isActive ? `${p.color}15` : 'transparent', borderColor: isActive ? p.color : 'transparent' }}>
                    <span className="text-base flex-shrink-0">{isDone ? '✅' : p.icon}</span>
                    <div className="min-w-0">
                      <p className={`font-mono truncate ${isActive ? 'text-xs' : 'text-[10px]'}`} style={{ color: isActive ? p.color : '#3d5870' }}>
                        {p.label}
                      </p>
                    </div>
                  </div>
                  {i < phases.length - 1 && (
                    <div className="w-4 h-px flex-shrink-0" style={{ background: i < phaseIdx ? '#00e5a0' : '#1e2d3d' }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* ════════════════════════════════════════
              FASE 1 — RECEPCIÓN
          ════════════════════════════════════════ */}
          {phase === 'reception' && (
            <div className="space-y-6">
              <div>
                <h2 className={`font-serif text-[#dde6ef] mb-1 ${tb ? 'text-2xl' : 'text-xl'}`}>🏥 Recepción</h2>
                <p className="text-xs text-[#7a95aa]">Revisa los datos del paciente y agrega notas para el equipo.</p>
              </div>

              {/* Tarjeta del paciente */}
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-2xl font-black text-white flex-shrink-0">
                    {initials || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#dde6ef] text-lg truncate">{patient?.full_name || '—'}</p>
                    <p className="text-xs text-[#3d5870] font-mono mt-0.5">{patientId}</p>
                    <div className="flex gap-2 flex-wrap mt-2">
                      {age !== null && <span className="text-xs bg-[#1e2d3d] px-2 py-0.5 rounded-full text-[#7a95aa]">🎂 {age} años</span>}
                      {patient?.sexo_biologico && <span className="text-xs bg-[#1e2d3d] px-2 py-0.5 rounded-full text-[#7a95aa]">🧬 {patient.sexo_biologico}</span>}
                      <span className="text-xs bg-[#1e2d3d] px-2 py-0.5 rounded-full text-[#7a95aa]">🗓 {visits.length} visita{visits.length !== 1 ? 's' : ''} prev.</span>
                    </div>
                  </div>
                </div>
                {/* Grid de datos */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                  {[
                    { label: 'Teléfono',      val: patient?.phone },
                    { label: 'Correo',         val: patient?.email },
                    { label: 'Última visita',  val: visits[0]?.created_at ? new Date(visits[0].created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : 'Primera visita' },
                    { label: 'Ocupación',      val: patient?.occupation },
                  ].filter(r => r.val).map(({ label, val }) => (
                    <div key={label} className="bg-[#111820] rounded-lg px-3 py-2">
                      <p className="text-[10px] text-[#3d5870] font-mono">{label}</p>
                      <p className="text-sm text-[#dde6ef] mt-0.5 truncate">{val}</p>
                    </div>
                  ))}
                </div>
                {/* Alertas */}
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
                <label className={`font-mono text-[#00e5a0] mb-1.5 block ${tb ? 'text-sm' : 'text-xs'}`}>
                  📝 NOTAS DE RECEPCIÓN
                  <span className="text-[#3d5870] ml-2 font-normal">(visibles para enfermería y médico)</span>
                </label>
                <textarea rows={tb ? 5 : 4} value={receptionNotes} onChange={e => setReceptionNotes(e.target.value)}
                  className={`w-full px-3 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870] resize-none ${tb ? 'text-base' : 'text-sm'}`}
                  placeholder="Paciente llegó en ayuno, menciona que tiene 3 días con dolor de cabeza. Trae estudios del mes pasado..." />
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              FASE 2 — ENFERMERÍA
          ════════════════════════════════════════ */}
          {phase === 'nursing' && (
            <div className="space-y-5">

              {/* Nota de recepción */}
              <ReadNote label="📩 NOTA DE RECEPCIÓN" text={receptionNotes} color="#00e5a0" />

              {/* Stepper interno */}
              <div>
                <div className="flex gap-1 mb-1.5">
                  {[1,2,3].map(s => (
                    <button key={s} onClick={() => setNursingStep(s)}
                      className={`flex-1 rounded-full transition-all ${tb ? 'h-2' : 'h-1.5'}`}
                      style={{ background: s <= nursingStep ? '#0ea5e9' : '#1e2d3d' }} />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] font-mono">
                  {['Signos Vitales','Composición','Pruebas Func.'].map((label, i) => (
                    <span key={label} style={{ color: nursingStep === i+1 ? '#0ea5e9' : '#3d5870' }}>{label}</span>
                  ))}
                </div>
              </div>

              {/* ── E1: Signos vitales ── */}
              {nursingStep === 1 && (
                <div className="space-y-5">
                  <h2 className={`font-serif text-[#dde6ef] ${tb ? 'text-2xl' : 'text-xl'}`}>❤️ Signos Vitales</h2>

                  {/* PA — 2 columnas en pantallas medianas */}
                  <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-xl p-5">
                    <p className={`font-mono text-[#0ea5e9] mb-4 ${tb ? 'text-sm' : 'text-xs'}`}>PRESIÓN ARTERIAL (mmHg)</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {[
                        { side: 'Brazo derecho', s: 'pa_der_sistolica', d: 'pa_der_diastolica' },
                        { side: 'Brazo izquierdo', s: 'pa_izq_sistolica', d: 'pa_izq_diastolica' },
                      ].map(({ side, s, d }) => (
                        <div key={side}>
                          <p className={`text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>{side}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="SISTÓLICA" tablet={tb}>
                              <NumInput value={form[s as keyof typeof form] as string} onChange={v => set(s, v)} placeholder="120" unit="mmHg" tablet={tb} />
                            </Field>
                            <Field label="DIASTÓLICA" tablet={tb}>
                              <NumInput value={form[d as keyof typeof form] as string} onChange={v => set(d, v)} placeholder="80" unit="mmHg" tablet={tb} />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Resto de vitales — grid responsive */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { key: 'fc',          label: 'FC (lpm)',       ph: '72',   unit: 'lpm' },
                      { key: 'temperatura', label: 'TEMP. (°C)',     ph: '36.5', unit: '°C' },
                      { key: 'spo2',        label: 'SpO₂ (%)',       ph: '98',   unit: '%' },
                      { key: 'glucosa',     label: 'GLUCOSA (mg/dL)', ph: '95',  unit: 'mg/dL' },
                    ].map(({ key, label, ph, unit }) => (
                      <Field key={key} label={label} tablet={tb}>
                        <NumInput value={form[key as keyof typeof form] as string}
                          onChange={v => set(key, v)} placeholder={ph} unit={unit} tablet={tb} />
                      </Field>
                    ))}
                  </div>

                  {form.glucosa && (
                    <Field label="HORAS DESDE ÚLTIMA COMIDA" hint="Para interpretar glucosa correctamente" tablet={tb}>
                      <NumInput value={form.glucosa_ayuno} onChange={v => set('glucosa_ayuno', v)} placeholder="8" unit="hrs" tablet={tb} />
                    </Field>
                  )}

                  <label className={`flex items-center gap-3 cursor-pointer bg-[#0d1520] border border-[#0ea5e9]/20 rounded-xl px-4 ${tb ? 'py-4' : 'py-3'}`}>
                    <input type="checkbox" checked={form.ecg_realizado}
                      onChange={e => set('ecg_realizado', e.target.checked)}
                      className={`flex-shrink-0 accent-[#0ea5e9] ${tb ? 'w-5 h-5' : 'w-4 h-4'}`} />
                    <span className={`text-[#dde6ef] ${tb ? 'text-base' : 'text-sm'}`}>Se realizó ECG hoy</span>
                  </label>
                </div>
              )}

              {/* ── E2: Composición corporal ── */}
              {nursingStep === 2 && (
                <div className="space-y-5">
                  <div className="flex items-start justify-between">
                    <h2 className={`font-serif text-[#dde6ef] ${tb ? 'text-2xl' : 'text-xl'}`}>⚖️ Composición Corporal</h2>
                    {patientH && (
                      <div className="text-right">
                        <p className="text-[10px] text-[#3d5870] font-mono">TALLA (registro)</p>
                        <p className="text-sm font-mono text-[#7a95aa]">{patientH} cm</p>
                      </div>
                    )}
                  </div>

                  {/* Peso + IMC */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <Field label="PESO (kg)" tablet={tb}>
                      <NumInput value={form.peso} onChange={v => set('peso', v)} placeholder="75.0" unit="kg" tablet={tb} />
                    </Field>
                    {imc ? (
                      <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-lg px-4 py-3 flex items-center gap-3">
                        <div>
                          <p className="text-[10px] font-mono text-[#7a95aa]">IMC CALCULADO</p>
                          <p className="text-2xl font-mono font-black mt-0.5" style={{
                            color: parseFloat(imc) < 18.5 ? '#f59e0b' : parseFloat(imc) < 25 ? '#00e5a0' : parseFloat(imc) < 30 ? '#f59e0b' : '#f43f5e'
                          }}>{imc}</p>
                        </div>
                        <p className="text-xs text-[#3d5870]">
                          {parseFloat(imc) < 18.5 ? 'Bajo peso' : parseFloat(imc) < 25 ? 'Normal' : parseFloat(imc) < 30 ? 'Sobrepeso' : 'Obesidad'}
                        </p>
                      </div>
                    ) : !patientH ? (
                      <p className="text-xs text-[#3d5870] italic">Talla no registrada — IMC no disponible</p>
                    ) : null}
                  </div>

                  {/* Circunferencias: abdominal, cuello, bíceps, muñeca */}
                  <div>
                    <p className={`font-mono text-[#7a95aa] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>CIRCUNFERENCIAS (cm)</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { key: 'circ_abdominal', label: 'Abdominal',   hint: '' },
                        { key: 'circ_cuello',    label: 'Cuello',      hint: '' },
                        { key: 'circ_biceps',    label: 'Bíceps dom.', hint: '' },
                        { key: 'circ_muneca',    label: 'Muñeca ⓘ',    hint: 'Frame óseo' },
                      ].map(({ key, label, hint }) => (
                        <Field key={key} label={label} tablet={tb}>
                          <NumInput value={form[key as keyof typeof form] as string}
                            onChange={v => set(key, v)} placeholder="—" unit="cm" tablet={tb} />
                          {hint && <p className="text-[10px] text-[#3d5870] mt-0.5">{hint}</p>}
                        </Field>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#3d5870] mt-2">ⓘ La muñeca permite estimar el frame óseo (pequeño/mediano/grande) para ajustar el peso ideal.</p>
                  </div>

                  {/* InBody */}
                  <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-4">
                    <p className={`font-mono text-[#7a95aa] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>INBODY (opcional)</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { key: 'inbody_grasa',    label: '% GRASA',   ph: '—', unit: '%' },
                        { key: 'inbody_musculo',  label: 'MÚSCULO',   ph: '—', unit: 'kg' },
                        { key: 'inbody_agua',     label: 'AGUA',      ph: '—', unit: '%' },
                        { key: 'inbody_visceral', label: 'VISCERAL',  ph: '—', unit: 'niv.' },
                      ].map(({ key, label, ph, unit }) => (
                        <Field key={key} label={label} tablet={tb}>
                          <NumInput value={form[key as keyof typeof form] as string}
                            onChange={v => set(key, v)} placeholder={ph} unit={unit} tablet={tb} />
                        </Field>
                      ))}
                    </div>
                  </div>

                  {/* Actividad */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="TIPO DE EJERCICIO" tablet={tb}>
                      <input className={inp(tb)} placeholder="Caminata, gym..."
                        value={form.actividad_tipo} onChange={e => set('actividad_tipo', e.target.value)} />
                    </Field>
                    <Field label="FRECUENCIA" tablet={tb}>
                      <select className={inp(tb)} value={form.actividad_frecuencia}
                        onChange={e => set('actividad_frecuencia', e.target.value)}>
                        <option value="">Seleccionar</option>
                        <option>Sedentario</option><option>1-2 días/sem</option>
                        <option>3-4 días/sem</option><option>5+ días/sem</option>
                      </select>
                    </Field>
                    <Field label="INTENSIDAD" tablet={tb}>
                      <select className={inp(tb)} value={form.actividad_intensidad}
                        onChange={e => set('actividad_intensidad', e.target.value)}>
                        <option value="">Seleccionar</option>
                        <option>Baja</option><option>Moderada</option><option>Alta</option>
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {/* ── E3: Pruebas funcionales — compacto para tablet ── */}
              {nursingStep === 3 && (
                <div className="space-y-5">
                  <div className="flex items-start gap-3">
                    <div>
                      <h2 className={`font-serif text-[#dde6ef] ${tb ? 'text-2xl' : 'text-xl'}`}>💪 Pruebas Funcionales</h2>
                      <p className="text-xs text-[#7a95aa] mt-0.5">Dejar vacío si no se puede realizar.</p>
                    </div>
                  </div>

                  {/* Grid 2x2 compacto */}
                  <div className="grid grid-cols-2 gap-3">

                    {/* Agarre */}
                    <div className="col-span-2 bg-[#0d1520] border border-[#0ea5e9]/30 rounded-xl p-4">
                      <p className={`font-mono text-[#0ea5e9] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>💪 AGARRE DINAMÓMETRO (kg)</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-[#3d5870] font-mono mb-1">DERECHA</p>
                          <NumInput value={form.agarre_der} onChange={v => set('agarre_der', v)} placeholder="35" unit="kg" tablet={tb} />
                        </div>
                        <div>
                          <p className="text-[10px] text-[#3d5870] font-mono mb-1">IZQUIERDA</p>
                          <NumInput value={form.agarre_izq} onChange={v => set('agarre_izq', v)} placeholder="33" unit="kg" tablet={tb} />
                        </div>
                      </div>
                    </div>

                    {/* Marcha */}
                    <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-xl p-4">
                      <p className={`font-mono text-[#0ea5e9] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>🚶 MARCHA 4m (seg)</p>
                      <NumInput value={form.marcha_seg} onChange={v => set('marcha_seg', v)} placeholder="3.5" unit="seg" tablet={tb} />
                      {marchInterp && (
                        <p className="text-xs mt-2 font-mono" style={{ color: marchInterp.color }}>{marchInterp.label}</p>
                      )}
                      {form.marcha_seg && !isNaN(parseFloat(form.marcha_seg)) && (
                        <p className="text-[10px] text-[#3d5870] mt-1">{(4/parseFloat(form.marcha_seg)).toFixed(2)} m/s</p>
                      )}
                    </div>

                    {/* S&L */}
                    <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-xl p-4">
                      <p className={`font-mono text-[#0ea5e9] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>🪑 S/L 30 SEG (reps)</p>
                      <NumInput value={form.syl_reps} onChange={v => set('syl_reps', v)} placeholder="15" unit="reps" tablet={tb} />
                      <p className="text-[10px] text-[#3d5870] mt-2">Sin apoyo de brazos</p>
                    </div>

                    {/* Equilibrio */}
                    <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-xl p-4">
                      <p className={`font-mono text-[#0ea5e9] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>🦵 EQUILIBRIO (seg)</p>
                      <NumInput value={form.equilibrio_seg} onChange={v => set('equilibrio_seg', v)} placeholder="12" unit="seg" tablet={tb} />
                      <p className="text-[10px] text-[#3d5870] mt-2">Monopodal, ojos cerrados</p>
                      {form.equilibrio_seg && parseFloat(form.equilibrio_seg) < 10 && (
                        <p className="text-[10px] text-[#f43f5e] mt-1">⚠️ &lt;10s — riesgo de caída</p>
                      )}
                    </div>

                    {/* VO2 */}
                    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-4">
                      <p className={`font-mono text-[#7a95aa] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>🫁 VO₂ MAX (opcional)</p>
                      <NumInput value={form.vo2max} onChange={v => set('vo2max', v)} placeholder="—" unit="ml/kg/min" tablet={tb} />
                      <p className="text-[10px] text-[#3d5870] mt-2">Wearable o test Cooper</p>
                    </div>
                  </div>

                  {/* Notas de enfermería */}
                  <div className="bg-[#0d1520] border border-[#0ea5e9]/20 rounded-xl p-4">
                    <label className={`font-mono text-[#0ea5e9] mb-1.5 block ${tb ? 'text-sm' : 'text-xs'}`}>
                      📝 NOTAS DE ENFERMERÍA
                      <span className="text-[#3d5870] ml-2 font-normal">(visibles para el médico)</span>
                    </label>
                    <textarea rows={tb ? 4 : 3} value={nursingNotes} onChange={e => setNursingNotes(e.target.value)}
                      className={`w-full px-3 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#0ea5e9] transition placeholder-[#3d5870] resize-none ${tb ? 'text-base' : 'text-sm'}`}
                      placeholder="Paciente tuvo dificultad en equilibrio. PA brazo derecho notablemente mayor. Se notó edema leve en MMII..." />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════
              FASE 3 — MÉDICO
          ════════════════════════════════════════ */}
          {phase === 'doctor' && (
            <div className="space-y-5">

              {/* D0: Resumen del paciente antes de consulta */}
              {doctorStep === 0 && (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className={`font-serif text-[#dde6ef] mb-1 ${tb ? 'text-2xl' : 'text-xl'}`}>🩺 Contexto del Paciente</h2>
                      <p className="text-xs text-[#7a95aa]">Revisa antes de entrar al consultorio.</p>
                    </div>
                    <button onClick={() => setShowModal(true)}
                      className="flex-shrink-0 px-3 py-2 text-xs font-semibold bg-[#1e2d3d] hover:bg-[#2a3a4d] text-[#7a95aa] hover:text-[#dde6ef] rounded-xl border border-[#2a3a4d] transition flex items-center gap-1.5 whitespace-nowrap">
                      📋 Ver ficha completa
                    </button>
                  </div>

                  {/* Tarjeta resumen paciente */}
                  <div className="bg-[#0d1520] border border-[#a78bfa]/30 rounded-2xl p-5">
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#a78bfa] to-[#6366f1] flex items-center justify-center text-xl font-black text-white flex-shrink-0">
                        {initials || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[#dde6ef] text-lg truncate">{patient?.full_name}</p>
                        <p className="text-sm text-[#7a95aa]">
                          {age !== null ? `${age} años` : '—'}
                          {patient?.sexo_biologico ? ` · ${patient.sexo_biologico}` : ''}
                          {patient?.occupation ? ` · ${patient.occupation}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-3xl font-mono font-black text-[#a78bfa]">{visits.length}</p>
                        <p className="text-xs text-[#3d5870]">visitas prev.</p>
                      </div>
                    </div>

                    {/* Alertas críticas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                      {patient?.allergies && (
                        <div className="bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-lg px-3 py-2">
                          <p className="text-[10px] font-mono text-[#f43f5e]">⚠️ ALERGIAS</p>
                          <p className="text-sm text-[#dde6ef] mt-0.5">{patient.allergies}</p>
                        </div>
                      )}
                      {patient?.current_medications && (
                        <div className="bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg px-3 py-2">
                          <p className="text-[10px] font-mono text-[#f59e0b]">💊 MEDS ACTUALES</p>
                          <p className="text-sm text-[#dde6ef] mt-0.5">{patient.current_medications}</p>
                        </div>
                      )}
                    </div>

                    {/* Última visita — datos clínicos + diagnóstico */}
                    {visits.length > 0 && visits[0] && (() => {
                      const lv = visits[0];
                      return (
                        <div className="border-t border-[#1e2d3d] pt-4">
                          <p className={`font-mono text-[#a78bfa] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>
                            ÚLTIMA VISITA —{' '}
                            <span className="text-[#3d5870] font-normal">
                              {new Date(lv.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'})}
                            </span>
                          </p>

                          {lv.visit_reason && (
                            <div className="bg-[#111820] rounded-lg px-3 py-2 mb-3">
                              <p className="text-[10px] text-[#3d5870] font-mono">MOTIVO DE CONSULTA</p>
                              <p className="text-sm text-[#dde6ef] mt-0.5">{lv.visit_reason}</p>
                            </div>
                          )}

                          {/* Métricas clave */}
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs mb-3">
                            {lv.weight       && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">Peso</p><p className="text-[#dde6ef] font-mono">{lv.weight}kg</p></div>}
                            {lv.pa_der_sistolica && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">PA</p><p className="text-[#dde6ef] font-mono text-[10px]">{lv.pa_der_sistolica}/{lv.pa_der_diastolica}</p></div>}
                            {lv.heart_rate   && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">FC</p><p className="text-[#dde6ef] font-mono">{lv.heart_rate}</p></div>}
                            {lv.glucose      && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">Glucosa</p><p className="text-[#dde6ef] font-mono">{lv.glucose}</p></div>}
                            {lv.spo2         && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">SpO₂</p><p className="text-[#dde6ef] font-mono">{lv.spo2}%</p></div>}
                            {lv.grip_right   && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">Agarre</p><p className="text-[#dde6ef] font-mono">{lv.grip_right}kg</p></div>}
                          </div>

                          {/* Protocolo / medicamentos de última visita */}
                          {lv.medication_changes && (
                            <div className="bg-[#a78bfa]/10 border border-[#a78bfa]/20 rounded-lg px-3 py-2 mb-2">
                              <p className="text-[10px] font-mono text-[#a78bfa]">💊 CAMBIOS DE MEDICAMENTOS EN ESA VISITA</p>
                              <p className="text-sm text-[#dde6ef] mt-0.5">{lv.medication_changes}</p>
                            </div>
                          )}

                          {/* Metas del paciente */}
                          {lv.patient_goals && (
                            <div className="bg-[#00e5a0]/10 border border-[#00e5a0]/20 rounded-lg px-3 py-2 mb-2">
                              <p className="text-[10px] font-mono text-[#00e5a0]">🎯 METAS DEL PACIENTE</p>
                              <p className="text-sm text-[#dde6ef] mt-0.5">{lv.patient_goals}</p>
                            </div>
                          )}

                          {/* Labs notas de última visita */}
                          {lv.labs_notes && (
                            <div className="bg-[#0ea5e9]/10 border border-[#0ea5e9]/20 rounded-lg px-3 py-2">
                              <p className="text-[10px] font-mono text-[#0ea5e9]">🧪 LABS PENDIENTES / NOTAS</p>
                              <p className="text-sm text-[#dde6ef] mt-0.5">{lv.labs_notes}</p>
                            </div>
                          )}

                          {/* Link al análisis de esa visita */}
                          <button
                            onClick={() => router.push(`/dashboard/patient/${patientId}/visit/${lv.id}/analysis`)}
                            className="mt-3 text-xs text-[#a78bfa] hover:text-[#c4b5fd] underline underline-offset-2 transition">
                            Ver análisis APEX de esa visita →
                          </button>
                        </div>
                      );
                    })()}

                    {visits.length === 0 && (
                      <div className="border-t border-[#1e2d3d] pt-4">
                        <p className="text-sm text-[#3d5870] italic">Primera visita del paciente — sin historial previo.</p>
                      </div>
                    )}
                  </div>

                  {/* Notas de recepción y enfermería — lado a lado */}
                  {(receptionNotes || nursingNotes) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <ReadNote label="📩 NOTA DE RECEPCIÓN"  text={receptionNotes} color="#00e5a0" />
                      <ReadNote label="💊 NOTA DE ENFERMERÍA" text={nursingNotes}   color="#0ea5e9" />
                    </div>
                  )}

                  {/* Mediciones de hoy */}
                  {(form.peso || form.fc || form.pa_der_sistolica || form.glucosa) && (
                    <div className="bg-[#0ea5e9]/10 border border-[#0ea5e9]/30 rounded-xl p-4">
                      <p className={`font-mono text-[#0ea5e9] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>📊 MEDICIONES DE HOY (enfermería)</p>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                        {form.pa_der_sistolica && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">PA der.</p><p className="text-[#dde6ef] font-mono text-[10px]">{form.pa_der_sistolica}/{form.pa_der_diastolica}</p></div>}
                        {form.fc && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">FC</p><p className="text-[#dde6ef] font-mono">{form.fc}</p></div>}
                        {form.spo2 && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">SpO₂</p><p className="text-[#dde6ef] font-mono">{form.spo2}%</p></div>}
                        {form.glucosa && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">Glucosa</p><p className="text-[#dde6ef] font-mono">{form.glucosa}</p></div>}
                        {form.peso && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">Peso</p><p className="text-[#dde6ef] font-mono">{form.peso}kg</p></div>}
                        {imc && <div className="bg-[#111820] rounded-lg p-2 text-center"><p className="text-[#3d5870]">IMC</p><p className="font-mono" style={{ color: parseFloat(imc) < 25 ? '#00e5a0' : parseFloat(imc) < 30 ? '#f59e0b' : '#f43f5e' }}>{imc}</p></div>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* D1: Motivo de visita */}
              {doctorStep === 1 && (
                <div className="space-y-5">
                  <h2 className={`font-serif text-[#dde6ef] ${tb ? 'text-2xl' : 'text-xl'}`}>📋 Motivo de Visita</h2>

                  {/* Notas lado a lado */}
                  {(receptionNotes || nursingNotes) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <ReadNote label="📩 NOTA DE RECEPCIÓN"  text={receptionNotes} color="#00e5a0" compact />
                      <ReadNote label="💊 NOTA DE ENFERMERÍA" text={nursingNotes}   color="#0ea5e9" compact />
                    </div>
                  )}

                  <Field label="¿A QUÉ VIENE HOY?" tablet={tb}>
                    <textarea rows={tb ? 5 : 4} className={`w-full px-3 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] outline-none focus:border-[#a78bfa] transition placeholder-[#3d5870] resize-none ${tb ? 'text-base' : 'text-sm'}`}
                      value={form.motivo_visita} onChange={e => set('motivo_visita', e.target.value)}
                      placeholder="Describe con las palabras del paciente el motivo de consulta..." />
                  </Field>

                  <Slider label="INTENSIDAD DEL MALESTAR PRINCIPAL" value={form.motivo_intensidad}
                    onChange={v => set('motivo_intensidad', v)} tablet={tb} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="¿DESDE CUÁNDO?" tablet={tb}>
                      <input className={inp(tb)} placeholder="3 días, 2 semanas, 1 mes..."
                        value={form.motivo_desde} onChange={e => set('motivo_desde', e.target.value)} />
                    </Field>
                    <Field label="CAMBIOS DE MEDICAMENTOS RECIENTES" tablet={tb}>
                      <input className={inp(tb)} placeholder="Inició metformina, suspendió..."
                        value={form.cambios_meds} onChange={e => set('cambios_meds', e.target.value)} />
                    </Field>
                  </div>

                  <div>
                    <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>¿ES LA PRIMERA VEZ?</p>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        { val: 'si',        label: 'Sí, primera vez' },
                        { val: 'no',        label: 'No, recurrente' },
                        { val: 'episodios', label: 'Ha tenido episodios antes' },
                      ].map(({ val, label }) => (
                        <label key={val} className={`flex items-center gap-2 cursor-pointer px-4 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-sm'}`}
                          style={{ background: form.motivo_primera_vez === val ? '#a78bfa' : '#1e2d3d', borderColor: form.motivo_primera_vez === val ? '#a78bfa' : '#2a3a4d', color: form.motivo_primera_vez === val ? '#000' : '#dde6ef' }}>
                          <input type="radio" name="primera_vez" value={val}
                            checked={form.motivo_primera_vez === val}
                            onChange={e => set('motivo_primera_vez', e.target.value)} className="sr-only" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* D2: Reporte subjetivo */}
              {doctorStep === 2 && (
                <div className="space-y-5">
                  <h2 className={`font-serif text-[#dde6ef] ${tb ? 'text-2xl' : 'text-xl'}`}>🧠 Reporte Subjetivo</h2>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-5">
                    <p className={`font-mono text-[#a78bfa] ${tb ? 'text-sm' : 'text-xs'}`}>ENERGÍA HOY</p>
                    <Slider label="AL DESPERTAR"     value={form.energia_manana}   onChange={v => set('energia_manana', v)} tablet={tb} />
                    <Slider label="A MEDIODÍA"        value={form.energia_mediodia} onChange={v => set('energia_mediodia', v)} tablet={tb} />
                    <Slider label="AL FINAL DEL DÍA" value={form.energia_tarde}    onChange={v => set('energia_tarde', v)} tablet={tb} />
                  </div>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-4">
                    <p className={`font-mono text-[#a78bfa] ${tb ? 'text-sm' : 'text-xs'}`}>SUEÑO</p>
                    <Slider label="CALIDAD DEL SUEÑO" value={form.sueno_calidad} onChange={v => set('sueno_calidad', v)} tablet={tb} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="HORAS POR NOCHE" tablet={tb}>
                        <NumInput value={form.sueno_horas} onChange={v => set('sueno_horas', v)} placeholder="7.5" unit="hrs" tablet={tb} />
                      </Field>
                      <div>
                        <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>¿DESCANSADO?</p>
                        <div className="flex gap-2 flex-wrap">
                          {['Sí','No','A veces'].map(o => (
                            <label key={o} className={`flex items-center gap-2 cursor-pointer px-4 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-sm'}`}
                              style={{ background: form.sueno_reparador === o ? '#a78bfa' : '#1e2d3d', borderColor: form.sueno_reparador === o ? '#a78bfa' : '#2a3a4d', color: form.sueno_reparador === o ? '#000' : '#dde6ef' }}>
                              <input type="radio" name="sueno_rep" value={o} checked={form.sueno_reparador === o}
                                onChange={e => set('sueno_reparador', e.target.value)} className="sr-only" />
                              {o}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ánimo + Digestión lado a lado */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-4">
                      <p className={`font-mono text-[#a78bfa] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>ÁNIMO ESTA SEMANA</p>
                      <div className="flex flex-wrap gap-2">
                        {ANIMO_OPTS.map(o => (
                          <button key={o} type="button" onClick={() => toggleMulti(animo, setAnimo, o)}
                            className={`px-3 rounded-full font-semibold transition ${tb ? 'py-2 text-sm' : 'py-1.5 text-xs'}`}
                            style={{ background: animo.includes(o) ? '#a78bfa' : '#1e2d3d', color: animo.includes(o) ? '#000' : '#7a95aa' }}>
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-4">
                      <p className={`font-mono text-[#a78bfa] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>DIGESTIÓN</p>
                      <div className="flex flex-wrap gap-2">
                        {DIGESTION_OPTS.map(o => (
                          <button key={o} type="button" onClick={() => toggleMulti(digestion, setDigestion, o)}
                            className={`px-3 rounded-full font-semibold transition ${tb ? 'py-2 text-sm' : 'py-1.5 text-xs'}`}
                            style={{ background: digestion.includes(o) ? '#a78bfa' : '#1e2d3d', color: digestion.includes(o) ? '#000' : '#7a95aa' }}>
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Slider label="LIBIDO ACTUAL" value={form.libido_hoy} onChange={v => set('libido_hoy', v)} tablet={tb} />

                  {/* Color orina — mañana y tarde lado a lado */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {([
                      { field: 'orina_color',       label: 'COLOR ORINA EN LA MAÑANA' },
                      { field: 'orina_color_tarde',  label: 'COLOR ORINA POR LA TARDE' },
                    ] as const).map(({ field, label }) => (
                      <div key={field} className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-4">
                        <p className={`font-mono text-[#a78bfa] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>{label}</p>
                        <div className="flex gap-2 flex-wrap">
                          {ORINA_COLORS.map(c => (
                            <button key={c.hex} type="button" onClick={() => set(field, c.label)}
                              className={`flex flex-col items-center gap-1 rounded-xl border-2 transition ${tb ? 'p-3' : 'p-2'}`}
                              style={{ borderColor: form[field] === c.label ? '#a78bfa' : '#1e2d3d', background: form[field] === c.label ? '#a78bfa11' : 'transparent' }}>
                              <div className={`rounded-full border border-[#1e2d3d] ${tb ? 'w-10 h-10' : 'w-8 h-8'}`} style={{ background: c.hex }} />
                              <span className="text-[10px] text-[#7a95aa] text-center max-w-[60px] leading-tight">{c.text}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Dolor */}
                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-4 space-y-4">
                    <label className={`flex items-center gap-3 cursor-pointer ${tb ? 'text-base' : 'text-sm'}`}>
                      <input type="checkbox" checked={form.dolor_hoy}
                        onChange={e => set('dolor_hoy', e.target.checked)}
                        className={`flex-shrink-0 accent-[#a78bfa] ${tb ? 'w-5 h-5' : 'w-4 h-4'}`} />
                      <span className="text-[#dde6ef] font-semibold">Tiene dolor hoy</span>
                    </label>
                    {form.dolor_hoy && (
                      <>
                        <Field label="DÓNDE" tablet={tb}>
                          <input className={inp(tb)} placeholder="Cabeza, espalda, articulaciones..."
                            value={form.dolor_ubicacion} onChange={e => set('dolor_ubicacion', e.target.value)} />
                        </Field>
                        <Slider label="INTENSIDAD DEL DOLOR" value={form.dolor_intensidad}
                          onChange={v => set('dolor_intensidad', v)} color="#f43f5e" tablet={tb} />
                      </>
                    )}
                  </div>

                  <Field label="METAS DEL PACIENTE" tablet={tb}>
                    <textarea rows={tb ? 4 : 3} className={`w-full px-3 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] outline-none focus:border-[#a78bfa] transition placeholder-[#3d5870] resize-none ${tb ? 'text-base' : 'text-sm'}`}
                      value={form.metas_paciente} onChange={e => set('metas_paciente', e.target.value)}
                      placeholder="Bajar de peso, tener más energía, dormir mejor..." />
                  </Field>
                </div>
              )}

              {/* D3: Exploración clínica */}
              {doctorStep === 3 && (
                <div className="space-y-5">
                  <h2 className={`font-serif text-[#dde6ef] ${tb ? 'text-2xl' : 'text-xl'}`}>🔬 Exploración Clínica</h2>
                  <p className="text-xs text-[#7a95aa]">Solo lo relevante. No obligatorio campo por campo.</p>

                  <Field label="IMPRESIÓN GENERAL" tablet={tb}>
                    <textarea rows={tb ? 4 : 3} className={`w-full px-3 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] outline-none focus:border-[#a78bfa] transition placeholder-[#3d5870] resize-none ${tb ? 'text-base' : 'text-sm'}`}
                      value={form.exp_general} onChange={e => set('exp_general', e.target.value)}
                      placeholder="Paciente en buen estado general, consciente, orientado, normohidratado..." />
                  </Field>

                  {form.ecg_realizado && (
                    <Field label="INTERPRETACIÓN ECG" tablet={tb}>
                      <textarea rows={3} className={`w-full px-3 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] outline-none focus:border-[#a78bfa] transition placeholder-[#3d5870] resize-none ${tb ? 'text-base' : 'text-sm'}`}
                        value={form.ecg_interpretacion} onChange={e => set('ecg_interpretacion', e.target.value)}
                        placeholder="Ritmo sinusal regular, eje normal..." />
                    </Field>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { key: 'exp_piel',       label: 'PIEL Y MUCOSAS',  ph: 'Coloración, ictericia, acné...' },
                      { key: 'exp_ojos',       label: 'OJOS',            ph: 'Ictericia escleral, xantelasmas...' },
                      { key: 'exp_boca',       label: 'BOCA',            ph: 'Estado dental, lengua...' },
                      { key: 'exp_tiroides',   label: 'TIROIDES',        ph: 'Palpación, tamaño, nódulos...' },
                      { key: 'exp_abdomen',    label: 'ABDOMEN',         ph: 'Hepatomegalia, masas...' },
                      { key: 'exp_neurologico',label: 'NEUROLÓGICO',     ph: 'Temblor, marcha, reflejos...' },
                    ].map(({ key, label, ph }) => (
                      <Field key={key} label={label} tablet={tb}>
                        <input className={inp(tb)} placeholder={ph}
                          value={form[key as keyof typeof form] as string}
                          onChange={e => set(key, e.target.value)} />
                      </Field>
                    ))}
                  </div>

                  <Field label="OTROS HALLAZGOS" tablet={tb}>
                    <textarea rows={2} className={`w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none focus:border-[#a78bfa] transition placeholder-[#3d5870] resize-none ${tb ? 'text-base' : 'text-sm'}`}
                      value={form.exp_otros} onChange={e => set('exp_otros', e.target.value)}
                      placeholder="Cualquier otro hallazgo..." />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-4">
                    <Field label="TIPO DE ESTUDIO DE IMAGEN" tablet={tb}>
                      <input className={inp(tb)} placeholder="RX tórax, TAC abdomen..."
                        value={form.img_tipo} onChange={e => set('img_tipo', e.target.value)} />
                    </Field>
                    <Field label="HALLAZGOS" tablet={tb}>
                      <input className={inp(tb)} placeholder="Sin infiltrados, silueta cardíaca normal..."
                        value={form.img_interpretacion} onChange={e => set('img_interpretacion', e.target.value)} />
                    </Field>
                  </div>

                  <label className={`flex items-center gap-3 cursor-pointer bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl px-4 ${tb ? 'py-4' : 'py-3'}`}>
                    <input type="checkbox" checked={form.cognitivo_realizado}
                      onChange={e => set('cognitivo_realizado', e.target.checked)}
                      className={`flex-shrink-0 accent-[#a78bfa] ${tb ? 'w-5 h-5' : 'w-4 h-4'}`} />
                    <span className={`text-[#dde6ef] font-semibold ${tb ? 'text-base' : 'text-sm'}`}>Se realizó Mini-Cog hoy</span>
                  </label>
                  {form.cognitivo_realizado && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-4">
                      <Field label="PALABRAS RECORDADAS (0-3)" tablet={tb}>
                        <NumInput value={form.cognitivo_palabras} onChange={v => set('cognitivo_palabras', v)} placeholder="0-3" tablet={tb} />
                      </Field>
                      <div>
                        <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>RELOJ CORRECTO</p>
                        <div className="flex gap-2">
                          {['Sí','No','Parcial'].map(o => (
                            <label key={o} className={`flex items-center justify-center cursor-pointer flex-1 rounded-lg border transition ${tb ? 'py-3 text-sm' : 'py-2 text-xs'}`}
                              style={{ background: form.cognitivo_reloj === o ? '#a78bfa' : '#1e2d3d', borderColor: form.cognitivo_reloj === o ? '#a78bfa' : '#2a3a4d', color: form.cognitivo_reloj === o ? '#000' : '#dde6ef' }}>
                              <input type="radio" name="reloj" value={o} checked={form.cognitivo_reloj === o}
                                onChange={e => set('cognitivo_reloj', e.target.value)} className="sr-only" />
                              {o}
                            </label>
                          ))}
                        </div>
                      </div>
                      <Field label="OBSERVACIONES" tablet={tb}>
                        <input className={inp(tb)} placeholder="Notas..."
                          value={form.cognitivo_notas} onChange={e => set('cognitivo_notas', e.target.value)} />
                      </Field>
                    </div>
                  )}
                </div>
              )}

              {/* D4: Laboratorios */}
              {doctorStep === 4 && (
                <div className="space-y-5">
                  <h2 className={`font-serif text-[#dde6ef] ${tb ? 'text-2xl' : 'text-xl'}`}>🧪 Laboratorios</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#0d1520] border border-[#a78bfa]/30 rounded-xl p-5">
                      <p className={`font-mono text-[#a78bfa] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>URL DEL PDF / FOTO</p>
                      <p className="text-xs text-[#3d5870] mb-4">Upload directo próximamente.</p>
                      <Field label="" tablet={tb}>
                        <input type="url" className={inp(tb)} placeholder="https://..."
                          value={form.labs_pdf_url} onChange={e => set('labs_pdf_url', e.target.value)} />
                      </Field>
                    </div>
                    <Field label="NOTAS SOBRE LOS LABORATORIOS" tablet={tb}>
                      <textarea rows={tb ? 7 : 6} className={`w-full px-3 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] outline-none focus:border-[#a78bfa] transition placeholder-[#3d5870] resize-none ${tb ? 'text-base' : 'text-sm'}`}
                        value={form.lab_notas} onChange={e => set('lab_notas', e.target.value)}
                        placeholder="Resultados relevantes, valores que llaman la atención..." />
                    </Field>
                  </div>

                  {/* Resumen final */}
                  <div className="bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-xl p-5">
                    <p className={`font-mono text-[#a78bfa] mb-3 ${tb ? 'text-sm' : 'text-xs'}`}>✅ RESUMEN DE LA VISITA</p>
                    <div className="space-y-1 text-xs text-[#7a95aa]">
                      {patient?.full_name    && <p>👤 {patient.full_name}{age !== null ? ` · ${age} años` : ''}</p>}
                      {form.motivo_visita    && <p>📋 Motivo: {form.motivo_visita.slice(0,80)}{form.motivo_visita.length>80?'...':''}</p>}
                      {form.peso             && <p>⚖️ Peso: {form.peso}kg{imc ? ` · IMC: ${imc}` : ''}</p>}
                      {form.pa_der_sistolica && <p>❤️ PA: {form.pa_der_sistolica}/{form.pa_der_diastolica}{form.fc ? ` · FC: ${form.fc}lpm` : ''}</p>}
                      {receptionNotes        && <p>🏥 Nota recepción registrada</p>}
                      {nursingNotes          && <p>💊 Nota enfermería registrada</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* ─── Barra de navegación fija ─── */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#070a0e]/95 backdrop-blur border-t border-[#1e2d3d] px-6 flex justify-between items-center z-40"
        style={{ paddingTop: tb ? '1rem' : '0.75rem', paddingBottom: tb ? '1rem' : '0.75rem' }}>

        <button
          onClick={() => {
            if (phase === 'reception') router.push(`/dashboard/patient/${patientId}`);
            else if (phase === 'nursing') { if (nursingStep > 1) setNursingStep(n => n-1); else setPhase('reception'); }
            else if (phase === 'doctor')  { if (doctorStep > 0) setDoctorStep(d => d-1); else { setPhase('nursing'); setNursingStep(3); } }
          }}
          className={`text-[#7a95aa] border border-[#1e2d3d] rounded-xl hover:border-[#7a95aa] transition ${tb ? 'px-6 py-3.5 text-base' : 'px-5 py-2.5 text-sm'}`}
        >
          ← Anterior
        </button>

        <div className="text-center">
          <p className="text-[10px] font-mono text-[#3d5870]">
            {phase === 'reception' && 'Fase 1 de 3'}
            {phase === 'nursing'   && `Enfermería ${nursingStep}/3`}
            {phase === 'doctor' && doctorStep > 0 && `Médico ${doctorStep}/4`}
          </p>
        </div>

        {phase === 'reception' && (
          <button onClick={() => { setPhase('nursing'); setNursingStep(1); }}
            className={btn('#00e5a0', tb)}
            style={{ background: '#00e5a0', color: '#000' }}>
            Continuar → Enfermería
          </button>
        )}
        {phase === 'nursing' && nursingStep < 3 && (
          <button onClick={() => setNursingStep(n => n+1)}
            className={btn('#0ea5e9', tb)}
            style={{ background: '#0ea5e9', color: '#000' }}>
            Siguiente →
          </button>
        )}
        {phase === 'nursing' && nursingStep === 3 && (
          <button onClick={() => { setPhase('doctor'); setDoctorStep(0); }}
            className={btn('#a78bfa', tb)}
            style={{ background: '#a78bfa', color: '#000' }}>
            Continuar → Médico
          </button>
        )}
        {phase === 'doctor' && doctorStep === 0 && (
          <button onClick={() => setDoctorStep(1)}
            className={btn('#a78bfa', tb)}
            style={{ background: '#a78bfa', color: '#000' }}>
            Iniciar consulta →
          </button>
        )}
        {phase === 'doctor' && doctorStep > 0 && doctorStep < 4 && (
          <button onClick={() => setDoctorStep(d => d+1)}
            className={btn('#a78bfa', tb)}
            style={{ background: '#a78bfa', color: '#000' }}>
            Siguiente →
          </button>
        )}
        {phase === 'doctor' && doctorStep === 4 && (
          <button onClick={handleSave} disabled={saving}
            className={`font-bold bg-[#00e5a0] text-black rounded-xl hover:bg-[#00ffb0] disabled:opacity-50 transition ${tb ? 'px-8 py-4 text-base' : 'px-6 py-2.5 text-sm'}`}>
            {saving ? 'Guardando...' : '🔬 Guardar y Analizar con APEX'}
          </button>
        )}
      </div>
    </div>
  );
}
