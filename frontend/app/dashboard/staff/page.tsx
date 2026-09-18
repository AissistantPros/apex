'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSession } from '@/app/lib/auth';
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

const C = { text: '#dde6ef', muted: '#7a95aa', faint: '#3d5870', green: '#00e5a0', red: '#f43f5e' };
const inp = 'w-full bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2.5 text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870] text-sm';
const btn = 'px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40';

const ASSIGNABLE: UserRole[] = ['receptionist', 'nurse', 'accounting', 'marketing'];
const LEVELS: { v: PermLevel; l: string }[] = [
  { v: 'none', l: 'Sin acceso' }, { v: 'view', l: 'Ver' }, { v: 'edit', l: 'Editar' },
];
const ROLE_DESC: Record<string, string> = {
  receptionist: 'Alta y cobro de pacientes, gastos y envío de prescripción. No ve historial clínico.',
  nurse: 'Solo captura y ve los datos de enfermería. Nada más.',
  accounting: 'Ve y descarga ingresos y gastos. No ve datos clínicos.',
  marketing: 'Ve el ROI y captura cada mes los resultados de campañas. No ve pacientes ni cobros.',
};
const METODOS = ['efectivo', 'tarjeta', 'transferencia'];

function LevelPicker({ value, onChange }: { value: PermLevel; onChange: (v: PermLevel) => void }) {
  return (
    <div className="flex gap-1">
      {LEVELS.map(({ v, l }) => (
        <button key={v} onClick={() => onChange(v)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition"
          style={{ background: value === v ? (v === 'none' ? '#2a3a4d' : v === 'edit' ? C.green : '#0ea5e9') : '#111820', color: value === v ? (v === 'none' ? C.muted : '#000') : C.faint }}>{l}</button>
      ))}
    </div>
  );
}

// Alcance de ingresos para Contabilidad
function ScopeConfig({ scope, onChange }: { scope: any; onChange: (s: any) => void }) {
  const metodos: string[] = Array.isArray(scope?.metodos) ? scope.metodos : [];
  const todos = !scope?.metodos || scope.metodos === 'todos';
  return (
    <div className="bg-[#111820] border border-[#00e5a0]/20 rounded-xl px-3 py-3 mt-2 space-y-2">
      <p className="text-[10px] font-mono text-[#00e5a0] tracking-wider">ALCANCE DE INGRESOS (CONTABILIDAD)</p>
      <label className="flex items-center gap-2 text-sm text-[#dde6ef]">
        <input type="checkbox" checked={!!scope?.solo_facturado} onChange={e => onChange({ ...scope, solo_facturado: e.target.checked })} />
        Solo ver ingresos facturados
      </label>
      <div>
        <p className="text-[11px] text-[#7a95aa] mb-1">Métodos de pago visibles</p>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => onChange({ ...scope, metodos: 'todos' })} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
            style={{ background: todos ? C.green : '#0d1520', color: todos ? '#000' : C.muted }}>Todos</button>
          {METODOS.map(m => {
            const on = !todos && metodos.includes(m);
            return <button key={m} onClick={() => { const base = todos ? [] : [...metodos]; const nx = on ? base.filter(x => x !== m) : [...base, m]; onChange({ ...scope, metodos: nx.length ? nx : 'todos' }); }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize" style={{ background: on ? '#0ea5e9' : '#0d1520', color: on ? '#000' : C.muted }}>{m}</button>;
          })}
        </div>
      </div>
    </div>
  );
}

// Modal de credenciales (se muestra una sola vez)
function CredModal({ cred, onClose }: { cred: { usuario: string; password: string; nombre?: string; regen?: boolean }; onClose: () => void }) {
  const [copied, setCopied] = useState('');
  const copy = (t: string, k: string) => { navigator.clipboard?.writeText(t); setCopied(k); setTimeout(() => setCopied(''), 1500); };
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d1520] border border-[#00e5a0]/40 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <p className="text-lg font-semibold text-[#dde6ef] mb-1">{cred.regen ? 'Nueva contraseña' : 'Acceso creado'}{cred.nombre ? ` — ${cred.nombre}` : ''}</p>
        <p className="text-xs text-[#f59e0b] mb-4">⚠ Guárdala ahora. Por seguridad no se puede volver a ver; solo se puede generar una nueva.</p>
        {[['Usuario', cred.usuario, 'u'], ['Contraseña', cred.password, 'p']].map(([label, val, k]) => (
          <div key={k} className="mb-3">
            <p className="text-[10px] font-mono text-[#7a95aa] mb-1">{label}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[#111820] border border-[#1e2d3d] rounded-lg px-3 py-2 text-sm text-[#dde6ef] font-mono break-all">{val}</code>
              <button onClick={() => copy(val as string, k as string)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: copied === k ? C.green : '#1e2d3d', color: copied === k ? '#000' : C.text }}>{copied === k ? '✓' : 'Copiar'}</button>
            </div>
          </div>
        ))}
        <button onClick={onClose} className={`${btn} w-full mt-2`} style={{ background: C.green, color: '#000' }}>Listo, la guardé</button>
      </div>
    </div>
  );
}

export default function StaffPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [defaults, setDefaults] = useState<Record<string, Record<string, PermLevel>>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [cred, setCred] = useState<any>(null);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<UserRole>('receptionist');
  const [perms, setPerms] = useState<Record<string, PermLevel>>({});
  const [scope, setScope] = useState<any>({ solo_facturado: false, metodos: 'todos' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api('/staff/defaults'), api('/staff')]);
      setAreas(d.areas || []); setDefaults(d.defaults || {}); setStaff(s.staff || []);
    } catch (e: any) {
      if (String(e.message).includes('403') || /permiso/i.test(e.message)) setDenied(true); else setMsg(e.message);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (defaults[rol]) setPerms({ ...defaults[rol] }); }, [rol, defaults]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  const crear = async () => {
    if (!nombre) return flash('El nombre es requerido');
    setBusy(true);
    try {
      const body: any = { nombre, email: email || null, role: rol, permissions: { ...perms } };
      if (rol === 'accounting') body.permissions.ingresos_scope = scope;
      const r = await api('/staff', { method: 'POST', body: JSON.stringify(body) });
      setCred({ usuario: r.usuario, password: r.password, nombre });
      setNombre(''); setEmail(''); load();
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const savePerms = async (m: any, nuevos: Record<string, PermLevel>) => {
    try { await api(`/staff/${m.id}/permissions`, { method: 'PUT', body: JSON.stringify({ role: m.role, permissions: nuevos }) }); flash('Permisos actualizados'); load(); }
    catch (e: any) { flash(e.message); }
  };
  const regen = async (m: any) => {
    if (!confirm(`¿Generar una nueva contraseña para ${m.display_name}? La actual dejará de funcionar.`)) return;
    try { const r = await api(`/staff/${m.id}/password`, { method: 'POST' }); setCred({ usuario: r.usuario, password: r.password, nombre: m.display_name, regen: true }); }
    catch (e: any) { flash(e.message); }
  };
  const del = async (m: any) => { if (!confirm(`¿Eliminar a ${m.display_name}?`)) return; try { await api(`/staff/${m.id}`, { method: 'DELETE' }); load(); } catch (e: any) { flash(e.message); } };
  const saveData = async (m: any, data: any) => {
    try { await api(`/staff/${m.id}/profile`, { method: 'PUT', body: JSON.stringify(data) }); flash('Datos actualizados'); load(); }
    catch (e: any) { flash(e.message); }
  };

  if (denied) return (
    <div className="min-h-screen bg-[#070a0e]"><main className="page-content pt-16 px-6 py-10">
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-10 text-center max-w-md mx-auto">
        <p className="text-4xl mb-3">🔒</p><p className="text-[#dde6ef] font-semibold mb-1">Solo el médico gestiona al equipo</p>
        <p className="text-sm text-[#7a95aa]">Tu cuenta no tiene permiso para administrar al personal.</p>
      </div></main></div>
  );

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-10 max-w-5xl mx-auto">
        <h1 className="text-2xl font-serif font-semibold text-[#dde6ef] mb-1">🩺 Gestión de equipo</h1>
        <p className="text-[#7a95aa] mb-6 text-sm">Da de alta a tu personal con acceso propio y define qué puede ver y editar cada quien.</p>

        {msg && <div className="mb-4 text-sm px-4 py-2.5 rounded-xl" style={{ background: 'rgba(0,229,160,.1)', border: `1px solid ${C.green}44`, color: C.green }}>{msg}</div>}

        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 mb-6">
          <p className="text-xs font-mono text-[#00e5a0] tracking-wider mb-3">DAR DE ALTA UN MIEMBRO</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-1">
            <input className={inp} placeholder="Nombre completo" value={nombre} onChange={e => setNombre(e.target.value)} />
            <input className={inp} placeholder="Correo (opcional)" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <p className="text-[11px] text-[#7a95aa] mb-4">Se generará un usuario y una contraseña segura automáticamente. Si dejas el correo vacío, el usuario se crea con el nombre.</p>

          <label className="text-[10px] font-mono text-[#7a95aa] block mb-1.5">ROL</label>
          <div className="flex flex-wrap gap-2 mb-1">
            {ASSIGNABLE.map(r => (
              <button key={r} onClick={() => setRol(r)} className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition"
                style={{ background: rol === r ? ROLE_COLORS[r] : '#111820', borderColor: rol === r ? ROLE_COLORS[r] : '#2a3a4d', color: rol === r ? '#000' : C.text }}>{ROLE_LABELS[r]}</button>
            ))}
          </div>
          <p className="text-[11px] text-[#7a95aa] mb-4">{ROLE_DESC[rol]}</p>

          <p className="text-[10px] font-mono text-[#7a95aa] mb-2">PERMISOS (ajústalos si quieres)</p>
          <div className="space-y-2 mb-2">
            {areas.map(a => (
              <div key={a} className="flex items-center justify-between bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2">
                <span className="text-sm text-[#dde6ef]">{AREA_LABELS[a] || a}</span>
                <LevelPicker value={perms[a] || 'none'} onChange={v => setPerms(p => ({ ...p, [a]: v }))} />
              </div>
            ))}
          </div>
          {rol === 'accounting' && <ScopeConfig scope={scope} onChange={setScope} />}
          <button onClick={crear} disabled={busy} className={`${btn} mt-4`} style={{ background: C.green, color: '#000' }}>{busy ? 'Creando…' : 'Crear acceso'}</button>
        </div>

        <p className="text-xs font-mono text-[#3d5870] tracking-wider mb-3">EQUIPO</p>
        {loading ? <p className="text-sm text-[#7a95aa]">Cargando…</p> :
          staff.filter(m => m.role !== 'doctor').length === 0 ? (
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-8 text-center"><p className="text-3xl mb-2">👥</p><p className="text-sm text-[#7a95aa]">Aún no has dado de alta a nadie.</p></div>
          ) : (
            <div className="space-y-3">
              {staff.filter(m => m.role !== 'doctor').map(m => <StaffCard key={m.id} m={m} areas={areas} onSave={savePerms} onRegen={regen} onDelete={del} onSaveData={saveData} />)}
            </div>
          )}
      </main>
      {cred && <CredModal cred={cred} onClose={() => setCred(null)} />}
    </div>
  );
}

function StaffCard({ m, areas, onSave, onRegen, onDelete, onSaveData }:
  { m: any; areas: Area[]; onSave: (m: any, p: Record<string, PermLevel>) => void; onRegen: (m: any) => void; onDelete: (m: any) => void; onSaveData: (m: any, d: any) => void }) {
  const [tab, setTab] = useState<'' | 'perms' | 'data'>('');
  const [perms, setPerms] = useState<Record<string, PermLevel>>(m.permissions || {});
  const [data, setData] = useState({ display_name: m.display_name || '', phone: m.phone || '', username: m.username || '' });
  const color = ROLE_COLORS[m.role as UserRole] || '#7a95aa';
  const dirty = JSON.stringify(perms) !== JSON.stringify(m.permissions || {});
  const dataDirty = data.display_name !== (m.display_name || '') || data.phone !== (m.phone || '') || data.username !== (m.username || '');
  const di = 'w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0]';
  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: color + '22', color }}>{(m.display_name || '?')[0]?.toUpperCase()}</span>
          <div className="min-w-0"><p className="text-sm font-semibold text-[#dde6ef] truncate">{m.display_name}</p><p className="text-[11px] text-[#7a95aa] truncate">{m.username || m.email}{m.phone ? ` · ${m.phone}` : ''}</p></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: color + '1a', color }}>{ROLE_LABELS[m.role as UserRole] || m.role}</span>
          <button onClick={() => onRegen(m)} className="text-xs text-[#f59e0b] px-1" title="Generar nueva contraseña">🔑</button>
          <button onClick={() => setTab(t => t === 'data' ? '' : 'data')} className="text-xs text-[#00e5a0] px-2">{tab === 'data' ? 'Cerrar' : 'Datos'}</button>
          <button onClick={() => setTab(t => t === 'perms' ? '' : 'perms')} className="text-xs text-[#0ea5e9] px-2">{tab === 'perms' ? 'Cerrar' : 'Permisos'}</button>
          <button onClick={() => onDelete(m)} className="text-[#f43f5e] text-lg leading-none px-1">×</button>
        </div>
      </div>

      {tab === 'data' && (
        <div className="border-t border-[#1e2d3d] px-4 py-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div><label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Nombre</label><input className={di} value={data.display_name} onChange={e => setData({ ...data, display_name: e.target.value })} /></div>
            <div><label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Teléfono</label><input className={di} value={data.phone} onChange={e => setData({ ...data, phone: e.target.value })} placeholder="+52 …" /></div>
            <div><label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Usuario (login)</label><input className={di} value={data.username} onChange={e => setData({ ...data, username: e.target.value })} /></div>
          </div>
          {dataDirty && <div className="flex justify-end pt-1"><button onClick={() => onSaveData(m, data)} className={btn} style={{ background: C.green, color: '#000' }}>Guardar datos</button></div>}
        </div>
      )}

      {tab === 'perms' && (
        <div className="border-t border-[#1e2d3d] px-4 py-3 space-y-2">
          {areas.map(a => (
            <div key={a} className="flex items-center justify-between">
              <span className="text-sm text-[#dde6ef]">{AREA_LABELS[a] || a}</span>
              <LevelPicker value={perms[a] || 'none'} onChange={v => setPerms(p => ({ ...p, [a]: v }))} />
            </div>
          ))}
          {dirty && <div className="flex justify-end pt-1"><button onClick={() => onSave(m, perms)} className={btn} style={{ background: C.green, color: '#000' }}>Guardar permisos</button></div>}
        </div>
      )}
    </div>
  );
}
