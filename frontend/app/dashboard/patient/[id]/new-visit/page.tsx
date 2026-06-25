'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';

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

  // Dolencias — el paciente puede tener varias simultáneas
  type Dolor = { ubicacion: string; intensidad: number };
  const [dolores, setDolores] = useState<Dolor[]>([]);
  const addDolor    = () => setDolores(prev => [...prev, { ubicacion: '', intensidad: 5 }]);
  const removeDolor = (i: number) => setDolores(prev => prev.filter((_, j) => j !== i));
  const updateDolor = (i: number, field: keyof Dolor, value: string | number) =>
    setDolores(prev => prev.map((d, j) => j === i ? { ...d, [field]: value } : d));

  // Multi-selects
  const [animo,     setAnimo]     = useState<string[]>([]);
  const [digestion, setDigestion] = useState<string[]>([]);

  // Archivos de laboratorio
  type LabFile = { name: string; type: string; size: number; data: string };
  const [labFiles,  setLabFiles]  = useState<LabFile[]>([]);
  const labInputRef = useRef<HTMLInputElement>(null);

  // Formulario clínico — sin talla (se usa la registrada), sin cintura ni cadera
  const [form, setForm] = useState({
    // Signos vitales
    pa_der_sistolica: '', pa_der_diastolica: '',
    pa_izq_sistolica: '', pa_izq_diastolica: '',
    pa_brazo_mayor: '', fc: '', temperatura: '', spo2: '',
    glucosa: '', glucosa_ayuno: '', ecg_realizado: false,
    // Composición — talla solo se usa cuando no hay registro previo
    talla: '',
    peso: '',
    circ_abdominal: '', circ_cuello: '', circ_biceps: '', circ_muneca: '',
    inbody_grasa: '', inbody_musculo: '', inbody_agua: '', inbody_visceral: '',
    actividad_tipo: '', actividad_frecuencia: '', actividad_intensidad: '',
    sitting_hours: '', work_activity_level: '',
    // Funcionales
    agarre_der: '', agarre_izq: '',
    marcha_seg: '', syl_reps: '', equilibrio_seg: '', vo2max: '',
    // Motivo médico
    motivo_visita: '', motivo_intensidad: 5, motivo_desde: '',
    motivo_primera_vez: '', cambios_meds: '',
    // Subjetivo
    energia_manana: 5, energia_mediodia: 5, energia_tarde: 5,
    sueno_calidad: 5, sueno_horas: '', sueno_reparador: '',
    bedtime: '', wake_time: '', night_awakenings: '', snoring: '',
    snoring_intensity: '', snoring_frequency: '',
    apnea_observed: '', apnea_frequency: '', apnea_duration: '',
    daytime_nap: '',
    libido_hoy: 5, orina_color: '', orina_color_tarde: '',
    bristol_scale: '', bowel_movements_per_day: '', recent_antibiotics: '', probiotics_use: '',
    stress_level: 5, racing_mind: '', anxiety_panic: '', stress_coping: '', can_relax: '',
    recent_chemical_exposure: '', water_source: '', plastic_in_microwave: '', recent_tattoo_amalgam: '',
    water_intake_liters: '', food_cravings: '', screen_eating: '', meals_per_day: '',
    cooking_oil: '', ultraprocessed_frequency: '',
    self_skin_issues: '', hair_loss: '', brittle_nails: '',
    medication_adherence: '',
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

  // Handler de archivos de laboratorio
  const handleLabFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.size > 8 * 1024 * 1024) { alert(`${file.name} supera 8 MB`); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        setLabFiles(prev => [...prev, { name: file.name, type: file.type, size: file.size, data }]);
      };
      reader.readAsDataURL(file);
    });
    if (e.target) e.target.value = '';
  };

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
        sitting_hours: form.sitting_hours, work_activity_level: form.work_activity_level,
        grip_right: form.agarre_der, grip_left: form.agarre_izq,
        walk_4m_seconds: form.marcha_seg, sit_stand_30s: form.syl_reps,
        balance_seconds: form.equilibrio_seg, vo2max: form.vo2max,
        energy_morning: form.energia_manana, energy_noon: form.energia_mediodia,
        energy_evening: form.energia_tarde, sleep_quality: form.sueno_calidad,
        sleep_hours: form.sueno_horas, wakes_rested: form.sueno_reparador,
        bedtime: form.bedtime, wake_time: form.wake_time,
        night_awakenings: form.night_awakenings, snoring: form.snoring,
        snoring_intensity: form.snoring_intensity, snoring_frequency: form.snoring_frequency,
        apnea_observed: form.apnea_observed, apnea_frequency: form.apnea_frequency,
        apnea_duration: form.apnea_duration,
        daytime_nap: form.daytime_nap,
        mood: animo, libido: form.libido_hoy, digestion,
        bristol_scale: form.bristol_scale, bowel_movements_per_day: form.bowel_movements_per_day,
        recent_antibiotics: form.recent_antibiotics, probiotics_use: form.probiotics_use,
        stress_level: form.stress_level, racing_mind: form.racing_mind,
        anxiety_panic: form.anxiety_panic, stress_coping: form.stress_coping, can_relax: form.can_relax,
        recent_chemical_exposure: form.recent_chemical_exposure, water_source: form.water_source,
        plastic_in_microwave: form.plastic_in_microwave, recent_tattoo_amalgam: form.recent_tattoo_amalgam,
        water_intake_liters: form.water_intake_liters, food_cravings: form.food_cravings,
        screen_eating: form.screen_eating, meals_per_day: form.meals_per_day,
        cooking_oil: form.cooking_oil, ultraprocessed_frequency: form.ultraprocessed_frequency,
        self_skin_issues: form.self_skin_issues, hair_loss: form.hair_loss, brittle_nails: form.brittle_nails,
        medication_adherence: form.medication_adherence,
        urine_color: form.orina_color, urine_color_afternoon: form.orina_color_tarde,
        pain_today: dolores.length > 0,
        pain_location: dolores[0]?.ubicacion || '', pain_intensity: dolores[0]?.intensidad ?? null,
        pains: dolores,
        general_inspection: form.exp_general, ecg_interpretation: form.ecg_interpretacion,
        skin_findings: form.exp_piel, eye_findings: form.exp_ojos,
        mouth_findings: form.exp_boca, thyroid_findings: form.exp_tiroides,
        abdomen_findings: form.exp_abdomen, neuro_findings: form.exp_neurologico,
        other_findings: form.exp_otros, imaging_type: form.img_tipo,
        imaging_findings: form.img_interpretacion, minicog_done: form.cognitivo_realizado,
        minicog_words: form.cognitivo_palabras, minicog_clock: form.cognitivo_reloj,
        minicog_notes: form.cognitivo_notas,
        labs_pdf_url: form.labs_pdf_url, labs_notes: form.lab_notas,
        labs_files: labFiles.length > 0 ? labFiles.map(f => ({ name: f.name, type: f.type, size: f.size, data: f.data })) : null,
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
  // Talla: columna DB = "height". El alias "talla" era legacy, ahora el backend lo mapea.
  // Buscamos ambos por compatibilidad con registros anteriores.
  const patientH    = visits.find(v => v.height || v.talla)?.height
                   || visits.find(v => v.height || v.talla)?.talla
                   || patient?.height || patient?.talla_cm
                   || null;
  const imc         = calcIMC(form.peso, patientH || form.talla);
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
        <div className="mx-auto px-4 py-8 w-full max-w-3xl md:max-w-5xl lg:max-w-7xl">

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

                  {/* Talla — solo se muestra si no hay registro previo */}
                  {!patientH && (
                    <div className="p-3 rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/05">
                      <p className="text-xs font-mono text-[#f59e0b] mb-2">⚠ TALLA NO ENCONTRADA EN VISITAS ANTERIORES — ingresa ahora</p>
                      <Field label="TALLA (cm)" tablet={tb}>
                        <NumInput value={form.talla ?? ''} onChange={v => set('talla', v)} placeholder="170" unit="cm" tablet={tb} />
                      </Field>
                    </div>
                  )}

                  {/* Peso + IMC */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <Field label="PESO (kg)" tablet={tb}>
                      <NumInput value={form.peso} onChange={v => set('peso', v)} placeholder="75.0" unit="kg" tablet={tb} />
                    </Field>
                    {(() => {
                      const h = patientH || form.talla;
                      const imcVal = calcIMC(form.peso, h);
                      return imcVal ? (
                        <div className="bg-[#0d1520] border border-[#0ea5e9]/30 rounded-lg px-4 py-3 flex items-center gap-3">
                          <div>
                            <p className="text-[10px] font-mono text-[#7a95aa]">IMC CALCULADO</p>
                            <p className="text-2xl font-mono font-black mt-0.5" style={{
                              color: parseFloat(imcVal) < 18.5 ? '#f59e0b' : parseFloat(imcVal) < 25 ? '#00e5a0' : parseFloat(imcVal) < 30 ? '#f59e0b' : '#f43f5e'
                            }}>{imcVal}</p>
                          </div>
                          <div>
                            <p className="text-xs text-[#3d5870]">
                              {parseFloat(imcVal) < 18.5 ? 'Bajo peso' : parseFloat(imcVal) < 25 ? 'Normal' : parseFloat(imcVal) < 30 ? 'Sobrepeso' : 'Obesidad'}
                            </p>
                            <p className="text-[10px] text-[#3d5870] font-mono mt-0.5">{patientH || form.talla} cm</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-[#3d5870] italic">Ingresa el peso{!patientH && !form.talla ? ' y talla' : ''} para calcular IMC</p>
                      );
                    })()}
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="HORAS SENTADO AL DÍA" tablet={tb}>
                      <NumInput value={form.sitting_hours} onChange={v => set('sitting_hours', v)} placeholder="8" unit="hrs" tablet={tb} />
                    </Field>
                    <Field label="TIPO DE ACTIVIDAD LABORAL" tablet={tb}>
                      <select className={inp(tb)} value={form.work_activity_level}
                        onChange={e => set('work_activity_level', e.target.value)}>
                        <option value="">Seleccionar</option>
                        <option>Sedentario</option><option>Mixto</option><option>Activo</option>
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

                  {/* Dolor — parte del motivo de consulta. Puede haber varias dolencias a la vez */}
                  <div className="bg-[#0d1520] border border-[#f43f5e]/20 rounded-xl p-4 space-y-4">
                    <label className={`flex items-center gap-3 cursor-pointer ${tb ? 'text-base' : 'text-sm'}`}>
                      <input type="checkbox" checked={dolores.length > 0}
                        onChange={e => setDolores(e.target.checked ? [{ ubicacion: '', intensidad: 5 }] : [])}
                        className={`flex-shrink-0 accent-[#f43f5e] ${tb ? 'w-5 h-5' : 'w-4 h-4'}`} />
                      <span className="text-[#dde6ef] font-semibold">Tiene dolor hoy</span>
                    </label>
                    {dolores.map((d, i) => (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#1e2d3d] pt-4 first:border-t-0 first:pt-0">
                        <Field label={`DÓNDE DUELE${dolores.length > 1 ? ` #${i+1}` : ''}`} tablet={tb}>
                          <div className="flex gap-2">
                            <input className={inp(tb) + ' flex-1'} placeholder="Cabeza, espalda, articulaciones..."
                              value={d.ubicacion} onChange={e => updateDolor(i, 'ubicacion', e.target.value)} />
                            {dolores.length > 1 && (
                              <button type="button" onClick={() => removeDolor(i)}
                                className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-[#1e2d3d] hover:bg-[#f43f5e]/20 text-[#3d5870] hover:text-[#f43f5e] transition text-lg">
                                ×
                              </button>
                            )}
                          </div>
                        </Field>
                        <Slider label="INTENSIDAD DEL DOLOR" value={d.intensidad}
                          onChange={v => updateDolor(i, 'intensidad', v)} color="#f43f5e" tablet={tb} />
                      </div>
                    ))}
                    {dolores.length > 0 && (
                      <button type="button" onClick={addDolor}
                        className={`text-[#f43f5e] border border-[#f43f5e]/30 rounded-xl hover:bg-[#f43f5e]/10 transition font-semibold ${tb ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-xs'}`}>
                        + Agregar otra dolencia
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* D2: Reporte subjetivo */}
              {doctorStep === 2 && (
                <div className="space-y-5">
                  <h2 className={`font-serif text-[#dde6ef] ${tb ? 'text-2xl' : 'text-xl'}`}>🧠 Reporte Subjetivo</h2>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-5">
                    <p className={`font-mono text-[#a78bfa] ${tb ? 'text-sm' : 'text-xs'}`}>ENERGÍA EN LOS ÚLTIMOS 5 DÍAS</p>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="HORA DE ACOSTARSE" tablet={tb}>
                        <input type="time" className={inp(tb)} value={form.bedtime} onChange={e => set('bedtime', e.target.value)} />
                      </Field>
                      <Field label="HORA DE DESPERTAR" tablet={tb}>
                        <input type="time" className={inp(tb)} value={form.wake_time} onChange={e => set('wake_time', e.target.value)} />
                      </Field>
                    </div>
                    {/* Despertares + siesta */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {([
                        { key: 'night_awakenings', label: '¿DESPERTARES NOCTURNOS?', opts: ['Sí','No'] },
                        { key: 'daytime_nap',      label: '¿SIESTA DURANTE EL DÍA?', opts: ['Sí','No'] },
                      ] as const).map(({ key, label, opts }) => (
                        <div key={key}>
                          <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>{label}</p>
                          <div className="flex gap-2 flex-wrap">
                            {opts.map(o => (
                              <label key={o} className={`flex items-center gap-2 cursor-pointer px-3 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-xs'}`}
                                style={{ background: form[key] === o ? '#a78bfa' : '#1e2d3d', borderColor: form[key] === o ? '#a78bfa' : '#2a3a4d', color: form[key] === o ? '#000' : '#dde6ef' }}>
                                <input type="radio" name={key} value={o} checked={form[key] === o}
                                  onChange={e => set(key, e.target.value)} className="sr-only" />
                                {o}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── Ronquidos ── */}
                    <div className="space-y-3 rounded-xl bg-[#070a0e] border border-[#1e2d3d] p-4">
                      <div>
                        <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>¿RONCA USTED?</p>
                        <div className="flex gap-2 flex-wrap">
                          {(['Sí','No','A veces'] as const).map(o => (
                            <label key={o} className={`flex items-center gap-2 cursor-pointer px-3 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-xs'}`}
                              style={{ background: form.snoring === o ? '#a78bfa' : '#1e2d3d', borderColor: form.snoring === o ? '#a78bfa' : '#2a3a4d', color: form.snoring === o ? '#000' : '#dde6ef' }}>
                              <input type="radio" name="snoring" value={o} checked={form.snoring === o}
                                onChange={e => set('snoring', e.target.value)} className="sr-only" />
                              {o}
                            </label>
                          ))}
                        </div>
                      </div>
                      {(form.snoring === 'Sí' || form.snoring === 'A veces') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-3 border-l-2 border-[#a78bfa]/30">
                          <div>
                            <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>¿SE ESCUCHA A TRAVÉS DE LA PARED?</p>
                            <div className="flex gap-2 flex-wrap">
                              {(['Sí','No','A veces'] as const).map(o => (
                                <label key={o} className={`flex items-center gap-2 cursor-pointer px-3 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-xs'}`}
                                  style={{ background: form.snoring_intensity === o ? '#a78bfa' : '#1e2d3d', borderColor: form.snoring_intensity === o ? '#a78bfa' : '#2a3a4d', color: form.snoring_intensity === o ? '#000' : '#dde6ef' }}>
                                  <input type="radio" name="snoring_intensity" value={o} checked={form.snoring_intensity === o}
                                    onChange={e => set('snoring_intensity', e.target.value)} className="sr-only" />
                                  {o}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>¿CON QUÉ FRECUENCIA RONCA?</p>
                            <div className="flex gap-2 flex-wrap">
                              {(['Casi siempre','Frecuentemente','A veces'] as const).map(o => (
                                <label key={o} className={`flex items-center gap-2 cursor-pointer px-3 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-xs'}`}
                                  style={{ background: form.snoring_frequency === o ? '#a78bfa' : '#1e2d3d', borderColor: form.snoring_frequency === o ? '#a78bfa' : '#2a3a4d', color: form.snoring_frequency === o ? '#000' : '#dde6ef' }}>
                                  <input type="radio" name="snoring_frequency" value={o} checked={form.snoring_frequency === o}
                                    onChange={e => set('snoring_frequency', e.target.value)} className="sr-only" />
                                  {o}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Apnea ── */}
                    <div className="space-y-3 rounded-xl bg-[#070a0e] border border-[#1e2d3d] p-4">
                      <div>
                        <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>¿USTED O ALGUIEN HA NOTADO PAUSAS AL RESPIRAR MIENTRAS DUERME?</p>
                        <div className="flex gap-2 flex-wrap">
                          {(['Sí','No','No sé'] as const).map(o => (
                            <label key={o} className={`flex items-center gap-2 cursor-pointer px-3 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-xs'}`}
                              style={{ background: form.apnea_observed === o ? '#a78bfa' : '#1e2d3d', borderColor: form.apnea_observed === o ? '#a78bfa' : '#2a3a4d', color: form.apnea_observed === o ? '#000' : '#dde6ef' }}>
                              <input type="radio" name="apnea_observed" value={o} checked={form.apnea_observed === o}
                                onChange={e => set('apnea_observed', e.target.value)} className="sr-only" />
                              {o}
                            </label>
                          ))}
                        </div>
                      </div>
                      {form.apnea_observed === 'Sí' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-3 border-l-2 border-[#a78bfa]/30">
                          <div>
                            <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>¿CON QUÉ FRECUENCIA?</p>
                            <div className="flex gap-2 flex-wrap">
                              {(['<1/sem','1-2/sem','3+/sem'] as const).map(o => (
                                <label key={o} className={`flex items-center gap-2 cursor-pointer px-3 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-xs'}`}
                                  style={{ background: form.apnea_frequency === o ? '#a78bfa' : '#1e2d3d', borderColor: form.apnea_frequency === o ? '#a78bfa' : '#2a3a4d', color: form.apnea_frequency === o ? '#000' : '#dde6ef' }}>
                                  <input type="radio" name="apnea_frequency" value={o} checked={form.apnea_frequency === o}
                                    onChange={e => set('apnea_frequency', e.target.value)} className="sr-only" />
                                  {o}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>¿CUÁNTO DURAN LAS PAUSAS?</p>
                            <div className="flex gap-2 flex-wrap">
                              {(['Segundos','Más de 10 seg','No sabe'] as const).map(o => (
                                <label key={o} className={`flex items-center gap-2 cursor-pointer px-3 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-xs'}`}
                                  style={{ background: form.apnea_duration === o ? '#a78bfa' : '#1e2d3d', borderColor: form.apnea_duration === o ? '#a78bfa' : '#2a3a4d', color: form.apnea_duration === o ? '#000' : '#dde6ef' }}>
                                  <input type="radio" name="apnea_duration" value={o} checked={form.apnea_duration === o}
                                    onChange={e => set('apnea_duration', e.target.value)} className="sr-only" />
                                  {o}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-4">
                    <p className={`font-mono text-[#a78bfa] ${tb ? 'text-sm' : 'text-xs'}`}>ESTRÉS</p>
                    <Slider label="NIVEL DE ESTRÉS PERCIBIDO" value={form.stress_level} onChange={v => set('stress_level', v)} tablet={tb} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {([
                        { key: 'racing_mind',   label: '¿MENTE ACELERADA?', opts: ['Sí','No'] },
                        { key: 'anxiety_panic', label: '¿ANSIEDAD / PÁNICO?', opts: ['Sí','No','Ocasional'] },
                        { key: 'can_relax',     label: '¿PUEDE RELAJARSE?', opts: ['Sí','No','Pocas veces'] },
                      ] as const).map(({ key, label, opts }) => (
                        <div key={key}>
                          <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>{label}</p>
                          <div className="flex gap-2 flex-wrap">
                            {opts.map(o => (
                              <label key={o} className={`flex items-center gap-2 cursor-pointer px-3 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-xs'}`}
                                style={{ background: form[key] === o ? '#a78bfa' : '#1e2d3d', borderColor: form[key] === o ? '#a78bfa' : '#2a3a4d', color: form[key] === o ? '#000' : '#dde6ef' }}>
                                <input type="radio" name={key} value={o} checked={form[key] === o}
                                  onChange={e => set(key, e.target.value)} className="sr-only" />
                                {o}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Field label="¿CÓMO MANEJA EL ESTRÉS?" tablet={tb}>
                      <input className={inp(tb)} placeholder="Ejercicio, meditación, nada en particular..."
                        value={form.stress_coping} onChange={e => set('stress_coping', e.target.value)} />
                    </Field>
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
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <Field label="ESCALA DE BRISTOL (1-7)" tablet={tb}>
                          <NumInput value={form.bristol_scale} onChange={v => set('bristol_scale', v)} placeholder="1-7" tablet={tb} />
                        </Field>
                        <Field label="DEPOSICIONES/DÍA" tablet={tb}>
                          <NumInput value={form.bowel_movements_per_day} onChange={v => set('bowel_movements_per_day', v)} placeholder="1" tablet={tb} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        {([
                          { key: 'recent_antibiotics', label: '¿ANTIBIÓTICOS ÚLTIMO AÑO?' },
                          { key: 'probiotics_use',     label: '¿USA PROBIÓTICOS?' },
                        ] as const).map(({ key, label }) => (
                          <div key={key}>
                            <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-xs' : 'text-[10px]'}`}>{label}</p>
                            <div className="flex gap-2 flex-wrap">
                              {['Sí','No'].map(o => (
                                <label key={o} className={`flex items-center gap-2 cursor-pointer px-3 rounded-xl border transition ${tb ? 'py-2 text-xs' : 'py-1.5 text-xs'}`}
                                  style={{ background: form[key] === o ? '#a78bfa' : '#1e2d3d', borderColor: form[key] === o ? '#a78bfa' : '#2a3a4d', color: form[key] === o ? '#000' : '#dde6ef' }}>
                                  <input type="radio" name={key} value={o} checked={form[key] === o}
                                    onChange={e => set(key, e.target.value)} className="sr-only" />
                                  {o}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Slider label="LIBIDO EN LOS ÚLTIMOS DÍAS" value={form.libido_hoy} onChange={v => set('libido_hoy', v)} tablet={tb} />

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

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-4">
                    <p className={`font-mono text-[#a78bfa] ${tb ? 'text-sm' : 'text-xs'}`}>ALIMENTACIÓN</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Field label="AGUA QUE BEBE AL DÍA" tablet={tb}>
                        <NumInput value={form.water_intake_liters} onChange={v => set('water_intake_liters', v)} placeholder="1.5" unit="L" tablet={tb} />
                      </Field>
                      <Field label="COMIDAS AL DÍA" tablet={tb}>
                        <NumInput value={form.meals_per_day} onChange={v => set('meals_per_day', v)} placeholder="3" tablet={tb} />
                      </Field>
                      <Field label="ACEITE QUE USA PARA COCINAR" tablet={tb}>
                        <input className={inp(tb)} placeholder="Oliva, canola, manteca..."
                          value={form.cooking_oil} onChange={e => set('cooking_oil', e.target.value)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="ANTOJOS FRECUENTES" tablet={tb}>
                        <input className={inp(tb)} placeholder="Dulce, sal, harinas..."
                          value={form.food_cravings} onChange={e => set('food_cravings', e.target.value)} />
                      </Field>
                      <div>
                        <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>FRECUENCIA DE ULTRAPROCESADOS</p>
                        <select className={inp(tb)} value={form.ultraprocessed_frequency}
                          onChange={e => set('ultraprocessed_frequency', e.target.value)}>
                          <option value="">Seleccionar</option>
                          <option>Nunca</option><option>A veces</option><option>Frecuente</option><option>Diario</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>¿COME FRENTE A PANTALLAS?</p>
                      <div className="flex gap-2 flex-wrap">
                        {['Sí','No','A veces'].map(o => (
                          <label key={o} className={`flex items-center gap-2 cursor-pointer px-4 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-sm'}`}
                            style={{ background: form.screen_eating === o ? '#a78bfa' : '#1e2d3d', borderColor: form.screen_eating === o ? '#a78bfa' : '#2a3a4d', color: form.screen_eating === o ? '#000' : '#dde6ef' }}>
                            <input type="radio" name="screen_eating" value={o} checked={form.screen_eating === o}
                              onChange={e => set('screen_eating', e.target.value)} className="sr-only" />
                            {o}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-4">
                    <p className={`font-mono text-[#a78bfa] ${tb ? 'text-sm' : 'text-xs'}`}>EXPOSICIÓN AMBIENTAL ACTUAL</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="EXPOSICIÓN RECIENTE A QUÍMICOS/PESTICIDAS" tablet={tb}>
                        <input className={inp(tb)} placeholder="Trabajo, jardín, limpieza..."
                          value={form.recent_chemical_exposure} onChange={e => set('recent_chemical_exposure', e.target.value)} />
                      </Field>
                      <div>
                        <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>AGUA QUE CONSUME</p>
                        <select className={inp(tb)} value={form.water_source}
                          onChange={e => set('water_source', e.target.value)}>
                          <option value="">Seleccionar</option>
                          <option>De la llave</option><option>Embotellada</option><option>Filtrada</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>¿CALIENTA COMIDA EN PLÁSTICO EN MICROONDAS?</p>
                        <div className="flex gap-2 flex-wrap">
                          {['Sí','No'].map(o => (
                            <label key={o} className={`flex items-center gap-2 cursor-pointer px-4 rounded-xl border transition ${tb ? 'py-3 text-sm' : 'py-2 text-sm'}`}
                              style={{ background: form.plastic_in_microwave === o ? '#a78bfa' : '#1e2d3d', borderColor: form.plastic_in_microwave === o ? '#a78bfa' : '#2a3a4d', color: form.plastic_in_microwave === o ? '#000' : '#dde6ef' }}>
                              <input type="radio" name="plastic_in_microwave" value={o} checked={form.plastic_in_microwave === o}
                                onChange={e => set('plastic_in_microwave', e.target.value)} className="sr-only" />
                              {o}
                            </label>
                          ))}
                        </div>
                      </div>
                      <Field label="TATUAJES / AMALGAMAS RECIENTES" tablet={tb}>
                        <input className={inp(tb)} placeholder="Si aplica..."
                          value={form.recent_tattoo_amalgam} onChange={e => set('recent_tattoo_amalgam', e.target.value)} />
                      </Field>
                    </div>
                  </div>

                  <div className="bg-[#0d1520] border border-[#a78bfa]/20 rounded-xl p-5 space-y-3">
                    <p className={`font-mono text-[#a78bfa] ${tb ? 'text-sm' : 'text-xs'}`}>PIEL, CABELLO Y UÑAS — LO QUE EL PACIENTE REPORTA</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {([
                        { key: 'self_skin_issues', label: '¿PIEL SECA O ACNÉ?' },
                        { key: 'hair_loss',        label: '¿CAÍDA DE CABELLO?' },
                        { key: 'brittle_nails',    label: '¿UÑAS FRÁGILES?' },
                      ] as const).map(({ key, label }) => (
                        <div key={key}>
                          <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>{label}</p>
                          <div className="flex gap-2 flex-wrap">
                            {['Sí','No'].map(o => (
                              <label key={o} className={`flex items-center gap-2 cursor-pointer px-3 rounded-xl border transition ${tb ? 'py-2 text-xs' : 'py-1.5 text-xs'}`}
                                style={{ background: form[key] === o ? '#a78bfa' : '#1e2d3d', borderColor: form[key] === o ? '#a78bfa' : '#2a3a4d', color: form[key] === o ? '#000' : '#dde6ef' }}>
                                <input type="radio" name={key} value={o} checked={form[key] === o}
                                  onChange={e => set(key, e.target.value)} className="sr-only" />
                                {o}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className={`font-mono text-[#7a95aa] mb-2 ${tb ? 'text-sm' : 'text-xs'}`}>ADHERENCIA A MEDICAMENTOS/SUPLEMENTOS</p>
                    <select className={inp(tb)} value={form.medication_adherence}
                      onChange={e => set('medication_adherence', e.target.value)}>
                      <option value="">Seleccionar</option>
                      <option>Siempre los toma</option>
                      <option>Casi siempre</option>
                      <option>A veces se le olvida</option>
                      <option>Frecuentemente olvida</option>
                    </select>
                  </div>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { key: 'exp_piel',       label: 'PIEL Y MUCOSAS',  ph: 'Coloración, ictericia, acné...' },
                      { key: 'exp_ojos',       label: 'OJOS',            ph: 'Ictericia escleral, xantelasmas...' },
                      { key: 'exp_boca',       label: 'BOCA',            ph: 'Estado dental, lengua...' },
                      { key: 'exp_tiroides',   label: 'TIROIDES',        ph: 'Palpación, tamaño, nódulos...' },
                      { key: 'exp_abdomen',    label: 'ABDOMEN',         ph: 'Hepatomegalia, masas...' },
                      { key: 'exp_neurologico',label: 'NEUROLÓGICO',     ph: 'Temblor, marcha, reflejos...' },
                    ].map(({ key, label, ph }) => (
                      <Field key={key} label={label} tablet={tb}>
                        <textarea rows={tb ? 5 : 4} maxLength={500} placeholder={ph}
                          value={form[key as keyof typeof form] as string}
                          onChange={e => set(key, e.target.value)}
                          className={`w-full px-3 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] outline-none focus:border-[#a78bfa] transition placeholder-[#3d5870] resize-none ${tb ? 'text-base' : 'text-sm'}`} />
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

                  {/* Subida de archivos */}
                  <div className="bg-[#0d1520] border border-[#a78bfa]/30 rounded-xl p-5">
                    <p className={`font-mono text-[#a78bfa] mb-1 ${tb ? 'text-sm' : 'text-xs'}`}>SUBIR ESTUDIOS</p>
                    <p className="text-xs text-[#3d5870] mb-4">PDF, imágenes o fotos de resultados. Máx. 8 MB por archivo.</p>

                    {/* Input oculto */}
                    <input ref={labInputRef} type="file" multiple
                      accept=".pdf,.doc,.docx,image/*"
                      className="hidden" onChange={handleLabFiles} />

                    {/* Botón subir + zona drop */}
                    <button type="button"
                      onClick={() => labInputRef.current?.click()}
                      className={`w-full border-2 border-dashed border-[#a78bfa]/40 rounded-xl text-[#7a95aa] hover:border-[#a78bfa] hover:text-[#a78bfa] transition flex flex-col items-center justify-center gap-2 ${tb ? 'py-8 text-base' : 'py-6 text-sm'}`}>
                      <span className="text-3xl">📎</span>
                      <span className="font-semibold">Toca para subir archivos</span>
                      <span className="text-xs text-[#3d5870]">PDF, fotos de resultados, imágenes</span>
                    </button>

                    {/* Archivos subidos */}
                    {labFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {labFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-3 bg-[#111820] rounded-lg px-3 py-2.5">
                            <span className="text-xl flex-shrink-0">
                              {f.type.includes('pdf') ? '📄' : f.type.startsWith('image') ? '🖼️' : '📝'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[#dde6ef] truncate ${tb ? 'text-sm' : 'text-xs'}`}>{f.name}</p>
                              <p className="text-[10px] text-[#3d5870]">{(f.size / 1024).toFixed(0)} KB</p>
                            </div>
                            <button type="button"
                              onClick={() => setLabFiles(prev => prev.filter((_, j) => j !== i))}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#1e2d3d] hover:bg-[#f43f5e]/20 text-[#3d5870] hover:text-[#f43f5e] transition text-base">
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* URL como alternativa */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="O PEGA UNA URL DE DRIVE / CLOUD" tablet={tb}>
                      <input type="url" className={inp(tb)} placeholder="https://drive.google.com/..."
                        value={form.labs_pdf_url} onChange={e => set('labs_pdf_url', e.target.value)} />
                    </Field>
                    <Field label="NOTAS SOBRE LOS LABORATORIOS" tablet={tb}>
                      <textarea rows={tb ? 4 : 3} className={`w-full px-3 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] outline-none focus:border-[#a78bfa] transition placeholder-[#3d5870] resize-none ${tb ? 'text-base' : 'text-sm'}`}
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
                      {dolores.length > 0    && <p>🤕 {dolores.length} dolencia{dolores.length > 1 ? 's' : ''} registrada{dolores.length > 1 ? 's' : ''}</p>}
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
