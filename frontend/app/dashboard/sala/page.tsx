'use client';

/**
 * Sala de espera EN VIVO — pacientes que están siendo atendidos ahora y esperan la
 * siguiente etapa (recepción → enfermería → doctor). Es distinta de "Próximos"
 * (que es por agenda/citas). Enfermería ve su cola; el doctor ve la suya y, si la
 * clínica no tiene enfermera, absorbe también la de enfermería.
 *
 * Privacidad: la tarjeta muestra solo datos de seguridad (alergias) y la nota de
 * recepción; el resumen clínico con IA (historial) sigue siendo exclusivo del doctor.
 */

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

const STAGE: Record<string, { label: string; color: string; phase: number }> = {
  nursing: { label: 'Espera enfermería', color: '#f97316', phase: 2 },
  doctor:  { label: 'Espera doctor',     color: '#a78bfa', phase: 3 },
};

const espera = (iso?: string) => {
  if (!iso) return '';
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h ${min % 60} min`;
};

export default function SalaPage() {
  const router = useRouter();
  const [waiting, setWaiting] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [brief, setBrief] = useState<any>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  const load = () => api('/appointments/waitroom')
    .then(d => { setWaiting(d.waiting || []); setLoading(false); })
    .catch(e => { flash(e.message); setLoading(false); });

  useEffect(() => {
    const role = getRole();
    if (role !== 'doctor' && role !== 'nurse') { router.replace('/dashboard'); return; }
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  const atender = (p: any) => {
    const ph = STAGE[p.stage]?.phase || 2;
    router.push(`/dashboard/new-patient/flow?patient_id=${p.id}&phase=${ph}`);
  };

  const verResumen = async (p: any) => {
    setBrief({ loading: true, p });
    setBriefLoading(true);
    try { const d = await api(`/appointments/patient-brief/${p.id}`); setBrief({ ...d, p }); }
    catch (e: any) { flash(e.message); setBrief(null); } finally { setBriefLoading(false); }
  };

  const isDoctor = getRole() === 'doctor';

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-2xl font-serif font-semibold text-[#dde6ef]">🛎️ Sala de espera</h1>
          {waiting.length > 0 && (
            <span className="text-xs font-mono px-2.5 py-1 rounded-full" style={{ color: '#00e5a0', background: 'rgba(0,229,160,.10)', border: '1px solid rgba(0,229,160,.30)' }}>
              {waiting.length} esperando
            </span>
          )}
        </div>
        <p className="text-sm text-[#7a95aa] mb-5">Pacientes en atención ahora mismo, en orden de llegada. La lista se actualiza sola.</p>
        {msg && <div className="mb-4 text-sm px-4 py-2.5 rounded-xl bg-[rgba(244,63,94,.1)] border border-[#f43f5e44] text-[#f43f5e]">{msg}</div>}

        {loading ? <p className="text-[#7a95aa] text-sm">Cargando…</p> : waiting.length === 0 ? (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-8 text-center text-[#7a95aa]">
            No hay pacientes esperando en este momento.
          </div>
        ) : (
          <div className="space-y-2.5">
            {waiting.map((p, i) => {
              const st = STAGE[p.stage] || { label: p.stage, color: '#7a95aa', phase: 2 };
              return (
                <div key={p.id} className="bg-[#0d1520] border rounded-2xl p-4 flex items-center gap-4"
                  style={{ borderColor: i === 0 ? '#00e5a0' : '#1e2d3d' }}>
                  <div className="text-center shrink-0 w-9">
                    <p className="text-lg font-bold" style={{ color: i === 0 ? '#00e5a0' : '#dde6ef' }}>{i + 1}</p>
                    {i === 0 && <p className="text-[9px] font-mono text-[#00e5a0]">SIGUE</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-[#dde6ef] truncate">{p.full_name || 'Paciente'}</p>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ color: st.color, background: `${st.color}1a` }}>{st.label}</span>
                      {p.care_type === 'funcional_longevidad' && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full text-[#a78bfa] bg-[#a78bfa]/15">Funcional/Longevidad</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#7a95aa] mt-0.5">
                      {p.edad != null && <span>{p.edad} años</span>}
                      <span>{espera(p.esperando_desde)}</span>
                      {p.alergias && <span className="text-[#f43f5e]">⚠ Alergias: {p.alergias}</span>}
                    </div>
                    {p.nota_recepcion && (
                      <p className="text-[11px] text-[#7a95aa] mt-1 line-clamp-2"><span className="text-[#0ea5e9]">Recepción:</span> {p.nota_recepcion}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button onClick={() => atender(p)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#00e5a0', color: '#000' }}>Atender</button>
                    {isDoctor && p.stage === 'doctor' && (
                      <button onClick={() => verResumen(p)} className="px-3 py-1.5 rounded-lg text-xs text-[#a78bfa] border border-[#a78bfa]/40">Ver resumen</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Resumen del paciente (solo doctor) */}
      {brief && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={() => setBrief(null)}>
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {brief.loading || briefLoading ? (
              <p className="text-[#7a95aa] text-sm py-8 text-center">🧠 Generando resumen con IA…</p>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <p className="font-semibold text-[#dde6ef] text-lg">{brief.patient?.full_name}</p>
                  {brief.patient?.edad != null && <span className="text-sm text-[#7a95aa]">{brief.patient.edad} años</span>}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {brief.patient?.allergies_medications && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f43f5e]/15 text-[#f43f5e]">Alergias: {brief.patient.allergies_medications}</span>}
                  {brief.patient?.chronic_diseases && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f59e0b]/15 text-[#f59e0b]">Crónicas: {brief.patient.chronic_diseases}</span>}
                </div>
                <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-3 mb-3">
                  <p className="text-[10px] font-mono text-[#a78bfa] tracking-wider mb-1">RESUMEN (IA)</p>
                  <p className="text-sm text-[#dde6ef] whitespace-pre-wrap leading-relaxed">{brief.resumen_ia}</p>
                </div>
                <div className="flex gap-2 mt-4">
                  <div className="flex-1" />
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
