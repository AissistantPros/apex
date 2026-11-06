'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getSession } from '@/app/lib/auth';
import { ROLE_LABELS, ROLE_COLORS, AREA_LABELS, UserRole, Area, PermLevel } from '@/app/lib/role';
import { mix } from '@/app/lib/ui';

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

const C = { text: 'var(--c-text)', muted: 'var(--c-text-2)', faint: 'var(--c-text-3)', green: 'var(--c-green)', red: 'var(--c-red)' };
const inp = 'w-full bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2.5 text-[#dde6ef] outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870] text-sm';
const btn = 'px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40';

const ASSIGNABLE: { role: UserRole; icon: string; title: string; desc: string }[] = [
  { role: 'receptionist', icon: '👩‍💼', title: 'Recepción', desc: 'Atención al paciente, cobros en mostrador, agenda y entrega de recetas.' },
  { role: 'nurse', icon: '🩺', title: 'Enfermería', desc: 'Captura de signos vitales, somatometría y antecedentes en sala previa.' },
  { role: 'accounting', icon: '📊', title: 'Contabilidad', desc: 'Control de ingresos, egresos, gastos y corte de caja. Sin acceso clínico.' },
  { role: 'marketing', icon: '📣', title: 'Marketing', desc: 'Monitoreo de retorno de inversión publicitaria y captación de pacientes.' },
];

const LEVELS: { v: PermLevel; l: string }[] = [
  { v: 'none', l: 'Sin acceso' }, { v: 'view', l: 'Ver' }, { v: 'edit', l: 'Editar' },
];

function LevelPicker({ value, onChange }: { value: PermLevel; onChange: (v: PermLevel) => void }) {
  return (
    <div className="flex gap-1">
      {LEVELS.map(({ v, l }) => (
        <button key={v} type="button" onClick={() => onChange(v)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition"
          style={{ background: value === v ? (v === 'none' ? 'var(--c-border-2)' : v === 'edit' ? C.green : 'var(--c-blue)') : 'var(--c-subtle)', color: value === v ? (v === 'none' ? C.muted : 'var(--c-primary-fg)') : C.faint }}>{l}</button>
      ))}
    </div>
  );
}

function CredModal({ cred, onClose }: { cred: { usuario: string; password: string; nombre?: string; regen?: boolean }; onClose: () => void }) {
  const [copied, setCopied] = useState('');
  const copy = (t: string, k: string) => { navigator.clipboard?.writeText(t); setCopied(k); setTimeout(() => setCopied(''), 1500); };
  return (
    <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d1520] border border-[#00e5a0]/40 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <p className="text-lg font-semibold text-[#dde6ef] mb-1">{cred.regen ? 'Nueva contraseña' : 'Acceso generado'}{cred.nombre ? ` — ${cred.nombre}` : ''}</p>
        <p className="text-xs text-[#f59e0b] mb-4">Guárdala ahora. Por seguridad no se almacena en texto plano; después solo se podrá regenerar una nueva.</p>
        {[['Usuario', cred.usuario, 'u'], ['Contraseña', cred.password, 'p']].map(([label, val, k]) => (
          <div key={k} className="mb-3">
            <p className="text-[10px] font-mono text-[#7a95aa] mb-1">{label}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[#111820] border border-[#1e2d3d] rounded-lg px-3 py-2 text-sm text-[#dde6ef] font-mono break-all">{val}</code>
              <button onClick={() => copy(val as string, k as string)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: copied === k ? C.green : 'var(--c-border)', color: copied === k ? 'var(--c-primary-fg)' : C.text }}>{copied === k ? '✓ Copiado' : 'Copiar'}</button>
            </div>
          </div>
        ))}
        <button onClick={onClose} className={`${btn} w-full mt-2`} style={{ background: C.green, color: 'var(--c-primary-fg)' }}>Listo, credenciales guardadas</button>
      </div>
    </div>
  );
}

export default function StaffPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [defaults, setDefaults] = useState<Record<string, Record<string, PermLevel>>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [cred, setCred] = useState<any>(null);

  // Modal para agregar miembro (divulgación progresiva)
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api('/staff/defaults'), api('/staff')]);
      setAreas(d.areas || []);
      setDefaults(d.defaults || {});
      setStaff(s.staff || []);
      setLocations(s.locations || []);
    } catch (e: any) {
      if (String(e.message).includes('403') || /permiso/i.test(e.message)) setDenied(true);
      else setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  const del = async (m: any) => {
    if (!confirm(`¿Eliminar el acceso de ${m.display_name}? Esta acción no se puede deshacer.`)) return;
    try {
      await api(`/staff/${m.id}`, { method: 'DELETE' });
      flash('Miembro eliminado');
      load();
    } catch (e: any) { flash(e.message); }
  };

  const regen = async (m: any) => {
    if (!confirm(`¿Generar una nueva contraseña para ${m.display_name}? La actual dejará de funcionar.`)) return;
    try {
      const r = await api(`/staff/${m.id}/password`, { method: 'POST' });
      setCred({ usuario: r.usuario, password: r.password, nombre: m.display_name, regen: true });
    } catch (e: any) { flash(e.message); }
  };

  if (denied) {
    return (
      <div className="min-h-screen bg-[#070a0e]">
        <main className="page-content pt-16 px-6 py-10">
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-10 text-center max-w-md mx-auto">
            <p className="text-4xl mb-3">🔒</p>
            <p className="text-[#dde6ef] font-semibold mb-1">Solo el médico gestiona al equipo</p>
            <p className="text-sm text-[#7a95aa]">Tu cuenta no tiene permiso para administrar al personal.</p>
          </div>
        </main>
      </div>
    );
  }

  const members = staff.filter(m => m.role !== 'doctor');

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-4 sm:px-6 py-10 max-w-6xl mx-auto space-y-6">
        {/* Encabezado limpio */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-semibold text-[#dde6ef]">Mi equipo</h1>
            <p className="text-sm text-[#7a95aa] mt-1">
              Colaboradores con acceso al consultorio. Puedes asignar y personalizar qué puede ver y hacer cada quien.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-lg hover:opacity-90 active:scale-[0.98]"
            style={{ background: C.green, color: 'var(--c-primary-fg)' }}
          >
            <span>+</span> Agregar miembro del equipo
          </button>
        </div>

        {msg && (
          <div className="text-sm px-4 py-2.5 rounded-xl" style={{ background: mix(C.green, 10), border: `1px solid ${mix(C.green, 27)}`, color: C.green }}>
            {msg}
          </div>
        )}

        {/* ── LISTA DE MIEMBROS: TARJETAS MINIMALISTAS CON FOTO CIRCULAR AL CENTRO ── */}
        {loading ? (
          <div className="py-16 text-center text-[#7a95aa] text-sm">Cargando equipo…</div>
        ) : members.length === 0 ? (
          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-12 text-center space-y-3">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl bg-[#111820] text-[#7a95aa]">
              👥
            </div>
            <p className="text-base font-semibold text-[#dde6ef]">Aún no has agregado miembros a tu equipo</p>
            <p className="text-xs text-[#7a95aa] max-w-md mx-auto">
              Si trabajas solo, el sistema ya se adapta a ti. Cuando contrates a una recepcionista, enfermera o contador, puedes darles acceso con un solo clic.
            </p>
            <div className="pt-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: C.green, color: 'var(--c-primary-fg)' }}
              >
                + Agregar primer miembro
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map(m => (
              <MemberCard
                key={m.id}
                member={m}
                onEdit={() => setEditingMember(m)}
                onRegen={() => regen(m)}
                onDelete={() => del(m)}
              />
            ))}
          </div>
        )}

        {/* Botón secundario abajo de las tarjetas como respaldo ergonómico */}
        {members.length > 0 && (
          <div className="flex justify-center pt-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 rounded-2xl text-sm font-bold border transition flex items-center gap-2 hover:border-[#00e5a0]"
              style={{ background: '#0d1520', borderColor: '#1e2d3d', color: '#dde6ef' }}
            >
              <span>+</span> Agregar a otro miembro del equipo
            </button>
          </div>
        )}
      </main>

      {/* Modal de alta progresiva (Paso 1: Datos -> Paso 2: Permisos tras elegir puesto) */}
      {showAddModal && (
        <AddStaffModal
          defaults={defaults}
          areas={areas}
          locations={locations}
          onClose={() => setShowAddModal(false)}
          onCreated={(c) => {
            setShowAddModal(false);
            setCred(c);
            load();
          }}
          flash={flash}
        />
      )}

      {/* Modal de edición de miembro existente */}
      {editingMember && (
        <EditStaffModal
          member={editingMember}
          areas={areas}
          locations={locations}
          onClose={() => setEditingMember(null)}
          onSaved={() => {
            setEditingMember(null);
            flash('Datos del miembro actualizados');
            load();
          }}
          flash={flash}
        />
      )}

      {/* Modal de credenciales generadas */}
      {cred && <CredModal cred={cred} onClose={() => setCred(null)} />}
    </div>
  );
}

// ── TARJETA MINIMALISTA DE MIEMBRO CON FOTO CIRCULAR AL CENTRO ──
function MemberCard({ member: m, onEdit, onRegen, onDelete }: {
  member: any;
  onEdit: () => void;
  onRegen: () => void;
  onDelete: () => void;
}) {
  const roleKey = (m.role || 'receptionist') as UserRole;
  const color = ROLE_COLORS[roleKey] || 'var(--c-text-2)';
  const initials = (m.display_name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase();

  // Detección de cumpleaños
  const birthday = m.birthday || '';
  let isBirthdayThisMonth = false;
  let formattedBirthday = '';
  if (birthday) {
    try {
      const parts = birthday.split('-');
      if (parts.length === 3) {
        const bMonth = parseInt(parts[1], 10);
        const bDay = parseInt(parts[2], 10);
        const currentMonth = new Date().getMonth() + 1;
        isBirthdayThisMonth = bMonth === currentMonth;
        const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        formattedBirthday = `${bDay} de ${MESES[bMonth] || parts[1]}`;
      }
    } catch {}
  }

  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] hover:border-[#00e5a0]/40 rounded-2xl p-5 flex flex-col items-center text-center transition group relative">
      {/* Marco circular con foto o iniciales */}
      <div className="relative mb-3">
        {m.photo_url ? (
          <img
            src={m.photo_url}
            alt={m.display_name}
            className="w-20 h-20 rounded-full object-cover border-2 border-[#1e2d3d] group-hover:border-[#00e5a0] transition shadow-md"
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-[#1e2d3d] transition"
            style={{ background: color + '18', color, borderColor: color + '40' }}
          >
            {initials}
          </div>
        )}
        {isBirthdayThisMonth && (
          <span
            className="absolute -top-1 -right-1 text-sm bg-[#111820] border border-[#1e2d3d] rounded-full w-6 h-6 flex items-center justify-center"
            title="¡Cumpleaños este mes!"
          >
            🎂
          </span>
        )}
      </div>

      {/* Nombre y Puesto */}
      <h3 className="text-base font-bold text-[#dde6ef] truncate max-w-full mb-1">
        {m.display_name}
      </h3>
      <span
        className="px-3 py-0.5 rounded-full text-xs font-semibold mb-3 border"
        style={{ background: color + '15', color, borderColor: color + '30' }}
      >
        {ROLE_LABELS[roleKey] || m.role}
      </span>

      {/* Datos de contacto y cumpleaños */}
      <div className="space-y-1 text-xs text-[#7a95aa] w-full border-t border-[#1e2d3d]/60 pt-3 mb-4">
        <p className="truncate" title={m.email || m.username}>
          ✉️ {m.email || `${m.username}@staff`}
        </p>
        {m.phone && <p className="truncate">📞 {m.phone}</p>}
        {formattedBirthday && (
          <p className="text-[11px] text-[#dde6ef]/80">
            🎂 Cumpleaños: <span className={isBirthdayThisMonth ? 'text-amber-400 font-semibold' : ''}>{formattedBirthday}</span>
          </p>
        )}
      </div>

      {/* Botones de acción directos */}
      <div className="flex items-center gap-1.5 w-full pt-2 border-t border-[#1e2d3d]/60 justify-center">
        <button
          onClick={onEdit}
          className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] hover:border-[#00e5a0] transition"
        >
          Editar / Permisos
        </button>
        <button
          onClick={onRegen}
          className="p-1.5 rounded-lg text-xs text-[#f59e0b] bg-[#111820] border border-[#1e2d3d] hover:border-[#f59e0b] transition"
          title="Regenerar contraseña"
        >
          🔑
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-xs text-[#f43f5e] bg-[#111820] border border-[#1e2d3d] hover:border-[#f43f5e] transition"
          title="Eliminar miembro"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── MODAL PROGRESIVO: AGREGAR MIEMBRO EN 2 PASOS ──
function AddStaffModal({ defaults, areas, locations, onClose, onCreated, flash }: {
  defaults: Record<string, Record<string, PermLevel>>;
  areas: Area[];
  locations: any[];
  onClose: () => void;
  onCreated: (cred: any) => void;
  flash: (t: string) => void;
}) {
  // Paso 1: Datos de la persona
  const [nombre, setNombre] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  // Paso 2: Permisos (SOLO se revela cuando se elige el puesto)
  const [perms, setPerms] = useState<Record<string, PermLevel>>({});
  const [customizePerms, setCustomizePerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Al elegir puesto, cargar sus permisos por defecto
  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    if (defaults[role]) {
      setPerms({ ...defaults[role] });
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoUrl(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!nombre.trim()) return flash('Escribe el nombre completo');
    if (!selectedRole) return flash('Selecciona el puesto que ocupará');
    setBusy(true);
    try {
      const payload: any = {
        nombre: nombre.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        birthday: birthday || null,
        photo_url: photoUrl || null,
        role: selectedRole,
        permissions: { ...perms },
      };
      const r = await api('/staff', { method: 'POST', body: JSON.stringify(payload) });
      onCreated({ usuario: r.usuario, password: r.password, nombre: r.nombre });
    } catch (e: any) {
      flash(e.message || 'No se pudo crear el acceso');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-[#1e2d3d]">
          <div>
            <h2 className="text-lg font-bold text-[#dde6ef]">Agregar miembro al equipo</h2>
            <p className="text-xs text-[#7a95aa]">Paso 1: Datos personales y puesto · Paso 2: Permisos asignados</p>
          </div>
          <button onClick={onClose} className="text-[#7a95aa] hover:text-[#dde6ef] text-xl px-2">✕</button>
        </div>

        {/* ── PASO 1: DATOS DE LA PERSONA ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {/* Foto circular con selector */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-full bg-[#111820] border-2 border-dashed border-[#1e2d3d] hover:border-[#00e5a0] flex flex-col items-center justify-center cursor-pointer overflow-hidden shrink-0 transition"
              title="Clic para seleccionar fotografía"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="Foto" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-[#7a95aa] text-center px-1">📸 Foto</span>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            <div className="flex-1">
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Nombre completo *</label>
              <input
                className={inp}
                placeholder="Ej. Laura González Morales"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Teléfono / WhatsApp</label>
              <input
                className={inp}
                placeholder="+52 55 1234 5678"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Fecha de cumpleaños 🎂</label>
              <input
                type="date"
                className={inp}
                value={birthday}
                onChange={e => setBirthday(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
              Correo electrónico de la empresa (opcional)
            </label>
            <input
              type="email"
              className={inp}
              placeholder="recepcion@tuclinica.com (si lo dejas vacío se genera usuario con el nombre)"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {/* Selector de Puesto con tarjetas táctiles */}
          <div>
            <label className="text-[10px] font-mono text-[#00e5a0] uppercase block mb-2 tracking-wider">
              ¿QUÉ PUESTO OCUPARÁ? * (Selecciona uno)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ASSIGNABLE.map(item => {
                const isSelected = selectedRole === item.role;
                const col = ROLE_COLORS[item.role] || 'var(--c-primary)';
                return (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => handleSelectRole(item.role)}
                    className="p-3 rounded-xl border text-left transition flex items-start gap-3 active:scale-[0.98]"
                    style={{
                      background: isSelected ? col + '1a' : '#111820',
                      borderColor: isSelected ? col : '#1e2d3d',
                    }}
                  >
                    <span className="text-2xl shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: isSelected ? col : '#dde6ef' }}>
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#7a95aa] leading-snug mt-0.5">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── PASO 2: PERMISOS (SOLO SE REVELA TRAS SELECCIONAR EL PUESTO) ── */}
        {selectedRole && (
          <div className="pt-4 border-t border-[#1e2d3d] space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-[#00e5a0] tracking-wider uppercase">
                  ✓ Permisos asignados para {ROLE_LABELS[selectedRole]}
                </p>
                <p className="text-[11px] text-[#7a95aa]">
                  Ya configuramos los permisos ideales por defecto. Puedes cambiarlos si lo deseas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomizePerms(v => !v)}
                className="text-xs text-[#0ea5e9] hover:underline"
              >
                {customizePerms ? 'Ocultar detalle' : 'Personalizar permisos'}
              </button>
            </div>

            {customizePerms && (
              <div className="space-y-1.5 bg-[#111820] border border-[#1e2d3d] rounded-xl p-3 max-h-56 overflow-y-auto">
                {areas.map(a => (
                  <div key={a} className="flex items-center justify-between py-1 border-b border-[#1e2d3d]/50 last:border-0">
                    <span className="text-xs text-[#dde6ef]">{AREA_LABELS[a] || a}</span>
                    <LevelPicker value={perms[a] || 'none'} onChange={v => setPerms(p => ({ ...p, [a]: v }))} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex gap-2 pt-3 border-t border-[#1e2d3d]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#7a95aa] border border-[#1e2d3d] hover:border-[#7a95aa]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || !nombre.trim() || !selectedRole}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold shadow-lg transition disabled:opacity-40"
            style={{ background: C.green, color: 'var(--c-primary-fg)' }}
          >
            {busy ? 'Creando acceso…' : '✓ Guardar y crear acceso'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MODAL PARA EDITAR DATOS Y PERMISOS DE MIEMBRO EXISTENTE ──
function EditStaffModal({ member: m, areas, locations, onClose, onSaved, flash }: {
  member: any;
  areas: Area[];
  locations: any[];
  onClose: () => void;
  onSaved: () => void;
  flash: (t: string) => void;
}) {
  const [displayName, setDisplayName] = useState(m.display_name || '');
  const [phone, setPhone] = useState(m.phone || '');
  const [birthday, setBirthday] = useState(m.birthday || '');
  const [email, setEmail] = useState(m.email || '');
  const [role, setRole] = useState<UserRole>(m.role || 'receptionist');
  const [perms, setPerms] = useState<Record<string, PermLevel>>(m.permissions || {});
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      await api(`/staff/${m.id}/profile`, {
        method: 'PUT',
        body: JSON.stringify({
          display_name: displayName.trim(),
          phone: phone.trim(),
          birthday: birthday || '',
          email: email.trim(),
          role,
          permissions: perms,
        }),
      });
      onSaved();
    } catch (e: any) {
      flash(e.message || 'No se pudieron actualizar los datos');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-[#1e2d3d]">
          <h2 className="text-base font-bold text-[#dde6ef]">Editar a {m.display_name}</h2>
          <button onClick={onClose} className="text-[#7a95aa] hover:text-[#dde6ef] text-xl">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Nombre completo</label>
            <input className={inp} value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Teléfono</label>
              <input className={inp} value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Cumpleaños 🎂</label>
              <input type="date" className={inp} value={birthday} onChange={e => setBirthday(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Correo de acceso</label>
            <input type="email" className={inp} value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">Puesto</label>
            <div className="grid grid-cols-2 gap-2">
              {ASSIGNABLE.map(item => (
                <button
                  key={item.role}
                  type="button"
                  onClick={() => setRole(item.role)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border text-left transition"
                  style={{
                    background: role === item.role ? (ROLE_COLORS[item.role] || C.green) + '1a' : '#111820',
                    borderColor: role === item.role ? (ROLE_COLORS[item.role] || C.green) : '#1e2d3d',
                    color: role === item.role ? (ROLE_COLORS[item.role] || C.green) : '#dde6ef',
                  }}
                >
                  {item.icon} {item.title}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">Permisos específicos</label>
            <div className="space-y-1.5 bg-[#111820] border border-[#1e2d3d] rounded-xl p-3 max-h-48 overflow-y-auto">
              {areas.map(a => (
                <div key={a} className="flex items-center justify-between py-1 border-b border-[#1e2d3d]/50 last:border-0">
                  <span className="text-xs text-[#dde6ef]">{AREA_LABELS[a] || a}</span>
                  <LevelPicker value={perms[a] || 'none'} onChange={v => setPerms(p => ({ ...p, [a]: v }))} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-[#1e2d3d]">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-[#7a95aa] border border-[#1e2d3d]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !displayName.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: C.green, color: 'var(--c-primary-fg)' }}
          >
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
