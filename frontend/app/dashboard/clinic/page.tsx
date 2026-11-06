'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getRole } from '@/app/lib/role';
import { useEntitlements } from '@/app/lib/useEntitlements';
import StaffManagement from '../staff/StaffManagement';
import { ModalRegistrarIngreso, ModalRegistrarGasto } from './ModalesCaja';
import { B, money, authHeaders, api, CATALOGOS_VACIOS, type Catalogos } from './clinicApi';

// Estilos móviles táctiles Apple HIG: inputs base 16px para evitar zoom safari en iPhone
const inp = 'w-full bg-[#111820] border border-[#1e2d3d] rounded-xl px-3.5 py-3 text-base sm:text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#486581]';
const btnPrimary = 'min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] shadow-sm';
const btnSecondary = 'min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold transition bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] hover:border-[#00e5a0] active:scale-[0.98]';

type TabKey = 'resumen' | 'ingresos' | 'gastos' | 'equipo' | 'servicios';

// `useSearchParams` pide un Suspense por encima para que Next pueda construir la página.
export default function ClinicPage() {
  return (
    <Suspense fallback={null}>
      <ClinicContenido />
    </Suspense>
  );
}

function ClinicContenido() {
  const router = useRouter();
  const params = useSearchParams();
  const { features } = useEntitlements();
  const [role, setRole] = useState<string>('doctor');
  const esRecepcion = role === 'receptionist';

  // Pestaña activa
  const [tab, setTab] = useState<TabKey>('resumen');

  // Estados de datos
  const [ov, setOv] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [catalogs, setCatalogs] = useState<Catalogos>(CATALOGOS_VACIOS);
  const [patients, setPatients] = useState<any[]>([]);
  // Las listas de las ventanas de ingreso/gasto se piden aparte y primero: no esperan al resumen.
  const [listasListas, setListasListas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Modales
  const [showModalIngreso, setShowModalIngreso] = useState(false);
  const [showModalGasto, setShowModalGasto] = useState(false);

  // Catálogos (clientes, proveedores, lugares, conceptos): ligeros, se refrescan al guardar.
  const loadCatalogs = useCallback(async () => {
    const cat = await api('/clinic/catalogs').catch(() => null);
    if (cat) {
      setCatalogs({
        proveedores: cat.proveedores || [],
        clientes: cat.clientes || [],
        conceptos_gasto: cat.conceptos_gasto || [],
        lugares: cat.lugares || [],
      });
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [o, s, sl, ex] = await Promise.all([
        api('/clinic/overview').catch(() => null),
        api('/clinic/services').catch(() => ({ services: [] })),
        api('/clinic/sales').catch(() => ({ sales: [] })),
        api('/clinic/expenses').catch(() => ({ expenses: [] })),
      ]);
      setOv(o);
      setServices(s.services || []);
      setSales(sl.sales || []);
      setExpenses(ex.expenses || []);
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

    // 1º lo que necesitan las ventanas de ingreso/gasto (pacientes y catálogos), 2º el resto.
    const listas = Promise.all([
      loadCatalogs(),
      authHeaders()
        .then(headers => fetch(`${B()}/patients/?limit=1000`, { headers }))
        .then(res => (res.ok ? res.json() : { patients: [] }))
        .then(d => setPatients(d.patients || []))
        .catch(() => {}),
    ]).finally(() => setListasListas(true));
    listas.then(() => loadAll());
  }, [loadAll, loadCatalogs]);

  // Entradas por URL desde el menú: ?tab=ingresos&action=nuevo abre la ventana de ingreso.
  // `useSearchParams` reacciona a cada navegación (también estando ya en esta página) y, una vez
  // abierta la ventana, se quita `action` de la URL: así el mismo botón del menú puede volver a
  // abrirla después de cerrarla (antes la URL quedaba igual y no pasaba nada).
  useEffect(() => {
    const t = params.get('tab');
    const act = params.get('action');
    if (t && ['resumen', 'insights', 'ingresos', 'gastos', 'equipo', 'servicios'].includes(t)) {
      setTab(t === 'insights' ? 'resumen' : (t as TabKey));
    }
    if (act === 'nuevo') {
      if (t === 'ingresos' || (!t && esRecepcion)) setShowModalIngreso(true);
      else if (t === 'gastos') setShowModalGasto(true);
      else return;
      router.replace(t ? `/dashboard/clinic?tab=${encodeURIComponent(t)}` : '/dashboard/clinic', { scroll: false });
    }
  }, [params, esRecepcion, router]);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(''), 4000);
  };

  const TABS = useMemo(() => {
    const list: { id: TabKey; label: string; badge?: number }[] = [];
    if (!esRecepcion) {
      list.push({ id: 'resumen', label: 'Resumen' });
    }
    const cpcCount = ov?.cuentas_por_cobrar?.length || 0;
    list.push({ id: 'ingresos', label: 'Ingresos', badge: cpcCount > 0 ? cpcCount : undefined });
    list.push({ id: 'gastos', label: 'Gastos' });
    if (!esRecepcion) {
      list.push({ id: 'equipo', label: 'Equipo' });
      list.push({ id: 'servicios', label: 'Servicios' });
    }
    return list;
  }, [esRecepcion, ov?.cuentas_por_cobrar?.length]);

  return (
    <div className="min-h-screen bg-[#070a0e] text-[#dde6ef]">
      <main className="page-content pt-16 px-4 sm:px-6 py-6 max-w-7xl mx-auto space-y-6">
        {/* Cabecera Principal Limpia */}
        <div className="pb-2 border-b border-[#1e2d3d]/60">
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#dde6ef]">
            {esRecepcion ? 'Caja & Cobros' : 'Mi Consultorio'}
          </h1>
        </div>

        {/* Pestañas Segmentadas Limpias (Apple HIG touch target >= 44px) */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
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

        {/* Notificación Toast */}
        {msg && (
          <div className="p-3.5 rounded-xl bg-[#00e5a0]/10 border border-[#00e5a0]/30 text-[#00e5a0] text-sm flex items-center justify-between gap-3 animate-in fade-in">
            <span>{msg}</span>
            <button onClick={() => setMsg('')} className="text-[#00e5a0] hover:opacity-75 font-bold text-lg leading-none">×</button>
          </div>
        )}

        {/* ── 1. RESUMEN TAB (ASESOR SERENO & PULSO DEL NEGOCIO) ── */}
        {tab === 'resumen' && !esRecepcion && (
          <ResumenTab
            ov={ov}
            reload={loadAll}
          />
        )}

        {/* ── 2. INGRESOS TAB (SOLO INGRESOS) ── */}
        {tab === 'ingresos' && (
          <IngresosTab
            ov={ov}
            sales={sales}
            reload={loadAll}
            flash={flash}
            onOpenNuevo={() => setShowModalIngreso(true)}
            esRecepcion={esRecepcion}
          />
        )}

        {/* ── 3. GASTOS TAB (SOLO GASTOS) ── */}
        {tab === 'gastos' && (
          <GastosTab
            ov={ov}
            expenses={expenses}
            reload={loadAll}
            flash={flash}
            onOpenNuevo={() => setShowModalGasto(true)}
            esRecepcion={esRecepcion}
          />
        )}

        {/* ── 4. EQUIPO TAB ── */}
        {tab === 'equipo' && !esRecepcion && (
          <div className="space-y-4">
            <StaffManagement />
          </div>
        )}

        {/* ── 5. SERVICIOS TAB ── */}
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
          cargando={!listasListas}
          onClose={() => setShowModalIngreso(false)}
          onSuccess={() => {
            setShowModalIngreso(false);
            flash('Ingreso registrado');
            loadAll();
            loadCatalogs();
          }}
        />
      )}

      {/* ── MODAL: REGISTRAR GASTO ── */}
      {showModalGasto && (
        <ModalRegistrarGasto
          catalogs={catalogs}
          cargando={!listasListas}
          onClose={() => setShowModalGasto(false)}
          onSuccess={() => {
            setShowModalGasto(false);
            flash('Gasto registrado');
            loadAll();
            loadCatalogs();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PESTAÑA: RESUMEN (ASESOR DEL CONSULTORIO & PULSO ECONÓMICO)
// ─────────────────────────────────────────────────────────────────────────────
function ResumenTab({
  ov,
  reload,
}: {
  ov: any;
  reload: () => void;
}) {
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiReport, setAiReport] = useState<string>(ov?.ai_analysis || '');
  const [loadingAi, setLoadingAi] = useState(false);

  const rv = ov?.resumen_ventas || {};
  const sedes = ov?.analisis_sedes || [];
  const ga = ov?.gastos_analisis || {};
  const fugas = ga.fugas_detectadas || [];

  const consultarIa = async (customQ?: string) => {
    setLoadingAi(true);
    try {
      const q = customQ !== undefined ? customQ : aiPrompt.trim();
      const res = await api('/clinic/ai-analysis', {
        method: 'POST',
        body: JSON.stringify({ question: q || null }),
      });
      setAiReport(res.analysis || '');
      setAiPrompt('');
    } catch {
      // Silencioso o mensaje sereno
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 4 Cifras Clave */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 sm:p-5">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total Vendido</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-[#00e5a0] mt-1">
            {money(rv.total_vendido || 0)}
          </p>
          <p className="text-xs text-[#7a95aa] mt-1.5 font-mono">
            {rv.variacion_mes_pct !== null && rv.variacion_mes_pct !== undefined
              ? `${rv.variacion_mes_pct >= 0 ? '+' : ''}${rv.variacion_mes_pct}% vs mes ant.`
              : 'Mes en curso'}
          </p>
        </div>

        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 sm:p-5">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total Cobrado</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-[#38bdf8] mt-1">
            {money(rv.total_cobrado || 0)}
          </p>
          <p className="text-xs text-[#7a95aa] mt-1.5">Líquido recaudado</p>
        </div>

        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 sm:p-5">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Por Cobrar</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-[#f59e0b] mt-1">
            {money(rv.total_por_cobrar || 0)}
          </p>
          <p className="text-xs text-[#7a95aa] mt-1.5">
            {ov?.cuentas_por_cobrar?.length || 0} pendientes
          </p>
        </div>

        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 sm:p-5">
          <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Gastos Totales</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-[#f43f5e] mt-1">
            {money(ga.total_gastado || 0)}
          </p>
          <p className="text-xs text-[#7a95aa] mt-1.5">
            Utilidad: <b className="text-[#dde6ef] font-mono">{money((rv.total_cobrado || 0) - (ga.total_gastado || 0))}</b>
          </p>
        </div>
      </div>

      {/* Asesor del Consultorio (Presentación tranquila, breve y serena) */}
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#00e5a0]">✦ Asesor del consultorio</span>
          </div>
          <button
            onClick={() => consultarIa()}
            disabled={loadingAi}
            className="text-xs text-[#7a95aa] hover:text-[#00e5a0] transition"
          >
            {loadingAi ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        {/* Texto sereno y corto */}
        <div className="text-sm text-[#dde6ef] whitespace-pre-line leading-relaxed font-sans bg-[#070a0e] p-4 rounded-xl border border-[#1e2d3d]/70">
          {aiReport ? (
            aiReport
          ) : (
            <p className="text-[#7a95aa]">
              Hola, doctor. Por ahora no hay suficientes datos registrados este mes. En cuanto registres consultas, cirugías o gastos, aquí verás observaciones breves sobre la marcha de tu consultorio.
            </p>
          )}
        </div>

        {/* Input sereno para preguntas al asesor */}
        <div className="flex gap-2 pt-1">
          <input
            className="flex-1 bg-[#070a0e] border border-[#1e2d3d] rounded-xl px-3.5 py-2.5 text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#486581]"
            placeholder="Haz una pregunta sobre tus ingresos, gastos o sedes…"
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') consultarIa(); }}
          />
          <button
            onClick={() => consultarIa()}
            disabled={loadingAi || !aiPrompt.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#00e5a0] text-[#051b14] font-semibold text-xs transition active:scale-95 disabled:opacity-40 shrink-0"
          >
            {loadingAi ? '…' : 'Preguntar'}
          </button>
        </div>
      </div>

      {/* Sedes y Fugas (Breve y Ordenado) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Sedes Físicas */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#dde6ef]">Sedes y Hospitales</h3>
            <span className="text-xs text-[#7a95aa]">{sedes.length} ubicaciones</span>
          </div>

          <div className="space-y-2">
            {sedes.slice(0, 4).map((s: any, i: number) => (
              <div key={i} className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold text-[#dde6ef]">{s.lugar}</p>
                  <p className="text-[11px] text-[#7a95aa]">{s.cantidad} atenciones · Prom. {money(s.ticket_promedio)}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-[#00e5a0]">{money(s.total_ingreso)}</p>
                  <p className="text-[10px] text-[#7a95aa]">{s.pct_ingreso}%</p>
                </div>
              </div>
            ))}
            {sedes.length === 0 && (
              <p className="text-xs text-[#7a95aa] py-3 text-center">Registra cobros indicando la sede para ver el balance.</p>
            )}
          </div>
        </div>

        {/* Fugas y Oportunidades */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#dde6ef]">Observaciones de Gastos</h3>

          <div className="space-y-2">
            {fugas.map((f: string, i: number) => (
              <div key={i} className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] text-xs text-[#dde6ef] leading-relaxed">
                {f}
              </div>
            ))}
            {fugas.length === 0 && (
              <div className="p-4 rounded-xl bg-[#111820] border border-[#1e2d3d] text-xs text-[#7a95aa] text-center">
                Sin alertas de gastos anormales en este periodo.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PESTAÑA: INGRESOS (SOLO INGRESOS Y COBRANZA)
// ─────────────────────────────────────────────────────────────────────────────
function IngresosTab({
  ov,
  sales,
  reload,
  flash,
  onOpenNuevo,
  esRecepcion = false,
}: {
  ov: any;
  sales: any[];
  reload: () => void;
  flash: (t: string) => void;
  onOpenNuevo: () => void;
  esRecepcion?: boolean;
}) {
  const [topModo, setTopModo] = useState<'cantidad' | 'ingreso'>('ingreso');
  const [filtroCobro, setFiltroCobro] = useState<'todos' | 'pendiente' | 'cobrado'>('todos');
  const [busqueda, setBusqueda] = useState('');

  const rv = ov?.resumen_ventas || {};
  const sedes = ov?.analisis_sedes || [];
  const cuentasPorCobrar = ov?.cuentas_por_cobrar || [];
  const topCantidad = ov?.top_vendidos?.por_cantidad || [];
  const topIngreso = ov?.top_vendidos?.por_ingreso || [];

  const totalCobradoRec = sales.filter(s => s.estado === 'cobrado').reduce((acc, s) => acc + (s.total || 0), 0);
  const totalPendienteRec = sales.filter(s => s.estado === 'pendiente').reduce((acc, s) => acc + (s.total || 0), 0);

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
      flash(e.message || 'Error al liquidar');
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
      {/* Botón Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d1520] border border-[#1e2d3d]">
        <div>
          <h2 className="text-lg font-bold text-[#dde6ef]">Ingresos</h2>
          <p className="text-xs text-[#7a95aa] mt-0.5">Control de servicios vendidos y cobrados.</p>
        </div>
        <button
          onClick={onOpenNuevo}
          className={`${btnPrimary} bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c]`}
        >
          <span className="text-base font-bold">+</span>
          <span>Registrar Ingreso</span>
        </button>
      </div>

      {/* Cifras */}
      {esRecepcion ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total Cobrado por Mí</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#00e5a0] mt-1">{money(totalCobradoRec)}</p>
            <p className="text-[11px] text-[#7a95aa] mt-1">Líquido cobrado en mostrador</p>
          </div>
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Cobros Pendientes</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#f59e0b] mt-1">{money(totalPendienteRec)}</p>
            <p className="text-[11px] text-[#7a95aa] mt-1">Por liquidar con el paciente</p>
          </div>
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Cobros Registrados</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#38bdf8] mt-1">{sales.length}</p>
            <p className="text-[11px] text-[#7a95aa] mt-1">Atenciones registradas en turno</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total Vendido</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#00e5a0] mt-1">{money(rv.total_vendido || 0)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Cobrado</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#38bdf8] mt-1">{money(rv.total_cobrado || 0)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Por Cobrar</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#f59e0b] mt-1">{money(rv.total_por_cobrar || 0)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Comparativa Mes Ant.</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#dde6ef] mt-1">
              {rv.variacion_mes_pct !== null && rv.variacion_mes_pct !== undefined
                ? `${rv.variacion_mes_pct >= 0 ? '+' : ''}${rv.variacion_mes_pct}%`
                : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Qué se vende más & Sedes (Solo para doctor y contabilidad) */}
      {!esRecepcion && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#dde6ef]">Servicios más vendidos</h3>
              <div className="flex gap-1 bg-[#111820] p-1 rounded-lg border border-[#1e2d3d]">
                <button
                  onClick={() => setTopModo('ingreso')}
                  className="px-2.5 py-1 rounded text-xs font-semibold transition"
                  style={{
                    background: topModo === 'ingreso' ? '#00e5a0' : 'transparent',
                    color: topModo === 'ingreso' ? '#051b14' : '#7a95aa',
                  }}
                >
                  Por Ingreso
                </button>
                <button
                  onClick={() => setTopModo('cantidad')}
                  className="px-2.5 py-1 rounded text-xs font-semibold transition"
                  style={{
                    background: topModo === 'cantidad' ? '#00e5a0' : 'transparent',
                    color: topModo === 'cantidad' ? '#051b14' : '#7a95aa',
                  }}
                >
                  Por Cantidad
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {(topModo === 'ingreso' ? topIngreso : topCantidad).slice(0, 5).map((item: any, i: number) => (
                <div key={i} className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#dde6ef] truncate max-w-[200px]">{item.concepto}</span>
                  <span className="font-mono text-[#00e5a0] font-bold">
                    {money(item.total)} · <b className="text-[#7a95aa]">{item.cantidad} serv.</b>
                  </span>
                </div>
              ))}
              {topIngreso.length === 0 && (
                <p className="text-xs text-[#7a95aa] py-3 text-center">Sin servicios registrados.</p>
              )}
            </div>
          </div>

          {/* Sedes */}
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#dde6ef]">Ingresos por Sede o Hospital</h3>
            <div className="space-y-2.5">
              {sedes.map((s: any, i: number) => (
                <div key={i} className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-[#dde6ef]">{s.lugar}</p>
                    <p className="text-[11px] text-[#7a95aa]">{s.cantidad} atenciones</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-[#00e5a0]">{money(s.total_ingreso)}</p>
                    <p className="text-[10px] text-[#7a95aa]">{s.pct_ingreso}% del total</p>
                  </div>
                </div>
              ))}
              {sedes.length === 0 && (
                <p className="text-xs text-[#7a95aa] py-3 text-center">Registra cobros asignando sede.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cuentas por Cobrar (Solo para doctor y contabilidad) */}
      {!esRecepcion && cuentasPorCobrar.length > 0 && (
        <div className="bg-[#0d1520] border border-[#f59e0b]/40 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#dde6ef]">Cuentas por Cobrar</h3>
            <span className="text-xs font-mono font-bold text-[#f59e0b]">
              Pendiente: {money(rv.total_por_cobrar || 0)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#1e2d3d] text-[#7a95aa] font-mono uppercase text-[10px]">
                  <th className="py-2 px-3">Deudor</th>
                  <th className="py-2 px-3">Concepto</th>
                  <th className="py-2 px-3">Sede</th>
                  <th className="py-2 px-3">Antigüedad</th>
                  <th className="py-2 px-3 text-right">Monto</th>
                  <th className="py-2 px-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2d3d]/50">
                {cuentasPorCobrar.map((c: any) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-3 font-semibold text-[#dde6ef]">{c.deudor}</td>
                    <td className="py-2.5 px-3 text-[#dde6ef]">{c.procedimiento}</td>
                    <td className="py-2.5 px-3 text-[#7a95aa]">{c.lugar}</td>
                    <td className="py-2.5 px-3 text-[#f59e0b] font-mono">{c.dias_antiguedad} días</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#dde6ef]">{money(c.total)}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => marcarComoPagado(c)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c]"
                      >
                        ✓ Pagado
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historial */}
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#dde6ef]">Historial de Cobros</h3>
          <input
            className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-1.5 text-xs text-[#dde6ef] outline-none"
            placeholder="Buscar por paciente o concepto…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#1e2d3d] text-[#7a95aa] font-mono uppercase text-[10px]">
                <th className="py-2 px-3">Fecha</th>
                <th className="py-2 px-3">Paciente / Cliente</th>
                <th className="py-2 px-3">Concepto</th>
                <th className="py-2 px-3">Sede</th>
                <th className="py-2 px-3">Método</th>
                <th className="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d3d]/50">
              {salesFiltradas.slice(0, 15).map((s: any) => (
                <tr key={s.id}>
                  <td className="py-2.5 px-3 text-[#7a95aa] font-mono">{s.fecha_evento || (s.created_at || '').slice(0, 10)}</td>
                  <td className="py-2.5 px-3 font-semibold text-[#dde6ef]">{s.patient_name || s.aseguradora || 'Particular'}</td>
                  <td className="py-2.5 px-3 text-[#dde6ef]">{s.procedimiento || (s.items || [])[0]?.concepto || 'Consulta'}</td>
                  <td className="py-2.5 px-3 text-[#7a95aa]">{s.lugar || 'Consultorio'}</td>
                  <td className="py-2.5 px-3 capitalize text-[#dde6ef]">
                    {s.metodo_pago || 'Efectivo'} {s.facturada ? '(Fact.)' : ''}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold" style={{ color: s.estado === 'cobrado' ? '#00e5a0' : '#f59e0b' }}>
                    {money(s.total)}
                  </td>
                </tr>
              ))}
              {salesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-[#7a95aa]">Sin registros encontrados.</td>
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
// 3. PESTAÑA: GASTOS (SOLO GASTOS)
// ─────────────────────────────────────────────────────────────────────────────
function GastosTab({
  ov,
  expenses,
  reload,
  flash,
  onOpenNuevo,
  esRecepcion = false,
}: {
  ov: any;
  expenses: any[];
  reload: () => void;
  flash: (t: string) => void;
  onOpenNuevo: () => void;
  esRecepcion?: boolean;
}) {
  const ga = ov?.gastos_analisis || {};
  const categorias = ga.categorias || [];
  const hormiga = ga.gastos_hormiga || {};

  const eliminarGasto = async (id: string) => {
    if (!confirm('¿Eliminar este registro de gasto?')) return;
    try {
      await api(`/clinic/expenses/${id}`, { method: 'DELETE' });
      flash('Gasto eliminado');
      reload();
    } catch (e: any) {
      flash(e.message || 'Error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Botón Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0d1520] border border-[#1e2d3d]">
        <div>
          <h2 className="text-lg font-bold text-[#dde6ef]">Gastos</h2>
          <p className="text-xs text-[#7a95aa] mt-0.5">Control de egresos, compras y servicios del consultorio.</p>
        </div>
        <button
          onClick={onOpenNuevo}
          className={`${btnPrimary} bg-[#f43f5e] text-white hover:bg-[#e11d48]`}
        >
          <span className="text-base font-bold">+</span>
          <span>Registrar Gasto</span>
        </button>
      </div>

      {/* Cifras de Gastos */}
      {esRecepcion ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Gastos Registrados por Mí</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#f43f5e] mt-1">
              {money(expenses.reduce((acc, e) => acc + (e.monto || 0), 0))}
            </p>
            <p className="text-[11px] text-[#7a95aa] mt-1">Caja chica / mostrador</p>
          </div>
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Con Factura</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#38bdf8] mt-1">
              {money(expenses.filter(e => e.facturado).reduce((s, e) => s + (e.monto || 0), 0))}
            </p>
            <p className="text-[11px] text-[#7a95aa] mt-1">Comprobante fiscal registrado</p>
          </div>
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Egresos Capturados</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#dde6ef] mt-1">{expenses.length}</p>
            <p className="text-[11px] text-[#7a95aa] mt-1">Registros en el sistema</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Total Gastado</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#f43f5e] mt-1">
              {money(ga.total_gastado || 0)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Gastos Facturados</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#38bdf8] mt-1">
              {money(expenses.filter(e => e.facturado).reduce((s, e) => s + (e.monto || 0), 0))}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#0d1520] border border-[#1e2d3d]">
            <p className="text-[11px] font-mono text-[#7a95aa] uppercase">Compras Menores (≤ $1,500)</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-[#f59e0b] mt-1">
              {money(hormiga.total || 0)}
            </p>
            <p className="text-[11px] text-[#7a95aa] mt-1">{hormiga.conteo || 0} compras</p>
          </div>
        </div>
      )}

      {/* Categorías (Solo para doctor y contabilidad) */}
      {!esRecepcion && (
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#dde6ef]">Desglose de Gastos por Categoría</h3>
          <div className="space-y-2 pt-1">
            {categorias.map((c: any, i: number) => (
              <div key={i} className="p-3 rounded-xl bg-[#111820] border border-[#1e2d3d] flex items-center justify-between text-xs">
                <span className="font-semibold text-[#dde6ef]">{c.nombre}</span>
                <span className="font-mono text-[#f43f5e] font-bold">{money(c.valor)}</span>
              </div>
            ))}
            {categorias.length === 0 && (
              <p className="text-xs text-[#7a95aa] py-3 text-center">Sin gastos registrados.</p>
            )}
          </div>
        </div>
      )}

      {/* Historial de Gastos */}
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#dde6ef]">Historial de Gastos</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#1e2d3d] text-[#7a95aa] font-mono uppercase text-[10px]">
                <th className="py-2 px-3">Fecha</th>
                <th className="py-2 px-3">Concepto</th>
                <th className="py-2 px-3">Proveedor</th>
                <th className="py-2 px-3">Factura</th>
                <th className="py-2 px-3 text-right">Monto</th>
                <th className="py-2 px-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d3d]/50">
              {expenses.map((g: any) => (
                <tr key={g.id}>
                  <td className="py-2.5 px-3 text-[#7a95aa] font-mono">{g.fecha || (g.created_at || '').slice(0, 10)}</td>
                  <td className="py-2.5 px-3 font-semibold text-[#dde6ef]">{g.concepto}</td>
                  <td className="py-2.5 px-3 text-[#7a95aa]">{g.proveedor || '—'}</td>
                  <td className="py-2.5 px-3">
                    {g.facturado ? <span className="text-[#38bdf8]">Facturado</span> : <span className="text-[#7a95aa]">Sin factura</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#f43f5e]">{money(g.monto)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button onClick={() => eliminarGasto(g.id)} className="text-[#f43f5e] hover:opacity-75 p-1 font-bold">×</button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-[#7a95aa]">Sin egresos registrados.</td>
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
// 5. PESTAÑA: SERVICIOS (TARIFAS FIJAS O VARIABLES)
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

  const guardarPrestacion = async () => {
    if (!nombre.trim()) return flash('Indica el nombre del servicio');
    try {
      await api('/clinic/services', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nombre.trim(),
          precio: precioTipo === 'fijo' ? precio : 0,
          precio_tipo: precioTipo,
          categoria,
          orden: services.length + 1,
        }),
      });
      setShowModal(false);
      setNombre('');
      setPrecio(0);
      setPrecioTipo('fijo');
      flash('✓ Servicio registrado');
      reload();
    } catch (e: any) {
      flash(e.message || 'Error');
    }
  };

  const eliminarServicio = async (id: string) => {
    if (!confirm('¿Eliminar este servicio?')) return;
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
          <h2 className="text-lg font-bold text-[#dde6ef]">Servicios</h2>
          <p className="text-xs text-[#7a95aa] mt-0.5">Catálogo de consultas, procedimientos o cirugías con precio fijo o variable.</p>
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
            <div key={s.id} className="p-5 rounded-2xl bg-[#0d1520] border border-[#1e2d3d] flex flex-col justify-between">
              <div>
                <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-[#111820] text-[#7a95aa]">
                  {s.categoria || 'consulta'}
                </span>
                <h4 className="text-base font-bold text-[#dde6ef] mt-2">{s.nombre}</h4>
              </div>

              <div className="pt-4 mt-4 border-t border-[#1e2d3d] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono uppercase text-[#7a95aa]">Precio</p>
                  <p className="text-base font-bold font-mono" style={{ color: isVar ? '#f59e0b' : '#00e5a0' }}>
                    {isVar ? 'Variable' : money(s.precio)}
                  </p>
                </div>
                <button onClick={() => eliminarServicio(s.id)} className="text-[#f43f5e] hover:opacity-75 text-sm p-1">
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[#0d1520] border border-[#00e5a0]/40 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#dde6ef]">Nuevo Servicio</h3>

            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Nombre del Servicio *</label>
              <input
                className={inp}
                placeholder="Ej. Consulta de Valoración, Holter, Cirugía…"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Categoría</label>
                <select className={inp} value={categoria} onChange={e => setCategoria(e.target.value)}>
                  <option value="consulta">Consulta</option>
                  <option value="procedimiento">Procedimiento</option>
                  <option value="cirugia">Cirugía</option>
                  <option value="estudio">Estudio</option>
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
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Precio Fijo ($ MXN)</label>
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

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className={`${btnSecondary} flex-1`}>
                Cancelar
              </button>
              <button onClick={guardarPrestacion} className={`${btnPrimary} bg-[#00e5a0] text-[#051b14] flex-1`}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
