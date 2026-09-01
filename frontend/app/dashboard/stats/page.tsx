'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSession } from '@/app/lib/auth';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type Punto = { nombre: string; valor: number };
type Overview = {
  kpis: {
    total_pacientes: number; total_visitas: number; visitas_mes_actual: number;
    recetas_emitidas: number; edad_promedio: number; imc_promedio: number;
    glucosa_promedio: number; pacientes_con_cirugia: number;
  };
  visitas_por_mes: Punto[];
  distribucion_sexo: Punto[];
  distribucion_edad: Punto[];
  top_sintomas: Punto[];
  top_diagnosticos: Punto[];
  top_medicamentos: Punto[];
  distribucion_protocolo: Punto[];
  cirugias: Punto[];
};

// Paleta del tema
const C = {
  bg: '#070a0e', card: '#0d1520', border: '#1e2d3d', text: '#dde6ef',
  muted: '#7a95aa', faint: '#3d5870',
  green: '#00e5a0', blue: '#0ea5e9', purple: '#a78bfa', amber: '#f59e0b', pink: '#f472b6',
};
const CAT = [C.green, C.blue, C.purple, C.amber, C.pink]; // colores categóricos

// ── Tarjeta contenedora ───────────────────────────────────────────────────────
function Card({ title, subtitle, children, className = '' }:
  { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 ${className}`}>
      <p className="text-sm font-semibold text-[#dde6ef]">{title}</p>
      {subtitle && <p className="text-[11px] text-[#7a95aa] mt-0.5 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

// ── KPI ────────────────────────────────────────────────────────────────────────
function Kpi({ label, value, unit, color = C.green }:
  { label: string; value: number | string; unit?: string; color?: string }) {
  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl px-4 py-3.5">
      <p className="text-[10px] font-mono tracking-wider text-[#7a95aa] uppercase">{label}</p>
      <p className="mt-1 font-bold" style={{ color, fontSize: 26, lineHeight: 1.1 }}>
        {value}{unit && <span className="text-sm text-[#7a95aa] font-normal ml-1">{unit}</span>}
      </p>
    </div>
  );
}

// ── Barras horizontales (categorías con nombres largos) ─────────────────────────
function BarrasH({ data, color = C.green, sufijo = '' }:
  { data: Punto[]; color?: string; sufijo?: string }) {
  if (!data.length) return <p className="text-xs text-[#3d5870]">Sin datos</p>;
  const max = Math.max(...data.map(d => d.valor), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-32 shrink-0 text-right text-xs text-[#dde6ef] truncate" title={d.nombre}>{d.nombre}</div>
          <div className="flex-1 h-6 bg-[#111820] rounded-md overflow-hidden relative">
            <div className="h-full rounded-md transition-all"
              style={{ width: `${(d.valor / max) * 100}%`, background: color, opacity: 0.85 }} />
            <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-mono text-[#dde6ef]">
              {d.valor}{sufijo}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Barras verticales (serie temporal: visitas por mes) ─────────────────────────
function BarrasV({ data, color = C.green }: { data: Punto[]; color?: string }) {
  if (!data.length) return <p className="text-xs text-[#3d5870]">Sin datos</p>;
  const max = Math.max(...data.map(d => d.valor), 1);
  return (
    <div className="flex items-end justify-between gap-2 h-44 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
          <span className="text-[11px] font-mono text-[#dde6ef]">{d.valor}</span>
          <div className="w-full rounded-t-md transition-all"
            style={{ height: `${(d.valor / max) * 100}%`, minHeight: d.valor ? 4 : 0, background: `linear-gradient(180deg, ${color}, ${color}66)` }} />
          <span className="text-[10px] text-[#7a95aa] whitespace-nowrap">{d.nombre}</span>
        </div>
      ))}
    </div>
  );
}

// ── Dona (distribución categórica) ──────────────────────────────────────────────
function Dona({ data }: { data: Punto[] }) {
  const total = data.reduce((s, d) => s + d.valor, 0);
  if (!total) return <p className="text-xs text-[#3d5870]">Sin datos</p>;
  const R = 54, r = 34, cx = 70, cy = 70, C2 = 2 * Math.PI * R;
  let acc = 0;
  const segs = data.map((d, i) => {
    const frac = d.valor / total;
    const seg = { color: CAT[i % CAT.length], dash: frac * C2, offset: acc * C2, pct: Math.round(frac * 100), ...d };
    acc += frac;
    return seg;
  });
  return (
    <div className="flex items-center gap-5">
      <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#111820" strokeWidth={R - r} />
        {segs.map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.color} strokeWidth={R - r}
            strokeDasharray={`${s.dash} ${C2 - s.dash}`} strokeDashoffset={-s.offset}
            transform={`rotate(-90 ${cx} ${cy})`} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill={C.text} fontSize="22" fontWeight="700">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill={C.muted} fontSize="9">total</text>
      </svg>
      <div className="space-y-1.5">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-[#dde6ef]">{s.nombre}</span>
            <span className="text-[#7a95aa] font-mono">{s.valor} · {s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await getSession().catch(() => null);
        const res = await fetch(`${B()}/stats/overview`, {
          headers: s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (e: any) {
        setError(e.message || 'Error al cargar');
      } finally { setLoading(false); }
    })();
  }, []);

  const k = data?.kpis;

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6 gap-2.5">
        <button onClick={() => router.back()} className="text-[#00e5a0] hover:text-white transition">← Volver</button>
        <div className="flex-1" />
        <button onClick={() => router.push('/dashboard')} className="text-[#7a95aa] hover:text-[#dde6ef]">Home</button>
      </header>

      <main className="pt-14">
        <div className="page-content px-6 py-8 max-w-6xl mx-auto">
          <h1 className="text-3xl font-serif font-semibold text-[#dde6ef] mb-1">Estadísticas de la práctica</h1>
          <p className="text-sm text-[#7a95aa] mb-6">Métricas clínicas agregadas — sin datos que identifiquen a los pacientes.</p>

          {loading && <p className="text-[#7a95aa] text-sm">Cargando métricas…</p>}
          {error && <p className="text-[#f43f5e] text-sm">No se pudieron cargar las estadísticas: {error}</p>}

          {data && k && (
            <div className="space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Pacientes" value={k.total_pacientes} />
                <Kpi label="Visitas totales" value={k.total_visitas} color={C.blue} />
                <Kpi label="Visitas este mes" value={k.visitas_mes_actual} color={C.purple} />
                <Kpi label="Recetas emitidas" value={k.recetas_emitidas} color={C.amber} />
                <Kpi label="Edad promedio" value={k.edad_promedio} unit="años" />
                <Kpi label="IMC promedio" value={k.imc_promedio} color={C.blue} />
                <Kpi label="Glucosa prom." value={k.glucosa_promedio} unit="mg/dL" color={C.amber} />
                <Kpi label="Con antec. quirúrgico" value={k.pacientes_con_cirugia} color={C.pink} />
              </div>

              {/* Visitas por mes — ancho completo */}
              <Card title="Visitas por mes" subtitle="Últimos 8 meses">
                <BarrasV data={data.visitas_por_mes} />
              </Card>

              {/* Dos columnas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Medicamentos más recetados" subtitle="Por número de veces prescrito">
                  <BarrasH data={data.top_medicamentos} color={C.green} />
                </Card>
                <Card title="Síntomas más tratados" subtitle="Motivo de consulta">
                  <BarrasH data={data.top_sintomas} color={C.blue} />
                </Card>
                <Card title="Diagnósticos más frecuentes" subtitle="Impresión diagnóstica">
                  <BarrasH data={data.top_diagnosticos} color={C.purple} />
                </Card>
                <Card title="Antecedentes quirúrgicos" subtitle="Cirugías previas en la población">
                  <BarrasH data={data.cirugias} color={C.amber} />
                </Card>
                <Card title="Distribución por sexo">
                  <Dona data={data.distribucion_sexo} />
                </Card>
                <Card title="Mezcla de protocolos" subtitle="Recetas por tipo de abordaje">
                  <Dona data={data.distribucion_protocolo} />
                </Card>
              </div>

              {/* Edad — ancho completo */}
              <Card title="Distribución por edad" subtitle="Pacientes por rango etario">
                <BarrasV data={data.distribucion_edad} color={C.blue} />
              </Card>

              <p className="text-center text-[11px] text-[#3d5870] font-mono pt-2">
                Datos agregados de {k.total_pacientes} pacientes y {k.total_visitas} visitas · APEX
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
