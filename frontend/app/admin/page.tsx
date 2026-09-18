'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, signOut } from '@/app/lib/auth';
import { getRole, clearRoleCache } from '@/app/lib/role';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const C = {
  bg: '#070a0e', card: '#0d1520', border: '#1e2d3d', text: '#dde6ef',
  muted: '#7a95aa', faint: '#3d5870', green: '#00e5a0', red: '#f43f5e',
};
const inp = 'w-full px-3.5 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870]';
const btn = 'px-4 py-2.5 rounded-xl text-sm font-semibold transition';

const ROLE_LABEL: Record<string, string> = {
  doctor: 'Médico', receptionist: 'Recepción', nurse: 'Enfermería',
  accounting: 'Contabilidad', marketing: 'Marketing',
};
const ROLE_COLOR: Record<string, string> = {
  doctor: '#a78bfa', receptionist: '#0ea5e9', nurse: '#f97316',
  accounting: '#00e5a0', marketing: '#f472b6',
};

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}
async function api(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
  return r.json();
}

type Clinic = { id: string; name: string; website?: string; address?: string; phone?: string; email?: string; logo_url?: string; locations_count?: number; users_count?: number };
type Loc = { id: string; name: string; phone?: string; address?: string };
type User = { id: string; display_name: string; username?: string; email?: string; role: string; is_local_admin?: boolean; parent_doctor_id?: string | null; location_ids?: string[] };

// ─── Modal de credenciales (se muestran una sola vez) ──────────────────────────
function CredModal({ cred, onClose }: { cred: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d1520] border border-[#00e5a0]/40 rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <p className="text-4xl text-center mb-2">🔑</p>
        <p className="text-center font-semibold text-[#dde6ef] mb-1">Credenciales de {cred.nombre || 'la cuenta'}</p>
        <p className="text-center text-[11px] text-[#f59e0b] mb-4">Anótalas ahora — la contraseña no se vuelve a mostrar.</p>
        <div className="space-y-2">
          <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-4 py-3">
            <p className="text-[10px] font-mono text-[#7a95aa] uppercase">Usuario</p>
            <p className="text-[#dde6ef] font-mono text-sm select-all">{cred.usuario}</p>
          </div>
          <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-4 py-3">
            <p className="text-[10px] font-mono text-[#7a95aa] uppercase">Contraseña</p>
            <p className="text-[#00e5a0] font-mono text-base font-bold select-all">{cred.password}</p>
          </div>
        </div>
        <button onClick={onClose} className={`${btn} w-full mt-4`} style={{ background: C.green, color: '#000' }}>Listo, la guardé</button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [ov, setOv] = useState<any>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ clinic: Clinic; locations: Loc[]; users: User[] } | null>(null);
  const [cred, setCred] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  // Guard: solo admin proveedor
  useEffect(() => {
    (async () => {
      const s = await getSession().catch(() => null);
      if (!s) { router.replace('/auth/login'); return; }
      if (getRole() !== 'admin') { router.replace('/dashboard'); return; }
      setReady(true);
    })();
  }, [router]);

  const loadClinics = useCallback(async () => {
    try {
      const [o, c] = await Promise.all([api('/admin/overview'), api('/admin/clinics')]);
      setOv(o); setClinics(c.clinics || []);
    } catch (e: any) { flash(e.message); }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try { setDetail(await api(`/admin/clinics/${id}`)); } catch (e: any) { flash(e.message); }
  }, []);

  useEffect(() => { if (ready) loadClinics(); }, [ready, loadClinics]);
  useEffect(() => { if (sel) loadDetail(sel); else setDetail(null); }, [sel, loadDetail]);

  if (!ready) return <div className="min-h-screen bg-[#070a0e] flex items-center justify-center text-[#7a95aa]">Cargando…</div>;

  return (
    <div className="min-h-screen bg-[#070a0e] text-[#dde6ef]">
      {/* Barra superior */}
      <header className="sticky top-0 z-40 h-14 bg-[rgba(7,10,14,.97)] border-b border-[#1e2d3d] backdrop-blur flex items-center px-6 gap-3">
        <span className="text-[#f43f5e] text-lg">◆</span>
        <div>
          <p className="text-sm font-semibold leading-none">APEX · Panel del proveedor</p>
          <p className="text-[10px] text-[#7a95aa] mt-0.5">Administración global — no muestra datos clínicos de pacientes</p>
        </div>
        <div className="flex-1" />
        <button onClick={async () => { clearRoleCache(); await signOut(); router.push('/auth/login'); }}
          className="text-xs font-mono text-[#7a95aa] hover:text-[#f43f5e] transition">Salir</button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {msg && <div className="mb-4 text-sm px-4 py-2.5 rounded-xl" style={{ background: 'rgba(244,63,94,.1)', border: `1px solid ${C.red}44`, color: C.red }}>{msg}</div>}

        {/* Overview */}
        {ov && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[['Clínicas', ov.clinics], ['Ubicaciones', ov.locations], ['Usuarios', ov.users], ['Tickets abiertos', ov.open_tickets]].map(([l, v]: any) => (
              <div key={l} className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl px-4 py-3.5">
                <p className="text-[10px] font-mono tracking-wider text-[#7a95aa] uppercase">{l}</p>
                <p className="mt-1 font-bold text-2xl" style={{ color: C.green }}>{v}</p>
              </div>
            ))}
          </div>
        )}

        {!sel ? (
          <ClinicsList clinics={clinics} onSelect={setSel} onCreated={loadClinics} flash={flash} />
        ) : detail ? (
          <ClinicDetail
            detail={detail}
            onBack={() => setSel(null)}
            reload={() => { loadDetail(sel); loadClinics(); }}
            onCred={setCred}
            flash={flash}
          />
        ) : <p className="text-[#7a95aa] text-sm">Cargando clínica…</p>}
      </main>

      {cred && <CredModal cred={cred} onClose={() => setCred(null)} />}
    </div>
  );
}

// ─── Lista de clínicas + alta ──────────────────────────────────────────────────
function ClinicsList({ clinics, onSelect, onCreated, flash }:
  { clinics: Clinic[]; onSelect: (id: string) => void; onCreated: () => void; flash: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ name: '', website: '', address: '', phone: '', email: '', logo_url: '' });
  const [busy, setBusy] = useState(false);

  const crear = async () => {
    if (!f.name.trim()) return flash('El nombre de la clínica es requerido');
    setBusy(true);
    try { await api('/admin/clinics', { method: 'POST', body: JSON.stringify(f) }); setOpen(false); setF({ name: '', website: '', address: '', phone: '', email: '', logo_url: '' }); onCreated(); }
    catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-serif font-semibold">Clínicas</h1>
        <button onClick={() => setOpen(o => !o)} className={btn} style={{ background: C.green, color: '#000' }}>
          {open ? 'Cancelar' : '+ Nueva clínica'}
        </button>
      </div>

      {open && (
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 mb-5 space-y-2">
          <p className="text-xs font-mono text-[#00e5a0] tracking-wider mb-1">DATOS PRINCIPALES DE LA CLÍNICA</p>
          <input className={inp} placeholder="Nombre (ej. Clínica de Longevidad Cancún)" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={inp} placeholder="Sitio web" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} />
            <input className={inp} placeholder="Teléfono principal" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
          </div>
          <input className={inp} placeholder="Dirección principal" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={inp} placeholder="Correo de contacto" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
            <input className={inp} placeholder="URL del logotipo (opcional)" value={f.logo_url} onChange={e => setF({ ...f, logo_url: e.target.value })} />
          </div>
          <button onClick={crear} disabled={busy} className={`${btn} w-full`} style={{ background: C.green, color: '#000' }}>
            {busy ? 'Creando…' : 'Crear clínica'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {clinics.length === 0 && <p className="text-[#3d5870] text-sm">Aún no hay clínicas. Crea la primera.</p>}
        {clinics.map(c => (
          <button key={c.id} onClick={() => onSelect(c.id)}
            className="w-full flex items-center gap-4 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl px-5 py-4 hover:border-[#00e5a0]/40 transition text-left">
            <span className="w-11 h-11 rounded-xl bg-[#00e5a0]/15 flex items-center justify-center text-lg shrink-0">🏥</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{c.name}</p>
              <p className="text-[12px] text-[#7a95aa] truncate">{c.address || 'Sin dirección'}</p>
            </div>
            <div className="text-right text-[11px] text-[#7a95aa] font-mono shrink-0">
              <p>{c.locations_count ?? 0} ubicaciones</p>
              <p>{c.users_count ?? 0} usuarios</p>
            </div>
            <span className="text-[#3d5870]">›</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ─── Detalle de una clínica: ubicaciones + personal ────────────────────────────
function ClinicDetail({ detail, onBack, reload, onCred, flash }:
  { detail: { clinic: Clinic; locations: Loc[]; users: User[] }; onBack: () => void; reload: () => void; onCred: (c: any) => void; flash: (t: string) => void }) {
  const { clinic, locations, users } = detail;
  const [locOpen, setLocOpen] = useState(false);
  const [lf, setLf] = useState<any>({ name: '', phone: '', address: '' });
  const [userOpen, setUserOpen] = useState(false);
  const hasDoctor = users.some(u => u.role === 'doctor');
  const [uf, setUf] = useState<any>({ nombre: '', role: 'doctor', is_local_admin: false, location_ids: [] as string[] });
  const [busy, setBusy] = useState(false);

  const addLoc = async () => {
    if (!lf.name.trim()) return flash('Nombre de la ubicación requerido');
    try { await api(`/admin/clinics/${clinic.id}/locations`, { method: 'POST', body: JSON.stringify(lf) }); setLf({ name: '', phone: '', address: '' }); setLocOpen(false); reload(); }
    catch (e: any) { flash(e.message); }
  };
  const delLoc = async (id: string) => {
    if (!confirm('¿Eliminar esta ubicación?')) return;
    try { await api(`/admin/locations/${id}`, { method: 'DELETE' }); reload(); } catch (e: any) { flash(e.message); }
  };
  const addUser = async () => {
    if (!uf.nombre.trim()) return flash('Nombre requerido');
    setBusy(true);
    try {
      const r = await api(`/admin/clinics/${clinic.id}/users`, { method: 'POST', body: JSON.stringify(uf) });
      onCred({ usuario: r.usuario, password: r.password, nombre: r.nombre });
      setUf({ nombre: '', role: hasDoctor ? 'receptionist' : 'doctor', is_local_admin: false, location_ids: [] });
      setUserOpen(false); reload();
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };
  const regen = async (u: User) => {
    if (!confirm(`¿Generar nueva contraseña para ${u.display_name}? La actual dejará de servir.`)) return;
    try { const r = await api(`/admin/users/${u.id}/password`, { method: 'POST' }); onCred({ usuario: r.usuario, password: r.password, nombre: u.display_name }); }
    catch (e: any) { flash(e.message); }
  };
  const toggleLoc = (id: string) =>
    setUf((p: any) => ({ ...p, location_ids: p.location_ids.includes(id) ? p.location_ids.filter((x: string) => x !== id) : [...p.location_ids, id] }));

  return (
    <>
      <button onClick={onBack} className="text-[#00e5a0] text-sm mb-4">‹ Todas las clínicas</button>
      <h1 className="text-2xl font-serif font-semibold mb-1">{clinic.name}</h1>
      <p className="text-sm text-[#7a95aa] mb-6">{clinic.address || 'Sin dirección'} · {clinic.phone || 's/tel'}</p>

      {/* Ubicaciones */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#dde6ef]">📍 Ubicaciones ({locations.length})</h2>
          <button onClick={() => setLocOpen(o => !o)} className={`${btn} text-xs`} style={{ background: '#111820', border: `1px solid ${C.border}`, color: C.green }}>
            {locOpen ? 'Cancelar' : '+ Agregar ubicación'}
          </button>
        </div>
        {locOpen && (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 mb-3 space-y-2">
            <input className={inp} placeholder="Nombre de la ubicación (ej. Cancún Centro)" value={lf.name} onChange={e => setLf({ ...lf, name: e.target.value })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className={inp} placeholder="Teléfono" value={lf.phone} onChange={e => setLf({ ...lf, phone: e.target.value })} />
              <input className={inp} placeholder="Dirección" value={lf.address} onChange={e => setLf({ ...lf, address: e.target.value })} />
            </div>
            <button onClick={addLoc} className={`${btn} w-full`} style={{ background: C.green, color: '#000' }}>Guardar ubicación</button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {locations.map(l => (
            <div key={l.id} className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-lg">📍</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{l.name}</p>
                <p className="text-[11px] text-[#7a95aa] truncate">{l.phone || 's/tel'} · {l.address || 's/dir'}</p>
              </div>
              <button onClick={() => delLoc(l.id)} className="text-[#f43f5e] text-xs hover:underline">Eliminar</button>
            </div>
          ))}
          {locations.length === 0 && <p className="text-[#3d5870] text-sm">Sin ubicaciones aún.</p>}
        </div>
      </section>

      {/* Personal */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#dde6ef]">👥 Personal ({users.length})</h2>
          <button onClick={() => { setUf((p: any) => ({ ...p, role: hasDoctor ? 'receptionist' : 'doctor' })); setUserOpen(o => !o); }}
            className={`${btn} text-xs`} style={{ background: '#111820', border: `1px solid ${C.border}`, color: C.green }}>
            {userOpen ? 'Cancelar' : '+ Dar de alta personal'}
          </button>
        </div>

        {!hasDoctor && (
          <p className="text-[12px] text-[#f59e0b] mb-3">⚠️ Esta clínica aún no tiene doctor. Empieza dando de alta al médico principal.</p>
        )}

        {userOpen && (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 mb-3 space-y-3">
            <input className={inp} placeholder="Nombre completo" value={uf.nombre} onChange={e => setUf({ ...uf, nombre: e.target.value })} />
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">Rol</label>
              <div className="flex flex-wrap gap-2">
                {['doctor', 'receptionist', 'nurse', 'accounting', 'marketing'].map(r => (
                  <button key={r} onClick={() => setUf({ ...uf, role: r })}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition"
                    style={{ background: uf.role === r ? ROLE_COLOR[r] : '#111820', borderColor: uf.role === r ? ROLE_COLOR[r] : '#2a3a4d', color: uf.role === r ? '#000' : C.text }}>
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            {uf.role !== 'doctor' && (
              <label className="flex items-center gap-2 text-sm text-[#dde6ef] cursor-pointer">
                <input type="checkbox" checked={uf.is_local_admin} onChange={e => setUf({ ...uf, is_local_admin: e.target.checked })} />
                Admin local (puede administrar staff — nunca ve historial clínico)
              </label>
            )}
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">Ubicaciones donde trabaja</label>
              <div className="flex flex-wrap gap-2">
                {locations.map(l => (
                  <button key={l.id} onClick={() => toggleLoc(l.id)}
                    className="px-3 py-1.5 rounded-lg text-xs border transition"
                    style={{ background: uf.location_ids.includes(l.id) ? C.green : '#111820', borderColor: uf.location_ids.includes(l.id) ? C.green : '#2a3a4d', color: uf.location_ids.includes(l.id) ? '#000' : C.text }}>
                    {l.name}
                  </button>
                ))}
                {locations.length === 0 && <span className="text-[11px] text-[#3d5870]">Crea ubicaciones primero.</span>}
              </div>
            </div>
            <button onClick={addUser} disabled={busy} className={`${btn} w-full`} style={{ background: C.green, color: '#000' }}>
              {busy ? 'Creando…' : 'Crear cuenta y generar credenciales'}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {users.map(u => {
            const principal = u.role === 'doctor' && !u.parent_doctor_id;
            return (
              <div key={u.id} className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: (ROLE_COLOR[u.role] || '#7a95aa') + '22', color: ROLE_COLOR[u.role] || '#7a95aa' }}>
                  {(u.display_name || '?')[0]?.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {u.display_name}
                    {principal && <span className="ml-2 text-[10px] text-[#f59e0b]">★ doctor principal</span>}
                    {u.is_local_admin && <span className="ml-2 text-[10px] text-[#0ea5e9]">admin local</span>}
                  </p>
                  <p className="text-[11px] text-[#7a95aa] truncate font-mono">
                    {u.username || u.email} · {ROLE_LABEL[u.role] || u.role}
                  </p>
                </div>
                <button onClick={() => regen(u)} className="text-[#0ea5e9] text-xs hover:underline shrink-0">Regenerar contraseña</button>
              </div>
            );
          })}
          {users.length === 0 && <p className="text-[#3d5870] text-sm">Sin personal aún.</p>}
        </div>
      </section>
    </>
  );
}
