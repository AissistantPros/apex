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

type Med = {
  tipo?: string; nombre_generico?: string; nombre_comercial?: string; presentacion?: string;
  dosis?: string; via?: string; frecuencia?: string; duracion?: string; indicacion?: string;
  para_que_sirve?: string; cofepris?: string; momento?: string;
  // Campos de péptidos / terapias avanzadas
  nombre?: string; para_que?: string; como_se_usa?: string; por_que_encaja?: string; disclaimer?: string;
};
type Dx = { nombre?: string; confianza?: number; resumen?: string };
type Plan = { proxima_revision?: string; criterios_exito?: string; senales_alarma?: string; plan_por_fases?: any[] };

const C = { text: '#dde6ef', muted: '#7a95aa', green: '#00e5a0', border: '#1e2d3d', card: '#0d1520' };
const inp = 'w-full bg-[#111820] border border-[#1e2d3d] rounded-lg px-2.5 py-2 text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0]';
const btn = 'px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40';

const MED_TEAL = '#0d9488';

export default function DocumentosPage() {
  const { id, visit_id } = useParams<{ id: string; visit_id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);

  // Selección + contenido editable
  const [incReceta, setIncReceta] = useState(false);
  const [incReporte, setIncReporte] = useState(false);
  const [incEstudios, setIncEstudios] = useState(false);
  const [receta, setReceta] = useState<Med[]>([]);
  const [estudios, setEstudios] = useState<string[]>([]);
  const [indicaciones, setIndicaciones] = useState('');
  // Reporte del paciente (visual). Se puede editar la nota personal del médico.
  const [notaMedico, setNotaMedico] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api(`/analyze/${visit_id}/documents`);
      setData(d);
      setReceta(d.receta || []);
      setEstudios(d.estudios || []);
      setIncReceta(!!d.disponibles?.receta);
      setIncReporte(!!d.disponibles?.reporte);
      setIncEstudios(!!d.disponibles?.estudios);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [visit_id]);
  useEffect(() => { load(); }, [load]);

  // Terminar visita: saca al paciente de la sala de espera y regresa a home.
  const terminarVisita = useCallback(async () => {
    setFinishing(true);
    try {
      await api(`/patients/${id}`, { method: 'PUT', body: JSON.stringify({ registration_phase: 'complete' }) });
    } catch { /* best-effort */ }
    try { localStorage.removeItem(`apex_analysis_draft_${visit_id}`); } catch { /* sin storage */ }
    router.push('/dashboard');
  }, [id, router, visit_id]);

  const lh = data?.letterhead || {};
  const pac = data?.patient || {};
  const habitos: Med[] = data?.habitos || [];
  const avanzados: Med[] = data?.avanzados || [];
  const diagnosticos: Dx[] = data?.diagnosticos || [];
  const explicacion: string = data?.explicacion_paciente || '';
  const plan: Plan = data?.plan || {};
  const nada = !incReceta && !incReporte && !incEstudios;

  const setMed = (i: number, k: keyof Med, v: string) => setReceta(r => r.map((m, j) => j === i ? { ...m, [k]: v } : m));
  const delMed = (i: number) => setReceta(r => r.filter((_, j) => j !== i));
  const addMed = () => setReceta(r => [...r, { nombre_generico: '', presentacion: '', dosis: '', via: 'Oral', frecuencia: '', duracion: '' }]);
  const setEst = (i: number, v: string) => setEstudios(e => e.map((x, j) => j === i ? v : x));
  const delEst = (i: number) => setEstudios(e => e.filter((_, j) => j !== i));
  const addEst = () => setEstudios(e => [...e, '']);

  if (loading) return <div className="min-h-screen bg-[#070a0e] flex items-center justify-center text-[#7a95aa]">Cargando documentos…</div>;

  const pieId = `${pac.nombre || 'Paciente'} · ${lh.clinica || 'APEX'} · ${hoy()}`;

  return (
    <div className="min-h-screen bg-[#070a0e]">
      {/* barra superior (no se imprime) */}
      <header className="no-print fixed top-0 left-0 right-0 h-14 z-50 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] flex items-center px-6 gap-3">
        <button onClick={() => router.push(`/dashboard/patient/${id}`)} className="text-[#00e5a0] hover:text-white">← Ficha</button>
        <div className="flex-1" />
        <div className="apex-chat-slot flex items-center mr-2" />
        <button onClick={() => window.print()} disabled={nada} className={btn} style={{ background: C.green, color: '#000' }}>🖨️ Imprimir / PDF</button>
        <button disabled title="Disponible cuando se configure el correo" className={btn} style={{ background: '#1e2d3d', color: C.muted }}>✉️ Enviar por correo</button>
        <button onClick={terminarVisita} disabled={finishing} className={btn} style={{ background: '#0d9488', color: '#fff' }}>{finishing ? 'Cerrando…' : '✓ Terminar visita'}</button>
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
                ['Reporte al paciente', incReporte, setIncReporte, true, 'Visual: diagnóstico, cómo tomar el tratamiento, hábitos, plan'],
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
                        <input className={inp} placeholder="Presentación / concentración" value={m.presentacion || ''} onChange={e => setMed(i, 'presentacion', e.target.value)} />
                        <input className={inp} placeholder="Dosis" value={m.dosis || ''} onChange={e => setMed(i, 'dosis', e.target.value)} />
                        <input className={inp} placeholder="Vía" value={m.via || ''} onChange={e => setMed(i, 'via', e.target.value)} />
                        <input className={inp} placeholder="Frecuencia / horario" value={m.frecuencia || ''} onChange={e => setMed(i, 'frecuencia', e.target.value)} />
                      </div>
                      <input className={inp} placeholder="Duración" value={m.duracion || ''} onChange={e => setMed(i, 'duracion', e.target.value)} />
                    </div>
                  ))}
                  <button onClick={addMed} className="text-[#00e5a0] text-xs">+ Agregar medicamento</button>
                </div>
                <textarea className={`${inp} mt-3`} rows={2} placeholder="Indicaciones generales (ayuno, horarios…)" value={indicaciones} onChange={e => setIndicaciones(e.target.value)} />
              </div>
            )}

            {/* Nota personal del médico para el reporte del paciente */}
            {incReporte && (
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4">
                <p className="text-xs font-mono text-[#00e5a0] tracking-wider mb-2">NOTA PARA EL PACIENTE (opcional)</p>
                <p className="text-[11px] text-[#7a95aa] mb-2">El reporte visual se arma solo con el diagnóstico, tratamiento, hábitos y plan. Aquí puedes añadir un mensaje personal.</p>
                <textarea className={inp} rows={4} placeholder="Ej. Nos vemos en 4 semanas. Cualquier duda, escríbeme…" value={notaMedico} onChange={e => setNotaMedico(e.target.value)} />
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

            <button onClick={terminarVisita} disabled={finishing}
              className="w-full px-4 py-3 rounded-2xl text-sm font-bold transition disabled:opacity-40"
              style={{ background: '#0d9488', color: '#fff' }}>
              {finishing ? 'Cerrando visita…' : '✓ Terminar visita y volver al inicio'}
            </button>
          </div>

          {/* Previsualización (esto se imprime) */}
          <div className="print-area">
            {nada && <div className="no-print bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-10 text-center text-[#7a95aa]">Selecciona al menos un documento para previsualizar.</div>}

            {incReceta && (
              <Hoja lh={lh} pac={pac} titulo="Receta médica">
                <RecetaBody receta={receta} indicaciones={indicaciones} />
              </Hoja>
            )}

            {incReporte && (
              <Hoja lh={lh} pac={pac} titulo="Reporte para el paciente">
                <ReporteBody diagnosticos={diagnosticos} explicacion={explicacion}
                  receta={receta} avanzados={avanzados} habitos={habitos} estudios={estudios} plan={plan} nota={notaMedico} />
              </Hoja>
            )}

            {incEstudios && (
              <Hoja lh={lh} pac={pac} titulo="Solicitud de estudios">
                <EstudiosBody estudios={estudios} />
              </Hoja>
            )}
          </div>
        </div>
      </main>

      {/* Pie que se repite en CADA página impresa (mantiene relacionadas las hojas). */}
      <div className="print-footer">{pieId}</div>

      {/* Estilos de impresión: tamaño carta, saltos de página, pie repetido.
          Se usa <style> plano (no styled-jsx) para no arriesgar el scoping de @page. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .print-footer { display: none; }
        @media print {
          @page { size: letter; margin: 14mm 14mm 18mm; }
          html, body { background: #fff !important; height: auto !important; }
          /* Anular alturas de contenedores que impedirían la paginación */
          .min-h-screen { min-height: 0 !important; }
          .no-print { display: none !important; }
          main, .print-area { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
          .hoja {
            box-shadow: none !important; border: none !important; border-radius: 0 !important;
            width: 100% !important; max-width: none !important; min-height: 0 !important;
            margin: 0 !important; padding: 0 !important;
          }
          .hoja + .hoja { page-break-before: always; break-before: page; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .print-footer {
            display: block; position: fixed; bottom: 4mm; left: 0; right: 0;
            text-align: center; font-size: 8px; color: #9aa4ad;
            border-top: 1px solid #e5e7eb; padding-top: 3px;
          }
        }
      ` }} />
    </div>
  );
}

// Hoja tamaño carta con membrete
function Hoja({ lh, pac, titulo, children }: { lh: any; pac: any; titulo: string; children: React.ReactNode }) {
  return (
    <div className="hoja bg-white text-[#1a1a1a] rounded-lg shadow-xl mx-auto mb-6 p-10"
      style={{ width: '100%', maxWidth: 816 }}>
      {/* Membrete */}
      <div className="avoid-break flex items-start justify-between border-b-2 pb-4 mb-5" style={{ borderColor: MED_TEAL }}>
        <div className="flex items-center gap-3">
          {lh.logo_url ? <img src={lh.logo_url} alt="logo" style={{ height: 56 }} /> :
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ background: MED_TEAL }}>{(lh.clinica || 'A')[0]}</div>}
          <div>
            <p className="font-bold text-lg leading-tight" style={{ color: MED_TEAL }}>{lh.clinica || 'Clínica'}</p>
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
      <div className="avoid-break flex items-center justify-between mb-4">
        <h2 className="text-base font-bold uppercase tracking-wide" style={{ color: MED_TEAL }}>{titulo}</h2>
        <p className="text-xs text-gray-600">{hoy()}</p>
      </div>
      <div className="avoid-break bg-gray-50 rounded-lg px-4 py-2 mb-5 text-[13px]">
        <span className="font-semibold">Paciente:</span> {pac.nombre || '—'}
        {pac.edad != null && <span className="text-gray-600"> · {pac.edad} años</span>}
        {pac.sexo && <span className="text-gray-600"> · {pac.sexo}</span>}
      </div>

      {/* Contenido */}
      <div>{children}</div>

      {/* Firma */}
      <div className="avoid-break mt-12 flex flex-col items-center">
        <div className="w-56 border-t border-gray-400 pt-1 text-center">
          <p className="text-sm font-semibold">{lh.profesional}</p>
          <p className="text-[10px] text-gray-600">Céd. Prof. {lh.cedula_profesional}</p>
        </div>
      </div>
      <div className="avoid-break mt-6 border-t pt-3 text-center text-[10px] text-gray-500 leading-snug">
        {lh.direccion && <p>{lh.direccion} · {lh.ciudad}</p>}
        <p>{[lh.telefono && `Tel. ${lh.telefono}`, lh.whatsapp && `WhatsApp ${lh.whatsapp}`, lh.website, lh.email].filter(Boolean).join('  ·  ')}</p>
      </div>
    </div>
  );
}

// ── Receta clínica (para el médico/farmacia) ─────────────────────────────────
function RecetaBody({ receta, indicaciones }: { receta: Med[]; indicaciones: string }) {
  return (
    <div>
      <p className="text-2xl font-serif mb-4" style={{ color: MED_TEAL }}>℞</p>
      <div className="space-y-4">
        {receta.filter(m => m.nombre_generico).map((m, i) => (
          <div key={i} className="avoid-break flex gap-3">
            <span className="font-bold text-gray-400">{i + 1}.</span>
            <div className="text-[13px]">
              <p className="font-semibold">
                {m.nombre_generico}{m.nombre_comercial ? ` (${m.nombre_comercial})` : ''} {m.presentacion}
                {m.cofepris === 'no_aprobado' && <span className="ml-2 text-[9px] text-amber-700 border border-amber-300 rounded px-1 py-0.5 align-middle">no aprobado COFEPRIS</span>}
              </p>
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
        <div className="avoid-break mt-6 text-[12px] text-gray-700">
          <p className="font-semibold mb-1">Indicaciones:</p>
          <p className="whitespace-pre-wrap">{indicaciones}</p>
        </div>
      )}
    </div>
  );
}

// ── Solicitud de estudios ────────────────────────────────────────────────────
function EstudiosBody({ estudios }: { estudios: string[] }) {
  const items = estudios.filter(Boolean);
  if (!items.length) return <p className="text-[13px] text-gray-500">Sin estudios solicitados en esta visita.</p>;
  return (
    <div className="space-y-2">
      {items.map((e, i) => (
        <div key={i} className="avoid-break flex items-center gap-3 text-[13px] border border-gray-200 rounded-lg px-3 py-2">
          <span className="inline-block w-4 h-4 border-2 rounded" style={{ borderColor: MED_TEAL }} />
          <span>{e}</span>
        </div>
      ))}
    </div>
  );
}

// ── Reporte VISUAL para el paciente ──────────────────────────────────────────
const SECTION = (color: string) => ({ borderLeft: `4px solid ${color}`, background: `${color}0d` });

function SectionTitle({ icon, children, color }: { icon: string; children: React.ReactNode; color: string }) {
  return (
    <div className="avoid-break flex items-center gap-2 mt-6 mb-3">
      <span className="text-lg">{icon}</span>
      <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color }}>{children}</h3>
    </div>
  );
}

const VIA_ICON: Record<string, string> = { oral: '💊', 'sublingual': '💊', 'inhalada': '🌬️', 'inyectable': '💉', 'subcutánea': '💉', 'intramuscular': '💉', 'tópica': '🧴' };

function MedCard({ m }: { m: Med }) {
  const via = (m.via || '').toLowerCase();
  const icon = VIA_ICON[via] || '💊';
  const noAprob = m.cofepris === 'no_aprobado';
  return (
    <div className="avoid-break rounded-xl border border-gray-200 overflow-hidden mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: `${MED_TEAL}12` }}>
        <span className="text-xl">{icon}</span>
        <div className="flex-1">
          <p className="font-bold text-[14px]" style={{ color: '#0f172a' }}>
            {m.nombre_generico}{m.nombre_comercial ? ` (${m.nombre_comercial})` : ''}
          </p>
          {m.presentacion && <p className="text-[11px] text-gray-600">{m.presentacion}</p>}
        </div>
        {noAprob && <span className="text-[8px] text-amber-700 border border-amber-300 rounded px-1 py-0.5">no aprobado COFEPRIS</span>}
      </div>
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          {[['Cuánto', m.dosis], ['Vía', m.via], ['Cuándo', m.frecuencia], ['Por cuánto', m.duracion]]
            .filter(([, v]) => v).map(([k, v], i) => (
              <div key={i} className="rounded-lg px-2.5 py-1.5" style={{ background: '#f8fafc', border: '1px solid #eef2f6' }}>
                <p className="text-[9px] uppercase tracking-wide text-gray-400">{k}</p>
                <p className="text-[12px] font-semibold text-gray-800">{v}</p>
              </div>
            ))}
        </div>
        {m.para_que_sirve && (
          <p className="text-[12px] text-gray-700"><span className="font-semibold" style={{ color: MED_TEAL }}>¿Para qué sirve? </span>{m.para_que_sirve}</p>
        )}
        {m.indicacion && !m.para_que_sirve && <p className="text-[12px] text-gray-700">{m.indicacion}</p>}
      </div>
    </div>
  );
}

function ReporteBody({ diagnosticos, explicacion, receta, avanzados, habitos, estudios, plan, nota }:
  { diagnosticos: Dx[]; explicacion: string; receta: Med[]; avanzados: Med[]; habitos: Med[]; estudios: string[]; plan: Plan; nota: string }) {
  const meds = receta.filter(m => m.nombre_generico);
  const avz = (avanzados || []).filter(m => m.nombre_generico);
  const habs = habitos.filter(h => h.nombre_generico);
  const ests = estudios.filter(Boolean);
  const fases = Array.isArray(plan.plan_por_fases) ? plan.plan_por_fases : [];

  return (
    <div className="text-[#1a1a1a]">
      {/* Diagnóstico en lenguaje simple */}
      {(explicacion || diagnosticos.length > 0) && (
        <>
          <SectionTitle icon="🩺" color={MED_TEAL}>Lo que encontramos</SectionTitle>
          <div className="avoid-break rounded-xl px-4 py-3" style={SECTION('#0ea5e9')}>
            {explicacion
              ? <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{explicacion}</p>
              : (
                <ul className="space-y-1.5">
                  {diagnosticos.map((d, i) => (
                    <li key={i} className="text-[13px]">
                      <span className="font-semibold">{d.nombre}</span>
                      {d.resumen ? <span className="text-gray-700"> — {d.resumen}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </>
      )}

      {/* Medicamentos con horario */}
      {meds.length > 0 && (
        <>
          <SectionTitle icon="💊" color={MED_TEAL}>Tu tratamiento — cómo tomarlo</SectionTitle>
          {meds.map((m, i) => <MedCard key={i} m={m} />)}
        </>
      )}

      {/* Terapias avanzadas sugeridas (péptidos / PRP / células madre) — NO van en receta */}
      {avz.length > 0 && (
        <>
          <SectionTitle icon="🧬" color="#0891b2">Terapias avanzadas sugeridas (opcionales)</SectionTitle>
          <p className="text-[11px] text-gray-500 mb-2 -mt-1">Estas opciones NO forman parte de la receta oficial; el médico las comenta contigo y tú decides.</p>
          {avz.map((m, i) => (
            <div key={i} className="avoid-break rounded-xl border border-gray-200 overflow-hidden mb-2">
              <div className="flex items-center gap-2 px-4 py-2" style={{ background: '#0891b210' }}>
                <span className="text-lg">🧬</span>
                <p className="font-bold text-[13px] flex-1">{m.nombre || m.nombre_generico}
                  {m.tipo && <span className="ml-2 text-[9px] font-normal text-gray-500">{m.tipo}</span>}
                </p>
                {m.cofepris === 'no_aprobado' && <span className="text-[8px] text-amber-700 border border-amber-300 rounded px-1 py-0.5">no aprobado COFEPRIS</span>}
              </div>
              <div className="px-4 py-2 space-y-1">
                {(m.para_que || m.para_que_sirve) && <p className="text-[12px] text-gray-700"><span className="font-semibold" style={{ color: '#0891b2' }}>¿Para qué? </span>{m.para_que || m.para_que_sirve}</p>}
                {m.por_que_encaja && <p className="text-[11px] text-gray-600"><span className="text-gray-400">Por qué en tu caso: </span>{m.por_que_encaja}</p>}
                {m.como_se_usa && <p className="text-[11px] text-gray-600"><span className="text-gray-400">Cómo se usa: </span>{m.como_se_usa}</p>}
                {[m.presentacion, m.dosis, m.via, m.frecuencia, m.duracion].filter(Boolean).length > 0 && (
                  <p className="text-[11px] text-gray-600">{[m.presentacion, m.dosis, m.via, m.frecuencia, m.duracion].filter(Boolean).join(' · ')}</p>
                )}
                {m.disclaimer && <p className="text-[11px] text-amber-700">⚠ {m.disclaimer}</p>}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Hábitos / estilo de vida */}
      {habs.length > 0 && (
        <>
          <SectionTitle icon="🌱" color="#16a34a">Hábitos que te van a ayudar</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {habs.map((h, i) => (
              <div key={i} className="avoid-break rounded-xl px-3 py-2.5" style={SECTION('#16a34a')}>
                <p className="font-semibold text-[13px]">{h.nombre_generico}</p>
                <p className="text-[11px] text-gray-600">{[h.presentacion, h.frecuencia, h.duracion].filter(Boolean).join(' · ')}</p>
                {h.para_que_sirve && <p className="text-[11px] text-gray-700 mt-0.5">{h.para_que_sirve}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Estudios */}
      {ests.length > 0 && (
        <>
          <SectionTitle icon="🧪" color="#7c3aed">Estudios que necesitas hacerte</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ests.map((e, i) => (
              <div key={i} className="avoid-break flex items-center gap-2 text-[12px] rounded-lg px-3 py-2" style={SECTION('#7c3aed')}>
                <span className="inline-block w-3.5 h-3.5 border-2 rounded" style={{ borderColor: '#7c3aed' }} />
                <span>{e}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Plan de seguimiento */}
      {(plan.proxima_revision || plan.criterios_exito || plan.senales_alarma || fases.length > 0) && (
        <>
          <SectionTitle icon="📅" color="#0d9488">Tu plan de seguimiento</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {plan.proxima_revision && (
              <div className="avoid-break rounded-xl px-3 py-2.5" style={SECTION('#0d9488')}>
                <p className="text-[9px] uppercase tracking-wide text-gray-500">Próxima revisión</p>
                <p className="text-[13px] font-semibold">{plan.proxima_revision}</p>
              </div>
            )}
            {plan.criterios_exito && (
              <div className="avoid-break rounded-xl px-3 py-2.5" style={SECTION('#16a34a')}>
                <p className="text-[9px] uppercase tracking-wide text-gray-500">Metas / cómo sabremos que va bien</p>
                <p className="text-[12px]">{plan.criterios_exito}</p>
              </div>
            )}
          </div>
          {fases.length > 0 && (
            <div className="avoid-break mt-2 flex flex-wrap gap-1.5">
              {fases.map((f: any, i: number) => (
                <span key={i} className="text-[10px] rounded-full px-2.5 py-1" style={{ background: '#0d948815', color: '#0d9488', border: '1px solid #0d948840' }}>
                  {i + 1}. {f?.fase || ''}{f?.cuando ? ` (${f.cuando})` : ''}
                </span>
              ))}
            </div>
          )}
          {plan.senales_alarma && (
            <div className="avoid-break mt-2 rounded-xl px-3 py-2.5" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <p className="text-[11px] font-bold text-red-700">⚠️ Señales de alarma — busca atención de inmediato si presentas:</p>
              <p className="text-[12px] text-red-800">{plan.senales_alarma}</p>
            </div>
          )}
        </>
      )}

      {/* Nota personal del médico */}
      {nota.trim() && (
        <div className="avoid-break mt-6 rounded-xl px-4 py-3" style={{ background: '#f8fafc', border: '1px solid #e5e7eb' }}>
          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Mensaje de tu médico</p>
          <p className="text-[13px] whitespace-pre-wrap">{nota}</p>
        </div>
      )}
    </div>
  );
}
