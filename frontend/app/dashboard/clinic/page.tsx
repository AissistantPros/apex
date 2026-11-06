'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { getSession } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';
import { mix } from '@/app/lib/ui';
import { useEntitlements } from '@/app/lib/useEntitlements';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const money = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-MX');

const C = {
  card: 'var(--c-card)',
  border: 'var(--c-border)',
  text: 'var(--c-text)',
  muted: 'var(--c-text-2)',
  faint: 'var(--c-text-3)',
  green: '#00e5a0',
  blue: '#38bdf8',
  purple: '#a78bfa',
  amber: '#f59e0b',
  pink: '#f472b6',
  red: '#f43f5e',
};
const CAT_COLORS = [C.green, C.blue, C.purple, C.amber, C.pink];

const ORIGEN_FONDO_LABELS: Record<string, { label: string; short: string; isDoctor: boolean; icon: string }> = {
  caja_consultorio:          { label: 'Caja del consultorio (Efectivo)', short: 'Caja chica', isDoctor: false, icon: '💵' },
  tarjeta_consultorio:       { label: 'Tarjeta de la clínica', short: 'Tarjeta clínica', isDoctor: false, icon: '💳' },
  transferencia_consultorio: { label: 'Transferencia bancaria de clínica', short: 'Banco clínica', isDoctor: false, icon: '🏦' },
  efectivo_doctor:           { label: 'Efectivo personal del Dr.', short: 'Dr. (Efectivo)', isDoctor: true, icon: '👨‍⚕️' },
  tarjeta_doctor:            { label: 'Tarjeta personal del Dr.', short: 'Dr. (Tarjeta)', isDoctor: true, icon: '👨‍⚕️💳' },
  transferencia_doctor:      { label: 'Transferencia personal del Dr.', short: 'Dr. (Transf.)', isDoctor: true, icon: '👨‍⚕️🏦' },
};

const TIPO_INGRESO_LABELS: Record<string, { label: string; icon: string }> = {
  consulta:      { label: 'Consulta médica', icon: '🩺' },
  procedimiento: { label: 'Procedimiento en consultorio', icon: '💉' },
  cirugia:       { label: 'Cirugía / Quirófano', icon: '🏥' },
  estudio:       { label: 'Estudio diagnóstico', icon: '🧪' },
  aseguradora:   { label: 'Pago de aseguradora', icon: '🛡️' },
  producto:      { label: 'Suplemento / Producto', icon: '💊' },
  otro:          { label: 'Otro ingreso', icon: '📋' },
};

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// Estilos móviles táctiles Apple HIG: inputs base 16px para evitar zoom safari en iPhone
const inp = 'w-full bg-[#111820] border border-[#1e2d3d] rounded-xl px-3.5 py-3 text-base sm:text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#486581]';
const btnPrimary = 'min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] shadow-sm';
const btnSecondary = 'min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold transition bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] hover:border-[#00e5a0] active:scale-[0.98]';

// ── Gráficas y KPIs Limpios ──────────────────────────────────────────────────
function Kpi({
  label,
  value,
  color = C.green,
  hint,
  icon,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
  icon?: string;
}) {
  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-[#2a3e52] transition">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-mono tracking-wider text-[#7a95aa] uppercase truncate">{label}</p>
        {icon && <span className="text-base shrink-0">{icon}</span>}
      </div>
      <p className="mt-2 font-bold font-mono tracking-tight" style={{ color, fontSize: 24, lineHeight: 1.15 }}>
        {value}
      </p>
      {hint && <p className="text-xs text-[#7a95aa] mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  right,
  badge,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-4 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[#dde6ef]">{title}</h3>
            {badge}
          </div>
          {subtitle && <p className="text-xs text-[#7a95aa] mt-0.5 leading-relaxed">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </div>
  );
}

function BarrasIngGasto({ data }: { data: { nombre: string; ingreso: number; gasto: number }[] }) {
  const max = Math.max(...data.flatMap(d => [d.ingreso, d.gasto]), 1);
  return (
    <div className="flex items-end justify-between gap-2 sm:gap-3 h-52 pt-3 px-1">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
          <div className="flex items-end gap-1 w-full justify-center h-full">
            <div
              className="w-2.5 sm:w-3.5 rounded-t transition-all group-hover:brightness-110"
              style={{ height: `${(d.ingreso / max) * 100}%`, minHeight: 3, background: C.green }}
              title={`Ingreso ${money(d.ingreso)}`}
            />
            <div
              className="w-2.5 sm:w-3.5 rounded-t transition-all group-hover:brightness-110"
              style={{ height: `${(d.gasto / max) * 100}%`, minHeight: 3, background: C.red, opacity: 0.85 }}
              title={`Gasto ${money(d.gasto)}`}
            />
          </div>
          <span className="text-[10px] text-[#7a95aa] mt-2 whitespace-nowrap font-mono">{d.nombre}</span>
        </div>
      ))}
    </div>
  );
}

function BarrasH({
  data,
  color = C.green,
  fmt = (n: number) => String(n),
}: {
  data: { nombre: string; valor: number }[];
  color?: string;
  fmt?: (n: number) => string;
}) {
  if (!data?.length) return <p className="text-xs text-[#486581] py-3">Sin registros suficientes para graficar</p>;
  const max = Math.max(...data.map(d => Math.abs(d.valor)), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28 sm:w-36 shrink-0 text-right text-xs text-[#dde6ef] truncate" title={d.nombre}>
            {d.nombre}
          </div>
          <div className="flex-1 h-7 bg-[#111820] rounded-lg overflow-hidden relative">
            <div
              className="h-full rounded-lg transition-all"
              style={{ width: `${(Math.abs(d.valor) / max) * 100}%`, background: d.valor < 0 ? C.red : color, opacity: 0.9 }}
            />
            <span className="absolute inset-y-0 right-2.5 flex items-center text-xs font-mono font-medium text-[#dde6ef]">
              {fmt(d.valor)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Dona({ data }: { data: { nombre: string; valor: number }[] }) {
  const total = (data || []).reduce((s, d) => s + d.valor, 0);
  if (!total) return <p className="text-xs text-[#486581]">Sin datos registrados</p>;
  const R = 48, cx = 60, cy = 60, C2 = 2 * Math.PI * R;
  let acc = 0;
  const segs = data.map((d, i) => {
    const f = d.valor / total;
    const s = { c: CAT_COLORS[i % CAT_COLORS.length], dash: f * C2, off: acc * C2, pct: Math.round(f * 100), ...d };
    acc += f;
    return s;
  });
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#162231" strokeWidth={20} />
        {segs.map((s, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={s.c}
            strokeWidth={20}
            strokeDasharray={`${s.dash} ${C2 - s.dash}`}
            strokeDashoffset={-s.off}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
      </svg>
      <div className="space-y-2 w-full">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.c }} />
              <span className="text-[#dde6ef] truncate">{s.nombre}</span>
            </div>
            <span className="text-[#7a95aa] font-mono shrink-0 ml-2">
              {money(s.valor)} · <b className="text-[#dde6ef]">{s.pct}%</b>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type TabKey = 'pulso' | 'cobros' | 'gastos' | 'prestaciones' | 'equipo' | 'catalogos';

// ── PÁGINA PRINCIPAL: MI CLÍNICA / MEDICAL PRACTICE OS ──────────────────────
export default function ClinicPage() {
  const { features } = useEntitlements();
  const sinMarketing = features?.marketing === false;
  const [role, setRole] = useState<string>('doctor');
  const esRecepcion = role === 'receptionist';

  // Pestaña activa por defecto
  const [tab, setTab] = useState<TabKey>('pulso');

  // Estados de datos
  const [ov, setOv] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [catalogs, setCatalogs] = useState<{ proveedores: any[]; clientes: any[]; conceptos_gasto: any[] }>({
    proveedores: [],
    clientes: [],
    conceptos_gasto: [],
  });
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Modales globales
  const [showReimburseModal, setShowReimburseModal] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [o, s, p, sl, ex, cat, st] = await Promise.all([
        api('/clinic/overview').catch(() => null),
        api('/clinic/services').catch(() => ({ services: [] })),
        api('/clinic/pending').catch(() => ({ pending: [] })),
        api('/clinic/sales').catch(() => ({ sales: [] })),
        api('/clinic/expenses').catch(() => ({ expenses: [] })),
        api('/clinic/catalogs').catch(() => ({ proveedores: [], clientes: [], conceptos_gasto: [] })),
        api('/staff').catch(() => ({ members: [] })),
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
      setStaff(st.members || []);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const r = getRole();
    setRole(r as any);
    if (r === 'receptionist') setTab('cobros');
    loadAll();

    authHeaders().then(headers => {
      fetch(`${B()}/patients/?limit=250`, { headers })
        .then(res => res.json())
        .then(d => setPatients(d.patients || []))
        .catch(() => {});
    });
  }, [loadAll]);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(''), 4000);
  };

  const TABS = useMemo(() => {
    const base = [
      { id: 'pulso', label: '📊 Pulso & Asesor IA', roles: ['doctor', 'accounting', 'marketing'] },
      {
        id: 'cobros',
        label: `💵 Cobros & Mostrador`,
        badge: pending.length > 0 ? pending.length : undefined,
        roles: ['doctor', 'receptionist', 'accounting'],
      },
      { id: 'gastos', label: '🧾 Gastos', roles: ['doctor', 'accounting'] },
      { id: 'prestaciones', label: '🩺 Catálogo de Prestaciones', roles: ['doctor', 'accounting'] },
      { id: 'equipo', label: `👥 Mi Equipo (${staff.length})`, roles: ['doctor'] },
      { id: 'catalogos', label: '⚙️ Proveedores & Convenios', roles: ['doctor', 'accounting'] },
    ];
    return base.filter(t => t.roles.includes(role));
  }, [role, pending.length, staff.length]);

  return (
    <div className="min-h-screen bg-[#070a0e] text-[#dde6ef]">
      <main className="page-content pt-16 px-4 sm:px-6 py-6 max-w-7xl mx-auto space-y-6">
        {/* Cabecera Principal */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1e2d3d]/60">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#dde6ef]">
                {esRecepcion ? 'Cobros & Mostrador' : 'Centro de Mando Clínico'}
              </h1>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#00e5a0]/10 border border-[#00e5a0]/30 text-[#00e5a0]">
                {esRecepcion ? 'Recepción' : 'Mi Clínica'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#7a95aa] mt-1 leading-relaxed">
              {esRecepcion
                ? 'Atención en caja: cobra los conceptos, estudios y consultas indicados por el médico.'
                : 'Gestión médica integral: flujo real del dinero, prestaciones fijas y variables, aseguradoras y asesoría estratégica con IA.'}
            </p>
          </div>

          {/* Quick status de caja y pendientes */}
          {!esRecepcion && ov?.flujo_fondos && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <div className="px-3 py-2 rounded-xl bg-[#0d1520] border border-[#1e2d3d] text-left shrink-0">
                <p className="text-[10px] font-mono uppercase text-[#7a95aa]">💵 Caja chica</p>
                <p className="text-sm font-bold font-mono text-[#00e5a0]">
                  {money(ov.flujo_fondos.caja_consultorio_neto)}
                </p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-[#0d1520] border border-[#1e2d3d] text-left shrink-0">
                <p className="text-[10px] font-mono uppercase text-[#7a95aa]">🏦 Banco</p>
                <p className="text-sm font-bold font-mono text-[#38bdf8]">
                  {money(ov.flujo_fondos.banco_consultorio_neto)}
                </p>
              </div>
              {ov.flujo_fondos.pagado_por_doctor_total > 0 && (
                <button
                  onClick={() => setShowReimburseModal(true)}
                  className="px-3 py-2 rounded-xl bg-[#a78bfa]/10 border border-[#a78bfa]/30 text-left shrink-0 hover:bg-[#a78bfa]/20 transition"
                >
                  <p className="text-[10px] font-mono uppercase text-[#a78bfa]">👨‍⚕️ Reembolsar al Dr.</p>
                  <p className="text-sm font-bold font-mono text-[#c4b5fd]">
                    {money(ov.flujo_fondos.pagado_por_doctor_total)} →
                  </p>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pestañas de Navegación Segmentada (Diseño táctil Apple / responsive) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as TabKey)}
                className="min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-2 active:scale-95"
                style={{
                  background: active ? '#00e5a0' : '#0d1520',
                  color: active ? '#051b14' : '#7a95aa',
                  border: `1px solid ${active ? '#00e5a0' : '#1e2d3d'}`,
                }}
              >
                <span>{t.label}</span>
                {t.badge !== undefined && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold"
                    style={{
                      background: active ? '#051b14' : '#f59e0b',
                      color: active ? '#00e5a0' : '#000',
                    }}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Alerta de notificación flotante */}
        {msg && (
          <div className="p-3.5 rounded-xl bg-[#00e5a0]/10 border border-[#00e5a0]/30 text-[#00e5a0] text-sm flex items-center justify-between gap-3 animate-in fade-in">
            <span>{msg}</span>
            <button onClick={() => setMsg('')} className="text-[#00e5a0] hover:opacity-75 font-bold">×</button>
          </div>
        )}

        {/* ── 1. PESTAÑA: PULSO CLÍNICO & ASESOR IA ── */}
        {tab === 'pulso' && !esRecepcion && (
          <PulsoTab
            ov={ov}
            sinMarketing={sinMarketing}
            onReimburse={() => setShowReimburseModal(true)}
            onGoCobros={() => setTab('cobros')}
            reload={loadAll}
          />
        )}

        {/* ── 2. PESTAÑA: COBROS & MOSTRADOR ── */}
        {tab === 'cobros' && (
          <CobrosTab
            pending={pending}
            sales={sales}
            services={services}
            catalogs={catalogs}
            patients={patients}
            reload={loadAll}
            flash={flash}
          />
        )}

        {/* ── 3. PESTAÑA: GASTOS ── */}
        {tab === 'gastos' && (
          <GastosTab
            expenses={expenses}
            catalogs={catalogs}
            reload={loadAll}
            flash={flash}
            onReimburse={() => setShowReimburseModal(true)}
          />
        )}

        {/* ── 4. PESTAÑA: CATÁLOGO DE PRESTACIONES (PRECIOS FIJOS Y VARIABLES) ── */}
        {tab === 'prestaciones' && !esRecepcion && (
          <PrestacionesTab
            services={services}
            reload={loadAll}
            flash={flash}
          />
        )}

        {/* ── 5. PESTAÑA: MI EQUIPO (PREVIEW CON VÍNCULO A /STAFF) ── */}
        {tab === 'equipo' && !esRecepcion && (
          <EquipoTab staff={staff} reload={loadAll} />
        )}

        {/* ── 6. PESTAÑA: PROVEEDORES, CONVENIOS Y CONCEPTOS ── */}
        {tab === 'catalogos' && !esRecepcion && (
          <CatalogosTab
            catalogs={catalogs}
            reload={loadAll}
            flash={flash}
          />
        )}

        {/* MODAL DE REEMBOLSO AL DOCTOR */}
        {showReimburseModal && (
          <ModalReembolso
            saldoPendiente={ov?.flujo_fondos?.pagado_por_doctor_total || 0}
            onClose={() => setShowReimburseModal(false)}
            done={() => {
              setShowReimburseModal(false);
              flash('Reembolso al médico registrado correctamente');
              loadAll();
            }}
          />
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE 1: PULSO & ASESOR ESTRATÉGICO CON IA
// ─────────────────────────────────────────────────────────────────────────────
function PulsoTab({
  ov,
  sinMarketing,
  onReimburse,
  onGoCobros,
  reload,
}: {
  ov: any;
  sinMarketing: boolean;
  onReimburse: () => void;
  onGoCobros: () => void;
  reload: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiReport, setAiReport] = useState<string>(ov?.ai_analysis || '');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  if (!ov) {
    return (
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-12 text-center text-[#7a95aa]">
        <p className="animate-pulse">Cargando métricas clínicas y financieras…</p>
      </div>
    );
  }

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
  const pj = ov.patient_journey || {
    primeras_visitas: 0,
    subsecuentes: 0,
    total_pacientes: 0,
    canales: [],
    presencia_digital: {
      busqueda_maps: 0,
      visita_web: 0,
      redes_sociales: 0,
      nota_pedagogica: '',
    },
  };
  const aseguradorasPorCobrar = ov.aseguradoras_por_cobrar || [];

  const runAiAnalysis = async (customPrompt?: string) => {
    setAiLoading(true);
    setAiError('');
    try {
      const q = customPrompt !== undefined ? customPrompt : aiQuestion.trim();
      const r = await api('/clinic/ai-analysis', {
        method: 'POST',
        body: JSON.stringify({ question: q || null }),
      });
      setAiReport(r.analysis || '');
    } catch (e: any) {
      setAiError(e.message || 'No se pudo generar el análisis');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. HERO: MES ACTUAL VS PROMEDIO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tarjeta Mes Actual */}
        <div className="lg:col-span-2 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-[#00e5a0]">
                📅 Resultado del Mes ({ma.label})
              </span>
              {ma.variacion_ingreso_pct !== null && (
                <span
                  className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full"
                  style={{
                    background: ma.variacion_ingreso_pct >= 0 ? 'rgba(0,229,160,0.12)' : 'rgba(244,63,94,0.12)',
                    color: ma.variacion_ingreso_pct >= 0 ? '#00e5a0' : '#f43f5e',
                  }}
                >
                  {ma.variacion_ingreso_pct >= 0 ? '▲ +' : '▼ '}
                  {ma.variacion_ingreso_pct}% vs mes previo
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Ingresos Cobrados</p>
                <p className="text-2xl sm:text-3xl font-bold font-mono text-[#00e5a0] mt-1">
                  {money(ma.ingreso)}
                </p>
                <p className="text-xs text-[#7a95aa] mt-0.5">{ma.operaciones || 0} cobros</p>
              </div>

              <div>
                <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Gastos del Mes</p>
                <p className="text-2xl sm:text-3xl font-bold font-mono text-[#f43f5e] mt-1">
                  {money(ma.gasto)}
                </p>
                <p className="text-xs text-[#7a95aa] mt-0.5">Operación clínica</p>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Utilidad Neta</p>
                <p
                  className="text-2xl sm:text-3xl font-bold font-mono mt-1"
                  style={{ color: ma.balance >= 0 ? '#00e5a0' : '#f43f5e' }}
                >
                  {money(ma.balance)}
                </p>
                <p className="text-xs text-[#7a95aa] mt-0.5">
                  {ma.balance >= 0 ? 'Margen positivo' : 'Revisar egresos'}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#1e2d3d] flex flex-wrap items-center justify-between text-xs text-[#7a95aa] gap-2">
            <span>Ticket promedio por paciente: <b className="text-[#dde6ef] font-mono">{money(k.ticket_promedio || 0)}</b></span>
            <span>Facturado con CFDI: <b className="text-[#dde6ef] font-mono">{k.facturadas_pct || 0}%</b></span>
          </div>
        </div>

        {/* Tarjeta Promedio Mensual */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-[#38bdf8]">
                ⚖️ Promedio Mensual
              </span>
              <span className="text-[11px] text-[#7a95aa]">
                {prom.meses_activos} {prom.meses_activos === 1 ? 'mes activo' : 'meses activos'}
              </span>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#7a95aa]">Ingreso promedio:</span>
                <span className="text-base font-bold font-mono text-[#38bdf8]">{money(prom.ingreso_mensual)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#7a95aa]">Gasto promedio:</span>
                <span className="text-base font-bold font-mono text-[#f59e0b]">{money(prom.gasto_mensual)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#1e2d3d]">
                <span className="text-xs font-semibold text-[#dde6ef]">Utilidad promedio:</span>
                <span
                  className="text-lg font-bold font-mono"
                  style={{ color: prom.balance_mensual >= 0 ? '#00e5a0' : '#f43f5e' }}
                >
                  {money(prom.balance_mensual)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 text-[11px] text-[#7a95aa] leading-relaxed bg-[#111820] rounded-xl p-2.5 border border-[#1e2d3d]">
            💡 Mantén tus gastos operativos por debajo del 40% del ingreso promedio para maximizar la reinversión y dividendos.
          </div>
        </div>
      </div>

      {/* 2. ¿DÓNDE ESTÁ EL DINERO? (Caja, Banco, Reembolsos al Dr., Aseguradoras) */}
      <Card
        title="📍 ¿Dónde está el dinero hoy?"
        subtitle="Rastreo transparente de la liquidez real de tu consultorio y compromisos pendientes."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Caja chica */}
          <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase text-[#7a95aa]">💵 Caja Consultorio</p>
                <span className="text-xs">Efectivo</span>
              </div>
              <p
                className="text-xl sm:text-2xl font-bold font-mono mt-1"
                style={{ color: ff.caja_consultorio_neto >= 0 ? '#00e5a0' : '#f43f5e' }}
              >
                {money(ff.caja_consultorio_neto)}
              </p>
            </div>
            <p className="text-[11px] text-[#7a95aa] mt-2">Disponible en físico para gastos menores y cambio.</p>
          </div>

          {/* Banco / Tarjeta clínica */}
          <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase text-[#7a95aa]">🏦 Banco de Clínica</p>
                <span className="text-xs">Cuenta fiscal</span>
              </div>
              <p
                className="text-xl sm:text-2xl font-bold font-mono mt-1"
                style={{ color: ff.banco_consultorio_neto >= 0 ? '#38bdf8' : '#f43f5e' }}
              >
                {money(ff.banco_consultorio_neto)}
              </p>
            </div>
            <p className="text-[11px] text-[#7a95aa] mt-2">Tarjetas, transferencias y liquidaciones recibidas.</p>
          </div>

          {/* Pagado por el doctor (pendiente de reembolso) */}
          <div className="bg-[#111820] border border-[#a78bfa]/40 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase text-[#a78bfa]">👨‍⚕️ Pagado por el Dr.</p>
                <span className="text-xs">Por reembolsar</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold font-mono text-[#c4b5fd] mt-1">
                {money(ff.pagado_por_doctor_total)}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#7a95aa]">Gastos cubiertos de su bolsa</span>
              {ff.pagado_por_doctor_total > 0 && (
                <button
                  onClick={onReimburse}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#a78bfa] text-black hover:opacity-90 transition shrink-0"
                >
                  Reembolsar
                </button>
              )}
            </div>
          </div>

          {/* Aseguradoras por cobrar */}
          <div className="bg-[#111820] border border-[#f59e0b]/40 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase text-[#f59e0b]">🛡️ Aseguradoras</p>
                <span className="text-xs text-[#f59e0b] font-mono">{aseguradorasPorCobrar.length} en trámite</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold font-mono text-[#f59e0b] mt-1">
                {money(aseguradorasPorCobrar.reduce((s: number, a: any) => s + (a.total || 0), 0))}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#7a95aa]">Honorarios por liquidar</span>
              {aseguradorasPorCobrar.length > 0 && (
                <button
                  onClick={onGoCobros}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#f59e0b] text-black hover:opacity-90 transition shrink-0"
                >
                  Ver trámite
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* 3. VIAJE DEL PACIENTE & VALIDACIÓN DIGITAL (COACHING PRÁCTICO) */}
      <Card
        title="🧭 Viaje del Paciente & El Secreto de la Autoridad Digital"
        subtitle="Entiende de verdad cómo llegan tus pacientes y por qué tu presencia en línea cierra a los recomendados."
        badge={
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-[#38bdf8]">
            Expectativas reales
          </span>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Métricas de Primera Vez vs Subsecuentes */}
          <div className="space-y-3 bg-[#111820] border border-[#1e2d3d] rounded-xl p-4">
            <p className="text-xs font-mono uppercase text-[#7a95aa]">Composición de Consultas</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold font-mono text-[#00e5a0]">{pj.primeras_visitas || 0}</p>
                <p className="text-xs text-[#7a95aa]">Primera vez ({pj.total_pacientes ? Math.round((pj.primeras_visitas / pj.total_pacientes) * 100) : 0}%)</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold font-mono text-[#38bdf8]">{pj.subsecuentes || 0}</p>
                <p className="text-xs text-[#7a95aa]">Seguimiento ({pj.total_pacientes ? Math.round((pj.subsecuentes / pj.total_pacientes) * 100) : 0}%)</p>
              </div>
            </div>
            <div className="w-full h-2.5 bg-[#0d1520] rounded-full overflow-hidden flex">
              <div
                style={{ width: `${pj.total_pacientes ? (pj.primeras_visitas / pj.total_pacientes) * 100 : 50}%`, background: '#00e5a0' }}
              />
              <div
                style={{ width: `${pj.total_pacientes ? (pj.subsecuentes / pj.total_pacientes) * 100 : 50}%`, background: '#38bdf8' }}
              />
            </div>
            <p className="text-[11px] text-[#7a95aa] leading-relaxed">
              En medicina de especialidad, los pacientes subsecuentes y tratamientos continuos representan entre el 60% y 80% de la utilidad sostenible de la clínica.
            </p>
          </div>

          {/* Tarjeta pedagógica de Validación Digital */}
          <div className="lg:col-span-2 bg-[#111820] border border-[#38bdf8]/30 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">💡</span>
                <h4 className="text-sm font-bold text-[#dde6ef]">
                  ¿Tus pacientes vienen recomendados? ¡Tu presencia digital los convenció!
                </h4>
              </div>
              <p className="text-xs sm:text-sm text-[#7a95aa] leading-relaxed">
                Un paciente recomendado no va a ciegas: <b>más del 80% busca tu nombre en Google Maps</b> para ver tus reseñas, visita tu página web para ver tu trayectoria y mira tu Instagram o TikTok para sentir confianza en tu autoridad antes de llamar o agendar.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-[#1e2d3d] text-center">
              <div className="p-2 rounded-lg bg-[#0d1520]">
                <p className="text-xs font-bold text-[#38bdf8]">Google Maps</p>
                <p className="text-[11px] text-[#7a95aa] mt-0.5">Reseñas & Ubicación</p>
              </div>
              <div className="p-2 rounded-lg bg-[#0d1520]">
                <p className="text-xs font-bold text-[#00e5a0]">Web Médica</p>
                <p className="text-[11px] text-[#7a95aa] mt-0.5">Credenciales & Cita</p>
              </div>
              <div className="p-2 rounded-lg bg-[#0d1520]">
                <p className="text-xs font-bold text-[#a78bfa]">Redes Sociales</p>
                <p className="text-[11px] text-[#7a95aa] mt-0.5">Autoridad & Casos</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 4. ASESOR ESTRATÉGICO CON IA */}
      <div className="bg-gradient-to-br from-[#0d1520] via-[#0d1520] to-[#0d1f19] border border-[#00e5a0]/35 rounded-2xl p-5 sm:p-6 space-y-4 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#00e5a0]/20 flex items-center justify-center text-[#00e5a0] font-bold text-xs">
                ✦
              </span>
              <h3 className="text-base font-bold text-[#dde6ef]">Asesor Clínico & Estratégico IA</h3>
            </div>
            <p className="text-xs text-[#7a95aa] mt-1">
              Tu copiloto analiza tus números, procedimientos de alto valor, flujo de dinero y captación para darte recomendaciones ejecutivas claras.
            </p>
          </div>

          <button
            onClick={() => runAiAnalysis()}
            disabled={aiLoading}
            className={btnPrimary}
            style={{ background: '#00e5a0', color: '#051b14' }}
          >
            {aiLoading ? '✦ Generando diagnóstico…' : '✦ Analizar con IA'}
          </button>
        </div>

        {/* Chips de preguntas rápidas */}
        <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
          {[
            '¿Qué procedimientos generan más margen?',
            '¿Cómo mejorar el cobro a aseguradoras?',
            '¿Cuánto debo gastar en publicidad vs recomendaciones?',
            '¿Cómo está mi flujo de caja este mes?',
          ].map((prompt, i) => (
            <button
              key={i}
              onClick={() => {
                setAiQuestion(prompt);
                runAiAnalysis(prompt);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#111820] border border-[#1e2d3d] text-[#7a95aa] hover:text-[#00e5a0] hover:border-[#00e5a0]/40 whitespace-nowrap transition"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className={inp}
            placeholder="Hazle una consulta personalizada sobre tu práctica médica…"
            value={aiQuestion}
            onChange={e => setAiQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runAiAnalysis(); }}
          />
        </div>

        {aiError && <p className="text-xs text-[#f43f5e]">{aiError}</p>}

        {aiReport && (
          <div className="bg-[#111820]/90 border border-[#00e5a0]/20 rounded-xl p-4 sm:p-5 text-sm text-[#dde6ef] whitespace-pre-wrap leading-relaxed shadow-inner">
            {aiReport}
          </div>
        )}
      </div>

      {/* 5. HISTORIAL COLAPSABLE */}
      <div className="text-center pt-2">
        <button
          onClick={() => setShowHistory(v => !v)}
          className={btnSecondary}
        >
          {showHistory ? '▲ Ocultar histórico detallado' : '📈 Ver histórico completo de 12 meses y comparativas'}
        </button>
      </div>

      {showHistory && (
        <div className="space-y-5 animate-in fade-in pt-2">
          {/* Comparativa anual */}
          {ov.comparativa_anual && (
            <Card
              title={`Comparativa Anual (${ov.comparativa_anual.anio_actual} vs ${ov.comparativa_anual.anio_anterior})`}
              subtitle="Acumulado anual consolidado"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Kpi
                  label={`Ingreso ${ov.comparativa_anual.anio_actual}`}
                  value={money(ov.comparativa_anual.ingreso_actual)}
                  color={C.green}
                  hint={
                    ov.comparativa_anual.variacion_pct !== null
                      ? `${ov.comparativa_anual.variacion_pct >= 0 ? '+' : ''}${ov.comparativa_anual.variacion_pct}% vs año previo`
                      : undefined
                  }
                />
                <Kpi label={`Gasto ${ov.comparativa_anual.anio_actual}`} value={money(ov.comparativa_anual.gasto_actual)} color={C.red} />
                <Kpi label={`Ingreso ${ov.comparativa_anual.anio_anterior}`} value={money(ov.comparativa_anual.ingreso_anterior)} color={C.blue} />
                <Kpi label={`Gasto ${ov.comparativa_anual.anio_anterior}`} value={money(ov.comparativa_anual.gasto_anterior)} color={C.amber} />
              </div>
            </Card>
          )}

          <Card title="Ingresos vs Gastos (Últimos 12 meses)" subtitle="Comportamiento estacional de tu práctica">
            <BarrasIngGasto data={ov.historico_12m || ov.serie_mensual || []} />
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card title="Ingresos por Tipo" subtitle="Cirugías, consultas y estudios">
              <BarrasH data={ov.ingresos_por_tipo || []} color={C.green} fmt={money} />
            </Card>
            <Card title="Ingresos por Sede / Hospital" subtitle="Dónde operaste y atendiste">
              <BarrasH data={ov.ingresos_por_lugar || []} color={C.blue} fmt={money} />
            </Card>
            <Card title="Ingresos por Aseguradora" subtitle="Participación de compañías">
              <BarrasH data={ov.ingresos_por_aseguradora || []} color={C.purple} fmt={money} />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Gastos por Categoría" subtitle="Distribución del presupuesto">
              <BarrasH data={ov.gasto_categorias || []} color={C.red} fmt={money} />
            </Card>
            <Card title="Facturación Fiscal (CFDI)" subtitle="Proporción sobre el total">
              <Dona data={ov.facturacion || []} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE 2: COBROS & MOSTRADOR (TPV MÉDICO CON PRECIOS FIJOS Y VARIABLES)
// ─────────────────────────────────────────────────────────────────────────────
function CobrosTab({
  pending,
  sales,
  services,
  catalogs,
  patients,
  reload,
  flash,
}: {
  pending: any[];
  sales: any[];
  services: any[];
  catalogs: { proveedores: any[]; clientes: any[]; conceptos_gasto: any[] };
  patients: any[];
  reload: () => void;
  flash: (t: string) => void;
}) {
  const [nuevo, setNuevo] = useState(false);
  const [categoriaSel, setCategoriaSel] = useState<string>('todas');
  const [filtroHistorial, setFiltroHistorial] = useState<string>('todos');

  // Formulario nuevo cobro
  const [pid, setPid] = useState('');
  const [tipoIngreso, setTipoIngreso] = useState<string>('consulta');
  const [lugar, setLugar] = useState('Consultorio');
  const [aseguradora, setAseguradora] = useState('');
  const [poliza, setPoliza] = useState('');
  const [fechaEvento, setFechaEvento] = useState(() => new Date().toISOString().slice(0, 10));

  // Servicios seleccionados { [service_id]: { cantidad: number, precio_custom?: number } }
  const [itemsMap, setItemsMap] = useState<Record<string, { cantidad: number; precio: number; variable: boolean; nombre: string }>>({});
  const [customConcepto, setCustomConcepto] = useState('');
  const [customMonto, setCustomMonto] = useState<number>(0);
  const [descuento, setDescuento] = useState(0);
  const [cortesia, setCortesia] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [modoRegistro, setModoRegistro] = useState<'cobrado' | 'pendiente' | 'en_tramite'>('cobrado');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [facturada, setFacturada] = useState(false);
  const [proximaCita, setProximaCita] = useState('');
  const [indicacionesMostrador, setIndicacionesMostrador] = useState('');
  const [cobrandoModal, setCobrandoModal] = useState<any>(null);

  // Toggle de servicio del catálogo
  const toggleService = (srv: any) => {
    setItemsMap(prev => {
      const copy = { ...prev };
      if (copy[srv.id]) {
        delete copy[srv.id];
      } else {
        const isVar = srv.precio_tipo === 'variable';
        copy[srv.id] = {
          cantidad: 1,
          precio: srv.precio || 0,
          variable: isVar,
          nombre: srv.nombre,
        };
      }
      return copy;
    });
  };

  const updateServicePrice = (srvId: string, precio: number) => {
    setItemsMap(prev => {
      if (!prev[srvId]) return prev;
      return {
        ...prev,
        [srvId]: { ...prev[srvId], precio },
      };
    });
  };

  // Items calculados
  const selectedItems = Object.entries(itemsMap).map(([id, it]) => ({
    service_id: id,
    concepto: it.nombre,
    precio: it.precio,
    cantidad: it.cantidad,
    precio_tipo: it.variable ? 'variable' : 'fijo',
  }));

  const manualItems = customConcepto.trim() && customMonto > 0
    ? [{ concepto: customConcepto.trim(), precio: customMonto, cantidad: 1, precio_tipo: 'variable' }]
    : [];

  const allItems = [...selectedItems, ...manualItems];
  const subtotal = allItems.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const total = cortesia ? 0 : Math.max(subtotal - descuento, 0);

  const guardarCobro = async () => {
    if (!allItems.length && !cortesia) {
      return flash('Selecciona una prestación o ingresa un concepto y monto');
    }
    const finalItems = allItems.length
      ? allItems
      : [{ concepto: customConcepto || 'Consulta', precio: 0, cantidad: 1 }];

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
          metodo_pago: modoRegistro === 'cobrado' ? metodoPago : (modoRegistro === 'en_tramite' ? 'aseguradora' : null),
          facturada: modoRegistro === 'cobrado' ? facturada : false,
          tipo_ingreso: tipoIngreso,
          lugar: lugar.trim() || 'Consultorio',
          aseguradora: aseguradora.trim() || null,
          poliza: poliza.trim() || null,
          procedimiento: finalItems.map(i => i.concepto).join(', '),
          proxima_cita: proximaCita || null,
          indicaciones_mostrador: indicacionesMostrador.trim() || null,
          fecha_evento: fechaEvento || null,
        }),
      });

      // Reset
      setNuevo(false);
      setItemsMap({});
      setCustomConcepto('');
      setCustomMonto(0);
      setPid('');
      setDescuento(0);
      setCortesia(false);
      setMotivo('');
      setProximaCita('');
      setIndicacionesMostrador('');
      flash(
        modoRegistro === 'cobrado'
          ? 'Ingreso cobrado registrado en contabilidad'
          : modoRegistro === 'en_tramite'
          ? 'Cirugía registrada en trámite con aseguradora'
          : 'Cobro enviado a mostrador de recepción'
      );
      reload();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const liquidarAseguradora = async (saleId: string) => {
    try {
      await api(`/clinic/sales/${saleId}/liquidate-insurance`, { method: 'POST' });
      flash('Pago de aseguradora liquidado a cuenta bancaria');
      reload();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const aseguradorasEnTramite = (sales || []).filter(s => s.estado === 'en_tramite');
  const ventasCobradas = (sales || []).filter(
    s => s.estado === 'cobrado' && (filtroHistorial === 'todos' || (s.tipo_ingreso || 'consulta') === filtroHistorial)
  );

  const serviciosFiltrados = services.filter(s => {
    if (!s.activo) return false;
    if (categoriaSel === 'todas') return true;
    return (s.categoria || 'consulta') === categoriaSel;
  });

  return (
    <div className="space-y-6">
      {/* Botón de acción superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#dde6ef]">Terminal de Cobros & Facturación Interna</h2>
          <p className="text-xs text-[#7a95aa]">
            {pending.length} cobro(s) pendiente(s) en recepción · {aseguradorasEnTramite.length} en trámite con aseguradoras
          </p>
        </div>
        <button
          onClick={() => setNuevo(v => !v)}
          className={btnPrimary}
          style={{ background: '#00e5a0', color: '#051b14' }}
        >
          {nuevo ? '✕ Cancelar registro' : '+ Registrar cobro, cirugía o aseguradora'}
        </button>
      </div>

      {/* COLA 1: COBROS PENDIENTES EN MOSTRADOR (Enviados por el médico) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono uppercase tracking-wider text-[#f59e0b] flex items-center gap-1.5">
            <span>🔔</span> Cobros listos para cobrar en recepción ({pending.length})
          </p>
        </div>

        {pending.length === 0 ? (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 text-center text-xs text-[#7a95aa]">
            No hay pacientes pendientes de cobro en mostrador en este momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pending.map(v => (
              <div
                key={v.id}
                className="bg-[#0d1520] border border-[#f59e0b]/40 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3 hover:border-[#f59e0b] transition"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-[#dde6ef]">{v.patient_name || 'Paciente en mostrador'}</span>
                    <span className="text-lg font-bold font-mono text-[#00e5a0]">{money(v.total)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#7a95aa]">
                    <span className="px-2 py-0.5 rounded-full bg-[#111820] border border-[#1e2d3d] text-[#dde6ef]">
                      {TIPO_INGRESO_LABELS[v.tipo_ingreso || 'consulta']?.label || v.tipo_ingreso}
                    </span>
                    {v.lugar && <span>📍 {v.lugar}</span>}
                  </div>

                  <p className="text-xs text-[#dde6ef] font-medium">
                    {(v.items || []).map((i: any) => `${i.concepto}${i.cantidad > 1 ? ` x${i.cantidad}` : ''} (${money(i.precio)})`).join(' · ')}
                  </p>

                  {v.proxima_cita && (
                    <p className="text-xs text-[#00e5a0] bg-[#00e5a0]/10 border border-[#00e5a0]/25 rounded-lg px-2.5 py-1.5">
                      📅 Próxima cita indicada: <b>{v.proxima_cita}</b>
                    </p>
                  )}

                  {v.indicaciones_mostrador && (
                    <p className="text-xs text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/25 rounded-lg px-2.5 py-1.5">
                      💬 Indicación médica: <b>{v.indicaciones_mostrador}</b>
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-[#1e2d3d] flex items-center justify-end">
                  <button
                    onClick={() => setCobrandoModal(v)}
                    className={btnPrimary}
                    style={{ background: '#00e5a0', color: '#051b14' }}
                  >
                    Cobrar ahora →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* COLA 2: CIRUGÍAS Y PROCEDIMIENTOS EN TRÁMITE CON ASEGURADORAS */}
      {aseguradorasEnTramite.length > 0 && (
        <Card
          title={`🛡️ Aseguradoras en Trámite (${aseguradorasEnTramite.length})`}
          subtitle="Cirugías y procedimientos realizados pendientes de liquidar a tu cuenta bancaria."
        >
          <div className="space-y-2.5">
            {aseguradorasEnTramite.map(s => (
              <div
                key={s.id}
                className="bg-[#111820] border border-[#f59e0b]/30 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#dde6ef]">{s.aseguradora || 'Aseguradora'}</span>
                    {s.poliza && <span className="text-xs text-[#7a95aa] font-mono">Póliza: {s.poliza}</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30">
                      En trámite
                    </span>
                  </div>
                  <p className="text-xs text-[#7a95aa]">
                    Paciente: <b className="text-[#dde6ef]">{s.patient_name || 'Particular'}</b> · {s.procedimiento || 'Cirugía'} · 📍 {s.lugar || 'Hospital'}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-lg font-bold font-mono text-[#f59e0b]">{money(s.total)}</span>
                  <button
                    onClick={() => liquidarAseguradora(s.id)}
                    className={btnPrimary}
                    style={{ background: '#38bdf8', color: '#051b14' }}
                  >
                    ✓ Liquidar a banco
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* FORMULARIO EXPANDIBLE: REGISTRO TPV RÁPIDO CON PRECIOS FIJOS Y VARIABLES */}
      {nuevo && (
        <div className="bg-[#0d1520] border border-[#00e5a0]/40 rounded-2xl p-5 sm:p-6 space-y-5 shadow-lg animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1e2d3d]">
            <div>
              <p className="text-xs font-mono text-[#00e5a0] uppercase tracking-wider">Terminal de Registro Médico</p>
              <h3 className="text-base font-bold text-[#dde6ef] mt-0.5">Captura de Cobro, Cirugía o Procedimiento</h3>
            </div>

            {/* Selector de Destino del Registro */}
            <div className="inline-flex rounded-xl bg-[#111820] border border-[#1e2d3d] p-1 gap-1">
              <button
                type="button"
                onClick={() => setModoRegistro('cobrado')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                style={{
                  background: modoRegistro === 'cobrado' ? '#00e5a0' : 'transparent',
                  color: modoRegistro === 'cobrado' ? '#051b14' : '#7a95aa',
                }}
              >
                ✓ Cobrado ahora
              </button>
              <button
                type="button"
                onClick={() => setModoRegistro('en_tramite')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                style={{
                  background: modoRegistro === 'en_tramite' ? '#f59e0b' : 'transparent',
                  color: modoRegistro === 'en_tramite' ? '#000' : '#7a95aa',
                }}
              >
                🛡️ Aseguradora (En trámite)
              </button>
              <button
                type="button"
                onClick={() => setModoRegistro('pendiente')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                style={{
                  background: modoRegistro === 'pendiente' ? '#38bdf8' : 'transparent',
                  color: modoRegistro === 'pendiente' ? '#051b14' : '#7a95aa',
                }}
              >
                ⏳ Enviar a mostrador
              </button>
            </div>
          </div>

          {/* Paso 1: Datos Generales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">PACIENTE</label>
              <select className={inp} value={pid} onChange={e => setPid(e.target.value)}>
                <option value="">— Sin paciente / General —</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">TIPO DE ATENCIÓN</label>
              <select className={inp} value={tipoIngreso} onChange={e => setTipoIngreso(e.target.value)}>
                {Object.entries(TIPO_INGRESO_LABELS).map(([k, it]) => (
                  <option key={k} value={k}>{it.icon} {it.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">LUGAR / HOSPITAL</label>
              <input
                list="lugares-list"
                className={inp}
                placeholder="Ej. Consultorio, Hospital Ángeles…"
                value={lugar}
                onChange={e => setLugar(e.target.value)}
              />
              <datalist id="lugares-list">
                <option value="Consultorio" />
                <option value="Quirófano / Clínica ambulatoria" />
                {catalogs.clientes.map((c: any) => (
                  <option key={c.id} value={c.nombre} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">FECHA</label>
              <input
                type="date"
                className={inp}
                value={fechaEvento}
                onChange={e => setFechaEvento(e.target.value)}
              />
            </div>
          </div>

          {/* Si es aseguradora o cirugía: campos de seguro */}
          {(modoRegistro === 'en_tramite' || tipoIngreso === 'aseguradora' || tipoIngreso === 'cirugia') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#111820] border border-[#f59e0b]/30 rounded-xl p-3.5">
              <div>
                <label className="text-[10px] font-mono text-[#f59e0b] uppercase block mb-1">
                  COMPAÑÍA ASEGURADORA / CONVENIO
                </label>
                <input
                  list="aseguradoras-list"
                  className={inp}
                  placeholder="Ej. GNP Seguros, AXA, Seguros Monterrey, MetLife…"
                  value={aseguradora}
                  onChange={e => setAseguradora(e.target.value)}
                />
                <datalist id="aseguradoras-list">
                  <option value="GNP Seguros" />
                  <option value="AXA Seguros" />
                  <option value="Seguros Monterrey New York Life" />
                  <option value="MetLife" />
                  <option value="Mapfre" />
                  <option value="Inbursa" />
                </datalist>
              </div>
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
                  N° DE PÓLIZA / SINIESTRO / CARTA AUTORIZACIÓN
                </label>
                <input
                  className={inp}
                  placeholder="Ej. Siniestro #984321 / Autorización…"
                  value={poliza}
                  onChange={e => setPoliza(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Paso 2: Selección Rápida de Prestaciones (Fijas y Variables) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase">
                SELECCIÓN DE PRESTACIONES & CIRUGÍAS
              </label>

              {/* Filtro por categoría */}
              <div className="flex gap-1 overflow-x-auto text-xs">
                {['todas', 'consulta', 'estudio', 'cirugia', 'producto'].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoriaSel(cat)}
                    className="px-2.5 py-1 rounded-lg capitalize transition"
                    style={{
                      background: categoriaSel === cat ? '#1e2d3d' : '#111820',
                      color: categoriaSel === cat ? '#00e5a0' : '#7a95aa',
                      border: `1px solid ${categoriaSel === cat ? '#00e5a0' : '#1e2d3d'}`,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid de servicios táctiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {serviciosFiltrados.map(s => {
                const isSelected = !!itemsMap[s.id];
                const isVar = s.precio_tipo === 'variable';
                return (
                  <div
                    key={s.id}
                    className="bg-[#111820] border rounded-xl p-3 flex flex-col justify-between transition-all"
                    style={{
                      borderColor: isSelected ? '#00e5a0' : '#1e2d3d',
                      background: isSelected ? 'rgba(0, 229, 160, 0.05)' : '#111820',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#dde6ef] truncate">{s.nombre}</p>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0d1520] text-[#7a95aa] uppercase">
                          {isVar ? 'Precio variable' : 'Precio fijo'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleService(s)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold transition shrink-0"
                        style={{
                          background: isSelected ? '#00e5a0' : '#1e2d3d',
                          color: isSelected ? '#051b14' : '#dde6ef',
                        }}
                      >
                        {isSelected ? '✓ Seleccionado' : '+ Agregar'}
                      </button>
                    </div>

                    {/* Si está seleccionado: muestra precio o permite ingresar precio si es variable */}
                    {isSelected && (
                      <div className="mt-3 pt-2 border-t border-[#1e2d3d] flex items-center justify-between gap-2">
                        <span className="text-xs text-[#7a95aa]">
                          {isVar ? 'Precio pactado ($):' : 'Importe:'}
                        </span>
                        {isVar ? (
                          <input
                            type="number"
                            inputMode="decimal"
                            className="w-28 bg-[#0d1520] border border-[#00e5a0] rounded-lg px-2 py-1 text-sm text-[#00e5a0] font-mono font-bold text-right outline-none"
                            placeholder="0"
                            value={itemsMap[s.id]?.precio || ''}
                            onChange={e => updateServicePrice(s.id, +e.target.value || 0)}
                          />
                        ) : (
                          <span className="text-sm font-bold font-mono text-[#00e5a0]">
                            {money(s.precio)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* O ingresar concepto y monto libre / honorarios directos */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3 pt-2">
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
                O ESCRIBE UN CONCEPTO PERSONALIZADO (HONORARIOS, CIRUGÍA, ETC.)
              </label>
              <input
                className={inp}
                placeholder="Ej. Honorarios quirúrgicos, Colocación de catéter, Estudio especial…"
                value={customConcepto}
                onChange={e => setCustomConcepto(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
                MONTO ($ MXN)
              </label>
              <input
                type="number"
                inputMode="decimal"
                className={inp}
                placeholder="0"
                value={customMonto || ''}
                onChange={e => setCustomMonto(+e.target.value || 0)}
              />
            </div>
          </div>

          {/* Paso 3: Método de pago o Indicaciones de mostrador */}
          {modoRegistro === 'cobrado' && (
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#111820] border border-[#1e2d3d] rounded-xl p-4">
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">MÉTODO DE PAGO</label>
                <div className="flex flex-wrap gap-1.5">
                  {['efectivo', 'tarjeta', 'transferencia'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodoPago(m)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold capitalize transition"
                      style={{
                        background: metodoPago === m ? '#00e5a0' : '#0d1520',
                        color: metodoPago === m ? '#051b14' : '#dde6ef',
                        border: `1px solid ${metodoPago === m ? '#00e5a0' : '#1e2d3d'}`,
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-[#dde6ef] cursor-pointer mt-2 sm:mt-0">
                <input
                  type="checkbox"
                  checked={facturada}
                  onChange={e => setFacturada(e.target.checked)}
                  className="rounded accent-[#00e5a0] w-4 h-4"
                />
                Requiere factura (CFDI)
              </label>
            </div>
          )}

          {modoRegistro === 'pendiente' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#111820] border border-[#1e2d3d] rounded-xl p-4">
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
                  PRÓXIMA CITA SUGERIDA (para recepción)
                </label>
                <input
                  type="date"
                  className={inp}
                  value={proximaCita}
                  onChange={e => setProximaCita(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
                  INDICACIONES PARA MOSTRADOR
                </label>
                <input
                  className={inp}
                  placeholder="Ej. Agendar revisión en 15 días con biometría…"
                  value={indicacionesMostrador}
                  onChange={e => setIndicacionesMostrador(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Descuentos o cortesías */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs font-medium text-[#dde6ef] cursor-pointer">
              <input
                type="checkbox"
                checked={cortesia}
                onChange={e => setCortesia(e.target.checked)}
                className="rounded accent-[#00e5a0] w-4 h-4"
              />
              Cortesía médica ($0)
            </label>

            {!cortesia && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#7a95aa]">Descuento $</span>
                <input
                  type="number"
                  inputMode="decimal"
                  className={`${inp} w-28 py-1.5`}
                  placeholder="0"
                  value={descuento || ''}
                  onChange={e => setDescuento(+e.target.value || 0)}
                />
              </div>
            )}

            {(cortesia || descuento > 0) && (
              <input
                className={`${inp} flex-1 min-w-[180px] py-1.5`}
                placeholder="Motivo del descuento o cortesía…"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
              />
            )}
          </div>

          {/* Resumen Total y Botón de Envío */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-[#1e2d3d]">
            <div className="flex items-baseline gap-3">
              <span className="text-xs text-[#7a95aa]">Subtotal: {money(subtotal)}</span>
              <span className="text-xl font-bold font-mono text-[#00e5a0]">Total: {money(total)}</span>
            </div>

            <button
              onClick={guardarCobro}
              className={btnPrimary}
              style={{ background: '#00e5a0', color: '#051b14' }}
            >
              {modoRegistro === 'cobrado'
                ? '✓ Registrar ingreso cobrado'
                : modoRegistro === 'en_tramite'
                ? '🛡️ Registrar cirugía en trámite'
                : '⏳ Enviar cobro a recepción'}
            </button>
          </div>
        </div>
      )}

      {/* HISTORIAL DE INGRESOS COBRADOS */}
      <Card
        title={`📋 Historial de Ingresos Cobrados (${ventasCobradas.length})`}
        subtitle="Movimientos liquidados y registrados en la caja o banco de la clínica."
        right={
          <div className="flex gap-1 overflow-x-auto text-xs">
            {[
              ['todos', 'Todos'],
              ['consulta', 'Consultas'],
              ['cirugia', 'Cirugías'],
              ['estudio', 'Estudios'],
              ['aseguradora', 'Aseguradoras'],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFiltroHistorial(k)}
                className="px-2.5 py-1 rounded-lg transition"
                style={{
                  background: filtroHistorial === k ? '#1e2d3d' : '#111820',
                  color: filtroHistorial === k ? '#00e5a0' : '#7a95aa',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {ventasCobradas.length === 0 ? (
          <p className="text-xs text-[#486581] py-4 text-center">No hay ingresos registrados con este filtro.</p>
        ) : (
          <div className="space-y-2">
            {ventasCobradas.slice(0, 35).map(s => (
              <div
                key={s.id}
                className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-[#2a3e52] transition"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#0d1520] border border-[#1e2d3d] text-[#00e5a0]">
                      {TIPO_INGRESO_LABELS[s.tipo_ingreso || 'consulta']?.label || s.tipo_ingreso}
                    </span>
                    <span className="text-sm font-semibold text-[#dde6ef]">{s.patient_name || 'Paciente general'}</span>
                    {s.lugar && <span className="text-xs text-[#7a95aa]">📍 {s.lugar}</span>}
                    {s.aseguradora && <span className="text-xs text-[#a78bfa]">🛡️ {s.aseguradora}</span>}
                  </div>
                  <p className="text-xs text-[#7a95aa]">
                    {s.procedimiento || (s.items || []).map((i: any) => i.concepto).join(' · ')}
                    {' · '}
                    <span className="capitalize">{s.metodo_pago || 'efectivo'}</span>
                    {s.facturada ? ' · Con CFDI' : ''}
                    {' · '}
                    {(s.fecha_evento || s.cobrado_en || s.created_at || '').slice(0, 10)}
                  </p>
                </div>
                <span className="font-mono font-bold text-sm sm:text-base text-[#00e5a0] shrink-0">
                  {money(s.total)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* MODAL PARA COBRAR EN MOSTRADOR */}
      {cobrandoModal && (
        <ModalCobroMostrador
          venta={cobrandoModal}
          onClose={() => setCobrandoModal(null)}
          done={() => {
            setCobrandoModal(null);
            flash('Cobro registrado exitosamente en recepción');
            reload();
          }}
        />
      )}
    </div>
  );
}

function ModalCobroMostrador({
  venta,
  onClose,
  done,
}: {
  venta: any;
  onClose: () => void;
  done: () => void;
}) {
  const [metodo, setMetodo] = useState('efectivo');
  const [factura, setFactura] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirmarCobro = async () => {
    setBusy(true);
    try {
      await api(`/clinic/sales/${venta.id}/charge`, {
        method: 'POST',
        body: JSON.stringify({ metodo_pago: metodo, facturada: factura }),
      });
      done();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <span className="text-[10px] font-mono uppercase text-[#00e5a0]">Atención en Recepción</span>
          <h3 className="text-xl font-bold font-mono text-[#00e5a0] mt-0.5">{money(venta.total)}</h3>
          <p className="text-sm font-semibold text-[#dde6ef] mt-1">{venta.patient_name || 'Paciente en mostrador'}</p>
        </div>

        {venta.proxima_cita && (
          <p className="text-xs text-[#00e5a0] bg-[#00e5a0]/10 border border-[#00e5a0]/25 rounded-lg p-2">
            📅 Próxima cita indicada por el médico: <b>{venta.proxima_cita}</b>
          </p>
        )}

        {venta.indicaciones_mostrador && (
          <p className="text-xs text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/25 rounded-lg p-2">
            💬 {venta.indicaciones_mostrador}
          </p>
        )}

        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">MÉTODO DE PAGO</label>
          <div className="grid grid-cols-2 gap-2">
            {['efectivo', 'tarjeta', 'transferencia', 'aseguradora'].map(m => (
              <button
                key={m}
                onClick={() => setMetodo(m)}
                className="py-2.5 rounded-xl text-xs font-semibold capitalize transition"
                style={{
                  background: metodo === m ? '#00e5a0' : '#111820',
                  color: metodo === m ? '#051b14' : '#dde6ef',
                  border: `1px solid ${metodo === m ? '#00e5a0' : '#1e2d3d'}`,
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-[#dde6ef] cursor-pointer">
          <input
            type="checkbox"
            checked={factura}
            onChange={e => setFactura(e.target.checked)}
            className="rounded accent-[#00e5a0]"
          />
          Requiere factura fiscal (CFDI)
        </label>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className={`${btnSecondary} flex-1`}>
            Cancelar
          </button>
          <button
            onClick={confirmarCobro}
            disabled={busy}
            className={`${btnPrimary} flex-1`}
            style={{ background: '#00e5a0', color: '#051b14' }}
          >
            {busy ? 'Guardando…' : 'Confirmar cobro'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE 3: GASTOS (REGISTRO EN 10 SEGUNDOS Y ORIGEN DEL DINERO)
// ─────────────────────────────────────────────────────────────────────────────
function GastosTab({
  expenses,
  catalogs,
  reload,
  flash,
  onReimburse,
}: {
  expenses: any[];
  catalogs: { proveedores: any[]; clientes: any[]; conceptos_gasto: any[] };
  reload: () => void;
  flash: (t: string) => void;
  onReimburse: () => void;
}) {
  const [cat, setCat] = useState('insumos');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState<number>(0);
  const [proveedor, setProveedor] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [origenFondo, setOrigenFondo] = useState<string>('caja_consultorio');
  const [guardarConcepto, setGuardarConcepto] = useState(false);
  const [guardarProveedor, setGuardarProveedor] = useState(false);

  const CATS = ['insumos', 'renta', 'sueldos', 'equipo_medico', 'servicios', 'impuestos_contador', 'seguros', 'publicidad', 'otros'];

  const guardarGasto = async () => {
    if (!concepto.trim()) return flash('Escribe el concepto del gasto');
    if (!monto || monto <= 0) return flash('Indica un monto válido');
    try {
      await api('/clinic/expenses', {
        method: 'POST',
        body: JSON.stringify({
          categoria: cat,
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
    } catch (e: any) {
      flash(e.message);
    }
  };

  const gastosDelDoctor = expenses.filter(e => {
    const orig = ORIGEN_FONDO_LABELS[e.origen_fondo || ''] || {};
    return orig.isDoctor;
  });

  return (
    <div className="space-y-6">
      {/* Formulario rápido en 10 segundos */}
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 sm:p-6 space-y-5">
        <div>
          <p className="text-xs font-mono text-[#f43f5e] uppercase tracking-wider">Control de Egresos</p>
          <h3 className="text-base font-bold text-[#dde6ef] mt-0.5">Captura Rápida de Gastos</h3>
        </div>

        {/* Chips de conceptos guardados */}
        {catalogs.conceptos_gasto.length > 0 && (
          <div>
            <p className="text-[10px] font-mono text-[#7a95aa] uppercase mb-1.5">CONCEPTOS FRECUENTES (clic para rellenar)</p>
            <div className="flex flex-wrap gap-1.5">
              {catalogs.conceptos_gasto.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setConcepto(c.nombre);
                    if (c.categoria) setCat(c.categoria);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] hover:border-[#00e5a0] transition active:scale-95"
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Campos principales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">CONCEPTO DEL GASTO *</label>
            <input
              className={inp}
              placeholder="Ej. Compra de gasas y jeringas, Renta consultorio, Luz CFE…"
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-[#00e5a0] mt-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={guardarConcepto}
                onChange={e => setGuardarConcepto(e.target.checked)}
                className="rounded accent-[#00e5a0]"
              />
              ¿Guardar este concepto para usarlo en un clic a futuro?
            </label>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">MONTO ($ MXN) *</label>
            <input
              type="number"
              inputMode="decimal"
              className={inp}
              placeholder="0"
              value={monto || ''}
              onChange={e => setMonto(+e.target.value || 0)}
            />
          </div>

          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">FECHA</label>
            <input
              type="date"
              className={inp}
              value={fecha}
              onChange={e => setFecha(e.target.value)}
            />
          </div>
        </div>

        {/* ¿De dónde salió el dinero? */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">
            ¿DE DÓNDE SALIÓ EL DINERO PARA ESTE PAGO? *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(ORIGEN_FONDO_LABELS).map(([k, info]) => {
              const active = origenFondo === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOrigenFondo(k)}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-semibold border text-left transition flex items-center justify-between"
                  style={{
                    background: active
                      ? (info.isDoctor ? 'rgba(167, 139, 250, 0.15)' : 'rgba(0, 229, 160, 0.12)')
                      : '#111820',
                    borderColor: active
                      ? (info.isDoctor ? '#a78bfa' : '#00e5a0')
                      : '#1e2d3d',
                    color: active
                      ? (info.isDoctor ? '#c4b5fd' : '#00e5a0')
                      : '#dde6ef',
                  }}
                >
                  <span className="truncate">{info.label}</span>
                  <span className="text-sm shrink-0 ml-1">{info.icon}</span>
                </button>
              );
            })}
          </div>
          {ORIGEN_FONDO_LABELS[origenFondo]?.isDoctor && (
            <p className="text-[11px] text-[#a78bfa] mt-1.5">
              ℹ️ Este gasto se acumulará como saldo a favor del médico para que la clínica se lo reembolse después.
            </p>
          )}
        </div>

        {/* Proveedor y categoría */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">CATEGORÍA</label>
            <select className={inp} value={cat} onChange={e => setCat(e.target.value)}>
              {CATS.map(c => (
                <option key={c} value={c}>{c.replace('_', ' ').toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">PROVEEDOR (opcional)</label>
            <input
              list="proveedores-list"
              className={inp}
              placeholder="Ej. Farmacia Especializada, CFE, Telmex…"
              value={proveedor}
              onChange={e => setProveedor(e.target.value)}
            />
            <datalist id="proveedores-list">
              {catalogs.proveedores.map((p: any) => (
                <option key={p.id} value={p.nombre} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={guardarGasto}
            className={btnPrimary}
            style={{ background: '#f43f5e', color: '#fff' }}
          >
            ✓ Registrar egreso
          </button>
        </div>
      </div>

      {/* Historial de gastos */}
      <Card
        title={`Gastos Registrados (${expenses.length})`}
        subtitle="Egresos organizados por fecha y origen del fondo."
      >
        <div className="space-y-2">
          {expenses.slice(0, 40).map(e => {
            const orig = ORIGEN_FONDO_LABELS[e.origen_fondo || 'caja_consultorio'] || ORIGEN_FONDO_LABELS.caja_consultorio;
            return (
              <div
                key={e.id}
                className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[#dde6ef] truncate">{e.concepto || e.categoria}</p>
                    <span
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                      style={{
                        background: orig.isDoctor ? 'rgba(167, 139, 250, 0.12)' : 'rgba(56, 189, 248, 0.1)',
                        borderColor: orig.isDoctor ? '#a78bfa' : '#38bdf8',
                        color: orig.isDoctor ? '#c4b5fd' : '#38bdf8',
                      }}
                    >
                      {orig.short}
                    </span>
                  </div>
                  <p className="text-xs text-[#7a95aa]">
                    {e.fecha} · <span className="capitalize">{(e.categoria || '').replace('_', ' ')}</span>
                    {e.proveedor ? ` · ${e.proveedor}` : ''}
                  </p>
                </div>
                <span className="font-mono font-bold text-sm text-[#f43f5e] shrink-0">
                  {money(e.monto)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE 4: CATÁLOGO DE PRESTACIONES (PRECIOS FIJOS Y VARIABLES)
// ─────────────────────────────────────────────────────────────────────────────
function PrestacionesTab({
  services,
  reload,
  flash,
}: {
  services: any[];
  reload: () => void;
  flash: (t: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [filtro, setFiltro] = useState<string>('todas');

  // Formulario nueva prestación
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState<number>(0);
  const [precioTipo, setPrecioTipo] = useState<'fijo' | 'variable'>('fijo');
  const [categoria, setCategoria] = useState<string>('consulta');
  const [descripcion, setDescripcion] = useState('');

  const guardarPrestacion = async () => {
    if (!nombre.trim()) return flash('Indica el nombre de la prestación');
    if (precioTipo === 'fijo' && (!precio || precio <= 0)) {
      return flash('Para precio fijo, ingresa un importe mayor a cero');
    }

    try {
      await api('/clinic/services', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nombre.trim(),
          precio: precioTipo === 'fijo' ? precio : 0,
          precio_tipo: precioTipo,
          categoria,
          descripcion: descripcion.trim() || null,
          orden: services.length + 1,
        }),
      });

      setShowModal(false);
      setNombre('');
      setPrecio(0);
      setPrecioTipo('fijo');
      setDescripcion('');
      flash('Prestación agregada al catálogo');
      reload();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const toggleActivo = async (s: any) => {
    try {
      await api(`/clinic/services/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: s.nombre,
          precio: s.precio,
          precio_tipo: s.precio_tipo || 'fijo',
          categoria: s.categoria || 'consulta',
          descripcion: s.descripcion,
          activo: !s.activo,
          orden: s.orden,
        }),
      });
      reload();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const eliminarPrestacion = async (id: string) => {
    if (!confirm('¿Eliminar esta prestación del catálogo?')) return;
    try {
      await api(`/clinic/services/${id}`, { method: 'DELETE' });
      flash('Prestación eliminada');
      reload();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const filtrados = services.filter(s => {
    if (filtro === 'todas') return true;
    return (s.categoria || 'consulta') === filtro;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#dde6ef]">Catálogo de Prestaciones & Honorarios Médicos</h2>
          <p className="text-xs text-[#7a95aa]">
            Define prestaciones con precio fijo (consultas, holter) o precio variable (marcapasos, stents, cirugías según hospital).
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className={btnPrimary}
          style={{ background: '#00e5a0', color: '#051b14' }}
        >
          + Nueva prestación médica
        </button>
      </div>

      {/* Filtros de Categoría */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        {[
          ['todas', 'Todas las prestaciones'],
          ['consulta', 'Consultas médicas'],
          ['estudio', 'Estudios diagnósticos'],
          ['cirugia', 'Cirugías & Procedimientos'],
          ['producto', 'Suplementos / Productos'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className="px-3 py-1.5 rounded-xl font-medium transition"
            style={{
              background: filtro === k ? '#00e5a0' : '#0d1520',
              color: filtro === k ? '#051b14' : '#7a95aa',
              border: `1px solid ${filtro === k ? '#00e5a0' : '#1e2d3d'}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista de Prestaciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtrados.map(s => {
          const isVar = s.precio_tipo === 'variable';
          return (
            <div
              key={s.id}
              className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-[#2a3e52] transition"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#dde6ef]">{s.nombre}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#111820] text-[#7a95aa] border border-[#1e2d3d]">
                        {s.categoria || 'consulta'}
                      </span>
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                        style={{
                          background: isVar ? 'rgba(245, 158, 11, 0.1)' : 'rgba(0, 229, 160, 0.1)',
                          borderColor: isVar ? '#f59e0b' : '#00e5a0',
                          color: isVar ? '#f59e0b' : '#00e5a0',
                        }}
                      >
                        {isVar ? 'Precio variable' : 'Precio fijo'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => eliminarPrestacion(s.id)}
                    className="text-[#7a95aa] hover:text-[#f43f5e] text-lg p-1"
                    title="Eliminar"
                  >
                    ×
                  </button>
                </div>

                {s.descripcion && (
                  <p className="text-xs text-[#7a95aa] mt-2 leading-relaxed">{s.descripcion}</p>
                )}
              </div>

              <div className="pt-3 mt-3 border-t border-[#1e2d3d] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono text-[#7a95aa] uppercase">
                    {isVar ? 'Cobro en mostrador' : 'Precio de lista'}
                  </p>
                  <p className="text-base font-bold font-mono text-[#dde6ef] mt-0.5">
                    {isVar ? 'Se pacta al operar' : money(s.precio)}
                  </p>
                </div>

                <button
                  onClick={() => toggleActivo(s)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono transition"
                  style={{
                    background: s.activo ? 'rgba(0, 229, 160, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                    color: s.activo ? '#00e5a0' : '#f43f5e',
                  }}
                >
                  {s.activo ? 'Activo' : 'Pausado'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL NUEVA PRESTACIÓN */}
      {showModal && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-[10px] font-mono uppercase text-[#00e5a0]">Catálogo de Práctica Médica</p>
              <h3 className="text-lg font-bold text-[#dde6ef] mt-0.5">Nueva Prestación / Servicio</h3>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">NOMBRE DE LA PRESTACIÓN *</label>
              <input
                className={inp}
                placeholder="Ej. Consulta cardiológica, Holter 24h, Colocación de Marcapasos…"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">CATEGORÍA</label>
                <select className={inp} value={categoria} onChange={e => setCategoria(e.target.value)}>
                  <option value="consulta">Consulta médica</option>
                  <option value="estudio">Estudio diagnóstico</option>
                  <option value="cirugia">Cirugía / Quirófano</option>
                  <option value="producto">Producto / Suplemento</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">TIPO DE PRECIO *</label>
                <select
                  className={inp}
                  value={precioTipo}
                  onChange={e => setPrecioTipo(e.target.value as any)}
                >
                  <option value="fijo">Precio Fijo ($)</option>
                  <option value="variable">Precio Variable (Al cobrar)</option>
                </select>
              </div>
            </div>

            {precioTipo === 'fijo' ? (
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">PRECIO DE LISTA ($ MXN) *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className={inp}
                  placeholder="0"
                  value={precio || ''}
                  onChange={e => setPrecio(+e.target.value || 0)}
                />
              </div>
            ) : (
              <div className="bg-[#111820] border border-[#f59e0b]/30 rounded-xl p-3 text-xs text-[#7a95aa] leading-relaxed">
                💡 <b>Precio Variable:</b> Ideal para cirugías, colocación de stents o procedimientos donde el costo final depende del hospital, aseguradora o complejidad del paciente. Se definirá al momento de registrar el cobro.
              </div>
            )}

            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">DESCRIPCIÓN / INDICACIONES (opcional)</label>
              <textarea
                className={`${inp} h-20 resize-none`}
                placeholder="Breve detalle de lo que incluye la prestación…"
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className={`${btnSecondary} flex-1`}>
                Cancelar
              </button>
              <button
                onClick={guardarPrestacion}
                className={`${btnPrimary} flex-1`}
                style={{ background: '#00e5a0', color: '#051b14' }}
              >
                Guardar prestación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE 5: MI EQUIPO (PREVIEW MODERNO Y VÍNCULO A /STAFF)
// ─────────────────────────────────────────────────────────────────────────────
function EquipoTab({ staff, reload }: { staff: any[]; reload: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#dde6ef]">Equipo de la Clínica</h2>
          <p className="text-xs text-[#7a95aa]">
            Médicos asociados, recepcionistas y personal de enfermería. Vista simplificada con avatares centrados.
          </p>
        </div>

        <Link
          href="/dashboard/staff"
          className={btnPrimary}
          style={{ background: '#00e5a0', color: '#051b14' }}
        >
          Gestionar equipo completo en Mi Equipo →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {staff.map(m => (
          <div
            key={m.id}
            className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 text-center flex flex-col items-center justify-between hover:border-[#2a3e52] transition"
          >
            {/* Foto circular centrada */}
            <div className="w-18 h-18 rounded-full overflow-hidden bg-[#111820] border-2 border-[#1e2d3d] flex items-center justify-center text-2xl mb-3 shadow-inner">
              {m.photo_url ? (
                <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" />
              ) : (
                <span>{m.role === 'doctor' ? '👨‍⚕️' : m.role === 'nurse' ? '🩺' : '💼'}</span>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#dde6ef] truncate max-w-[180px]">{m.name}</h3>
              <p className="text-xs text-[#7a95aa] capitalize">{m.role}</p>
              {m.phone && <p className="text-[11px] text-[#486581] font-mono">{m.phone}</p>}
            </div>

            <div className="pt-3 mt-3 border-t border-[#1e2d3d] w-full text-center">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#111820] text-[#00e5a0]">
                {m.active ? '● Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE 6: CATÁLOGOS (PROVEEDORES, ASEGURADORAS, CONCEPTOS)
// ─────────────────────────────────────────────────────────────────────────────
function CatalogosTab({
  catalogs,
  reload,
  flash,
}: {
  catalogs: { proveedores: any[]; clientes: any[]; conceptos_gasto: any[] };
  reload: () => void;
  flash: (t: string) => void;
}) {
  // Clientes / Aseguradoras
  const [cliNombre, setCliNombre] = useState('');
  const [cliTipo, setCliTipo] = useState('Aseguradora');
  const [cliRfc, setCliRfc] = useState('');

  // Proveedores
  const [provNombre, setProvNombre] = useState('');
  const [provCat, setProvCat] = useState('');
  const [provTel, setProvTel] = useState('');

  // Conceptos
  const [conNombre, setConNombre] = useState('');
  const [conCat, setConCat] = useState('insumos');

  const addCatalogItem = async (kind: string, payload: any, reset: () => void) => {
    if (!payload.nombre?.trim()) return flash('Escribe el nombre');
    try {
      await api('/clinic/catalogs/item', { method: 'POST', body: JSON.stringify({ kind, ...payload }) });
      reset();
      flash('Guardado en catálogo');
      reload();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const delCatalogItem = async (kind: string, id: string) => {
    try {
      await api(`/clinic/catalogs/item/${kind}/${id}`, { method: 'DELETE' });
      reload();
    } catch (e: any) {
      flash(e.message);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 1. Clientes y Aseguradoras */}
      <Card title="🛡️ Aseguradoras & Hospitales" subtitle="Para cirugías y trámites de cobro">
        <div className="space-y-3">
          <input className={inp} placeholder="Nombre (GNP, Hospital Ángeles…)" value={cliNombre} onChange={e => setCliNombre(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className={inp} value={cliTipo} onChange={e => setCliTipo(e.target.value)}>
              <option value="Aseguradora">Aseguradora</option>
              <option value="Hospital">Hospital</option>
              <option value="Convenio">Convenio</option>
            </select>
            <input className={inp} placeholder="RFC (opcional)" value={cliRfc} onChange={e => setCliRfc(e.target.value)} />
          </div>
          <button
            onClick={() => addCatalogItem('clientes', { nombre: cliNombre, categoria: cliTipo, rfc: cliRfc }, () => { setCliNombre(''); setCliRfc(''); })}
            className={`${btnPrimary} w-full`}
            style={{ background: '#00e5a0', color: '#051b14' }}
          >
            + Guardar entidad
          </button>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pt-2">
            {catalogs.clientes.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-[#dde6ef]">{c.nombre}</p>
                  <p className="text-[10px] text-[#7a95aa]">{c.categoria || 'Entidad'}</p>
                </div>
                <button onClick={() => delCatalogItem('clientes', c.id)} className="text-[#f43f5e] text-base px-1">×</button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 2. Proveedores */}
      <Card title="📦 Proveedores" subtitle="Insumos, renta y servicios de la clínica">
        <div className="space-y-3">
          <input className={inp} placeholder="Nombre del proveedor" value={provNombre} onChange={e => setProvNombre(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inp} placeholder="Giro (Farmacia, CFE…)" value={provCat} onChange={e => setProvCat(e.target.value)} />
            <input className={inp} placeholder="Teléfono" value={provTel} onChange={e => setProvTel(e.target.value)} />
          </div>
          <button
            onClick={() => addCatalogItem('proveedores', { nombre: provNombre, categoria: provCat, telefono: provTel }, () => { setProvNombre(''); setProvCat(''); setProvTel(''); })}
            className={`${btnPrimary} w-full`}
            style={{ background: '#00e5a0', color: '#051b14' }}
          >
            + Guardar proveedor
          </button>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pt-2">
            {catalogs.proveedores.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-[#dde6ef]">{p.nombre}</p>
                  <p className="text-[10px] text-[#7a95aa]">{p.categoria || 'Giro'}</p>
                </div>
                <button onClick={() => delCatalogItem('proveedores', p.id)} className="text-[#f43f5e] text-base px-1">×</button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 3. Conceptos Frecuentes de Gasto */}
      <Card title="🏷️ Conceptos Rápidos" subtitle="Para captura de gastos en 10 segundos">
        <div className="space-y-3">
          <input className={inp} placeholder="Ej. Renta consultorio, Gasas…" value={conNombre} onChange={e => setConNombre(e.target.value)} />
          <select className={inp} value={conCat} onChange={e => setConCat(e.target.value)}>
            {['insumos', 'renta', 'sueldos', 'equipo_medico', 'servicios', 'impuestos_contador', 'seguros', 'publicidad', 'otros'].map(c => (
              <option key={c} value={c}>{c.replace('_', ' ').toUpperCase()}</option>
            ))}
          </select>
          <button
            onClick={() => addCatalogItem('conceptos_gasto', { nombre: conNombre, categoria: conCat }, () => setConNombre(''))}
            className={`${btnPrimary} w-full`}
            style={{ background: '#00e5a0', color: '#051b14' }}
          >
            + Guardar concepto
          </button>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pt-2">
            {catalogs.conceptos_gasto.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-[#dde6ef]">{c.nombre}</p>
                  <p className="text-[10px] text-[#7a95aa] capitalize">{(c.categoria || '').replace('_', ' ')}</p>
                </div>
                <button onClick={() => delCatalogItem('conceptos_gasto', c.id)} className="text-[#f43f5e] text-base px-1">×</button>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: REEMBOLSO AL DOCTOR
// ─────────────────────────────────────────────────────────────────────────────
function ModalReembolso({
  saldoPendiente,
  onClose,
  done,
}: {
  saldoPendiente: number;
  onClose: () => void;
  done: () => void;
}) {
  const [monto, setMonto] = useState<number>(saldoPendiente || 0);
  const [origen, setOrigen] = useState<'caja_consultorio' | 'transferencia_consultorio'>('caja_consultorio');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);

  const liquidar = async () => {
    if (!monto || monto <= 0) return;
    setBusy(true);
    try {
      await api('/clinic/reimburse-doctor', {
        method: 'POST',
        body: JSON.stringify({
          monto,
          origen_reembolso: origen,
          notas: notas.trim() || null,
        }),
      });
      done();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d1520] border border-[#a78bfa]/40 rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <span className="text-[10px] font-mono uppercase text-[#a78bfa]">Liquidación Interna</span>
          <h3 className="text-lg font-bold text-[#dde6ef] mt-0.5">Reembolsar Gastos al Dr.</h3>
          <p className="text-xs text-[#7a95aa] mt-1">
            Saldo acumulado pagado por el médico de su bolsillo:{' '}
            <b className="text-[#c4b5fd] font-mono">{money(saldoPendiente)}</b>
          </p>
        </div>

        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">MONTO A REEMBOLSAR ($ MXN)</label>
          <input
            type="number"
            inputMode="decimal"
            className={inp}
            value={monto || ''}
            onChange={e => setMonto(+e.target.value || 0)}
          />
        </div>

        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
            ¿DESDE DÓNDE SE HACE EL REEMBOLSO?
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOrigen('caja_consultorio')}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold transition"
              style={{
                background: origen === 'caja_consultorio' ? '#a78bfa' : '#111820',
                color: origen === 'caja_consultorio' ? '#051b14' : '#dde6ef',
                border: `1px solid ${origen === 'caja_consultorio' ? '#a78bfa' : '#1e2d3d'}`,
              }}
            >
              💵 Caja chica (Efectivo)
            </button>
            <button
              type="button"
              onClick={() => setOrigen('transferencia_consultorio')}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold transition"
              style={{
                background: origen === 'transferencia_consultorio' ? '#a78bfa' : '#111820',
                color: origen === 'transferencia_consultorio' ? '#051b14' : '#dde6ef',
                border: `1px solid ${origen === 'transferencia_consultorio' ? '#a78bfa' : '#1e2d3d'}`,
              }}
            >
              🏦 Transf. de Clínica
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">NOTAS / REFERENCIA</label>
          <input
            className={inp}
            placeholder="Ej. Reembolso insumos y farmacia…"
            value={notas}
            onChange={e => setNotas(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className={`${btnSecondary} flex-1`}>
            Cancelar
          </button>
          <button
            onClick={liquidar}
            disabled={busy}
            className={`${btnPrimary} flex-1`}
            style={{ background: '#a78bfa', color: '#051b14' }}
          >
            {busy ? 'Liquidando…' : '✓ Confirmar reembolso'}
          </button>
        </div>
      </div>
    </div>
  );
}
