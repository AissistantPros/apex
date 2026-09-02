'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSession } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const money = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-MX');

const C = {
  card: '#0d1520', border: '#1e2d3d', text: '#dde6ef', muted: '#7a95aa', faint: '#3d5870',
  green: '#00e5a0', blue: '#0ea5e9', purple: '#a78bfa', amber: '#f59e0b', pink: '#f472b6', red: '#f43f5e',
};
const CAT = [C.green, C.blue, C.purple, C.amber, C.pink];

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}
async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
  return res.json();
}

// ── Componentes de gráfica (SVG/CSS) ────────────────────────────────────────────
function Kpi({ label, value, color = C.green, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl px-4 py-3.5">
      <p className="text-[10px] font-mono tracking-wider text-[#7a95aa] uppercase">{label}</p>
      <p className="mt-1 font-bold" style={{ color, fontSize: 23, lineHeight: 1.15 }}>{value}</p>
      {hint && <p className="text-[10px] text-[#3d5870] mt-0.5">{hint}</p>}
    </div>
  );
}
function Card({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
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
  if (!data.length) return <p className="text-xs text-[#3d5870]">Sin datos</p>;
  const max = Math.max(...data.map(d => d.valor), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28 shrink-0 text-right text-xs text-[#dde6ef] truncate" title={d.nombre}>{d.nombre}</div>
          <div className="flex-1 h-6 bg-[#111820] rounded-md overflow-hidden relative">
            <div className="h-full rounded-md" style={{ width: `${(d.valor / max) * 100}%`, background: color, opacity: .85 }} />
            <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-mono text-[#dde6ef]">{fmt(d.valor)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
function Dona({ data }: { data: { nombre: string; valor: number }[] }) {
  const total = data.reduce((s, d) => s + d.valor, 0);
  if (!total) return <p className="text-xs text-[#3d5870]">Sin datos</p>;
  const R = 52, cx = 66, cy = 66, C2 = 2 * Math.PI * R; let acc = 0;
  const segs = data.map((d, i) => { const f = d.valor / total; const s = { c: CAT[i % CAT.length], dash: f * C2, off: acc * C2, pct: Math.round(f * 100), ...d }; acc += f; return s; });
  return (
    <div className="flex items-center gap-5">
      <svg width="132" height="132" viewBox="0 0 132 132" className="shrink-0">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#111820" strokeWidth={22} />
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

export default function ClinicPage() {
  const [role, setRole] = useState<'doctor' | 'nurse' | 'receptionist'>('doctor');
  const esRecepcion = role === 'receptionist';
  const [tab, setTab] = useState<'resumen' | 'cobros' | 'gastos' | 'servicios' | 'staff'>('resumen');

  const [ov, setOv] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [o, s, p, ex] = await Promise.all([
        api('/clinic/overview').catch(() => null),
        api('/clinic/services').catch(() => ({ services: [] })),
        api('/clinic/pending').catch(() => ({ pending: [] })),
        api('/clinic/expenses').catch(() => ({ expenses: [] })),
      ]);
      setOv(o); setServices(s.services || []); setPending(p.pending || []); setExpenses(ex.expenses || []);
    } catch (e: any) { setMsg(e.message); }
  }, []);

  useEffect(() => {
    const r = getRole(); setRole(r);
    if (r === 'receptionist') setTab('cobros');
    loadAll();
    fetch(`${B()}/patients/?limit=200`).then(r => r.json()).then(d => setPatients(d.patients || [])).catch(() => {});
    if (r === 'doctor') api('/staff').then(d => setStaff(d.staff || [])).catch(() => {});
  }, [loadAll]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  const TABS = ([
    ['resumen', '📊 Resumen', ['doctor']],
    ['cobros', '💳 Cobros', ['doctor', 'receptionist']],
    ['gastos', '🧾 Gastos', ['doctor', 'receptionist']],
    ['servicios', '⚙️ Servicios', ['doctor']],
    ['staff', '👤 Staff', ['doctor']],
  ] as const).filter(([, , roles]) => (roles as readonly string[]).includes(role));

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-serif font-semibold text-[#dde6ef] mb-1">
          {esRecepcion ? 'Cobros — Recepción' : 'Mi Clínica'}
        </h1>
        <p className="text-sm text-[#7a95aa] mb-5">
          {esRecepcion ? 'Cobra los conceptos que el médico envía y registra ventas y gastos.'
                       : 'Finanzas, ventas, gastos y rendimiento de tu publicidad.'}
        </p>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-6 flex-wrap">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as any)}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold transition"
              style={{ background: tab === id ? C.green : '#111820', color: tab === id ? '#000' : C.muted }}>
              {label}
            </button>
          ))}
        </div>

        {msg && <div className="mb-4 text-sm px-4 py-2.5 rounded-xl" style={{ background: 'rgba(0,229,160,.1)', border: `1px solid ${C.green}44`, color: C.green }}>{msg}</div>}

        {tab === 'resumen' && !esRecepcion && <Resumen ov={ov} />}
        {tab === 'cobros' && <Cobros pending={pending} services={services} patients={patients} reload={loadAll} flash={flash} ov={ov} />}
        {tab === 'gastos' && <Gastos expenses={expenses} reload={loadAll} flash={flash} />}
        {tab === 'servicios' && !esRecepcion && <Servicios services={services} reload={loadAll} flash={flash} />}
        {tab === 'staff' && !esRecepcion && <Staff staff={staff} reload={() => api('/staff').then(d => setStaff(d.staff || []))} flash={flash} />}
      </main>
    </div>
  );
}

// ── RESUMEN (dashboard financiero + ROI) ─────────────────────────────────────────
function Resumen({ ov }: { ov: any }) {
  if (!ov) return <p className="text-[#7a95aa] text-sm">Cargando finanzas…</p>;
  const k = ov.kpis;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Ingreso (8 meses)" value={money(k.ingreso_total)} />
        <Kpi label="Gasto (8 meses)" value={money(k.gasto_total)} color={C.red} />
        <Kpi label="Balance" value={money(k.balance)} color={k.balance >= 0 ? C.green : C.red} hint={k.balance >= 0 ? 'Utilidad' : 'Pérdida'} />
        <Kpi label="Ingreso del mes" value={money(k.ingreso_mes)} color={C.blue} />
        <Kpi label="Ticket promedio" value={money(k.ticket_promedio)} color={C.purple} />
        <Kpi label="Gasto publicidad" value={money(k.gasto_publicidad)} color={C.amber} />
        <Kpi label="% facturado" value={`${k.facturadas_pct}%`} color={C.blue} />
        <Kpi label="Cobros pendientes" value={String(k.cobros_pendientes)} color={C.pink} />
      </div>

      <Card title="Ingresos vs Gastos por mes" subtitle="Verde = ingreso · Rojo = gasto">
        <BarrasIngGasto data={ov.serie_mensual} />
      </Card>

      {/* ROI de marketing — lo más importante para el médico */}
      <Card title="Rendimiento de la publicidad (ROI por canal)"
        subtitle={`${ov.publicidad.pacientes_por_publicidad} de ${ov.publicidad.pacientes_total} pacientes (${ov.publicidad.pct_publicidad}%) llegaron por publicidad de pago · ingreso atribuido ${money(ov.publicidad.ingreso_atribuido)}`}>
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
                        style={{ color: r.roas === null ? C.faint : bueno ? C.green : C.amber, background: (r.roas === null ? C.faint : bueno ? C.green : C.amber) + '1a' }}>
                        {r.roas === null ? '—' : `${r.roas}x`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#3d5870] mt-3">
          ROAS = pesos de ingreso por cada peso invertido. El fee de la agencia se incluye en el gasto total de
          publicidad pero no se atribuye a un canal específico.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Facturado vs no facturado" subtitle="Del ingreso cobrado"><Dona data={ov.facturacion} /></Card>
        <Card title="Origen de pacientes" subtitle="Por canal de captación"><BarrasH data={ov.origen_pacientes} color={C.blue} /></Card>
        <Card title="Gasto por categoría"><BarrasH data={ov.gasto_categorias} color={C.red} fmt={money} /></Card>
        <Card title="Balance mensual" subtitle="Utilidad por mes">
          <BarrasH data={ov.serie_mensual.map((m: any) => ({ nombre: m.nombre, valor: m.balance }))} color={C.green} fmt={money} />
        </Card>
      </div>
    </div>
  );
}

// ── COBROS (handoff médico → recepción) ──────────────────────────────────────────
function Cobros({ pending, services, patients, reload, flash, ov }:
  { pending: any[]; services: any[]; patients: any[]; reload: () => void; flash: (t: string) => void; ov: any }) {
  const [nuevo, setNuevo] = useState(false);
  const [pid, setPid] = useState('');
  const [sel, setSel] = useState<Record<string, number>>({}); // service_id -> cantidad
  const [descuento, setDescuento] = useState(0);
  const [cortesia, setCortesia] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [cobrando, setCobrando] = useState<any>(null);

  const items = Object.entries(sel).filter(([, q]) => q > 0)
    .map(([sid, q]) => { const s = services.find(x => x.id === sid); return s ? { concepto: s.nombre, precio: s.precio, cantidad: q } : null; })
    .filter(Boolean) as any[];
  const subtotal = items.reduce((t, i) => t + i.precio * i.cantidad, 0);
  const total = cortesia ? 0 : Math.max(subtotal - descuento, 0);

  const enviar = async () => {
    if (!items.length) return flash('Agrega al menos un concepto');
    try {
      await api('/clinic/sales', { method: 'POST', body: JSON.stringify({
        patient_id: pid || null, items, descuento, cortesia,
        descuento_motivo: cortesia ? (motivo || 'Cortesía') : (descuento > 0 ? motivo : null), estado: 'pendiente',
      }) });
      setNuevo(false); setSel({}); setPid(''); setDescuento(0); setCortesia(false); setMotivo('');
      flash('Cobro enviado a recepción'); reload();
    } catch (e: any) { flash(e.message); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#7a95aa]">{pending.length} cobro(s) pendiente(s){ov ? ` · ${money(ov.kpis.ingreso_mes)} cobrado este mes` : ''}</p>
        <button onClick={() => setNuevo(v => !v)} className={btn} style={{ background: C.green, color: '#000' }}>
          {nuevo ? 'Cancelar' : '+ Enviar cobro a recepción'}
        </button>
      </div>

      {/* Formulario handoff */}
      {nuevo && (
        <div className="bg-[#0d1520] border border-[#00e5a0]/30 rounded-2xl p-5 space-y-4">
          <p className="text-xs font-mono text-[#00e5a0] tracking-wider">CONCEPTOS A COBRAR</p>
          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] block mb-1.5">PACIENTE (opcional)</label>
            <select className={inp} value={pid} onChange={e => setPid(e.target.value)}>
              <option value="">— Sin paciente / mostrador —</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {services.filter(s => s.activo).map(s => (
              <div key={s.id} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2">
                <div><p className="text-sm text-[#dde6ef]">{s.nombre}</p><p className="text-[11px] text-[#7a95aa] font-mono">{money(s.precio)}</p></div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setSel(p => ({ ...p, [s.id]: Math.max((p[s.id] || 0) - 1, 0) }))} className="w-7 h-7 rounded-lg bg-[#1e2d3d] text-[#dde6ef]">−</button>
                  <span className="w-6 text-center text-sm font-mono text-[#dde6ef]">{sel[s.id] || 0}</span>
                  <button onClick={() => setSel(p => ({ ...p, [s.id]: (p[s.id] || 0) + 1 }))} className="w-7 h-7 rounded-lg" style={{ background: C.green, color: '#000' }}>+</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-[#dde6ef]">
              <input type="checkbox" checked={cortesia} onChange={e => setCortesia(e.target.checked)} /> Cortesía (no cobrar)
            </label>
            {!cortesia && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#7a95aa]">Descuento $</span>
                <input type="number" className={`${inp} w-28`} value={descuento || ''} onChange={e => setDescuento(+e.target.value || 0)} />
              </div>
            )}
            {(cortesia || descuento > 0) && (
              <input className={`${inp} flex-1 min-w-[180px]`} placeholder="Motivo (visible para recepción)" value={motivo} onChange={e => setMotivo(e.target.value)} />
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-[#1e2d3d]">
            <div className="text-sm">
              <span className="text-[#7a95aa]">Subtotal {money(subtotal)}</span>
              <span className="ml-3 font-bold text-[#dde6ef]">Total {money(total)}</span>
            </div>
            <button onClick={enviar} className={btn} style={{ background: C.green, color: '#000' }}>Enviar a recepción</button>
          </div>
        </div>
      )}

      {/* Cola de pendientes */}
      {pending.length === 0 ? (
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-8 text-center">
          <p className="text-3xl mb-2">✓</p><p className="text-sm text-[#7a95aa]">No hay cobros pendientes.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map(v => (
            <div key={v.id} className="bg-[#0d1520] border border-[#f59e0b]/30 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#dde6ef]">{v.patient_name || 'Mostrador'}</p>
                <p className="text-xs text-[#7a95aa] truncate">{(v.items || []).map((i: any) => `${i.concepto}${i.cantidad > 1 ? ` x${i.cantidad}` : ''}`).join(' · ')}</p>
                {v.cortesia && <p className="text-[11px] text-[#f472b6]">Cortesía — {v.descuento_motivo}</p>}
                {!v.cortesia && v.descuento > 0 && <p className="text-[11px] text-[#f59e0b]">Descuento {money(v.descuento)} — {v.descuento_motivo}</p>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold text-[#dde6ef] font-mono">{money(v.total)}</span>
                <button onClick={() => setCobrando(v)} className={btn} style={{ background: C.green, color: '#000' }}>Cobrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {cobrando && <ModalCobro venta={cobrando} onClose={() => setCobrando(null)} done={() => { setCobrando(null); flash('Cobro registrado'); reload(); }} />}
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
        <p className="text-xs text-[#7a95aa] mb-4">{venta.patient_name || 'Mostrador'}</p>
        <label className="text-[10px] font-mono text-[#7a95aa] block mb-1.5">MÉTODO DE PAGO</label>
        <div className="flex gap-2 mb-4">
          {['efectivo', 'tarjeta', 'transferencia'].map(m => (
            <button key={m} onClick={() => setMetodo(m)} className="flex-1 py-2 rounded-xl text-sm font-semibold capitalize"
              style={{ background: metodo === m ? C.green : '#111820', color: metodo === m ? '#000' : C.muted }}>{m}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-[#dde6ef] mb-5">
          <input type="checkbox" checked={factura} onChange={e => setFactura(e.target.checked)} /> Requiere factura
        </label>
        <div className="flex gap-2">
          <button onClick={onClose} className={`${btn} flex-1`} style={{ background: '#1e2d3d', color: C.text }}>Cancelar</button>
          <button onClick={cobrar} disabled={busy} className={`${btn} flex-1`} style={{ background: C.green, color: '#000' }}>{busy ? '…' : 'Confirmar cobro'}</button>
        </div>
      </div>
    </div>
  );
}

// ── GASTOS ───────────────────────────────────────────────────────────────────────
function Gastos({ expenses, reload, flash }: { expenses: any[]; reload: () => void; flash: (t: string) => void }) {
  const [cat, setCat] = useState('insumos');
  const [canal, setCanal] = useState('Meta');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState(0);
  const [proveedor, setProveedor] = useState('');
  const CATS = ['publicidad', 'sueldos', 'renta', 'internet', 'seguros', 'insumos', 'otros'];
  const guardar = async () => {
    if (!monto) return flash('Indica el monto');
    try {
      await api('/clinic/expenses', { method: 'POST', body: JSON.stringify({
        categoria: cat, canal: cat === 'publicidad' ? canal : null, concepto, monto, proveedor,
      }) });
      setConcepto(''); setMonto(0); setProveedor(''); flash('Gasto registrado'); reload();
    } catch (e: any) { flash(e.message); }
  };
  return (
    <div className="space-y-5">
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-3">
        <p className="text-xs font-mono text-[#00e5a0] tracking-wider">REGISTRAR GASTO</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select className={inp} value={cat} onChange={e => setCat(e.target.value)}>
            {CATS.map(c => <option key={c} value={c} className="capitalize">{c[0].toUpperCase() + c.slice(1)}</option>)}
          </select>
          {cat === 'publicidad' && (
            <select className={inp} value={canal} onChange={e => setCanal(e.target.value)}>
              {['Meta', 'Google', 'Doctoralia', 'TikTok', 'Agencia'].map(c => <option key={c}>{c}</option>)}
            </select>
          )}
          <input className={inp} placeholder="Concepto" value={concepto} onChange={e => setConcepto(e.target.value)} />
          <input className={inp} type="number" placeholder="Monto $" value={monto || ''} onChange={e => setMonto(+e.target.value || 0)} />
          <input className={inp} placeholder="Proveedor" value={proveedor} onChange={e => setProveedor(e.target.value)} />
        </div>
        <button onClick={guardar} className={btn} style={{ background: C.green, color: '#000' }}>Registrar gasto</button>
      </div>
      <div className="space-y-1.5">
        {expenses.map(e => (
          <div key={e.id} className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl px-4 py-2.5 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm text-[#dde6ef] truncate">{e.concepto || e.categoria}{e.canal ? ` · ${e.canal}` : ''}</p>
              <p className="text-[11px] text-[#7a95aa]">{e.fecha} · <span className="capitalize">{e.categoria}</span>{e.proveedor ? ` · ${e.proveedor}` : ''}</p>
            </div>
            <span className="font-mono text-sm text-[#f43f5e]">{money(e.monto)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SERVICIOS (config) ───────────────────────────────────────────────────────────
function Servicios({ services, reload, flash }: { services: any[]; reload: () => void; flash: (t: string) => void }) {
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState(0);
  const add = async () => {
    if (!nombre || !precio) return flash('Nombre y precio requeridos');
    try { await api('/clinic/services', { method: 'POST', body: JSON.stringify({ nombre, precio, orden: services.length + 1 }) }); setNombre(''); setPrecio(0); flash('Servicio agregado'); reload(); }
    catch (e: any) { flash(e.message); }
  };
  const del = async (id: string) => { try { await api(`/clinic/services/${id}`, { method: 'DELETE' }); reload(); } catch (e: any) { flash(e.message); } };
  const price = async (s: any, nuevo: number) => { try { await api(`/clinic/services/${s.id}`, { method: 'PUT', body: JSON.stringify({ nombre: s.nombre, precio: nuevo, activo: s.activo, orden: s.orden }) }); reload(); } catch { } };
  return (
    <div className="space-y-5">
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
        <p className="text-xs font-mono text-[#00e5a0] tracking-wider mb-3">SERVICIOS Y PRECIOS</p>
        <div className="flex gap-2 mb-4">
          <input className={inp} placeholder="Nombre del servicio" value={nombre} onChange={e => setNombre(e.target.value)} />
          <input className={`${inp} w-32`} type="number" placeholder="Precio $" value={precio || ''} onChange={e => setPrecio(+e.target.value || 0)} />
          <button onClick={add} className={btn} style={{ background: C.green, color: '#000' }}>Agregar</button>
        </div>
        <div className="space-y-1.5">
          {services.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2">
              <span className="text-sm text-[#dde6ef]">{s.nombre}</span>
              <div className="flex items-center gap-2">
                <span className="text-[#7a95aa] text-xs">$</span>
                <input type="number" defaultValue={s.precio} onBlur={e => { const v = +e.target.value; if (v !== s.precio) price(s, v); }}
                  className="w-24 bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-2 py-1 text-sm text-[#dde6ef] font-mono outline-none focus:border-[#00e5a0]" />
                <button onClick={() => del(s.id)} className="text-[#f43f5e] text-lg leading-none px-1">×</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── STAFF (recepcionistas) ───────────────────────────────────────────────────────
function Staff({ staff, reload, flash }: { staff: any[]; reload: () => void; flash: (t: string) => void }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!nombre || !email || password.length < 6) return flash('Nombre, correo y contraseña (mín. 6) requeridos');
    setBusy(true);
    try { await api('/staff', { method: 'POST', body: JSON.stringify({ nombre, email, password }) }); setNombre(''); setEmail(''); setPassword(''); flash('Recepcionista creada'); reload(); }
    catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };
  const del = async (id: string) => { if (!confirm('¿Eliminar esta cuenta de recepción?')) return; try { await api(`/staff/${id}`, { method: 'DELETE' }); reload(); } catch (e: any) { flash(e.message); } };
  return (
    <div className="space-y-5">
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
        <p className="text-xs font-mono text-[#00e5a0] tracking-wider mb-1">DAR DE ALTA RECEPCIÓN</p>
        <p className="text-[11px] text-[#7a95aa] mb-3">La recepcionista entra con su propio correo y contraseña. Solo ve la pantalla de cobros — nunca los diagnósticos.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <input className={inp} placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
          <input className={inp} placeholder="Correo" value={email} onChange={e => setEmail(e.target.value)} />
          <input className={inp} type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <button onClick={add} disabled={busy} className={btn} style={{ background: C.green, color: '#000' }}>{busy ? 'Creando…' : 'Crear cuenta de recepción'}</button>
      </div>
      <div className="space-y-1.5">
        {staff.length === 0 && <p className="text-sm text-[#3d5870] text-center py-4">Aún no hay recepcionistas.</p>}
        {staff.map(s => (
          <div key={s.id} className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl px-4 py-3 flex items-center justify-between">
            <div><p className="text-sm text-[#dde6ef]">{s.display_name}</p><p className="text-[11px] text-[#7a95aa]">{s.email} · Recepción</p></div>
            <button onClick={() => del(s.id)} className="text-[#f43f5e] text-lg leading-none px-1">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
