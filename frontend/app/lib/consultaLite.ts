// Consulta Lite: datos y reglas del flujo de consulta de cardiología SIN IA.
// Lógica pura (sin React) para poder probarla: tipos, listas, validación y armado de payloads.
// Se guarda en columnas que YA existen en `visits` y `patients`; lo que no tiene columna
// propia va en visits.dynamic_answers.lite.

export type Kind = 'first_visit' | 'follow_up';

export const KIND_LABEL: Record<Kind, string> = {
  first_visit: 'Primera vez',
  follow_up: 'Seguimiento',
};

// Síntomas guía. En seguimiento se preguntan como "¿apareció o cambió algo?".
export const SINTOMAS = [
  { key: 'dolor_toracico', label: 'Dolor en el pecho', hint: 'Tipo, esfuerzo o reposo, duración, qué lo alivia' },
  { key: 'disnea', label: 'Falta de aire', clase: true, hint: 'Con qué esfuerzo aparece' },
  { key: 'palpitaciones', label: 'Palpitaciones', hint: 'Cuándo, cuánto duran' },
  { key: 'sincope', label: 'Desmayo o casi desmayo', hint: 'Con esfuerzo, al levantarse, sin aviso' },
  { key: 'edema', label: 'Hinchazón de piernas' },
  { key: 'mareo', label: 'Mareo' },
  { key: 'fatiga', label: 'Cansancio' },
  { key: 'claudicacion', label: 'Dolor de piernas al caminar' },
] as const;
export type SintomaKey = (typeof SINTOMAS)[number]['key'];
export const CLASES_FUNCIONALES = ['I', 'II', 'III', 'IV'] as const;
export const CLASE_HINT: Record<string, string> = {
  I: 'Sin limitación', II: 'Limitación leve', III: 'Limitación marcada', IV: 'En reposo',
};

export const PARENTESCOS = ['Padre', 'Madre', 'Hermano/a', 'Abuelo/a paterno', 'Abuelo/a materno', 'Hijo/a', 'Otro'] as const;
export const ENF_FAMILIARES = [
  'Infarto o enfermedad coronaria', 'Muerte súbita', 'Hipertensión', 'Diabetes', 'Colesterol alto',
  'Embolia cerebral', 'Arritmia o marcapasos', 'Miocardiopatía', 'Cardiopatía congénita', 'Otra',
] as const;

export const CONDICIONES = [
  'Hipertensión', 'Diabetes', 'Colesterol o triglicéridos altos', 'Obesidad', 'Enfermedad renal',
  'Enfermedad de tiroides', 'Asma o EPOC', 'Embolia cerebral (EVC)',
] as const;

export const TIPO_CONTROL = {
  control: 'Control', sintoma_nuevo: 'Síntoma nuevo', resultados: 'Entrega de resultados',
} as const;
export type TipoControl = keyof typeof TIPO_CONTROL;

export const APEGO = { si: 'Toma todo', parcial: 'Parcialmente', no: 'No lo toma' } as const;
export type Apego = keyof typeof APEGO;

export interface SintomaEstado { si: boolean; nota: string; clase: string }
export interface Familiar { parentesco: string; enfermedad: string; edad: string; nota: string }
export interface Medicamento { nombre: string; dosis: string }

export interface LiteForm {
  // Motivo
  motivo: string; evolucion: string; tipo_control: TipoControl;
  sintomas: Record<SintomaKey, SintomaEstado>;
  // Seguimiento
  hospitalizado_desde: string; apego: Apego | ''; efectos_adversos: string;
  cambios_medicamentos: string; pa_domicilio: string;
  // Heredofamiliares (solo primera vez)
  familiares: Familiar[]; sin_antecedentes_fam: boolean; desconoce_fam: boolean; cardiopatia_precoz: boolean;
  // Personales (solo primera vez)
  condiciones: string[]; cardiopatia_previa: string; cirugias: string; hospitalizaciones: string;
  alergias: string; medicamentos: Medicamento[];
  // No patológicos (solo primera vez)
  tabaco: '' | 'Nunca fumó' | 'Exfumador' | 'Fumador activo'; cigarros_dia: string; anios_tabaco: string;
  alcohol: '' | 'Nunca' | 'Ocasional' | 'Frecuente' | 'Diario'; sustancias: string;
  actividad: string; dieta_sueno: string;
  // Signos vitales y medidas
  pa_der_sis: string; pa_der_dia: string; pa_izq_sis: string; pa_izq_dia: string;
  fc: string; fr: string; spo2: string; temp: string; peso: string; talla: string; abdominal: string;
  // Exploración
  ruidos_soplos: string; pulsos_edema: string; pulmones_yugulares: string; otros_hallazgos: string;
  ecg_hecho: '' | 'si' | 'no'; ecg_resultado: string;
  // Cierre
  diagnostico: string; evolucion_nota: string; plan: string; estudios_solicitados: string;
  resultados_estudios: string; proxima_cita: string;
}

export const emptySintomas = (): Record<SintomaKey, SintomaEstado> =>
  Object.fromEntries(SINTOMAS.map(s => [s.key, { si: false, nota: '', clase: '' }])) as Record<SintomaKey, SintomaEstado>;

export const emptyForm = (): LiteForm => ({
  motivo: '', evolucion: '', tipo_control: 'control', sintomas: emptySintomas(),
  hospitalizado_desde: '', apego: '', efectos_adversos: '', cambios_medicamentos: '', pa_domicilio: '',
  familiares: [], sin_antecedentes_fam: false, desconoce_fam: false, cardiopatia_precoz: false,
  condiciones: [], cardiopatia_previa: '', cirugias: '', hospitalizaciones: '', alergias: '', medicamentos: [],
  tabaco: '', cigarros_dia: '', anios_tabaco: '', alcohol: '', sustancias: '', actividad: '', dieta_sueno: '',
  pa_der_sis: '', pa_der_dia: '', pa_izq_sis: '', pa_izq_dia: '',
  fc: '', fr: '', spo2: '', temp: '', peso: '', talla: '', abdominal: '',
  ruidos_soplos: '', pulsos_edema: '', pulmones_yugulares: '', otros_hallazgos: '',
  ecg_hecho: '', ecg_resultado: '',
  diagnostico: '', evolucion_nota: '', plan: '', estudios_solicitados: '', resultados_estudios: '', proxima_cita: '',
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
  const w = num(peso); let h = num(talla);
  if (!w || !h) return null;
  if (h > 3) h = h / 100;
  return Math.round((w / (h * h)) * 10) / 10;
}

export function interpIMC(imc: number | null): string {
  if (imc == null) return '';
  if (imc < 18.5) return 'Bajo peso';
  if (imc < 25) return 'Normal';
  if (imc < 30) return 'Sobrepeso';
  return 'Obesidad';
}

// ── Validación de signos vitales (avisos, nunca bloquea el guardado) ──────────
const RANGOS: Array<[keyof LiteForm, string, number, number]> = [
  ['pa_der_sis', 'Presión sistólica (der.)', 60, 260], ['pa_der_dia', 'Presión diastólica (der.)', 30, 150],
  ['pa_izq_sis', 'Presión sistólica (izq.)', 60, 260], ['pa_izq_dia', 'Presión diastólica (izq.)', 30, 150],
  ['fc', 'Frecuencia cardiaca', 25, 220], ['fr', 'Frecuencia respiratoria', 6, 60],
  ['spo2', 'Saturación', 50, 100], ['temp', 'Temperatura', 33, 42],
  ['peso', 'Peso', 2, 350], ['talla', 'Talla', 40, 230], ['abdominal', 'Perímetro abdominal', 30, 220],
];

export function avisosSignos(f: LiteForm): string[] {
  const out: string[] = [];
  for (const [k, label, min, max] of RANGOS) {
    const v = num(f[k] as string);
    if (v != null && (v < min || v > max)) out.push(`${label}: ${v} parece fuera de rango (${min}–${max}). Revísalo.`);
  }
  for (const lado of ['der', 'izq'] as const) {
    const s = num(f[`pa_${lado}_sis` as keyof LiteForm] as string);
    const d = num(f[`pa_${lado}_dia` as keyof LiteForm] as string);
    if (s != null && d != null && s <= d) out.push(`Presión ${lado === 'der' ? 'derecha' : 'izquierda'}: la sistólica debe ser mayor que la diastólica.`);
  }
  return out;
}

// ── Armado de datos para guardar ─────────────────────────────────────────────
export function sintomaTexto(key: SintomaKey, e: SintomaEstado): string {
  const base = SINTOMAS.find(s => s.key === key)!.label;
  const partes: string[] = [];
  if (key === 'disnea' && e.clase) partes.push(`clase funcional ${e.clase}`);
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
  const positivos = SINTOMAS.filter(s => f.sintomas[s.key].si);
  const imc = calcIMC(f.peso, f.talla);
  const motivoTxt = f.motivo.trim();
  const unir = (...xs: string[]) => xs.map(x => x.trim()).filter(Boolean).join('\n');

  return {
    visit_type: kind,
    motivo: motivoTxt,
    visit_reason: first ? motivoTxt : [TIPO_CONTROL[f.tipo_control], motivoTxt].filter(Boolean).join(': '),
    symptom_since: first ? f.evolucion.trim() : '',
    symptoms: positivos.map(s => ({
      key: s.key, descripcion: sintomaTexto(s.key, f.sintomas[s.key]),
      nota: f.sintomas[s.key].nota.trim(), clase: f.sintomas[s.key].clase || null,
    })),
    pa_der_sistolica: num(f.pa_der_sis), pa_der_diastolica: num(f.pa_der_dia),
    pa_izq_sistolica: num(f.pa_izq_sis), pa_izq_diastolica: num(f.pa_izq_dia),
    heart_rate: num(f.fc), spo2: num(f.spo2), temperature: num(f.temp),
    weight: num(f.peso), height: num(f.talla), imc,
    circ_abdominal: num(f.abdominal),
    exploracion_general: f.ruidos_soplos.trim(),
    exploracion_extremidades: f.pulsos_edema.trim(),
    exploracion_notas: unir(
      f.pulmones_yugulares.trim() && `Pulmones y yugulares: ${f.pulmones_yugulares.trim()}`,
      f.otros_hallazgos.trim() && `Otros: ${f.otros_hallazgos.trim()}`,
    ),
    ecg_done: f.ecg_hecho === 'si', ecg_realizado: f.ecg_hecho === 'si',
    ecg_interpretation: f.ecg_resultado.trim(),
    dx_presuntivo: f.diagnostico.trim(),
    medication_adherence: first ? '' : (f.apego ? APEGO[f.apego] : ''),
    medication_changes: first ? '' : f.cambios_medicamentos.trim(),
    labs_notes: f.resultados_estudios.trim(),
    dynamic_answers: {
      lite: {
        version: 1, kind,
        signos: { fr: num(f.fr) },
        cierre: {
          evolucion: f.evolucion_nota.trim(), plan: f.plan.trim(),
          estudios_solicitados: f.estudios_solicitados.trim(), proxima_cita: f.proxima_cita || null,
        },
        ...(first
          ? {
              heredofamiliar: {
                sin_antecedentes: f.sin_antecedentes_fam, desconoce: f.desconoce_fam,
                cardiopatia_precoz: f.cardiopatia_precoz,
              },
              no_patologicos: { actividad: f.actividad.trim(), dieta_sueno: f.dieta_sueno.trim() },
            }
          : {
              seguimiento: {
                tipo: f.tipo_control, hospitalizado_desde: f.hospitalizado_desde.trim(),
                efectos_adversos: f.efectos_adversos.trim(), pa_domicilio: f.pa_domicilio.trim(),
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
      parentesco: r.parentesco, enfermedad: r.enfermedad, detalle: familiarDetalle(r),
    }));
  }
  if (f.condiciones.length) patch.chronic_diseases = f.condiciones.join(', ');
  if (f.cardiopatia_previa.trim()) patch.personal_history_notes = `Cardiopatía previa: ${f.cardiopatia_previa.trim()}`;
  if (f.cirugias.trim()) patch.surgeries = f.cirugias.trim();
  if (f.hospitalizaciones.trim()) patch.hospitalizations = f.hospitalizaciones.trim();
  if (f.alergias.trim()) patch.allergies_medications = f.alergias.trim();
  const meds = f.medicamentos.filter(m => m.nombre.trim());
  if (meds.length) patch.medications = meds.map(m => ({ nombre: m.nombre.trim(), dosis: m.dosis.trim(), frecuencia: '', adherencia: '', desde: '' }));
  if (f.tabaco) patch.smoking_status = f.tabaco;
  if (f.tabaco === 'Fumador activo' && f.cigarros_dia.trim()) patch.cigarettes_per_day = f.cigarros_dia.trim();
  if ((f.tabaco === 'Fumador activo' || f.tabaco === 'Exfumador') && f.anios_tabaco.trim()) patch.smoking_years = f.anios_tabaco.trim();
  if (f.alcohol) patch.alcohol_status = f.alcohol;
  if (f.sustancias.trim()) patch.sust_recreativas = f.sustancias.trim();
  return patch;
}

/** Reglas mínimas para guardar: motivo de consulta y al menos un dato de exploración o cierre. */
export function faltantes(f: LiteForm, kind: Kind): string[] {
  const out: string[] = [];
  if (!f.motivo.trim()) out.push('el motivo de la consulta');
  if (kind === 'first_visit' && !f.sin_antecedentes_fam && !f.desconoce_fam && f.familiares.filter(r => r.parentesco && r.enfermedad).length === 0) {
    out.push('los antecedentes heredofamiliares (agrega familiares o marca "Sin antecedentes" / "Desconoce")');
  }
  const hayVitales = [f.pa_der_sis, f.pa_izq_sis, f.fc, f.peso].some(v => v.trim());
  if (!hayVitales) out.push('al menos un signo vital (presión, frecuencia cardiaca o peso)');
  return out;
}

/** ¿Debe usar el flujo Lite este consultorio? (la IA de consulta está apagada) */
export function usaConsultaLite(features: Record<string, boolean> | null | undefined): boolean {
  return !!features && features.ia_consulta === false;
}
