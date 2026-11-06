'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { getSession } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';
import { useEntitlements } from '@/app/lib/useEntitlements';
import StaffManagement from '../staff/StaffManagement';

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

const SEDES_PREDEFINIDAS = [
  'Consultorio Propio',
  'Hospital Amerimed Cancún',
  'Hospital Amerimed Playa del Carmen',
  'Hospital Joya Cancún',
  'Hospital Galenia',
];

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

type TabKey = 'insights' | 'ingresos' | 'gastos' | 'equipo' | 'servicios';

export default function ClinicPage() {
  const { features } = useEntitlements();
  const [role, setRole] = useState<string>('doctor');
  const esRecepcion = role === 'receptionist';

  // Pestaña activa
  const [tab, setTab] = useState<TabKey>('insights');

  // Estados de datos
  const [ov, setOv] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [catalogs, setCatalogs] = useState<{ proveedores: any[]; clientes: any[]; conceptos_gasto: any[] }>({
    proveedores: [],
    clientes: [],
    conceptos_gasto: [],
  });
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Modales
  const [showModalIngreso, setShowModalIngreso] = useState(false);
  const [showModalGasto, setShowModalGasto] = useState(false);
  const [showReimburseModal, setShowReimburseModal] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [o, s, sl, ex, cat] = await Promise.all([
        api('/clinic/overview').catch(() => null),
        api('/clinic/services').catch(() => ({ services: [] })),
        api('/clinic/sales').catch(() => ({ sales: [] })),
        api('/clinic/expenses').catch(() => ({ expenses: [] })),
        api('/clinic/catalogs').catch(() => ({ proveedores: [], clientes: [], conceptos_gasto: [] })),
      ]);
      setOv(o);
      setServices(s.services || []);
      setSales(sl.sales || []);
      setExpenses(ex.expenses || []);
      setCatalogs({
        proveedores: cat.proveedores || [],
        clientes: cat.clientes || [],
        conceptos_gasto: cat.conceptos_gasto || [],
      });
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const r = getRole();
    setRole(r as any);
    if (r === 'receptionist') setTab('ingresos');
    loadAll();

    authHeaders().then(headers => {
      fetch(`${B()}/patients/?limit=250`, { headers })
        .then(res => res.json())
        .then(d => setPatients(d.patients || []))
        .catch(() => {});
    });
  }, [loadAll]);

  // Manejar query params de entrada para pestañas y modales directos (ej. ?tab=ingresos&action=nuevo)
  useEffect(() => {
    const checkParams = () => {
      if (typeof window !== 'undefined') {
        const p = new URLSearchParams(window.location.search);
        const t = p.get('tab') as TabKey | null;
        const act = p.get('action');
        if (t && ['insights', 'ingresos', 'gastos', 'equipo', 'servicios'].includes(t)) {
          setTab(t);
        }
        if (act === 'nuevo') {
          if (t === 'ingresos' || (!t && esRecepcion)) setShowModalIngreso(true);
          else if (t === 'gastos') setShowModalGasto(true);
        }
      }
    };
    checkParams();
    window.addEventListener('popstate', checkParams);
    return () => window.removeEventListener('popstate', checkParams);
  }, [esRecepcion]);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(''), 4000);
  };

  const TABS = useMemo(() => {
    const list: { id: TabKey; label: string; icon: string; badge?: number }[] = [];
    if (!esRecepcion) {
      list.push({ id: 'insights', label: 'Insights & IA Negocio', icon: '🧠' });
    }
    const cpcCount = ov?.cuentas_por_cobrar?.length || 0;
    list.push({ id: 'ingresos', label: 'Ingresos & Cobranza', icon: '💵', badge: cpcCount > 0 ? cpcCount : undefined });
    list.push({ id: 'gastos', label: 'Gastos & Fugas', icon: '🧾' });
    if (!esRecepcion) {
      list.push({ id: 'equipo', label: 'Equipo de Trabajo', icon: '👥' });
      list.push({ id: 'servicios', label: 'Servicios & Tarifas', icon: '🩺' });
    }
    return list;
  }, [esRecepcion, ov?.cuentas_por_cobrar?.length]);

  return (
    <div className="min-h-screen bg-[#070a0e] text-[#dde6ef]">
      <main className="page-content pt-16 px-4 sm:px-6 py-6 max-w-7xl mx-auto space-y-6">
        {/* Cabecera Principal */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1e2d3d]/60">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#dde6ef]">
                {esRecepcion ? 'Caja & Cobros de Consultorio' : 'Mi Consultorio'}
              </h1>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#00e5a0]/10 border border-[#00e5a0]/30 text-[#00e5a0]">
                {esRecepcion ? 'Recepción' : 'Operación Interna'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#7a95aa] mt-1 leading-relaxed">
              {esRecepcion
                ? 'Registro de cobros al paciente, consultas y emisión de recibos en mostrador.'
                : 'Gestión de negocio 100% interna: ingresos, gastos, sedes/hospitales, fugas y asesoría con IA.'}
            </p>
          </div>

          {/* Botones de Acción Rápida en Cabecera */}
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setShowModalIngreso(true)}
              className={`${btnPrimary} bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c]`}
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>Registrar Ingreso</span>
            </button>
            <button
              onClick={() => setShowModalGasto(true)}
              className={`${btnSecondary} hover:border-[#f43f5e] hover:text-[#f43f5e]`}
            >
              <span className="text-base font-bold leading-none text-[#f43f5e]">+</span>
              <span>Registrar Gasto</span>
            </button>
          </div>
        </div>

        {/* Pestañas Segmentadas (Apple HIG touch target >= 44px) */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-2 active:scale-95 cursor-pointer shadow-sm"
                style={{
                  background: active ? '#00e5a0' : '#0d1520',
                  color: active ? '#051b14' : '#7a95aa',
                  border: `1px solid ${active ? '#00e5a0' : '#1e2d3d'}`,
                }}
              >
                <span>{t.icon}</span>
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

        {/* Notificación Toast */}
        {msg && (
          <div className="p-3.5 rounded-xl bg-[#00e5a0]/10 border border-[#00e5a0]/30 text-[#00e5a0] text-sm flex items-center justify-between gap-3 animate-in fade-in">
            <span>{msg}</span>
            <button onClick={() => setMsg('')} className="text-[#00e5a0] hover:opacity-75 font-bold text-lg leading-none">×</button>
          </div>
        )}

        {/* ── 1. INSIGHTS TAB (100% NEGOCIO IA) ── */}
        {tab === 'insights' && !esRecepcion && (
          <InsightsTab
            ov={ov}
            reload={loadAll}
            onOpenIngreso={() => setShowModalIngreso(true)}
            onOpenGasto={() => setShowModalGasto(true)}
            onOpenReembolso={() => setShowReimburseModal(true)}
          />
        )}

        {/* ── 2. INGRESOS TAB (QUÉ SE VENDE MÁS, SEDES/HOSPITALES, CUENTAS POR COBRAR) ── */}
        {tab === 'ingresos' && (
          <IngresosTab
            ov={ov}
            sales={sales}
            reload={loadAll}
            flash={flash}
            onOpenNuevo={() => setShowModalIngreso(true)}
          />
        )}

        {/* ── 3. GASTOS TAB (DETALLE, GASTOS HORMIGA, FUGAS, REEMBOLSOS) ── */}
        {tab === 'gastos' && (
          <GastosTab
            ov={ov}
            expenses={expenses}
            catalogs={catalogs}
            reload={loadAll}
            flash={flash}
            onOpenNuevo={() => setShowModalGasto(true)}
            onOpenReembolso={() => setShowReimburseModal(true)}
          />
        )}

        {/* ── 4. EQUIPO TAB (COMPONENTE MUDADO A MI CONSULTORIO) ── */}
        {tab === 'equipo' && !esRecepcion && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d] flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#dde6ef]">Equipo de Trabajo y Asistentes</h3>
                <p className="text-xs text-[#7a95aa]">Personal administrativo, enfermería y recepción con permisos definidos por puesto.</p>
              </div>
              <span className="text-xs font-mono text-[#00e5a0]">Gestión Interna</span>
            </div>
            <StaffManagement />
          </div>
        )}

        {/* ── 5. SERVICIOS & TARIFAS TAB (PRECIO FIJO O VARIABLE) ── */}
        {tab === 'servicios' && !esRecepcion && (
          <ServiciosTab
            services={services}
            reload={loadAll}
            flash={flash}
          />
        )}
      </main>

      {/* ── MODAL: REGISTRAR INGRESO ── */}
      {showModalIngreso && (
        <ModalRegistrarIngreso
          patients={patients}
          services={services}
          catalogs={catalogs}
          onClose={() => setShowModalIngreso(false)}
          onSuccess={() => {
            setShowModalIngreso(false);
            flash('✓ Ingreso registrado exitosamente');
            loadAll();
          }}
        />
      )}

      {/* ── MODAL: REGISTRAR GASTO ── */}
      {showModalGasto && (
        <ModalRegistrarGasto
          catalogs={catalogs}
          onClose={() => setShowModalGasto(false)}
          onSuccess={() => {
            setShowModalGasto(false);
            flash('✓ Gasto registrado en contabilidad');
            loadAll();
          }}
        />
      )}

      {/* ── MODAL: REEMBOLSAR AL DOCTOR ── */}
      {showReimburseModal && ov?.flujo_fondos && (
        <ModalReembolso
          saldoPendiente={ov.flujo_fondos.pagado_por_doctor_total || ov.flujo_fondos.pagado_por_doctor?.total_aportado_doctor || 0}
          onClose={() => setShowReimburseModal(false)}
          done={() => {
            setShowReimburseModal(false);
            flash('✓ Reembolso al médico liquidado');
            loadAll();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PESTAÑA: INSIGHTS & IA DE NEGOCIO (100% ESTRATEGIA COMERCIAL Y FINANCIERA)
// ─────────────────────────────────────────────────────────────────────────────
function InsightsTab({
  ov,
  reload,
  onOpenIngreso,
  onOpenGasto,
  onOpenReembolso,
}: {
  ov: any;
  reload: () => void;
  onOpenIngreso: () => void;
  onOpenGasto: () => void;
  onOpenReembolso: () => void;
}) {
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiReport, setAiReport] = useState<string>(ov?.ai_analysis || '');
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState('');

  const rv = ov?.resumen_ventas || {};
  const ff = ov?.flujo_fondos || {};
  const sedes = ov?.analisis_sedes || [];
  const fugas = ov?.gastos_analisis?.fugas_detectadas || [];
  const hormiga = ov?.gastos_analisis?.gastos_hormiga || {};

  const consultarIa = async (customQ?: string) => {
    setLoadingAi(true);
    setAiError('');
    try {
      const q = customQ !== undefined ? customQ : aiPrompt.trim();
      const res = await api('/clinic/ai-analysis', {
        method: 'POST',
        body: JSON.stringify({ question: q || null }),
      });
      setAiReport(res.analysis || '');
    } catch (e: any) {
      setAiError(e.message || 'Error al conectar con el Asesor IA de Negocio');
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip Superior */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 sm:p-5">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total Vendido</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-[#00e5a0] mt-1">
            {money(rv.total_vendido || 0)}
          </p>
          <div className="flex items-center gap-2 mt-2 text-xs text-[#7a95aa]">
            {rv.variacion_mes_pct !== null && rv.variacion_mes_pct !== undefined ? (
              <span className={`font-mono font-semibold ${rv.variacion_mes_pct >= 0 ? 'text-[#00e5a0]' : 'text-[#f43f5e]'}`}>
                {rv.variacion_mes_pct >= 0 ? '+' : ''}{rv.variacion_mes_pct}% vs mes ant.
              </span>
            ) : (
              <span>Comparativo mensual activo</span>
            )}
          </div>
        </div>

        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 sm:p-5">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total Cobrado (Caja & Banco)</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-[#38bdf8] mt-1">
            {money(rv.total_cobrado || 0)}
          </p>
          <p className="text-xs text-[#7a95aa] mt-2">
            Ingreso líquido recaudado
          </p>
        </div>

        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 sm:p-5">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total por Cobrar</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-[#f59e0b] mt-1">
            {money(rv.total_por_cobrar || 0)}
          </p>
          <p className="text-xs text-[#7a95aa] mt-2">
            {ov?.cuentas_por_cobrar?.length || 0} cuentas pendientes
          </p>
        </div>

        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 sm:p-5">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Gastos Totales Registrados</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-[#f43f5e] mt-1">
            {money(ov?.gastos_analisis?.total_gastado || ov?.kpis?.gasto_mes || 0)}
          </p>
          <p className="text-xs text-[#7a95aa] mt-2">
            Utilidad Neta: <b className="text-[#dde6ef] font-mono">{money((rv.total_cobrado || 0) - (ov?.gastos_analisis?.total_gastado || 0))}</b>
          </p>
        </div>
      </div>

      {/* Tarjeta de Asesor IA de Negocio (100% Enfoque Comercial / Financiero) */}
      <div className="bg-[#0d1520] border border-[#00e5a0]/30 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🧠</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-[#dde6ef]">
                  Asesor de Estrategia y Negocio Médico (IA)
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#00e5a0]/20 text-[#00e5a0] border border-[#00e5a0]/40">
                  100% Negocio y Finanzas
                </span>
              </div>
              <p className="text-xs text-[#7a95aa] mt-0.5">
                Evaluación estratégica de rentabilidad de sedes, traslados, márgenes y detección de fugas de dinero. (Sin consejos médicos).
              </p>
            </div>
          </div>
          <button
            onClick={() => consultarIa()}
            disabled={loadingAi}
            className={`${btnPrimary} bg-[#00e5a0]/20 text-[#00e5a0] border border-[#00e5a0]/40 hover:bg-[#00e5a0]/30`}
          >
            {loadingAi ? 'Analizando negocio…' : '↻ Actualizar Opinión'}
          </button>
        </div>

        {/* Reporte IA */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#070a0e] border border-[#1e2d3d] text-sm text-[#dde6ef] whitespace-pre-line leading-relaxed font-sans">
          {aiReport ? (
            aiReport
          ) : (
            <p className="text-[#7a95aa] italic">
              Haz clic en "Actualizar Opinión" o escribe una pregunta para que el Asesor IA evalúe la salud financiera de tu consultorio.
            </p>
          )}
        </div>

        {/* Input para preguntas de negocio al Asesor IA */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <input
            className={inp}
            placeholder="Pregunta sobre tu negocio: ¿Conviene abrir en Playa del Carmen? ¿Dónde tengo fugas de dinero?..."
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') consultarIa(); }}
          />
          <button
            onClick={() => consultarIa()}
            disabled={loadingAi || !aiPrompt.trim()}
            className={`${btnPrimary} bg-[#00e5a0] text-[#051b14] shrink-0`}
          >
            {loadingAi ? 'Pensando…' : 'Preguntar'}
          </button>
        </div>

        {/* Chips de Preguntas Frecuentes Rápidas */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#7a95aa] pt-1">
          <span className="text-[10px] font-mono uppercase text-[#486581]">Preguntas sugeridas:</span>
          {[
            '¿Qué sede u hospital me deja mayor utilidad neta?',
            '¿Vale la pena trasladarme a otra ciudad por pocas consultas?',
            '¿Dónde están mis mayores gastos hormiga y fugas?',
            '¿Qué procedimientos quirúrgicos debería promover más?',
          ].map((sug, idx) => (
            <button
              key={idx}
              onClick={() => {
                setAiPrompt(sug);
                consultarIa(sug);
              }}
              className="px-2.5 py-1 rounded-lg bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] hover:border-[#00e5a0] transition text-[11px]"
            >
              {sug}
            </button>
          ))}
        </div>
      </div>

      {/* Grid: Sedes y Fugas Detectadas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Análisis Rápido de Sedes / Hospitales */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-[#dde6ef]">Rentabilidad por Sede & Hospital</h4>
              <p className="text-xs text-[#7a95aa]">¿Dónde conviene operar o consultar más?</p>
            </div>
            <span className="text-xs font-mono text-[#00e5a0]">{sedes.length} sedes</span>
          </div>

          <div className="space-y-3">
            {sedes.slice(0, 4).map((s: any, i: number) => (
              <div key={i} className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#dde6ef] truncate">{s.lugar}</p>
                  <p className="text-[11px] text-[#7a95aa] mt-0.5">
                    {s.cantidad} atenciones · Ticket prom. <b className="text-[#dde6ef]">{money(s.ticket_promedio)}</b>
                  </p>
                  <p className="text-[10px] text-[#38bdf8] mt-1 font-mono">{s.evaluacion}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-mono text-[#00e5a0]">{money(s.total_ingreso)}</p>
                  <span className="text-[10px] font-mono text-[#7a95aa]">{s.pct_ingreso}% del ingreso</span>
                </div>
              </div>
            ))}
            {sedes.length === 0 && (
              <p className="text-xs text-[#7a95aa] py-3 text-center">Registra cobros con sede asignada para ver la comparativa.</p>
            )}
          </div>
        </div>

        {/* Detección de Fugas y Gastos Hormiga */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-[#dde6ef]">Alertas de Fugas & Gastos Hormiga</h4>
              <p className="text-xs text-[#7a95aa]">Consumos menores o duplicados detectados</p>
            </div>
            {hormiga.total > 0 && (
              <span className="text-xs font-mono font-bold text-[#f43f5e] bg-[#f43f5e]/10 px-2 py-0.5 rounded-full border border-[#f43f5e]/30">
                {money(hormiga.total)} acumulados
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {fugas.map((f: string, i: number) => (
              <div key={i} className="p-3 rounded-xl bg-[#111820] border border-[#f43f5e]/30 text-xs text-[#dde6ef] flex items-start gap-2.5">
                <span className="text-base leading-none text-[#f43f5e]">⚠️</span>
                <p className="leading-relaxed">{f}</p>
              </div>
            ))}
            {fugas.length === 0 && (
              <div className="p-4 rounded-xl bg-[#111820] border border-[#00e5a0]/30 text-xs text-[#00e5a0] flex items-center gap-2">
                <span>✓</span>
                <p>No se han detectado gastos hormiga anormales ni fugas de capital este mes.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PESTAÑA: INGRESOS & COBRANZA (VENTAS, TOP CONCEPTOS, SEDES, COBRANZA)
// ─────────────────────────────────────────────────────────────────────────────
function IngresosTab({
  ov,
  sales,
  reload,
  flash,
  onOpenNuevo,
}: {
  ov: any;
  sales: any[];
  reload: () => void;
  flash: (t: string) => void;
  onOpenNuevo: () => void;
}) {
  const [topModo, setTopModo] = useState<'cantidad' | 'ingreso'>('ingreso');
  const [filtroCobro, setFiltroCobro] = useState<'todos' | 'pendiente' | 'cobrado'>('todos');
  const [busqueda, setBusqueda] = useState('');

  const rv = ov?.resumen_ventas || {};
  const sedes = ov?.analisis_sedes || [];
  const cuentasPorCobrar = ov?.cuentas_por_cobrar || [];
  const topCantidad = ov?.top_vendidos?.por_cantidad || [];
  const topIngreso = ov?.top_vendidos?.por_ingreso || [];

  const marcarComoPagado = async (item: any) => {
    try {
      if (item.tipo_deudor === 'aseguradora' || item.estado === 'en_tramite') {
        await api(`/clinic/sales/${item.id}/liquidate-insurance`, { method: 'POST' });
      } else {
        await api(`/clinic/sales/${item.id}/charge`, {
          method: 'POST',
          body: JSON.stringify({
            metodo_pago: 'efectivo',
            facturada: false,
          }),
        });
      }
      flash(`✓ Cobro liquidado: ${item.procedimiento} (${money(item.total)})`);
      reload();
    } catch (e: any) {
      flash(e.message || 'Error al liquidar el cobro');
    }
  };

  const salesFiltradas = sales.filter(s => {
    if (filtroCobro !== 'todos' && s.estado !== filtroCobro) return false;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      const matchPac = (s.patient_name || '').toLowerCase().includes(q);
      const matchProc = (s.procedimiento || '').toLowerCase().includes(q);
      const matchAseg = (s.aseguradora || '').toLowerCase().includes(q);
      const matchLugar = (s.lugar || '').toLowerCase().includes(q);
      if (!matchPac && !matchProc && !matchAseg && !matchLugar) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Botón Superior y Resumen de Cobros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d1520] border border-[#1e2d3d]">
        <div>
          <h2 className="text-lg font-bold text-[#dde6ef]">Control de Ingresos y Cobranza</h2>
          <p className="text-xs text-[#7a95aa] mt-0.5">
            Registra servicios prestados en consultorio u hospitales y gestiona cuentas por cobrar.
          </p>
        </div>
        <button
          onClick={onOpenNuevo}
          className={`${btnPrimary} bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c] shadow`}
        >
          <span className="text-base font-bold">+</span>
          <span>Registrar Ingreso</span>
        </button>
      </div>

      {/* KPI Cards: Resumen de Ventas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total Vendido</p>
          <p className="text-xl sm:text-2xl font-bold font-mono text-[#00e5a0] mt-1">{money(rv.total_vendido || 0)}</p>
          <p className="text-[11px] text-[#7a95aa] mt-1 font-mono">
            {rv.variacion_mes_pct !== null && rv.variacion_mes_pct !== undefined ? `${rv.variacion_mes_pct >= 0 ? '+' : ''}${rv.variacion_mes_pct}% vs mes ant.` : 'Mes corriente'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total Cobrado (Líquido)</p>
          <p className="text-xl sm:text-2xl font-bold font-mono text-[#38bdf8] mt-1">{money(rv.total_cobrado || 0)}</p>
          <p className="text-[11px] text-[#7a95aa] mt-1">Efectivo, tarjetas y transf.</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total por Cobrar</p>
          <p className="text-xl sm:text-2xl font-bold font-mono text-[#f59e0b] mt-1">{money(rv.total_por_cobrar || 0)}</p>
          <p className="text-[11px] text-[#f59e0b] mt-1 font-semibold">{cuentasPorCobrar.length} pendientes</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Comparativa Anual</p>
          <p className="text-xl sm:text-2xl font-bold font-mono text-[#dde6ef] mt-1">{money(rv.ingreso_anio_actual || 0)}</p>
          <p className="text-[11px] text-[#7a95aa] mt-1 font-mono">
            {rv.variacion_anio_pct !== null && rv.variacion_anio_pct !== undefined ? `${rv.variacion_anio_pct >= 0 ? '+' : ''}${rv.variacion_anio_pct}% vs año ant.` : 'Histórico en curso'}
          </p>
        </div>
      </div>

      {/* Grid: Qué se vende más & Análisis de Sedes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Qué se vende más */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#dde6ef]">¿Qué es lo que se vende más?</h3>
              <p className="text-xs text-[#7a95aa]">Servicios con mayor volumen vs mayor facturación</p>
            </div>
            <div className="flex gap-1 bg-[#111820] p-1 rounded-lg border border-[#1e2d3d]">
              <button
                onClick={() => setTopModo('ingreso')}
                className="px-2.5 py-1 rounded text-xs font-semibold transition"
                style={{
                  background: topModo === 'ingreso' ? '#00e5a0' : 'transparent',
                  color: topModo === 'ingreso' ? '#051b14' : '#7a95aa',
                }}
              >
                Por Ingreso ($)
              </button>
              <button
                onClick={() => setTopModo('cantidad')}
                className="px-2.5 py-1 rounded text-xs font-semibold transition"
                style={{
                  background: topModo === 'cantidad' ? '#00e5a0' : 'transparent',
                  color: topModo === 'cantidad' ? '#051b14' : '#7a95aa',
                }}
              >
                Por Cantidad (#)
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {(topModo === 'ingreso' ? topIngreso : topCantidad).slice(0, 6).map((item: any, i: number) => {
              const maxVal = topModo === 'ingreso'
                ? Math.max(...topIngreso.map((x: any) => x.total), 1)
                : Math.max(...topCantidad.map((x: any) => x.cantidad), 1);
              const val = topModo === 'ingreso' ? item.total : item.cantidad;
              const pctBar = Math.round((val / maxVal) * 100);

              return (
                <div key={i} className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#dde6ef] truncate max-w-[220px]">{item.concepto}</span>
                    <span className="font-mono text-[#00e5a0] font-bold">
                      {money(item.total)} · <b className="text-[#7a95aa]">{item.cantidad} serv.</b>
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#070a0e] rounded-full overflow-hidden">
                    <div className="h-full bg-[#00e5a0] rounded-full transition-all" style={{ width: `${pctBar}%` }} />
                  </div>
                </div>
              );
            })}
            {topIngreso.length === 0 && (
              <p className="text-xs text-[#7a95aa] py-4 text-center">Sin servicios registrados aún.</p>
            )}
          </div>
        </div>

        {/* Análisis por Sedes y Hospitales */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#dde6ef]">Análisis de Ingresos por Sede / Hospital</h3>
            <p className="text-xs text-[#7a95aa]">
              Evalúa si vale la pena tener múltiples consultorios o trasladarse por consultas a otras ciudades.
            </p>
          </div>

          <div className="space-y-2.5">
            {sedes.map((s: any, i: number) => (
              <div key={i} className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#dde6ef]">{s.lugar}</p>
                    <p className="text-[11px] text-[#7a95aa]">
                      {s.cantidad} pacientes · Ticket prom: <b className="text-[#dde6ef]">{money(s.ticket_promedio)}</b>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-bold text-[#00e5a0]">{money(s.total_ingreso)}</p>
                    {s.total_por_cobrar > 0 && (
                      <p className="text-[10px] font-mono text-[#f59e0b]">Por cobrar: {money(s.total_por_cobrar)}</p>
                    )}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-[#070a0e] text-[11px] font-mono text-[#38bdf8] flex items-center justify-between">
                  <span>💡 {s.evaluacion}</span>
                  <span className="text-[#7a95aa]">{s.pct_ingreso}% total</span>
                </div>
              </div>
            ))}
            {sedes.length === 0 && (
              <p className="text-xs text-[#7a95aa] py-4 text-center">Registra cobros asignando el hospital o consultorio.</p>
            )}
          </div>
        </div>
      </div>

      {/* Cuentas por Cobrar & Filtros */}
      {cuentasPorCobrar.length > 0 && (
        <div className="bg-[#0d1520] border border-[#f59e0b]/40 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">⏳</span>
                <h3 className="text-base font-bold text-[#dde6ef]">Cuentas por Cobrar & Cobranza Activa</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/40">
                  {cuentasPorCobrar.length} pendientes
                </span>
              </div>
              <p className="text-xs text-[#7a95aa] mt-0.5">
                Aseguradoras, hospitales o pacientes particulares con saldo por liquidar y días transcurridos.
              </p>
            </div>
            <p className="text-sm font-mono font-bold text-[#f59e0b]">
              Total pendiente: {money(rv.total_por_cobrar || 0)}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#1e2d3d] text-[#7a95aa] font-mono uppercase text-[10px]">
                  <th className="py-2.5 px-3">Deudor / Paciente</th>
                  <th className="py-2.5 px-3">Concepto / Procedimiento</th>
                  <th className="py-2.5 px-3">Sede / Hospital</th>
                  <th className="py-2.5 px-3">Antigüedad</th>
                  <th className="py-2.5 px-3 text-right">Monto</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2d3d]/50">
                {cuentasPorCobrar.map((c: any) => (
                  <tr key={c.id} className="hover:bg-[#111820]/60 transition">
                    <td className="py-3 px-3">
                      <p className="font-semibold text-[#dde6ef]">{c.deudor}</p>
                      {c.paciente && c.paciente !== c.deudor && (
                        <p className="text-[10px] text-[#7a95aa]">Paciente: {c.paciente}</p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[#dde6ef]">{c.procedimiento}</td>
                    <td className="py-3 px-3 text-[#7a95aa]">{c.lugar}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${c.dias_antiguedad > 30 ? 'bg-[#f43f5e]/20 text-[#f43f5e]' : 'bg-[#f59e0b]/20 text-[#f59e0b]'}`}>
                        {c.dias_antiguedad} días
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[#dde6ef]">
                      {money(c.total)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => marcarComoPagado(c)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c] transition active:scale-95 shadow-sm"
                      >
                        ✓ Marcar como pagado
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historial de Cobros Recientes */}
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#dde6ef]">Historial de Cobros Realizados</h3>
            <p className="text-xs text-[#7a95aa]">Registro cronológico de servicios y facturación</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-1.5 text-xs text-[#dde6ef] outline-none focus:border-[#00e5a0]"
              placeholder="Buscar por paciente o concepto…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            <select
              className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-1.5 text-xs text-[#dde6ef] outline-none"
              value={filtroCobro}
              onChange={e => setFiltroCobro(e.target.value as any)}
            >
              <option value="todos">Todos los estados</option>
              <option value="cobrado">Solo Cobrados</option>
              <option value="pendiente">Solo Pendientes</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#1e2d3d] text-[#7a95aa] font-mono uppercase text-[10px]">
                <th className="py-2.5 px-3">Fecha</th>
                <th className="py-2.5 px-3">Paciente / Cliente</th>
                <th className="py-2.5 px-3">Concepto</th>
                <th className="py-2.5 px-3">Sede</th>
                <th className="py-2.5 px-3">Método & Factura</th>
                <th className="py-2.5 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d3d]/50">
              {salesFiltradas.slice(0, 15).map((s: any) => (
                <tr key={s.id} className="hover:bg-[#111820]/60 transition">
                  <td className="py-3 px-3 text-[#7a95aa] font-mono whitespace-nowrap">
                    {s.fecha_evento || (s.created_at || '').slice(0, 10)}
                  </td>
                  <td className="py-3 px-3">
                    <p className="font-semibold text-[#dde6ef]">{s.patient_name || s.aseguradora || 'Particular'}</p>
                    {s.poliza && <p className="text-[10px] text-[#7a95aa]">Póliza: {s.poliza}</p>}
                  </td>
                  <td className="py-3 px-3 text-[#dde6ef]">{s.procedimiento || (s.items || [])[0]?.concepto || 'Consulta'}</td>
                  <td className="py-3 px-3 text-[#7a95aa]">{s.lugar || 'Consultorio'}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className="capitalize text-[#dde6ef]">{s.metodo_pago || (s.estado === 'pendiente' ? 'Por cobrar' : 'Efectivo')}</span>
                      {s.tarjeta_nombre && <span className="text-[10px] font-mono text-[#a78bfa]">({s.tarjeta_nombre})</span>}
                      {s.facturada && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#00e5a0]/20 text-[#00e5a0] border border-[#00e5a0]/40">
                          FACT
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold" style={{ color: s.estado === 'cobrado' ? '#00e5a0' : '#f59e0b' }}>
                    {money(s.total)}
                  </td>
                </tr>
              ))}
              {salesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[#7a95aa]">No se encontraron cobros registrados con ese filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PESTAÑA: GASTOS (CUÁNTO SE GASTÓ, EN QUÉ, GASTOS HORMIGA, FUGAS, REEMBOLSOS)
// ─────────────────────────────────────────────────────────────────────────────
function GastosTab({
  ov,
  expenses,
  catalogs,
  reload,
  flash,
  onOpenNuevo,
  onOpenReembolso,
}: {
  ov: any;
  expenses: any[];
  catalogs: any;
  reload: () => void;
  flash: (t: string) => void;
  onOpenNuevo: () => void;
  onOpenReembolso: () => void;
}) {
  const ga = ov?.gastos_analisis || {};
  const ff = ov?.flujo_fondos || {};
  const hormiga = ga.gastos_hormiga || {};
  const fugas = ga.fugas_detectadas || [];
  const categorias = ga.categorias || [];
  const saldoDoctor = ff.pagado_por_doctor_total || ff.pagado_por_doctor?.total_aportado_doctor || 0;

  const eliminarGasto = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este registro de gasto?')) return;
    try {
      await api(`/clinic/expenses/${id}`, { method: 'DELETE' });
      flash('Gasto eliminado');
      reload();
    } catch (e: any) {
      flash(e.message || 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera y Botón Nuevo Gasto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d1520] border border-[#1e2d3d]">
        <div>
          <h2 className="text-lg font-bold text-[#dde6ef]">Control de Gastos & Egresos</h2>
          <p className="text-xs text-[#7a95aa] mt-0.5">
            Registra rentas, insumos médicos, plataformas, sueldos y localiza gastos hormiga o fugas.
          </p>
        </div>
        <button
          onClick={onOpenNuevo}
          className={`${btnPrimary} bg-[#f43f5e] text-[#fff] hover:bg-[#e11d48] shadow`}
        >
          <span className="text-base font-bold">+</span>
          <span>Registrar Gasto</span>
        </button>
      </div>

      {/* KPI Cards de Gastos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total Gastado</p>
          <p className="text-xl sm:text-2xl font-bold font-mono text-[#f43f5e] mt-1">
            {money(ga.total_gastado || ov?.kpis?.gasto_mes || 0)}
          </p>
          <p className="text-[11px] text-[#7a95aa] mt-1">Acumulado en el periodo</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Gastos Facturados</p>
          <p className="text-xl sm:text-2xl font-bold font-mono text-[#38bdf8] mt-1">
            {money(ov?.gastos_facturados || expenses.filter(e => e.facturado).reduce((s, e) => s + (e.monto || 0), 0))}
          </p>
          <p className="text-[11px] text-[#7a95aa] mt-1">Deducibles fiscalmente</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Gastos Hormiga (≤ $1,500)</p>
          <p className="text-xl sm:text-2xl font-bold font-mono text-[#f59e0b] mt-1">
            {money(hormiga.total || 0)}
          </p>
          <p className="text-[11px] text-[#7a95aa] mt-1">{hormiga.conteo || 0} compras menores</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d] flex flex-col justify-between">
          <div>
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Pagado por el Dr.</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#a78bfa] mt-1">
              {money(saldoDoctor)}
            </p>
          </div>
          {saldoDoctor > 0 && (
            <button
              onClick={onOpenReembolso}
              className="mt-2 text-xs font-semibold text-[#a78bfa] hover:underline text-left"
            >
              Reembolsar al médico →
            </button>
          )}
        </div>
      </div>

      {/* Detección de Fugas y Gastos Hormiga */}
      {fugas.length > 0 && (
        <div className="p-5 rounded-2xl bg-[#0d1520] border border-[#f43f5e]/40 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚨</span>
            <h3 className="text-sm font-bold text-[#dde6ef]">Oportunidades de Ahorro y Fugas Detectadas</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fugas.map((f: string, i: number) => (
              <div key={i} className="p-3.5 rounded-xl bg-[#111820] border border-[#1e2d3d] text-xs text-[#dde6ef] leading-relaxed">
                {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Desglose por Categoría & Plataformas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#dde6ef]">¿En qué se gasta más?</h3>
          <p className="text-xs text-[#7a95aa]">Desglose por rubros operativos y médicos</p>

          <div className="space-y-2 pt-2">
            {categorias.map((c: any, i: number) => {
              const maxC = Math.max(...categorias.map((x: any) => x.valor), 1);
              const pct = Math.round((c.valor / maxC) * 100);
              return (
                <div key={i} className="p-2.5 rounded-xl bg-[#111820] border border-[#1e2d3d] space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#dde6ef]">{c.nombre}</span>
                    <span className="font-mono text-[#f43f5e] font-bold">{money(c.valor)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#070a0e] rounded-full overflow-hidden">
                    <div className="h-full bg-[#f43f5e] rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {categorias.length === 0 && (
              <p className="text-xs text-[#7a95aa] py-3 text-center">Sin egresos registrados.</p>
            )}
          </div>
        </div>

        {/* Origen de los fondos (Caja chica, Banco o Doctor) */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#dde6ef]">¿De dónde salió el dinero?</h3>
          <p className="text-xs text-[#7a95aa]">Control de fondos para evitar desbalances de caja</p>

          <div className="space-y-3 pt-2">
            <div className="p-3.5 rounded-xl bg-[#111820] border border-[#1e2d3d] flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#dde6ef]">💵 Caja del consultorio (Efectivo)</p>
                <p className="text-[11px] text-[#7a95aa]">Salidas de efectivo menor</p>
              </div>
              <p className="text-sm font-mono font-bold text-[#00e5a0]">
                {money(ff.caja_consultorio?.salidas_caja || 0)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#111820] border border-[#1e2d3d] flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#dde6ef]">🏦 Tarjeta o Banco de la clínica</p>
                <p className="text-[11px] text-[#7a95aa]">Pagos transferidos y terminales</p>
              </div>
              <p className="text-sm font-mono font-bold text-[#38bdf8]">
                {money(ff.banco_consultorio?.salidas_tarjeta_transferencia || 0)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#111820] border border-[#a78bfa]/30 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#dde6ef]">👨‍⚕️ Dinero personal del Dr.</p>
                <p className="text-[11px] text-[#7a95aa]">Gastos cubiertos del bolsillo médico</p>
              </div>
              <p className="text-sm font-mono font-bold text-[#a78bfa]">
                {money(saldoDoctor)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Historial de Gastos Registrados */}
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#dde6ef]">Historial de Gastos</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#1e2d3d] text-[#7a95aa] font-mono uppercase text-[10px]">
                <th className="py-2.5 px-3">Fecha</th>
                <th className="py-2.5 px-3">Concepto</th>
                <th className="py-2.5 px-3">Categoría</th>
                <th className="py-2.5 px-3">Proveedor</th>
                <th className="py-2.5 px-3">Fondo / Factura</th>
                <th className="py-2.5 px-3 text-right">Monto</th>
                <th className="py-2.5 px-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d3d]/50">
              {expenses.map((g: any) => {
                const orig = ORIGEN_FONDO_LABELS[g.origen_fondo || ''] || { short: 'Caja' };
                return (
                  <tr key={g.id} className="hover:bg-[#111820]/60 transition">
                    <td className="py-3 px-3 text-[#7a95aa] font-mono">{g.fecha || (g.created_at || '').slice(0, 10)}</td>
                    <td className="py-3 px-3 font-semibold text-[#dde6ef]">{g.concepto}</td>
                    <td className="py-3 px-3 capitalize text-[#7a95aa]">{g.categoria || 'General'}</td>
                    <td className="py-3 px-3 text-[#dde6ef]">{g.proveedor || '—'}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#dde6ef]">{orig.short}</span>
                        {g.tarjeta_nombre && <span className="text-[10px] font-mono text-[#a78bfa]">({g.tarjeta_nombre})</span>}
                        {g.facturado && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/40">
                            FACTURADO
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[#f43f5e]">{money(g.monto)}</td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => eliminarGasto(g.id)}
                        className="text-[#f43f5e] hover:opacity-70 p-1 font-bold"
                        title="Eliminar gasto"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-[#7a95aa]">No hay gastos registrados en este periodo.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PESTAÑA: SERVICIOS & TARIFAS (PRECIO FIJO O PRECIO VARIABLE)
// ─────────────────────────────────────────────────────────────────────────────
function ServiciosTab({
  services,
  reload,
  flash,
}: {
  services: any[];
  reload: () => void;
  flash: (t: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState<number>(0);
  const [precioTipo, setPrecioTipo] = useState<'fijo' | 'variable'>('fijo');
  const [categoria, setCategoria] = useState<string>('consulta');
  const [descripcion, setDescripcion] = useState('');

  const guardarPrestacion = async () => {
    if (!nombre.trim()) return flash('Indica el nombre del servicio');
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
      flash('✓ Servicio registrado en el catálogo');
      reload();
    } catch (e: any) {
      flash(e.message || 'Error al guardar el servicio');
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

  const eliminarServicio = async (id: string) => {
    if (!confirm('¿Eliminar este servicio del catálogo?')) return;
    try {
      await api(`/clinic/services/${id}`, { method: 'DELETE' });
      flash('Servicio eliminado');
      reload();
    } catch (e: any) {
      flash(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d1520] border border-[#1e2d3d]">
        <div>
          <h2 className="text-lg font-bold text-[#dde6ef]">Catálogo de Servicios & Procedimientos</h2>
          <p className="text-xs text-[#7a95aa] mt-0.5">
            Alta de consultas, holter, pruebas de esfuerzo o cirugías con precio fijo o variable según hospital/aseguradora.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className={`${btnPrimary} bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c]`}
        >
          <span className="text-base font-bold">+</span>
          <span>Nuevo Servicio</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((s: any) => {
          const isVar = s.precio_tipo === 'variable';
          return (
            <div
              key={s.id}
              className="p-5 rounded-2xl bg-[#0d1520] border border-[#1e2d3d] flex flex-col justify-between hover:border-[#2a3e52] transition"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-[#111820] text-[#7a95aa] border border-[#1e2d3d]">
                    {s.categoria || 'consulta'}
                  </span>
                  <span className={`w-2 h-2 rounded-full ${s.activo ? 'bg-[#00e5a0]' : 'bg-[#486581]'}`} />
                </div>
                <h4 className="text-base font-bold text-[#dde6ef]">{s.nombre}</h4>
                {s.descripcion && <p className="text-xs text-[#7a95aa] mt-1">{s.descripcion}</p>}
              </div>

              <div className="pt-4 mt-4 border-t border-[#1e2d3d] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono uppercase text-[#7a95aa]">Tarifa</p>
                  <p className="text-base font-bold font-mono" style={{ color: isVar ? '#f59e0b' : '#00e5a0' }}>
                    {isVar ? 'Precio Variable' : money(s.precio)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleActivo(s)}
                    className="px-2.5 py-1 rounded-lg text-xs bg-[#111820] text-[#dde6ef] border border-[#1e2d3d] hover:border-[#00e5a0]"
                  >
                    {s.activo ? 'Pausar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => eliminarServicio(s.id)}
                    className="p-1.5 rounded-lg text-xs text-[#f43f5e] hover:bg-[#f43f5e]/10"
                    title="Eliminar"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Nuevo Servicio */}
      {showModal && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[#0d1520] border border-[#00e5a0]/40 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-bold text-[#dde6ef]">Dar de Alta Servicio / Procedimiento</h3>
              <p className="text-xs text-[#7a95aa]">Define el concepto y si su precio es fijo o variable.</p>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Nombre del Servicio *</label>
              <input
                className={inp}
                placeholder="Ej. Consulta Especialidad, Holter 24h, Colocación de Marcapasos…"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Categoría</label>
                <select
                  className={inp}
                  value={categoria}
                  onChange={e => setCategoria(e.target.value)}
                >
                  <option value="consulta">Consulta</option>
                  <option value="procedimiento">Procedimiento</option>
                  <option value="cirugia">Cirugía</option>
                  <option value="estudio">Estudio</option>
                  <option value="producto">Producto</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Tipo de Precio</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPrecioTipo('fijo')}
                    className="py-2.5 rounded-xl text-xs font-semibold transition"
                    style={{
                      background: precioTipo === 'fijo' ? '#00e5a0' : '#111820',
                      color: precioTipo === 'fijo' ? '#051b14' : '#7a95aa',
                      border: `1px solid ${precioTipo === 'fijo' ? '#00e5a0' : '#1e2d3d'}`,
                    }}
                  >
                    Fijo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrecioTipo('variable')}
                    className="py-2.5 rounded-xl text-xs font-semibold transition"
                    style={{
                      background: precioTipo === 'variable' ? '#f59e0b' : '#111820',
                      color: precioTipo === 'variable' ? '#051b14' : '#7a95aa',
                      border: `1px solid ${precioTipo === 'variable' ? '#f59e0b' : '#1e2d3d'}`,
                    }}
                  >
                    Variable
                  </button>
                </div>
              </div>
            </div>

            {precioTipo === 'fijo' && (
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Precio Fijo ($ MXN) *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className={inp}
                  placeholder="0"
                  value={precio || ''}
                  onChange={e => setPrecio(+e.target.value || 0)}
                />
              </div>
            )}

            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Descripción / Notas (Opcional)</label>
              <textarea
                className={`${inp} resize-none h-20 text-xs`}
                placeholder="Detalles sobre indicaciones o preparación…"
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className={`${btnSecondary} flex-1`}>
                Cancelar
              </button>
              <button onClick={guardarPrestacion} className={`${btnPrimary} bg-[#00e5a0] text-[#051b14] flex-1`}>
                Guardar Servicio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: REGISTRAR INGRESO (SÚPER SENCILLO CON CRECIMIENTO ORGÁNICO)
// ─────────────────────────────────────────────────────────────────────────────
function ModalRegistrarIngreso({
  patients,
  services,
  catalogs,
  onClose,
  onSuccess,
}: {
  patients: any[];
  services: any[];
  catalogs: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [monto, setMonto] = useState<number>(0);
  const [concepto, setConcepto] = useState('');
  const [pacienteQuery, setPacienteQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [showPatientList, setShowPatientList] = useState(false);
  const [lugar, setLugar] = useState('Consultorio Propio');
  const [facturada, setFacturada] = useState(false);
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'transferencia' | 'pendiente'>('efectivo');
  const [tarjetaNombre, setTarjetaNombre] = useState('');
  const [guardarCliente, setGuardarCliente] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Filtrado de pacientes en tiempo real
  const pacientesFiltrados = useMemo(() => {
    if (!pacienteQuery.trim()) return patients.slice(0, 8);
    const q = pacienteQuery.toLowerCase();
    return patients.filter((p: any) =>
      `${p.first_name || ''} ${p.last_name || ''} ${p.telefono || ''}`.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [patients, pacienteQuery]);

  const seleccionarPaciente = (p: any) => {
    const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    setSelectedPatientId(p.id);
    setPacienteQuery(full);
    setShowPatientList(false);
  };

  const seleccionarServicioChip = (srv: any) => {
    setConcepto(srv.nombre);
    if (srv.precio_tipo === 'fijo' && srv.precio > 0) {
      setMonto(srv.precio);
    }
  };

  const enviarCobro = async () => {
    if (!monto || monto <= 0) return setErr('Por favor indica un monto válido.');
    if (!concepto.trim()) return setErr('Por favor indica el concepto del cobro.');

    setSaving(true);
    setErr('');
    try {
      const modo = metodoPago === 'pendiente' ? 'pendiente' : 'cobrado';
      await api('/clinic/sales', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: selectedPatientId,
          items: [{ concepto: concepto.trim(), precio: monto, cantidad: 1, precio_tipo: 'variable' }],
          estado: modo,
          metodo_pago: modo === 'cobrado' ? metodoPago : null,
          facturada: modo === 'cobrado' ? facturada : false,
          lugar: lugar.trim() || 'Consultorio',
          aseguradora: !selectedPatientId && pacienteQuery.trim() ? pacienteQuery.trim() : null,
          procedimiento: concepto.trim(),
          tarjeta_nombre: metodoPago === 'tarjeta' ? tarjetaNombre.trim() : null,
          guardar_cliente: guardarCliente,
        }),
      });
      onSuccess();
    } catch (e: any) {
      setErr(e.message || 'Error al guardar el ingreso');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div
        className="bg-[#0d1520] border border-[#00e5a0]/40 rounded-2xl p-5 sm:p-6 w-full max-w-lg space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-[#1e2d3d]">
          <div>
            <span className="text-[10px] font-mono uppercase text-[#00e5a0]">Mostrador / Caja</span>
            <h3 className="text-lg font-bold text-[#dde6ef]">Registrar Ingreso</h3>
          </div>
          <button onClick={onClose} className="text-[#7a95aa] hover:text-[#dde6ef] text-xl font-bold">×</button>
        </div>

        {err && (
          <div className="p-3 rounded-xl bg-[#f43f5e]/10 border border-[#f43f5e]/30 text-xs text-[#f43f5e]">
            {err}
          </div>
        )}

        {/* 1. MONTO */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Monto Cobrado ($ MXN) *</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-3.5 flex items-center text-lg text-[#00e5a0] font-bold font-mono">$</span>
            <input
              type="number"
              inputMode="decimal"
              className={`${inp} pl-9 text-xl sm:text-2xl font-bold font-mono text-[#00e5a0]`}
              placeholder="0"
              value={monto || ''}
              onChange={e => setMonto(+e.target.value || 0)}
              autoFocus
            />
          </div>
        </div>

        {/* 2. A QUIÉN SE COBRÓ */}
        <div className="relative">
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
            ¿A quién se cobró? (Paciente, Aseguradora o Entidad)
          </label>
          <input
            className={inp}
            placeholder="Escribe para buscar paciente o nombre de aseguradora…"
            value={pacienteQuery}
            onFocus={() => setShowPatientList(true)}
            onChange={e => {
              setPacienteQuery(e.target.value);
              setSelectedPatientId(null);
              setShowPatientList(true);
            }}
          />

          {showPatientList && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#111820] border border-[#1e2d3d] rounded-xl shadow-2xl max-h-48 overflow-y-auto z-50 divide-y divide-[#1e2d3d]">
              {pacientesFiltrados.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => seleccionarPaciente(p)}
                  className="w-full text-left p-2.5 hover:bg-[#162231] text-xs flex items-center justify-between transition"
                >
                  <span className="font-semibold text-[#dde6ef]">{p.first_name} {p.last_name}</span>
                  <span className="text-[10px] font-mono text-[#7a95aa]">{p.telefono || 'Sin teléfono'}</span>
                </button>
              ))}
              {pacienteQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setShowPatientList(false)}
                  className="w-full text-left p-2.5 bg-[#0d1520] hover:bg-[#162231] text-xs text-[#00e5a0] font-semibold"
                >
                  + Usar como nombre libre: "{pacienteQuery}"
                </button>
              )}
            </div>
          )}

          {/* Opción de guardar en clientes frecuentes */}
          {!selectedPatientId && pacienteQuery.trim() && (
            <label className="flex items-center gap-2 text-xs text-[#7a95aa] mt-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={guardarCliente}
                onChange={e => setGuardarCliente(e.target.checked)}
                className="rounded accent-[#00e5a0]"
              />
              <span>Guardar a "{pacienteQuery}" para sugerirlo la próxima vez</span>
            </label>
          )}
        </div>

        {/* 3. POR QUÉ CONCEPTO */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Concepto del Cobro *</label>
          <input
            className={inp}
            placeholder="Ej. Consulta de Valoración, Prueba de Esfuerzo, Cirugía Quirófano…"
            value={concepto}
            onChange={e => setConcepto(e.target.value)}
          />

          {/* Chips de servicios frecuentes */}
          {services.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {services.slice(0, 6).map((s: any) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => seleccionarServicioChip(s)}
                  className="px-2.5 py-1 rounded-lg text-xs bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] hover:border-[#00e5a0] transition"
                >
                  {s.nombre} {s.precio > 0 ? `(${money(s.precio)})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 4. DÓNDE SE REALIZÓ */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
            ¿Dónde se realizó? (Sede / Hospital)
          </label>
          <select
            className={inp}
            value={lugar}
            onChange={e => setLugar(e.target.value)}
          >
            {SEDES_PREDEFINIDAS.map((sed, i) => (
              <option key={i} value={sed}>{sed}</option>
            ))}
            <option value="Hospital Privado (Otro)">Hospital Privado (Otro)</option>
            <option value="Consulta a Domicilio">Consulta a Domicilio</option>
          </select>
        </div>

        {/* 5. ¿EMITIMOS FACTURA? */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#111820] border border-[#1e2d3d]">
          <div>
            <p className="text-xs font-semibold text-[#dde6ef]">¿Emitimos factura nosotros?</p>
            <p className="text-[10px] text-[#7a95aa]">Comprobante fiscal CFDI emitido por la clínica</p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setFacturada(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
              style={{
                background: !facturada ? '#1e2d3d' : 'transparent',
                color: !facturada ? '#dde6ef' : '#7a95aa',
              }}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => setFacturada(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
              style={{
                background: facturada ? '#00e5a0' : 'transparent',
                color: facturada ? '#051b14' : '#7a95aa',
              }}
            >
              Sí
            </button>
          </div>
        </div>

        {/* 6. FORMA DE PAGO */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">Forma de Pago</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'efectivo', l: '💵 Efectivo' },
              { id: 'tarjeta', l: '💳 Tarjeta' },
              { id: 'transferencia', l: '🏦 Transf.' },
              { id: 'pendiente', l: '⏳ Por cobrar' },
            ].map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetodoPago(m.id as any)}
                className="py-2.5 px-2 rounded-xl text-xs font-semibold transition text-center"
                style={{
                  background: metodoPago === m.id ? '#00e5a0' : '#111820',
                  color: metodoPago === m.id ? '#051b14' : '#dde6ef',
                  border: `1px solid ${metodoPago === m.id ? '#00e5a0' : '#1e2d3d'}`,
                }}
              >
                {m.l}
              </button>
            ))}
          </div>

          {metodoPago === 'tarjeta' && (
            <div className="mt-2.5">
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
                ¿Qué tarjeta / terminal se utilizó?
              </label>
              <input
                className={inp}
                placeholder="Ej. Débito BBVA, Clip Consultorio, Crédito Banamex…"
                value={tarjetaNombre}
                onChange={e => setTarjetaNombre(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-3 border-t border-[#1e2d3d]">
          <button onClick={onClose} className={`${btnSecondary} flex-1`}>
            Cancelar
          </button>
          <button
            onClick={enviarCobro}
            disabled={saving}
            className={`${btnPrimary} bg-[#00e5a0] text-[#051b14] flex-1`}
          >
            {saving ? 'Registrando…' : '✓ Guardar Ingreso'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: REGISTRAR GASTO (SÚPER SENCILLO CON CRECIMIENTO ORGÁNICO)
// ─────────────────────────────────────────────────────────────────────────────
function ModalRegistrarGasto({
  catalogs,
  onClose,
  onSuccess,
}: {
  catalogs: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [monto, setMonto] = useState<number>(0);
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState('insumos');
  const [proveedor, setProveedor] = useState('');
  const [facturado, setFacturado] = useState(false);
  const [formaPago, setFormaPago] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('efectivo');
  const [tarjetaNombre, setTarjetaNombre] = useState('');
  const [origenFondo, setOrigenFondo] = useState<string>('caja_consultorio');
  const [guardarProveedor, setGuardarProveedor] = useState(false);
  const [guardarConcepto, setGuardarConcepto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const enviarGasto = async () => {
    if (!monto || monto <= 0) return setErr('Por favor indica un monto válido.');
    if (!concepto.trim()) return setErr('Por favor indica en qué se gastó.');

    setSaving(true);
    setErr('');
    try {
      await api('/clinic/expenses', {
        method: 'POST',
        body: JSON.stringify({
          concepto: concepto.trim(),
          monto,
          categoria,
          proveedor: proveedor.trim() || null,
          fecha: new Date().toISOString().slice(0, 10),
          origen_fondo: origenFondo,
          facturado,
          tarjeta_nombre: formaPago === 'tarjeta' ? tarjetaNombre.trim() : null,
          guardar_proveedor: guardarProveedor,
          guardar_concepto: guardarConcepto,
        }),
      });
      onSuccess();
    } catch (e: any) {
      setErr(e.message || 'Error al guardar el gasto');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div
        className="bg-[#0d1520] border border-[#f43f5e]/40 rounded-2xl p-5 sm:p-6 w-full max-w-lg space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-[#1e2d3d]">
          <div>
            <span className="text-[10px] font-mono uppercase text-[#f43f5e]">Egresos & Compras</span>
            <h3 className="text-lg font-bold text-[#dde6ef]">Registrar Gasto</h3>
          </div>
          <button onClick={onClose} className="text-[#7a95aa] hover:text-[#dde6ef] text-xl font-bold">×</button>
        </div>

        {err && (
          <div className="p-3 rounded-xl bg-[#f43f5e]/10 border border-[#f43f5e]/30 text-xs text-[#f43f5e]">
            {err}
          </div>
        )}

        {/* 1. MONTO */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Monto Gastado ($ MXN) *</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-3.5 flex items-center text-lg text-[#f43f5e] font-bold font-mono">$</span>
            <input
              type="number"
              inputMode="decimal"
              className={`${inp} pl-9 text-xl sm:text-2xl font-bold font-mono text-[#f43f5e]`}
              placeholder="0"
              value={monto || ''}
              onChange={e => setMonto(+e.target.value || 0)}
              autoFocus
            />
          </div>
        </div>

        {/* 2. EN QUÉ SE GASTÓ */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">¿En qué se gastó? (Concepto) *</label>
          <input
            className={inp}
            placeholder="Ej. Renta consultorio, Gasas y jeringas, Doctoralia, Ads Meta, CFE…"
            value={concepto}
            onChange={e => setConcepto(e.target.value)}
          />

          {/* Chips rápidos de conceptos frecuentes */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[
              { n: 'Renta Consultorio', c: 'renta' },
              { n: 'Insumos Médicos', c: 'insumos' },
              { n: 'Doctoralia / Agenda', c: 'servicios' },
              { n: 'Publicidad / Ads Meta', c: 'publicidad' },
              { n: 'Papelería / Oficina', c: 'otros' },
              { n: 'Internet / Celular', c: 'servicios' },
            ].map((ch, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setConcepto(ch.n);
                  setCategoria(ch.c);
                }}
                className="px-2.5 py-1 rounded-lg text-xs bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] hover:border-[#f43f5e] transition"
              >
                {ch.n}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-[#7a95aa] mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={guardarConcepto}
              onChange={e => setGuardarConcepto(e.target.checked)}
              className="rounded accent-[#f43f5e]"
            />
            <span>Guardar este concepto para rellenar en 1 clic en el futuro</span>
          </label>
        </div>

        {/* 3. PROVEEDOR */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Proveedor / Comercio</label>
          <input
            className={inp}
            placeholder="Ej. Farmacias del Ahorro, CFE, Propietario Consultorio, Telcel…"
            value={proveedor}
            onChange={e => setProveedor(e.target.value)}
          />

          <label className="flex items-center gap-2 text-xs text-[#7a95aa] mt-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={guardarProveedor}
              onChange={e => setGuardarProveedor(e.target.checked)}
              className="rounded accent-[#f43f5e]"
            />
            <span>Guardar este proveedor para autocompletar la próxima vez</span>
          </label>
        </div>

        {/* 4. ¿SE FACTURÓ EL GASTO? */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#111820] border border-[#1e2d3d]">
          <div>
            <p className="text-xs font-semibold text-[#dde6ef]">¿Se facturó el gasto?</p>
            <p className="text-[10px] text-[#7a95aa]">¿El proveedor emitió factura fiscal deducible?</p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setFacturado(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
              style={{
                background: !facturado ? '#1e2d3d' : 'transparent',
                color: !facturado ? '#dde6ef' : '#7a95aa',
              }}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => setFacturado(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
              style={{
                background: facturado ? '#38bdf8' : 'transparent',
                color: facturado ? '#051b14' : '#7a95aa',
              }}
            >
              Sí
            </button>
          </div>
        </div>

        {/* 5. ¿DE DÓNDE SALIÓ EL DINERO? */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">
            ¿De dónde salió el dinero para pagar? *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'caja_consultorio', l: '💵 Caja consultorio', sub: 'Efectivo chica' },
              { id: 'tarjeta_consultorio', l: '💳 Tarjeta clínica', sub: 'Cuenta bancaria' },
              { id: 'tarjeta_doctor', l: '👨‍⚕️ Dr. (Reembolso)', sub: 'Bolsillo médico' },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setOrigenFondo(f.id)}
                className="p-2.5 rounded-xl text-left text-xs font-semibold transition"
                style={{
                  background: origenFondo === f.id ? (f.id === 'tarjeta_doctor' ? '#a78bfa' : '#00e5a0') : '#111820',
                  color: origenFondo === f.id ? '#051b14' : '#dde6ef',
                  border: `1px solid ${origenFondo === f.id ? (f.id === 'tarjeta_doctor' ? '#a78bfa' : '#00e5a0') : '#1e2d3d'}`,
                }}
              >
                <p>{f.l}</p>
                <p className="text-[10px] opacity-75 font-normal">{f.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 6. FORMA DE PAGO */}
        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">Método de Pago</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'efectivo', l: 'Efectivo' },
              { id: 'transferencia', l: 'Transferencia' },
              { id: 'tarjeta', l: 'Tarjeta' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setFormaPago(p.id as any)}
                className="py-2.5 rounded-xl text-xs font-semibold transition"
                style={{
                  background: formaPago === p.id ? '#1e2d3d' : '#111820',
                  color: formaPago === p.id ? '#dde6ef' : '#7a95aa',
                  border: `1px solid ${formaPago === p.id ? '#00e5a0' : '#1e2d3d'}`,
                }}
              >
                {p.l}
              </button>
            ))}
          </div>

          {formaPago === 'tarjeta' && (
            <div className="mt-2.5">
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
                ¿Qué tarjeta se usó?
              </label>
              <input
                className={inp}
                placeholder="Ej. Tarjeta de crédito clínica, Tarjeta personal Dr.…"
                value={tarjetaNombre}
                onChange={e => setTarjetaNombre(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-3 border-t border-[#1e2d3d]">
          <button onClick={onClose} className={`${btnSecondary} flex-1`}>
            Cancelar
          </button>
          <button
            onClick={enviarGasto}
            disabled={saving}
            className={`${btnPrimary} bg-[#f43f5e] text-[#fff] flex-1 hover:bg-[#e11d48]`}
          >
            {saving ? 'Registrando…' : '✓ Guardar Gasto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: REEMBOLSAR AL DOCTOR
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
    <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
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
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Monto a Reembolsar ($ MXN)</label>
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
            ¿Desde dónde se hace el reembolso?
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
              💵 Caja chica
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
              🏦 Transf. Clínica
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Notas / Referencia</label>
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
