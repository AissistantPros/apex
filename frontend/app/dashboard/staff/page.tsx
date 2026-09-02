'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getUser } from '@/app/lib/auth';
import { ROLE_LABELS, ROLE_COLORS, AREA_LABELS, UserRole, Area, PermLevel } from '@/app/lib/role';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}
async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
  return res.json();
}

const C = { card: '#0d1520', border: '#1e2d3d', text: '#dde6ef', muted: '#7a95aa', faint: '#3d5870', green: '#00e5a0', red: '#f43f5e' };
const inp = 'w-full bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2.5 text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870] text-sm';
const btn = 'px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40';

// Roles que el médico puede asignar (no puede crear otro "doctor" dueño)
const ASSIGNABLE: UserRole[] = ['receptionist', 'nurse', 'accounting', 'marketing'];
const LEVELS: { v: PermLevel; l: string }[] = [
  { v: 'none', l: 'Sin acceso' }, { v: 'view', l: 'Ver' }, { v: 'edit', l: 'Ver y editar' },
];

// Descripción corta de cada rol
const ROLE_DESC: Record<string, string> = {
  receptionist: 'Cobra en recepción. No ve diagnósticos.',
  nurse: 'Toma signos y datos del paciente. No ve finanzas.',
  accounting: 'Ve finanzas, gastos y cobros. No ve diagnósticos.',
  marketing: 'Ve el ROI de publicidad y captación. No ve pacientes ni cobros.',
};

function LevelPicker({ value, onChange }: { value: PermLevel; onChange: (v: PermLevel) => void }) {
  return (
    <div className="flex gap-1">
      {LEVELS.map(({ v, l }) => (
        <button key={v} onClick={() => onChange(v)}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition"
          style={{
            background: value === v ? (v === 'none' ? '#2a3a4d' : v === 'edit' ? C.green : '#0ea5e9') : '#111820',
            color: value === v ? (v === 'none' ? C.muted : '#000') : C.faint,
          }}>{l}</button>
      ))}
    </div>
  );
}

export default function StaffPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<any[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [defaults, setDefaults] = useState<Record<string, Record<string, PermLevel>>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  // Alta
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<UserRole>('receptionist');
  const [perms, setPerms] = useState<Record<string, PermLevel>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api('/staff/defaults'), api('/staff')]);
      setAreas(d.areas || []); setDefaults(d.defaults || {});
      setStaff(s.staff || []);
    } catch (e: any) {
      if (String(e.message).includes('403') || /permiso/i.test(e.message)) setDenied(true);
      else setMsg(e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { getUser().then(u => { if (!u && typeof window !== 'undefined') { /* demo sin login usa médico */ } }); load(); }, [load]);

  // Al cambiar de rol en el alta, precargar sus permisos por defecto
  useEffect(() => { if (defaults[rol]) setPerms({ ...defaults[rol] }); }, [rol, defaults]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  const crear = async () => {
    if (!nombre || !email || password.length < 6) return flash('Nombre, correo y contraseña (mín. 6) requeridos');
    setBusy(true);
    try {
      await api('/staff', { method: 'POST', body: JSON.stringify({ nombre, email, password, role: rol, permissions: perms }) });
      setNombre(''); setEmail(''); setPassword(''); flash('Miembro del equipo creado'); load();
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const savePerms = async (m: any, nuevos: Record<string, PermLevel>, nuevoRol?: string) => {
    try { await api(`/staff/${m.id}/permissions`, { method: 'PUT', body: JSON.stringify({ role: nuevoRol || m.role, permissions: nuevos }) }); load(); }
    catch (e: any) { flash(e.message); }
  };
  const del = async (m: any) => { if (!confirm(`¿Eliminar a ${m.display_name}?`)) return; try { await api(`/staff/${m.id}`, { method: 'DELETE' }); load(); } catch (e: any) { flash(e.message); } };

  if (denied) return (
    <div className="min-h-screen bg-[#070a0e]"><main className="page-content pt-16 px-6 py-10">
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-10 text-center max-w-md mx-auto">
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-[#dde6ef] font-semibold mb-1">Solo el médico gestiona al equipo</p>
        <p className="text-sm text-[#7a95aa]">Tu cuenta no tiene permiso para administrar al personal.</p>
      </div></main></div>
  );

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-10 max-w-5xl mx-auto">
        <h1 className="text-2xl font-serif font-semibold text-[#dde6ef] mb-1">🩺 Gestión de equipo</h1>
        <p className="text-[#7a95aa] mb-6 text-sm">Da de alta a tu personal con su propio acceso y define qué puede ver y editar cada quien.</p>

        {msg && <div className="mb-4 text-sm px-4 py-2.5 rounded-xl" style={{ background: 'rgba(0,229,160,.1)', border: `1px solid ${C.green}44`, color: C.green }}>{msg}</div>}

        {/* Alta */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 mb-6">
          <p className="text-xs font-mono text-[#00e5a0] tracking-wider mb-3">DAR DE ALTA UN MIEMBRO</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            <input className={inp} placeholder="Nombre completo" value={nombre} onChange={e => setNombre(e.target.value)} />
            <input className={inp} placeholder="Correo (su usuario)" value={email} onChange={e => setEmail(e.target.value)} />
            <input className={inp} type="password" placeholder="Contraseña temporal" value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          <label className="text-[10px] font-mono text-[#7a95aa] block mb-1.5">ROL</label>
          <div className="flex flex-wrap gap-2 mb-1">
            {ASSIGNABLE.map(r => (
              <button key={r} onClick={() => setRol(r)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition"
                style={{ background: rol === r ? ROLE_COLORS[r] : '#111820', borderColor: rol === r ? ROLE_COLORS[r] : '#2a3a4d', color: rol === r ? '#000' : C.text }}>
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#7a95aa] mb-4">{ROLE_DESC[rol]}</p>

          {/* Matriz de permisos */}
          <p className="text-[10px] font-mono text-[#7a95aa] mb-2">PERMISOS (puedes ajustar los que trae el rol)</p>
          <div className="space-y-2 mb-4">
            {areas.map(a => (
              <div key={a} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2">
                <span className="text-sm text-[#dde6ef]">{AREA_LABELS[a] || a}</span>
                <LevelPicker value={perms[a] || 'none'} onChange={v => setPerms(p => ({ ...p, [a]: v }))} />
              </div>
            ))}
          </div>
          <button onClick={crear} disabled={busy} className={btn} style={{ background: C.green, color: '#000' }}>
            {busy ? 'Creando…' : 'Crear acceso'}
          </button>
        </div>

        {/* Equipo actual */}
        <p className="text-xs font-mono text-[#3d5870] tracking-wider mb-3">EQUIPO</p>
        {loading ? <p className="text-sm text-[#7a95aa]">Cargando…</p> :
          staff.length === 0 ? (
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-8 text-center">
              <p className="text-3xl mb-2">👥</p><p className="text-sm text-[#7a95aa]">Aún no has dado de alta a nadie.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {staff.filter(m => m.role !== 'doctor').map(m => <StaffCard key={m.id} m={m} areas={areas} onSave={savePerms} onDelete={del} />)}
            </div>
          )}
      </main>
    </div>
  );
}

function StaffCard({ m, areas, onSave, onDelete }:
  { m: any; areas: Area[]; onSave: (m: any, p: Record<string, PermLevel>, r?: string) => void; onDelete: (m: any) => void }) {
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState<Record<string, PermLevel>>(m.permissions || {});
  const color = ROLE_COLORS[m.role as UserRole] || '#7a95aa';
  const dirty = JSON.stringify(perms) !== JSON.stringify(m.permissions || {});
  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: color + '22', color }}>{(m.display_name || '?')[0]?.toUpperCase()}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#dde6ef] truncate">{m.display_name}</p>
            <p className="text-[11px] text-[#7a95aa] truncate">{m.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: color + '1a', color }}>{ROLE_LABELS[m.role as UserRole] || m.role}</span>
          <button onClick={() => setOpen(o => !o)} className="text-xs text-[#0ea5e9] px-2">{open ? 'Cerrar' : 'Permisos'}</button>
          <button onClick={() => onDelete(m)} className="text-[#f43f5e] text-lg leading-none px-1">×</button>
        </div>
      </div>
      {open && (
        <div className="border-t border-[#1e2d3d] px-4 py-3 space-y-2">
          {areas.map(a => (
            <div key={a} className="flex items-center justify-between">
              <span className="text-sm text-[#dde6ef]">{AREA_LABELS[a] || a}</span>
              <LevelPicker value={perms[a] || 'none'} onChange={v => setPerms(p => ({ ...p, [a]: v }))} />
            </div>
          ))}
          {dirty && (
            <div className="flex justify-end pt-1">
              <button onClick={() => onSave(m, perms)} className={btn} style={{ background: C.green, color: '#000' }}>Guardar permisos</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
