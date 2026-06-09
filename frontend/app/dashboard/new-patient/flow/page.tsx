'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import NoteThread, { Note } from '@/app/components/NoteThread';
import TopNav from '@/app/components/TopNav';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Familiar  = 'padre' | 'madre' | 'hermanos';
type Enfermedad = 'diabetes' | 'hipertension' | 'cancer' | 'cardiopatia';

const FAMILIARES: { key: Familiar; label: string }[] = [
  { key: 'padre', label: 'Padre' },
  { key: 'madre', label: 'Madre' },
  { key: 'hermanos', label: 'Hermano(s)' },
];
const ENFERMEDADES: { key: Enfermedad; label: string }[] = [
  { key: 'diabetes',     label: 'Diabetes'      },
  { key: 'hipertension', label: 'Hipertensión'   },
  { key: 'cancer',       label: 'Cáncer'         },
  { key: 'cardiopatia',  label: 'Cardiopatía'    },
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
  const [user, setUser]         = useState<any>(null);
  const [token, setToken]       = useState<string | null>(null);
  const [docName, setDocName]   = useState('Doctor');
  const [docPhoto, setDocPhoto] = useState<string | null>(null);
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

  // ── Estado heredofamiliar ────────────────────────────────────────────────
  type FamilyRow = Record<Enfermedad, boolean> & { otra: string; vivo: boolean; causa_muerte: string; edad_muerte: string; };
  const emptyFamily = (): FamilyRow => ({ diabetes: false, hipertension: false, cancer: false, cardiopatia: false, otra: '', vivo: true, causa_muerte: '', edad_muerte: '' });
  const [family, setFamily] = useState<Record<Familiar, FamilyRow>>({ padre: emptyFamily(), madre: emptyFamily(), hermanos: emptyFamily() });

  // ── Medicamentos ─────────────────────────────────────────────────────────
  const [meds, setMeds] = useState<Array<{ nombre:string; dosis:string; frecuencia:string; adherencia:string; desde:string; }>>([]);

  // ── Fuentes de llegada ───────────────────────────────────────────────────
  const [sources, setSources] = useState<string[]>([]);

  // ── Multi-selects visita ─────────────────────────────────────────────────
  const [animo,       setAnimo]       = useState<string[]>([]);
  const [digestion,   setDigestion]   = useState<string[]>([]);
  const [alcoholTipo, setAlcoholTipo] = useState<string[]>([]);  // cerveza/vino/destilados

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

    // FASE 2 — Visita: Reporte subjetivo
    energia_despertar: 5, energia_tarde: 5, energia_noche: 5,
    sueno_calidad: 5, sueno_horas: '',
    animo_val: 5, animo_otro: '',
    digestion_val: 5, digestion_otro: '',
    orina_color_manana: '', orina_color_tarde: '',
    metas: '',

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

    // FASE 3 — Visita: Libido (movido de Fase 2)
    libido_visita: 5,
    // FASE 3 — Visita: Motivo + Exploración
    motivo: '', motivo_intensidad: 5,
    exploracion_general: '', exploracion_piel: '', exploracion_ojos: '',
    exploracion_boca: '', exploracion_tiroides: '', exploracion_abdomen: '',
    exploracion_extremidades: '', exploracion_notas: '',
    labs_notas: '', dx_presuntivo: '',
  });

  const set = (field: string, value: any) => setF(prev => ({ ...prev, [field]: value }));

  const searchParams = useSearchParams();

  useEffect(() => {
    const init = async () => {
      const u = await getUser();
      if (!u) { router.push('/auth/login'); return; }
      setUser(u);
      const session = await getSession();
      const t = session?.access_token || null;
      setToken(t);
      const authHeader: Record<string, string> = t ? { Authorization: `Bearer ${t}` } : {};

      // Cargar perfil del doctor para el TopNav
      try {
        const pRes = await fetch(`${B()}/doctor/profile`, { headers: authHeader });
        const pData = await pRes.json();
        const name = pData.display_name || u?.user_metadata?.full_name || u?.email?.split('@')[0] || 'Doctor';
        setDocName(name);
        if (pData.photo_url) setDocPhoto(pData.photo_url);
      } catch (_) {}

      // Retomar registro de paciente existente
      const pid = searchParams.get('patient_id');
      const ph  = parseInt(searchParams.get('phase') || '1');
      if (pid) {
        setPatientId(pid);
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
              // Reporte subjetivo
              energia_despertar: num(v.energia_despertar),
              energia_tarde:     num(v.energia_tarde),
              energia_noche:     num(v.energia_noche),
              sueno_calidad:     num(v.sueno_calidad),
              sueno_horas:       str(v.sueno_horas),
              animo_val:         num(v.animo_val),
              animo_otro:        str(v.animo_otro),
              digestion_val:     num(v.digestion_val),
              digestion_otro:    str(v.digestion_otro),
              orina_color_manana: str(v.orina_color_manana),
              orina_color_tarde:  str(v.orina_color_tarde),
              metas:             str(v.metas),
              // Fase 3 — Exploración
              libido_visita:              num(v.libido_visita),
              motivo:                     str(v.motivo),
              motivo_intensidad:          num(v.motivo_intensidad),
              exploracion_general:        str(v.exploracion_general),
              exploracion_piel:           str(v.exploracion_piel),
              exploracion_ojos:           str(v.exploracion_ojos),
              exploracion_boca:           str(v.exploracion_boca),
              exploracion_tiroides:       str(v.exploracion_tiroides),
              exploracion_abdomen:        str(v.exploracion_abdomen),
              exploracion_extremidades:   str(v.exploracion_extremidades),
              exploracion_notas:          str(v.exploracion_notas),
              labs_notas:                 str(v.labs_notas),
              dx_presuntivo:              str(v.dx_presuntivo),
            }));
            if (Array.isArray(v.animo_tags))    setAnimo(v.animo_tags);
            if (Array.isArray(v.digestion_tags)) setDigestion(v.digestion_tags);
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
          smoking_status: f.smoking_status,
          smoking_since: f.smoking_since, smoking_years: f.smoking_years,
          alcohol_status: f.alcohol_status, alcohol_tipo: alcoholTipo,
          alcohol_cantidad: f.alcohol_cantidad,
          medications: meds, family_history_table: family,
          registration_phase: 'nursing',
          phases_completed: ['receptionist', 'nurse'],
        }),
      });

      // 2b: Crear primera visita
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
        actividad_tipo: f.actividad_tipo, actividad_frecuencia: f.actividad_frecuencia,
        actividad_intensidad: f.actividad_intensidad,
        // Funcional
        fuerza_mano_der: f.fuerza_mano_der, fuerza_mano_izq: f.fuerza_mano_izq,
        marcha_4m: f.marcha_4m, equilibrio_seg: f.equilibrio_seg,
        sentarse_levantarse: f.sentarse_levantarse,
        // Subjetivo
        energia_despertar: f.energia_despertar, energia_tarde: f.energia_tarde, energia_noche: f.energia_noche,
        sueno_calidad: f.sueno_calidad, sueno_horas: f.sueno_horas,
        animo_val: f.animo_val, animo_tags: animo, animo_otro: f.animo_otro,
        digestion_val: f.digestion_val, digestion_tags: digestion, digestion_otro: f.digestion_otro,
        orina_color_manana: f.orina_color_manana, orina_color_tarde: f.orina_color_tarde,
        metas: f.metas,
        status: 'nursing_done',
      };
      const vRes = await fetch(`${B()}/visits/`, {
        method: 'POST',
        headers: authH2,
        body: JSON.stringify(visitPayload),
      });
      if (!vRes.ok) throw new Error('Error al crear visita');
      const vData = await vRes.json();
      setVisitId(vData.id || vData.visit_id);
      setPhase(3);
    } catch (e: any) {
      alert('Error en Fase 2: ' + e.message);
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

      // 3b: Actualizar visita con motivo + exploración
      if (visitId) {
        await fetch(`${B()}/visits/${visitId}`, {
          method: 'PUT',
          headers: authH3,
          body: JSON.stringify({
            libido_visita: f.libido_visita,
            motivo: f.motivo, motivo_intensidad: f.motivo_intensidad,
            exploracion_general: f.exploracion_general, exploracion_piel: f.exploracion_piel,
            exploracion_ojos: f.exploracion_ojos, exploracion_boca: f.exploracion_boca,
            exploracion_tiroides: f.exploracion_tiroides, exploracion_abdomen: f.exploracion_abdomen,
            exploracion_extremidades: f.exploracion_extremidades, exploracion_notas: f.exploracion_notas,
            labs_notas: f.labs_notas, dx_presuntivo: f.dx_presuntivo,
            status: 'complete',
          }),
        });
      }

      router.push(`/dashboard/patient/${patientId}`);
    } catch (e: any) {
      alert('Error en Fase 3: ' + e.message);
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

      <TopNav userName={docName} photoUrl={docPhoto} />

      <main className="pt-16 min-h-screen">
        <div className="max-w-3xl mx-auto px-4 py-8 pb-36">

          {/* Stepper */}
          <div className="flex gap-2 mb-2">
            {([1,2,3] as const).map(p => {
              const cfg = PHASE_CONFIG[p];
              const done = p < phase;
              const active = p === phase;
              return (
                <button key={p}
                  onClick={() => { if (p < phase) setPhase(p); }}
                  disabled={p > phase}
                  className="flex-1 py-2.5 rounded-lg text-xs font-bold transition-all disabled:cursor-not-allowed"
                  style={{
                    background: active ? cfg.color : done ? cfg.color + '44' : '#1e2d3d',
                    color: active || done ? '#000' : '#7a95aa',
                    opacity: p > phase ? 0.5 : 1,
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

              <Card title="Reporte subjetivo del paciente" icon="🧠" color={pc.color}>
                <div className="space-y-5">

                  {/* Energía — 3 momentos del día */}
                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-3">NIVEL DE ENERGÍA (1=muy bajo · 10=excelente)</p>
                    <div className="space-y-3">
                      <Slider label="Al despertar" value={f.energia_despertar} onChange={v=>set('energia_despertar',v)} color="#f97316" />
                      <Slider label="Por la tarde" value={f.energia_tarde}    onChange={v=>set('energia_tarde',v)}    color="#f97316" />
                      <Slider label="Por la noche"  value={f.energia_noche}   onChange={v=>set('energia_noche',v)}   color="#f97316" />
                    </div>
                  </div>

                  {/* Sueño */}
                  <div className="grid grid-cols-2 gap-4">
                    <Slider label="CALIDAD DEL SUEÑO (1-10)" value={f.sueno_calidad} onChange={v=>set('sueno_calidad',v)} color="#f97316" />
                    <Field label="HORAS DE SUEÑO (aprox.)">
                      <input type="number" step="0.5" className={`${inp} ${fOrng}`} value={f.sueno_horas}
                        onChange={e=>set('sueno_horas',e.target.value)} placeholder="7.5" />
                    </Field>
                  </div>

                  {/* Estado anímico */}
                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-2">ESTADO ANÍMICO (puede marcar varios)</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {ANIMO_OPTS.map(o => (
                        <button key={o} onClick={() => toggleMulti(animo, setAnimo, o)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition"
                          style={{ background: animo.includes(o)?'rgba(249,115,22,.15)':'transparent', color: animo.includes(o)?'#f97316':'#7a95aa', borderColor: animo.includes(o)?'#f97316':'#1e2d3d' }}>
                          {o}
                        </button>
                      ))}
                    </div>
                    {animo.includes('Otro') && (
                      <input className={`${inp} ${fOrng} mt-1`} value={f.animo_otro}
                        onChange={e=>set('animo_otro',e.target.value)}
                        placeholder="Describir otro estado anímico..." />
                    )}
                  </div>

                  {/* Digestión */}
                  <Slider label="DIGESTIÓN GENERAL (1-10)" value={f.digestion_val} onChange={v=>set('digestion_val',v)} color="#f97316" />
                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-2">SÍNTOMAS DIGESTIVOS</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {DIGESTION_OPTS.map(o => (
                        <button key={o} onClick={() => toggleMulti(digestion, setDigestion, o)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition"
                          style={{ background: digestion.includes(o)?'rgba(249,115,22,.15)':'transparent', color: digestion.includes(o)?'#f97316':'#7a95aa', borderColor: digestion.includes(o)?'#f97316':'#1e2d3d' }}>
                          {o}
                        </button>
                      ))}
                    </div>
                    {digestion.includes('Otro') && (
                      <input className={`${inp} ${fOrng} mt-1`} value={f.digestion_otro}
                        onChange={e=>set('digestion_otro',e.target.value)}
                        placeholder="Describir otro síntoma digestivo..." />
                    )}
                  </div>

                  {/* Color de orina — mañana y tarde */}
                  <div>
                    <p className="text-xs font-mono text-[#7a95aa] mb-3">COLOR DE ORINA</p>
                    <div className="space-y-3">
                      {[
                        { label: 'Por la mañana', field: 'orina_color_manana' as const },
                        { label: 'Por la tarde',   field: 'orina_color_tarde'  as const },
                      ].map(({ label, field }) => (
                        <div key={field}>
                          <p className="text-xs text-[#3d5870] mb-1.5">{label}</p>
                          <div className="flex gap-3 flex-wrap">
                            {ORINA_COLORS.map(c => (
                              <button key={c.hex} onClick={() => set(field, c.hex)}
                                title={`${c.label} — ${c.text}`}
                                className="w-9 h-9 rounded-full border-2 transition"
                                style={{ background: c.hex, borderColor: f[field]===c.hex ? '#00e5a0' : 'transparent' }} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Metas */}
                  <Field label="METAS DEL PACIENTE PARA ESTA CONSULTA">
                    <textarea rows={3} className={`${inp} ${fOrng}`} value={f.metas}
                      onChange={e=>set('metas',e.target.value)}
                      placeholder="Bajar de peso, mejorar energía, revisar laboratorios..." />
                  </Field>
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
                <div className="flex gap-6">
                  {['Masculino','Femenino','Intersex'].map(s => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="sexo" value={s} checked={f.sexo_biologico===s}
                        onChange={e=>set('sexo_biologico',e.target.value)} className="w-4 h-4 accent-[#a78bfa]" />
                      <span className="text-[#dde6ef]">{s}</span>
                    </label>
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
                    <Field label="LIBIDO ACTUAL — ¿CÓMO HA ESTADO RECIENTEMENTE? (1-10)">
                      <div className="flex items-center gap-4">
                        <input type="range" min={1} max={10} value={f.libido_visita}
                          onChange={e=>set('libido_visita',parseInt(e.target.value))} className="flex-1" />
                        <span className="text-[#a78bfa] font-mono text-lg min-w-[30px]">{f.libido_visita}</span>
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
                <div className="space-y-3">
                  <Field label="MOTIVO PRINCIPAL">
                    <textarea rows={3} className={`${inp} ${fPurp}`} value={f.motivo}
                      onChange={e=>set('motivo',e.target.value)} placeholder="¿Qué trae al paciente hoy?" />
                  </Field>
                  <Field label="INTENSIDAD / URGENCIA PERCIBIDA (1-10)">
                    <div className="flex items-center gap-4">
                      <input type="range" min={1} max={10} value={f.motivo_intensidad}
                        onChange={e=>set('motivo_intensidad',parseInt(e.target.value))} className="flex-1" />
                      <span className="text-[#a78bfa] font-mono text-lg min-w-[30px]">{f.motivo_intensidad}</span>
                    </div>
                  </Field>
                </div>
              </Card>

              <Card title="Exploración física" icon="🔬" color={pc.color}>
                <div className="space-y-3">
                  {[
                    { k:'exploracion_general',      l:'ASPECTO GENERAL' },
                    { k:'exploracion_piel',         l:'PIEL / FANERAS' },
                    { k:'exploracion_ojos',         l:'OJOS / CONJUNTIVAS / ESCLERAS' },
                    { k:'exploracion_boca',         l:'BOCA / MUCOSAS / DENTICIÓN' },
                    { k:'exploracion_tiroides',     l:'CUELLO / TIROIDES / GANGLIOS' },
                    { k:'exploracion_abdomen',      l:'ABDOMEN' },
                    { k:'exploracion_extremidades', l:'EXTREMIDADES' },
                  ].map(({k,l}) => (
                    <Field key={k} label={l}>
                      <input className={`${inp} ${fPurp}`} value={(f as any)[k]}
                        onChange={e=>set(k,e.target.value)} placeholder="Hallazgos o 'sin alteraciones'..." />
                    </Field>
                  ))}
                  <Field label="NOTAS ADICIONALES DE EXPLORACIÓN">
                    <textarea rows={3} className={`${inp} ${fPurp}`} value={f.exploracion_notas}
                      onChange={e=>set('exploracion_notas',e.target.value)} placeholder="Otros hallazgos relevantes..." />
                  </Field>
                </div>
              </Card>

              <Card title="Laboratorios y estudios" icon="🧪" color={pc.color}>
                <div className="space-y-3">
                  <Field label="LABORATORIOS RECIENTES (resultados o pendientes)">
                    <textarea rows={4} className={`${inp} ${fPurp}`} value={f.labs_notas}
                      onChange={e=>set('labs_notas',e.target.value)}
                      placeholder="Glucosa 105, HbA1c 5.8%, TSH 2.1... o 'pendiente de resultados de laboratorio'" />
                  </Field>
                  <Field label="DIAGNÓSTICO PRESUNTIVO (para la IA)">
                    <textarea rows={3} className={`${inp} ${fPurp}`} value={f.dx_presuntivo}
                      onChange={e=>set('dx_presuntivo',e.target.value)}
                      placeholder="Impresión diagnóstica inicial del médico..." />
                  </Field>
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
