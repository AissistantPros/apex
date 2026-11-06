'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getSession } from '@/app/lib/auth';
import { ROLE_LABELS, ROLE_COLORS, AREA_LABELS, UserRole, Area, PermLevel } from '@/app/lib/role';
import { mix } from '@/app/lib/ui';
import PhotoCropModal from '@/app/components/PhotoCropModal';

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

const C = { text: 'var(--c-text)', muted: 'var(--c-text-2)', faint: 'var(--c-text-3)', green: '#00e5a0', red: '#f43f5e' };
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
          style={{ background: value === v ? (v === 'none' ? 'var(--c-border-2)' : v === 'edit' ? C.green : '#38bdf8') : 'var(--c-subtle)', color: value === v ? (v === 'none' ? C.muted : '#000') : C.faint }}>{l}</button>
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
              <button onClick={() => copy(val as string, k as string)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: copied === k ? C.green : 'var(--c-border)', color: copied === k ? '#000' : C.text }}>{copied === k ? '✓ Copiado' : 'Copiar'}</button>
            </div>
          </div>
        ))}
        <button onClick={onClose} className={`${btn} w-full mt-2`} style={{ background: C.green, color: '#000' }}>Listo, credenciales guardadas</button>
      </div>
    </div>
  );
}

export default function StaffManagement() {
  const [staff, setStaff] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [defaults, setDefaults] = useState<Record<string, Record<string, PermLevel>>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [cred, setCred] = useState<any>(null);

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
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-8 text-center max-w-md mx-auto">
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-[#dde6ef] font-semibold mb-1">Solo el médico gestiona al equipo</p>
        <p className="text-sm text-[#7a95aa]">Tu cuenta no tiene permiso para administrar al personal.</p>
      </div>
    );
  }

  const members = staff.filter(m => m.role !== 'doctor');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#dde6ef]">Equipo de Trabajo</h2>
          <p className="text-xs text-[#7a95aa] mt-0.5">
            Colaboradores con acceso al consultorio. Puedes asignar y personalizar qué puede ver y hacer cada quien.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm active:scale-95"
          style={{ background: '#00e5a0', color: '#051b14' }}
        >
          <span>+</span> Agregar miembro del equipo
        </button>
      </div>

      {msg && (
        <div className="text-sm px-4 py-2.5 rounded-xl bg-[#00e5a0]/10 border border-[#00e5a0]/30 text-[#00e5a0]">
          {msg}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-[#7a95aa] text-sm animate-pulse">Cargando equipo…</div>
      ) : members.length === 0 ? (
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl bg-[#111820] text-[#7a95aa]">
            👥
          </div>
          <p className="text-base font-semibold text-[#dde6ef]">Aún no has agregado miembros a tu equipo</p>
          <p className="text-xs text-[#7a95aa] max-w-md mx-auto">
            Si trabajas solo, el sistema ya se adapta a ti. Cuando contrates a una recepcionista, enfermera o asistente, puedes darles acceso con un solo clic.
          </p>
          <div className="pt-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: '#00e5a0', color: '#051b14' }}
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

      {/* Modal de alta progresiva */}
      {showAddModal && (
        <AddStaffModal
          defaults={defaults}
          areas={areas}
          locations={locations}
          onClose={() => setShowAddModal(false)}
          onCreated={(c: any) => {
            setShowAddModal(false);
            setCred(c);
            load();
          }}
          flash={flash}
        />
      )}

      {/* Modal de edición */}
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

      {cred && <CredModal cred={cred} onClose={() => setCred(null)} />}
    </div>
  );
}

function MemberCard({ member: m, onEdit, onRegen, onDelete }: { member: any; onEdit: () => void; onRegen: () => void; onDelete: () => void }) {
  const roleColor = ROLE_COLORS[m.role as UserRole] || '#7a95aa';
  const roleName = ROLE_LABELS[m.role as UserRole] || m.role;

  const bday = m.birthday || '';
  const isThisMonth = (() => {
    if (!bday) return false;
    const curM = new Date().getMonth() + 1;
    const parts = bday.split('-');
    if (parts.length >= 2) return parseInt(parts[1], 10) === curM;
    return false;
  })();

  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 flex flex-col justify-between hover:border-[#2a3e52] transition-all group">
      <div>
        <div className="flex flex-col items-center text-center pb-3">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-[#111820] border-2 flex items-center justify-center text-2xl shadow-inner mb-3 relative shrink-0"
            style={{ borderColor: `${roleColor}66` }}>
            {m.photo_url ? (
              <img src={m.photo_url} alt={m.display_name} className="w-full h-full object-cover rounded-full" />
            ) : (
              <span className="font-bold text-lg" style={{ color: roleColor }}>
                {(m.display_name || '?').trim()[0]?.toUpperCase() || '?'}
              </span>
            )}
          </div>

          <h3 className="text-base font-bold text-[#dde6ef] truncate w-full">{m.display_name}</h3>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold mt-1"
            style={{ background: `${roleColor}18`, color: roleColor, border: `1px solid ${roleColor}40` }}>
            <span>{m.role === 'receptionist' ? '👩‍💼' : m.role === 'nurse' ? '🩺' : m.role === 'accounting' ? '📊' : '📣'}</span>
            <span>{roleName}</span>
          </div>
        </div>

        <div className="space-y-1.5 py-2 border-t border-[#1e2d3d] text-xs">
          {m.email && (
            <p className="text-[#7a95aa] truncate flex items-center gap-1.5">
              <span>✉️</span> <span className="text-[#dde6ef] truncate">{m.email}</span>
            </p>
          )}
          {m.phone && (
            <p className="text-[#7a95aa] flex items-center gap-1.5">
              <span>📞</span> <span className="text-[#dde6ef] font-mono">{m.phone}</span>
            </p>
          )}
          {bday && (
            <p className="text-[#7a95aa] flex items-center gap-1.5">
              <span>🎂</span>
              <span className={isThisMonth ? 'text-[#00e5a0] font-semibold' : 'text-[#dde6ef]'}>
                {bday} {isThisMonth && '· ¡Cumpleaños este mes! 🎉'}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-[#1e2d3d] flex items-center justify-between gap-2">
        <button
          onClick={onEdit}
          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] hover:border-[#00e5a0] transition"
        >
          Editar permisos
        </button>
        <button
          onClick={onRegen}
          className="p-2 rounded-xl text-xs font-semibold bg-[#111820] border border-[#1e2d3d] text-[#7a95aa] hover:text-[#00e5a0] transition"
          title="Regenerar contraseña"
        >
          🔑
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-xl text-xs font-semibold bg-[#111820] border border-[#1e2d3d] text-[#7a95aa] hover:text-[#f43f5e] transition"
          title="Eliminar miembro"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

function AddStaffModal({ defaults, areas, locations, onClose, onCreated, flash }: any) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [perms, setPerms] = useState<Record<string, PermLevel>>({});
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectRole = (r: UserRole) => {
    setRole(r);
    setPerms(defaults[r] ? { ...defaults[r] } : {});
    setStep(2);
  };

  const uploadPhoto = async (f: Blob) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', f, 'avatar.webp');
      const s = await getSession().catch(() => null);
      const res = await fetch(`${B()}/staff/upload-photo`, {
        method: 'POST',
        headers: { ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al subir la fotografía');
      }
      const data = await res.json();
      setPhotoUrl(data.url);
      flash('✓ Fotografía recortada y optimizada en WebP (<80 KB)');
    } catch (e: any) {
      flash(e.message || 'No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) return flash('Indica el nombre del colaborador');
    if (!role) return flash('Selecciona un puesto para continuar');
    setBusy(true);
    try {
      const res = await api('/staff', {
        method: 'POST',
        body: JSON.stringify({
          display_name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          birthday: birthday || undefined,
          photo_url: photoUrl || undefined,
          role,
          permissions: perms,
          location_ids: locationIds,
        }),
      });
      onCreated({ usuario: res.usuario, password: res.password, nombre: name.trim() });
    } catch (e: any) {
      flash(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between pb-3 border-b border-[#1e2d3d]">
            <div>
              <span className="text-[10px] font-mono uppercase text-[#00e5a0]">Alta de Colaborador</span>
              <h3 className="text-lg font-bold text-[#dde6ef] mt-0.5">
                {step === 1 ? '1. Datos personales y puesto' : `2. Permisos para ${ROLE_LABELS[role as UserRole] || role}`}
              </h3>
            </div>
            <button onClick={onClose} className="text-[#7a95aa] hover:text-[#dde6ef] text-xl">✕</button>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-full overflow-hidden bg-[#111820] border-2 border-dashed border-[#1e2d3d] hover:border-[#00e5a0] flex items-center justify-center cursor-pointer transition shrink-0 relative group"
                >
                  {photoUrl ? (
                    <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl text-[#7a95aa] group-hover:scale-110 transition">📷</span>
                  )}
                  {uploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-white">...</div>}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setCropFile(f);
                    e.target.value = '';
                  }}
                />
                <div>
                  <p className="text-xs font-semibold text-[#dde6ef]">Foto del colaborador</p>
                  <p className="text-[11px] text-[#7a95aa]">Haz clic para subir y reencuadrar el rostro (&lt;80 KB WebP).</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">NOMBRE COMPLETO *</label>
                  <input className={inp} placeholder="Ej. Ana Patricia Morales" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">TELÉFONO DE CONTACTO</label>
                  <input className={inp} placeholder="Ej. +52 998 123 4567" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">FECHA DE CUMPLEAÑOS 🎂</label>
                  <input type="date" className={inp} value={birthday} onChange={e => setBirthday(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">CORREO INSTITUCIONAL / LOGIN</label>
                  <input className={inp} placeholder="ejemplo@miclinica.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-2">SELECCIONA EL PUESTO *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ASSIGNABLE.map(p => (
                    <button
                      key={p.role}
                      type="button"
                      onClick={() => selectRole(p.role)}
                      className="p-3 rounded-xl border text-left transition flex items-start gap-3 hover:border-[#00e5a0] bg-[#111820]"
                      style={{ borderColor: role === p.role ? '#00e5a0' : '#1e2d3d' }}
                    >
                      <span className="text-2xl shrink-0 mt-0.5">{p.icon}</span>
                      <div>
                        <p className="text-xs font-bold text-[#dde6ef]">{p.title}</p>
                        <p className="text-[11px] text-[#7a95aa] mt-0.5 leading-snug">{p.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-[#111820] border border-[#00e5a0]/30 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ASSIGNABLE.find(p => p.role === role)?.icon}</span>
                  <div>
                    <p className="text-xs font-bold text-[#dde6ef]">{name || 'Colaborador'}</p>
                    <p className="text-[11px] text-[#00e5a0]">{ROLE_LABELS[role as UserRole]}</p>
                  </div>
                </div>
                <button onClick={() => setStep(1)} className="text-xs text-[#7a95aa] hover:text-[#00e5a0]">Cambiar puesto ←</button>
              </div>

              <div>
                <p className="text-xs text-[#7a95aa] mb-2">
                  Hemos preconfigurado los permisos recomendados para este rol. Puedes ajustarlos según lo requieras:
                </p>
                <div className="space-y-2 border border-[#1e2d3d] rounded-xl p-3 bg-[#111820] max-h-56 overflow-y-auto">
                  {areas.map((a: any) => {
                    const areaKey = (typeof a === 'string' ? a : (a.id || a.name || '')) as Area;
                    const label = AREA_LABELS[areaKey] || areaKey;
                    return (
                      <div key={areaKey} className="flex items-center justify-between py-2 border-b border-[#1e2d3d]/50 last:border-0 text-xs">
                        <span className="text-[#dde6ef] font-medium">{label}</span>
                        <LevelPicker
                          value={perms[areaKey] || 'none'}
                          onChange={v => setPerms(prev => ({ ...prev, [areaKey]: v }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep(1)} className={`${btn} flex-1 bg-[#111820] border border-[#1e2d3d] text-[#dde6ef]`}>← Volver</button>
                <button onClick={submit} disabled={busy} className={`${btn} flex-1 bg-[#00e5a0] text-[#051b14]`}>
                  {busy ? 'Generando acceso…' : '✓ Crear colaborador'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          maxDimension={800}
          maxBytes={80 * 1024}
          format="image/webp"
          title="Enmarcar foto del colaborador"
          onCancel={() => setCropFile(null)}
          onSave={async (_, blob) => {
            setCropFile(null);
            if (blob) await uploadPhoto(blob);
          }}
        />
      )}
    </>
  );
}

function EditStaffModal({ member: m, areas, locations, onClose, onSaved, flash }: any) {
  const [name, setName] = useState(m.display_name || '');
  const [phone, setPhone] = useState(m.phone || '');
  const [birthday, setBirthday] = useState(m.birthday || '');
  const [photoUrl, setPhotoUrl] = useState(m.photo_url || '');
  const [perms, setPerms] = useState<Record<string, PermLevel>>(m.permissions || {});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadPhoto = async (f: Blob) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', f, 'avatar.webp');
      const s = await getSession().catch(() => null);
      const res = await fetch(`${B()}/staff/upload-photo`, {
        method: 'POST',
        headers: { ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al subir la fotografía');
      }
      const data = await res.json();
      setPhotoUrl(data.url);
      flash('✓ Fotografía actualizada en WebP (<80 KB)');
    } catch (e: any) {
      flash(e.message || 'No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/staff/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          display_name: name.trim(),
          phone: phone.trim() || undefined,
          birthday: birthday || undefined,
          photo_url: photoUrl || undefined,
          permissions: perms,
        }),
      });
      onSaved();
    } catch (e: any) {
      flash(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between pb-2 border-b border-[#1e2d3d]">
            <h3 className="text-base font-bold text-[#dde6ef]">Editar {m.display_name}</h3>
            <button onClick={onClose} className="text-[#7a95aa] hover:text-[#dde6ef]">✕</button>
          </div>

          <div className="flex items-center gap-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-full overflow-hidden bg-[#111820] border-2 border-dashed border-[#1e2d3d] hover:border-[#00e5a0] flex items-center justify-center cursor-pointer transition shrink-0 relative group"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl text-[#7a95aa] group-hover:scale-110 transition">📷</span>
              )}
              {uploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-white">...</div>}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) setCropFile(f);
                e.target.value = '';
              }}
            />
            <div>
              <p className="text-xs font-semibold text-[#dde6ef]">Foto del colaborador</p>
              <p className="text-[11px] text-[#7a95aa]">Haz clic para cambiar y reencuadrar el rostro.</p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">NOMBRE</label>
            <input className={inp} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">TELÉFONO</label>
              <input className={inp} value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">CUMPLEAÑOS 🎂</label>
              <input type="date" className={inp} value={birthday} onChange={e => setBirthday(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1.5">PERMISOS PERSONALIZADOS</label>
            <div className="space-y-2 border border-[#1e2d3d] rounded-xl p-3 bg-[#111820] max-h-48 overflow-y-auto">
              {areas.map((a: any) => {
                const areaKey = (typeof a === 'string' ? a : (a.id || a.name || '')) as Area;
                const label = AREA_LABELS[areaKey] || areaKey;
                return (
                  <div key={areaKey} className="flex items-center justify-between py-1.5 border-b border-[#1e2d3d]/40 last:border-0 text-xs">
                    <span className="text-[#dde6ef]">{label}</span>
                    <LevelPicker
                      value={perms[areaKey] || 'none'}
                      onChange={v => setPerms(prev => ({ ...prev, [areaKey]: v }))}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className={`${btn} flex-1 bg-[#111820] border border-[#1e2d3d] text-[#dde6ef]`}>Cancelar</button>
            <button onClick={save} disabled={busy} className={`${btn} flex-1 bg-[#00e5a0] text-[#051b14]`}>
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>

      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          maxDimension={800}
          maxBytes={80 * 1024}
          format="image/webp"
          title="Enmarcar foto del colaborador"
          onCancel={() => setCropFile(null)}
          onSave={async (_, blob) => {
            setCropFile(null);
            if (blob) await uploadPhoto(blob);
          }}
        />
      )}
    </>
  );
}
