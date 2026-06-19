'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import NoteThread, { Note } from '@/app/components/NoteThread';
import { useDoctorProfile } from '@/app/lib/useDoctorProfile';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Familiar  = 'padre' | 'madre' | 'hermanos';
type Enfermedad =
  | 'diabetes' | 'hipertension' | 'cancer' | 'cardiopatia'
  | 'autoinmune' | 'alergia_alimentaria' | 'neuro_psiquiatrica'
  | 'metabolica' | 'tiroidea' | 'intestinal' | 'migrana_fibromialgia' | 'trombofilia';

const FAMILIARES: { key: Familiar; label: string }[] = [
  { key: 'padre', label: 'Padre' },
  { key: 'madre', label: 'Madre' },
  { key: 'hermanos', label: 'Hermano(s)' },
];
const ENFERMEDADES: { key: Enfermedad; label: string }[] = [
  { key: 'diabetes',             label: 'Diabetes' },
  { key: 'hipertension',         label: 'Hipertensión' },
  { key: 'cancer',               label: 'Cáncer' },
  { key: 'cardiopatia',          label: 'Cardiopatía' },
  { key: 'autoinmune',           label: 'Autoinmune (lupus, AR, Hashimoto, psoriasis, EM, celiaquía, Crohn/colitis)' },
  { key: 'alergia_alimentaria',  label: 'Alergia / intolerancia alimentaria (gluten, lactosa, frutos secos, mariscos)' },
  { key: 'neuro_psiquiatrica',   label: 'Neurológica / psiquiátrica (depresión, ansiedad, Alzheimer, Parkinson, TDAH, bipolaridad)' },
  { key: 'metabolica',           label: 'Trastorno del metabolismo (gota, Wilson, hemocromatosis, hipercolesterolemia familiar)' },
  { key: 'tiroidea',             label: 'Tiroidea (hipo/hipertiroidismo, Hashimoto, Graves)' },
  { key: 'intestinal',           label: 'Intestinal (Crohn, colitis ulcerosa, SII, celiaquía)' },
  { key: 'migrana_fibromialgia', label: 'Migraña o fibromialgia' },
  { key: 'trombofilia',          label: 'Trombosis / embolias / trombofilia / abortos recurrentes' },
];
const SOURCES = [
  'Recomendación de paciente','Recomendación de médico','Redes sociales',
  'Búsqueda en internet','Página web','Google Maps','Otro',
];
const ANIMO_OPTS     = ['Estable','Ansioso','Irritable','Triste','Sin motivación','Bien','Otro'];
const DIGESTION_OPTS = ['Sin problemas','Distensión','Estreñimiento','Diarrea','Reflujo','Náuseas','Otro'];
const ORINA_COLORS   = [
  { label:'Muy pálido',        hex:'#FFF9C4', text:'Bien hidratado'      },
  { label:'Amarillo pálido',   hex:'#FFF176', text:'Hidratación normal'  },
  { label:'Amarillo',          hex:'#FFD600', text:'Hidratación aceptable'},
  { label:'Amarillo intenso',  hex:'#F9A825', text:'Poca hidratación'    },
  { label:'Naranja',           hex:'#E65100', text:'Deshidratación'      },
  { label:'Naranja oscuro',    hex:'#BF360C', text:'Alerta — evaluar'    },
];

// ─── Componentes reutilizables ───────────────────────────────────────────────
const inp   = 'w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded text-[#dde6ef] text-sm outline-none placeholder-[#3d5870]';
const fBlue = 'focus:border-[#0ea5e9]';
const fOrng = 'focus:border-[#f97316]';
const fPurp = 'focus:border-[#a78bfa]';
const fGrn  = 'focus:border-[#00e5a0]';

const Field = ({ label, required = false, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) => (
  <div>
    <label className="text-xs font-mono text-[#7a95aa] mb-1.5 block">
      {label}{required && <span className="text-[#f43f5e] ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-[#3d5870] mt-1">{hint}</p>}
  </div>
);

const Card = ({ title, icon, color, children }: {
  title: string; icon: string; color: string; children: React.ReactNode;
}) => (
  <div className="bg-[#0d1520] rounded-xl p-6 mb-4" style={{ border: `1px solid ${color}33` }}>
    <h2 className="text-base font-semibold text-[#dde6ef] mb-5 flex items-center gap-2">
      <span>{icon}</span>{title}
    </h2>
    {children}
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
      className="w-full" />
  </div>
);

const calcIMC = (peso: string, talla: string) => {
  const w = parseFloat(peso), h = parseFloat(talla) / 100;
  if (!w || !h) return null;
  return (w / (h * h)).toFixed(1);
};

const calcAge = (dob: string) => {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
};

// ─── FASES CONFIG ────────────────────────────────────────────────────────────
const PHASE_CONFIG = {
  1: { color: '#0ea5e9', label: '🟦 RECEPCIÓN',   title: 'Datos generales del paciente', roleKey: 'receptionist' },
  2: { color: '#f97316', label: '🟨 ENFERMERÍA',  title: 'Historia clínica + Primera visita', roleKey: 'nurse' },
  3: { color: '#a78bfa', label: '🟣 MÉDICO',      title: 'Historia clínica privada + Cierre de visita', roleKey: 'doctor' },
};

// ─── PAGE ────────────────────────────────────────────────────────────────────
function FlowPageInner() {
  const router     = useRouter();
  const { displayName: docName } = useDoctorProfile();
  const [user, setUser]         = useState<any>(null);
  const [token, setToken]       = useState<string | null>(null);
  const [pendingNote, setPendingNote] = useState('');
  const [loading, setLoading]   = useState(true);
  const [phase, setPhase]       = useState(1);
  const [saving, setSaving]     = useState(false);

  // ID del paciente una vez guardada la Fase 1
  const [patientId, setPatientId] = useState<string | null>(null);
  // ID de la visita creada en Fase 2
  const [visitId, setVisitId]     = useState<string | null>(null);
  // Notas del hilo (actualizadas en tiempo real)
  const [notes, setNotes]         = useState<Note[]>([]);
  // Verificación de duplicados
  const [dupCandidates, setDupCandidates] = useState<any[]>([]);
  const [dupDismissed,  setDupDismissed]  = useState(false);
  // Modo edición (paciente ya existente cargado desde URL)
  const [isEditMode, setIsEditMode] = useState(false);

  // ── Estado heredofamiliar ────────────────────────────────────────────────
  type FamilyRow = Record<Enfermedad, boolean> & { otra: string; vivo: boolean; causa_muerte: string; edad_muerte: string; };
  const emptyFamily = (): FamilyRow => ({
    diabetes: false, hipertension: false, cancer: false, cardiopatia: false,
    autoinmune: false, alergia_alimentaria: false, neuro_psiquiatrica: false,
    metabolica: false, tiroidea: false, intestinal: false, migrana_fibromialgia: false, trombofilia: false,
    otra: '', vivo: true, causa_muerte: '', edad_muerte: '',
  });
  const [family, setFamily] = useState<Record<Familiar, FamilyRow>>({ padre: emptyFamily(), madre: emptyFamily(), hermanos: emptyFamily() });

  // ── Medicamentos ─────────────────────────────────────────────────────────
  const [meds, setMeds] = useState<Array<{ nombre:string; dosis:string; frecuencia:string; adherencia:string; desde:string; }>>([]);

  // ── Fuentes de llegada ───────────────────────────────────────────────────
  const [sources, setSources] = useState<string[]>([]);

  // ── Multi-selects visita ─────────────────────────────────────────────────
  const [animo,       setAnimo]       = useState<string[]>([]);
  const [digestion,   setDigestion]   = useState<string[]>([]);
  const [alcoholTipo, setAlcoholTipo] = useState<string[]>([]);  // cerveza/vino/destilados

  // ── Archivos de laboratorio ───────────────────────────────────────────────
  type LabFile = { name: string; type: string; size: number; data: string };
  const [labFiles, setLabFiles] = useState<LabFile[]>([]);
  const labFileInputRef = useRef<HTMLInputElement>(null);

  // ── Formulario principal ─────────────────────────────────────────────────
  const [f, setF] = useState({
    // FASE 1 — Recepción
    first_name: '', last_name: '', date_of_birth: '', occupation: '', city: '',
    email: '', phone: '', phone_landline: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    emergency_contact_email: '', emergency_contact_relationship: '',
    referred_by: '', referred_type: '', referred_other: '',
    social_network: '',
    prev_redes: false, prev_web: false, prev_gmaps: false,

    // FASE 2 — Enfermería: Antecedentes
    chronic_diseases: '', surgeries: '', hospitalizations: '',
    fractures: '', transfusions: '', childhood_diseases: '',
    allergies_medications: '', allergies_foods: '', allergies_environmental: '',
    med_notas: '',

    // FASE 2 — Enfermería: Antecedentes lejanos (medicina funcional)
    childhood_infections: '', childhood_antibiotics: '',
    toxic_exposure_occupational: '', dental_amalgams: '',
    tattoos_piercings: '', childhood_residence_exposure: '',
    secondhand_smoke_exposure: '',
    smoking_status: '', smoking_since: '', smoking_years: '',
    alcohol_status: '', alcohol_cantidad: '',
    actividad_si: false,

    // FASE 2 — Visita: Signos vitales
    // (antecedentes ya arriba)
    pa_der_sistolica: '', pa_der_diastolica: '',
    pa_izq_sistolica: '', pa_izq_diastolica: '',
    pa_brazo_mayor: '', fc: '', temperatura: '', spo2: '',
    glucosa: '', glucosa_ayuno: '', ecg_realizado: false,

    // FASE 2 — Visita: Composición corporal
    peso: '', talla: '', circ_abdominal: '', circ_cintura: '', circ_cadera: '',
    circ_cuello: '', circ_biceps: '', circ_muneca: '',
    inbody_grasa: '', inbody_musculo: '', inbody_agua: '', inbody_visceral: '',
    actividad_tipo: '', actividad_frecuencia: '', actividad_intensidad: '',

    // FASE 2 — Visita: Pruebas funcionales
    fuerza_mano_der: '', fuerza_mano_izq: '',
    marcha_4m: '', equilibrio_seg: '', sentarse_levantarse: '',

    // FASE 3 — Médico: Historia privada
    sexo_biologico: '', genero_identidad: '',
    sust_recreativas: '', libido_basal: '5', salud_sexual_notas: '',
    dx_psiquiatrico: '', med_psiquiatrica: '', trauma_relevante: '',
    // Reproductiva femenina
    menarca_age: '', ciclos_regulares: '', pregnancies: '', births: '', miscarriages: '',
    menopausal_tipo: '', menopausal_age: '', contraceptive: '',
    pap_ultimo: '', masto_ultima: '', colpo_ultima: '',
    // Reproductiva masculina
    erectile_dysfunction: '', testosterone_use: '', testosterone_detalle: '',
    children: '', psa_ultimo: '', psa_valor: '',

    // FASE 3 — Visita: Motivo de consulta (idéntico a visitas posteriores)
    motivo_visita: '', motivo_intensidad: 5, motivo_desde: '',
    motivo_primera_vez: '', cambios_meds: '',

    // FASE 3 — Visita: Reporte subjetivo (idéntico a visitas posteriores)
    energia_manana: 5, energia_mediodia: 5, energia_tarde: 5,
    sueno_calidad: 5, sueno_horas: '', sueno_reparador: '',
    libido_hoy: 5, orina_color: '', orina_color_tarde: '',

    // FASE 3 — Visita: Exploración clínica (idéntico a visitas posteriores)
    exp_general: '', ecg_interpretacion: '',
    exp_piel: '', exp_ojos: '', exp_boca: '',
    exp_tiroides: '', exp_abdomen: '', exp_neurologico: '', exp_otros: '',
    img_tipo: '', img_interpretacion: '',
    cognitivo_realizado: false, cognitivo_palabras: '',
    cognitivo_reloj: '', cognitivo_notas: '',

    // FASE 3 — Visita: Labs
    lab_notas: '',
  });

  // Dolencias — el paciente puede tener varias simultáneas (idéntico a visitas posteriores)
  type Dolor = { ubicacion: string; intensidad: number };
  const [dolores, setDolores] = useState<Dolor[]>([]);
  const addDolor    = () => setDolores(prev => [...prev, { ubicacion: '', intensidad: 5 }]);
  const removeDolor = (i: number) => setDolores(prev => prev.filter((_, j) => j !== i));
  const updateDolor = (i: number, field: keyof Dolor, value: string | number) =>
    setDolores(prev => prev.map((d, j) => j === i ? { ...d, [field]: value } : d));

  const set = (field: string, value: any) => setF(prev => ({ ...prev, [field]: value }));

  const searchParams = useSearchParams();

  // ── Scroll suave al top en cada cambio de fase ──
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase]);

  useEffect(() => {
    const init = async () => {
      const u = await getUser();
      if (!u) { router.push('/auth/login'); return; }
      setUser(u);
      const session = await getSession();
      const t = session?.access_token || null;
      setToken(t);
      const authHeader: Record<string, string> = t ? { Authorization: `Bearer ${t}` } : {};

      // Retomar registro de paciente existente
      const pid = searchParams.get('patient_id');
      const ph  = parseInt(searchParams.get('phase') || '1');
      if (pid) {
        setPatientId(pid);
        setIsEditMode(true); // vino de "Editar" — permite saltar fases libremente
        if (ph >= 2 && ph <= 3) setPhase(ph);

        // ── Cargar datos del paciente desde la DB ─────────────────────────────
        try {
          const patRes = await fetch(`${B()}/patients/${pid}`, { headers: authHeader });
          const p = await patRes.json();
          if (p && !p.detail) {
            setF(prev => ({
              ...prev,
              // Fase 1 — Recepción
              first_name:                     p.first_name                    || '',
              last_name:                      p.last_name                     || '',
              date_of_birth:                  p.date_of_birth || p.birth_date || '',
              occupation:                     p.occupation                    || '',
              city:                           p.city                          || '',
              email:                          p.email                         || '',
              phone:                          p.phone                         || '',
              phone_landline:                 p.phone_landline                || '',
              emergency_contact_name:         p.emergency_contact_name        || '',
              emergency_contact_phone:        p.emergency_contact_phone       || '',
              emergency_contact_email:        p.emergency_contact_email       || '',
              emergency_contact_relationship: p.emergency_contact_relationship|| '',
              referred_by:                    p.referred_by                   || '',
              referred_type:                  p.referred_type                 || '',
              referred_other:                 p.referred_other                || '',
              social_network:                 p.social_network                || '',
              prev_redes:                     p.prev_redes                    ?? false,
              prev_web:                       p.prev_web                      ?? false,
              prev_gmaps:                     p.prev_gmaps                    ?? false,
              // Fase 2 — Antecedentes
              chronic_diseases:               p.chronic_diseases              || '',
              surgeries:                      p.surgeries                     || '',
              hospitalizations:               p.hospitalizations              || '',
              fractures:                      p.fractures                     || '',
              transfusions:                   p.transfusions                  || '',
              childhood_diseases:             p.childhood_diseases            || '',
              allergies_medications:          p.allergies_medications         || '',
              allergies_foods:                p.allergies_foods               || '',
              allergies_environmental:        p.allergies_environmental       || '',
              med_notas:                      p.med_notas                     || '',
              childhood_infections:           p.childhood_infections          || '',
              childhood_antibiotics:          p.childhood_antibiotics         || '',
              toxic_exposure_occupational:    p.toxic_exposure_occupational   || '',
              dental_amalgams:                p.dental_amalgams               || '',
              tattoos_piercings:              p.tattoos_piercings             || '',
              childhood_residence_exposure:   p.childhood_residence_exposure  || '',
              secondhand_smoke_exposure:      p.secondhand_smoke_exposure     || '',
              smoking_status:                 p.smoking_status                || '',
              smoking_since:                  p.smoking_since                 || '',
              smoking_years:                  p.smoking_years                 || '',
              alcohol_status:                 p.alcohol_status                || '',
              alcohol_cantidad:               p.alcohol_cantidad              || '',
              // Fase 3 — Médico
              sexo_biologico:                 p.sexo_biologico                || '',
              genero_identidad:               p.genero_identidad              || '',
              sust_recreativas:               p.sust_recreativas              || '',
              libido_basal:                   p.libido_basal                  || '5',
              salud_sexual_notas:             p.salud_sexual_notas            || '',
              dx_psiquiatrico:                p.dx_psiquiatrico               || '',
              med_psiquiatrica:               p.med_psiquiatrica              || '',
              trauma_relevante:               p.trauma_relevante              || '',
              menarca_age:                    p.menarca_age                   || '',
              ciclos_regulares:               p.ciclos_regulares              || '',
              pregnancies:                    p.pregnancies                   || '',
              births:                         p.births                        || '',
              miscarriages:                   p.miscarriages                  || '',
              menopausal_tipo:                p.menopausal_tipo               || '',
              menopausal_age:                 p.menopausal_age                || '',
              contraceptive:                  p.contraceptive                 || '',
              pap_ultimo:                     p.pap_ultimo                    || '',
              masto_ultima:                   p.masto_ultima                  || '',
              colpo_ultima:                   p.colpo_ultima                  || '',
              erectile_dysfunction:           p.erectile_dysfunction          || '',
              testosterone_use:               p.testosterone_use              || '',
              testosterone_detalle:           p.testosterone_detalle          || '',
              children:                       p.children                      || '',
              psa_ultimo:                     p.psa_ultimo                    || '',
              psa_valor:                      p.psa_valor                     || '',
            }));
            // Arrays y objetos separados
            if (Array.isArray(p.sources_of_contact)) setSources(p.sources_of_contact);
            if (Array.isArray(p.alcohol_tipo))        setAlcoholTipo(p.alcohol_tipo);
            if (Array.isArray(p.medications))         setMeds(p.medications);
            if (p.family_history_table && typeof p.family_history_table === 'object')
              setFamily(prev => ({ ...prev, ...p.family_history_table }));
          }
        } catch (_) {}

        // ── Cargar visita más reciente para pre-rellenar fase 2/3 ─────────────
        try {
          const vRes = await fetch(`${B()}/visits/${pid}`, { headers: authHeader });
          const vData = await vRes.json();
          const visits = vData.visits || [];
          if (visits.length > 0) {
            const v = visits[0]; // más reciente
            setVisitId(v.id);
            const str = (val: any) => val != null ? String(val) : '';
            const num = (val: any, def = 5) => val != null ? Number(val) : def;
            setF(prev => ({
              ...prev,
              // Signos vitales
              pa_der_sistolica:  str(v.pa_der_sistolica),
              pa_der_diastolica: str(v.pa_der_diastolica),
              pa_izq_sistolica:  str(v.pa_izq_sistolica),
              pa_izq_diastolica: str(v.pa_izq_diastolica),
              pa_brazo_mayor:    str(v.pa_brazo_mayor),
              fc:                str(v.fc),
              temperatura:       str(v.temperatura),
              spo2:              str(v.spo2),
              glucosa:           str(v.glucosa),
              glucosa_ayuno:     str(v.glucosa_ayuno),
              ecg_realizado:     v.ecg_realizado ?? false,
              // Composición corporal
              peso:           str(v.peso),
              talla:          str(v.talla),
              circ_abdominal: str(v.circ_abdominal),
              circ_cintura:   str(v.circ_cintura),
              circ_cadera:    str(v.circ_cadera),
              circ_cuello:    str(v.circ_cuello),
              circ_biceps:    str(v.circ_biceps),
              circ_muneca:    str(v.circ_muneca),
              inbody_grasa:   str(v.inbody_grasa),
              inbody_musculo: str(v.inbody_musculo),
              inbody_agua:    str(v.inbody_agua),
              inbody_visceral:str(v.inbody_visceral),
              actividad_si:          v.actividad_si ?? false,
              actividad_tipo:        str(v.actividad_tipo),
              actividad_frecuencia:  str(v.actividad_frecuencia),
              actividad_intensidad:  str(v.actividad_intensidad),
              // Pruebas funcionales
              fuerza_mano_der:    str(v.fuerza_mano_der),
              fuerza_mano_izq:    str(v.fuerza_mano_izq),
              marcha_4m:          str(v.marcha_4m),
              equilibrio_seg:     str(v.equilibrio_seg),
              sentarse_levantarse:str(v.sentarse_levantarse),
              // Fase 3 — Motivo de consulta
              motivo_visita:      str(v.visit_reason),
              motivo_intensidad:  num(v.discomfort_intensity),
              motivo_desde:       str(v.symptom_since),
              motivo_primera_vez: str(v.first_time),
              cambios_meds:       str(v.medication_changes),
              // Fase 3 — Reporte subjetivo
              energia_manana:    num(v.energy_morning),
              energia_mediodia:  num(v.energy_noon),
              energia_tarde:     num(v.energy_evening),
              sueno_calidad:     num(v.sleep_quality),
              sueno_horas:       str(v.sleep_hours),
              sueno_reparador:   str(v.wakes_rested),
              libido_hoy:        num(v.libido),
              orina_color:       str(v.urine_color),
              orina_color_tarde: str(v.urine_color_afternoon),
              // Fase 3 — Exploración clínica
              exp_general:        str(v.general_inspection),
              ecg_interpretacion: str(v.ecg_interpretation),
              exp_piel:           str(v.skin_findings),
              exp_ojos:           str(v.eye_findings),
              exp_boca:           str(v.mouth_findings),
              exp_tiroides:       str(v.thyroid_findings),
              exp_abdomen:        str(v.abdomen_findings),
              exp_neurologico:    str(v.neuro_findings),
              exp_otros:          str(v.other_findings),
              img_tipo:           str(v.imaging_type),
              img_interpretacion: str(v.imaging_findings),
              cognitivo_realizado: v.minicog_done ?? false,
              cognitivo_palabras: str(v.minicog_words),
              cognitivo_reloj:    str(v.minicog_clock),
              cognitivo_notas:    str(v.minicog_notes),
              // Fase 3 — Labs
              lab_notas: str(v.labs_notes),
            }));
            if (Array.isArray(v.mood))      setAnimo(v.mood);
            if (Array.isArray(v.digestion)) setDigestion(v.digestion);
            if (Array.isArray(v.pains) && v.pains.length > 0) setDolores(v.pains);
            if (Array.isArray(v.labs_files)) setLabFiles(v.labs_files);
          }
        } catch (_) {}

        // Cargar notas existentes
        try {
          const nRes = await fetch(`${B()}/patients/${pid}/notes`, { headers: authHeader });
          const nData = await nRes.json();
          setNotes(nData.notes || []);
        } catch (_) {}
      }

      setLoading(false);
    };
    init();
  }, []);

  // ── Detección de duplicados en tiempo real (Fase 1) ─────────────────────
  useEffect(() => {
    // Solo aplica en fase 1, cuando aún no hay patientId (registro nuevo)
    if (phase !== 1 || patientId) return;
    const { first_name, last_name, date_of_birth } = f;
    if (!first_name.trim() || !last_name.trim() || !date_of_birth) {
      setDupCandidates([]);
      return;
    }
    setDupDismissed(false); // reset al cambiar datos
    const timer = setTimeout(async () => {
      try {
        const authH: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const params = new URLSearchParams({ first_name: first_name.trim(), last_name: last_name.trim(), date_of_birth });
        const res = await fetch(`${B()}/patients/check-duplicate?${params}`, { headers: authH });
        const data = await res.json();
        setDupCandidates(data.duplicates || []);
      } catch { /* silencioso */ }
    }, 700); // 700ms debounce
    return () => clearTimeout(timer);
  }, [f.first_name, f.last_name, f.date_of_birth, phase, patientId, token]);

  // ── Helpers familia / medicamentos / fuentes ──────────────────────────────
  const toggleFamily = (fam: Familiar, enf: Enfermedad) =>
    setFamily(p => ({ ...p, [fam]: { ...p[fam], [enf]: !p[fam][enf] } }));
  const setFamField = (fam: Familiar, field: keyof FamilyRow, val: any) =>
    setFamily(p => ({ ...p, [fam]: { ...p[fam], [field]: val } }));

  const addMed   = () => setMeds(p => [...p, { nombre:'', dosis:'', frecuencia:'', adherencia:'', desde:'' }]);
  const setMed   = (i: number, k: string, v: string) => setMeds(p => p.map((m, idx) => idx===i ? {...m, [k]: v} : m));
  const removeMed = (i: number) => setMeds(p => p.filter((_,idx) => idx!==i));

  const toggleSource = (s: string) => setSources(prev => {
    const EXCLUSIVE = ['Recomendación de paciente', 'Recomendación de médico'];
    if (EXCLUSIVE.includes(s)) {
      // Solo uno puede estar seleccionado a la vez
      if (prev.includes(s)) return prev.filter(x => x !== s);
      return [...prev.filter(x => !EXCLUSIVE.includes(x)), s];
    }
    return prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s];
  });
  const toggleMulti  = (arr: string[], set: Function, v: string) =>
    set((p: string[]) => p.includes(v) ? p.filter(x=>x!==v) : [...p,v]);

  const handleLabFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`"${file.name}" supera 5 MB — adjunta un archivo más pequeño.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        setLabFiles(prev => [...prev, { name: file.name, type: file.type, size: file.size, data }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // ── GUARDAR FASE 1 ── paciente mínimo en DB ───────────────────────────────
  const savePhase1 = async () => {
    if (!f.first_name || !f.last_name || !f.date_of_birth) {
      alert('Nombre, apellidos y fecha de nacimiento son requeridos.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        first_name: f.first_name, last_name: f.last_name,
        full_name: `${f.first_name} ${f.last_name}`.trim(),
        date_of_birth: f.date_of_birth, birth_date: f.date_of_birth,
        occupation: f.occupation, city: f.city,
        email: f.email, phone: f.phone, phone_landline: f.phone_landline,
        emergency_contact_name: f.emergency_contact_name,
        emergency_contact_phone: f.emergency_contact_phone,
        emergency_contact_email: f.emergency_contact_email,
        emergency_contact_relationship: f.emergency_contact_relationship,
        referred_by: f.referred_by, referred_type: f.referred_type,
        prev_redes: f.prev_redes, prev_web: f.prev_web, prev_gmaps: f.prev_gmaps,
        sources_of_contact: sources,
        referred_other: f.referred_other,
        social_network: f.social_network,
        registration_phase: 'reception',
        phases_completed: ['receptionist'],
      };
      const authH: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) authH['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${B()}/patients/`, {
        method: 'POST',
        headers: authH,
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Error'); }
      const data = await res.json();
      const newId = data.id;
      setPatientId(newId);
      // Actualizar URL para que un reload conserve el progreso
      router.replace(`/dashboard/new-patient/flow?patient_id=${newId}&phase=2`);

      // Guardar nota pendiente si la hay
      if (pendingNote.trim()) {
        try {
          const noteRes = await fetch(`${B()}/patients/${newId}/notes`, {
            method: 'POST',
            headers: authH,
            body: JSON.stringify({
              content: pendingNote.trim(),
              author_role: 'receptionist',
              author_name: docName,
            }),
          });
          if (noteRes.ok) {
            const noteData = await noteRes.json();
            setNotes([noteData]);
          }
        } catch (_) {}
        setPendingNote('');
      }

      setPhase(2);
    } catch (e: any) {
      alert('Error al guardar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── GUARDAR FASE 2 ── antecedentes + visita (signos, composición, funcional, subjetivo) ──
  const savePhase2 = async () => {
    if (!patientId) return;
    setSaving(true);
    try {
      const imc = calcIMC(f.peso, f.talla);
      const age  = calcAge(f.date_of_birth);

      const authH2: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) authH2['Authorization'] = `Bearer ${token}`;
      // 2a: Actualizar paciente con antecedentes
      await fetch(`${B()}/patients/${patientId}`, {
        method: 'PUT',
        headers: authH2,
        body: JSON.stringify({
          chronic_diseases: f.chronic_diseases, surgeries: f.surgeries,
          hospitalizations: f.hospitalizations, fractures: f.fractures,
          transfusions: f.transfusions, childhood_diseases: f.childhood_diseases,
          allergies_medications: f.allergies_medications, allergies_foods: f.allergies_foods,
          allergies_environmental: f.allergies_environmental, med_notas: f.med_notas,
          childhood_infections: f.childhood_infections, childhood_antibiotics: f.childhood_antibiotics,
          toxic_exposure_occupational: f.toxic_exposure_occupational, dental_amalgams: f.dental_amalgams,
          tattoos_piercings: f.tattoos_piercings, childhood_residence_exposure: f.childhood_residence_exposure,
          secondhand_smoke_exposure: f.secondhand_smoke_exposure,
          smoking_status: f.smoking_status,
          smoking_since: f.smoking_since, smoking_years: f.smoking_years,
          alcohol_status: f.alcohol_status, alcohol_tipo: alcoholTipo,
          alcohol_cantidad: f.alcohol_cantidad,
          medications: meds, family_history_table: family,
          registration_phase: 'nursing',
          phases_completed: ['receptionist', 'nurse'],
        }),
      });

      // 2b: Crear o actualizar visita
      const visitPayload = {
        patient_id: patientId,
        visit_type: 'first_visit',
        // Signos vitales
        pa_der_sistolica: f.pa_der_sistolica, pa_der_diastolica: f.pa_der_diastolica,
        pa_izq_sistolica: f.pa_izq_sistolica, pa_izq_diastolica: f.pa_izq_diastolica,
        pa_brazo_mayor: f.pa_brazo_mayor, fc: f.fc, temperatura: f.temperatura,
        spo2: f.spo2, glucosa: f.glucosa, glucosa_ayuno: f.glucosa_ayuno,
        ecg_realizado: f.ecg_realizado,
        // Composición
        peso: f.peso, talla: f.talla, imc: imc || '',
        circ_abdominal: f.circ_abdominal, circ_cintura: f.circ_cintura, circ_cadera: f.circ_cadera,
        circ_cuello: f.circ_cuello, circ_biceps: f.circ_biceps, circ_muneca: f.circ_muneca,
        inbody_grasa: f.inbody_grasa, inbody_musculo: f.inbody_musculo,
        inbody_agua: f.inbody_agua, inbody_visceral: f.inbody_visceral,
        actividad_si: f.actividad_si,
        actividad_tipo: f.actividad_tipo, actividad_frecuencia: f.actividad_frecuencia,
        actividad_intensidad: f.actividad_intensidad,
        // Funcional
        fuerza_mano_der: f.fuerza_mano_der, fuerza_mano_izq: f.fuerza_mano_izq,
        marcha_4m: f.marcha_4m, equilibrio_seg: f.equilibrio_seg,
        sentarse_levantarse: f.sentarse_levantarse,
        status: 'nursing_done',
      };

      let savedVisitId = visitId;
      if (visitId) {
        // Ya existe visita — actualizar
        const vRes = await fetch(`${B()}/visits/${visitId}`, {
          method: 'PUT',
          headers: authH2,
          body: JSON.stringify(visitPayload),
        });
        if (!vRes.ok) {
          const errBody = await vRes.json().catch(() => ({}));
          throw new Error(errBody.detail || `HTTP ${vRes.status}`);
        }
      } else {
        // No hay visita aún — crear
        const vRes = await fetch(`${B()}/visits/`, {
          method: 'POST',
          headers: authH2,
          body: JSON.stringify(visitPayload),
        });
        if (!vRes.ok) {
          const errBody = await vRes.json().catch(() => ({}));
          throw new Error(errBody.detail || `HTTP ${vRes.status}`);
        }
        const vData = await vRes.json();
        savedVisitId = vData.id || vData.visit_id;
        setVisitId(savedVisitId);
      }
      // Actualizar URL para que un reload conserve el progreso
      router.replace(`/dashboard/new-patient/flow?patient_id=${patientId}&phase=3`);
      setPhase(3);
    } catch (e: any) {
      console.error('Fase 2 error:', e);
      alert('Error en Fase 2: ' + (e.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  // ── GUARDAR FASE 3 ── datos médico + cierre de visita ────────────────────
  const savePhase3 = async () => {
    if (!f.sexo_biologico) {
      alert('El sexo biológico es requerido para el análisis de la IA.');
      return;
    }
    if (!patientId) return;
    setSaving(true);
    const authH3: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) authH3['Authorization'] = `Bearer ${token}`;
    try {
      // 3a: Actualizar paciente con datos del médico
      await fetch(`${B()}/patients/${patientId}`, {
        method: 'PUT',
        headers: authH3,
        body: JSON.stringify({
          sexo_biologico: f.sexo_biologico, genero_identidad: f.genero_identidad,
          sust_recreativas: f.sust_recreativas, libido_basal: f.libido_basal,
          salud_sexual_notas: f.salud_sexual_notas,
          dx_psiquiatrico: f.dx_psiquiatrico, med_psiquiatrica: f.med_psiquiatrica,
          trauma_relevante: f.trauma_relevante,
          menarca_age: f.menarca_age, ciclos_regulares: f.ciclos_regulares,
          pregnancies: f.pregnancies, births: f.births, miscarriages: f.miscarriages,
          menopausal_tipo: f.menopausal_tipo, menopausal_age: f.menopausal_age,
          contraceptive: f.contraceptive, pap_ultimo: f.pap_ultimo,
          masto_ultima: f.masto_ultima, colpo_ultima: f.colpo_ultima,
          erectile_dysfunction: f.erectile_dysfunction,
          testosterone_use: f.testosterone_use, testosterone_detalle: f.testosterone_detalle,
          children: f.children, psa_ultimo: f.psa_ultimo, psa_valor: f.psa_valor,
          registration_phase: 'complete',
          phases_completed: ['receptionist', 'nurse', 'doctor'],
        }),
      });

      // 3b: Actualizar visita con motivo + reporte subjetivo + exploración
      // Mismas columnas reales de DB que usa la visita de seguimiento (new-visit.tsx),
      // para que la IA siempre lea de las mismas claves sin importar el tipo de visita.
      const sh = (val: string) => val && val.trim() !== '' ? val.trim() : 'Sin hallazgos';
      if (visitId) {
        const vRes3 = await fetch(`${B()}/visits/${visitId}`, {
          method: 'PUT',
          headers: authH3,
          body: JSON.stringify({
            // Motivo de consulta
            visit_reason: f.motivo_visita, discomfort_intensity: f.motivo_intensidad,
            symptom_since: f.motivo_desde, first_time: f.motivo_primera_vez,
            medication_changes: f.cambios_meds,
            pain_today: dolores.length > 0,
            pain_location: dolores[0]?.ubicacion || '', pain_intensity: dolores[0]?.intensidad ?? null,
            pains: dolores,
            // Reporte subjetivo
            energy_morning: f.energia_manana, energy_noon: f.energia_mediodia,
            energy_evening: f.energia_tarde, sleep_quality: f.sueno_calidad,
            sleep_hours: f.sueno_horas, wakes_rested: f.sueno_reparador,
            mood: animo, libido: f.libido_hoy, digestion,
            urine_color: f.orina_color, urine_color_afternoon: f.orina_color_tarde,
            // Exploración clínica
            general_inspection: sh(f.exp_general), ecg_interpretation: f.ecg_interpretacion,
            skin_findings: sh(f.exp_piel), eye_findings: sh(f.exp_ojos),
            mouth_findings: sh(f.exp_boca), thyroid_findings: sh(f.exp_tiroides),
            abdomen_findings: sh(f.exp_abdomen), neuro_findings: sh(f.exp_neurologico),
            other_findings: f.exp_otros, imaging_type: f.img_tipo,
            imaging_findings: f.img_interpretacion, minicog_done: f.cognitivo_realizado,
            minicog_words: f.cognitivo_palabras, minicog_clock: f.cognitivo_reloj,
            minicog_notes: f.cognitivo_notas,
            // Labs
            labs_notes: f.lab_notas && f.lab_notas.trim() !== '' ? f.lab_notas : 'Sin laboratorios recientes',
            labs_files: labFiles.map(lf => ({ name: lf.name, type: lf.type, size: lf.size, data: lf.data })),
            status: 'complete',
          }),
        });
        if (!vRes3.ok) {
          const errBody = await vRes3.json().catch(() => ({}));
          throw new Error(errBody.detail || `HTTP ${vRes3.status}`);
        }
      }

      // Redirigir al análisis de IA si hay visitId, o a la ficha si no
      if (visitId) {
        router.push(`/dashboard/patient/${patientId}/visit/${visitId}/analysis`);
      } else {
        router.push(`/dashboard/patient/${patientId}`);
      }
    } catch (e: any) {
      console.error('Fase 3 error:', e);
      alert('Error en Fase 3: ' + (e.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">Cargando...</div>;

  const pc  = PHASE_CONFIG[phase as 1|2|3];
  const age = calcAge(f.date_of_birth);
  const imc = calcIMC(f.peso, f.talla);

  // Banner paciente guardado
  const PatientBadge = () => patientId ? (
    <div className="bg-[#00e5a0]/10 border border-[#00e5a0]/30 rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
      <span className="text-[#00e5a0] text-lg">✓</span>
      <div>
        <p className="text-sm font-semibold text-[#00e5a0]">
          {f.first_name} {f.last_name} — guardado en sistema
        </p>
        <p className="text-xs text-[#3d5870] font-mono">{patientId}</p>
      </div>
    </div>
  ) : null;

  return (
    <div className="bg-[#070a0e] min-h-screen">

      <main className="pt-16 min-h-screen">
        <div className="max-w-3xl mx-auto px-4 py-8 pb-36">

          {/* Stepper */}
          <div className="flex gap-2 mb-2">
            {([1,2,3] as const).map(p => {
              const cfg = PHASE_CONFIG[p];
              const done = p < phase;
              const active = p === phase;
              const canClick = p < phase || isEditMode; // en modo edición, todas accesibles
              return (
                <button key={p}
                  onClick={() => { if (canClick) setPhase(p); }}
                  disabled={!canClick}
                  className="flex-1 py-2.5 rounded-lg text-xs font-bold transition-all disabled:cursor-not-allowed"
                  style={{
                    background: active ? cfg.color : (done || isEditMode) ? cfg.color + '44' : '#1e2d3d',
                    color: active || done || isEditMode ? '#000' : '#7a95aa',
                    opacity: !canClick ? 0.4 : 1,
                  }}>
                  {done ? '✓ ' : ''}{p === 1 ? 'Recepción' : p === 2 ? 'Enfermería' : 'Médico'}
                </button>
              );
            })}
          </div>
          <p className="text-xs font-mono text-[#3d5870] mb-6 uppercase tracking-widest">{pc.title}</p>

          {/* ═══════════════════════════════════════════
              FASE 1 — RECEPCIÓN
          ═══════════════════════════════════════════ */}
          {phase === 1 && (
            <>
              <Card title="Datos personales" icon="👤" color={pc.color}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="NOMBRE(S)" required>
                      <input className={`${inp} ${fBlue}`} value={f.first_name}
                        onChange={e => set('first_name', e.target.value)} placeholder="Juan" />
                    </Field>
                    <Field label="APELLIDO(S)" required>
                      <input className={`${inp} ${fBlue}`} value={f.last_name}
                        onChange={e => set('last_name', e.target.value)} placeholder="Pérez García" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="FECHA DE NACIMIENTO" required>
                      <input type="date" className={`${inp} ${fBlue}`} value={f.date_of_birth}
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
                      <input className={`${inp} ${fBlue}`} value={f.occupation}
                        onChange={e => set('occupation', e.target.value)} placeholder="Ingeniero, docente..." />
                    </Field>
                    <Field label="CIUDAD / ESTADO">
                      <input className={`${inp} ${fBlue}`} value={f.city}
                        onChange={e => set('city', e.target.value)} placeholder="CDMX, Guadalajara..." />
                    </Field>
                  </div>
                </div>
              </Card>

              {/* ── Banner: posible duplicado ── */}
              {dupCandidates.length > 0 && !dupDismissed && (
                <div className="bg-[#f59e0b]/10 border-2 border-[#f59e0b]/60 rounded-xl p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">⚠️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#f59e0b] mb-1">
                        Paciente ya registrado con estos datos
                      </p>
                      <p className="text-xs text-[#7a95aa] mb-3">
                        Encontré {dupCandidates.length === 1 ? 'un paciente' : `${dupCandidates.length} pacientes`} con el mismo nombre y fecha de nacimiento. Verifica si ya está en el sistema antes de crear un duplicado.
                      </p>
                      <div className="space-y-2 mb-3">
                        {dupCandidates.map((d: any) => {
                          const dobD = d.date_of_birth || d.birth_date;
                          const ageD = dobD ? Math.floor((Date.now() - new Date(dobD).getTime()) / (1000*60*60*24*365.25)) : null;
                          const phase_label = d.registration_phase === 'complete' ? '✅ Completo'
                            : d.registration_phase === 'nursing' ? '🟨 Pendiente médico'
                            : '🟦 Pendiente enfermería';
                          return (
                            <div key={d.id} className="bg-[#111820] border border-[#f59e0b]/30 rounded-lg px-3 py-2.5 flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[#dde6ef]">{d.full_name}</p>
                                <p className="text-xs text-[#3d5870] font-mono">{d.id}{ageD !== null ? ` · ${ageD} años` : ''}</p>
                                <p className="text-xs text-[#7a95aa] mt-0.5">{phase_label}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => router.push(`/dashboard/patient/${d.id}`)}
                                className="flex-shrink-0 px-3 py-1.5 bg-[#f59e0b] text-black text-xs font-bold rounded-lg hover:opacity-90 transition">
                                Ver ficha →
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDupDismissed(true)}
                        className="text-xs text-[#3d5870] hover:text-[#7a95aa] underline transition">
                        No es el mismo paciente — continuar con el registro
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <Card title="Contacto" icon="📱" color={pc.color}>
                <div className="space-y-4">
                  <Field label="CORREO ELECTRÓNICO">
                    <input type="email" className={`${inp} ${fBlue}`} value={f.email}
                      onChange={e => set('email', e.target.value)} placeholder="correo@ejemplo.com" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="CELULAR">
                      <input type="tel" className={`${inp} ${fBlue}`} value={f.phone}
                        onChange={e => set('phone', e.target.value)} placeholder="+52 55 1234 5678" />
                    </Field>
                    <Field label="TELÉFONO FIJO">
                      <input type="tel" className={`${inp} ${fBlue}`} value={f.phone_landline}
                        onChange={e => set('phone_landline', e.target.value)} placeholder="(55) 1234-5678" />
                    </Field>
                  </div>
                </div>
              </Card>

              <Card title="Contacto de emergencia" icon="🆘" color={pc.color}>
                <div className="space-y-3">
                  <Field label="NOMBRE COMPLETO">
                    <input className={`${inp} ${fBlue}`} value={f.emergency_contact_name}
                      onChange={e => set('emergency_contact_name', e.target.value)} placeholder="María López" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="RELACIÓN">
                      <input className={`${inp} ${fBlue}`} value={f.emergency_contact_relationship}
                        onChange={e => set('emergency_contact_relationship', e.target.value)} placeholder="Esposa, hijo..." />
                    </Field>
                    <Field label="CELULAR">
                      <input type="tel" className={`${inp} ${fBlue}`} value={f.emergency_contact_phone}
                        onChange={e => set('emergency_contact_phone', e.target.value)} placeholder="+52 55..." />
                    </Field>
                  </div>
                  <Field label="CORREO (OPCIONAL)">
                    <input type="email" className={`${inp} ${fBlue}`} value={f.emergency_contact_email}
                      onChange={e => set('emergency_contact_email', e.target.value)} placeholder="emergencia@ejemplo.com" />
                  </Field>
                </div>
              </Card>

              <Card title="¿Cómo nos conoció?" icon="📍" color={pc.color}>
                {/* Botones principales — Recomendación es exclusiva entre sí */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {SOURCES.map(s => {
                    const isRec = s === 'Recomendación de paciente' || s === 'Recomendación de médico';
                    const active = sources.includes(s);
                    return (
                      <button key={s} type="button" onClick={() => toggleSource(s)}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition border"
                        style={{
                          background: active ? 'rgba(14,165,233,.18)' : 'transparent',
                          color:      active ? '#0ea5e9' : '#7a95aa',
                          borderColor: active ? '#0ea5e9' : '#1e2d3d',
                        }}>
                        {s === 'Recomendación de paciente' ? '👤 Paciente' :
                         s === 'Recomendación de médico'   ? '🩺 Médico colega' : s}
                      </button>
                    );
                  })}
                </div>

                {/* Sub-opciones según selección */}
                {sources.includes('Redes sociales') && (
                  <div className="mb-4 pl-3 border-l-2 border-[#0ea5e9]/40">
                    <p className="text-xs font-mono text-[#7a95aa] mb-2">¿QUÉ RED SOCIAL?</p>
                    <div className="flex flex-wrap gap-2">
                      {['Facebook','Instagram','YouTube','TikTok'].map(red => (
                        <button key={red} type="button"
                          onClick={() => set('social_network', f.social_network === red ? '' : red)}
                          className="px-4 py-2 rounded-xl text-sm font-medium transition border"
                          style={{
                            background: f.social_network === red ? 'rgba(14,165,233,.18)' : 'transparent',
                            color:      f.social_network === red ? '#0ea5e9' : '#7a95aa',
                            borderColor: f.social_network === red ? '#0ea5e9' : '#1e2d3d',
                          }}>
                          {red === 'Instagram' ? '📸' : red === 'Facebook' ? '📘' : red === 'YouTube' ? '▶️' : '🎵'} {red}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {sources.includes('Recomendación de paciente') && (
                  <div className="mb-4 pl-3 border-l-2 border-[#0ea5e9]/40">
                    <Field label="NOMBRE DEL PACIENTE QUE RECOMENDÓ">
                      <input className={`${inp} ${fBlue}`} value={f.referred_by}
                        onChange={e => set('referred_by', e.target.value)}
                        placeholder="Nombre del paciente que lo recomendó" />
                    </Field>
                  </div>
                )}

                {sources.includes('Recomendación de médico') && (
                  <div className="mb-4 pl-3 border-l-2 border-[#0ea5e9]/40">
                    <Field label="NOMBRE DEL MÉDICO QUE RECOMENDÓ">
                      <input className={`${inp} ${fBlue}`} value={f.referred_by}
                        onChange={e => set('referred_by', e.target.value)}
                        placeholder="Dr. García, Dra. López..." />
                    </Field>
                  </div>
                )}

                {sources.includes('Otro') && (
                  <div className="mb-4 pl-3 border-l-2 border-[#0ea5e9]/40">
                    <Field label="¿CUÁL OTRO?">
                      <input className={`${inp} ${fBlue}`} value={f.referred_other}
                        onChange={e => set('referred_other', e.target.value)}
                        placeholder="Describe cómo nos conoció..." />
                    </Field>
                  </div>
                )}

                {/* ¿Revisó antes de venir? */}
                <div className="mt-3 pt-4 border-t border-[#1e2d3d]">
                  <p className="text-xs font-mono text-[#7a95aa] mb-3">¿REVISÓ ANTES DE VENIR?</p>
                  <div className="flex flex-wrap gap-2">
                    {[{ k:'prev_redes', l:'Redes sociales' },{ k:'prev_web', l:'Página web' },{ k:'prev_gmaps', l:'Google Maps' }].map(({k,l}) => (
                      <button key={k} type="button"
                        onClick={() => set(k, !(f[k as keyof typeof f] as boolean))}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition border"
                        style={{
                          background: (f[k as keyof typeof f] as boolean) ? 'rgba(14,165,233,.18)' : 'transparent',
                          color:      (f[k as keyof typeof f] as boolean) ? '#0ea5e9' : '#7a95aa',
                          borderColor:(f[k as keyof typeof f] as boolean) ? '#0ea5e9' : '#1e2d3d',
                        }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Nota de recepción — siempre visible */}
              <Card title="Nota de Recepción" icon="📝" color={pc.color}>
                {patientId ? (
                  <>
                    <p className="text-xs text-[#3d5870] mb-3">Agrega observaciones. Quedan registradas con timestamp.</p>
                    <NoteThread patientId={patientId} notes={notes} defaultRole="receptionist"
                      onNoteAdded={n => setNotes(prev => [...prev, n])}
                      onNoteDeleted={id => setNotes(prev => prev.filter(n => n.id !== id))} />
                  </>
                ) : (
                  <>
                    <p className="text-xs text-[#3d5870] mb-3">La nota se guardará al avanzar a la siguiente fase.</p>
                    <textarea
                      rows={3}
                      value={pendingNote}
                      onChange={e => setPendingNote(e.target.value)}
                      className={`${inp} ${fBlue} resize-none`}
                      placeholder="Observaciones de recepción..." />
                  </>
                )}
              </Card>
            </>
          )}

          {/* ═══════════════════════════════════════════
              FASE 2 — ENFERMERÍA
          ═══════════════════════════════════════════ */}
          {phase === 2 && (
            <>
              <PatientBadge />

              {/* — Antecedentes heredofamiliares — */}
              <Card title="Antecedentes heredofamiliares" icon="🧬" color={pc.color}>
                <div className="space-y-4">
                  {FAMILIARES.map(fam => {
                    const row = family[fam.key];
                    return (
                      <div key={fam.key} className="bg-[#111820] border border-[#1e2d3d] rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-[#dde6ef]">{fam.label}</span>
                          <div className="flex gap-3">
                            {[{val:true,l:'Vive'},{val:false,l:'Falleció'}].map(o => (
                              <label key={String(o.val)} className="flex items-center gap-1.5 cursor-pointer">
                                <input type="radio" name={`vivo_${fam.key}`} checked={row.vivo===o.val}
                                  onChange={() => setFamField(fam.key,'vivo',o.val)}
                                  className="w-3.5 h-3.5 accent-[#f97316]" />
                                <span className="text-xs text-[#dde6ef]">{o.l}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 mb-3">
                          {ENFERMEDADES.map(e => (
                            <label key={e.key} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={row[e.key]}
                                onChange={() => toggleFamily(fam.key, e.key)}
                                className="w-4 h-4 accent-[#f97316]" />
                              <span className="text-xs text-[#dde6ef]">{e.label}</span>
                            </label>
                          ))}
                        </div>
                        <input className="w-full px-2 py-1.5 bg-[#0d1520] border border-[#1e2d3d] rounded text-xs text-[#dde6ef] focus:border-[#f97316] outline-none mb-2 placeholder-[#3d5870]"
                          value={row.otra} placeholder="Otra enfermedad relevante..."
                          onChange={e => setFamField(fam.key,'otra',e.target.value)} />
                        {!row.vivo && (
                          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#1e2d3d]">
                            <input className="px-2 py-1.5 bg-[#0d1520] border border-[#1e2d3d] rounded text-xs text-[#dde6ef] focus:border-[#f97316] outline-none placeholder-[#3d5870]"
                              value={row.causa_muerte} placeholder="Causa de muerte"
                              onChange={e => setFamField(fam.key,'causa_muerte',e.target.value)} />
                            <input type="number" className="px-2 py-1.5 bg-[#0d1520] border border-[#1e2d3d] rounded text-xs text-[#dde6ef] focus:border-[#f97316] outline-none placeholder-[#3d5870]"
                              value={row.edad_muerte} placeholder="Edad al fallecer"
                              onChange={e => setFamField(fam.key,'edad_muerte',e.target.value)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* — Antecedentes personales — */}
              <Card title="Antecedentes personales patológicos" icon="🏥" color={pc.color}>
                <div className="space-y-4">
                  <Field label="ENFERMEDADES CRÓNICAS">
                    <textarea rows={3} className={`${inp} ${fOrng}`} value={f.chronic_diseases}
                      onChange={e => set('chronic_diseases', e.target.value)}
                      placeholder="Diabetes tipo 2 (2018), Hipertensión (2020)..." />
                  </Field>
                  <Field label="CIRUGÍAS (nombre y año)">
                    <textarea rows={2} className={`${inp} ${fOrng}`} value={f.surgeries}
                      onChange={e => set('surgeries', e.target.value)} placeholder="Apendicectomía (2010)..." />
                  </Field>
                  <Field label="HOSPITALIZACIONES">
                    <textarea rows={2} className={`${inp} ${fOrng}`} value={f.hospitalizations}
                      onChange={e => set('hospitalizations', e.target.value)} placeholder="Neumonía (2019)..." />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="FRACTURAS / TRAUMATISMOS">
                      <input className={`${inp} ${fOrng}`} value={f.fractures}
                        onChange={e => set('fractures', e.target.value)} placeholder="Fractura cadera (2021)..." />
                    </Field>
                    <Field label="TRANSFUSIONES">
                      <input className={`${inp} ${fOrng}`} value={f.transfusions}
                        onChange={e => set('transfusions', e.target.value)} placeholder="Post-op 2018..." />
                    </Field>
                  </div>
                  <Field label="ENFERMEDADES RELEVANTES DE LA INFANCIA">
                    <input className={`${inp} ${fOrng}`} value={f.childhood_diseases}
                      onChange={e => set('childhood_diseases', e.target.value)} placeholder="Fiebre reumática, meningitis..." />
                  </Field>
                </div>
              </Card>

              {/* — Antecedentes lejanos (medicina funcional) — */}
              <Card title="Antecedentes lejanos" icon="🔎" color={pc.color}>
                <p className="text-xs text-[#7a95aa] mb-4">Útiles para medicina funcional — buscan el origen, no solo el diagnóstico. Opcionales.</p>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="INFECCIONES RECURRENTES EN LA INFANCIA">
                      <input className={`${inp} ${fOrng}`} value={f.childhood_infections}
                        onChange={e => set('childhood_infections', e.target.value)} placeholder="Otitis, amigdalitis, neumonías frecuentes..." />
                    </Field>
                    <Field label="ANTIBIÓTICOS EN LA INFANCIA">
                      <input className={`${inp} ${fOrng}`} value={f.childhood_antibiotics}
                        onChange={e => set('childhood_antibiotics', e.target.value)} placeholder="Cuántos ciclos aprox., si los recuerda..." />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="EXPOSICIÓN LABORAL A QUÍMICOS">
                      <input className={`${inp} ${fOrng}`} value={f.toxic_exposure_occupational}
                        onChange={e => set('toxic_exposure_occupational', e.target.value)} placeholder="Pinturas, disolventes, pesticidas, herbicidas..." />
                    </Field>
                    <Field label="RESIDENCIA EN INFANCIA / JUVENTUD">
                      <input className={`${inp} ${fOrng}`} value={f.childhood_residence_exposure}
                        onChange={e => set('childhood_residence_exposure', e.target.value)} placeholder="Cerca de industrias, minas, zonas con fumigación..." />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="AMALGAMAS DENTALES">
                      <input className={`${inp} ${fOrng}`} value={f.dental_amalgams}
                        onChange={e => set('dental_amalgams', e.target.value)} placeholder="Cuántas, ¿las tiene aún?" />
                    </Field>
                    <Field label="TATUAJES O PIERCINGS">
                      <input className={`${inp} ${fOrng}`} value={f.tattoos_piercings}
                        onChange={e => set('tattoos_piercings', e.target.value)} placeholder="Cuántos, hace cuánto..." />
                    </Field>
                    <Field label="HUMO DE TABACO (PASADO)">
                      <input className={`${inp} ${fOrng}`} value={f.secondhand_smoke_exposure}
                        onChange={e => set('secondhand_smoke_exposure', e.target.value)} placeholder="Exposición pasiva en el pasado..." />
                    </Field>
                  </div>
                </div>
              </Card>

              {/* — Alergias — */}
              <Card title="Alergias conocidas" icon="⚠️" color={pc.color}>
                <Field label="ALERGIAS (medicamentos, alimentos, ambientales)">
                  <textarea rows={3} className={`${inp} ${fOrng}`} value={f.allergies_medications}
                    onChange={e => set('allergies_medications', e.target.value)}
                    placeholder="Penicilina, mariscos, látex, polvo... o 'Sin alergias conocidas'" />
                </Field>
              </Card>

              {/* — Medicamentos actuales — */}
              <Card title="Medicamentos que toma actualmente" icon="💊" color={pc.color}>
                <p className="text-xs text-[#7a95aa] mb-4">Los que realmente toma, no los que debería tomar.</p>
                <div className="space-y-3">
                  {meds.map((m, i) => (
                    <div key={i} className="bg-[#111820] border border-[#1e2d3d] rounded-lg p-4 relative">
                      <button onClick={() => removeMed(i)}
                        className="absolute top-3 right-3 text-[#f43f5e] text-xs hover:opacity-80">✕</button>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="MEDICAMENTO"><input className={`${inp} ${fOrng}`} value={m.nombre} onChange={e=>setMed(i,'nombre',e.target.value)} placeholder="Metformina..." /></Field>
                        <Field label="DOSIS"><input className={`${inp} ${fOrng}`} value={m.dosis} onChange={e=>setMed(i,'dosis',e.target.value)} placeholder="850mg" /></Field>
                        <Field label="FRECUENCIA REAL">
                          <select className={`${inp} ${fOrng}`} value={m.frecuencia} onChange={e=>setMed(i,'frecuencia',e.target.value)}>
                            <option value="">Seleccionar</option>
                            {['Diario','Cada 12h','Cada 8h','Semanal','Ocasional'].map(o=><option key={o}>{o}</option>)}
                          </select>
                        </Field>
                        <Field label="ADHERENCIA">
                          <select className={`${inp} ${fOrng}`} value={m.adherencia} onChange={e=>setMed(i,'adherencia',e.target.value)}>
                            <option value="">Seleccionar</option>
                            {['Siempre','Casi siempre','A veces','Casi nunca'].map(o=><option key={o}>{o}</option>)}
                          </select>
                        </Field>
                        <Field label="DESDE CUÁNDO"><input className={`${inp} ${fOrng}`} value={m.desde} onChange={e=>setMed(i,'desde',e.target.value)} placeholder="2018, 3 meses..." /></Field>
                      </div>
                    </div>
                  ))}
                  <button onClick={addMed} className="w-full py-2.5 border border-dashed border-[#f97316] text-[#f97316] rounded-lg text-sm hover:bg-[#f97316]/5 transition">
                    + Agregar medicamento
                  </button>
                </div>
                <div className="mt-4">
                  <Field label="OBSERVACIONES (automedicación, remedios caseros)">
                    <textarea rows={2} className={`${inp} ${fOrng}`} value={f.med_notas}
                      onChange={e => set('med_notas', e.target.value)} placeholder="Toma aspirina de vez en cuando..." />
                  </Field>
                </div>
              </Card>

              {/* — Hábitos — */}
              <Card title="Hábitos" icon="🚬" color={pc.color}>
                <div className="space-y-6">
                  {/* Tabaquismo */}
                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-3">TABAQUISMO</p>
                    <div className="flex gap-4 flex-wrap mb-3">
                      {['Nunca fumó','Exfumador','Fumador activo'].map(s => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="smoking" value={s} checked={f.smoking_status===s}
                            onChange={e=>set('smoking_status',e.target.value)} className="w-4 h-4 accent-[#f97316]" />
                          <span className="text-sm text-[#dde6ef]">{s}</span>
                        </label>
                      ))}
                    </div>
                    {f.smoking_status==='Fumador activo' && (
                      <Field label="¿DESDE QUÉ AÑO FUMA?">
                        <input type="number" className={`${inp} ${fOrng}`} value={f.smoking_since}
                          onChange={e=>set('smoking_since',e.target.value)} placeholder="2010" />
                      </Field>
                    )}
                    {f.smoking_status==='Exfumador' && (
                      <Field label="¿CUÁNTOS AÑOS FUMÓ EN TOTAL?">
                        <input type="number" className={`${inp} ${fOrng}`} value={f.smoking_years}
                          onChange={e=>set('smoking_years',e.target.value)} placeholder="15" />
                      </Field>
                    )}
                  </div>

                  {/* Alcohol */}
                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-3">ALCOHOL</p>
                    <div className="flex gap-4 flex-wrap mb-4">
                      {['Nunca','Ocasional','Frecuente','Diario'].map(s => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="alcohol" value={s} checked={f.alcohol_status===s}
                            onChange={e=>set('alcohol_status',e.target.value)} className="w-4 h-4 accent-[#f97316]" />
                          <span className="text-sm text-[#dde6ef]">{s}</span>
                        </label>
                      ))}
                    </div>
                    {f.alcohol_status && f.alcohol_status!=='Nunca' && (
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-mono text-[#7a95aa] mb-2">TIPO DE BEBIDA (puede marcar varias)</p>
                          <div className="flex gap-3 flex-wrap">
                            {['Cerveza','Vino','Destilados (whisky, ron, tequila...)'].map(tipo => (
                              <label key={tipo} className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox"
                                  checked={alcoholTipo.includes(tipo)}
                                  onChange={() => setAlcoholTipo(p => p.includes(tipo) ? p.filter(x=>x!==tipo) : [...p,tipo])}
                                  className="w-4 h-4 accent-[#f97316]" />
                                <span className="text-sm text-[#dde6ef]">{tipo}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-mono text-[#7a95aa] mb-2">CANTIDAD APROXIMADA A LA SEMANA</p>
                          <div className="flex flex-col gap-2">
                            {[
                              { v:'1-5',    l:'1–5 bebidas',            note:'Bajo riesgo' },
                              { v:'6-10',   l:'6–10 bebidas',           note:'Riesgo moderado' },
                              { v:'11-15',  l:'11–15 bebidas',          note:'Riesgo elevado' },
                              { v:'16-20',  l:'16–20 bebidas',          note:'Riesgo alto' },
                              { v:'20+',    l:'Más de 20 bebidas',      note:'⚠️ Consumo problemático' },
                            ].map(opt => (
                              <label key={opt.v} className="flex items-center gap-3 cursor-pointer">
                                <input type="radio" name="alcohol_cant" value={opt.v}
                                  checked={f.alcohol_cantidad===opt.v}
                                  onChange={e=>set('alcohol_cantidad',e.target.value)}
                                  className="w-4 h-4 accent-[#f97316]" />
                                <span className="text-sm text-[#dde6ef]">{opt.l}</span>
                                <span className="text-xs text-[#3d5870]">{opt.note}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* ─── VISITA: Signos vitales ─────────────────────── */}
              <div className="my-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-[#1e2d3d]" />
                <span className="text-xs font-mono text-[#f97316] bg-[#f97316]/10 px-3 py-1 rounded-full border border-[#f97316]/30">
                  📋 PRIMERA VISITA — Datos de hoy
                </span>
                <div className="flex-1 h-px bg-[#1e2d3d]" />
              </div>

              <Card title="Signos vitales" icon="❤️" color={pc.color}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-mono text-[#7a95aa] mb-2">BRAZO DERECHO</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="SISTÓLICA"><input type="number" className={`${inp} ${fOrng}`} value={f.pa_der_sistolica} onChange={e=>set('pa_der_sistolica',e.target.value)} placeholder="120" /></Field>
                        <Field label="DIASTÓLICA"><input type="number" className={`${inp} ${fOrng}`} value={f.pa_der_diastolica} onChange={e=>set('pa_der_diastolica',e.target.value)} placeholder="80" /></Field>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-[#7a95aa] mb-2">BRAZO IZQUIERDO</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="SISTÓLICA"><input type="number" className={`${inp} ${fOrng}`} value={f.pa_izq_sistolica} onChange={e=>set('pa_izq_sistolica',e.target.value)} placeholder="120" /></Field>
                        <Field label="DIASTÓLICA"><input type="number" className={`${inp} ${fOrng}`} value={f.pa_izq_diastolica} onChange={e=>set('pa_izq_diastolica',e.target.value)} placeholder="80" /></Field>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="FC (lpm)"><input type="number" className={`${inp} ${fOrng}`} value={f.fc} onChange={e=>set('fc',e.target.value)} placeholder="72" /></Field>
                    <Field label="TEMP (°C)"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.temperatura} onChange={e=>set('temperatura',e.target.value)} placeholder="36.5" /></Field>
                    <Field label="SpO₂ (%)"><input type="number" className={`${inp} ${fOrng}`} value={f.spo2} onChange={e=>set('spo2',e.target.value)} placeholder="98" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="GLUCOSA (mg/dL)"><input type="number" className={`${inp} ${fOrng}`} value={f.glucosa} onChange={e=>set('glucosa',e.target.value)} placeholder="95" /></Field>
                    <Field label="¿EN AYUNO?">
                      <div className="flex gap-4 pt-2">
                        {['Sí','No'].map(v => (
                          <label key={v} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="ayuno" value={v} checked={f.glucosa_ayuno===v} onChange={e=>set('glucosa_ayuno',e.target.value)} className="w-4 h-4 accent-[#f97316]" />
                            <span className="text-sm text-[#dde6ef]">{v}</span>
                          </label>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={f.ecg_realizado} onChange={e=>set('ecg_realizado',e.target.checked)} className="w-4 h-4 accent-[#f97316]" />
                    <span className="text-sm text-[#dde6ef]">Se realizó ECG en esta visita</span>
                  </label>
                </div>
              </Card>

              <Card title="Composición corporal y actividad física" icon="⚖️" color={pc.color}>
                <div className="space-y-4">
                  {/* Peso, talla, IMC */}
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="PESO (kg)"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.peso} onChange={e=>set('peso',e.target.value)} placeholder="75" /></Field>
                    <Field label="TALLA (cm)"><input type="number" className={`${inp} ${fOrng}`} value={f.talla} onChange={e=>set('talla',e.target.value)} placeholder="170" /></Field>
                    <Field label="IMC">
                      <div className="px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded font-mono text-sm"
                        style={{ color: imc ? (parseFloat(imc)<18.5||parseFloat(imc)>30 ? '#f43f5e' : parseFloat(imc)>25 ? '#f59e0b' : '#00e5a0') : '#3d5870' }}>
                        {imc || '—'}
                      </div>
                    </Field>
                  </div>
                  {/* Circunferencias (solo las relevantes) */}
                  <div className="grid grid-cols-4 gap-3">
                    <Field label="CINTURA (cm)"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.circ_cintura} onChange={e=>set('circ_cintura',e.target.value)} placeholder="85" /></Field>
                    <Field label="CUELLO (cm)"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.circ_cuello} onChange={e=>set('circ_cuello',e.target.value)} placeholder="38" /></Field>
                    <Field label="BÍCEPS (cm)"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.circ_biceps} onChange={e=>set('circ_biceps',e.target.value)} placeholder="32" /></Field>
                    <Field label="MUÑECA (cm)"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.circ_muneca} onChange={e=>set('circ_muneca',e.target.value)} placeholder="16" /></Field>
                  </div>
                  {/* InBody */}
                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-2">INBODY / BIOIMPEDANCIA (si se realizó)</p>
                    <div className="grid grid-cols-4 gap-3">
                      <Field label="GRASA %"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.inbody_grasa} onChange={e=>set('inbody_grasa',e.target.value)} placeholder="25" /></Field>
                      <Field label="MÚSCULO kg"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.inbody_musculo} onChange={e=>set('inbody_musculo',e.target.value)} placeholder="35" /></Field>
                      <Field label="AGUA %"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.inbody_agua} onChange={e=>set('inbody_agua',e.target.value)} placeholder="55" /></Field>
                      <Field label="VISCERAL"><input type="number" className={`${inp} ${fOrng}`} value={f.inbody_visceral} onChange={e=>set('inbody_visceral',e.target.value)} placeholder="8" /></Field>
                    </div>
                  </div>
                  {/* Actividad física */}
                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-3">ACTIVIDAD FÍSICA</p>
                    <label className="flex items-center gap-3 cursor-pointer mb-4">
                      <input type="checkbox" checked={f.actividad_si}
                        onChange={e=>set('actividad_si',e.target.checked)} className="w-4 h-4 accent-[#f97316]" />
                      <span className="text-sm text-[#dde6ef]">El paciente realiza actividad física regularmente</span>
                    </label>
                    {f.actividad_si && (
                      <div className="grid grid-cols-3 gap-3">
                        <Field label="TIPO DE EJERCICIO">
                          <input className={`${inp} ${fOrng}`} value={f.actividad_tipo}
                            onChange={e=>set('actividad_tipo',e.target.value)} placeholder="Cardio, pesas, yoga..." />
                        </Field>
                        <Field label="FRECUENCIA">
                          <select className={`${inp} ${fOrng}`} value={f.actividad_frecuencia}
                            onChange={e=>set('actividad_frecuencia',e.target.value)}>
                            <option value="">Seleccionar</option>
                            {['1 vez/semana','2 veces/semana','3 veces/semana','4 veces/semana','5 veces/semana','Diario'].map(o=><option key={o}>{o}</option>)}
                          </select>
                        </Field>
                        <Field label="INTENSIDAD">
                          <select className={`${inp} ${fOrng}`} value={f.actividad_intensidad}
                            onChange={e=>set('actividad_intensidad',e.target.value)}>
                            <option value="">Seleccionar</option>
                            <option>Baja</option>
                            <option>Moderada</option>
                            <option>Fuerte / Intensa</option>
                          </select>
                        </Field>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <Card title="Pruebas funcionales" icon="💪" color={pc.color}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="FUERZA PRENSIL DER. (kg)"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.fuerza_mano_der} onChange={e=>set('fuerza_mano_der',e.target.value)} placeholder="35" /></Field>
                    <Field label="FUERZA PRENSIL IZQ. (kg)"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.fuerza_mano_izq} onChange={e=>set('fuerza_mano_izq',e.target.value)} placeholder="33" /></Field>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="MARCHA 4m (seg)"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.marcha_4m} onChange={e=>set('marcha_4m',e.target.value)} placeholder="3.5" /></Field>
                    <Field label="EQUILIBRIO (seg)"><input type="number" step="0.1" className={`${inp} ${fOrng}`} value={f.equilibrio_seg} onChange={e=>set('equilibrio_seg',e.target.value)} placeholder="15" /></Field>
                    <Field label="SENTARSE / LEVANTARSE (×30s)"><input type="number" className={`${inp} ${fOrng}`} value={f.sentarse_levantarse} onChange={e=>set('sentarse_levantarse',e.target.value)} placeholder="14" /></Field>
                  </div>
                </div>
              </Card>

              {/* — Nota de enfermería — */}
              {patientId && (
                <Card title="Nota de Enfermería" icon="📝" color={pc.color}>
                  <NoteThread patientId={patientId} notes={notes} defaultRole="nurse"
                    onNoteAdded={n => setNotes(prev => [...prev, n])}
                    onNoteDeleted={id => setNotes(prev => prev.filter(n => n.id !== id))} />
                </Card>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════
              FASE 3 — MÉDICO
          ═══════════════════════════════════════════ */}
          {phase === 3 && (
            <>
              <PatientBadge />

              {/* SEXO BIOLÓGICO — requerido */}
              <div className="bg-[#0d1520] border-2 border-[#a78bfa] rounded-xl p-6 mb-4">
                <h2 className="text-base font-semibold text-[#dde6ef] mb-1 flex items-center gap-2">
                  🧬 Sexo biológico de nacimiento
                  <span className="text-[#f43f5e] text-xs font-mono ml-1">REQUERIDO</span>
                </h2>
                <p className="text-xs text-[#7a95aa] mb-4">El médico puede observarlo o preguntarlo. Necesario para análisis de la IA.</p>
                <div className="flex gap-4">
                  {[{v:'Masculino',icon:'♂'},{v:'Femenino',icon:'♀'}].map(({v:s,icon}) => (
                    <button key={s} type="button" onClick={()=>set('sexo_biologico',s)}
                      className="flex-1 py-3 rounded-xl text-base font-bold border transition"
                      style={{ background: f.sexo_biologico===s?'rgba(167,139,250,.2)':'transparent', color: f.sexo_biologico===s?'#a78bfa':'#7a95aa', borderColor: f.sexo_biologico===s?'#a78bfa':'#1e2d3d' }}>
                      {icon} {s}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  <Field label="GÉNERO CON QUE SE IDENTIFICA (OPCIONAL)">
                    <input className={`${inp} ${fPurp}`} value={f.genero_identidad}
                      onChange={e=>set('genero_identidad',e.target.value)} placeholder="Solo si el paciente lo menciona..." />
                  </Field>
                </div>
              </div>

              {/* Historia reproductiva FEMENINA */}
              {f.sexo_biologico === 'Femenino' && (
                <Card title="Historia gineco-obstétrica" icon="🌸" color={pc.color}>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="EDAD DE MENARCA"><input type="number" className={`${inp} ${fPurp}`} value={f.menarca_age} onChange={e=>set('menarca_age',e.target.value)} placeholder="12" /></Field>
                      <Field label="CICLOS MENSTRUALES">
                        <select className={`${inp} ${fPurp}`} value={f.ciclos_regulares} onChange={e=>set('ciclos_regulares',e.target.value)}>
                          <option value="">Seleccionar</option>
                          {['Regulares','Irregulares','Amenorrea'].map(o=><option key={o}>{o}</option>)}
                        </select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="EMBARAZOS"><input type="number" className={`${inp} ${fPurp}`} value={f.pregnancies} onChange={e=>set('pregnancies',e.target.value)} placeholder="2" /></Field>
                      <Field label="PARTOS / CESÁREAS"><input className={`${inp} ${fPurp}`} value={f.births} onChange={e=>set('births',e.target.value)} placeholder="1P / 1C" /></Field>
                      <Field label="ABORTOS"><input type="number" className={`${inp} ${fPurp}`} value={f.miscarriages} onChange={e=>set('miscarriages',e.target.value)} placeholder="0" /></Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="MENOPAUSIA">
                        <select className={`${inp} ${fPurp}`} value={f.menopausal_tipo} onChange={e=>set('menopausal_tipo',e.target.value)}>
                          <option value="">No aplica / activa</option>
                          {['Natural','Quirúrgica','Prematura'].map(o=><option key={o}>{o}</option>)}
                        </select>
                      </Field>
                      {f.menopausal_tipo && <Field label="EDAD DE MENOPAUSIA"><input type="number" className={`${inp} ${fPurp}`} value={f.menopausal_age} onChange={e=>set('menopausal_age',e.target.value)} placeholder="50" /></Field>}
                    </div>
                    <Field label="MÉTODO ANTICONCEPTIVO ACTUAL">
                      <input className={`${inp} ${fPurp}`} value={f.contraceptive} onChange={e=>set('contraceptive',e.target.value)} placeholder="DIU, hormonal, barrera, ninguno..." />
                    </Field>
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="ÚLTIMO PAP (AÑO)"><input className={`${inp} ${fPurp}`} value={f.pap_ultimo} onChange={e=>set('pap_ultimo',e.target.value)} placeholder="2023" /></Field>
                      <Field label="ÚLTIMA MASTOGRAFÍA"><input className={`${inp} ${fPurp}`} value={f.masto_ultima} onChange={e=>set('masto_ultima',e.target.value)} placeholder="2022" /></Field>
                      <Field label="ÚLTIMA COLPOSCOPÍA"><input className={`${inp} ${fPurp}`} value={f.colpo_ultima} onChange={e=>set('colpo_ultima',e.target.value)} placeholder="2021" /></Field>
                    </div>
                  </div>
                </Card>
              )}

              {/* Historia reproductiva MASCULINA */}
              {f.sexo_biologico === 'Masculino' && (
                <Card title="Historia reproductiva masculina" icon="💪" color={pc.color}>
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs font-mono text-[#7a95aa] mb-3">DISFUNCIÓN ERÉCTIL</p>
                      <div className="flex gap-4 flex-wrap">
                        {['No refiere','Ocasional','Frecuente','Siempre'].map(o => (
                          <label key={o} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="ed" value={o} checked={f.erectile_dysfunction===o}
                              onChange={e=>set('erectile_dysfunction',e.target.value)} className="w-4 h-4 accent-[#a78bfa]" />
                            <span className="text-sm text-[#dde6ef]">{o}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-[#7a95aa] mb-3">USO DE TESTOSTERONA EXÓGENA</p>
                      <div className="flex gap-4">
                        {['No','En el pasado','Actualmente'].map(o => (
                          <label key={o} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="test" value={o} checked={f.testosterone_use===o}
                              onChange={e=>set('testosterone_use',e.target.value)} className="w-4 h-4 accent-[#a78bfa]" />
                            <span className="text-sm text-[#dde6ef]">{o}</span>
                          </label>
                        ))}
                      </div>
                      {(f.testosterone_use==='En el pasado'||f.testosterone_use==='Actualmente') && (
                        <textarea rows={2} className={`${inp} ${fPurp} mt-3`} value={f.testosterone_detalle}
                          onChange={e=>set('testosterone_detalle',e.target.value)} placeholder="Cuándo, cuánto tiempo, tipo de compuesto..." />
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="NÚMERO DE HIJOS"><input type="number" className={`${inp} ${fPurp}`} value={f.children} onChange={e=>set('children',e.target.value)} placeholder="2" /></Field>
                      <Field label="ÚLTIMO PSA (AÑO)"><input className={`${inp} ${fPurp}`} value={f.psa_ultimo} onChange={e=>set('psa_ultimo',e.target.value)} placeholder="2023" /></Field>
                      <Field label="RESULTADO PSA (ng/mL)"><input className={`${inp} ${fPurp}`} value={f.psa_valor} onChange={e=>set('psa_valor',e.target.value)} placeholder="1.2" /></Field>
                    </div>
                  </div>
                </Card>
              )}

              {/* Salud sexual */}
              {f.sexo_biologico && (
                <Card title="Salud sexual" icon="💛" color={pc.color}>
                  <p className="text-xs text-[#7a95aa] mb-4">Confidencial — solo visible para el médico tratante.</p>
                  <div className="space-y-4">
                    <Field label="LIBIDO BASAL — EN CONDICIONES NORMALES (1-10)">
                      <div className="flex items-center gap-4">
                        <input type="range" min={1} max={10} value={f.libido_basal}
                          onChange={e=>set('libido_basal',e.target.value)} className="flex-1" />
                        <span className="text-[#a78bfa] font-mono text-lg min-w-[30px]">{f.libido_basal}</span>
                      </div>
                    </Field>
                    <Field label="NOTAS DE SALUD SEXUAL">
                      <textarea rows={3} className={`${inp} ${fPurp}`} value={f.salud_sexual_notas}
                        onChange={e=>set('salud_sexual_notas',e.target.value)}
                        placeholder="Solo registrar si es clínicamente relevante..." />
                    </Field>
                  </div>
                </Card>
              )}

              {/* Salud mental */}
              <Card title="Salud mental" icon="🧠" color={pc.color}>
                <p className="text-xs text-[#7a95aa] mb-4">Confidencial — solo visible para el médico tratante.</p>
                <div className="space-y-4">
                  <Field label="DIAGNÓSTICOS PSIQUIÁTRICOS PREVIOS O ACTUALES">
                    <textarea rows={2} className={`${inp} ${fPurp}`} value={f.dx_psiquiatrico}
                      onChange={e=>set('dx_psiquiatrico',e.target.value)} placeholder="Depresión mayor (2019), Ansiedad, TDAH..." />
                  </Field>
                  <Field label="MEDICAMENTOS PSIQUIÁTRICOS ACTUALES O PREVIOS">
                    <textarea rows={2} className={`${inp} ${fPurp}`} value={f.med_psiquiatrica}
                      onChange={e=>set('med_psiquiatrica',e.target.value)} placeholder="Sertralina 50mg, Alprazolam 0.5mg (suspendido 2022)..." />
                  </Field>
                  <Field label="EVENTOS TRAUMÁTICOS RELEVANTES (opcional)">
                    <textarea rows={2} className={`${inp} ${fPurp}`} value={f.trauma_relevante}
                      onChange={e=>set('trauma_relevante',e.target.value)} placeholder="Solo si el paciente lo menciona espontáneamente..." />
                  </Field>
                </div>
              </Card>

              {/* Sustancias recreativas */}
              <Card title="Sustancias recreativas o de uso regular" icon="🌿" color={pc.color}>
                <p className="text-xs text-[#7a95aa] mb-3">Confidencial — visible solo para el médico tratante.</p>
                <textarea rows={3} className={`${inp} ${fPurp}`} value={f.sust_recreativas}
                  onChange={e=>set('sust_recreativas',e.target.value)}
                  placeholder="Marihuana, cannabis medicinal, MDMA, estimulantes no prescritos..." />
              </Card>

              {/* ─── VISITA: Motivo + Exploración ─── */}
              <div className="my-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-[#1e2d3d]" />
                <span className="text-xs font-mono text-[#a78bfa] bg-[#a78bfa]/10 px-3 py-1 rounded-full border border-[#a78bfa]/30">
                  🔬 VISITA — Exploración médica
                </span>
                <div className="flex-1 h-px bg-[#1e2d3d]" />
              </div>

              <Card title="Motivo de consulta" icon="📋" color={pc.color}>
                <div className="space-y-4">
                  <Field label="¿A QUÉ VIENE HOY?">
                    <textarea rows={4} className={`${inp} ${fPurp} resize-none`} value={f.motivo_visita}
                      onChange={e=>set('motivo_visita',e.target.value)} placeholder="Describe con las palabras del paciente el motivo de consulta..." />
                  </Field>
                  <Slider label="INTENSIDAD DEL MALESTAR PRINCIPAL" value={f.motivo_intensidad}
                    onChange={v=>set('motivo_intensidad',v)} color="#a78bfa" />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="¿DESDE CUÁNDO?">
                      <input className={`${inp} ${fPurp}`} placeholder="3 días, 2 semanas, 1 mes..."
                        value={f.motivo_desde} onChange={e=>set('motivo_desde',e.target.value)} />
                    </Field>
                    <Field label="CAMBIOS DE MEDICAMENTOS RECIENTES">
                      <input className={`${inp} ${fPurp}`} placeholder="Inició metformina, suspendió..."
                        value={f.cambios_meds} onChange={e=>set('cambios_meds',e.target.value)} />
                    </Field>
                  </div>
                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-2">¿ES LA PRIMERA VEZ?</p>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        { val: 'si',        label: 'Sí, primera vez' },
                        { val: 'no',        label: 'No, recurrente' },
                        { val: 'episodios', label: 'Ha tenido episodios antes' },
                      ].map(({ val, label }) => (
                        <label key={val} className="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl border transition text-sm"
                          style={{ background: f.motivo_primera_vez === val ? '#a78bfa' : '#1e2d3d', borderColor: f.motivo_primera_vez === val ? '#a78bfa' : '#2a3a4d', color: f.motivo_primera_vez === val ? '#000' : '#dde6ef' }}>
                          <input type="radio" name="primera_vez" value={val}
                            checked={f.motivo_primera_vez === val}
                            onChange={e=>set('motivo_primera_vez', e.target.value)} className="sr-only" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Dolor — parte del motivo de consulta. Puede haber varias dolencias a la vez */}
                  <div className="bg-[#111820] border border-[#f43f5e]/20 rounded-xl p-4 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer text-sm">
                      <input type="checkbox" checked={dolores.length > 0}
                        onChange={e => setDolores(e.target.checked ? [{ ubicacion: '', intensidad: 5 }] : [])}
                        className="w-4 h-4 accent-[#f43f5e] flex-shrink-0" />
                      <span className="text-[#dde6ef] font-semibold">Tiene dolor hoy</span>
                    </label>
                    {dolores.map((d, i) => (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#1e2d3d] pt-4 first:border-t-0 first:pt-0">
                        <Field label={`DÓNDE DUELE${dolores.length > 1 ? ` #${i+1}` : ''}`}>
                          <div className="flex gap-2">
                            <input className={`${inp} ${fPurp} flex-1`} placeholder="Cabeza, espalda, articulaciones..."
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
                          onChange={v => updateDolor(i, 'intensidad', v)} color="#f43f5e" />
                      </div>
                    ))}
                    {dolores.length > 0 && (
                      <button type="button" onClick={addDolor}
                        className="text-[#f43f5e] border border-[#f43f5e]/30 rounded-xl hover:bg-[#f43f5e]/10 transition font-semibold px-3 py-2 text-xs">
                        + Agregar otra dolencia
                      </button>
                    )}
                  </div>
                </div>
              </Card>

              <Card title="Reporte Subjetivo" icon="🧠" color={pc.color}>
                <div className="space-y-5">
                  <div className="bg-[#111820] border border-[#a78bfa]/20 rounded-xl p-4 space-y-4">
                    <p className="text-xs font-mono text-[#a78bfa]">ENERGÍA EN LOS ÚLTIMOS 5 DÍAS</p>
                    <Slider label="AL DESPERTAR"     value={f.energia_manana}   onChange={v=>set('energia_manana',v)}   color="#a78bfa" />
                    <Slider label="A MEDIODÍA"        value={f.energia_mediodia} onChange={v=>set('energia_mediodia',v)} color="#a78bfa" />
                    <Slider label="AL FINAL DEL DÍA"  value={f.energia_tarde}    onChange={v=>set('energia_tarde',v)}    color="#a78bfa" />
                  </div>

                  <div className="bg-[#111820] border border-[#a78bfa]/20 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-mono text-[#a78bfa]">SUEÑO</p>
                    <Slider label="CALIDAD DEL SUEÑO" value={f.sueno_calidad} onChange={v=>set('sueno_calidad',v)} color="#a78bfa" />
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="HORAS POR NOCHE">
                        <input type="number" step="0.5" className={`${inp} ${fPurp}`} value={f.sueno_horas}
                          onChange={e=>set('sueno_horas',e.target.value)} placeholder="7.5" />
                      </Field>
                      <div>
                        <p className="text-xs font-mono text-[#7a95aa] mb-2">¿DESCANSADO?</p>
                        <div className="flex gap-2 flex-wrap">
                          {['Sí','No','A veces'].map(o => (
                            <label key={o} className="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl border transition text-sm"
                              style={{ background: f.sueno_reparador === o ? '#a78bfa' : '#1e2d3d', borderColor: f.sueno_reparador === o ? '#a78bfa' : '#2a3a4d', color: f.sueno_reparador === o ? '#000' : '#dde6ef' }}>
                              <input type="radio" name="sueno_rep" value={o} checked={f.sueno_reparador === o}
                                onChange={e=>set('sueno_reparador', e.target.value)} className="sr-only" />
                              {o}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ánimo + Digestión lado a lado */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#111820] border border-[#a78bfa]/20 rounded-xl p-4">
                      <p className="text-xs font-mono text-[#a78bfa] mb-3">ÁNIMO ESTA SEMANA</p>
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
                    <div className="bg-[#111820] border border-[#a78bfa]/20 rounded-xl p-4">
                      <p className="text-xs font-mono text-[#a78bfa] mb-3">DIGESTIÓN</p>
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
                  </div>

                  <Slider label="LIBIDO EN LOS ÚLTIMOS DÍAS" value={f.libido_hoy} onChange={v=>set('libido_hoy',v)} color="#a78bfa" />

                  {/* Color orina — mañana y tarde lado a lado */}
                  <div className="grid grid-cols-2 gap-4">
                    {([
                      { field: 'orina_color' as const,      label: 'COLOR ORINA EN LA MAÑANA' },
                      { field: 'orina_color_tarde' as const, label: 'COLOR ORINA POR LA TARDE' },
                    ]).map(({ field, label }) => (
                      <div key={field} className="bg-[#111820] border border-[#a78bfa]/20 rounded-xl p-4">
                        <p className="text-xs font-mono text-[#a78bfa] mb-3">{label}</p>
                        <div className="flex gap-2 flex-wrap">
                          {ORINA_COLORS.map(c => (
                            <button key={c.hex} type="button" onClick={() => set(field, c.label)}
                              className="flex flex-col items-center gap-1 rounded-xl border-2 transition p-2"
                              style={{ borderColor: f[field] === c.label ? '#a78bfa' : '#1e2d3d', background: f[field] === c.label ? '#a78bfa11' : 'transparent' }}>
                              <div className="w-8 h-8 rounded-full border border-[#1e2d3d]" style={{ background: c.hex }} />
                              <span className="text-[10px] text-[#7a95aa] text-center max-w-[60px] leading-tight">{c.text}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card title="Exploración Clínica" icon="🔬" color={pc.color}>
                <p className="text-xs text-[#7a95aa] mb-3">Solo lo relevante. No obligatorio campo por campo.</p>
                <div className="space-y-3">
                  <Field label="IMPRESIÓN GENERAL">
                    <textarea rows={3} className={`${inp} ${fPurp} resize-none`}
                      value={f.exp_general} onChange={e=>set('exp_general',e.target.value)}
                      placeholder="Paciente en buen estado general, consciente, orientado, normohidratado..." />
                  </Field>

                  {f.ecg_realizado && (
                    <Field label="INTERPRETACIÓN ECG">
                      <textarea rows={3} className={`${inp} ${fPurp} resize-none`}
                        value={f.ecg_interpretacion} onChange={e=>set('ecg_interpretacion',e.target.value)}
                        placeholder="Ritmo sinusal regular, eje normal..." />
                    </Field>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { key: 'exp_piel',        label: 'PIEL Y MUCOSAS',  ph: 'Coloración, ictericia, acné...' },
                      { key: 'exp_ojos',        label: 'OJOS',            ph: 'Ictericia escleral, xantelasmas...' },
                      { key: 'exp_boca',        label: 'BOCA',            ph: 'Estado dental, lengua...' },
                      { key: 'exp_tiroides',    label: 'TIROIDES',        ph: 'Palpación, tamaño, nódulos...' },
                      { key: 'exp_abdomen',     label: 'ABDOMEN',         ph: 'Hepatomegalia, masas...' },
                      { key: 'exp_neurologico', label: 'NEUROLÓGICO',     ph: 'Temblor, marcha, reflejos...' },
                    ].map(({ key, label, ph }) => (
                      <Field key={key} label={label}>
                        <textarea rows={4} maxLength={500} placeholder={ph}
                          value={(f as any)[key] as string}
                          onChange={e=>set(key, e.target.value)}
                          className={`${inp} ${fPurp} resize-none`} />
                      </Field>
                    ))}
                  </div>

                  <Field label="OTROS HALLAZGOS">
                    <textarea rows={2} className={`${inp} ${fPurp} resize-none`}
                      value={f.exp_otros} onChange={e=>set('exp_otros',e.target.value)}
                      placeholder="Cualquier otro hallazgo..." />
                  </Field>

                  <div className="grid grid-cols-2 gap-4 bg-[#111820] border border-[#a78bfa]/20 rounded-xl p-4">
                    <Field label="TIPO DE ESTUDIO DE IMAGEN">
                      <input className={`${inp} ${fPurp}`} placeholder="RX tórax, TAC abdomen..."
                        value={f.img_tipo} onChange={e=>set('img_tipo',e.target.value)} />
                    </Field>
                    <Field label="HALLAZGOS">
                      <input className={`${inp} ${fPurp}`} placeholder="Sin infiltrados, silueta cardíaca normal..."
                        value={f.img_interpretacion} onChange={e=>set('img_interpretacion',e.target.value)} />
                    </Field>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer bg-[#111820] border border-[#a78bfa]/20 rounded-xl px-4 py-3">
                    <input type="checkbox" checked={f.cognitivo_realizado}
                      onChange={e=>set('cognitivo_realizado', e.target.checked)}
                      className="w-4 h-4 accent-[#a78bfa] flex-shrink-0" />
                    <span className="text-sm text-[#dde6ef] font-semibold">Se realizó Mini-Cog hoy</span>
                  </label>
                  {f.cognitivo_realizado && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#111820] border border-[#a78bfa]/20 rounded-xl p-4">
                      <Field label="PALABRAS RECORDADAS (0-3)">
                        <input type="number" className={`${inp} ${fPurp}`} value={f.cognitivo_palabras}
                          onChange={e=>set('cognitivo_palabras', e.target.value)} placeholder="0-3" />
                      </Field>
                      <div>
                        <p className="text-xs font-mono text-[#7a95aa] mb-2">RELOJ CORRECTO</p>
                        <div className="flex gap-2">
                          {['Sí','No','Parcial'].map(o => (
                            <label key={o} className="flex items-center justify-center cursor-pointer flex-1 rounded-lg border transition py-2 text-xs"
                              style={{ background: f.cognitivo_reloj === o ? '#a78bfa' : '#1e2d3d', borderColor: f.cognitivo_reloj === o ? '#a78bfa' : '#2a3a4d', color: f.cognitivo_reloj === o ? '#000' : '#dde6ef' }}>
                              <input type="radio" name="reloj" value={o} checked={f.cognitivo_reloj === o}
                                onChange={e=>set('cognitivo_reloj', e.target.value)} className="sr-only" />
                              {o}
                            </label>
                          ))}
                        </div>
                      </div>
                      <Field label="OBSERVACIONES">
                        <input className={`${inp} ${fPurp}`} placeholder="Notas..."
                          value={f.cognitivo_notas} onChange={e=>set('cognitivo_notas', e.target.value)} />
                      </Field>
                    </div>
                  )}
                </div>
              </Card>

              <Card title="Laboratorios y estudios" icon="🧪" color={pc.color}>
                <div className="space-y-4">

                  {/* Notas de labs */}
                  <Field label="NOTAS SOBRE LOS LABORATORIOS">
                    <textarea rows={4} className={`${inp} ${fPurp} resize-none`} value={f.lab_notas}
                      onChange={e=>set('lab_notas',e.target.value)}
                      placeholder="Resultados relevantes, valores que llaman la atención..." />
                  </Field>

                  {/* Subida de archivos */}
                  <div>
                    <label className="text-xs font-mono text-[#7a95aa] mb-1.5 block">
                      ARCHIVOS — PDF, FOTO, DOCUMENTO (máx. 5 MB c/u)
                    </label>
                    <div
                      className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition"
                      style={{ borderColor: labFiles.length ? '#a78bfa55' : '#1e2d3d' }}
                      onClick={() => labFileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); }}
                      onDrop={e => {
                        e.preventDefault();
                        const dt = e.dataTransfer;
                        const fakeEvent = { target: { files: dt.files, value: '' } } as any;
                        handleLabFiles(fakeEvent as React.ChangeEvent<HTMLInputElement>);
                      }}>
                      <input
                        ref={labFileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                        className="hidden"
                        onChange={handleLabFiles}
                      />
                      <p className="text-2xl mb-1">📎</p>
                      <p className="text-sm text-[#7a95aa] font-medium">Arrastra archivos aquí o haz clic para seleccionar</p>
                      <p className="text-xs text-[#3d5870] mt-1">PDF · Imágenes · Word · Excel — la IA los analiza directamente</p>
                    </div>

                    {labFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {labFiles.map((lf, i) => (
                          <div key={i} className="flex items-center gap-3 bg-[#111820] border border-[#1e2d3d] rounded-lg px-3 py-2">
                            <span className="text-xl flex-shrink-0">
                              {lf.type.includes('pdf') ? '📄' : lf.type.startsWith('image') ? '🖼️' : '📝'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-[#dde6ef] truncate font-medium">{lf.name}</p>
                              <p className="text-xs text-[#3d5870]">{(lf.size / 1024).toFixed(0)} KB</p>
                            </div>
                            <button type="button"
                              onClick={() => setLabFiles(p => p.filter((_,j) => j !== i))}
                              className="text-[#f43f5e] text-lg leading-none hover:opacity-80 flex-shrink-0">
                              ×
                            </button>
                          </div>
                        ))}
                        <p className="text-xs text-[#3d5870] text-right">{labFiles.length} archivo{labFiles.length !== 1 ? 's' : ''} adjunto{labFiles.length !== 1 ? 's' : ''}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* — Nota del médico — */}
              {patientId && (
                <Card title="Nota Médica" icon="📝" color={pc.color}>
                  <NoteThread patientId={patientId} visitId={visitId || undefined} notes={notes} defaultRole="doctor"
                    onNoteAdded={n => setNotes(prev => [...prev, n])}
                    onNoteDeleted={id => setNotes(prev => prev.filter(n => n.id !== id))} />
                </Card>
              )}

              {/* Aviso si falta sexo biológico */}
              {!f.sexo_biologico && (
                <div className="bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-xl p-4 mb-4">
                  <p className="text-sm text-[#f43f5e]">⚠️ El campo <strong>Sexo biológico</strong> es requerido para completar el alta.</p>
                </div>
              )}
            </>
          )}

          {/* ── Barra de acciones fija ─────────────────────────────── */}
          <div className="fixed bottom-0 left-0 right-0 bg-[#070a0e]/95 border-t border-[#1e2d3d] backdrop-blur-xl px-6 py-4 flex justify-between items-center z-40">
            <button onClick={() => phase > 1 ? setPhase(phase-1) : router.back()}
              className="px-5 py-2.5 text-sm text-[#7a95aa] border border-[#1e2d3d] rounded-xl hover:border-[#00e5a0] transition">
              ← {phase > 1 ? 'Anterior' : 'Cancelar'}
            </button>

            <div className="flex gap-3 items-center">
              {/* Fase 1: Guardar paciente */}
              {phase === 1 && (
                <button onClick={savePhase1} disabled={saving || !f.first_name || !f.last_name || !f.date_of_birth}
                  className="px-6 py-2.5 text-sm font-bold rounded-xl disabled:opacity-40 transition"
                  style={{ background: '#0ea5e9', color: '#000' }}>
                  {saving ? 'Guardando...' : 'Guardar y pasar a Enfermería →'}
                </button>
              )}
              {/* Fase 2: Guardar antecedentes + visita */}
              {phase === 2 && (
                <button onClick={savePhase2} disabled={saving}
                  className="px-6 py-2.5 text-sm font-bold rounded-xl disabled:opacity-40 transition"
                  style={{ background: '#f97316', color: '#000' }}>
                  {saving ? 'Guardando...' : 'Guardar y pasar al Médico →'}
                </button>
              )}
              {/* Fase 3: Guardar y ver paciente */}
              {phase === 3 && (
                <button onClick={savePhase3} disabled={saving || !f.sexo_biologico}
                  className="px-6 py-2.5 text-sm font-bold rounded-xl disabled:opacity-40 transition"
                  style={{ background: f.sexo_biologico ? '#00e5a0' : '#3d5870', color: f.sexo_biologico ? '#000' : '#7a95aa' }}>
                  {saving ? 'Guardando...' : 'Completar registro y ver paciente ✓'}
                </button>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default function FlowPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">Cargando...</div>}>
      <FlowPageInner />
    </Suspense>
  );
}
