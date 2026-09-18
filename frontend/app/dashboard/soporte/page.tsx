'use client';

import { useEffect, useState } from 'react';
import { getSession } from '@/app/lib/auth';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const inp = 'w-full px-3.5 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870]';
const KIND: [string, string][] = [['question', 'Consulta'], ['feature', 'Pedir función'], ['bug', 'Reportar problema'], ['other', 'Otro']];
const STCOL: Record<string, string> = { open: '#f59e0b', in_progress: '#0ea5e9', closed: '#7a95aa' };
const STLBL: Record<string, string> = { open: 'Abierto', in_progress: 'En proceso', closed: 'Cerrado' };

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}
async function api(path: string, opts: RequestInit = {}) {
  let r: Response;
  try { r = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } }); }
  catch { throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'); }
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `Ocurrió un problema (error ${r.status}).`); }
  return r.json();
}

export default function SoportePage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ subject: '', body: '', kind: 'question' });
  const [reply, setReply] = useState('');
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  const load = () => api('/support/tickets').then(d => setTickets(d.tickets || [])).catch(e => flash(e.message));
  const loadDetail = (id: string) => api(`/support/tickets/${id}`).then(setDetail).catch(e => flash(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (sel) loadDetail(sel); else setDetail(null); }, [sel]); // eslint-disable-line

  const crear = async () => {
    if (!f.subject.trim() || !f.body.trim()) return flash('Escribe el asunto y el mensaje');
    try { const t = await api('/support/tickets', { method: 'POST', body: JSON.stringify(f) }); setF({ subject: '', body: '', kind: 'question' }); setOpen(false); load(); setSel(t.id); }
    catch (e: any) { flash(e.message); }
  };
  const send = async () => {
    if (!reply.trim()) return;
    try { await api(`/support/tickets/${sel}/messages`, { method: 'POST', body: JSON.stringify({ body: reply }) }); setReply(''); loadDetail(sel!); }
    catch (e: any) { flash(e.message); }
  };

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-serif font-semibold text-[#dde6ef]">💬 Soporte</h1>
          {!sel && <button onClick={() => setOpen(o => !o)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: '#00e5a0', color: '#000' }}>{open ? 'Cancelar' : '+ Nuevo ticket'}</button>}
        </div>
        <p className="text-sm text-[#7a95aa] mb-5">Contáctanos: pide una función, reporta algo o haznos una consulta.</p>
        {msg && <div className="mb-4 text-sm px-4 py-2.5 rounded-xl bg-[rgba(244,63,94,.1)] border border-[#f43f5e44] text-[#f43f5e]">{msg}</div>}

        {sel && detail ? (
          <div>
            <button onClick={() => setSel(null)} className="text-[#00e5a0] text-sm mb-4">‹ Mis tickets</button>
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
              <div className="flex items-start gap-2 mb-1">
                <p className="font-semibold text-[#dde6ef] flex-1">{detail.ticket.subject}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: STCOL[detail.ticket.status] + '22', color: STCOL[detail.ticket.status] }}>{STLBL[detail.ticket.status]}</span>
              </div>
              <div className="space-y-2 max-h-[380px] overflow-y-auto my-3">
                <div className="bg-[#111820] rounded-xl px-3 py-2 mr-8"><p className="text-[10px] text-[#7a95aa] mb-0.5">Tú</p><p className="text-sm text-[#dde6ef] whitespace-pre-wrap">{detail.ticket.body}</p></div>
                {(detail.messages || []).map((m: any) => (
                  <div key={m.id} className={`rounded-xl px-3 py-2 ${m.author_side === 'provider' ? 'bg-[#00e5a0]/10 ml-8' : 'bg-[#111820] mr-8'}`}>
                    <p className="text-[10px] text-[#7a95aa] mb-0.5">{m.author_side === 'provider' ? 'Soporte APEX' : 'Tú'}</p>
                    <p className="text-sm text-[#dde6ef] whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
              {detail.ticket.status !== 'closed' && (
                <div className="flex gap-2">
                  <input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Escribe un mensaje…"
                    className="flex-1 px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0]" />
                  <button onClick={send} className="px-4 rounded-xl font-bold" style={{ background: '#00e5a0', color: '#000' }}>↑</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {open && (
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 mb-5 space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  {KIND.map(([k, l]) => (
                    <button key={k} onClick={() => setF({ ...f, kind: k })} className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition"
                      style={{ background: f.kind === k ? '#00e5a0' : '#111820', borderColor: f.kind === k ? '#00e5a0' : '#2a3a4d', color: f.kind === k ? '#000' : '#dde6ef' }}>{l}</button>
                  ))}
                </div>
                <input className={inp} placeholder="Asunto" value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} />
                <textarea className={inp} rows={4} placeholder="Cuéntanos con detalle…" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
                <button onClick={crear} className="w-full py-2.5 rounded-xl text-sm font-bold" style={{ background: '#00e5a0', color: '#000' }}>Enviar ticket</button>
              </div>
            )}
            <div className="space-y-2">
              {tickets.length === 0 && <p className="text-[#3d5870] text-sm">Aún no tienes tickets. Crea el primero cuando lo necesites.</p>}
              {tickets.map(t => (
                <button key={t.id} onClick={() => setSel(t.id)} className="w-full flex items-center gap-3 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl px-5 py-4 hover:border-[#00e5a0]/40 transition text-left">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#dde6ef] truncate">{t.subject}</p>
                    <p className="text-[11px] text-[#7a95aa] truncate">{new Date(t.updated_at || t.created_at).toLocaleDateString('es-MX')}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: STCOL[t.status] + '22', color: STCOL[t.status] }}>{STLBL[t.status]}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
