'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSession } from '@/app/lib/auth';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}
async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
  return res.json();
}

const C = { text: '#dde6ef', muted: '#7a95aa', green: '#00e5a0', pink: '#f472b6' };
const btn = 'px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40';
const ICONS: Record<string, string> = { Facebook: '📘', Instagram: '📸', TikTok: '🎵', YouTube: '▶️', Doctoralia: '🩺', Web: '🌐', GoogleNegocio: '📍' };

const ORG = [['seguidores', 'Seguidores'], ['alcance', 'Alcance'], ['vistas', 'Vistas'], ['likes', 'Likes'], ['comentarios', 'Comentarios'], ['compartidos', 'Compartidos']];
const ADS = [['ads_inversion', 'Inversión $'], ['ads_alcance', 'Alcance (ads)'], ['ads_clics', 'Clics'], ['ads_leads', 'Leads']];

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className="text-[10px] text-[#7a95aa] block mb-1">{label}</label>
      <input type="number" value={value || ''} onChange={e => onChange(+e.target.value || 0)}
        className="w-full bg-[#111820] border border-[#1e2d3d] rounded-lg px-2.5 py-2 text-sm text-[#dde6ef] font-mono outline-none focus:border-[#00e5a0]" />
    </div>
  );
}

function PlatformCard({ plat, label, data, onSave }: { plat: string; label: string; data: any; onSave: (plat: string, vals: any) => Promise<void> }) {
  const [v, setV] = useState<any>(data || {});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setV(data || {}); }, [data]);
  const set = (k: string, n: number) => { setV((p: any) => ({ ...p, [k]: n })); setSaved(false); };
  const guardar = async () => { setBusy(true); try { await onSave(plat, v); setSaved(true); setTimeout(() => setSaved(false), 2000); } finally { setBusy(false); } };
  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
      <p className="text-sm font-semibold text-[#dde6ef] mb-3">{ICONS[plat] || '•'} {label}</p>
      <p className="text-[10px] font-mono text-[#00e5a0] tracking-wider mb-2">ORGÁNICO</p>
      <div className="grid grid-cols-3 gap-2 mb-3">{ORG.map(([k, l]) => <NumField key={k} label={l} value={v[k]} onChange={n => set(k, n)} />)}</div>
      <p className="text-[10px] font-mono text-[#f472b6] tracking-wider mb-2">PUBLICIDAD (ADS)</p>
      <div className="grid grid-cols-4 gap-2 mb-4">{ADS.map(([k, l]) => <NumField key={k} label={l} value={v[k]} onChange={n => set(k, n)} />)}</div>
      <div className="flex justify-end">
        <button onClick={guardar} disabled={busy} className={btn} style={{ background: saved ? '#1e2d3d' : C.green, color: saved ? C.green : '#000' }}>{busy ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}</button>
      </div>
    </div>
  );
}

export default function MarketingPage() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [plataformas, setPlataformas] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [data, setData] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api(`/marketing/results?anio=${anio}&mes=${mes}`);
      setPlataformas(r.plataformas || []); setLabels(r.labels || {}); setData(r.resultados || {});
    } catch (e: any) {
      if (/permiso|403/i.test(e.message)) setDenied(true); else setMsg(e.message);
    } finally { setLoading(false); }
  }, [anio, mes]);
  useEffect(() => { load(); }, [load]);

  const save = async (plat: string, vals: any) => {
    await api('/marketing/results', { method: 'POST', body: JSON.stringify({ anio, mes, plataforma: plat, ...vals }) });
  };

  if (denied) return (
    <div className="min-h-screen bg-[#070a0e]"><main className="page-content pt-16 px-6 py-10">
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-10 text-center max-w-md mx-auto">
        <p className="text-4xl mb-3">🔒</p><p className="text-[#dde6ef] font-semibold mb-1">Sin acceso</p>
        <p className="text-sm text-[#7a95aa]">Tu cuenta no tiene permiso para capturar resultados de marketing.</p>
      </div></main></div>
  );

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-serif font-semibold text-[#dde6ef] mb-1">📣 Resultados de marketing</h1>
        <p className="text-[#7a95aa] mb-5 text-sm">Captura cada mes los resultados por plataforma — orgánico y de publicidad. Alimenta el ROI de la clínica.</p>

        <div className="flex items-center gap-2 mb-6">
          <select value={mes} onChange={e => setMes(+e.target.value)} className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2.5 text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0]">
            {MESES.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={anio} onChange={e => setAnio(+e.target.value)} className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2.5 text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0]">
            {[now.getFullYear(), now.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-sm text-[#7a95aa]">Editando <b className="text-[#dde6ef]">{MESES[mes]} {anio}</b></span>
        </div>

        {msg && <div className="mb-4 text-sm px-4 py-2.5 rounded-xl" style={{ background: 'rgba(0,229,160,.1)', border: `1px solid ${C.green}44`, color: C.green }}>{msg}</div>}

        {loading ? <p className="text-sm text-[#7a95aa]">Cargando…</p> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {plataformas.map(p => <PlatformCard key={p} plat={p} label={labels[p] || p} data={data[p]} onSave={save} />)}
          </div>
        )}
      </main>
    </div>
  );
}
