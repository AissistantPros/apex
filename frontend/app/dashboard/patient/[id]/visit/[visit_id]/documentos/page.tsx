'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSession } from '@/app/lib/auth';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const hoy = () => new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

async function api(path: string, opts: RequestInit = {}) {
  const s = await getSession().catch(() => null);
  const res = await fetch(`${B()}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}), ...(opts.headers || {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
  return res.json();
}

type Med = { nombre_generico?: string; nombre_comercial?: string; presentacion?: string; dosis?: string; via?: string; frecuencia?: string; duracion?: string; indicacion?: string };

const C = { text: '#dde6ef', muted: '#7a95aa', green: '#00e5a0', border: '#1e2d3d', card: '#0d1520' };
const inp = 'w-full bg-[#111820] border border-[#1e2d3d] rounded-lg px-2.5 py-2 text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0]';
const btn = 'px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40';

export default function DocumentosPage() {
  const { id, visit_id } = useParams<{ id: string; visit_id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Selección + contenido editable
  const [incReceta, setIncReceta] = useState(false);
  const [incReporte, setIncReporte] = useState(false);
  const [incEstudios, setIncEstudios] = useState(false);
  const [receta, setReceta] = useState<Med[]>([]);
  const [reporte, setReporte] = useState('');
  const [estudios, setEstudios] = useState<string[]>([]);
  const [indicaciones, setIndicaciones] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api(`/analyze/${visit_id}/documents`);
      setData(d);
      setReceta(d.receta || []);
      setReporte(d.reporte_sugerido || '');
      setEstudios(d.estudios || []);
      setIncReceta(!!d.disponibles?.receta);
      setIncReporte(!!d.disponibles?.reporte);
      setIncEstudios(!!d.disponibles?.estudios);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [visit_id]);
  useEffect(() => { load(); }, [load]);

  const lh = data?.letterhead || {};
  const pac = data?.patient || {};
  const nada = !incReceta && !incReporte && !incEstudios;

  const setMed = (i: number, k: keyof Med, v: string) => setReceta(r => r.map((m, j) => j === i ? { ...m, [k]: v } : m));
  const delMed = (i: number) => setReceta(r => r.filter((_, j) => j !== i));
  const addMed = () => setReceta(r => [...r, { nombre_generico: '', presentacion: '', dosis: '', via: 'Oral', frecuencia: '', duracion: '' }]);
  const setEst = (i: number, v: string) => setEstudios(e => e.map((x, j) => j === i ? v : x));
  const delEst = (i: number) => setEstudios(e => e.filter((_, j) => j !== i));
  const addEst = () => setEstudios(e => [...e, '']);

  if (loading) return <div className="min-h-screen bg-[#070a0e] flex items-center justify-center text-[#7a95aa]">Cargando documentos…</div>;

  return (
    <div className="min-h-screen bg-[#070a0e]">
      {/* barra superior (no se imprime) */}
      <header className="no-print fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] flex items-center px-6 gap-3">
        <button onClick={() => router.push(`/dashboard/patient/${id}`)} className="text-[#00e5a0] hover:text-white">← Ficha</button>
        <div className="flex-1" />
        <button onClick={() => window.print()} disabled={nada} className={btn} style={{ background: C.green, color: '#000' }}>🖨️ Imprimir / PDF</button>
        <button disabled title="Disponible cuando se configure el correo" className={btn} style={{ background: '#1e2d3d', color: C.muted }}>✉️ Enviar por correo</button>
      </header>

      <main className="pt-14">
        {error && <p className="text-center text-[#f43f5e] py-6">{error}</p>}
        <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">

          {/* Panel de control (no se imprime) */}
          <div className="no-print space-y-4">
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4">
              <p className="text-xs font-mono text-[#00e5a0] tracking-wider mb-3">¿QUÉ ENTREGAR?</p>
              {[
                ['Receta médica', incReceta, setIncReceta, data?.disponibles?.receta, `${receta.length} medicamento(s)`],
                ['Reporte al paciente', incReporte, setIncReporte, true, 'Diagnóstico, consejos, dieta'],
                ['Solicitud de estudios', incEstudios, setIncEstudios, true, `${estudios.length} estudio(s)`],
              ].map(([label, val, set, avail, sub]: any, i) => (
                <label key={i} className="flex items-start gap-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="mt-1" />
                  <div>
                    <p className="text-sm text-[#dde6ef]">{label}{!avail && <span className="text-[10px] text-[#f59e0b] ml-2">sin contenido auto</span>}</p>
                    <p className="text-[11px] text-[#7a95aa]">{sub}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Edición receta */}
            {incReceta && (
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4">
                <p className="text-xs font-mono text-[#00e5a0] tracking-wider mb-2">RECETA</p>
                <div className="space-y-3">
                  {receta.map((m, i) => (
                    <div key={i} className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-2.5 space-y-1.5">
                      <div className="flex gap-1.5">
                        <input className={inp} placeholder="Medicamento" value={m.nombre_generico || ''} onChange={e => setMed(i, 'nombre_generico', e.target.value)} />
                        <button onClick={() => delMed(i)} className="text-[#f43f5e] px-1">×</button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input className={inp} placeholder="Presentación" value={m.presentacion || ''} onChange={e => setMed(i, 'presentacion', e.target.value)} />
                        <input className={inp} placeholder="Dosis" value={m.dosis || ''} onChange={e => setMed(i, 'dosis', e.target.value)} />
                        <input className={inp} placeholder="Vía" value={m.via || ''} onChange={e => setMed(i, 'via', e.target.value)} />
                        <input className={inp} placeholder="Frecuencia" value={m.frecuencia || ''} onChange={e => setMed(i, 'frecuencia', e.target.value)} />
                      </div>
                      <input className={inp} placeholder="Duración" value={m.duracion || ''} onChange={e => setMed(i, 'duracion', e.target.value)} />
                    </div>
                  ))}
                  <button onClick={addMed} className="text-[#00e5a0] text-xs">+ Agregar medicamento</button>
                </div>
                <textarea className={`${inp} mt-3`} rows={2} placeholder="Indicaciones generales (ayuno, horarios…)" value={indicaciones} onChange={e => setIndicaciones(e.target.value)} />
              </div>
            )}

            {/* Edición reporte */}
            {incReporte && (
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4">
                <p className="text-xs font-mono text-[#00e5a0] tracking-wider mb-2">REPORTE AL PACIENTE</p>
                <textarea className={inp} rows={10} placeholder="Diagnóstico, recomendaciones, dieta, consejos…" value={reporte} onChange={e => setReporte(e.target.value)} />
              </div>
            )}

            {/* Edición estudios */}
            {incEstudios && (
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4">
                <p className="text-xs font-mono text-[#00e5a0] tracking-wider mb-2">ESTUDIOS SOLICITADOS</p>
                <div className="space-y-1.5">
                  {estudios.map((e, i) => (
                    <div key={i} className="flex gap-1.5">
                      <input className={inp} value={e} onChange={ev => setEst(i, ev.target.value)} placeholder="Estudio / análisis" />
                      <button onClick={() => delEst(i)} className="text-[#f43f5e] px-1">×</button>
                    </div>
                  ))}
                  <button onClick={addEst} className="text-[#00e5a0] text-xs">+ Agregar estudio</button>
                </div>
              </div>
            )}
          </div>

          {/* Previsualización (esto se imprime) */}
          <div className="print-area">
            {nada && <div className="no-print bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-10 text-center text-[#7a95aa]">Selecciona al menos un documento para previsualizar.</div>}
            {incReceta && <Hoja lh={lh} pac={pac} titulo="Receta médica">
              <RecetaBody receta={receta} indicaciones={indicaciones} />
            </Hoja>}
            {incReporte && <Hoja lh={lh} pac={pac} titulo="Reporte para el paciente">
              <p className="whitespace-pre-wrap leading-relaxed text-[13px]">{reporte || '—'}</p>
            </Hoja>}
            {incEstudios && <Hoja lh={lh} pac={pac} titulo="Solicitud de estudios">
              <ul className="list-disc pl-5 space-y-1 text-[13px]">
                {estudios.filter(Boolean).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </Hoja>}
          </div>
        </div>
      </main>

      {/* Estilos de impresión */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-area { margin: 0 !important; }
          .hoja { box-shadow: none !important; border: none !important; page-break-after: always; margin: 0 !important; }
          .hoja:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

// Hoja tamaño carta con membrete
function Hoja({ lh, pac, titulo, children }: { lh: any; pac: any; titulo: string; children: React.ReactNode }) {
  return (
    <div className="hoja bg-white text-[#1a1a1a] rounded-lg shadow-xl mx-auto mb-6 p-10" style={{ width: '100%', maxWidth: 720, minHeight: 900 }}>
      {/* Membrete */}
      <div className="flex items-start justify-between border-b-2 pb-4 mb-5" style={{ borderColor: '#0d9488' }}>
        <div className="flex items-center gap-3">
          {lh.logo_url ? <img src={lh.logo_url} alt="logo" style={{ height: 56 }} /> :
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ background: '#0d9488' }}>{(lh.clinica || 'A')[0]}</div>}
          <div>
            <p className="font-bold text-lg leading-tight" style={{ color: '#0d9488' }}>{lh.clinica || 'Clínica'}</p>
            <p className="text-sm font-semibold">{lh.profesional || 'Médico'}</p>
            <p className="text-xs text-gray-600">{lh.especialidad || ''}</p>
          </div>
        </div>
        <div className="text-right text-[10px] text-gray-600 leading-snug">
          {lh.cedula_profesional && <p>Céd. Prof. {lh.cedula_profesional}</p>}
          {lh.cedula_especialidad && <p>Céd. Esp. {lh.cedula_especialidad}</p>}
          {lh.universidad && <p className="max-w-[180px]">{lh.universidad}</p>}
        </div>
      </div>

      {/* Título + paciente */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold uppercase tracking-wide" style={{ color: '#0d9488' }}>{titulo}</h2>
        <p className="text-xs text-gray-600">{hoy()}</p>
      </div>
      <div className="bg-gray-50 rounded-lg px-4 py-2 mb-5 text-[13px]">
        <span className="font-semibold">Paciente:</span> {pac.nombre || '—'}
        {pac.edad != null && <span className="text-gray-600"> · {pac.edad} años</span>}
        {pac.sexo && <span className="text-gray-600"> · {pac.sexo}</span>}
      </div>

      {/* Contenido */}
      <div style={{ minHeight: 380 }}>{children}</div>

      {/* Firma + pie */}
      <div className="mt-12 flex flex-col items-center">
        <div className="w-56 border-t border-gray-400 pt-1 text-center">
          <p className="text-sm font-semibold">{lh.profesional}</p>
          <p className="text-[10px] text-gray-600">Céd. Prof. {lh.cedula_profesional}</p>
        </div>
      </div>
      <div className="mt-6 border-t pt-3 text-center text-[10px] text-gray-500 leading-snug">
        {lh.direccion && <p>{lh.direccion} · {lh.ciudad}</p>}
        <p>{[lh.telefono && `Tel. ${lh.telefono}`, lh.whatsapp && `WhatsApp ${lh.whatsapp}`, lh.website, lh.email].filter(Boolean).join('  ·  ')}</p>
      </div>
    </div>
  );
}

function RecetaBody({ receta, indicaciones }: { receta: Med[]; indicaciones: string }) {
  return (
    <div>
      <p className="text-2xl font-serif mb-4" style={{ color: '#0d9488' }}>℞</p>
      <div className="space-y-4">
        {receta.filter(m => m.nombre_generico).map((m, i) => (
          <div key={i} className="flex gap-3">
            <span className="font-bold text-gray-400">{i + 1}.</span>
            <div className="text-[13px]">
              <p className="font-semibold">{m.nombre_generico}{m.nombre_comercial ? ` (${m.nombre_comercial})` : ''} {m.presentacion}</p>
              <p className="text-gray-700">
                {[m.dosis, m.via, m.frecuencia].filter(Boolean).join(' · ')}
                {m.duracion ? ` — ${m.duracion}` : ''}
              </p>
              {m.indicacion && <p className="text-gray-500 text-xs italic">{m.indicacion}</p>}
            </div>
          </div>
        ))}
      </div>
      {indicaciones && (
        <div className="mt-6 text-[12px] text-gray-700">
          <p className="font-semibold mb-1">Indicaciones:</p>
          <p className="whitespace-pre-wrap">{indicaciones}</p>
        </div>
      )}
    </div>
  );
}
