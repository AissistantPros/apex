'use client';

// Consulta Lite: captura básica de una consulta de cardiología, SIN IA.
// Primera vez (historia clínica) o seguimiento (nota de evolución). Ver lib/consultaLite.ts.

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSession, getUser } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';
import {
  APEGO, CLASES_FUNCIONALES, CLASE_HINT, CONDICIONES, ENF_FAMILIARES, KIND_LABEL, PARENTESCOS,
  SINTOMAS, TIPO_CONTROL, avisosSignos, buildPatientPatch, buildVisitPayload, calcIMC,
  defaultKind, emptyForm, emptyRecetaItem, faltantes, interpIMC,
  type Apego, type Kind, type LiteForm, type RecetaItem, type SintomaKey, type TipoControl,
} from '@/app/lib/consultaLite';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ─── Piezas de interfaz (grandes, pensadas para tableta) ──────────────────────
const inp = 'w-full px-3 py-3 min-h-[48px] bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-base outline-none placeholder-[#3d5870] transition focus:border-[#0ea5e9]';

const Card = ({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) => (
  <section className="bg-[#0d1117] border border-[#1e2d3d] rounded-2xl p-5 md:p-6">
    <div className="flex items-start gap-3 mb-4">
      <span className="w-7 h-7 shrink-0 rounded-full bg-[#0ea5e9]/15 text-[#0ea5e9] text-sm font-bold flex items-center justify-center">{n}</span>
      <div>
        <h2 className="text-base font-semibold text-[#dde6ef]">{title}</h2>
        {sub && <p className="text-xs text-[#7a95aa] mt-0.5">{sub}</p>}
      </div>
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

const Lab = ({ t, children, hint }: { t: string; children: React.ReactNode; hint?: string }) => (
  <div>
    <label className="font-mono text-xs text-[#7a95aa] mb-1.5 block">{t}</label>
    {children}
    {hint && <p className="text-xs text-[#3d5870] mt-1">{hint}</p>}
  </div>
);

function Pills<T extends string>({ options, value, onChange, labels, accent = 'var(--c-blue)' }: {
  options: readonly T[]; value: T | ''; onChange: (v: T | '') => void;
  labels?: Record<string, string>; accent?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const on = value === o;
        return (
          <button key={o} type="button" onClick={() => onChange(on ? '' : o)}
            className="px-4 min-h-[44px] rounded-full border text-sm font-semibold transition"
            style={{ background: on ? accent : 'var(--c-subtle)', borderColor: on ? accent : 'var(--c-border)', color: on ? 'var(--c-primary-fg)' : 'var(--c-text)' }}>
            {labels?.[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}

const Num = ({ v, on, ph, unit }: { v: string; on: (s: string) => void; ph?: string; unit?: string }) => (
  <div className="relative">
    <input inputMode="decimal" value={v} onChange={e => on(e.target.value)} placeholder={ph}
      className={`${inp} text-center text-lg font-bold ${unit ? 'pr-12' : ''}`} />
    {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#3d5870] font-mono">{unit}</span>}
  </div>
);

const fechaCorta = (iso?: string) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

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

  // Cobro a mostrador al terminar la visita
  const [services, setServices] = useState<Array<{ id: string; nombre: string; precio: number }>>([]);
  const [cobroItems, setCobroItems] = useState<Array<{ concepto: string; precio: string; cantidad: string }>>([
    { concepto: 'Consulta médica', precio: '', cantidad: '1' },
  ]);
  const [enviarCobro, setEnviarCobro] = useState<boolean>(true);
  const [indicacionesMostrador, setIndicacionesMostrador] = useState<string>('');
  const [estadoCobro, setEstadoCobro] = useState<'pendiente' | 'cobrado'>('pendiente');
  const [metodoCobroDirecto, setMetodoCobroDirecto] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');

  const set = <K extends keyof LiteForm>(k: K, v: LiteForm[K]) => setF(p => ({ ...p, [k]: v }));
  const first = kind === 'first_visit';

  useEffect(() => { setRole(getRole()); }, []);

  useEffect(() => {
    (async () => {
      const u = await getUser().catch(() => null);
      if (!u) { router.push('/auth/login'); return; }
      try {
        const s = await getSession();
        const headers: Record<string, string> = s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {};
        const [pRes, vRes, sRes] = await Promise.all([
          fetch(`${BACKEND()}/patients/${patientId}`, { headers }),
          fetch(`${BACKEND()}/visits/${patientId}`, { headers }),
          fetch(`${BACKEND()}/clinic/services`, { headers }).catch(() => null),
        ]);
        if (!pRes.ok) throw new Error('No se pudo cargar el paciente');
        const p = await pRes.json();
        const vs: any[] = vRes.ok ? ((await vRes.json()).visits || []) : [];
        if (sRes && sRes.ok) {
          const svcs = ((await sRes.json()).services || []).filter((x: any) => x.activo !== false);
          setServices(svcs);
          if (svcs.length > 0) {
            setCobroItems([{ concepto: svcs[0].nombre, precio: String(svcs[0].precio || ''), cantidad: '1' }]);
          }
        }
        setPatient(p); setVisits(vs);
        setKind(defaultKind(vs.length));
        // Lo que el expediente ya tiene se precarga para no volver a escribirlo
        setF(prev => ({
          ...prev,
          familiares: Array.isArray(p.family_other_history)
            ? p.family_other_history.map((r: any) => ({ parentesco: r.parentesco || '', enfermedad: r.enfermedad || '', edad: '', nota: r.detalle || '' }))
            : [],
          condiciones: typeof p.chronic_diseases === 'string'
            ? p.chronic_diseases.split(',').map((x: string) => x.trim()).filter((x: string) => (CONDICIONES as readonly string[]).includes(x))
            : [],
          cirugias: p.surgeries || '', hospitalizaciones: p.hospitalizations || '', alergias: p.allergies_medications || '',
          medicamentos: Array.isArray(p.medications) ? p.medications.map((m: any) => ({ nombre: m.nombre || '', dosis: m.dosis || '' })) : [],
          tabaco: p.smoking_status || '', cigarros_dia: p.cigarettes_per_day || '', anios_tabaco: p.smoking_years || '',
          alcohol: p.alcohol_status || '', sustancias: p.sust_recreativas || '',
        }));
      } catch (e: any) {
        setError(e?.message || 'Error al cargar');
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId]); // eslint-disable-line

  const imc = useMemo(() => calcIMC(f.peso, f.talla), [f.peso, f.talla]);
  const avisos = useMemo(() => avisosSignos(f), [f]);
  const ultima = visits[0];
  const sinAcceso = role === 'receptionist' || role === 'accounting' || role === 'marketing';

  const guardar = async (irAReceta: boolean = false) => {
    setError(null);
    const falta = faltantes(f, kind);
    if (falta.length && !window.confirm(`Falta capturar:\n• ${falta.join('\n• ')}\n\n¿Guardar de todos modos?`)) return;
    setSaving(true);
    try {
      const s = await getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
      if (first) {
        const patch = buildPatientPatch(f);
        if (Object.keys(patch).length) {
          const r = await fetch(`${BACKEND()}/patients/${patientId}`, { method: 'PUT', headers, body: JSON.stringify(patch) });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'No se pudieron guardar los antecedentes');
        }
      }
      const r = await fetch(`${BACKEND()}/visits/${patientId}`, { method: 'POST', headers, body: JSON.stringify(buildVisitPayload(f, kind)) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'No se pudo guardar la consulta');
      const vCreated = await r.json();
      const newVisitId = vCreated.id || vCreated.visit_id;

      // Enviar cobro a mostrador si el médico definió al menos un concepto con monto > 0
      const validCobros = cobroItems
        .map(it => ({
          concepto: it.concepto.trim(),
          precio: parseFloat(it.precio || '0'),
          cantidad: Math.max(1, parseInt(it.cantidad || '1', 10) || 1),
        }))
        .filter(it => it.concepto && it.precio > 0);

      if (enviarCobro && validCobros.length > 0) {
        await fetch(`${BACKEND()}/clinic/sales`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            patient_id: patientId,
            visit_id: newVisitId || null,
            items: validCobros,
            estado: estadoCobro,
            metodo_pago: estadoCobro === 'cobrado' ? metodoCobroDirecto : null,
            tipo_ingreso: 'consulta',
            lugar: 'Consultorio',
            proxima_cita: f.proxima_cita || null,
            indicaciones_mostrador: indicacionesMostrador.trim() || f.plan.trim() || null,
            notas: indicacionesMostrador.trim() || null,
          }),
        }).catch(() => {});
      }

      if (irAReceta && newVisitId) {
        router.push(`/dashboard/patient/${patientId}/visit/${newVisitId}/documentos`);
      } else {
        router.push(`/dashboard/patient/${patientId}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Error al guardar');
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#080b10] text-[#7a95aa] flex items-center justify-center">Cargando…</div>;
  if (sinAcceso) return <div className="min-h-screen bg-[#080b10] text-[#7a95aa] flex items-center justify-center p-6 text-center">Tu rol no captura consultas.</div>;

  let n = 0;
  return (
    <div className="min-h-screen bg-[#080b10] text-[#dde6ef] pb-32">
      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
        <button onClick={() => router.push(`/dashboard/patient/${patientId}`)} className="text-sm text-[#7a95aa] hover:text-[#dde6ef]">← Volver al expediente</button>

        <header className="space-y-3">
          <div>
            <p className="font-mono text-xs text-[#3d5870]">CONSULTA</p>
            <h1 className="text-2xl font-serif font-bold">{patient?.full_name || 'Paciente'}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Pills options={['first_visit', 'follow_up'] as const} value={kind}
              onChange={v => v && setKind(v)} labels={KIND_LABEL} accent="var(--c-green)" />
            <span className="text-xs text-[#7a95aa]">
              {first ? 'Historia clínica completa' : 'Nota de evolución: solo lo que cambió'}
            </span>
          </div>
        </header>

        {error && <div className="rounded-xl border border-[#f43f5e]/40 bg-[#f43f5e]/10 text-[#f43f5e] text-sm p-3">{error}</div>}

        {!first && ultima && (
          <div className="rounded-2xl border border-[#1e2d3d] bg-[#111820] p-4 text-sm space-y-1">
            <p className="font-mono text-xs text-[#7a95aa]">ÚLTIMA VISITA · {fechaCorta(ultima.created_at)}</p>
            {ultima.dx_presuntivo && <p><span className="text-[#7a95aa]">Diagnóstico:</span> {ultima.dx_presuntivo}</p>}
            <p className="text-[#7a95aa]">
              {[ultima.pa_der_sistolica && `PA ${ultima.pa_der_sistolica}/${ultima.pa_der_diastolica ?? '–'}`,
                ultima.heart_rate && `FC ${ultima.heart_rate}`, ultima.weight && `${ultima.weight} kg`].filter(Boolean).join(' · ') || 'Sin signos registrados'}
            </p>
            {ultima.dynamic_answers?.lite?.cierre?.plan && <p><span className="text-[#7a95aa]">Plan:</span> {ultima.dynamic_answers.lite.cierre.plan}</p>}
            {Array.isArray(patient?.medications) && patient.medications.length > 0 && (
              <p><span className="text-[#7a95aa]">Medicamentos:</span> {patient.medications.map((m: any) => [m.nombre, m.dosis].filter(Boolean).join(' ')).join('; ')}</p>
            )}
          </div>
        )}

        {/* 1 · Motivo */}
        <Card n={++n} title={first ? 'Motivo de consulta y síntomas' : 'Motivo de la visita'}
          sub={first ? 'Marca lo que el paciente refiere.' : '¿Apareció o cambió algo desde la última visita?'}>
          {!first && (
            <Lab t="Tipo de visita">
              <Pills options={Object.keys(TIPO_CONTROL) as TipoControl[]} value={f.tipo_control}
                onChange={v => v && set('tipo_control', v)} labels={TIPO_CONTROL} />
            </Lab>
          )}
          <Lab t="Motivo"><textarea rows={2} className={inp} value={f.motivo} onChange={e => set('motivo', e.target.value)} placeholder={first ? 'Por qué viene el paciente' : 'Control de presión, revisión de resultados…'} /></Lab>
          {first && <Lab t="Desde cuándo"><input className={inp} value={f.evolucion} onChange={e => set('evolucion', e.target.value)} placeholder="Ej. hace 3 semanas" /></Lab>}
          <div className="space-y-2">
            {SINTOMAS.map(s => {
              const e = f.sintomas[s.key as SintomaKey];
              const upd = (patch: Partial<typeof e>) => set('sintomas', { ...f.sintomas, [s.key]: { ...e, ...patch } });
              return (
                <div key={s.key} className={`rounded-xl border p-3 transition ${e.si ? 'border-[#0ea5e9]/50 bg-[#0ea5e9]/5' : 'border-[#1e2d3d] bg-[#111820]'}`}>
                  <button type="button" onClick={() => upd({ si: !e.si })} className="w-full flex items-center justify-between min-h-[40px] text-left">
                    <span className="font-medium">{s.label}</span>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${e.si ? 'bg-[#0ea5e9] text-black' : 'bg-[#1e2d3d] text-[#7a95aa]'}`}>{e.si ? 'Sí' : 'No'}</span>
                  </button>
                  {e.si && (
                    <div className="mt-2 space-y-2">
                      {'clase' in s && s.clase && (
                        <div>
                          <p className="text-xs text-[#7a95aa] mb-1">Clase funcional</p>
                          <Pills options={CLASES_FUNCIONALES} value={e.clase as any} onChange={v => upd({ clase: v })}
                            labels={Object.fromEntries(CLASES_FUNCIONALES.map(c => [c, `${c} · ${CLASE_HINT[c]}`]))} />
                        </div>
                      )}
                      <input className={inp} value={e.nota} onChange={ev => upd({ nota: ev.target.value })} placeholder={('hint' in s && s.hint) || 'Detalle (opcional)'} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Seguimiento · desde la última visita */}
        {!first && (
          <Card n={++n} title="Desde la última visita">
            <Lab t="Hospitalización o urgencias"><input className={inp} value={f.hospitalizado_desde} onChange={e => set('hospitalizado_desde', e.target.value)} placeholder="Ninguna, o cuándo y por qué" /></Lab>
            <Lab t="¿Toma sus medicamentos?">
              <Pills options={Object.keys(APEGO) as Apego[]} value={f.apego} onChange={v => set('apego', v)} labels={APEGO} />
            </Lab>
            <Lab t="Efectos adversos"><input className={inp} value={f.efectos_adversos} onChange={e => set('efectos_adversos', e.target.value)} placeholder="Tos, mareo, hinchazón…" /></Lab>
            <Lab t="Cambios de medicamento"><textarea rows={2} className={inp} value={f.cambios_medicamentos} onChange={e => set('cambios_medicamentos', e.target.value)} placeholder="Qué se subió, bajó, suspendió o agregó" /></Lab>
            <Lab t="Presión medida en casa"><input className={inp} value={f.pa_domicilio} onChange={e => set('pa_domicilio', e.target.value)} placeholder="Ej. 130/80 en promedio" /></Lab>
          </Card>
        )}

        {/* Primera vez · heredofamiliares */}
        {first && (
          <Card n={++n} title="Antecedentes heredofamiliares" sub="Qué familiar, qué enfermedad y a qué edad. Solo se preguntan en la primera vez.">
            <div className="flex flex-wrap gap-2">
              {[['sin_antecedentes_fam', 'Sin antecedentes'], ['desconoce_fam', 'Desconoce'], ['cardiopatia_precoz', 'Familiar con cardiopatía precoz']].map(([k, label]) => {
                const on = f[k as keyof LiteForm] as boolean;
                return (
                  <button key={k} type="button" onClick={() => set(k as any, !on as any)}
                    className="px-4 min-h-[44px] rounded-full border text-sm font-semibold transition"
                    style={{ background: on ? 'var(--c-amber)' : 'var(--c-subtle)', borderColor: on ? 'var(--c-amber)' : 'var(--c-border)', color: on ? 'var(--c-primary-fg)' : 'var(--c-text)' }}>{label}</button>
                );
              })}
            </div>
            {f.familiares.map((r, i) => {
              const upd = (patch: Partial<typeof r>) => set('familiares', f.familiares.map((x, j) => j === i ? { ...x, ...patch } : x));
              return (
                <div key={i} className="rounded-xl border border-[#1e2d3d] bg-[#111820] p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select className={inp} value={r.parentesco} onChange={e => upd({ parentesco: e.target.value })}>
                      <option value="">Familiar…</option>{PARENTESCOS.map(p => <option key={p}>{p}</option>)}
                    </select>
                    <select className={inp} value={r.enfermedad} onChange={e => upd({ enfermedad: e.target.value })}>
                      <option value="">Enfermedad…</option>{ENF_FAMILIARES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-[110px_1fr_auto] gap-2">
                    <input inputMode="numeric" className={inp} value={r.edad} onChange={e => upd({ edad: e.target.value })} placeholder="Edad" />
                    <input className={inp} value={r.nota} onChange={e => upd({ nota: e.target.value })} placeholder="Nota (falleció, tratamiento…)" />
                    <button type="button" aria-label="Quitar" onClick={() => set('familiares', f.familiares.filter((_, j) => j !== i))}
                      className="px-3 rounded-lg bg-[#1e2d3d] text-[#dde6ef] text-xl">×</button>
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={() => set('familiares', [...f.familiares, { parentesco: '', enfermedad: '', edad: '', nota: '' }])}
              className="w-full min-h-[48px] rounded-xl border-2 border-dashed border-[#0ea5e9]/60 text-[#0ea5e9] font-semibold">+ Agregar familiar</button>
          </Card>
        )}

        {/* Primera vez · personales y hábitos */}
        {first && (
          <Card n={++n} title="Antecedentes personales y hábitos">
            <Lab t="Padecimientos">
              <div className="flex flex-wrap gap-2">
                {CONDICIONES.map(c => {
                  const on = f.condiciones.includes(c);
                  return (
                    <button key={c} type="button" onClick={() => set('condiciones', on ? f.condiciones.filter(x => x !== c) : [...f.condiciones, c])}
                      className="px-4 min-h-[44px] rounded-full border text-sm font-semibold transition"
                      style={{ background: on ? 'var(--c-blue)' : 'var(--c-subtle)', borderColor: on ? 'var(--c-blue)' : 'var(--c-border)', color: on ? 'var(--c-primary-fg)' : 'var(--c-text)' }}>{c}</button>
                  );
                })}
              </div>
            </Lab>
            <Lab t="Cardiopatía previa" hint="Infarto, stent, cirugía cardiaca, arritmia, válvulas, insuficiencia cardiaca"><input className={inp} value={f.cardiopatia_previa} onChange={e => set('cardiopatia_previa', e.target.value)} /></Lab>
            <div className="grid md:grid-cols-2 gap-3">
              <Lab t="Cirugías"><input className={inp} value={f.cirugias} onChange={e => set('cirugias', e.target.value)} /></Lab>
              <Lab t="Hospitalizaciones"><input className={inp} value={f.hospitalizaciones} onChange={e => set('hospitalizaciones', e.target.value)} /></Lab>
            </div>
            <Lab t="Alergias a medicamentos"><input className={inp} value={f.alergias} onChange={e => set('alergias', e.target.value)} placeholder="Ninguna conocida, o cuáles" /></Lab>
            <Lab t="Medicamentos actuales">
              <div className="space-y-2">
                {f.medicamentos.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1fr_130px_auto] gap-2">
                    <input className={inp} value={m.nombre} placeholder="Medicamento" onChange={e => set('medicamentos', f.medicamentos.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
                    <input className={inp} value={m.dosis} placeholder="Dosis" onChange={e => set('medicamentos', f.medicamentos.map((x, j) => j === i ? { ...x, dosis: e.target.value } : x))} />
                    <button type="button" aria-label="Quitar" onClick={() => set('medicamentos', f.medicamentos.filter((_, j) => j !== i))} className="px-3 rounded-lg bg-[#1e2d3d] text-xl">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => set('medicamentos', [...f.medicamentos, { nombre: '', dosis: '' }])}
                  className="w-full min-h-[44px] rounded-xl border border-dashed border-[#1e2d3d] text-[#7a95aa] text-sm font-semibold">+ Agregar medicamento</button>
              </div>
            </Lab>
            <Lab t="Tabaco">
              <Pills options={['Nunca fumó', 'Exfumador', 'Fumador activo'] as const} value={f.tabaco} onChange={v => set('tabaco', v)} />
            </Lab>
            {(f.tabaco === 'Fumador activo' || f.tabaco === 'Exfumador') && (
              <div className="grid grid-cols-2 gap-3">
                {f.tabaco === 'Fumador activo' && <Lab t="Cigarros al día"><Num v={f.cigarros_dia} on={v => set('cigarros_dia', v)} /></Lab>}
                <Lab t="Años fumando"><Num v={f.anios_tabaco} on={v => set('anios_tabaco', v)} unit="años" /></Lab>
              </div>
            )}
            <Lab t="Alcohol"><Pills options={['Nunca', 'Ocasional', 'Frecuente', 'Diario'] as const} value={f.alcohol} onChange={v => set('alcohol', v)} /></Lab>
            <Lab t="Otras sustancias"><input className={inp} value={f.sustancias} onChange={e => set('sustancias', e.target.value)} placeholder="Ninguna, o cuáles" /></Lab>
            <Lab t="Actividad física"><input className={inp} value={f.actividad} onChange={e => set('actividad', e.target.value)} placeholder="Sedentario, camina 30 min, gimnasio…" /></Lab>
            <Lab t="Dieta y sueño"><input className={inp} value={f.dieta_sueno} onChange={e => set('dieta_sueno', e.target.value)} /></Lab>
          </Card>
        )}

        {/* Signos vitales */}
        <Card n={++n} title="Signos vitales y medidas">
          <div className="grid grid-cols-2 gap-3">
            <Lab t="Presión brazo derecho">
              <div className="flex items-center gap-2"><Num v={f.pa_der_sis} on={v => set('pa_der_sis', v)} ph="Sist." /><span className="text-[#3d5870]">/</span><Num v={f.pa_der_dia} on={v => set('pa_der_dia', v)} ph="Diast." /></div>
            </Lab>
            <Lab t="Presión brazo izquierdo">
              <div className="flex items-center gap-2"><Num v={f.pa_izq_sis} on={v => set('pa_izq_sis', v)} ph="Sist." /><span className="text-[#3d5870]">/</span><Num v={f.pa_izq_dia} on={v => set('pa_izq_dia', v)} ph="Diast." /></div>
            </Lab>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Lab t="Frec. cardiaca"><Num v={f.fc} on={v => set('fc', v)} unit="lpm" /></Lab>
            <Lab t="Frec. respiratoria"><Num v={f.fr} on={v => set('fr', v)} unit="rpm" /></Lab>
            <Lab t="Saturación"><Num v={f.spo2} on={v => set('spo2', v)} unit="%" /></Lab>
            <Lab t="Temperatura"><Num v={f.temp} on={v => set('temp', v)} unit="°C" /></Lab>
            <Lab t="Peso"><Num v={f.peso} on={v => set('peso', v)} unit="kg" /></Lab>
            <Lab t="Talla"><Num v={f.talla} on={v => set('talla', v)} unit="cm" /></Lab>
            <Lab t="Perím. abdominal"><Num v={f.abdominal} on={v => set('abdominal', v)} unit="cm" /></Lab>
            <Lab t="IMC">
              <div className={`${inp} text-center font-bold flex items-center justify-center gap-2`}>
                {imc != null ? <><span className="text-lg">{imc}</span><span className="text-xs text-[#7a95aa] font-normal">{interpIMC(imc)}</span></> : <span className="text-[#3d5870]">—</span>}
              </div>
            </Lab>
          </div>
          {avisos.length > 0 && (
            <div className="rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-3 text-sm text-[#f59e0b] space-y-1">
              {avisos.map(a => <p key={a}>⚠ {a}</p>)}
            </div>
          )}
        </Card>

        {/* Exploración */}
        <Card n={++n} title="Exploración" sub="Hallazgos en pocas palabras. Déjalo vacío lo que no se exploró.">
          <Lab t="Ruidos cardiacos y soplos"><input className={inp} value={f.ruidos_soplos} onChange={e => set('ruidos_soplos', e.target.value)} placeholder="Rítmicos, sin soplos…" /></Lab>
          <Lab t="Pulsos y edema"><input className={inp} value={f.pulsos_edema} onChange={e => set('pulsos_edema', e.target.value)} placeholder="Pulsos presentes y simétricos, sin edema…" /></Lab>
          <Lab t="Pulmones y yugulares"><input className={inp} value={f.pulmones_yugulares} onChange={e => set('pulmones_yugulares', e.target.value)} /></Lab>
          <Lab t="Otros hallazgos"><input className={inp} value={f.otros_hallazgos} onChange={e => set('otros_hallazgos', e.target.value)} /></Lab>
          <Lab t="Electrocardiograma">
            <Pills options={['si', 'no'] as const} value={f.ecg_hecho} onChange={v => set('ecg_hecho', v)} labels={{ si: 'Realizado', no: 'No realizado' }} />
          </Lab>
          {f.ecg_hecho === 'si' && <Lab t="Resultado del ECG"><input className={inp} value={f.ecg_resultado} onChange={e => set('ecg_resultado', e.target.value)} placeholder="Ritmo, frecuencia, hallazgos" /></Lab>}
        </Card>

        {/* Cierre */}
        <Card n={++n} title={first ? 'Diagnóstico y plan' : 'Evolución y plan'} sub="Lo escribe el doctor.">
          {!first && <Lab t="Resultados de estudios"><textarea rows={2} className={inp} value={f.resultados_estudios} onChange={e => set('resultados_estudios', e.target.value)} placeholder="Estudios recibidos y qué mostraron" /></Lab>}
          <Lab t="Diagnóstico"><textarea rows={2} className={inp} value={f.diagnostico} onChange={e => set('diagnostico', e.target.value)} /></Lab>
          {!first && <Lab t="Evolución"><textarea rows={2} className={inp} value={f.evolucion_nota} onChange={e => set('evolucion_nota', e.target.value)} placeholder="Mejoría, igual, empeoramiento…" /></Lab>}
          <Lab t="Plan e indicaciones"><textarea rows={3} className={inp} value={f.plan} onChange={e => set('plan', e.target.value)} /></Lab>
          <Lab t="Estudios solicitados (separados por coma o renglón)"><input className={inp} value={f.estudios_solicitados} onChange={e => set('estudios_solicitados', e.target.value)} placeholder="Ej. Biometría hemática, Perfil lipídico, Ecocardiograma…" /></Lab>
          <Lab t="Próxima cita"><input type="date" className={inp} value={f.proxima_cita} onChange={e => set('proxima_cita', e.target.value)} /></Lab>
        </Card>

        {/* Receta médica manual */}
        <Card n={++n} title="Receta médica (captura manual)" sub="Agrega los medicamentos, dosis y duración para generar la receta oficial imprimible.">
          <div className="space-y-3">
            {f.receta.map((m, idx) => {
              const updMed = (patch: Partial<RecetaItem>) =>
                set('receta', f.receta.map((item, j) => j === idx ? { ...item, ...patch } : item));
              return (
                <div key={idx} className="rounded-xl border border-[#1e2d3d] bg-[#111820] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0ea5e9]">Medicamento #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => set('receta', f.receta.filter((_, j) => j !== idx))}
                      className="text-xs text-[#f43f5e] hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    <input className={inp} placeholder="Nombre genérico / sustancia *" value={m.nombre_generico} onChange={e => updMed({ nombre_generico: e.target.value })} />
                    <input className={inp} placeholder="Nombre comercial (opcional)" value={m.nombre_comercial} onChange={e => updMed({ nombre_comercial: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input className={inp} placeholder="Presentación (tab, cap)" value={m.presentacion} onChange={e => updMed({ presentacion: e.target.value })} />
                    <input className={inp} placeholder="Dosis (ej. 50 mg)" value={m.dosis} onChange={e => updMed({ dosis: e.target.value })} />
                    <input className={inp} placeholder="Frecuencia (ej. c/12 h)" value={m.frecuencia} onChange={e => updMed({ frecuencia: e.target.value })} />
                    <input className={inp} placeholder="Duración (ej. 30 días)" value={m.duracion} onChange={e => updMed({ duracion: e.target.value })} />
                  </div>
                  <input className={inp} placeholder="Indicaciones adicionales (ej. tomar en ayunas, vigilar presión)" value={m.indicaciones} onChange={e => updMed({ indicaciones: e.target.value })} />
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => set('receta', [...f.receta, emptyRecetaItem()])}
                className="flex-1 min-h-[46px] rounded-xl border-2 border-dashed border-[#0ea5e9]/60 text-[#0ea5e9] font-semibold text-sm"
              >
                + Agregar medicamento a la receta
              </button>
              {f.medicamentos.length > 0 && f.receta.length === 0 && (
                <button
                  type="button"
                  onClick={() =>
                    set('receta', f.medicamentos.filter(x => x.nombre.trim()).map(x => ({
                      ...emptyRecetaItem(),
                      nombre_generico: x.nombre,
                      dosis: x.dosis,
                    })))
                  }
                  className="px-4 min-h-[46px] rounded-xl border border-[#1e2d3d] text-xs font-semibold text-[#7a95aa] hover:text-[#dde6ef]"
                >
                  Copiar medicamentos actuales ({f.medicamentos.filter(x => x.nombre.trim()).length})
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Enviar cobro a mostrador */}
        <Card n={++n} title="Enviar cobro e indicaciones a mostrador" sub="Define qué se va a cobrar hoy y las indicaciones para que recepción lo tenga de inmediato al salir el paciente.">
          <div className="flex items-center justify-between pb-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={enviarCobro} onChange={e => setEnviarCobro(e.target.checked)} />
              <span className="text-sm font-semibold">Generar orden de cobro al guardar esta visita</span>
            </label>
            {enviarCobro && (
              <div className="flex items-center gap-1.5">
                {(['pendiente', 'cobrado'] as const).map(est => (
                  <button
                    key={est}
                    type="button"
                    onClick={() => setEstadoCobro(est)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold transition"
                    style={{
                      background: estadoCobro === est ? 'var(--c-primary)' : 'var(--c-subtle)',
                      color: estadoCobro === est ? 'var(--c-primary-fg)' : 'var(--c-text-2)',
                    }}
                  >
                    {est === 'pendiente' ? 'Enviar a mostrador (Pendiente)' : 'Cobrar aquí mismo'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {enviarCobro && (
            <div className="space-y-3 pt-2">
              {services.length > 0 && (
                <div>
                  <p className="text-xs font-mono text-[#7a95aa] mb-1.5">SERVICIOS FRECUENTES DEL CONSULTORIO (CLIC PARA AGREGAR)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {services.map(svc => (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => {
                          setCobroItems(prev => {
                            if (prev.length === 1 && !prev[0].precio) {
                              return [{ concepto: svc.nombre, precio: String(svc.precio), cantidad: '1' }];
                            }
                            return [...prev, { concepto: svc.nombre, precio: String(svc.precio), cantidad: '1' }];
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#1e2d3d] bg-[#111820] hover:border-[#0ea5e9] transition"
                      >
                        + {svc.nombre} (${Number(svc.precio).toLocaleString('es-MX')})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {cobroItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_110px_80px_auto] gap-2 items-center">
                    <input
                      className={inp}
                      placeholder="Concepto a cobrar (ej. Consulta, ECG, Procedimiento)"
                      value={it.concepto}
                      onChange={e => setCobroItems(prev => prev.map((x, j) => j === idx ? { ...x, concepto: e.target.value } : x))}
                    />
                    <input
                      inputMode="decimal"
                      className={inp}
                      placeholder="$ Monto"
                      value={it.precio}
                      onChange={e => setCobroItems(prev => prev.map((x, j) => j === idx ? { ...x, precio: e.target.value } : x))}
                    />
                    <input
                      inputMode="numeric"
                      className={`${inp} text-center`}
                      placeholder="Cant."
                      value={it.cantidad}
                      onChange={e => setCobroItems(prev => prev.map((x, j) => j === idx ? { ...x, cantidad: e.target.value } : x))}
                    />
                    {cobroItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCobroItems(prev => prev.filter((_, j) => j !== idx))}
                        className="px-3 min-h-[48px] rounded-lg bg-[#1e2d3d] text-lg"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setCobroItems(prev => [...prev, { concepto: '', precio: '', cantidad: '1' }])}
                    className="text-xs font-semibold text-[#0ea5e9] hover:underline"
                  >
                    + Agregar otro concepto al cobro
                  </button>
                  <p className="text-sm font-bold">
                    Total a cobrar: $
                    {cobroItems
                      .reduce((acc, it) => acc + (parseFloat(it.precio || '0') || 0) * (parseInt(it.cantidad || '1', 10) || 1), 0)
                      .toLocaleString('es-MX')}{' '}
                    MXN
                  </p>
                </div>
              </div>

              {estadoCobro === 'cobrado' && (
                <Lab t="Método de pago recibido">
                  <div className="flex gap-2">
                    {(['efectivo', 'tarjeta', 'transferencia'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMetodoCobroDirecto(m)}
                        className="px-4 py-2 rounded-lg text-xs font-semibold capitalize border"
                        style={{
                          background: metodoCobroDirecto === m ? 'var(--c-primary)' : 'var(--c-subtle)',
                          color: metodoCobroDirecto === m ? 'var(--c-primary-fg)' : 'var(--c-text)',
                          borderColor: metodoCobroDirecto === m ? 'var(--c-primary)' : 'var(--c-border)',
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </Lab>
              )}

              <Lab t="Indicaciones para recepción / mostrador (opcional)">
                <input
                  className={inp}
                  value={indicacionesMostrador}
                  onChange={e => setIndicacionesMostrador(e.target.value)}
                  placeholder="Ej. Agendar cita en 1 mes con estudios de laboratorio; entregar factura…"
                />
              </Lab>
            </div>
          )}
        </Card>
      </div>

      <div className="fixed bottom-0 inset-x-0 md:left-[232px] bg-[#080b10]/95 backdrop-blur border-t border-[#1e2d3d] p-4 z-30">
        <div className="max-w-3xl mx-auto flex flex-wrap gap-2.5">
          <button onClick={() => router.push(`/dashboard/patient/${patientId}`)} className="px-4 min-h-[50px] rounded-xl bg-[#1e2d3d] font-semibold text-sm">
            Cancelar
          </button>
          <button
            onClick={() => guardar(false)}
            disabled={saving}
            className="flex-1 min-h-[50px] rounded-xl border border-[#0ea5e9] text-[#0ea5e9] font-bold text-sm px-4 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : `Guardar consulta · ${KIND_LABEL[kind]}`}
          </button>
          <button
            onClick={() => guardar(true)}
            disabled={saving}
            className="flex-1 min-h-[50px] rounded-xl bg-[#00e5a0] text-black font-bold text-sm px-4 disabled:opacity-60"
          >
            {saving ? 'Generando…' : '🖨️ Guardar y generar receta'}
          </button>
        </div>
      </div>
    </div>
  );
}
