'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

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

export default function AprobacionesPage() {
  const router = useRouter();
  const [reqs, setReqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  const load = () => api('/deletions/pending').then(d => { setReqs(d.requests || []); setLoading(false); }).catch(e => { flash(e.message); setLoading(false); });
  useEffect(() => {
    if (getRole() !== 'doctor') { router.replace('/dashboard'); return; }
    load();
  }, []); // eslint-disable-line

  const decide = async (id: string, action: 'approve' | 'reject', name: string) => {
    if (action === 'approve' && !confirm(`¿Aprobar la baja de ${name}? El expediente y todo su historial se eliminarán de forma permanente.`)) return;
    setBusy(id);
    try { await api(`/deletions/${id}/${action}`, { method: 'POST' }); flash(action === 'approve' ? 'Expediente dado de baja.' : 'Solicitud rechazada.'); load(); }
    catch (e: any) { flash(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-serif font-semibold text-[#dde6ef] mb-1">✅ Aprobaciones</h1>
        <p className="text-sm text-[#7a95aa] mb-5">Solicitudes de <strong className="text-[#dde6ef]">baja de expediente</strong> que requieren tu aprobación. Solo tú (el doctor) puedes aprobarlas.</p>
        {msg && <div className="mb-4 text-sm px-4 py-2.5 rounded-xl bg-[rgba(0,229,160,.1)] border border-[#00e5a044] text-[#00e5a0]">{msg}</div>}

        {loading ? <p className="text-[#7a95aa] text-sm">Cargando…</p> : reqs.length === 0 ? (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-8 text-center text-[#7a95aa]">No tienes solicitudes pendientes. 🎉</div>
        ) : (
          <div className="space-y-3">
            {reqs.map(r => (
              <div key={r.id} className="bg-[#0d1520] border border-[#f59e0b]/30 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🗂️</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#dde6ef]">Baja de: {r.patient_name}</p>
                    <p className="text-[12px] text-[#7a95aa] mt-0.5">
                      Solicitó: {r.requested_by_name} ({r.requested_by_role || 'staff'}) · {new Date(r.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {r.reason && <p className="text-sm text-[#dde6ef] mt-2 bg-[#111820] rounded-lg px-3 py-2">Motivo: {r.reason}</p>}
                    <p className="text-[11px] text-[#f43f5e] mt-2">⚠️ Aprobar elimina el expediente y todo su historial de forma permanente.</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 justify-end">
                  <button onClick={() => decide(r.id, 'reject', r.patient_name)} disabled={busy === r.id}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-[#7a95aa] border border-[#1e2d3d] hover:border-[#7a95aa] transition disabled:opacity-50">Rechazar</button>
                  <button onClick={() => decide(r.id, 'approve', r.patient_name)} disabled={busy === r.id}
                    className="px-5 py-2 rounded-lg text-sm font-bold bg-[#f43f5e] text-white hover:opacity-90 transition disabled:opacity-50">
                    {busy === r.id ? '…' : 'Aprobar baja'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
