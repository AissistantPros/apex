'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSession } from '@/app/lib/auth';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type Doc = {
  id: string; titulo: string; autor?: string; tipo?: string; area?: string;
  archivo?: string; paginas?: number; n_chunks?: number; estado: string; error_msg?: string;
  created_at?: string;
};

const AREAS = [
  { v: 'functional',  l: 'Funcional',   c: '#a78bfa' },
  { v: 'longevity',   l: 'Longevidad',  c: '#00e5a0' },
  { v: 'traditional', l: 'Convencional', c: '#0ea5e9' },
  { v: 'general',     l: 'General',     c: '#7a95aa' },
];
const TIPOS = ['libro', 'guia', 'paper', 'protocolo', 'notas'];

export default function BibliotecaPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const [titulo, setTitulo] = useState('');
  const [autor, setAutor] = useState('');
  const [tipo, setTipo] = useState('libro');
  const [area, setArea] = useState('functional');
  const [archivo, setArchivo] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<any[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  const authH = useCallback(async (): Promise<Record<string, string>> => {
    const s = await getSession();
    return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
  }, []);

  const cargar = useCallback(async () => {
    try {
      const h = await authH();
      const [r1, r2] = await Promise.all([
        fetch(`${B()}/kb/documents`, { headers: h }),
        fetch(`${B()}/kb/status`, { headers: h }),
      ]);
      setDocs((await r1.json()).documents || []);
      setStatus(await r2.json());
    } catch { /* silencioso */ } finally { setLoading(false); }
  }, [authH]);

  useEffect(() => { cargar(); }, [cargar]);

  // Mientras haya documentos procesando, refrescar para ver el avance
  useEffect(() => {
    if (!docs.some(d => d.estado === 'procesando')) return;
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [docs, cargar]);

  const subir = async () => {
    if (!archivo) { setError('Selecciona un archivo'); return; }
    setError(''); setSubiendo(true);
    try {
      // Multipart, no base64: base64 infla el archivo ~33% y los libros grandes
      // (>15 MB) revientan el límite de la petición.
      const fd = new FormData();
      fd.append('file', archivo);
      fd.append('titulo', titulo || archivo.name);
      fd.append('autor', autor);
      fd.append('tipo', tipo);
      fd.append('area', area);

      const s = await getSession();
      const resp = await fetch(`${B()}/kb/upload_file`, {
        method: 'POST',
        // Sin Content-Type: el navegador lo pone con el boundary correcto
        headers: s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {},
        body: fd,
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || `Error al subir (HTTP ${resp.status})`);
      }
      setTitulo(''); setAutor(''); setArchivo(null);
      if (fileRef.current) fileRef.current.value = '';
      await cargar();
    } catch (e: any) {
      setError(e.message === 'Failed to fetch'
        ? 'No se pudo enviar el archivo. Si pesa más de ~40 MB, divídelo o comprímelo.'
        : e.message);
    } finally { setSubiendo(false); }
  };

  const borrar = async (id: string, titulo: string) => {
    if (!confirm(`¿Eliminar "${titulo}" de la biblioteca? Se borrarán sus fragmentos indexados.`)) return;
    await fetch(`${B()}/kb/documents/${id}`, { method: 'DELETE', headers: await authH() });
    cargar();
  };

  const buscar = async () => {
    if (!consulta.trim()) return;
    setBuscando(true); setResultados(null);
    try {
      const r = await fetch(`${B()}/kb/search`, {
        method: 'POST', headers: await authH(),
        body: JSON.stringify({ consulta, limite: 6 }),
      });
      const j = await r.json();
      setResultados(j.fragmentos || []);
    } catch { setResultados([]); } finally { setBuscando(false); }
  };

  const inp = 'w-full bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2.5 text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870] text-sm';
  const colorArea = (a?: string) => AREAS.find(x => x.v === a)?.c || '#7a95aa';

  return (
    <div className="bg-[#070a0e] min-h-screen">
      <main className="pt-16 min-h-screen">
        <div className="page-content px-4 py-8">

          <div className="mb-6">
            <h1 className="font-serif text-[#dde6ef] mb-1">📚 Biblioteca clínica</h1>
            <p className="text-sm text-[#7a95aa]">
              Tus libros y guías. El sistema los consulta para fundamentar las recomendaciones de
              medicina funcional y de longevidad, y cita la fuente.
            </p>
          </div>

          {status && !status.embeddings_configurados && (
            <div className="rounded-xl px-4 py-3 mb-6" style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)' }}>
              <p className="text-sm text-[#f59e0b] font-semibold mb-1">⚠ Falta configurar el indexador</p>
              <p className="text-xs text-[#dde6ef] leading-relaxed">
                Para indexar la biblioteca hay que definir la variable de entorno <code className="text-[#f59e0b]">VOYAGE_API_KEY</code> en
                el backend (Render → Environment). La clave se obtiene gratis en voyageai.com. Sin ella
                el sistema funciona igual, pero sin consultar tus libros.
              </p>
            </div>
          )}

          {status && status.embeddings_configurados && (
            <div className="flex gap-3 mb-6 flex-wrap">
              {[
                { l: 'Documentos', v: status.documentos },
                { l: 'Indexados', v: status.listos },
                { l: 'Fragmentos', v: status.fragmentos },
              ].map(s => (
                <div key={s.l} className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl px-4 py-2.5">
                  <p className="text-[10px] font-mono text-[#3d5870] tracking-wider">{s.l.toUpperCase()}</p>
                  <p className="text-xl font-mono font-bold text-[#00e5a0]">{s.v}</p>
                </div>
              ))}
            </div>
          )}

          {/* Subir */}
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 mb-6">
            <p className="text-xs font-mono text-[#00e5a0] mb-4 tracking-wider">AGREGAR A LA BIBLIOTECA</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] mb-1.5 block">TÍTULO</label>
                <input className={inp} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Outlive" />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] mb-1.5 block">AUTOR</label>
                <input className={inp} value={autor} onChange={e => setAutor(e.target.value)} placeholder="Peter Attia" />
              </div>
            </div>

            <div className="mb-3">
              <label className="text-[10px] font-mono text-[#7a95aa] mb-1.5 block">ÁREA — determina en qué voz se consulta</label>
              <div className="flex gap-2 flex-wrap">
                {AREAS.map(a => (
                  <button key={a.v} type="button" onClick={() => setArea(a.v)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition"
                    style={{ background: area === a.v ? a.c : '#1e2d3d', borderColor: area === a.v ? a.c : '#2a3a4d', color: area === a.v ? '#000' : '#dde6ef' }}>
                    {a.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <label className="text-[10px] font-mono text-[#7a95aa] mb-1.5 block">TIPO</label>
              <div className="flex gap-2 flex-wrap">
                {TIPOS.map(t => (
                  <button key={t} type="button" onClick={() => setTipo(t)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition"
                    style={{ background: tipo === t ? '#00e5a0' : '#1e2d3d', color: tipo === t ? '#000' : '#7a95aa' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition mb-3"
              style={{ borderColor: archivo ? '#00e5a055' : '#1e2d3d' }}>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setArchivo(f); if (!titulo) setTitulo(f.name.replace(/\.[^.]+$/, '')); } }} />
              <p className="text-2xl mb-1">{archivo ? '📄' : '📎'}</p>
              <p className="text-sm text-[#dde6ef] font-medium">
                {archivo ? archivo.name : 'Haz clic para elegir un archivo'}
              </p>
              <p className="text-xs text-[#3d5870] mt-1">
                {archivo ? `${(archivo.size / 1024 / 1024).toFixed(1)} MB` : 'PDF · Word · TXT — el PDF debe tener texto, no ser un escaneo'}
              </p>
            </div>

            {error && <p className="text-xs text-[#f43f5e] mb-3">{error}</p>}

            <button onClick={subir} disabled={subiendo || !archivo}
              className="px-5 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40"
              style={{ background: '#00e5a0', color: '#000' }}>
              {subiendo ? 'Subiendo...' : 'Subir e indexar'}
            </button>
          </div>

          {/* Probar la biblioteca */}
          {status?.listos > 0 && (
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 mb-6">
              <p className="text-xs font-mono text-[#0ea5e9] mb-3 tracking-wider">PROBAR LA BIBLIOTECA</p>
              <div className="flex gap-2 mb-3">
                <input className={inp} value={consulta} onChange={e => setConsulta(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && buscar()}
                  placeholder="¿Qué dicen mis libros sobre entrenamiento de zona 2?" />
                <button onClick={buscar} disabled={buscando}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40 whitespace-nowrap"
                  style={{ background: '#0ea5e9', color: '#000' }}>
                  {buscando ? '...' : 'Buscar'}
                </button>
              </div>
              {resultados && (
                resultados.length === 0
                  ? <p className="text-xs text-[#7a95aa]">Sin coincidencias. Prueba con otras palabras.</p>
                  : <div className="space-y-2">
                      {resultados.map((r, i) => (
                        <div key={i} className="bg-[#070a0e] border border-[#1e2d3d] rounded-lg p-3">
                          <p className="text-[10px] font-mono text-[#0ea5e9] mb-1">
                            {r.titulo}{r.autor ? ` — ${r.autor}` : ''}{r.pagina ? `, pág. ${r.pagina}` : ''}
                            <span className="text-[#3d5870] ml-2">({Math.round((r.similitud || 0) * 100)}% afinidad)</span>
                          </p>
                          <p className="text-xs text-[#dde6ef] leading-relaxed font-serif">{r.contenido?.slice(0, 320)}…</p>
                        </div>
                      ))}
                    </div>
              )}
            </div>
          )}

          {/* Listado */}
          <p className="text-xs font-mono text-[#3d5870] mb-3 tracking-wider">DOCUMENTOS</p>
          {loading ? (
            <p className="text-sm text-[#7a95aa]">Cargando…</p>
          ) : docs.length === 0 ? (
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-8 text-center">
              <p className="text-3xl mb-2">📚</p>
              <p className="text-sm text-[#7a95aa]">La biblioteca está vacía. Sube tu primer libro arriba.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map(d => (
                <div key={d.id} className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-4 flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">
                    {d.estado === 'listo' ? '📗' : d.estado === 'error' ? '📕' : '⏳'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#dde6ef] truncate">{d.titulo}</p>
                    <p className="text-xs text-[#7a95aa]">
                      {d.autor && <>{d.autor} · </>}
                      <span style={{ color: colorArea(d.area) }}>{AREAS.find(a => a.v === d.area)?.l || d.area}</span>
                      {d.tipo && <> · {d.tipo}</>}
                      {d.estado === 'listo' && <> · {d.paginas} págs · {d.n_chunks} fragmentos</>}
                    </p>
                    {d.estado === 'procesando' && (
                      <p className="text-xs text-[#f59e0b] mt-1">
                        {d.error_msg /* durante el proceso este campo trae el avance, no un error */
                          || 'Indexando… (puede tardar varios minutos)'}
                      </p>
                    )}
                    {d.estado === 'error' && (
                      <p className="text-xs text-[#f43f5e] mt-1">{d.error_msg || 'Error al procesar'}</p>
                    )}
                  </div>
                  <button onClick={() => borrar(d.id, d.titulo)}
                    className="text-[#f43f5e] text-lg leading-none hover:opacity-80 flex-shrink-0">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
