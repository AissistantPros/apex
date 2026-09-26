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
  combo?: string; iniciar_cuando?: string; evidencia?: string; aprobado?: boolean;
  // Campos de la síntesis (receta unificada)
  como_tomar?: string; cambio?: string; enfoque?: string;
};
type Dx = { nombre?: string; confianza?: number; resumen?: string };
type Est = { estudio?: string; prioridad?: string; para_que?: string };
type Fase = { fase?: string; objetivo?: string; cuando?: string; tiempo_mejora?: string; acciones?: string[]; estudios?: string[]; metas?: string[] };
type ExplPac = { que_tengo?: string; por_que?: string; healthspan?: string; plan?: string[]; mis_compromisos?: string[]; que_esperar?: string };
type Synth = {
  resumen_medico?: string; inconsistencias?: string[];
  plan_por_fases?: Fase[]; receta?: Med[]; estudios?: Est[]; peptidos?: Med[];
  explicacion_paciente?: ExplPac;
};

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
  const [incPeptidos, setIncPeptidos] = useState(true);
  const [pepSel, setPepSel] = useState<boolean[]>([]);      // qué péptidos incluir en la hoja
  const [receta, setReceta] = useState<Med[]>([]);
  const [estudios, setEstudios] = useState<Est[]>([]);
  const [indicaciones, setIndicaciones] = useState('');
  const [notaMedico, setNotaMedico] = useState('');
  const [synth, setSynth] = useState<Synth | null>(null);
  const [loadingLabel, setLoadingLabel] = useState('Cargando documentos…');

  const load = useCallback(async () => {
    try {
      // 1) El agente DIRECTOR integra todo (dedup + plan por fases + explicación). Se genera
      //    si no existe. Es la fuente principal del reporte final.
      setLoadingLabel('El sistema está integrando el plan final…');
      let s: Synth | null = null;
      try {
        const r = await api(`/analyze/${visit_id}/synthesis`, { method: 'POST' });
        s = r.synthesis || null;
      } catch { /* si falla, usamos el ensamblado por enfoque */ }
      setSynth(s);

      // 2) /documents da membrete, paciente y (como respaldo) receta/estudios por enfoque.
      const d = await api(`/analyze/${visit_id}/documents`);
      setData(d);

      // La receta y estudios preferentes salen de la síntesis (sin duplicados).
      const recetaSrc: Med[] = (s?.receta && s.receta.length ? s.receta : (d.receta || [])) as Med[];
      setReceta(recetaSrc.map(r => ({
        ...r,
        nombre_generico: r.nombre_generico || r.nombre || '',
        para_que_sirve: r.para_que_sirve || r.para_que,
      })));
      const est: Est[] = (s?.estudios && s.estudios.length)
        ? s.estudios
        : ((d.estudios || []) as string[]).map((x: string) => ({ estudio: x }));
      setEstudios(est);
      setIncReceta((s?.receta?.length || d.disponibles?.receta) ? true : false);
      setIncReporte(true);
      setIncEstudios(est.length > 0);
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
  const avanzados: Med[] = (synth?.peptidos && synth.peptidos.length ? synth.peptidos : (data?.avanzados || [])) as Med[];
  const avz = avanzados.filter(m => m.nombre_generico || m.nombre);
  // Selección inicial de péptidos: incluir los que no fueron omitidos por el médico.
  useEffect(() => { setPepSel(avz.map(m => m.aprobado !== false)); /* eslint-disable-next-line */ }, [avz.length]);
  const pepsSel = avz.filter((_, i) => pepSel[i] !== false);
  const hayPeptidos = incPeptidos && pepsSel.length > 0;
  const diagnosticos: Dx[] = data?.diagnosticos || [];
  const explPac: ExplPac | null = synth?.explicacion_paciente || null;
  const explicacionTxt: string = data?.explicacion_paciente || '';
  const fases: Fase[] = synth?.plan_por_fases || [];
  const nada = !incReceta && !incReporte && !incEstudios && !hayPeptidos;

  const setMed = (i: number, k: keyof Med, v: string) => setReceta(r => r.map((m, j) => j === i ? { ...m, [k]: v } : m));
  const delMed = (i: number) => setReceta(r => r.filter((_, j) => j !== i));
  const addMed = () => setReceta(r => [...r, { nombre_generico: '', presentacion: '', dosis: '', via: 'Oral', frecuencia: '', duracion: '' }]);
  const setEst = (i: number, v: string) => setEstudios(e => e.map((x, j) => j === i ? { ...x, estudio: v } : x));
  const delEst = (i: number) => setEstudios(e => e.filter((_, j) => j !== i));
  const addEst = () => setEstudios(e => [...e, { estudio: '' }]);

  if (loading) return (
    <div className="min-h-screen bg-[#070a0e] flex flex-col items-center justify-center text-[#7a95aa] gap-3 px-6 text-center">
      <div className="w-8 h-8 border-2 border-[#00e5a0] border-t-transparent rounded-full animate-spin" />
      <p>{loadingLabel}</p>
    </div>
  );

  const pieId = `${pac.nombre || 'Paciente'} · ${lh.clinica || 'APEX'} · ${hoy()}`;
  const docsIncluidos = [
    incReceta && 'Receta médica',
    incReporte && 'Reporte para el paciente',
    incEstudios && 'Solicitud de estudios',
    hayPeptidos && 'Terapias avanzadas (péptidos)',
  ].filter(Boolean) as string[];

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
                ...(avz.length > 0 ? [['Hoja de péptidos', incPeptidos, setIncPeptidos, true, `${pepsSel.length} de ${avz.length} seleccionado(s) — hoja aparte, fuera de la receta`]] : []),
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
                      <input className={inp} value={e.estudio || ''} onChange={ev => setEst(i, ev.target.value)} placeholder="Estudio / análisis" />
                      <button onClick={() => delEst(i)} className="text-[#f43f5e] px-1">×</button>
                    </div>
                  ))}
                  <button onClick={addEst} className="text-[#00e5a0] text-xs">+ Agregar estudio</button>
                </div>
              </div>
            )}

            {/* Selección de péptidos para la hoja aparte */}
            {incPeptidos && avz.length > 0 && (
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4">
                <p className="text-xs font-mono text-[#0891b2] tracking-wider mb-1">PÉPTIDOS A ENTREGAR</p>
                <p className="text-[11px] text-[#7a95aa] mb-3">Van en una hoja aparte, NO en la receta (salvo los aprobados por COFEPRIS). Elige cuáles incluir.</p>
                <div className="space-y-1.5">
                  {avz.map((m, i) => (
                    <label key={i} className="flex items-start gap-2.5 py-1 cursor-pointer">
                      <input type="checkbox" checked={pepSel[i] !== false}
                        onChange={e => setPepSel(prev => { const n = [...prev]; while (n.length < avz.length) n.push(true); n[i] = e.target.checked; return n; })}
                        className="mt-1 accent-[#0891b2]" />
                      <div>
                        <p className="text-[13px] text-[#dde6ef]">🧬 {m.nombre || m.nombre_generico}
                          {m.cofepris === 'aprobado' && <span className="ml-1.5 text-[8px] text-emerald-400 border border-emerald-500/40 rounded px-1">COFEPRIS ✓</span>}
                        </p>
                        {(m.para_que || m.para_que_sirve) && <p className="text-[10px] text-[#7a95aa]">{m.para_que || m.para_que_sirve}</p>}
                      </div>
                    </label>
                  ))}
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

            {!nada && <Portada lh={lh} pac={pac} docs={docsIncluidos} />}
            {!nada && docsIncluidos.length > 1 && <Indice docs={docsIncluidos} />}

            {incReceta && (
              <Hoja lh={lh} pac={pac} titulo="Receta médica">
                <RecetaBody receta={receta} indicaciones={indicaciones} />
              </Hoja>
            )}

            {incReporte && (
              <Hoja lh={lh} pac={pac} titulo="Reporte para el paciente">
                <ReporteBody diagnosticos={diagnosticos} explPac={explPac} explicacionTxt={explicacionTxt}
                  receta={receta} avanzados={avanzados} habitos={habitos} estudios={estudios} fases={fases} nota={notaMedico} />
              </Hoja>
            )}

            {incEstudios && (
              <Hoja lh={lh} pac={pac} titulo="Solicitud de estudios">
                <EstudiosBody estudios={estudios.map(e => e.estudio || '')} />
              </Hoja>
            )}

            {hayPeptidos && (
              <Hoja lh={lh} pac={pac} titulo="Terapias avanzadas — péptidos">
                <PeptidosBody peptidos={pepsSel} />
              </Hoja>
            )}
          </div>
        </div>
      </main>

      {/* Pie que se repite en CADA página impresa (mantiene relacionadas las hojas). */}
      <div className="print-footer">{pieId}</div>

      {/* Estilos de impresión: aísla SOLO el reporte (evita que la app oscura se rasterice
          y salga en blanco), fuerza fondo blanco y colores, y controla la paginación.
          Se usa <style> plano (no styled-jsx) para no arriesgar el scoping de @page. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .print-footer { display: none; }
        @media print {
          @page { size: letter; margin: 16mm 16mm 18mm; }
          /* Forzar que TODOS los fondos/colores se impriman (Chrome los omite por defecto). */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body { background: #fff !important; height: auto !important; margin: 0 !important; }
          .min-h-screen { min-height: 0 !important; background: #fff !important; }
          /* AISLAMIENTO: oculta toda la app y muestra solo el área imprimible. */
          body * { visibility: hidden !important; }
          .print-area, .print-area *, .print-footer, .print-footer * { visibility: visible !important; }
          .no-print { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
          .print-area {
            position: absolute !important; left: 0; top: 0; width: 100% !important;
            margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important;
          }
          .hoja {
            box-shadow: none !important; border: none !important; border-radius: 0 !important;
            width: 100% !important; max-width: none !important; min-height: 0 !important;
            margin: 0 !important; padding: 0 !important; background: #fff !important;
          }
          .hoja + .hoja, .page-break { page-break-before: always; break-before: page; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .print-footer {
            display: block; position: fixed; bottom: 4mm; left: 0; right: 0;
            text-align: center; font-size: 8px; color: #6b7280;
            border-top: 1px solid #e5e7eb; padding-top: 3px;
          }
          /* Números de página donde el navegador lo soporta (Safari/Firefox). */
          @page { @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8px; color: #6b7280; } }
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

// ── Portada del reporte (primera página) ─────────────────────────────────────
function Portada({ lh, pac, docs }: { lh: any; pac: any; docs: string[] }) {
  return (
    <div className="hoja bg-white text-[#1a1a1a] rounded-lg shadow-xl mx-auto mb-6 p-10 flex flex-col"
      style={{ width: '100%', maxWidth: 816, minHeight: 1000 }}>
      {/* Membrete del médico / clínica */}
      <div className="flex items-start justify-between border-b-2 pb-5 mb-auto" style={{ borderColor: MED_TEAL }}>
        <div className="flex items-center gap-3">
          {lh.logo_url ? <img src={lh.logo_url} alt="logo" style={{ height: 64 }} /> :
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl" style={{ background: MED_TEAL }}>{(lh.clinica || 'A')[0]}</div>}
          <div>
            <p className="font-bold text-xl leading-tight" style={{ color: MED_TEAL }}>{lh.clinica || 'Clínica'}</p>
            <p className="text-sm font-semibold">{lh.profesional || 'Médico'}</p>
            <p className="text-xs text-gray-600">{lh.especialidad || ''}</p>
          </div>
        </div>
        <div className="text-right text-[10px] text-gray-600 leading-snug">
          {lh.cedula_profesional && <p>Céd. Prof. {lh.cedula_profesional}</p>}
          {lh.cedula_especialidad && <p>Céd. Esp. {lh.cedula_especialidad}</p>}
        </div>
      </div>

      {/* Título central */}
      <div className="text-center my-16">
        <p className="text-[11px] font-mono tracking-[4px] text-gray-400 mb-4">REPORTE CLÍNICO INTEGRAL</p>
        <h1 className="text-4xl font-bold mb-3" style={{ color: MED_TEAL }}>Plan de salud personalizado</h1>
        <p className="text-sm text-gray-500 max-w-md mx-auto">Diagnóstico, tratamiento, estudios y plan de acción preparados para este paciente.</p>
      </div>

      {/* Datos del paciente */}
      <div className="mx-auto w-full max-w-md rounded-xl border border-gray-200 p-5 mb-auto">
        <div className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
          <span className="text-gray-500">Paciente</span><span className="font-semibold">{pac.nombre || '—'}</span>
          {pac.edad != null && (<><span className="text-gray-500">Edad</span><span>{pac.edad} años</span></>)}
          {pac.sexo && (<><span className="text-gray-500">Sexo</span><span>{pac.sexo}</span></>)}
          <span className="text-gray-500">Fecha</span><span>{hoy()}</span>
          <span className="text-gray-500">Atendió</span><span>{lh.profesional || 'Médico'}</span>
          {docs.length > 0 && (<><span className="text-gray-500">Incluye</span><span>{docs.join(' · ')}</span></>)}
        </div>
      </div>

      {/* Pie: marca de la plataforma (APEX Pro) — el resto del documento es del médico */}
      <div className="mt-auto pt-6 border-t border-gray-200 flex items-center justify-between text-[10px] text-gray-400">
        <span>{[lh.direccion, lh.ciudad].filter(Boolean).join(' · ')}</span>
        <span className="font-mono tracking-wider">Generado con <b style={{ color: MED_TEAL }}>APEX</b> <span className="border rounded px-1" style={{ borderColor: MED_TEAL, color: MED_TEAL }}>PRO</span></span>
      </div>
    </div>
  );
}

// ── Índice de documentos ─────────────────────────────────────────────────────
function Indice({ docs }: { docs: string[] }) {
  return (
    <div className="hoja page-break bg-white text-[#1a1a1a] rounded-lg shadow-xl mx-auto mb-6 p-10"
      style={{ width: '100%', maxWidth: 816 }}>
      <h2 className="text-base font-bold uppercase tracking-wide mb-5" style={{ color: MED_TEAL }}>Contenido de este reporte</h2>
      <ol className="space-y-3">
        {docs.map((d, i) => (
          <li key={i} className="avoid-break flex items-center gap-3 border-b border-gray-100 pb-3">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: MED_TEAL }}>{i + 1}</span>
            <span className="text-[14px] font-medium">{d}</span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-gray-500 mt-6 leading-relaxed">
        Este documento fue preparado por tu médico con apoyo de inteligencia artificial. Cada sección incluye el
        detalle correspondiente. Guárdalo y llévalo a tus próximas consultas.
      </p>
    </div>
  );
}

// ── Hoja de péptidos / terapias avanzadas (aparte, NO es la receta) ──────────
function PeptidosBody({ peptidos }: { peptidos: Med[] }) {
  const items = peptidos.filter(m => m.nombre || m.nombre_generico);
  if (!items.length) return <p className="text-[13px] text-gray-500">Sin terapias avanzadas seleccionadas.</p>;
  return (
    <div>
      <div className="avoid-break rounded-lg px-4 py-3 mb-4" style={{ background: '#0891b210', border: '1px solid #0891b230' }}>
        <p className="text-[12px] text-gray-700 leading-relaxed">
          Estas son <b>opciones avanzadas</b> que tu médico consideró para tu caso. <b>No forman parte de la receta
          oficial</b> (salvo las que estén aprobadas por COFEPRIS). Cada una explica para qué sirve y por qué se
          sugiere; tú y tu médico deciden si las usas.
        </p>
      </div>
      <div className="space-y-3">
        {items.map((m, i) => (
          <div key={i} className="avoid-break rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2" style={{ background: '#0891b210' }}>
              <span className="text-lg">🧬</span>
              <p className="font-bold text-[14px] flex-1">{m.nombre || m.nombre_generico}</p>
              {m.cofepris === 'aprobado'
                ? <span className="text-[8px] text-emerald-700 border border-emerald-300 rounded px-1 py-0.5">aprobado COFEPRIS</span>
                : <span className="text-[8px] text-amber-700 border border-amber-300 rounded px-1 py-0.5">no aprobado COFEPRIS</span>}
            </div>
            <div className="px-4 py-2.5 space-y-1">
              {m.combo && <p className="text-[11px]" style={{ color: '#0891b2' }}>🔗 {m.combo}</p>}
              {(m.para_que || m.para_que_sirve) && <p className="text-[12px] text-gray-700"><span className="font-semibold" style={{ color: '#0891b2' }}>¿Para qué? </span>{m.para_que || m.para_que_sirve}</p>}
              {m.por_que_encaja && <p className="text-[12px] text-gray-600"><span className="text-gray-400">Por qué en tu caso: </span>{m.por_que_encaja}</p>}
              {m.como_se_usa && <p className="text-[11px] text-gray-600"><span className="text-gray-400">Cómo se usa: </span>{m.como_se_usa}</p>}
              {m.iniciar_cuando && m.iniciar_cuando.toLowerCase() !== 'ahora' && <p className="text-[11px] text-gray-600"><span className="text-gray-400">Cuándo iniciar: </span>{m.iniciar_cuando}</p>}
              {m.evidencia && <p className="text-[10px] text-gray-500 italic"><span className="text-gray-400">Evidencia: </span>{m.evidencia}</p>}
              {m.disclaimer && <p className="text-[11px] text-amber-700">⚠ {m.disclaimer}</p>}
            </div>
          </div>
        ))}
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
        {receta.filter(m => m.nombre_generico || m.nombre).map((m, i) => (
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
  const nombre = m.nombre_generico || m.nombre || '';
  const paraQue = m.para_que_sirve || m.para_que;
  const cambio = m.cambio ? _cambioBadge[m.cambio] : null;
  return (
    <div className="avoid-break rounded-xl border border-gray-200 overflow-hidden mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: `${MED_TEAL}12` }}>
        <span className="text-xl">{icon}</span>
        <div className="flex-1">
          <p className="font-bold text-[14px]" style={{ color: '#0f172a' }}>
            {nombre}{m.nombre_comercial ? ` (${m.nombre_comercial})` : ''}
          </p>
          {m.presentacion && <p className="text-[11px] text-gray-600">{m.presentacion}</p>}
        </div>
        {cambio && <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: cambio.bg, color: cambio.c }}>{cambio.t}</span>}
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
        {m.como_tomar && <p className="text-[12px] text-gray-700 mb-1"><span className="font-semibold" style={{ color: MED_TEAL }}>Cómo tomarlo: </span>{m.como_tomar}</p>}
        {paraQue && (
          <p className="text-[12px] text-gray-700"><span className="font-semibold" style={{ color: MED_TEAL }}>¿Para qué sirve? </span>{paraQue}</p>
        )}
        {m.indicacion && !paraQue && <p className="text-[12px] text-gray-700">{m.indicacion}</p>}
      </div>
    </div>
  );
}

function PhaseTimeline({ fases }: { fases: Fase[] }) {
  const cols = ['#0d9488', '#0ea5e9', '#7c3aed', '#f59e0b'];
  return (
    <div className="avoid-break space-y-0">
      {fases.map((f, i) => {
        const c = cols[i % cols.length];
        return (
          <div key={i} className="flex gap-3">
            {/* Riel vertical con nodo */}
            <div className="flex flex-col items-center">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black text-white" style={{ background: c }}>{i + 1}</div>
              {i < fases.length - 1 && <div className="w-0.5 flex-1 my-1" style={{ background: `${c}55` }} />}
            </div>
            <div className="flex-1 pb-4">
              <div className="rounded-xl px-3.5 py-2.5" style={{ background: `${c}0d`, border: `1px solid ${c}33` }}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <p className="font-bold text-[13px]" style={{ color: c }}>{f.fase || `Fase ${i + 1}`}</p>
                  {f.cuando && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: `${c}18`, color: c }}>🗓 {f.cuando}</span>}
                  {f.tiempo_mejora && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">↗ mejora: {f.tiempo_mejora}</span>}
                </div>
                {f.objetivo && <p className="text-[12px] text-gray-700 mb-1.5">{f.objetivo}</p>}
                {Array.isArray(f.acciones) && f.acciones.length > 0 && (
                  <ul className="text-[12px] text-gray-800 space-y-0.5 mb-1">
                    {f.acciones.map((a, k) => <li key={k} className="flex gap-1.5"><span style={{ color: c }}>›</span>{a}</li>)}
                  </ul>
                )}
                {Array.isArray(f.metas) && f.metas.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {f.metas.map((m, k) => <span key={k} className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">🎯 {m}</span>)}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const _cambioBadge: Record<string, { t: string; c: string; bg: string }> = {
  nuevo: { t: 'Nuevo', c: '#0d9488', bg: '#0d948815' },
  ajuste: { t: 'Ajuste', c: '#f59e0b', bg: '#f59e0b15' },
  sin_cambio: { t: 'Ya lo tomabas', c: '#64748b', bg: '#64748b15' },
};

function ReporteBody({ diagnosticos, explPac, explicacionTxt, receta, avanzados, habitos, estudios, fases, nota }:
  { diagnosticos: Dx[]; explPac: ExplPac | null; explicacionTxt: string; receta: Med[]; avanzados: Med[]; habitos: Med[]; estudios: Est[]; fases: Fase[]; nota: string }) {
  const meds = receta.filter(m => m.nombre_generico || m.nombre);
  const habs = habitos.filter(h => h.nombre_generico);
  const ests = estudios.filter(e => (e.estudio || '').trim());

  return (
    <div className="text-[#1a1a1a]">
      {/* Lo que encontramos — explicación estructurada al paciente */}
      {(explPac || explicacionTxt || diagnosticos.length > 0) && (
        <>
          <SectionTitle icon="🩺" color={MED_TEAL}>Lo que encontramos</SectionTitle>
          {explPac ? (
            <div className="space-y-2">
              {explPac.que_tengo && (
                <div className="avoid-break rounded-xl px-4 py-3" style={SECTION('#0ea5e9')}>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Qué tienes</p>
                  <p className="text-[13px] leading-relaxed">{explPac.que_tengo}</p>
                </div>
              )}
              {explPac.por_que && (
                <div className="avoid-break rounded-xl px-4 py-3" style={SECTION(MED_TEAL)}>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Por qué te pasa (la raíz)</p>
                  <p className="text-[13px] leading-relaxed">{explPac.por_que}</p>
                </div>
              )}
              {explPac.healthspan && (
                <div className="avoid-break rounded-xl px-4 py-3" style={SECTION('#7c3aed')}>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Tu salud a futuro</p>
                  <p className="text-[13px] leading-relaxed">{explPac.healthspan}</p>
                </div>
              )}
            </div>
          ) : explicacionTxt ? (
            <div className="avoid-break rounded-xl px-4 py-3" style={SECTION('#0ea5e9')}>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{explicacionTxt}</p>
            </div>
          ) : (
            <div className="avoid-break rounded-xl px-4 py-3" style={SECTION('#0ea5e9')}>
              <ul className="space-y-1.5">
                {diagnosticos.map((d, i) => <li key={i} className="text-[13px]"><span className="font-semibold">{d.nombre}</span>{d.resumen ? <span className="text-gray-700"> — {d.resumen}</span> : null}</li>)}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Plan por fases (roadmap con línea de tiempo) */}
      {fases.length > 0 && (
        <>
          <SectionTitle icon="🗺️" color={MED_TEAL}>Tu plan por etapas</SectionTitle>
          <p className="text-[11px] text-gray-500 mb-2 -mt-1">Vamos por partes: primero lo más importante; cuando eso mejore, seguimos con lo demás.</p>
          <PhaseTimeline fases={fases} />
        </>
      )}

      {/* Compromisos + qué esperar */}
      {explPac && (explPac.plan?.length || explPac.mis_compromisos?.length || explPac.que_esperar) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-1">
          {(explPac.plan?.length || explPac.mis_compromisos?.length) ? (
            <div className="avoid-break rounded-xl px-3.5 py-2.5" style={SECTION('#16a34a')}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Lo que tú tienes que hacer</p>
              <ul className="text-[12px] space-y-0.5">
                {[...(explPac.plan || []), ...(explPac.mis_compromisos || [])].map((x, i) => <li key={i} className="flex gap-1.5"><span className="text-green-600">✓</span>{x}</li>)}
              </ul>
            </div>
          ) : null}
          {explPac.que_esperar && (
            <div className="avoid-break rounded-xl px-3.5 py-2.5" style={SECTION('#0ea5e9')}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Qué puedes esperar</p>
              <p className="text-[12px]">{explPac.que_esperar}</p>
            </div>
          )}
        </div>
      )}

      {/* Medicamentos con horario (deduplicados por el director) */}
      {meds.length > 0 && (
        <>
          <SectionTitle icon="💊" color={MED_TEAL}>Tu tratamiento — cómo tomarlo</SectionTitle>
          {meds.map((m, i) => <MedCard key={i} m={m} />)}
        </>
      )}

      {/* Los péptidos / terapias avanzadas van en su HOJA APARTE, no en el reporte del paciente. */}

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

      {/* Estudios (deduplicados por el director) */}
      {ests.length > 0 && (
        <>
          <SectionTitle icon="🧪" color="#7c3aed">Estudios que necesitas hacerte</SectionTitle>
          <div className="space-y-1.5">
            {ests.map((e, i) => (
              <div key={i} className="avoid-break rounded-lg px-3 py-2" style={SECTION('#7c3aed')}>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 rounded flex-shrink-0" style={{ borderColor: '#7c3aed' }} />
                  <span className="text-[12px] font-semibold">{e.estudio}</span>
                  {e.prioridad && <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: '#7c3aed18', color: '#7c3aed' }}>{e.prioridad}</span>}
                </div>
                {e.para_que && <p className="text-[11px] text-gray-500 ml-5.5 mt-0.5">{e.para_que}</p>}
              </div>
            ))}
          </div>
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
