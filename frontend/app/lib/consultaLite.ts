// Consulta Lite: datos y reglas del flujo de consulta de cardiología SIN IA.
// Lógica pura (sin React) para poder probarla: tipos, listas, validación y armado de payloads.
// Se guarda en columnas que YA existen en `visits` y `patients`; lo que no tiene columna
// propia va en visits.dynamic_answers.lite.

export type Kind = 'first_visit' | 'follow_up';

export const KIND_LABEL: Record<Kind, string> = {
  first_visit: 'Primera vez',
  follow_up: 'Seguimiento',
};

// ── Perfiles clínicos de hiper-personalización ──
export type ClinicalProfileKey = 'cardiologia_intervencionista' | 'medicina_estetica' | 'medicina_general' | 'personalizado';

export interface ModuleConfig {
  heredofamiliares: boolean;
  estilo_vida: boolean;
  frcv_cardiovascular: boolean;
  intervencionismo_stents: boolean;
  angina_ccs: boolean;
  insuficiencia_nyha: boolean;
  exploracion_cardiovascular: boolean;
  ecg_12d: boolean;
}

export const DEFAULT_MODULE_CONFIGS: Record<ClinicalProfileKey, ModuleConfig> = {
  cardiologia_intervencionista: {
    heredofamiliares: true,
    estilo_vida: true,
    frcv_cardiovascular: true,
    intervencionismo_stents: true,
    angina_ccs: true,
    insuficiencia_nyha: true,
    exploracion_cardiovascular: true,
    ecg_12d: true,
  },
  medicina_estetica: {
    heredofamiliares: false,
    estilo_vida: true,
    frcv_cardiovascular: false,
    intervencionismo_stents: false,
    angina_ccs: false,
    insuficiencia_nyha: false,
    exploracion_cardiovascular: false,
    ecg_12d: false,
  },
  medicina_general: {
    heredofamiliares: true,
    estilo_vida: true,
    frcv_cardiovascular: true,
    intervencionismo_stents: false,
    angina_ccs: false,
    insuficiencia_nyha: false,
    exploracion_cardiovascular: false,
    ecg_12d: false,
  },
  personalizado: {
    heredofamiliares: true,
    estilo_vida: true,
    frcv_cardiovascular: true,
    intervencionismo_stents: true,
    angina_ccs: true,
    insuficiencia_nyha: true,
    exploracion_cardiovascular: true,
    ecg_12d: true,
  },
};

// Síntomas guía. En seguimiento se preguntan como "¿apareció o cambió algo?".
export const SINTOMAS = [
  { key: 'dolor_toracico', label: 'Dolor en el pecho (Angina)', hint: 'Opresivo retroesternal, en garra, irradiado a brazo izq / mandíbula' },
  { key: 'disnea', label: 'Falta de aire (Disnea)', clase: true, hint: 'Grandes, medianos o pequeños esfuerzos' },
  { key: 'palpitaciones', label: 'Palpitaciones / Taquicardia', hint: 'Rápidas, irregulares, inicio súbito' },
  { key: 'sincope', label: 'Desmayo (Síncope) o mareo intenso', hint: 'Con esfuerzo, al incorporarse o sin pródromos' },
  { key: 'edema', label: 'Hinchazón de piernas (Edema)', hint: 'Maleolar bilateral, vespertino con fóvea' },
  { key: 'ortopnea', label: 'Ortopnea / DPN', hint: '¿Cuántas almohadas usa? ¿Despierta asfixiado en la madrugada?' },
  { key: 'fatiga', label: 'Cansancio / Astenia', hint: 'Incapacidad para esfuerzos habituales' },
  { key: 'claudicacion', label: 'Claudicación intermitente', hint: 'Dolor en pantorrillas al caminar' },
] as const;
export type SintomaKey = (typeof SINTOMAS)[number]['key'];

export const CLASES_FUNCIONALES = ['I', 'II', 'III', 'IV'] as const;
export const CLASE_HINT: Record<string, string> = {
  I: 'Sin limitación en actividad ordinaria',
  II: 'Limitación leve en esfuerzos moderados',
  III: 'Limitación marcada con actividad mínima',
  IV: 'Síntomas presentes en reposo',
};

export const CLASES_CCS = ['CCS I', 'CCS II', 'CCS III', 'CCS IV'] as const;
export const CCS_HINT: Record<string, string> = {
  'CCS I': 'Angina solo ante esfuerzos extenuantes o prolongados',
  'CCS II': 'Ligera limitación: angina al caminar >2 cuadras o subir >1 piso',
  'CCS III': 'Marcada limitación: angina al caminar 1-2 cuadras o subir 1 piso a paso normal',
  'CCS IV': 'Incapacidad para cualquier actividad física sin angina / En reposo',
};

export const PARENTESCOS = ['Padre', 'Madre', 'Hermano/a', 'Abuelo/a paterno', 'Abuelo/a materno', 'Hijo/a', 'Otro'] as const;
export const ENF_FAMILIARES = [
  'Infarto agudo de miocardio (IAM)',
  'Muerte súbita prematura (<55a varón / <65a mujer)',
  'Hipertensión arterial',
  'Diabetes mellitus',
  'Dislipidemia / Colesterol elevado',
  'Miocardiopatía hipertrófica / dilatada',
  'Accidente cerebrovascular (EVC)',
  'Arritmia grave o marcapasos',
  'Aneurisma de aorta',
  'Otra patología',
] as const;

export const CONDICIONES = [
  'Hipertensión Arterial Sistémica (HAS)',
  'Diabetes Mellitus tipo 2',
  'Dislipidemia (Colesterol / Triglicéridos)',
  'Cardiopatía Isquémica previa',
  'Insuficiencia Cardíaca',
  'Fibrilación Auricular / Arritmia',
  'Enfermedad Renal Crónica',
  'Enfermedad Vascular Cerebral (EVC)',
  'Tiroideopatía',
  'EPOC / Asma',
  'Obesidad / Síndrome Metabólico',
] as const;

export const TIPO_CONTROL = {
  control: 'Control habitual',
  sintoma_nuevo: 'Síntoma o molestia nueva',
  resultados: 'Revisión de estudios / Labs / Cateterismo',
  post_procedimiento: 'Seguimiento post-cateterismo / stent / cirugía',
} as const;
export type TipoControl = keyof typeof TIPO_CONTROL;

export const APEGO = { si: 'Toma todo correctamente', parcial: 'Parcialmente / Olvidos frecuentes', no: 'No toma medicamentos' } as const;
export type Apego = keyof typeof APEGO;

export interface SintomaEstado { si: boolean; nota: string; clase: string }
export interface Familiar { parentesco: string; enfermedad: string; edad: string; nota: string }
export interface Medicamento { nombre: string; dosis: string }
export interface RecetaItem {
  nombre_generico: string;
  nombre_comercial: string;
  presentacion: string;
  dosis: string;
  via: string;
  frecuencia: string;
  duracion: string;
  indicaciones: string;
}

export interface LiteForm {
  // Motivo
  motivo: string;
  evolucion: string;
  tipo_control: TipoControl;
  sintomas: Record<SintomaKey, SintomaEstado>;

  // Seguimiento
  hospitalizado_desde: string;
  apego: Apego | '';
  efectos_adversos: string;
  cambios_medicamentos: string;
  pa_domicilio: string;

  // Heredofamiliares (primera vez)
  familiares: Familiar[];
  sin_antecedentes_fam: boolean;
  desconoce_fam: boolean;
  cardiopatia_precoz: boolean;
  muerte_subita_familiar: boolean;

  // Factores de Riesgo Cardiovascular & Intervencionismo (Dr. Alarcón)
  frcv_has: boolean;
  frcv_has_anios: string;
  frcv_dm2: boolean;
  frcv_dm2_hba1c: string;
  frcv_dislipidemia: boolean;
  frcv_ldl_previo: string;
  frcv_sedentarismo: boolean;

  // Antecedentes Cardiovasculares Previos / Hemodinamia
  iam_previo: boolean;
  iam_detalle: string;
  cateterismo_stents: boolean;
  stents_detalle: string;
  cirugia_crm_bypass: boolean;
  crm_detalle: string;
  marcapasos_dai: boolean;
  marcapasos_tipo: string;
  alergia_contraste_yodado: boolean;
  anticoagulacion_oral: string;
  doble_antiagregacion: string;

  // Personales y quirúrgicos generales
  condiciones: string[];
  cardiopatia_previa: string;
  cirugias: string;
  hospitalizaciones: string;
  alergias: string;
  medicamentos: Medicamento[];

  // No patológicos y estilo de vida
  tabaco: '' | 'Nunca fumó' | 'Exfumador' | 'Fumador activo';
  cigarros_dia: string;
  anios_tabaco: string;
  indice_tabaquico: string;
  alcohol: '' | 'Nunca' | 'Ocasional' | 'Frecuente' | 'Diario';
  sustancias: string;
  actividad: string;
  dieta_sueno: string;

  // Signos vitales universales (NOM-004-SSA3 Triage)
  pa_der_sis: string;
  pa_der_dia: string;
  pa_izq_sis: string;
  pa_izq_dia: string;
  fc: string;
  fr: string;
  spo2: string;
  temp: string;
  peso: string;
  talla: string;
  abdominal: string;
  glucosa_capilar: string;
  dolor_eva: string;
  ritmo_cardiaco: 'regular' | 'irregular' | '';

  // Angina de Pecho detallada (CCS)
  angina_opresiva: boolean;
  angina_irradiacion: string;
  angina_gatillo: string;
  angina_alivio_nitratos: boolean;
  clase_ccs: string;

  // Insuficiencia Cardíaca detallada
  ortopnea_almohadas: string;
  dpn_positivo: boolean;
  edema_fovea: string;

  // Exploración física cardiovascular avanzada
  ruidos_soplos: string;
  ruidos_r3_galope: boolean;
  ruidos_r4_galope: boolean;
  soplos_tipo_foco: string;
  ingurgitacion_yugular: boolean;
  reflujo_hepatoyugular: boolean;
  estertores_crepitantes: boolean;
  pulsos_perifericos: string;
  pulsos_edema: string;
  pulmones_yugulares: string;
  otros_hallazgos: string;

  // Gabinete en consultorio (ECG 12 derivaciones)
  ecg_hecho: '' | 'si' | 'no';
  ecg_ritmo: string;
  ecg_pr_ms: string;
  ecg_qrs_ms: string;
  ecg_qtc_ms: string;
  ecg_st_t: string;
  ecg_resultado: string;

  // Cierre, Diagnóstico y Estudios
  diagnostico: string;
  evolucion_nota: string;
  plan: string;
  estudios_checks: string[];
  estudios_solicitados: string;
  resultados_estudios: string;
  proxima_cita: string;

  // Receta
  receta: RecetaItem[];
}

export const emptyRecetaItem = (): RecetaItem => ({
  nombre_generico: '',
  nombre_comercial: '',
  presentacion: '',
  dosis: '',
  via: 'Oral',
  frecuencia: '',
  duracion: '',
  indicaciones: '',
});

export const emptySintomas = (): Record<SintomaKey, SintomaEstado> =>
  Object.fromEntries(SINTOMAS.map(s => [s.key, { si: false, nota: '', clase: '' }])) as Record<SintomaKey, SintomaEstado>;

export const emptyForm = (): LiteForm => ({
  motivo: '',
  evolucion: '',
  tipo_control: 'control',
  sintomas: emptySintomas(),
  hospitalizado_desde: '',
  apego: '',
  efectos_adversos: '',
  cambios_medicamentos: '',
  pa_domicilio: '',

  familiares: [],
  sin_antecedentes_fam: false,
  desconoce_fam: false,
  cardiopatia_precoz: false,
  muerte_subita_familiar: false,

  frcv_has: false,
  frcv_has_anios: '',
  frcv_dm2: false,
  frcv_dm2_hba1c: '',
  frcv_dislipidemia: false,
  frcv_ldl_previo: '',
  frcv_sedentarismo: false,

  iam_previo: false,
  iam_detalle: '',
  cateterismo_stents: false,
  stents_detalle: '',
  cirugia_crm_bypass: false,
  crm_detalle: '',
  marcapasos_dai: false,
  marcapasos_tipo: '',
  alergia_contraste_yodado: false,
  anticoagulacion_oral: '',
  doble_antiagregacion: '',

  condiciones: [],
  cardiopatia_previa: '',
  cirugias: '',
  hospitalizaciones: '',
  alergias: '',
  medicamentos: [],

  tabaco: '',
  cigarros_dia: '',
  anios_tabaco: '',
  indice_tabaquico: '',
  alcohol: '',
  sustancias: '',
  actividad: '',
  dieta_sueno: '',

  pa_der_sis: '',
  pa_der_dia: '',
  pa_izq_sis: '',
  pa_izq_dia: '',
  fc: '',
  fr: '',
  spo2: '',
  temp: '',
  peso: '',
  talla: '',
  abdominal: '',
  glucosa_capilar: '',
  dolor_eva: '',
  ritmo_cardiaco: '',

  angina_opresiva: false,
  angina_irradiacion: '',
  angina_gatillo: '',
  angina_alivio_nitratos: false,
  clase_ccs: '',

  ortopnea_almohadas: '',
  dpn_positivo: false,
  edema_fovea: '',

  ruidos_soplos: '',
  ruidos_r3_galope: false,
  ruidos_r4_galope: false,
  soplos_tipo_foco: '',
  ingurgitacion_yugular: false,
  reflujo_hepatoyugular: false,
  estertores_crepitantes: false,
  pulsos_perifericos: '',
  pulsos_edema: '',
  pulmones_yugulares: '',
  otros_hallazgos: '',

  ecg_hecho: '',
  ecg_ritmo: 'Sinusal',
  ecg_pr_ms: '',
  ecg_qrs_ms: '',
  ecg_qtc_ms: '',
  ecg_st_t: '',
  ecg_resultado: '',

  diagnostico: '',
  evolucion_nota: '',
  plan: '',
  estudios_checks: [],
  estudios_solicitados: '',
  resultados_estudios: '',
  proxima_cita: '',
  receta: [],
});

// ── Números e IMC ───────────────────────────────────────────────────────────────
export const num = (s: string | undefined | null): number | null => {
  const t = (s ?? '').toString().trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** IMC con peso en kg y talla en cm (o en m si es ≤ 3). Una decimal; null si faltan datos. */
export function calcIMC(peso: string, talla: string): number | null {
  const w = num(peso);
  let h = num(talla);
  if (!w || !h) return null;
  if (h > 3) h = h / 100;
  return Math.round((w / (h * h)) * 10) / 10;
}

export function interpIMC(imc: number | null): string {
  if (imc == null) return '';
  if (imc < 18.5) return 'Bajo peso';
  if (imc < 25) return 'Normal';
  if (imc < 30) return 'Sobrepeso';
  if (imc < 35) return 'Obesidad I';
  if (imc < 40) return 'Obesidad II';
  return 'Obesidad III (Mórbida)';
}

/** Cálculo de índice tabáquico (paquetes/año) */
export function calcIndiceTabaquico(cigarrosDia: string, aniosFumando: string): number | null {
  const c = num(cigarrosDia);
  const a = num(aniosFumando);
  if (!c || !a) return null;
  return Math.round(((c * a) / 20) * 10) / 10;
}

// ── Validación de signos vitales (avisos clínicos, nunca bloquea el guardado) ──────────
const RANGOS: Array<[keyof LiteForm, string, number, number]> = [
  ['pa_der_sis', 'Presión sistólica (der.)', 60, 260],
  ['pa_der_dia', 'Presión diastólica (der.)', 30, 150],
  ['pa_izq_sis', 'Presión sistólica (izq.)', 60, 260],
  ['pa_izq_dia', 'Presión diastólica (izq.)', 30, 150],
  ['fc', 'Frecuencia cardiaca', 25, 220],
  ['fr', 'Frecuencia respiratoria', 6, 60],
  ['spo2', 'Saturación SpO2', 50, 100],
  ['temp', 'Temperatura', 33, 42],
  ['peso', 'Peso', 2, 350],
  ['talla', 'Talla', 40, 230],
  ['abdominal', 'Perímetro abdominal', 30, 220],
  ['glucosa_capilar', 'Glucosa capilar', 30, 600],
];

export function avisosSignos(f: LiteForm): string[] {
  const out: string[] = [];

  for (const [k, label, min, max] of RANGOS) {
    const v = num(f[k] as string);
    if (v != null && (v < min || v > max)) {
      out.push(`${label}: ${v} parece fuera de rango fisiológico (${min}–${max}).`);
    }
  }

  // Alertas críticas de presión arterial
  for (const lado of ['der', 'izq'] as const) {
    const s = num(f[`pa_${lado}_sis` as keyof LiteForm] as string);
    const d = num(f[`pa_${lado}_dia` as keyof LiteForm] as string);
    if (s != null && d != null && s <= d) {
      out.push(`Presión ${lado === 'der' ? 'derecha' : 'izquierda'}: la sistólica debe ser mayor que la diastólica.`);
    }
    if (s != null && d != null) {
      if (s >= 180 || d >= 120) {
        out.push(`🚨 ALERTA: Cifras de Crisis Hipertensiva en brazo ${lado === 'der' ? 'derecho' : 'izquierdo'} (${s}/${d} mmHg).`);
      } else if (s >= 140 || d >= 90) {
        out.push(`⚠️ Hipertensión grado 2 en brazo ${lado === 'der' ? 'derecho' : 'izquierdo'} (${s}/${d} mmHg).`);
      } else if (s < 90 || d < 60) {
        out.push(`⚠️ Hipotensión en brazo ${lado === 'der' ? 'derecho' : 'izquierdo'} (${s}/${d} mmHg).`);
      }
    }
  }

  // Diferencial entre ambos brazos (> 15 mmHg sugiere estenosis subclavia o coartación)
  const sisDer = num(f.pa_der_sis);
  const sisIzq = num(f.pa_izq_sis);
  if (sisDer != null && sisIzq != null) {
    const diff = Math.abs(sisDer - sisIzq);
    if (diff > 15) {
      out.push(`⚠️ Diferencial de presión inter-brazos elevado: ${diff} mmHg (>15 mmHg sugiere patología arterial / subclavia).`);
    }
  }

  // FC y Ritmo
  const fcNum = num(f.fc);
  if (fcNum != null) {
    if (fcNum > 100) out.push(`⚠️ Taquicardia: FC ${fcNum} lpm.`);
    if (fcNum < 60) out.push(`⚠️ Bradicardia: FC ${fcNum} lpm.`);
  }

  // SpO2
  const spo2Num = num(f.spo2);
  if (spo2Num != null && spo2Num < 92) {
    out.push(`🚨 Hipoxemia: Saturación ${spo2Num}% (<92%).`);
  }

  // Glucosa
  const glu = num(f.glucosa_capilar);
  if (glu != null) {
    if (glu < 70) out.push(`🚨 Hipoglucemia capilar: ${glu} mg/dL.`);
    if (glu >= 200) out.push(`⚠️ Hiperglucemia capilar: ${glu} mg/dL.`);
  }

  // Alergia contraste yodado
  if (f.alergia_contraste_yodado) {
    out.push(`🚨 ALERTA HEMODINAMIA: Paciente con ALERGIA A MEDIOS DE CONTRASTE YODADOS.`);
  }

  return out;
}

// ── Armado de datos para guardar ─────────────────────────────────────────────
export function sintomaTexto(key: SintomaKey, e: SintomaEstado): string {
  const base = SINTOMAS.find(s => s.key === key)?.label || key;
  const partes: string[] = [];
  if (key === 'disnea' && e.clase) partes.push(`clase funcional NYHA ${e.clase}`);
  if (e.nota.trim()) partes.push(e.nota.trim());
  return partes.length ? `${base} — ${partes.join('; ')}` : base;
}

/** Tipo de visita por defecto: sin visitas previas → primera vez; si no, seguimiento. */
export function defaultKind(visitCount: number): Kind {
  return visitCount > 0 ? 'follow_up' : 'first_visit';
}

export function familiarDetalle(r: Familiar): string {
  const partes: string[] = [];
  if (r.edad.trim()) partes.push(`a los ${r.edad.trim()} años`);
  if (r.nota.trim()) partes.push(r.nota.trim());
  return partes.join(' — ');
}

/** Datos de la VISITA. Usa columnas existentes; lo demás va en dynamic_answers.lite. */
export function buildVisitPayload(f: LiteForm, kind: Kind): Record<string, unknown> {
  const first = kind === 'first_visit';
  const positivos = SINTOMAS.filter(s => f.sintomas[s.key]?.si);
  const imc = calcIMC(f.peso, f.talla);
  const motivoTxt = f.motivo.trim();
  const unir = (...xs: (string | boolean | null | undefined)[]) =>
    xs.map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).join('\n');

  // Integrar estudios solicitados (checks + texto libre)
  const todosEstudios = [
    ...(f.estudios_checks || []),
    ...(f.estudios_solicitados ? [f.estudios_solicitados.trim()] : []),
  ].filter(Boolean).join('; ');

  return {
    visit_type: kind,
    motivo: motivoTxt,
    visit_reason: first ? motivoTxt : [TIPO_CONTROL[f.tipo_control], motivoTxt].filter(Boolean).join(': '),
    symptom_since: first ? f.evolucion.trim() : '',
    symptoms: positivos.map(s => ({
      key: s.key,
      descripcion: sintomaTexto(s.key, f.sintomas[s.key]),
      nota: f.sintomas[s.key].nota.trim(),
      clase: f.sintomas[s.key].clase || null,
    })),
    pa_der_sistolica: num(f.pa_der_sis),
    pa_der_diastolica: num(f.pa_der_dia),
    pa_izq_sistolica: num(f.pa_izq_sis),
    pa_izq_diastolica: num(f.pa_izq_dia),
    heart_rate: num(f.fc),
    spo2: num(f.spo2),
    temperature: num(f.temp),
    weight: num(f.peso),
    height: num(f.talla),
    imc,
    circ_abdominal: num(f.abdominal),
    glucosa_capilar: num(f.glucosa_capilar),
    dolor_eva: num(f.dolor_eva),
    ritmo_cardiaco: f.ritmo_cardiaco || (num(f.fc) ? 'regular' : ''),

    exploracion_general: f.ruidos_soplos.trim() || (f.soplos_tipo_foco ? `Soplos: ${f.soplos_tipo_foco}` : ''),
    exploracion_extremidades: f.pulsos_edema.trim() || (f.edema_fovea ? `Edema: ${f.edema_fovea}` : ''),
    exploracion_notas: unir(
      f.pulmones_yugulares.trim() && `Pulmones y yugulares: ${f.pulmones_yugulares.trim()}`,
      f.ingurgitacion_yugular && 'Ingurgitación yugular a 45° presente',
      f.reflujo_hepatoyugular && 'Reflujo hepatoyugular positivo',
      f.estertores_crepitantes && 'Estertores crepitantes basales presentes',
      f.ruidos_r3_galope && 'R3 audible (galope ventricular / disfunción sistólica)',
      f.ruidos_r4_galope && 'R4 audible (galope auricular / hipertrofia ventricular)',
      f.pulsos_perifericos && `Pulsos: ${f.pulsos_perifericos}`,
      f.otros_hallazgos.trim() && `Otros: ${f.otros_hallazgos.trim()}`
    ),

    ecg_done: f.ecg_hecho === 'si',
    ecg_realizado: f.ecg_hecho === 'si',
    ecg_interpretation: unir(
      f.ecg_resultado.trim(),
      f.ecg_ritmo && `Ritmo: ${f.ecg_ritmo}`,
      f.ecg_pr_ms && `PR: ${f.ecg_pr_ms}ms`,
      f.ecg_qrs_ms && `QRS: ${f.ecg_qrs_ms}ms`,
      f.ecg_qtc_ms && `QTc: ${f.ecg_qtc_ms}ms`,
      f.ecg_st_t && `Alteraciones ST/T: ${f.ecg_st_t}`
    ),

    dx_presuntivo: f.diagnostico.trim(),
    medication_adherence: first ? '' : (f.apego ? APEGO[f.apego] : ''),
    medication_changes: first ? '' : f.cambios_medicamentos.trim(),
    labs_notes: f.resultados_estudios.trim(),

    dynamic_answers: {
      lite: {
        version: 2,
        kind,
        perfil: 'cardiologia_intervencionista',
        signos: {
          fr: num(f.fr),
          glucosa: num(f.glucosa_capilar),
          eva: num(f.dolor_eva),
          ritmo: f.ritmo_cardiaco,
        },
        cardiologia: {
          angina: {
            opresiva: f.angina_opresiva,
            irradiacion: f.angina_irradiacion,
            gatillo: f.angina_gatillo,
            alivio_nitratos: f.angina_alivio_nitratos,
            ccs: f.clase_ccs,
          },
          insuficiencia: {
            nyha: f.sintomas.disnea?.clase || '',
            ortopnea_almohadas: f.ortopnea_almohadas,
            dpn: f.dpn_positivo,
            edema_fovea: f.edema_fovea,
          },
          ecg_detallado: {
            ritmo: f.ecg_ritmo,
            pr_ms: f.ecg_pr_ms,
            qrs_ms: f.ecg_qrs_ms,
            qtc_ms: f.ecg_qtc_ms,
            st_t: f.ecg_st_t,
          },
        },
        cierre: {
          diagnostico: f.diagnostico.trim(),
          evolucion: f.evolucion_nota.trim(),
          plan: f.plan.trim(),
          estudios_solicitados: todosEstudios,
          proxima_cita: f.proxima_cita || null,
        },
        receta: (f.receta || [])
          .filter(m => m.nombre_generico.trim() || m.nombre_comercial.trim())
          .map(m => ({
            nombre_generico: m.nombre_generico.trim() || m.nombre_comercial.trim(),
            nombre_comercial: m.nombre_comercial.trim(),
            presentacion: m.presentacion.trim(),
            dosis: m.dosis.trim(),
            via: m.via.trim() || 'Oral',
            frecuencia: m.frecuencia.trim(),
            duracion: m.duracion.trim(),
            indicaciones: m.indicaciones.trim(),
          })),
        ...(first
          ? {
              heredofamiliar: {
                sin_antecedentes: f.sin_antecedentes_fam,
                desconoce: f.desconoce_fam,
                cardiopatia_precoz: f.cardiopatia_precoz,
                muerte_subita: f.muerte_subita_familiar,
              },
              riesgo_cardiovascular: {
                has: f.frcv_has,
                has_anios: f.frcv_has_anios,
                dm2: f.frcv_dm2,
                dm2_hba1c: f.frcv_dm2_hba1c,
                dislipidemia: f.frcv_dislipidemia,
                ldl_previo: f.frcv_ldl_previo,
                sedentarismo: f.frcv_sedentarismo,
              },
              intervencionismo: {
                iam_previo: f.iam_previo,
                iam_detalle: f.iam_detalle,
                cateterismo_stents: f.cateterismo_stents,
                stents_detalle: f.stents_detalle,
                crm_bypass: f.cirugia_crm_bypass,
                crm_detalle: f.crm_detalle,
                marcapasos: f.marcapasos_dai,
                marcapasos_tipo: f.marcapasos_tipo,
                alergia_contraste: f.alergia_contraste_yodado,
                anticoagulacion: f.anticoagulacion_oral,
                antiagregacion: f.doble_antiagregacion,
              },
              no_patologicos: {
                actividad: f.actividad.trim(),
                dieta_sueno: f.dieta_sueno.trim(),
                indice_tabaquico: f.indice_tabaquico || calcIndiceTabaquico(f.cigarros_dia, f.anios_tabaco),
              },
            }
          : {
              seguimiento: {
                tipo: f.tipo_control,
                hospitalizado_desde: f.hospitalizado_desde.trim(),
                efectos_adversos: f.efectos_adversos.trim(),
                pa_domicilio: f.pa_domicilio.trim(),
              },
            }),
      },
    },
  };
}

/** Datos del PACIENTE que se capturan solo en la primera vez (heredofamiliares, antecedentes, hábitos).
 *  Los campos vacíos no se envían para no pisar lo que ya haya en el expediente. */
export function buildPatientPatch(f: LiteForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const filas = f.familiares.filter(r => r.parentesco.trim() && r.enfermedad.trim());
  if (filas.length) {
    patch.family_other_history = filas.map(r => ({
      parentesco: r.parentesco,
      enfermedad: r.enfermedad,
      detalle: familiarDetalle(r),
    }));
  }

  // Antecedentes crónicos combinados
  const cronicos = new Set<string>(f.condiciones);
  if (f.frcv_has) cronicos.add(`Hipertensión Arterial${f.frcv_has_anios ? ` (${f.frcv_has_anios} años)` : ''}`);
  if (f.frcv_dm2) cronicos.add(`Diabetes Mellitus tipo 2${f.frcv_dm2_hba1c ? ` (HbA1c ${f.frcv_dm2_hba1c}%)` : ''}`);
  if (f.frcv_dislipidemia) cronicos.add(`Dislipidemia${f.frcv_ldl_previo ? ` (LDL previo ${f.frcv_ldl_previo} mg/dL)` : ''}`);
  if (f.iam_previo) cronicos.add(`Infarto agudo de miocardio previo (${f.iam_detalle || 'registrado'})`);
  if (f.cateterismo_stents) cronicos.add(`Stents coronarios previos (${f.stents_detalle || 'angioplastia previa'})`);
  if (f.cirugia_crm_bypass) cronicos.add(`Cirugía de bypass aortocoronario (${f.crm_detalle || 'CRM'})`);

  if (cronicos.size) {
    patch.chronic_diseases = Array.from(cronicos).join(', ');
  }

  // Notas de cardiopatía previa / intervencionismo
  const notasCardio = [
    f.cardiopatia_previa.trim(),
    f.iam_previo && `IAM previo: ${f.iam_detalle}`,
    f.cateterismo_stents && `Stents coronarios: ${f.stents_detalle}`,
    f.cirugia_crm_bypass && `CRM: ${f.crm_detalle}`,
    f.marcapasos_dai && `Dispositivo: ${f.marcapasos_tipo}`,
    f.doble_antiagregacion && `Antiagregación: ${f.doble_antiagregacion}`,
    f.anticoagulacion_oral && `Anticoagulación: ${f.anticoagulacion_oral}`,
  ].filter(Boolean).join(' | ');

  if (notasCardio) {
    patch.personal_history_notes = notasCardio;
  }

  if (f.cirugias.trim()) patch.surgeries = f.cirugias.trim();
  if (f.hospitalizaciones.trim()) patch.hospitalizations = f.hospitalizaciones.trim();

  // Alergias (incluyendo contraste yodado)
  const alergiasList = [
    f.alergias.trim(),
    f.alergia_contraste_yodado && 'MEDIO DE CONTRASTE YODADO (ALERTA HEMODINAMIA)',
  ].filter(Boolean).join(', ');

  if (alergiasList) {
    patch.allergies_medications = alergiasList;
  }

  const meds = f.medicamentos.filter(m => m.nombre.trim());
  if (meds.length) {
    patch.medications = meds.map(m => ({
      nombre: m.nombre.trim(),
      dosis: m.dosis.trim(),
      frecuencia: '',
      adherencia: '',
      desde: '',
    }));
  }

  if (f.tabaco) patch.smoking_status = f.tabaco;
  if (f.tabaco === 'Fumador activo' && f.cigarros_dia.trim()) patch.cigarettes_per_day = f.cigarros_dia.trim();
  if ((f.tabaco === 'Fumador activo' || f.tabaco === 'Exfumador') && f.anios_tabaco.trim()) patch.smoking_years = f.anios_tabaco.trim();
  if (f.alcohol) patch.alcohol_status = f.alcohol;
  if (f.sustancias.trim()) patch.sust_recreativas = f.sustancias.trim();

  return patch;
}

/** Reglas mínimas para guardar: motivo de consulta y al menos un signo vital. */
export function faltantes(f: LiteForm, kind: Kind, modConfig?: ModuleConfig): string[] {
  const out: string[] = [];
  if (!f.motivo.trim()) out.push('el motivo de la consulta');

  // Solo si el módulo de heredofamiliares está activo para este consultorio
  const pideHeredo = modConfig ? modConfig.heredofamiliares : true;
  if (kind === 'first_visit' && pideHeredo && !f.sin_antecedentes_fam && !f.desconoce_fam && f.familiares.filter(r => r.parentesco && r.enfermedad).length === 0) {
    out.push('los antecedentes heredofamiliares (agrega familiares o marca "Sin antecedentes" / "Desconoce")');
  }

  const hayVitales = [f.pa_der_sis, f.pa_izq_sis, f.fc, f.peso, f.temp, f.spo2, f.glucosa_capilar].some(v => v.trim());
  if (!hayVitales) out.push('al menos un signo vital (presión, frecuencia cardiaca, peso o glucemia)');
  return out;
}

/** ¿Debe usar el flujo Lite este consultorio? (la IA de consulta está apagada) */
export function usaConsultaLite(features: Record<string, boolean> | null | undefined): boolean {
  return !!features && features.ia_consulta === false;
}
