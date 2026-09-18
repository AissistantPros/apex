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

const hm = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
const fecha = (iso?: string) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const AUD: Record<string, { label: string; color: string }> = {
  receptionist: { label: 'Recepción', color: '#0ea5e9' },
  nurse: { label: 'Enfermería', color: '#f97316' },
  doctor: { label: 'Doctor', color: '#a78bfa' },
};

export default function ProximosPage() {
  const router = useRouter();
  const [appts, setAppts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [brief, setBrief] = useState<any>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  const load = () => api('/appointments/upcoming').then(d => { setAppts(d.appointments || []); setLoading(false); }).catch(e => { flash(e.message); setLoading(false); });
  useEffect(() => {
    if (getRole() !== 'doctor') { router.replace('/dashboard'); return; }
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  const openBrief = async (a: any) => {
    if (!a.patient_id) { setBrief({ noLink: true, name: a.patient_name, appt: a }); return; }
    setBrief({ loading: true, appt: a });
    setBriefLoading(true);
    try { const d = await api(`/appointments/patient-brief/${a.patient_id}`); setBrief({ ...d, appt: a }); }
    catch (e: any) { flash(e.message); setBrief(null); } finally { setBriefLoading(false); }
  };

  const markArrived = async (a: any) => {
    try { await api(`/appointments/${a.id}`, { method: 'PUT', body: JSON.stringify({ status: 'arrived' }) }); load(); }
    catch (e: any) { flash(e.message); }
  };

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-serif font-semibold text-[#dde6ef] mb-1">🔜 Próximos pacientes</h1>
        <p className="text-sm text-[#7a95aa] mb-5">Quién sigue, en orden. Toca un paciente para ver su resumen antes de que entre.</p>
        {msg && <div className="mb-4 text-sm px-4 py-2.5 rounded-xl bg-[rgba(244,63,94,.1)] border border-[#f43f5e44] text-[#f43f5e]">{msg}</div>}

        {loading ? <p className="text-[#7a95aa] text-sm">Cargando…</p> : appts.length === 0 ? (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-8 text-center text-[#7a95aa]">No hay pacientes próximos en las siguientes horas.</div>
        ) : (
          <div className="space-y-2.5">
            {appts.map((a, i) => (
              <div key={a.id} className="bg-[#0d1520] border rounded-2xl p-4 flex items-center gap-4"
                style={{ borderColor: i === 0 ? '#00e5a0' : '#1e2d3d' }}>
                <div className="text-center shrink-0 w-14">
                  <p className="text-lg font-bold" style={{ color: i === 0 ? '#00e5a0' : '#dde6ef' }}>{hm(a.starts_at)}</p>
                  {i === 0 && <p className="text-[9px] font-mono text-[#00e5a0]">SIGUE</p>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#dde6ef] truncate">{a.patient_name || 'Paciente'}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#7a95aa] mt-0.5">
                    {a.facts?.edad != null && <span>{a.facts.edad} años</span>}
                    <span>Última: {a.facts?.ultima_consulta ? fecha(a.facts.ultima_consulta) : 'primera vez'}</span>
                    {a.facts?.tiene_cirugia && <span className="text-[#f59e0b]">⚕ cirugía previa</span>}
                    {a.reason && <span className="truncate">· {a.reason}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => openBrief(a)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#00e5a0', color: '#000' }}>Ver resumen</button>
                  {a.status !== 'arrived' && <button onClick={() => markArrived(a)} className="px-3 py-1.5 rounded-lg text-xs text-[#f59e0b] border border-[#f59e0b]/40">En sala</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Ventana de resumen del paciente */}
      {brief && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={() => setBrief(null)}>
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {brief.noLink ? (
              <>
                <p className="font-semibold text-[#dde6ef] mb-1">{brief.name}</p>
                <p className="text-sm text-[#7a95aa]">Esta cita no tiene un expediente vinculado, así que no hay historial que resumir. Cuando registres al paciente y lo vincules, aquí verás su resumen.</p>
              </>
            ) : brief.loading || briefLoading ? (
              <p className="text-[#7a95aa] text-sm py-8 text-center">🧠 Generando resumen con IA…</p>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-1">
                  <p className="font-semibold text-[#dde6ef] text-lg">{brief.patient?.full_name}</p>
                  {brief.patient?.edad != null && <span className="text-sm text-[#7a95aa]">{brief.patient.edad} años</span>}
                </div>
                <p className="text-[11px] text-[#7a95aa] mb-3">Última consulta: {brief.ultima_consulta ? fecha(brief.ultima_consulta) : 'primera vez'} · Cita: {hm(brief.appt?.starts_at)}</p>

                {/* Alertas rápidas */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {brief.patient?.allergies_medications && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f43f5e]/15 text-[#f43f5e]">Alergias: {brief.patient.allergies_medications}</span>}
                  {brief.patient?.chronic_diseases && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f59e0b]/15 text-[#f59e0b]">Crónicas: {brief.patient.chronic_diseases}</span>}
                  {brief.patient?.surgeries && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#0ea5e9]/15 text-[#0ea5e9]">Cirugías: {brief.patient.surgeries}</span>}
                </div>

                <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-3 mb-3">
                  <p className="text-[10px] font-mono text-[#00e5a0] tracking-wider mb-1">RESUMEN (IA)</p>
                  <p className="text-sm text-[#dde6ef] whitespace-pre-wrap leading-relaxed">{brief.resumen_ia}</p>
                </div>

                <p className="text-[10px] font-mono text-[#7a95aa] tracking-wider mb-1.5">NOTAS DEL EQUIPO</p>
                {(!brief.notas || brief.notas.length === 0) ? (
                  <p className="text-xs text-[#3d5870]">Sin notas registradas.</p>
                ) : (
                  <div className="space-y-1.5">
                    {brief.notas.map((n: any, i: number) => {
                      const a = AUD[n.author_role] || { label: n.author_role || 'Nota', color: '#7a95aa' };
                      return (
                        <div key={i} className="bg-[#111820] rounded-lg px-3 py-2">
                          <p className="text-[10px] mb-0.5" style={{ color: a.color }}>{a.label} · {fecha(n.created_at)}</p>
                          <p className="text-sm text-[#dde6ef] whitespace-pre-wrap">{n.content}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <div className="flex-1" />
                  <button onClick={() => router.push(`/dashboard/patient/${brief.patient?.id}`)} className="px-4 py-2 rounded-lg text-sm text-[#0ea5e9] border border-[#0ea5e9]/40">Abrir ficha completa</button>
                  <button onClick={() => setBrief(null)} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#00e5a0', color: '#000' }}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
