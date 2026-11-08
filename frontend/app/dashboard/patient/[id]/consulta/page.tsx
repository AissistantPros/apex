'use client';

// Consulta APEX: Captura clínica especializada de cardiología (Dr. Wilfrido Alarcón)
// y adaptable a cualquier especialidad médica mediante configuración modular.
// Soporta primera vez (historia clínica) y seguimiento (nota de evolución). Ver lib/consultaLite.ts.

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSession, getUser } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';
import { supabase } from '@/app/lib/supabase';
import {
  APEGO, CLASES_FUNCIONALES, CLASE_HINT, CLASES_CCS, CCS_HINT, CONDICIONES, ENF_FAMILIARES,
  KIND_LABEL, PARENTESCOS, SINTOMAS, TIPO_CONTROL, DEFAULT_MODULE_CONFIGS,
  avisosSignos, buildPatientPatch, buildVisitPayload, calcIMC, calcIndiceTabaquico,
  defaultKind, emptyForm, emptyRecetaItem, faltantes, interpIMC,
  type Apego, type Kind, type LiteForm, type RecetaItem, type SintomaKey, type TipoControl,
  type ClinicalProfileKey, type ModuleConfig,
} from '@/app/lib/consultaLite';
import Icon from '@/app/components/Icon';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ─── Estilos y piezas ergonómicas con tokens CSS de tema claro/oscuro ─────────────
const inp = 'w-full px-3.5 py-2.5 min-h-[44px] bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-[var(--c-text)] text-sm outline-none placeholder-[var(--c-text-3)] transition focus:border-[var(--c-primary)] font-medium';

const Card = ({
  n,
  title,
  sub,
  badge,
  children,
}: {
  n: number | string;
  title: string;
  sub?: string;
  badge?: string;
  children: React.ReactNode;
}) => (
  <section className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5 md:p-6 shadow-xs transition">
    <div className="flex items-start justify-between gap-3 mb-4 border-b border-[var(--c-border)] pb-3">
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-[var(--c-primary)] text-xs font-bold flex items-center justify-center font-mono">
          {n}
        </span>
        <div>
          <h2 className="text-sm md:text-base font-bold text-[var(--c-text)] tracking-tight">{title}</h2>
          {sub && <p className="text-xs text-[var(--c-text-2)] mt-0.5">{sub}</p>}
        </div>
      </div>
      {badge && (
        <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-[var(--c-primary)] border border-[color-mix(in_srgb,var(--c-primary)_25%,transparent)]">
          {badge}
        </span>
      )}
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

const Lab = ({ t, children, hint }: { t: string; children: React.ReactNode; hint?: string }) => (
  <div>
    <label className="font-mono text-[11px] text-[var(--c-text-2)] uppercase font-semibold mb-1.5 block tracking-wider">{t}</label>
    {children}
    {hint && <p className="text-[11px] text-[var(--c-text-3)] mt-1">{hint}</p>}
  </div>
);

function Pills<T extends string>({
  options,
  value,
  onChange,
  labels,
  accent = 'var(--c-primary)',
}: {
  options: readonly T[];
  value: T | '';
  onChange: (v: T | '') => void;
  labels?: Record<string, string>;
  accent?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? '' : o)}
            className="px-3.5 min-h-[38px] rounded-xl border text-xs sm:text-sm font-semibold transition cursor-pointer select-none"
            style={{
              background: on ? accent : 'var(--c-subtle)',
              borderColor: on ? accent : 'var(--c-border)',
              color: on ? '#000000' : 'var(--c-text)',
            }}
          >
            {labels?.[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}

const Num = ({
  v,
  on,
  ph,
  unit,
  alerta = false,
}: {
  v: string;
  on: (s: string) => void;
  ph?: string;
  unit?: string;
  alerta?: boolean;
}) => (
  <div className="relative">
    <input
      inputMode="decimal"
      value={v}
      onChange={e => on(e.target.value)}
      placeholder={ph}
      className={`${inp} text-center text-base font-bold ${unit ? 'pr-10' : ''} ${alerta ? 'border-red-500 bg-red-500/10 text-red-400' : ''}`}
    />
    {unit && (
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--c-text-3)] font-mono pointer-events-none">
        {unit}
      </span>
    )}
  </div>
);

const fechaCorta = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function ConsultaLitePage() {
  const router = useRouter();
  const patientId = useParams()?.id as string;

  const [role, setRole] = useState('doctor');
  const [patient, setPatient] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [kind, setKind] = useState<Kind>('first_visit');
  const [f, setF] = useState<LiteForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hiper-personalización de módulos por especialidad / médico
  const [activeProfile, setActiveProfile] = useState<ClinicalProfileKey>('cardiologia_intervencionista');
  const [modConfig, setModConfig] = useState<ModuleConfig>(DEFAULT_MODULE_CONFIGS.cardiologia_intervencionista);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  // Cobro a mostrador al terminar la visita
  const [services, setServices] = useState<Array<{ id: string; nombre: string; precio: number }>>([]);
  const [cobroItems, setCobroItems] = useState<Array<{ concepto: string; precio: string; cantidad: string }>>([
    { concepto: 'Consulta especializada de cardiología', precio: '', cantidad: '1' },
  ]);

  const set = <K extends keyof LiteForm>(k: K, v: LiteForm[K]) => setF(p => ({ ...p, [k]: v }));
  const first = kind === 'first_visit';

  // Cargar configuración guardada de módulos para este médico
  useEffect(() => {
    setRole(getRole());
    try {
      const savedConfig = localStorage.getItem('apex_doctor_module_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.profile) setActiveProfile(parsed.profile);
        if (parsed.modules) setModConfig(parsed.modules);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Cargar paciente y visitas con retry y fallback directo a Supabase
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const u = await getUser().catch(() => null);
      if (!u) {
        router.push('/auth/login');
        return;
      }

      const s = await getSession();
      const headers: Record<string, string> = s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {};

      let pData: any = null;
      let vsData: any[] = [];
      let svcsData: any[] = [];

      // 1. Intento por Backend
      try {
        const [pRes, vRes, sRes] = await Promise.all([
          fetch(`${BACKEND()}/patients/${patientId}`, { headers }),
          fetch(`${BACKEND()}/visits/${patientId}`, { headers }),
          fetch(`${BACKEND()}/clinic/services`, { headers }).catch(() => null),
        ]);

        if (pRes.ok) pData = await pRes.json();
        if (vRes.ok) vsData = (await vRes.json()).visits || [];
        if (sRes && sRes.ok) svcsData = ((await sRes.json()).services || []).filter((x: any) => x.activo !== false);
      } catch (backendErr) {
        console.warn('Backend Render en cold start o no disponible, recurriendo a Supabase:', backendErr);
      }

      // 2. Fallback resiliente directo a Supabase si el backend no respondió
      if (!pData) {
        const { data: pSup } = await supabase.from('patients').select('*').eq('id', patientId).maybeSingle();
        if (pSup) {
          pData = pSup;
          const { data: vSup } = await supabase.from('visits').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
          vsData = vSup || [];
        }
      }

      if (!pData) {
        throw new Error('No se encontró el paciente en el sistema.');
      }

      setPatient(pData);
      setVisits(vsData);
      setServices(svcsData);
      if (svcsData.length > 0) {
        setCobroItems([{ concepto: svcsData[0].nombre, precio: String(svcsData[0].precio || ''), cantidad: '1' }]);
      }
      setKind(defaultKind(vsData.length));

      // Precargar datos del expediente previo para evitar re-escritura
      setF(prev => {
        const cronicas = typeof pData.chronic_diseases === 'string' ? pData.chronic_diseases : '';
        const esHAS = cronicas.toLowerCase().includes('hipertens') || cronicas.includes('HAS');
        const esDM = cronicas.toLowerCase().includes('diabet');
        const esDislip = cronicas.toLowerCase().includes('colesterol') || cronicas.toLowerCase().includes('dislipid');
        const esIAM = cronicas.toLowerCase().includes('infarto') || cronicas.toLowerCase().includes('iam');
        const esStent = cronicas.toLowerCase().includes('stent') || cronicas.toLowerCase().includes('angioplast');

        return {
          ...prev,
          familiares: Array.isArray(pData.family_other_history)
            ? pData.family_other_history.map((r: any) => ({
                parentesco: r.parentesco || '',
                enfermedad: r.enfermedad || '',
                edad: '',
                nota: r.detalle || '',
              }))
            : [],
          condiciones: typeof pData.chronic_diseases === 'string'
            ? pData.chronic_diseases.split(',').map((x: string) => x.trim()).filter((x: string) => (CONDICIONES as readonly string[]).includes(x))
            : [],
          frcv_has: esHAS,
          frcv_dm2: esDM,
          frcv_dislipidemia: esDislip,
          iam_previo: esIAM,
          cateterismo_stents: esStent,
          cirugias: pData.surgeries || '',
          hospitalizaciones: pData.hospitalizations || '',
          alergias: pData.allergies_medications || '',
          alergia_contraste_yodado: (pData.allergies_medications || '').toLowerCase().includes('contraste'),
          medicamentos: Array.isArray(pData.medications)
            ? pData.medications.map((m: any) => ({ nombre: m.nombre || '', dosis: m.dosis || '' }))
            : [],
          tabaco: pData.smoking_status || '',
          cigarros_dia: pData.cigarettes_per_day || '',
          anios_tabaco: pData.smoking_years || '',
          alcohol: pData.alcohol_status || '',
          sustancias: pData.sust_recreativas || '',
        };
      });
    } catch (e: any) {
      setError(e?.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [patientId]); // eslint-disable-line

  const imc = useMemo(() => calcIMC(f.peso, f.talla), [f.peso, f.talla]);
  const avisos = useMemo(() => avisosSignos(f), [f]);
  const indiceTab = useMemo(() => calcIndiceTabaquico(f.cigarros_dia, f.anios_tabaco), [f.cigarros_dia, f.anios_tabaco]);
  const ultima = visits[0];
  const sinAcceso = role === 'receptionist' || role === 'accounting' || role === 'marketing';

  // Guardar consulta
  const guardar = async (irAReceta: boolean = false) => {
    setError(null);
    const falta = faltantes(f, kind, modConfig);
    if (falta.length && !window.confirm(`Falta capturar:\n• ${falta.join('\n• ')}\n\n¿Deseas guardar de todos modos?`)) return;

    setSaving(true);
    try {
      const s = await getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}),
      };

      if (first) {
        const patch = buildPatientPatch(f);
        if (Object.keys(patch).length) {
          try {
            await fetch(`${BACKEND()}/patients/${patientId}`, { method: 'PUT', headers, body: JSON.stringify(patch) });
          } catch {
            await supabase.from('patients').update(patch).eq('id', patientId);
          }
        }
      }

      const payload = buildVisitPayload(f, kind);
      let newVisitId = '';

      try {
        const r = await fetch(`${BACKEND()}/visits/${patientId}`, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error();
        const vCreated = await r.json();
        newVisitId = vCreated.id || vCreated.visit_id;
      } catch {
        const { data: vSup } = await supabase.from('visits').insert({
          patient_id: patientId,
          ...payload,
          created_at: new Date().toISOString(),
        }).select().single();
        newVisitId = vSup?.id || '';
      }

      // Enviar cobro a mostrador si se definió
      const validCobros = cobroItems
        .map(it => ({
          concepto: it.concepto.trim(),
          precio: parseFloat(it.precio || '0'),
          cantidad: Math.max(1, parseInt(it.cantidad || '1', 10) || 1),
        }))
        .filter(it => it.concepto && it.precio > 0);

      if (validCobros.length > 0) {
        try {
          await fetch(`${BACKEND()}/clinic/sales`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              patient_id: patientId,
              visit_id: newVisitId || null,
              items: validCobros,
              estado: 'pendiente',
            }),
          });
        } catch {
          /* ignore */
        }
      }

      if (irAReceta && newVisitId) {
        router.push(`/dashboard/patient/${patientId}/visit/${newVisitId}/documentos`);
      } else {
        router.push(`/dashboard/patient/${patientId}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Error al guardar la consulta');
      setSaving(false);
    }
  };

  // Alternar módulos de especialidad
  const cambiarPerfil = (perfil: ClinicalProfileKey) => {
    setActiveProfile(perfil);
    setModConfig(DEFAULT_MODULE_CONFIGS[perfil]);
    try {
      localStorage.setItem('apex_doctor_module_config', JSON.stringify({ profile: perfil, modules: DEFAULT_MODULE_CONFIGS[perfil] }));
    } catch {
      /* ignore */
    }
  };

  const toggleModulo = (modKey: keyof ModuleConfig) => {
    const updated = { ...modConfig, [modKey]: !modConfig[modKey] };
    setModConfig(updated);
    setActiveProfile('personalizado');
    try {
      localStorage.setItem('apex_doctor_module_config', JSON.stringify({ profile: 'personalizado', modules: updated }));
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)] flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-10 h-10 border-3 border-[var(--c-primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--c-text-2)] font-mono">Cargando expediente clínico del paciente…</p>
      </div>
    );
  }

  if (sinAcceso) {
    return (
      <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)] flex items-center justify-center p-6 text-center">
        Tu rol actual en el sistema no tiene permisos para capturar consultas médicas.
      </div>
    );
  }

  let n = 0;

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)] pb-36">
      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-6">

        {/* ── NAVEGACIÓN SUPERIOR Y BOTÓN DE RETORNO ── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push(`/dashboard/patient/${patientId}`)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--c-text-2)] hover:text-[var(--c-text)] transition cursor-pointer"
          >
            ← Volver al expediente del paciente
          </button>
          <button
            type="button"
            onClick={() => setConfigModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] text-xs font-semibold text-[var(--c-primary)] hover:border-[var(--c-primary)] transition cursor-pointer"
          >
            ⚙️ Personalizar Cuestionario
          </button>
        </div>

        {/* ── HEADER CLÍNICO ESPECIALIZADO ── */}
        <header className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-[var(--c-primary)]">
                  CONSULTA MÉDICA
                </span>
                <span className="text-xs text-[var(--c-text-3)] font-mono">
                  ID: {patient?.id || patientId}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[var(--c-text)] mt-1">
                {patient?.full_name || 'Paciente'}
              </h1>
              <p className="text-xs text-[var(--c-text-2)] mt-0.5">
                {patient?.date_of_birth ? `Nacimiento: ${patient.date_of_birth}` : ''}
                {patient?.sexo_biologico ? ` · Sexo: ${patient.sexo_biologico}` : ''}
                {patient?.phone ? ` · WhatsApp: ${patient.phone}` : ''}
              </p>
            </div>

            {/* Badge Especialidad Dr. Alarcón */}
            <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--c-border)]">
              <span className="inline-block text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-[color-mix(in_srgb,var(--c-success)_15%,transparent)] text-[var(--c-success)] border border-[color-mix(in_srgb,var(--c-success)_30%,transparent)]">
                🩺 Cardiología Intervencionista
              </span>
              <p className="text-[11px] text-[var(--c-text-3)] font-mono mt-1">Dr. Wilfrido Alarcón García</p>
            </div>
          </div>

          {/* Selector de Modo: Primera Vez vs Seguimiento */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--c-border)]">
            <Pills
              options={['first_visit', 'follow_up'] as const}
              value={kind}
              onChange={v => v && setKind(v)}
              labels={KIND_LABEL}
              accent="var(--c-primary)"
            />
            <span className="text-xs text-[var(--c-text-2)]">
              {first ? 'Historia clínica completa de admisión' : 'Nota de evolución: seguimiento focalizado'}
            </span>
          </div>
        </header>

        {/* ── BANNER DE ERROR CON ACCIÓN DE REINTENTO ── */}
        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 text-red-400 p-4 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>{error}</span>
            </div>
            <button
              onClick={loadData}
              className="px-3.5 py-1.5 rounded-xl bg-red-500 text-black font-semibold text-xs hover:bg-red-400 transition self-start sm:self-auto cursor-pointer"
            >
              Reintentar conexión
            </button>
          </div>
        )}

        {/* ── RESUMEN DE ÚLTIMA VISITA (SEGUIMIENTO) ── */}
        {!first && ultima && (
          <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-subtle)] p-4 text-xs sm:text-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] text-[var(--c-text-3)] uppercase font-bold tracking-wider">
                ÚLTIMA VISITA REGISTRADA · {fechaCorta(ultima.created_at)}
              </p>
              <span className="text-[10px] font-mono text-[var(--c-text-3)]">Expediente previo</span>
            </div>
            {ultima.dx_presuntivo && (
              <p className="font-medium text-[var(--c-text)]">
                <span className="text-[var(--c-text-2)]">Diagnóstico previo:</span> {ultima.dx_presuntivo}
              </p>
            )}
            <p className="text-[var(--c-text-2)]">
              {[
                ultima.pa_der_sistolica && `PA: ${ultima.pa_der_sistolica}/${ultima.pa_der_diastolica ?? '–'} mmHg`,
                ultima.heart_rate && `FC: ${ultima.heart_rate} lpm`,
                ultima.weight && `Peso: ${ultima.weight} kg`,
                ultima.imc && `IMC: ${ultima.imc}`,
              ].filter(Boolean).join(' · ') || 'Sin signos vitales registrados en la visita previa'}
            </p>
            {ultima.dynamic_answers?.lite?.cierre?.plan && (
              <p className="text-[var(--c-text-2)]">
                <span className="text-[var(--c-text-3)]">Plan previo:</span> {ultima.dynamic_answers.lite.cierre.plan}
              </p>
            )}
          </div>
        )}

        {/* ── 1. MOTIVO DE CONSULTA Y SÍNTOMAS GUÍA ── */}
        <Card
          n={++n}
          title={first ? 'Motivo de consulta y síntomas guía' : 'Motivo de la visita de seguimiento'}
          sub={first ? 'Exploración de la molestia principal que motiva la atención.' : '¿Qué ha cambiado o evolucionado desde la última cita?'}
        >
          {!first && (
            <Lab t="Tipo de seguimiento">
              <Pills
                options={Object.keys(TIPO_CONTROL) as TipoControl[]}
                value={f.tipo_control}
                onChange={v => v && set('tipo_control', v)}
                labels={TIPO_CONTROL}
              />
            </Lab>
          )}

          <Lab t="Motivo principal de consulta">
            <textarea
              rows={2}
              className={inp}
              value={f.motivo}
              onChange={e => set('motivo', e.target.value)}
              placeholder={first ? 'Ej. Dolor torácico opresivo de 3 semanas de evolución, fatiga ante esfuerzos moderados...' : 'Control de hipertensión, revisión de Holter 24h, seguimiento post-cateterismo...'}
            />
          </Lab>

          {first && (
            <Lab t="Tiempo de evolución">
              <input
                className={inp}
                value={f.evolucion}
                onChange={e => set('evolucion', e.target.value)}
                placeholder="Ej. Hace 3 semanas, progresivo al caminar 2 cuadras"
              />
            </Lab>
          )}

          {/* Interrogatorio sintomático cardiovascular en cuadrícula ordenada */}
          <div className="space-y-2 pt-2">
            <p className="text-[11px] font-mono text-[var(--c-text-2)] uppercase font-semibold">
              Interrogatorio dirigido de síntomas cardiovasculares:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SINTOMAS.map(s => {
                const e = f.sintomas[s.key as SintomaKey];
                const upd = (patch: Partial<typeof e>) =>
                  set('sintomas', { ...f.sintomas, [s.key]: { ...e, ...patch } });
                return (
                  <div
                    key={s.key}
                    className={`rounded-xl border p-3 transition ${
                      e.si
                        ? 'border-[var(--c-primary)] bg-[color-mix(in_srgb,var(--c-primary)_10%,transparent)]'
                        : 'border-[var(--c-border)] bg-[var(--c-subtle)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => upd({ si: !e.si })}
                      className="w-full flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="text-xs sm:text-sm font-semibold text-[var(--c-text)]">{s.label}</span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                          e.si ? 'bg-[var(--c-primary)] text-black' : 'bg-[var(--c-card)] text-[var(--c-text-3)] border border-[var(--c-border)]'
                        }`}
                      >
                        {e.si ? 'SÍ' : 'NO'}
                      </span>
                    </button>

                    {e.si && (
                      <div className="mt-2.5 space-y-2 pt-2 border-t border-[var(--c-border)]">
                        {'clase' in s && s.clase && (
                          <div>
                            <p className="text-[10px] font-mono text-[var(--c-text-2)] mb-1">Clase funcional NYHA:</p>
                            <Pills
                              options={CLASES_FUNCIONALES}
                              value={e.clase as any}
                              onChange={v => upd({ clase: v })}
                              labels={Object.fromEntries(CLASES_FUNCIONALES.map(c => [c, `${c} · ${CLASE_HINT[c]}`]))}
                            />
                          </div>
                        )}
                        <input
                          className={inp}
                          value={e.nota}
                          onChange={ev => upd({ nota: ev.target.value })}
                          placeholder={('hint' in s && s.hint) || 'Detalles adicionales'}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* ── 2. MÓDULO CARDIOVASCULAR ESPECIALIZADO: EVALUACIÓN DE ANGINA (CCS) ── */}
        {modConfig.angina_ccs && (
          <Card
            n={++n}
            title="Caracterización de Dolor Torácico (Angina de Pecho)"
            sub="Evaluación semiológica y estratificación según la Sociedad Canadiense de Cardiología (CCS)"
            badge="Hemodinamia"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.angina_opresiva}
                  onChange={e => set('angina_opresiva', e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--c-primary)]"
                />
                <span className="text-xs sm:text-sm font-semibold text-[var(--c-text)]">
                  Dolor opresivo retroesternal (&quot;en garra&quot; / signo de Levine)
                </span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.angina_alivio_nitratos}
                  onChange={e => set('angina_alivio_nitratos', e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--c-primary)]"
                />
                <span className="text-xs sm:text-sm font-semibold text-[var(--c-text)]">
                  Alivia con reposo o nitratos en &lt; 5 minutos
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Lab t="Irradiación del dolor" hint="Ej. Brazo izquierdo, cuello, mandíbula, dorso, epigastrio">
                <input
                  className={inp}
                  value={f.angina_irradiacion}
                  onChange={e => set('angina_irradiacion', e.target.value)}
                  placeholder="Ej. Brazo izquierdo borde cubital y mandíbula"
                />
              </Lab>
              <Lab t="Desencadenante / Gatillo" hint="Ej. Esfuerzo físico, estrés emocional, frío, reposo">
                <input
                  className={inp}
                  value={f.angina_gatillo}
                  onChange={e => set('angina_gatillo', e.target.value)}
                  placeholder="Ej. Caminar 100 metros o subir escaleras"
                />
              </Lab>
            </div>

            <Lab t="Clase de Severidad de Angina (CCS Canadiense)">
              <Pills
                options={CLASES_CCS}
                value={f.clase_ccs as any}
                onChange={v => set('clase_ccs', v)}
                labels={Object.fromEntries(CLASES_CCS.map(c => [c, `${c}: ${CCS_HINT[c]}`]))}
              />
            </Lab>
          </Card>
        )}

        {/* ── 3. FACTORES DE RIESGO CARDIOVASCULAR (FRCV) E INTERVENCIONISMO (DR. ALARCÓN) ── */}
        {first && modConfig.frcv_cardiovascular && (
          <Card
            n={++n}
            title="Factores de Riesgo Cardiovascular (FRCV) & Antecedentes Coronarios"
            sub="Historia basal de intervencionismo, cateterismo y riesgo isquémico"
            badge="Cardiología Intervencionista"
          >
            {/* Factores de riesgo mayores */}
            <div className="space-y-3">
              <p className="text-[11px] font-mono text-[var(--c-text-2)] uppercase font-semibold">
                Factores de Riesgo Cardiovascular Mayores:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* HAS */}
                <div className={`p-3 rounded-xl border ${f.frcv_has ? 'border-[var(--c-primary)] bg-[color-mix(in_srgb,var(--c-primary)_8%,transparent)]' : 'border-[var(--c-border)] bg-[var(--c-subtle)]'}`}>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={f.frcv_has}
                      onChange={e => set('frcv_has', e.target.checked)}
                      className="w-4 h-4 rounded text-[var(--c-primary)]"
                    />
                    <span className="text-xs font-bold text-[var(--c-text)]">Hipertensión Arterial (HAS)</span>
                  </label>
                  {f.frcv_has && (
                    <input
                      className={inp}
                      placeholder="Años de evolución"
                      value={f.frcv_has_anios}
                      onChange={e => set('frcv_has_anios', e.target.value)}
                    />
                  )}
                </div>

                {/* DM2 */}
                <div className={`p-3 rounded-xl border ${f.frcv_dm2 ? 'border-[var(--c-primary)] bg-[color-mix(in_srgb,var(--c-primary)_8%,transparent)]' : 'border-[var(--c-border)] bg-[var(--c-subtle)]'}`}>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={f.frcv_dm2}
                      onChange={e => set('frcv_dm2', e.target.checked)}
                      className="w-4 h-4 rounded text-[var(--c-primary)]"
                    />
                    <span className="text-xs font-bold text-[var(--c-text)]">Diabetes Mellitus 2 (DM2)</span>
                  </label>
                  {f.frcv_dm2 && (
                    <input
                      className={inp}
                      placeholder="Última HbA1c (%)"
                      value={f.frcv_dm2_hba1c}
                      onChange={e => set('frcv_dm2_hba1c', e.target.value)}
                    />
                  )}
                </div>

                {/* Dislipidemia */}
                <div className={`p-3 rounded-xl border ${f.frcv_dislipidemia ? 'border-[var(--c-primary)] bg-[color-mix(in_srgb,var(--c-primary)_8%,transparent)]' : 'border-[var(--c-border)] bg-[var(--c-subtle)]'}`}>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={f.frcv_dislipidemia}
                      onChange={e => set('frcv_dislipidemia', e.target.checked)}
                      className="w-4 h-4 rounded text-[var(--c-primary)]"
                    />
                    <span className="text-xs font-bold text-[var(--c-text)]">Dislipidemia / Colesterol</span>
                  </label>
                  {f.frcv_dislipidemia && (
                    <input
                      className={inp}
                      placeholder="Último LDL (mg/dL)"
                      value={f.frcv_ldl_previo}
                      onChange={e => set('frcv_ldl_previo', e.target.value)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Antecedentes de Cateterismo / Stent / IAM */}
            <div className="space-y-3 pt-3 border-t border-[var(--c-border)]">
              <p className="text-[11px] font-mono text-[var(--c-text-2)] uppercase font-semibold">
                Antecedentes de Cateterismo, Infarto & Procedimientos Previos:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f.iam_previo}
                      onChange={e => set('iam_previo', e.target.checked)}
                      className="w-4 h-4 rounded text-[var(--c-primary)]"
                    />
                    <span className="text-xs font-bold text-[var(--c-text)]">Infarto Agudo de Miocardio previo (IAM)</span>
                  </label>
                  {f.iam_previo && (
                    <input
                      className={inp}
                      placeholder="Año y cara (ej. 2021, IAM Anterior extenso)"
                      value={f.iam_detalle}
                      onChange={e => set('iam_detalle', e.target.value)}
                    />
                  )}
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f.cateterismo_stents}
                      onChange={e => set('cateterismo_stents', e.target.checked)}
                      className="w-4 h-4 rounded text-[var(--c-primary)]"
                    />
                    <span className="text-xs font-bold text-[var(--c-text)]">Cateterismo / Stents Coronarios Previos</span>
                  </label>
                  {f.cateterismo_stents && (
                    <input
                      className={inp}
                      placeholder="Vasos y tipo (ej. Stent medicado DES en DA y CD)"
                      value={f.stents_detalle}
                      onChange={e => set('stents_detalle', e.target.value)}
                    />
                  )}
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f.cirugia_crm_bypass}
                      onChange={e => set('cirugia_crm_bypass', e.target.checked)}
                      className="w-4 h-4 rounded text-[var(--c-primary)]"
                    />
                    <span className="text-xs font-bold text-[var(--c-text)]">Cirugía de Bypass Coronario (CRM)</span>
                  </label>
                  {f.cirugia_crm_bypass && (
                    <input
                      className={inp}
                      placeholder="Detalles de puentes (ej. Mamaria a DA y safena a CD)"
                      value={f.crm_detalle}
                      onChange={e => set('crm_detalle', e.target.value)}
                    />
                  )}
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f.marcapasos_dai}
                      onChange={e => set('marcapasos_dai', e.target.checked)}
                      className="w-4 h-4 rounded text-[var(--c-primary)]"
                    />
                    <span className="text-xs font-bold text-[var(--c-text)]">Marcapasos / Desfibrilador (DAI / TRC)</span>
                  </label>
                  {f.marcapasos_dai && (
                    <input
                      className={inp}
                      placeholder="Tipo y fecha de implante"
                      value={f.marcapasos_tipo}
                      onChange={e => set('marcapasos_tipo', e.target.value)}
                    />
                  )}
                </div>
              </div>

              {/* Alerta de contraste yodado */}
              <div className="p-3.5 rounded-xl border border-red-500/40 bg-red-500/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">💉</span>
                  <div>
                    <p className="text-xs font-bold text-red-400">Alergia a Medios de Contraste Yodados</p>
                    <p className="text-[11px] text-[var(--c-text-2)]">Crítico para sala de hemodinámica y angiografía coronaria</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.alergia_contraste_yodado}
                    onChange={e => set('alergia_contraste_yodado', e.target.checked)}
                    className="w-4 h-4 rounded text-red-500"
                  />
                  <span className="text-xs font-bold text-red-400">Presente</span>
                </label>
              </div>

              {/* Farmacología Crítica */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <Lab t="Terapia Antiplaquetaria / Doble Antiagregación">
                  <input
                    className={inp}
                    value={f.doble_antiagregacion}
                    onChange={e => set('doble_antiagregacion', e.target.value)}
                    placeholder="Ej. Aspirina 100mg + Clopidogrel 75mg diario"
                  />
                </Lab>
                <Lab t="Anticoagulación Oral (DOAC / Warfarina)">
                  <input
                    className={inp}
                    value={f.anticoagulacion_oral}
                    onChange={e => set('anticoagulacion_oral', e.target.value)}
                    placeholder="Ej. Apixabán 5mg c/12h o Warfarina con INR 2.5"
                  />
                </Lab>
              </div>
            </div>
          </Card>
        )}

        {/* ── 4. ANTECEDENTES HEREDOFAMILIARES (PRIMERA VEZ) ── */}
        {first && modConfig.heredofamiliares && (
          <Card
            n={++n}
            title="Antecedentes Heredofamiliares"
            sub="Riesgo cardiovascular genético de primer grado (muerte súbita, infartos precoces)"
          >
            <div className="flex flex-wrap gap-2">
              {[
                ['sin_antecedentes_fam', 'Sin antecedentes'],
                ['desconoce_fam', 'Desconoce'],
                ['cardiopatia_precoz', 'Infarto precoz en familiar (<55a)'],
                ['muerte_subita_familiar', 'Muerte súbita familiar'],
              ].map(([k, label]) => {
                const on = Boolean(f[k as keyof LiteForm]);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set(k as any, !on as any)}
                    className="px-3.5 min-h-[38px] rounded-xl border text-xs sm:text-sm font-semibold transition cursor-pointer select-none"
                    style={{
                      background: on ? 'var(--c-primary)' : 'var(--c-subtle)',
                      borderColor: on ? 'var(--c-primary)' : 'var(--c-border)',
                      color: on ? '#000000' : 'var(--c-text)',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {f.familiares.map((r, i) => {
              const upd = (patch: Partial<typeof r>) =>
                set('familiares', f.familiares.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className={inp}
                      value={r.parentesco}
                      onChange={e => upd({ parentesco: e.target.value })}
                    >
                      <option value="">Familiar…</option>
                      {PARENTESCOS.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <select
                      className={inp}
                      value={r.enfermedad}
                      onChange={e => upd({ enfermedad: e.target.value })}
                    >
                      <option value="">Enfermedad…</option>
                      {ENF_FAMILIARES.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-[100px_1fr_auto] gap-2">
                    <input
                      inputMode="numeric"
                      className={inp}
                      value={r.edad}
                      onChange={e => upd({ edad: e.target.value })}
                      placeholder="Edad"
                    />
                    <input
                      className={inp}
                      value={r.nota}
                      onChange={e => upd({ nota: e.target.value })}
                      placeholder="Nota (falleció, tratamiento…)"
                    />
                    <button
                      type="button"
                      aria-label="Quitar"
                      onClick={() => set('familiares', f.familiares.filter((_, j) => j !== i))}
                      className="px-3 rounded-xl bg-[var(--c-card)] border border-[var(--c-border)] text-red-400 text-lg hover:border-red-400 transition cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => set('familiares', [...f.familiares, { parentesco: '', enfermedad: '', edad: '', nota: '' }])}
              className="w-full min-h-[42px] rounded-xl border border-dashed border-[var(--c-primary)] text-[var(--c-primary)] text-xs font-semibold hover:bg-[color-mix(in_srgb,var(--c-primary)_8%,transparent)] transition cursor-pointer"
            >
              + Agregar familiar con patología
            </button>
          </Card>
        )}

        {/* ── 5. HÁBITOS, ESTILO DE VIDA Y TABAQUISMO (PRIMERA VEZ) ── */}
        {first && modConfig.estilo_vida && (
          <Card
            n={++n}
            title="Estilo de Vida, Tabaquismo & Alergias"
            sub="Índice tabáquico paquetes/año y hábitos de salud"
          >
            <div className="space-y-3">
              <Lab t="Consumo de Tabaco">
                <Pills
                  options={['Nunca fumó', 'Exfumador', 'Fumador activo'] as const}
                  value={f.tabaco}
                  onChange={v => set('tabaco', v)}
                />
              </Lab>

              {(f.tabaco === 'Fumador activo' || f.tabaco === 'Exfumador') && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-[var(--c-subtle)] border border-[var(--c-border)]">
                  <Lab t="Cigarros al día">
                    <Num v={f.cigarros_dia} on={v => set('cigarros_dia', v)} ph="Ej. 10" />
                  </Lab>
                  <Lab t="Años fumando">
                    <Num v={f.anios_tabaco} on={v => set('anios_tabaco', v)} ph="Ej. 20" unit="años" />
                  </Lab>
                  <Lab t="Índice Tabáquico">
                    <div className={`${inp} text-center font-bold flex items-center justify-center`}>
                      {indiceTab != null ? (
                        <span className={indiceTab >= 20 ? 'text-red-400' : 'text-[var(--c-text)]'}>
                          {indiceTab} paq/año {indiceTab >= 20 ? '⚠️ (Alto Riesgo)' : ''}
                        </span>
                      ) : (
                        <span className="text-[var(--c-text-3)]">—</span>
                      )}
                    </div>
                  </Lab>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Lab t="Consumo de Alcohol">
                  <Pills
                    options={['Nunca', 'Ocasional', 'Frecuente', 'Diario'] as const}
                    value={f.alcohol}
                    onChange={v => set('alcohol', v)}
                  />
                </Lab>
                <Lab t="Actividad Física">
                  <input
                    className={inp}
                    value={f.actividad}
                    onChange={e => set('actividad', e.target.value)}
                    placeholder="Sedentario, camina 30 min, gimnasio..."
                  />
                </Lab>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Lab t="Alergias Medicamentosas / Alimentarias">
                  <input
                    className={inp}
                    value={f.alergias}
                    onChange={e => set('alergias', e.target.value)}
                    placeholder="Ej. Penicilina, AINEs, Mariscos (o 'Ninguna')"
                  />
                </Lab>
                <Lab t="Cirugías Previas">
                  <input
                    className={inp}
                    value={f.cirugias}
                    onChange={e => set('cirugias', e.target.value)}
                    placeholder="Ej. Apendicectomía, Colecistectomía..."
                  />
                </Lab>
              </div>
            </div>
          </Card>
        )}

        {/* ── 6. SIGNOS VITALES & TRIAJE BÁSICO UNIVERSAL (NOM-004-SSA3) ── */}
        <Card
          n={++n}
          title="Signos Vitales & Triaje Somatométrico"
          sub="Requerido por NOM-004. Capturado por enfermería o médico tratante."
          badge="Obligatorio NOM-004"
        >
          {/* Presión arterial bilateral (diferencial clínico) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--c-subtle)] border border-[var(--c-border)]">
            <Lab t="Presión Brazo Derecho (Sist / Diast)" hint="Brazo de referencia">
              <div className="flex items-center gap-2">
                <Num v={f.pa_der_sis} on={v => set('pa_der_sis', v)} ph="Sist" unit="mmHg" />
                <span className="text-[var(--c-text-3)] font-bold">/</span>
                <Num v={f.pa_der_dia} on={v => set('pa_der_dia', v)} ph="Diast" unit="mmHg" />
              </div>
            </Lab>

            <Lab t="Presión Brazo Izquierdo (Sist / Diast)" hint="Para descartar diferencial patológico >15">
              <div className="flex items-center gap-2">
                <Num v={f.pa_izq_sis} on={v => set('pa_izq_sis', v)} ph="Sist" unit="mmHg" />
                <span className="text-[var(--c-text-3)] font-bold">/</span>
                <Num v={f.pa_izq_dia} on={v => set('pa_izq_dia', v)} ph="Diast" unit="mmHg" />
              </div>
            </Lab>
          </div>

          {/* Somatometría y Signos de Triaje */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <Lab t="Frec. Cardíaca (FC)">
              <Num v={f.fc} on={v => set('fc', v)} ph="Ej. 72" unit="lpm" />
            </Lab>
            <Lab t="Ritmo Cardíaco">
              <select
                className={inp}
                value={f.ritmo_cardiaco}
                onChange={e => set('ritmo_cardiaco', e.target.value as any)}
              >
                <option value="">— Ritmo —</option>
                <option value="regular">Regular / Rítmico</option>
                <option value="irregular">Irregular / Arritmia</option>
              </select>
            </Lab>
            <Lab t="Saturación O2 (SpO2)">
              <Num v={f.spo2} on={v => set('spo2', v)} ph="Ej. 98" unit="%" />
            </Lab>
            <Lab t="Frec. Respiratoria">
              <Num v={f.fr} on={v => set('fr', v)} ph="Ej. 16" unit="rpm" />
            </Lab>
            <Lab t="Temperatura">
              <Num v={f.temp} on={v => set('temp', v)} ph="Ej. 36.5" unit="°C" />
            </Lab>
            <Lab t="Glucosa Capilar">
              <Num v={f.glucosa_capilar} on={v => set('glucosa_capilar', v)} ph="Ej. 95" unit="mg/dL" />
            </Lab>
            <Lab t="Peso Corporal">
              <Num v={f.peso} on={v => set('peso', v)} ph="Ej. 75" unit="kg" />
            </Lab>
            <Lab t="Estatura / Talla">
              <Num v={f.talla} on={v => set('talla', v)} ph="Ej. 172" unit="cm" />
            </Lab>
            <Lab t="Cintura / Abdominal">
              <Num v={f.abdominal} on={v => set('abdominal', v)} ph="Ej. 88" unit="cm" />
            </Lab>
            <Lab t="Índice Masa (IMC)">
              <div className={`${inp} text-center font-bold flex items-center justify-center gap-1.5`}>
                {imc != null ? (
                  <>
                    <span className="text-sm sm:text-base">{imc}</span>
                    <span className="text-[10px] text-[var(--c-text-2)] font-normal font-mono">({interpIMC(imc)})</span>
                  </>
                ) : (
                  <span className="text-[var(--c-text-3)]">—</span>
                )}
              </div>
            </Lab>
            <Lab t="Dolor (Escala EVA 0-10)">
              <select
                className={inp}
                value={f.dolor_eva}
                onChange={e => set('dolor_eva', e.target.value)}
              >
                <option value="">0 - Sin dolor</option>
                <option value="1">1 - Dolor leve</option>
                <option value="2">2 - Dolor leve</option>
                <option value="3">3 - Dolor moderado</option>
                <option value="4">4 - Dolor moderado</option>
                <option value="5">5 - Dolor moderado</option>
                <option value="6">6 - Dolor intenso</option>
                <option value="7">7 - Dolor intenso</option>
                <option value="8">8 - Muy intenso</option>
                <option value="9">9 - Casi insoportable</option>
                <option value="10">10 - Insoportable</option>
              </select>
            </Lab>
          </div>

          {/* Alertas clínicas automáticas */}
          {avisos.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs sm:text-sm text-amber-400 space-y-1">
              <p className="font-bold uppercase font-mono text-[11px]">Alertas Clínicas Detectadas:</p>
              {avisos.map((a, idx) => (
                <p key={idx} className="flex items-start gap-1.5">
                  <span>•</span>
                  <span>{a}</span>
                </p>
              ))}
            </div>
          )}
        </Card>

        {/* ── 7. EXPLORACIÓN FÍSICA CARDIOVASCULAR ESPECIALIZADA ── */}
        {modConfig.exploracion_cardiovascular && (
          <Card
            n={++n}
            title="Exploración Física Cardiovascular Focalizada"
            sub="Ruidos cardíacos, soplos, ingurgitación yugular, auscultación pulmonar y pulsos periféricos"
            badge="Exploración"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.ruidos_r3_galope}
                  onChange={e => set('ruidos_r3_galope', e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--c-primary)]"
                />
                <div>
                  <span className="text-xs font-bold text-[var(--c-text)]">R3 audible (Galope ventricular)</span>
                  <p className="text-[10px] text-[var(--c-text-3)]">Sugiere sobrecarga de volumen / falla sistólica</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.ruidos_r4_galope}
                  onChange={e => set('ruidos_r4_galope', e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--c-primary)]"
                />
                <div>
                  <span className="text-xs font-bold text-[var(--c-text)]">R4 audible (Galope auricular)</span>
                  <p className="text-[10px] text-[var(--c-text-3)]">Sugiere hipertrofia ventricular / rigidez por HAS</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.ingurgitacion_yugular}
                  onChange={e => set('ingurgitacion_yugular', e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--c-primary)]"
                />
                <div>
                  <span className="text-xs font-bold text-[var(--c-text)]">Ingurgitación Yugular a 45°</span>
                  <p className="text-[10px] text-[var(--c-text-3)]">Elevación de presión venosa central (PVC)</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.estertores_crepitantes}
                  onChange={e => set('estertores_crepitantes', e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--c-primary)]"
                />
                <div>
                  <span className="text-xs font-bold text-[var(--c-text)]">Estertores Crepitantes Basales</span>
                  <p className="text-[10px] text-[var(--c-text-3)]">Congestión pulmonar / marea ascendente</p>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Lab t="Auscultación de Soplos Cardíacos">
                <input
                  className={inp}
                  value={f.soplos_tipo_foco}
                  onChange={e => set('soplos_tipo_foco', e.target.value)}
                  placeholder="Ej. Sistólico expulsivo aórtico III/VI con irradiación carotídea"
                />
              </Lab>
              <Lab t="Pulsos Periféricos y Perfusión Distal">
                <input
                  className={inp}
                  value={f.pulsos_perifericos}
                  onChange={e => set('pulsos_perifericos', e.target.value)}
                  placeholder="Ej. Radiales simétricos, femorales y pedios conservados"
                />
              </Lab>
            </div>

            <Lab t="Edema Periférico en Miembros Inferiores">
              <Pills
                options={['Sin edema', '+/++++ leve maleolar', '++/++++ tercio inferior', '+++/++++ hasta rodilla', '++++/++++ anasarca'] as const}
                value={f.edema_fovea as any}
                onChange={v => set('edema_fovea', v)}
              />
            </Lab>
          </Card>
        )}

        {/* ── 8. GABINETE EN CONSULTORIO: ECG DE 12 DERIVACIONES ── */}
        {modConfig.ecg_12d && (
          <Card
            n={++n}
            title="Electrocardiograma de 12 Derivaciones (Gabinete)"
            sub="Interpretación sistemática en consultorio: ritmo, intervalos y alteraciones isquémicas"
            badge="ECG 12D"
          >
            <div className="flex items-center gap-3">
              <Lab t="¿ECG Realizado en esta visita?">
                <Pills
                  options={['si', 'no'] as const}
                  value={f.ecg_hecho}
                  onChange={v => set('ecg_hecho', v)}
                  labels={{ si: 'Sí, realizado hoy', no: 'No realizado' }}
                />
              </Lab>
            </div>

            {f.ecg_hecho === 'si' && (
              <div className="space-y-3 pt-3 border-t border-[var(--c-border)]">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Lab t="Ritmo Cardíaco">
                    <select
                      className={inp}
                      value={f.ecg_ritmo}
                      onChange={e => set('ecg_ritmo', e.target.value)}
                    >
                      <option value="Sinusal">Ritmo Sinusal</option>
                      <option value="Fibrilación Auricular">Fibrilación Auricular (FA)</option>
                      <option value="Flutter Auricular">Flutter Auricular</option>
                      <option value="Bloqueo AV">Bloqueo AV</option>
                      <option value="Ritmo de Marcapasos">Ritmo de Marcapasos</option>
                      <option value="Otro">Otro ritmo</option>
                    </select>
                  </Lab>

                  <Lab t="Intervalo PR">
                    <Num v={f.ecg_pr_ms} on={v => set('ecg_pr_ms', v)} ph="Ej. 160" unit="ms" />
                  </Lab>

                  <Lab t="Complejo QRS">
                    <Num v={f.ecg_qrs_ms} on={v => set('ecg_qrs_ms', v)} ph="Ej. 90" unit="ms" />
                  </Lab>

                  <Lab t="Intervalo QTc">
                    <Num v={f.ecg_qtc_ms} on={v => set('ecg_qtc_ms', v)} ph="Ej. 420" unit="ms" />
                  </Lab>
                </div>

                <Lab t="Alteraciones del Segmento ST y Onda T (Isquemia / Lesión)">
                  <input
                    className={inp}
                    value={f.ecg_st_t}
                    onChange={e => set('ecg_st_t', e.target.value)}
                    placeholder="Ej. Infradesnivel de 1.5mm en V4-V6 o Inversión simétrica de onda T en cara anterior"
                  />
                </Lab>

                <Lab t="Diagnóstico Electrocardiográfico Global">
                  <input
                    className={inp}
                    value={f.ecg_resultado}
                    onChange={e => set('ecg_resultado', e.target.value)}
                    placeholder="Ej. Trazado sinusal con hipertrofia ventricular izquierda y sobrecarga sistólica"
                  />
                </Lab>
              </div>
            )}
          </Card>
        )}

        {/* ── 9. DIAGNÓSTICO, PLAN Y ESTUDIOS SOLICITADOS ── */}
        <Card
          n={++n}
          title={first ? 'Diagnóstico Clínico y Plan Terapéutico' : 'Evolución y Plan de Seguimiento'}
          sub="Prescripción clínica y solicitud de gabinete"
        >
          {!first && (
            <Lab t="Resultados de estudios analizados hoy">
              <textarea
                rows={2}
                className={inp}
                value={f.resultados_estudios}
                onChange={e => set('resultados_estudios', e.target.value)}
                placeholder="Resultados de laboratorio, Holter, MAPA o ecocardiograma revisados en la sesión..."
              />
            </Lab>
          )}

          <Lab t="Diagnóstico Cardiológico Estructurado">
            <textarea
              rows={2}
              className={inp}
              value={f.diagnostico}
              onChange={e => set('diagnostico', e.target.value)}
              placeholder="Ej. 1. Cardiopatía Isquémica Crónica (Angina Estable CCS II)  2. Hipertensión Arterial Sistémica Grado 2  3. Dislipidemia Mixta"
            />
          </Lab>

          {/* Solicitud rápida de estudios cardiológicos */}
          <div className="space-y-2 pt-2">
            <Lab t="Estudios Cardiológicos Solicitados (Selección rápida 1-clic)">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[
                  'Ecocardiograma Transtorácico (ETT)',
                  'Monitoreo Holter 24 horas',
                  'MAPA (Presurometría 24h)',
                  'Prueba de Esfuerzo en Banda',
                  'Cateterismo Cardíaco Diagnóstico / Coronariografía',
                  'Perfil Lipídico Completo + HbA1c',
                ].map(est => {
                  const on = f.estudios_checks?.includes(est);
                  return (
                    <button
                      key={est}
                      type="button"
                      onClick={() => {
                        const cur = f.estudios_checks || [];
                        set('estudios_checks', on ? cur.filter(x => x !== est) : [...cur, est]);
                      }}
                      className="px-3 py-2 rounded-xl border text-left text-xs font-semibold transition cursor-pointer select-none flex items-center justify-between"
                      style={{
                        background: on ? 'var(--c-primary)' : 'var(--c-subtle)',
                        borderColor: on ? 'var(--c-primary)' : 'var(--c-border)',
                        color: on ? '#000000' : 'var(--c-text)',
                      }}
                    >
                      <span className="truncate pr-1">{est}</span>
                      <span className="text-[10px]">{on ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </Lab>
            <input
              className={inp}
              value={f.estudios_solicitados}
              onChange={e => set('estudios_solicitados', e.target.value)}
              placeholder="Otros estudios adicionales (separados por coma)"
            />
          </div>

          <Lab t="Plan de Tratamiento e Indicaciones Médicas">
            <textarea
              rows={3}
              className={inp}
              value={f.plan}
              onChange={e => set('plan', e.target.value)}
              placeholder="Dieta hiposódica, registro diario de presión arterial en domicilio, signos de alarma para urgencias..."
            />
          </Lab>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Lab t="Fecha Sugerida de Próxima Cita">
              <input
                type="date"
                className={inp}
                value={f.proxima_cita}
                onChange={e => set('proxima_cita', e.target.value)}
              />
            </Lab>
          </div>
        </Card>

        {/* ── 10. GENERADOR DE RECETA MÉDICA OFICIAL ── */}
        <Card
          n={++n}
          title="Receta Médica Oficial (Imprimible)"
          sub="Medicamentos con posología, vía y duración para impresión formal con cédula y membrete"
        >
          <div className="space-y-3">
            {f.receta.map((m, idx) => {
              const updMed = (patch: Partial<RecetaItem>) =>
                set('receta', f.receta.map((item, j) => (j === idx ? { ...item, ...patch } : item)));
              return (
                <div key={idx} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--c-primary)] font-mono">
                      Medicamento #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => set('receta', f.receta.filter((_, j) => j !== idx))}
                      className="text-xs text-red-400 hover:underline cursor-pointer"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      className={inp}
                      placeholder="Sustancia / Nombre genérico *"
                      value={m.nombre_generico}
                      onChange={e => updMed({ nombre_generico: e.target.value })}
                    />
                    <input
                      className={inp}
                      placeholder="Nombre comercial (opcional)"
                      value={m.nombre_comercial}
                      onChange={e => updMed({ nombre_comercial: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                      className={inp}
                      placeholder="Presentación (tabs)"
                      value={m.presentacion}
                      onChange={e => updMed({ presentacion: e.target.value })}
                    />
                    <input
                      className={inp}
                      placeholder="Dosis (ej. 100 mg)"
                      value={m.dosis}
                      onChange={e => updMed({ dosis: e.target.value })}
                    />
                    <input
                      className={inp}
                      placeholder="Frecuencia (c/24h)"
                      value={m.frecuencia}
                      onChange={e => updMed({ frecuencia: e.target.value })}
                    />
                    <input
                      className={inp}
                      placeholder="Duración (30 días)"
                      value={m.duracion}
                      onChange={e => updMed({ duracion: e.target.value })}
                    />
                  </div>
                  <input
                    className={inp}
                    placeholder="Instrucciones al paciente (ej. Tomar por la mañana con alimentos, no suspender)"
                    value={m.indicaciones}
                    onChange={e => updMed({ indicaciones: e.target.value })}
                  />
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => set('receta', [...f.receta, emptyRecetaItem()])}
              className="w-full min-h-[42px] rounded-xl border border-dashed border-[var(--c-border)] text-xs font-semibold text-[var(--c-text-2)] hover:border-[var(--c-primary)] hover:text-[var(--c-text)] transition cursor-pointer"
            >
              + Agregar otro medicamento a la receta
            </button>
          </div>
        </Card>

        {/* ── 11. PASE A COBRO EN MOSTRADOR (RECEPCIÓN) ── */}
        <Card
          n={++n}
          title="Cobro a Mostrador (Recepción / Caja)"
          sub="Envía el ticket de honorarios a recepción para que el paciente pague al salir"
        >
          <div className="space-y-3">
            {cobroItems.map((it, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_130px_80px] gap-2">
                <input
                  className={inp}
                  placeholder="Concepto del cobro"
                  value={it.concepto}
                  onChange={e => {
                    const c = [...cobroItems];
                    c[idx].concepto = e.target.value;
                    setCobroItems(c);
                  }}
                />
                <input
                  type="number"
                  className={inp}
                  placeholder="Monto $"
                  value={it.precio}
                  onChange={e => {
                    const c = [...cobroItems];
                    c[idx].precio = e.target.value;
                    setCobroItems(c);
                  }}
                />
                <input
                  type="number"
                  className={inp}
                  placeholder="Cant"
                  value={it.cantidad}
                  onChange={e => {
                    const c = [...cobroItems];
                    c[idx].cantidad = e.target.value;
                    setCobroItems(c);
                  }}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* ── BARRA INFERIOR FIJA DE ACCIÓN (GUARDADO) ── */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--c-card)] border-t border-[var(--c-border)] p-4 shadow-lg backdrop-blur-md">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push(`/dashboard/patient/${patientId}`)}
              className="text-xs font-semibold text-[var(--c-text-2)] hover:text-[var(--c-text)] order-2 sm:order-1 cursor-pointer"
            >
              Cancelar y salir
            </button>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto order-1 sm:order-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => guardar(false)}
                className="flex-1 sm:flex-none px-5 py-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] text-xs sm:text-sm font-bold text-[var(--c-text)] hover:border-[var(--c-primary)] transition cursor-pointer"
              >
                {saving ? 'Guardando…' : 'Guardar Consulta'}
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => guardar(true)}
                className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-[var(--c-primary)] text-black text-xs sm:text-sm font-bold hover:brightness-110 transition shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <span>🖨️</span>
                <span>{saving ? 'Procesando…' : 'Guardar y Generar Receta'}</span>
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ── MODAL DE HIPER-PERSONALIZACIÓN DE CUESTIONARIO ── */}
      {configModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--c-text)]">
                  ⚙️ Hiper-Personalización de Cuestionario
                </h3>
                <p className="text-xs text-[var(--c-text-2)]">
                  Adapta las preguntas de admisión y consulta para tu clínica o especialidad
                </p>
              </div>
              <button
                onClick={() => setConfigModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[var(--c-subtle)] text-[var(--c-text-2)] hover:text-[var(--c-text)] flex items-center justify-center text-lg font-bold"
              >
                ×
              </button>
            </div>

            {/* Selector de Presets de Especialidad */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase text-[var(--c-text-3)] font-bold">
                Especialidad Médica Activa:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: 'cardiologia_intervencionista', label: '🩺 Cardiología Intervencionista (Dr. Alarcón)' },
                  { key: 'medicina_general', label: '👨‍⚕️ Medicina General / Familiar' },
                  { key: 'medicina_estetica', label: '✨ Medicina Estética / Dermatología' },
                ].map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => cambiarPerfil(p.key as any)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${
                      activeProfile === p.key
                        ? 'border-[var(--c-primary)] bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-[var(--c-text)]'
                        : 'border-[var(--c-border)] bg-[var(--c-subtle)] text-[var(--c-text-2)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles de módulos */}
            <div className="space-y-2 pt-2 border-t border-[var(--c-border)]">
              <label className="text-[11px] font-mono uppercase text-[var(--c-text-3)] font-bold">
                Módulos Activos en el Interrogatorio:
              </label>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {[
                  { key: 'heredofamiliares', label: 'Antecedentes Heredofamiliares (muerte súbita, infartos precoces)' },
                  { key: 'estilo_vida', label: 'Estilo de Vida & Tabaquismo (índice tabáquico, actividad)' },
                  { key: 'frcv_cardiovascular', label: 'Riesgo Cardiovascular & Intervencionismo (stents, CRM, HAS, DM2)' },
                  { key: 'angina_ccs', label: 'Caracterización de Angina de Pecho (Severidad CCS I-IV)' },
                  { key: 'insuficiencia_nyha', label: 'Insuficiencia Cardíaca (NYHA, ortopnea, DPN, edema)' },
                  { key: 'exploracion_cardiovascular', label: 'Exploración Física Cardiovascular (soplos, R3/R4, yugulares)' },
                  { key: 'ecg_12d', label: 'Gabinete en Consultorio: Electrocardiograma 12D' },
                ].map(m => (
                  <label
                    key={m.key}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] cursor-pointer text-xs"
                  >
                    <span className="font-medium text-[var(--c-text)]">{m.label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(modConfig[m.key as keyof ModuleConfig])}
                      onChange={() => toggleModulo(m.key as keyof ModuleConfig)}
                      className="w-4 h-4 rounded text-[var(--c-primary)]"
                    />
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setConfigModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[var(--c-primary)] text-black font-bold text-xs uppercase tracking-wider hover:brightness-110 transition cursor-pointer"
            >
              Aplicar y continuar consulta
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
