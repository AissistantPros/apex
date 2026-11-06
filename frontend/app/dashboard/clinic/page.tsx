'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSession } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';
import { mix } from '@/app/lib/ui';
import { useEntitlements } from '@/app/lib/useEntitlements';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const money = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-MX');

const C = {
  card: 'var(--c-card)', border: 'var(--c-border)', text: 'var(--c-text)', muted: 'var(--c-text-2)', faint: 'var(--c-text-3)',
  green: 'var(--c-green)', blue: 'var(--c-blue)', purple: 'var(--c-violet)', amber: 'var(--c-amber)', pink: 'var(--c-pink)', red: 'var(--c-red)',
};
const CAT = [C.green, C.blue, C.purple, C.amber, C.pink];

const ORIGEN_FONDO_LABELS: Record<string, { label: string; short: string; isDoctor: boolean }> = {
  caja_consultorio:          { label: '💵 Caja del consultorio (Efectivo)', short: 'Caja consultorio', isDoctor: false },
  tarjeta_consultorio:       { label: '💳 Tarjeta del consultorio', short: 'Tarjeta consultorio', isDoctor: false },
  transferencia_consultorio: { label: '🏦 Transferencia del consultorio', short: 'Transf. consultorio', isDoctor: false },
  efectivo_doctor:           { label: '👨‍⚕️ Pagó el Dr. con su efectivo', short: 'Efectivo del Dr.', isDoctor: true },
  tarjeta_doctor:            { label: '👨‍⚕️💳 Pagó el Dr. con su tarjeta', short: 'Tarjeta del Dr.', isDoctor: true },
  transferencia_doctor:      { label: '👨‍⚕️🏦 Transfirió el Dr. de su cuenta', short: 'Transf. del Dr.', isDoctor: true },
};

const TIPO_INGRESO_LABELS: Record<string, string> = {
  consulta:      '🩺 Consulta médica',
  procedimiento: '💉 Procedimiento en consultorio',
  cirugia:       '🏥 Cirugía',
  aseguradora:   '🛡️ Pago de aseguradora',
  estudio:       '🧪 Estudio / Gabinete',
  otro:          '📋 Otro ingreso',
};

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}
async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
  return res.json();
}

// ── Componentes de gráfica y KPI ────────────────────────────────────────────
function Kpi({ label, value, color = C.green, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl px-4 py-3.5">
      <p className="text-[10px] font-mono tracking-wider text-[#7a95aa] uppercase">{label}</p>
      <p className="mt-1 font-bold" style={{ color, fontSize: 23, lineHeight: 1.15 }}>{value}</p>
      {hint && <p className="text-[11px] text-[#7a95aa] mt-1">{hint}</p>}
    </div>
  );
}
function Card({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <p className="text-sm font-semibold text-[#dde6ef]">{title}</p>
          {subtitle && <p className="text-[11px] text-[#7a95aa] mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
function BarrasIngGasto({ data }: { data: { nombre: string; ingreso: number; gasto: number }[] }) {
  const max = Math.max(...data.flatMap(d => [d.ingreso, d.gasto]), 1);
  return (
    <div className="flex items-end justify-between gap-2 h-48 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
          <div className="flex items-end gap-0.5 w-full justify-center h-full">
            <div className="w-3 rounded-t" style={{ height: `${(d.ingreso / max) * 100}%`, minHeight: 2, background: C.green }} title={`Ingreso ${money(d.ingreso)}`} />
            <div className="w-3 rounded-t" style={{ height: `${(d.gasto / max) * 100}%`, minHeight: 2, background: C.red, opacity: .8 }} title={`Gasto ${money(d.gasto)}`} />
          </div>
          <span className="text-[9px] text-[#7a95aa] mt-1 whitespace-nowrap">{d.nombre}</span>
        </div>
      ))}
    </div>
  );
}
function BarrasH({ data, color = C.green, fmt = (n: number) => String(n) }: { data: { nombre: string; valor: number }[]; color?: string; fmt?: (n: number) => string }) {
  if (!data?.length) return <p className="text-xs text-[#3d5870]">Sin datos registrados</p>;
  const max = Math.max(...data.map(d => Math.abs(d.valor)), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-32 shrink-0 text-right text-xs text-[#dde6ef] truncate" title={d.nombre}>{d.nombre}</div>
          <div className="flex-1 h-6 bg-[#111820] rounded-md overflow-hidden relative">
            <div className="h-full rounded-md" style={{ width: `${(Math.abs(d.valor) / max) * 100}%`, background: d.valor < 0 ? C.red : color, opacity: .85 }} />
            <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-mono text-[#dde6ef]">{fmt(d.valor)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
function Dona({ data }: { data: { nombre: string; valor: number }[] }) {
  const total = (data || []).reduce((s, d) => s + d.valor, 0);
  if (!total) return <p className="text-xs text-[#3d5870]">Sin datos</p>;
  const R = 52, cx = 66, cy = 66, C2 = 2 * Math.PI * R; let acc = 0;
  const segs = data.map((d, i) => { const f = d.valor / total; const s = { c: CAT[i % CAT.length], dash: f * C2, off: acc * C2, pct: Math.round(f * 100), ...d }; acc += f; return s; });
  return (
    <div className="flex items-center gap-5">
      <svg width="132" height="132" viewBox="0 0 132 132" className="shrink-0">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--c-subtle)" strokeWidth={22} />
        {segs.map((s, i) => <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.c} strokeWidth={22} strokeDasharray={`${s.dash} ${C2 - s.dash}`} strokeDashoffset={-s.off} transform={`rotate(-90 ${cx} ${cy})`} />)}
      </svg>
      <div className="space-y-1.5">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.c }} />
            <span className="text-[#dde6ef]">{s.nombre}</span>
            <span className="text-[#7a95aa] font-mono">{money(s.valor)} · {s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const inp = 'w-full bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2.5 text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870] text-sm';
const btn = 'px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40';

type TabKey = 'menu' | 'cobros' | 'gastos' | 'resumen' | 'catalogos';

export default function ClinicPage() {
  const { features } = useEntitlements();
  const sinMarketing = features?.marketing === false;
  const [role, setRole] = useState<string>('doctor');
  const esRecepcion = role === 'receptionist';
  // Empezamos en el menú inicial para no exponer cifras financieras al abrir "Mi consultorio"
  const [tab, setTab] = useState<TabKey>('menu');

  const [ov, setOv] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [catalogs, setCatalogs] = useState<{ proveedores: any[]; clientes: any[]; conceptos_gasto: any[] }>({
    proveedores: [], clientes: [], conceptos_gasto: [],
  });
  const [patients, setPatients] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [o, s, p, sl, ex, cat] = await Promise.all([
        api('/clinic/overview').catch(() => null),
        api('/clinic/services').catch(() => ({ services: [] })),
        api('/clinic/pending').catch(() => ({ pending: [] })),
        api('/clinic/sales').catch(() => ({ sales: [] })),
        api('/clinic/expenses').catch(() => ({ expenses: [] })),
        api('/clinic/catalogs').catch(() => ({ proveedores: [], clientes: [], conceptos_gasto: [] })),
      ]);
      setOv(o);
      setServices(s.services || []);
      setPending(p.pending || []);
      setSales(sl.sales || []);
      setExpenses(ex.expenses || []);
      setCatalogs({
        proveedores: cat.proveedores || [],
        clientes: cat.clientes || [],
        conceptos_gasto: cat.conceptos_gasto || [],
      });
    } catch (e: any) { setMsg(e.message); }
  }, []);

  useEffect(() => {
    const r = getRole();
    setRole(r as any);
    if (r === 'receptionist') setTab('cobros');
    loadAll();
    authHeaders().then(headers => {
      fetch(`${B()}/patients/?limit=200`, { headers })
        .then(res => res.json())
        .then(d => setPatients(d.patients || []))
        .catch(() => {});
    });
  }, [loadAll]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3800); };

  const TABS = ([
    ['menu', '🏠 Menú inicial', ['doctor', 'accounting', 'marketing']],
    ['cobros', `💵 Registrar Ingreso / Cobros${pending.length ? ` (${pending.length})` : ''}`, ['doctor', 'receptionist', 'accounting']],
    ['gastos', '🧾 Ingresar Gasto', ['doctor', 'accounting']],
    ['resumen', '📊 Resumen e IA', ['doctor', 'accounting', 'marketing']],
    ['catalogos', '⚙️ Proveedores, Clientes y Servicios', ['doctor', 'accounting']],
  ] as const).filter(([, , roles]) => (roles as readonly string[]).includes(role));

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-8 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div>
            <h1 className="text-3xl font-serif font-semibold text-[#dde6ef]">
              {esRecepcion ? 'Cobros y Mostrador' : 'Mi consultorio'}
            </h1>
            <p className="text-sm text-[#7a95aa] mt-0.5">
              {esRecepcion
                ? 'Cobra los conceptos e indicaciones que el médico envía desde consulta.'
                : 'Contabilidad integral: ingresos, cirugías, aseguradoras, control de gastos y análisis con IA.'}
            </p>
          </div>
          {!esRecepcion && tab !== 'menu' && (
            <button
              onClick={() => setTab('menu')}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#0d1520] border border-[#1e2d3d] text-[#dde6ef] hover:border-[#00e5a0] transition"
            >
              ← Volver al menú inicial
            </button>
          )}
        </div>

        {/* Navegación por pestañas */}
        <div className="flex gap-1.5 mb-6 flex-wrap mt-4">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as TabKey)}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold transition"
              style={{ background: tab === id ? C.green : 'var(--c-subtle)', color: tab === id ? 'var(--c-primary-fg)' : C.muted }}>
              {label}
            </button>
          ))}
        </div>

        {msg && (
          <div className="mb-4 text-sm px-4 py-2.5 rounded-xl" style={{ background: mix(C.green, 10), border: `1px solid ${mix(C.green, 27)}`, color: C.green }}>
            {msg}
          </div>
        )}

        {/* ── MENÚ INICIAL (No expone números financieros de entrada) ── */}
        {tab === 'menu' && !esRecepcion && (
          <div className="space-y-6">
            {pending.length > 0 && (
              <div className="bg-[#f59e0b]/10 border border-[#f59e0b]/35 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-[#f59e0b]">
                    🔔 Hay {pending.length} cobro{pending.length > 1 ? 's' : ''} pendiente{pending.length > 1 ? 's' : ''} en mostrador
                  </p>
                  <p className="text-xs text-[#7a95aa] mt-0.5">
                    Pacientes listos para cobrar con las indicaciones del médico.
                  </p>
                </div>
                <button
                  onClick={() => setTab('cobros')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#f59e0b] text-black hover:opacity-90 transition shrink-0"
                >
                  Atender cobros →
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setTab('cobros')}
                className="text-left bg-[#0d1520] border border-[#1e2d3d] hover:border-[#00e5a0] rounded-2xl p-6 transition group"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4" style={{ background: mix(C.green, 14) }}>
                  💵
                </div>
                <h2 className="text-lg font-bold text-[#dde6ef] group-hover:text-[#00e5a0] transition">
                  Registrar Ingreso / Cobros
                </h2>
                <p className="text-xs text-[#7a95aa] mt-1.5 leading-relaxed">
                  Registra cobros de consultas, cirugías, procedimientos, pagos de aseguradoras, hospital o quirófano donde se realizaron y paciente atendido.
                </p>
                <span className="inline-block mt-4 text-xs font-semibold text-[#00e5a0]">Abrir módulo de ingresos →</span>
              </button>

              <button
                onClick={() => setTab('gastos')}
                className="text-left bg-[#0d1520] border border-[#1e2d3d] hover:border-[#00e5a0] rounded-2xl p-6 transition group"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4" style={{ background: mix(C.red, 14) }}>
                  🧾
                </div>
                <h2 className="text-lg font-bold text-[#dde6ef] group-hover:text-[#00e5a0] transition">
                  Ingresar Gasto
                </h2>
                <p className="text-xs text-[#7a95aa] mt-1.5 leading-relaxed">
                  Captura gastos con concepto reutilizable, proveedor y origen exacto del dinero (caja del consultorio, tarjeta del consultorio o dinero personal del médico).
                </p>
                <span className="inline-block mt-4 text-xs font-semibold text-[#00e5a0]">Registrar un gasto →</span>
              </button>

              <button
                onClick={() => setTab('resumen')}
                className="text-left bg-[#0d1520] border border-[#1e2d3d] hover:border-[#00e5a0] rounded-2xl p-6 transition group"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4" style={{ background: mix(C.blue, 14) }}>
                  📊
                </div>
                <h2 className="text-lg font-bold text-[#dde6ef] group-hover:text-[#00e5a0] transition">
                  Resumen Financiero e IA
                </h2>
                <p className="text-xs text-[#7a95aa] mt-1.5 leading-relaxed">
                  Consulta el resultado del mes actual, tu promedio mensual, dónde está el dinero (caja, banco, reembolsos al médico), comparativas históricas y reportes con IA.
                </p>
                <span className="inline-block mt-4 text-xs font-semibold text-[#00e5a0]">Ver resumen financiero →</span>
              </button>

              <button
                onClick={() => setTab('catalogos')}
                className="text-left bg-[#0d1520] border border-[#1e2d3d] hover:border-[#00e5a0] rounded-2xl p-6 transition group"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4" style={{ background: mix(C.purple, 14) }}>
                  ⚙️
                </div>
                <h2 className="text-lg font-bold text-[#dde6ef] group-hover:text-[#00e5a0] transition">
                  Configuración: Proveedores, Clientes y Servicios
                </h2>
                <p className="text-xs text-[#7a95aa] mt-1.5 leading-relaxed">
                  Da de alta tus servicios con precios, proveedores habituales, clientes / aseguradoras / hospitales y conceptos frecuentes de gasto.
                </p>
                <span className="inline-block mt-4 text-xs font-semibold text-[#00e5a0]">Administrar catálogos →</span>
              </button>
            </div>
          </div>
        )}

        {tab === 'resumen' && !esRecepcion && <Resumen ov={ov} sinMarketing={sinMarketing} />}
        {tab === 'cobros' && (
          <Cobros
            pending={pending}
            sales={sales}
            services={services}
            catalogs={catalogs}
            patients={patients}
            reload={loadAll}
            flash={flash}
          />
        )}
        {tab === 'gastos' && (
          <Gastos
            expenses={expenses}
            catalogs={catalogs}
            reload={loadAll}
            flash={flash}
          />
        )}
        {tab === 'catalogos' && !esRecepcion && (
          <CatalogosSettings
            services={services}
            catalogs={catalogs}
            reload={loadAll}
            flash={flash}
          />
        )}
      </main>
    </div>
  );
}

// ── RESUMEN FINANCIERO (Mes actual + Promedio mensual + Histórico desplegable + IA) ──
function Resumen({ ov, sinMarketing = false }: { ov: any; sinMarketing?: boolean }) {
  const [showHistory, setShowHistory] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiReport, setAiReport] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  if (!ov) return <p className="text-[#7a95aa] text-sm">Cargando resumen financiero…</p>;

  const k = ov.kpis || {};
  const ma = ov.mes_actual || {
    label: 'Mes actual',
    ingreso: k.ingreso_mes || 0,
    gasto: k.gasto_mes || 0,
    balance: k.balance_mes || 0,
    operaciones: 0,
    variacion_ingreso_pct: null,
  };
  const prom = ov.promedios || {
    meses_activos: 1,
    ingreso_mensual: k.ingreso_promedio_mensual || 0,
    gasto_mensual: k.gasto_promedio_mensual || 0,
    balance_mensual: k.balance_promedio_mensual || 0,
  };
  const ff = ov.flujo_fondos || {
    caja_consultorio_neto: 0,
    banco_consultorio_neto: 0,
    pagado_por_doctor_total: 0,
  };
  const compAnual = ov.comparativa_anual || null;

  const runAiAnalysis = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const r = await api('/clinic/ai-analysis', {
        method: 'POST',
        body: JSON.stringify({ question: aiQuestion.trim() || null }),
      });
      setAiReport(r.analysis || '');
    } catch (e: any) {
      setAiError(e.message || 'No se pudo generar el análisis con IA');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. MES ACTUAL (De entrada) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-mono uppercase tracking-wider text-[#00e5a0]">
            📅 Resultado del Mes Actual ({ma.label})
          </h2>
          {ma.variacion_ingreso_pct !== null && ma.variacion_ingreso_pct !== undefined && (
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full"
              style={{
                background: ma.variacion_ingreso_pct >= 0 ? mix(C.green, 15) : mix(C.red, 15),
                color: ma.variacion_ingreso_pct >= 0 ? C.green : C.red,
              }}>
              {ma.variacion_ingreso_pct >= 0 ? '▲' : '▼'} {Math.abs(ma.variacion_ingreso_pct)}% vs mes anterior
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Ingresos (Mes Actual)" value={money(ma.ingreso)} color={C.green} hint={`${ma.operaciones || 0} cobro(s) en el mes`} />
          <Kpi label="Gastos (Mes Actual)" value={money(ma.gasto)} color={C.red} hint="Egresos registrados este mes" />
          <Kpi label="Utilidad del Mes" value={money(ma.balance)} color={ma.balance >= 0 ? C.green : C.red} hint={ma.balance >= 0 ? 'Balance positivo' : 'Déficit en el mes'} />
          <Kpi label="Cobros pendientes" value={String(k.cobros_pendientes || 0)} color={C.amber} hint={`Ticket prom. ${money(k.ticket_promedio || 0)}`} />
        </div>
      </div>

      {/* 2. PROMEDIO MENSUAL */}
      <div>
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#7a95aa] mb-2.5">
          ⚖️ Promedio Mensual ({prom.meses_activos} {prom.meses_activos === 1 ? 'mes con movimiento' : 'meses con movimiento'})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Kpi label="Ingreso Mensual Promedio" value={money(prom.ingreso_mensual)} color={C.blue} hint="Referencia mensual de ingresos" />
          <Kpi label="Gasto Mensual Promedio" value={money(prom.gasto_mensual)} color={C.amber} hint="Referencia mensual de egresos" />
          <Kpi label="Utilidad Mensual Promedio" value={money(prom.balance_mensual)} color={prom.balance_mensual >= 0 ? C.green : C.red} hint={`% facturado: ${k.facturadas_pct || 0}%`} />
        </div>
      </div>

      {/* 3. ¿DÓNDE ESTÁ EL DINERO? (Flujo de fondos y pagos del bolsillo del doctor) */}
      <Card
        title="📍 ¿Dónde está el dinero? (Control de cajas, cuentas y pagos del médico)"
        subtitle="Rastreo exacto de entradas y salidas según el método de pago y quién desembolsó cada gasto."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-4">
            <p className="text-[10px] font-mono uppercase text-[#7a95aa]">💵 Caja chica del consultorio (Efectivo)</p>
            <p className="text-xl font-bold mt-1 font-mono" style={{ color: ff.caja_consultorio_neto >= 0 ? C.green : C.red }}>
              {money(ff.caja_consultorio_neto)}
            </p>
            <p className="text-[11px] text-[#7a95aa] mt-1">Cobros en efectivo menos gastos pagados desde caja.</p>
          </div>
          <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-4">
            <p className="text-[10px] font-mono uppercase text-[#7a95aa]">🏦 Cuenta / Tarjeta del consultorio</p>
            <p className="text-xl font-bold mt-1 font-mono" style={{ color: ff.banco_consultorio_neto >= 0 ? C.blue : C.red }}>
              {money(ff.banco_consultorio_neto)}
            </p>
            <p className="text-[11px] text-[#7a95aa] mt-1">Cobros por tarjeta/transferencia/aseguradora menos pagos bancarios.</p>
          </div>
          <div className="bg-[#111820] border border-[#a78bfa]/35 rounded-xl p-4">
            <p className="text-[10px] font-mono uppercase text-[#a78bfa]">👨‍⚕️ Pagado por el médico de su bolsillo</p>
            <p className="text-xl font-bold mt-1 font-mono text-[#a78bfa]">
              {money(ff.pagado_por_doctor_total)}
            </p>
            <p className="text-[11px] text-[#7a95aa] mt-1">Gastos del consultorio cubiertos con efectivo, tarjeta o transferencia personal del doctor.</p>
          </div>
        </div>
      </Card>

      {/* 4. ANÁLISIS CON IA */}
      <div className="bg-[#0d1520] border border-[#00e5a0]/35 rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-[#dde6ef] flex items-center gap-2">
              <span>✦</span> Analista Financiero con IA
            </p>
            <p className="text-xs text-[#7a95aa]">
              La IA revisa tus ingresos, cirugías, aseguradoras, gastos, comparativas y flujo de caja para darte estadísticas y recomendaciones accionables.
            </p>
          </div>
          <button
            onClick={runAiAnalysis}
            disabled={aiLoading}
            className={btn}
            style={{ background: C.green, color: 'var(--c-primary-fg)' }}
          >
            {aiLoading ? '✦ Analizando finanzas…' : '✦ Generar reporte y recomendaciones con IA'}
          </button>
        </div>
        <div className="flex gap-2">
          <input
            className={inp}
            placeholder="Pregunta opcional a la IA (ej. ¿Cómo va este mes comparado con el promedio? ¿Qué gastos debo ajustar?)"
            value={aiQuestion}
            onChange={e => setAiQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runAiAnalysis(); }}
          />
        </div>
        {aiError && <p className="text-xs text-[#f43f5e]">{aiError}</p>}
        {aiReport && (
          <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-4 text-sm text-[#dde6ef] whitespace-pre-wrap leading-relaxed">
            {aiReport}
          </div>
        )}
      </div>

      {/* 5. BOTÓN PARA VER HISTÓRICO Y MÁS A DETALLE */}
      <div className="flex justify-center pt-1">
        <button
          onClick={() => setShowHistory(v => !v)}
          className="px-6 py-3 rounded-2xl text-sm font-bold border transition flex items-center gap-2"
          style={{
            background: showHistory ? 'var(--c-subtle)' : '#0d1520',
            borderColor: '#00e5a0',
            color: '#00e5a0',
          }}
        >
          {showHistory ? '▲ Ocultar histórico y desglose detallado' : '📈 Ver histórico completo, comparativas por meses/años y más detalle'}
        </button>
      </div>

      {/* 6. SECCIÓN DESPLEGABLE: HISTÓRICO 12 MESES, COMPARATIVA ANUAL Y DESGLOSES */}
      {showHistory && (
        <div className="space-y-5 pt-2">
          {/* Comparativa anual */}
          {compAnual && (
            <Card title={`Comparativa Anual (${compAnual.anio_actual} vs ${compAnual.anio_anterior})`} subtitle="Acumulado anual de ingresos y egresos">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label={`Ingresos ${compAnual.anio_actual}`} value={money(compAnual.ingreso_actual)} color={C.green}
                  hint={compAnual.variacion_pct !== null ? `${compAnual.variacion_pct >= 0 ? '+' : ''}${compAnual.variacion_pct}% vs ${compAnual.anio_anterior}` : undefined} />
                <Kpi label={`Gastos ${compAnual.anio_actual}`} value={money(compAnual.gasto_actual)} color={C.red} />
                <Kpi label={`Ingresos ${compAnual.anio_anterior}`} value={money(compAnual.ingreso_anterior)} color={C.blue} />
                <Kpi label={`Gastos ${compAnual.anio_anterior}`} value={money(compAnual.gasto_anterior)} color={C.amber} />
              </div>
            </Card>
          )}

          <Card title="Histórico de Ingresos vs Gastos (Últimos 12 meses)" subtitle="Comparativa mes a mes">
            <BarrasIngGasto data={ov.historico_12m || ov.serie_mensual || []} />
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card title="Ingresos por tipo de servicio" subtitle="Consultas, cirugías, procedimientos, aseguradoras">
              <BarrasH data={ov.ingresos_por_tipo || []} color={C.green} fmt={money} />
            </Card>
            <Card title="Ingresos por lugar / hospital" subtitle="Dónde se realizaron los procedimientos">
              <BarrasH data={ov.ingresos_por_lugar || []} color={C.blue} fmt={money} />
            </Card>
            <Card title="Pagos de aseguradoras" subtitle="Desglose por compañía aseguradora">
              <BarrasH data={ov.ingresos_por_aseguradora || []} color={C.purple} fmt={money} />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Gasto por categoría" subtitle="Acumulado por rubro"><BarrasH data={ov.gasto_categorias || []} color={C.red} fmt={money} /></Card>
            <Card title="Gasto según origen del dinero" subtitle="Caja, banco o bolsillo del médico"><BarrasH data={ov.gasto_por_origen || []} color={C.amber} fmt={money} /></Card>
            <Card title="Facturado vs no facturado" subtitle="Del ingreso cobrado"><Dona data={ov.facturacion || []} /></Card>
            <Card title="Origen de pacientes" subtitle="Por canal de captación"><BarrasH data={ov.origen_pacientes || []} color={C.blue} /></Card>
          </div>

          {!sinMarketing && ov.roi_marketing && (
            <Card title="Rendimiento de la publicidad (ROI por canal)"
              subtitle={`${ov.publicidad?.pacientes_por_publicidad || 0} de ${ov.publicidad?.pacientes_total || 0} pacientes (${ov.publicidad?.pct_publicidad || 0}%) llegaron por publicidad de pago · ingreso atribuido ${money(ov.publicidad?.ingreso_atribuido || 0)}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-[11px] text-[#7a95aa] uppercase tracking-wider text-left">
                      <th className="py-2">Canal</th><th>Pacientes</th><th>Inversión</th><th>Ingreso</th><th>Ganancia</th><th>ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ov.roi_marketing.map((r: any) => {
                      const bueno = r.roas !== null && r.roas >= 2;
                      return (
                        <tr key={r.canal} className="border-t border-[#1e2d3d]">
                          <td className="py-2.5 font-semibold text-[#dde6ef]">{r.canal}</td>
                          <td className="text-[#7a95aa]">{r.pacientes}</td>
                          <td className="text-[#dde6ef] font-mono">{money(r.inversion)}</td>
                          <td className="text-[#dde6ef] font-mono">{money(r.ingreso)}</td>
                          <td className="font-mono" style={{ color: r.ganancia >= 0 ? C.green : C.red }}>{money(r.ganancia)}</td>
                          <td>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold font-mono"
                              style={{ color: r.roas === null ? C.faint : bueno ? C.green : C.amber, background: mix(r.roas === null ? C.faint : bueno ? C.green : C.amber, 10) }}>
                              {r.roas === null ? '—' : `${r.roas}x`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── COBROS Y REGISTRO DE INGRESOS (Consultas, Cirugías, Procedimientos, Aseguradoras) ──
function Cobros({ pending, sales, services, catalogs, patients, reload, flash }:
  { pending: any[]; sales: any[]; services: any[]; catalogs: { proveedores: any[]; clientes: any[]; conceptos_gasto: any[] }; patients: any[]; reload: () => void; flash: (t: string) => void }) {
  const [nuevo, setNuevo] = useState(false);
  const [tipoIngreso, setTipoIngreso] = useState<'consulta' | 'procedimiento' | 'cirugia' | 'aseguradora' | 'estudio' | 'otro'>('consulta');
  const [pid, setPid] = useState('');
  const [procedimiento, setProcedimiento] = useState('');
  const [lugar, setLugar] = useState('Consultorio');
  const [aseguradora, setAseguradora] = useState('');
  const [poliza, setPoliza] = useState('');
  const [fechaEvento, setFechaEvento] = useState(() => new Date().toISOString().slice(0, 10));
  const [sel, setSel] = useState<Record<string, number>>({});
  const [customConcepto, setCustomConcepto] = useState('');
  const [customMonto, setCustomMonto] = useState<number>(0);
  const [descuento, setDescuento] = useState(0);
  const [cortesia, setCortesia] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [modoRegistro, setModoRegistro] = useState<'cobrado' | 'pendiente'>('cobrado');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [facturada, setFacturada] = useState(false);
  const [proximaCita, setProximaCita] = useState('');
  const [indicacionesMostrador, setIndicacionesMostrador] = useState('');
  const [cobrando, setCobrando] = useState<any>(null);
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');

  const catalogItems = Object.entries(sel).filter(([, q]) => q > 0)
    .map(([sid, q]) => { const s = services.find(x => x.id === sid); return s ? { concepto: s.nombre, precio: s.precio, cantidad: q } : null; })
    .filter(Boolean) as any[];
  const manualItems = (customConcepto.trim() && customMonto > 0)
    ? [{ concepto: customConcepto.trim(), precio: customMonto, cantidad: 1 }]
    : [];
  const items = [...catalogItems, ...manualItems];
  const subtotal = items.reduce((t, i) => t + i.precio * i.cantidad, 0);
  const total = cortesia ? 0 : Math.max(subtotal - descuento, 0);

  const guardarIngreso = async () => {
    if (!items.length && !cortesia) return flash('Selecciona un servicio o escribe el concepto y monto');
    const finalItems = items.length ? items : [{ concepto: procedimiento || customConcepto || 'Consulta', precio: 0, cantidad: 1 }];
    try {
      await api('/clinic/sales', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: pid || null,
          items: finalItems,
          descuento,
          cortesia,
          descuento_motivo: cortesia ? (motivo || 'Cortesía') : (descuento > 0 ? motivo : null),
          estado: modoRegistro,
          metodo_pago: modoRegistro === 'cobrado' ? metodoPago : null,
          facturada: modoRegistro === 'cobrado' ? facturada : false,
          tipo_ingreso: tipoIngreso,
          lugar: lugar.trim() || 'Consultorio',
          aseguradora: aseguradora.trim() || null,
          poliza: poliza.trim() || null,
          procedimiento: procedimiento.trim() || finalItems.map(i => i.concepto).join(', '),
          proxima_cita: proximaCita || null,
          indicaciones_mostrador: indicacionesMostrador.trim() || null,
          fecha_evento: fechaEvento || null,
        }),
      });
      setNuevo(false);
      setSel({});
      setCustomConcepto('');
      setCustomMonto(0);
      setProcedimiento('');
      setAseguradora('');
      setPoliza('');
      setPid('');
      setDescuento(0);
      setCortesia(false);
      setMotivo('');
      setProximaCita('');
      setIndicacionesMostrador('');
      flash(modoRegistro === 'cobrado' ? 'Ingreso registrado en contabilidad' : 'Cobro enviado a mostrador');
      reload();
    } catch (e: any) { flash(e.message); }
  };

  const cobradas = (sales || []).filter(s => s.estado === 'cobrado' && (filtroTipo === 'todos' || (s.tipo_ingreso || 'consulta') === filtroTipo));

  return (
    <div className="space-y-6">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#dde6ef]">Ingresos, Cobros en Mostrador, Cirugías y Aseguradoras</h2>
          <p className="text-xs text-[#7a95aa]">
            {pending.length} cobro(s) pendiente(s) en mostrador · {sales.filter(s => s.estado === 'cobrado').length} ingreso(s) cobrado(s)
          </p>
        </div>
        <button onClick={() => setNuevo(v => !v)} className={btn} style={{ background: C.green, color: 'var(--c-primary-fg)' }}>
          {nuevo ? 'Cancelar' : '+ Registrar ingreso / cirugía / aseguradora'}
        </button>
      </div>

      {/* 1. COLA DE COBROS PENDIENTES EN MOSTRADOR (Enviados por el médico al terminar la visita) */}
      <div className="space-y-2.5">
        <p className="text-xs font-mono uppercase tracking-wider text-[#f59e0b]">
          🔔 Cobros pendientes en mostrador ({pending.length})
        </p>
        {pending.length === 0 ? (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 text-center">
            <p className="text-sm text-[#7a95aa]">No hay cobros pendientes en mostrador en este momento.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pending.map(v => (
              <div key={v.id} className="bg-[#0d1520] border border-[#f59e0b]/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#dde6ef]">{v.patient_name || 'Mostrador'}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#111820] border border-[#1e2d3d] text-[#00e5a0]">
                      {TIPO_INGRESO_LABELS[v.tipo_ingreso || 'consulta'] || v.tipo_ingreso}
                    </span>
                    {v.lugar && <span className="text-[11px] text-[#7a95aa]">📍 {v.lugar}</span>}
                  </div>
                  <p className="text-xs text-[#dde6ef]">
                    {(v.items || []).map((i: any) => `${i.concepto}${i.cantidad > 1 ? ` x${i.cantidad}` : ''} (${money(i.precio)})`).join(' · ')}
                  </p>
                  {v.proxima_cita && (
                    <p className="text-xs text-[#00e5a0] font-medium">
                      📅 Próxima visita indicada por el médico: {new Date(v.proxima_cita + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                  {v.indicaciones_mostrador && (
                    <p className="text-xs text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/25 rounded-lg px-2.5 py-1">
                      💬 Indicación del médico para mostrador: <b>{v.indicaciones_mostrador}</b>
                    </p>
                  )}
                  {v.cortesia && <p className="text-[11px] text-[#f472b6]">Cortesía — {v.descuento_motivo}</p>}
                  {!v.cortesia && v.descuento > 0 && <p className="text-[11px] text-[#f59e0b]">Descuento {money(v.descuento)} — {v.descuento_motivo}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-lg font-bold text-[#dde6ef] font-mono">{money(v.total)}</span>
                  <button onClick={() => setCobrando(v)} className={btn} style={{ background: C.green, color: 'var(--c-primary-fg)' }}>
                    Cobrar ahora
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. FORMULARIO PARA REGISTRAR INGRESO (Consulta, Cirugía, Procedimiento, Aseguradora) */}
      {nuevo && (
        <div className="bg-[#0d1520] border border-[#00e5a0]/35 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-mono text-[#00e5a0] tracking-wider uppercase">REGISTRAR NUEVO INGRESO O COBRO</p>
            <div className="inline-flex rounded-xl bg-[#111820] border border-[#1e2d3d] p-0.5">
              <button
                type="button"
                onClick={() => setModoRegistro('cobrado')}
                className="px-3 py-1 rounded-lg text-xs font-semibold transition"
                style={{ background: modoRegistro === 'cobrado' ? C.green : 'transparent', color: modoRegistro === 'cobrado' ? '#000' : C.muted }}
              >
                ✓ Ya cobrado (Registrar ingreso)
              </button>
              <button
                type="button"
                onClick={() => setModoRegistro('pendiente')}
                className="px-3 py-1 rounded-lg text-xs font-semibold transition"
                style={{ background: modoRegistro === 'pendiente' ? C.amber : 'transparent', color: modoRegistro === 'pendiente' ? '#000' : C.muted }}
              >
                ⏳ Enviar a mostrador (Pendiente)
              </button>
            </div>
          </div>

          {/* Selector de tipo de ingreso */}
          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">TIPO DE INGRESO</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {Object.entries(TIPO_INGRESO_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setTipoIngreso(k as any);
                    if (k === 'aseguradora') setMetodoPago('aseguradora');
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border text-left transition"
                  style={{
                    background: tipoIngreso === k ? mix(C.green, 16) : '#111820',
                    borderColor: tipoIngreso === k ? C.green : '#1e2d3d',
                    color: tipoIngreso === k ? C.green : '#dde6ef',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">PACIENTE</label>
              <select className={inp} value={pid} onChange={e => setPid(e.target.value)}>
                <option value="">— Sin paciente / General —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">¿DÓNDE SE REALIZÓ? (LUGAR / HOSPITAL)</label>
              <input
                list="lugares-list"
                className={inp}
                placeholder="Ej. Consultorio, Hospital Ángeles, Quirófano…"
                value={lugar}
                onChange={e => setLugar(e.target.value)}
              />
              <datalist id="lugares-list">
                <option value="Consultorio" />
                <option value="Quirófano / Clínica ambulatoria" />
                {catalogs.clientes.map((c: any) => <option key={c.id} value={c.nombre} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">PROCEDIMIENTO / CIRUGÍA / CONCEPTO</label>
              <input
                className={inp}
                placeholder="Ej. Rinoseptoplastia, Aplicación de péptidos, Consulta…"
                value={procedimiento}
                onChange={e => setProcedimiento(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">FECHA DEL PROCEDIMIENTO / PAGO</label>
              <input type="date" className={inp} value={fechaEvento} onChange={e => setFechaEvento(e.target.value)} />
            </div>
          </div>

          {/* Datos de Aseguradora / Hospital cuando aplica */}
          {(tipoIngreso === 'aseguradora' || tipoIngreso === 'cirugia' || tipoIngreso === 'procedimiento') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#111820] border border-[#1e2d3d] rounded-xl p-3.5">
              <div>
                <label className="text-[10px] font-mono text-[#00e5a0] uppercase block mb-1">ASEGURADORA / CLIENTE / INSTITUCIÓN (opcional)</label>
                <input
                  list="aseguradoras-list"
                  className={inp}
                  placeholder="Ej. GNP, AXA, MetLife, Monterrey, Particular…"
                  value={aseguradora}
                  onChange={e => setAseguradora(e.target.value)}
                />
                <datalist id="aseguradoras-list">
                  {catalogs.clientes.map((c: any) => <option key={c.id} value={c.nombre} />)}
                  <option value="GNP Seguros" />
                  <option value="AXA Seguros" />
                  <option value="Seguros Monterrey New York Life" />
                  <option value="MetLife" />
                  <option value="Mapfre" />
                  <option value="Inbursa" />
                </datalist>
              </div>
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">N° DE PÓLIZA / SINIESTRO / FOLIO (opcional)</label>
                <input
                  className={inp}
                  placeholder="Ej. Siniestro #482910 / Póliza…"
                  value={poliza}
                  onChange={e => setPoliza(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Selección de servicios del catálogo + Concepto libre */}
          {services.filter(s => s.activo).length > 0 && (
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">SERVICIOS DEL CATÁLOGO (opcional)</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {services.filter(s => s.activo).map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2">
                    <div className="min-w-0 pr-2">
                      <p className="text-xs text-[#dde6ef] truncate">{s.nombre}</p>
                      <p className="text-[11px] text-[#7a95aa] font-mono">{money(s.precio)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => setSel(p => ({ ...p, [s.id]: Math.max((p[s.id] || 0) - 1, 0) }))} className="w-6 h-6 rounded-lg bg-[#1e2d3d] text-[#dde6ef]">−</button>
                      <span className="w-5 text-center text-xs font-mono text-[#dde6ef]">{sel[s.id] || 0}</span>
                      <button type="button" onClick={() => setSel(p => ({ ...p, [s.id]: (p[s.id] || 0) + 1 }))} className="w-6 h-6 rounded-lg" style={{ background: C.green, color: 'var(--c-primary-fg)' }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Concepto y monto directo */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2.5">
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">CONCEPTO ESPECÍFICO / HONORARIOS</label>
              <input
                className={inp}
                placeholder="Ej. Honorarios quirúrgicos, Pago de aseguradora GNP, Consulta…"
                value={customConcepto}
                onChange={e => setCustomConcepto(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">MONTO ($ MXN)</label>
              <input
                type="number"
                className={inp}
                placeholder="0"
                value={customMonto || ''}
                onChange={e => setCustomMonto(+e.target.value || 0)}
              />
            </div>
          </div>

          {modoRegistro === 'cobrado' ? (
            <div className="flex flex-wrap items-center gap-4 pt-1 bg-[#111820] border border-[#1e2d3d] rounded-xl p-3.5">
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">MÉTODO DE PAGO</label>
                <div className="flex flex-wrap gap-1.5">
                  {['efectivo', 'tarjeta', 'transferencia', 'aseguradora'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodoPago(m)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize"
                      style={{ background: metodoPago === m ? C.green : '#0d1520', color: metodoPago === m ? '#000' : C.muted }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#dde6ef] mt-4 cursor-pointer">
                <input type="checkbox" checked={facturada} onChange={e => setFacturada(e.target.checked)} />
                Se emitió factura (CFDI)
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#111820] border border-[#1e2d3d] rounded-xl p-3.5">
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">PRÓXIMA CITA SUGERIDA (para recepción)</label>
                <input type="date" className={inp} value={proximaCita} onChange={e => setProximaCita(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">INDICACIONES PARA MOSTRADOR</label>
                <input className={inp} placeholder="Ej. Agendar control en 2 semanas, entregar estudios…" value={indicacionesMostrador} onChange={e => setIndicacionesMostrador(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-[#dde6ef]">
              <input type="checkbox" checked={cortesia} onChange={e => setCortesia(e.target.checked)} /> Cortesía ($0)
            </label>
            {!cortesia && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#7a95aa]">Descuento $</span>
                <input type="number" className={`${inp} w-28`} value={descuento || ''} onChange={e => setDescuento(+e.target.value || 0)} />
              </div>
            )}
            {(cortesia || descuento > 0) && (
              <input className={`${inp} flex-1 min-w-[180px]`} placeholder="Motivo del descuento/cortesía" value={motivo} onChange={e => setMotivo(e.target.value)} />
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[#1e2d3d]">
            <div className="text-sm">
              <span className="text-[#7a95aa]">Subtotal {money(subtotal)}</span>
              <span className="ml-3 text-base font-bold text-[#dde6ef]">Total {money(total)}</span>
            </div>
            <button onClick={guardarIngreso} className={btn} style={{ background: C.green, color: 'var(--c-primary-fg)' }}>
              {modoRegistro === 'cobrado' ? '✓ Guardar ingreso cobrado' : 'Enviar cobro a mostrador'}
            </button>
          </div>
        </div>
      )}

      {/* 3. HISTORIAL DE INGRESOS REGISTRADOS */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-mono uppercase tracking-wider text-[#7a95aa]">
            📋 Historial de ingresos cobrados ({cobradas.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {[
              ['todos', 'Todos'],
              ['consulta', 'Consultas'],
              ['procedimiento', 'Procedimientos'],
              ['cirugia', 'Cirugías'],
              ['aseguradora', 'Aseguradoras'],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFiltroTipo(k)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition"
                style={{
                  background: filtroTipo === k ? C.green : '#0d1520',
                  color: filtroTipo === k ? '#000' : C.muted,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {cobradas.length === 0 ? (
          <p className="text-xs text-[#3d5870] py-4">Sin ingresos registrados con este filtro.</p>
        ) : (
          <div className="space-y-1.5">
            {cobradas.slice(0, 40).map(s => (
              <div key={s.id} className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[#111820] border border-[#1e2d3d] text-[#00e5a0]">
                      {TIPO_INGRESO_LABELS[s.tipo_ingreso || 'consulta'] || s.tipo_ingreso}
                    </span>
                    <span className="text-sm font-semibold text-[#dde6ef]">{s.patient_name || 'Paciente / General'}</span>
                    {s.lugar && <span className="text-xs text-[#7a95aa]">· 📍 {s.lugar}</span>}
                    {s.aseguradora && <span className="text-xs text-[#a78bfa]">· 🛡️ {s.aseguradora}{s.poliza ? ` (${s.poliza})` : ''}</span>}
                  </div>
                  <p className="text-xs text-[#7a95aa]">
                    {s.procedimiento || (s.items || []).map((i: any) => i.concepto).join(' · ')}
                    {' · '}
                    <span className="capitalize">{s.metodo_pago || 'efectivo'}</span>
                    {s.facturada ? ' · Facturado' : ''}
                    {' · '}
                    {(s.fecha_evento || s.cobrado_en || s.created_at || '').slice(0, 10)}
                  </p>
                </div>
                <span className="font-mono font-bold text-sm text-[#00e5a0]">{money(s.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {cobrando && <ModalCobro venta={cobrando} onClose={() => setCobrando(null)} done={() => { setCobrando(null); flash('Cobro registrado exitosamente'); reload(); }} />}
    </div>
  );
}

function ModalCobro({ venta, onClose, done }: { venta: any; onClose: () => void; done: () => void }) {
  const [metodo, setMetodo] = useState('efectivo');
  const [factura, setFactura] = useState(false);
  const [busy, setBusy] = useState(false);
  const cobrar = async () => {
    setBusy(true);
    try { await api(`/clinic/sales/${venta.id}/charge`, { method: 'POST', body: JSON.stringify({ metodo_pago: metodo, facturada: factura }) }); done(); }
    catch { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <p className="text-lg font-semibold text-[#dde6ef]">Cobrar {money(venta.total)}</p>
        <p className="text-xs text-[#7a95aa] mb-3">{venta.patient_name || 'Mostrador'}</p>
        {venta.proxima_cita && (
          <p className="text-xs text-[#00e5a0] mb-2">📅 Próxima cita indicada: {venta.proxima_cita}</p>
        )}
        {venta.indicaciones_mostrador && (
          <p className="text-xs text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/25 rounded-lg px-2.5 py-1.5 mb-3">
            💬 {venta.indicaciones_mostrador}
          </p>
        )}
        <label className="text-[10px] font-mono text-[#7a95aa] block mb-1.5">MÉTODO DE PAGO</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {['efectivo', 'tarjeta', 'transferencia', 'aseguradora'].map(m => (
            <button key={m} onClick={() => setMetodo(m)} className="py-2 rounded-xl text-xs font-semibold capitalize"
              style={{ background: metodo === m ? C.green : 'var(--c-subtle)', color: metodo === m ? 'var(--c-primary-fg)' : C.muted }}>{m}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-[#dde6ef] mb-5">
          <input type="checkbox" checked={factura} onChange={e => setFactura(e.target.checked)} /> Requiere factura
        </label>
        <div className="flex gap-2">
          <button onClick={onClose} className={`${btn} flex-1`} style={{ background: 'var(--c-border)', color: C.text }}>Cancelar</button>
          <button onClick={cobrar} disabled={busy} className={`${btn} flex-1`} style={{ background: C.green, color: 'var(--c-primary-fg)' }}>{busy ? '…' : 'Confirmar cobro'}</button>
        </div>
      </div>
    </div>
  );
}

// ── GASTOS (Concepto guardable + Origen del dinero: caja, tarjeta consultorio, doctor, etc.) ──
function Gastos({ expenses, catalogs, reload, flash }: {
  expenses: any[];
  catalogs: { proveedores: any[]; clientes: any[]; conceptos_gasto: any[] };
  reload: () => void;
  flash: (t: string) => void;
}) {
  const [cat, setCat] = useState('insumos');
  const [canal, setCanal] = useState('Meta');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState(0);
  const [proveedor, setProveedor] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [origenFondo, setOrigenFondo] = useState<string>('caja_consultorio');
  const [guardarConcepto, setGuardarConcepto] = useState(false);
  const [guardarProveedor, setGuardarProveedor] = useState(false);

  const CATS = ['insumos', 'renta', 'sueldos', 'equipo_medico', 'servicios', 'impuestos_contador', 'seguros', 'publicidad', 'otros'];

  const guardar = async () => {
    if (!concepto.trim()) return flash('Escribe el concepto del gasto');
    if (!monto || monto <= 0) return flash('Indica un monto válido');
    try {
      await api('/clinic/expenses', {
        method: 'POST',
        body: JSON.stringify({
          categoria: cat,
          canal: cat === 'publicidad' ? canal : null,
          concepto: concepto.trim(),
          monto,
          proveedor: proveedor.trim() || null,
          fecha,
          origen_fondo: origenFondo,
          guardar_concepto: guardarConcepto,
          guardar_proveedor: guardarProveedor,
        }),
      });
      setConcepto('');
      setMonto(0);
      setProveedor('');
      setGuardarConcepto(false);
      setGuardarProveedor(false);
      flash('Gasto registrado correctamente');
      reload();
    } catch (e: any) { flash(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
        <p className="text-xs font-mono text-[#00e5a0] tracking-wider uppercase">🧾 REGISTRAR GASTO / EGRESO</p>

        {/* Conceptos frecuentes guardados */}
        {catalogs.conceptos_gasto.length > 0 && (
          <div>
            <p className="text-[10px] font-mono text-[#7a95aa] uppercase mb-1.5">CONCEPTOS GUARDADOS (clic para usar)</p>
            <div className="flex flex-wrap gap-1.5">
              {catalogs.conceptos_gasto.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setConcepto(c.nombre);
                    if (c.categoria) setCat(c.categoria);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] hover:border-[#00e5a0] transition"
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">CONCEPTO DEL GASTO *</label>
            <input
              className={inp}
              placeholder="Ej. Compra de jeringas y gasas, Renta del consultorio, Pago de luz…"
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-[#00e5a0] mt-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={guardarConcepto}
                onChange={e => setGuardarConcepto(e.target.checked)}
              />
              ¿Guardar este concepto para usarlo más adelante?
            </label>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">MONTO ($ MXN) *</label>
            <input
              className={inp}
              type="number"
              placeholder="0"
              value={monto || ''}
              onChange={e => setMonto(+e.target.value || 0)}
            />
          </div>

          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">FECHA</label>
            <input
              className={inp}
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
            />
          </div>
        </div>

        {/* ¿De dónde salió el dinero? */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">
            ¿DE DÓNDE SALIÓ EL DINERO PARA HACER ESTE PAGO? *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(ORIGEN_FONDO_LABELS).map(([key, info]) => {
              const active = origenFondo === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOrigenFondo(key)}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-semibold border text-left transition"
                  style={{
                    background: active ? (info.isDoctor ? mix(C.purple, 18) : mix(C.green, 16)) : '#111820',
                    borderColor: active ? (info.isDoctor ? C.purple : C.green) : '#1e2d3d',
                    color: active ? (info.isDoctor ? '#c4b5fd' : C.green) : '#dde6ef',
                  }}
                >
                  {info.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">CATEGORÍA</label>
            <select className={inp} value={cat} onChange={e => setCat(e.target.value)}>
              {CATS.map(c => <option key={c} value={c}>{c.replace('_', ' ').toUpperCase()}</option>)}
            </select>
          </div>
          {cat === 'publicidad' && (
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">CANAL PUBLICITARIO</label>
              <select className={inp} value={canal} onChange={e => setCanal(e.target.value)}>
                {['Meta', 'Google', 'Doctoralia', 'TikTok', 'Agencia'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div className={cat === 'publicidad' ? '' : 'sm:col-span-2'}>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">PROVEEDOR (opcional)</label>
            <input
              list="proveedores-list"
              className={inp}
              placeholder="Ej. Farmacia Especializada, CFE, Telmex…"
              value={proveedor}
              onChange={e => setProveedor(e.target.value)}
            />
            <datalist id="proveedores-list">
              {catalogs.proveedores.map((p: any) => <option key={p.id} value={p.nombre} />)}
            </datalist>
            {proveedor.trim() && (
              <label className="flex items-center gap-2 text-xs text-[#7a95aa] mt-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardarProveedor}
                  onChange={e => setGuardarProveedor(e.target.checked)}
                />
                Guardar proveedor en catálogo
              </label>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button onClick={guardar} className={btn} style={{ background: C.green, color: 'var(--c-primary-fg)' }}>
            ✓ Registrar gasto
          </button>
        </div>
      </div>

      {/* Lista de gastos */}
      <div className="space-y-1.5">
        <p className="text-xs font-mono uppercase tracking-wider text-[#7a95aa] mb-2">
          Gastos registrados ({expenses.length})
        </p>
        {expenses.map(e => {
          const orig = ORIGEN_FONDO_LABELS[e.origen_fondo || 'caja_consultorio'] || ORIGEN_FONDO_LABELS.caja_consultorio;
          return (
            <div key={e.id} className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[#dde6ef] truncate">{e.concepto || e.categoria}{e.canal ? ` · ${e.canal}` : ''}</p>
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                    style={{
                      background: orig.isDoctor ? mix(C.purple, 14) : mix(C.blue, 12),
                      borderColor: orig.isDoctor ? mix(C.purple, 35) : mix(C.blue, 30),
                      color: orig.isDoctor ? '#c4b5fd' : C.blue,
                    }}
                  >
                    {orig.short}
                  </span>
                </div>
                <p className="text-[11px] text-[#7a95aa]">
                  {e.fecha} · <span className="capitalize">{(e.categoria || '').replace('_', ' ')}</span>
                  {e.proveedor ? ` · Proveedor: ${e.proveedor}` : ''}
                </p>
              </div>
              <span className="font-mono font-bold text-sm text-[#f43f5e]">{money(e.monto)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CONFIGURACIÓN Y CATÁLOGOS (Servicios con precios, Proveedores, Clientes/Aseguradoras, Conceptos) ──
function CatalogosSettings({ services, catalogs, reload, flash }: {
  services: any[];
  catalogs: { proveedores: any[]; clientes: any[]; conceptos_gasto: any[] };
  reload: () => void;
  flash: (t: string) => void;
}) {
  // Servicios
  const [srvNombre, setSrvNombre] = useState('');
  const [srvPrecio, setSrvPrecio] = useState(0);

  // Proveedor
  const [provNombre, setProvNombre] = useState('');
  const [provCat, setProvCat] = useState('');
  const [provTel, setProvTel] = useState('');

  // Cliente / Aseguradora / Hospital
  const [cliNombre, setCliNombre] = useState('');
  const [cliTipo, setCliTipo] = useState('Aseguradora');
  const [cliRfc, setCliRfc] = useState('');

  // Concepto frecuente de gasto
  const [conNombre, setConNombre] = useState('');
  const [conCat, setConCat] = useState('insumos');

  const addService = async () => {
    if (!srvNombre.trim() || !srvPrecio) return flash('Nombre y precio requeridos');
    try {
      await api('/clinic/services', { method: 'POST', body: JSON.stringify({ nombre: srvNombre.trim(), precio: srvPrecio, orden: services.length + 1 }) });
      setSrvNombre(''); setSrvPrecio(0); flash('Servicio agregado'); reload();
    } catch (e: any) { flash(e.message); }
  };
  const delService = async (id: string) => {
    try { await api(`/clinic/services/${id}`, { method: 'DELETE' }); reload(); } catch (e: any) { flash(e.message); }
  };
  const updateServicePrice = async (s: any, nuevo: number) => {
    try { await api(`/clinic/services/${s.id}`, { method: 'PUT', body: JSON.stringify({ nombre: s.nombre, precio: nuevo, activo: s.activo, orden: s.orden }) }); reload(); } catch {}
  };

  const addCatalogItem = async (kind: 'proveedores' | 'clientes' | 'conceptos_gasto', payload: any, reset: () => void) => {
    if (!payload.nombre?.trim()) return flash('Escribe el nombre');
    try {
      await api('/clinic/catalogs/item', { method: 'POST', body: JSON.stringify({ kind, ...payload }) });
      reset();
      flash('Guardado en catálogo');
      reload();
    } catch (e: any) { flash(e.message); }
  };

  const delCatalogItem = async (kind: string, id: string) => {
    try {
      await api(`/clinic/catalogs/item/${kind}/${id}`, { method: 'DELETE' });
      reload();
    } catch (e: any) { flash(e.message); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Servicios y precios */}
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-3">
        <p className="text-xs font-mono text-[#00e5a0] tracking-wider uppercase">🩺 SERVICIOS Y PRECIOS</p>
        <p className="text-xs text-[#7a95aa]">Aparecen como botones rápidos al cerrar cada consulta y al enviar cobros a mostrador.</p>
        <div className="flex gap-2">
          <input className={inp} placeholder="Nombre del servicio o procedimiento" value={srvNombre} onChange={e => setSrvNombre(e.target.value)} />
          <input className={`${inp} w-28`} type="number" placeholder="Precio $" value={srvPrecio || ''} onChange={e => setSrvPrecio(+e.target.value || 0)} />
          <button onClick={addService} className={btn} style={{ background: C.green, color: 'var(--c-primary-fg)' }}>+</button>
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {services.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2">
              <span className="text-sm text-[#dde6ef]">{s.nombre}</span>
              <div className="flex items-center gap-2">
                <span className="text-[#7a95aa] text-xs">$</span>
                <input type="number" defaultValue={s.precio} onBlur={e => { const v = +e.target.value; if (v !== s.precio) updateServicePrice(s, v); }}
                  className="w-24 bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-2 py-1 text-sm text-[#dde6ef] font-mono outline-none focus:border-[#00e5a0]" />
                <button onClick={() => delService(s.id)} className="text-[#f43f5e] text-lg leading-none px-1">×</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Clientes, Aseguradoras y Hospitales */}
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-3">
        <p className="text-xs font-mono text-[#00e5a0] tracking-wider uppercase">🛡️ CLIENTES, ASEGURADORAS Y HOSPITALES</p>
        <p className="text-xs text-[#7a95aa]">Para asociar pagos de aseguradoras, cirugías en hospitales o convenios.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className={inp} placeholder="Nombre (ej. GNP, Hospital Ángeles)" value={cliNombre} onChange={e => setCliNombre(e.target.value)} />
          <select className={inp} value={cliTipo} onChange={e => setCliTipo(e.target.value)}>
            <option value="Aseguradora">Aseguradora</option>
            <option value="Hospital / Quirófano">Hospital / Quirófano</option>
            <option value="Empresa / Convenio">Empresa / Convenio</option>
            <option value="Cliente">Cliente</option>
          </select>
          <div className="flex gap-2">
            <input className={inp} placeholder="RFC / Tel (opc.)" value={cliRfc} onChange={e => setCliRfc(e.target.value)} />
            <button
              onClick={() => addCatalogItem('clientes', { nombre: cliNombre, categoria: cliTipo, rfc: cliRfc }, () => { setCliNombre(''); setCliRfc(''); })}
              className={btn}
              style={{ background: C.green, color: 'var(--c-primary-fg)' }}
            >
              +
            </button>
          </div>
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {catalogs.clientes.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2">
              <div>
                <p className="text-sm text-[#dde6ef] font-medium">{c.nombre}</p>
                <p className="text-[11px] text-[#7a95aa]">{c.categoria || 'Cliente'}{c.rfc ? ` · ${c.rfc}` : ''}</p>
              </div>
              <button onClick={() => delCatalogItem('clientes', c.id)} className="text-[#f43f5e] text-lg leading-none px-1">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Proveedores */}
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-3">
        <p className="text-xs font-mono text-[#00e5a0] tracking-wider uppercase">📦 PROVEEDORES</p>
        <p className="text-xs text-[#7a95aa]">Proveedores de insumos, laboratorios, renta y servicios del consultorio.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className={inp} placeholder="Nombre del proveedor" value={provNombre} onChange={e => setProvNombre(e.target.value)} />
          <input className={inp} placeholder="Giro / Categoría" value={provCat} onChange={e => setProvCat(e.target.value)} />
          <div className="flex gap-2">
            <input className={inp} placeholder="Teléfono / Contacto" value={provTel} onChange={e => setProvTel(e.target.value)} />
            <button
              onClick={() => addCatalogItem('proveedores', { nombre: provNombre, categoria: provCat, telefono: provTel }, () => { setProvNombre(''); setProvCat(''); setProvTel(''); })}
              className={btn}
              style={{ background: C.green, color: 'var(--c-primary-fg)' }}
            >
              +
            </button>
          </div>
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {catalogs.proveedores.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2">
              <div>
                <p className="text-sm text-[#dde6ef] font-medium">{p.nombre}</p>
                <p className="text-[11px] text-[#7a95aa]">{[p.categoria, p.telefono].filter(Boolean).join(' · ') || 'Proveedor'}</p>
              </div>
              <button onClick={() => delCatalogItem('proveedores', p.id)} className="text-[#f43f5e] text-lg leading-none px-1">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Conceptos frecuentes de gasto */}
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-3">
        <p className="text-xs font-mono text-[#00e5a0] tracking-wider uppercase">🏷️ CONCEPTOS FRECUENTES DE GASTO</p>
        <p className="text-xs text-[#7a95aa]">Conceptos guardados para capturar gastos en un clic.</p>
        <div className="flex gap-2">
          <input className={inp} placeholder="Ej. Renta consultorio, Insumos estéticos…" value={conNombre} onChange={e => setConNombre(e.target.value)} />
          <select className={`${inp} w-44`} value={conCat} onChange={e => setConCat(e.target.value)}>
            {['insumos', 'renta', 'sueldos', 'equipo_medico', 'servicios', 'impuestos_contador', 'seguros', 'publicidad', 'otros'].map(c => (
              <option key={c} value={c}>{c.replace('_', ' ')}</option>
            ))}
          </select>
          <button
            onClick={() => addCatalogItem('conceptos_gasto', { nombre: conNombre, categoria: conCat }, () => setConNombre(''))}
            className={btn}
            style={{ background: C.green, color: 'var(--c-primary-fg)' }}
          >
            +
          </button>
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {catalogs.conceptos_gasto.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2">
              <div>
                <p className="text-sm text-[#dde6ef]">{c.nombre}</p>
                {c.categoria && <p className="text-[11px] text-[#7a95aa] capitalize">{c.categoria.replace('_', ' ')}</p>}
              </div>
              <button onClick={() => delCatalogItem('conceptos_gasto', c.id)} className="text-[#f43f5e] text-lg leading-none px-1">×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
