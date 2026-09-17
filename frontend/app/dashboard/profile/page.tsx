'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import { getRole, UserRole, ROLE_LABELS, ROLE_COLORS } from '@/app/lib/role';
import { notifyDoctorProfileUpdated } from '@/app/lib/useDoctorProfile';
import PhotoCropModal from '@/app/components/PhotoCropModal';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeRole, setActiveRole] = useState<UserRole>('doctor');
  // La asistente/enfermera edita solo SU identidad (nombre + foto para el chat),
  // no la config del consultorio (membrete, clínica, IA). Separación por rol.
  const isStaff = activeRole === 'receptionist' || activeRole === 'nurse';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Selecciona un archivo de imagen'); return; }
    if (file.size > 25 * 1024 * 1024) { alert('La imagen no debe superar 25 MB'); return; }
    setCropFile(file);
  };

  const [form, setForm] = useState({
    display_name: '',
    email: '',
    phone: '',
    clinic_name: '',
    photo_url: '',
    clinic_logo_url: '',
    ai_name_preference: '',
    letterhead: {} as Record<string, string>,
  });

  useEffect(() => {
    const init = async () => {
      const u = await getUser();
      if (!u) { router.push('/auth/login'); return; }
      setUser(u);
      const r = getRole();
      setActiveRole(r);
      const staff = r === 'receptionist' || r === 'nurse';
      try {
        const session = await getSession();
        const tok = session?.access_token;
        const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
        // Staff lee SU propia identidad; el doctor lee la config completa del consultorio.
        const res = await fetch(`${BACKEND()}${staff ? '/staff/me' : '/doctor/profile'}`, { headers });
        const data = await res.json();
        setForm({
          display_name: data.display_name || u.user_metadata?.full_name || '',
          email: data.email || u.email || '',
          phone: data.phone || '',
          clinic_name: data.clinic_name || '',
          photo_url: data.photo_url || '',
          clinic_logo_url: data.clinic_logo_url || '',
          ai_name_preference: data.ai_name_preference || '',
          letterhead: data.letterhead || {},
        });
      } catch (e) {
        setForm(f => ({ ...f, email: u.email || '', display_name: u.user_metadata?.full_name || '' }));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const session = await getSession();
      const tok = session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tok) headers['Authorization'] = `Bearer ${tok}`;
      // Staff solo puede tocar su propia identidad; el doctor guarda todo el perfil.
      const body = isStaff
        ? { display_name: form.display_name, photo_url: form.photo_url, phone: form.phone, ai_name_preference: form.ai_name_preference }
        : form;
      await fetch(`${BACKEND()}${isStaff ? '/staff/me' : '/doctor/profile'}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
      notifyDoctorProfileUpdated();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert('Error al guardar perfil');
    } finally {
      setSaving(false);
    }
  };

  const displayName = form.display_name || user?.email?.split('@')[0] || 'Doctor';

  if (loading) return <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">Cargando...</div>;

  return (
    <div className="min-h-screen bg-[#070a0e]">

      <main className="page-content pt-16 px-6 py-10">

        <div className="mb-8">
          <h1 className="text-2xl font-serif font-bold text-[#dde6ef] mb-1">👤 Mi Perfil</h1>
          <p className="text-[#7a95aa] text-sm">
            {isStaff
              ? 'Personaliza tu nombre y tu foto — así te ve el equipo en el chat y en las notas.'
              : 'Personaliza cómo APEX te identifica y cómo la IA se dirige a ti.'}
          </p>
        </div>

        {/* Foto / logo actual */}
        <div className="flex items-center gap-5 mb-8 p-5 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl">
          <div className="flex-shrink-0">
            {form.photo_url ? (
              <img src={form.photo_url} alt="foto" className="w-20 h-20 rounded-2xl object-cover border-2 border-[#00e5a0]/30" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-3xl font-black text-black">
                {displayName[0]?.toUpperCase() || 'D'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[#dde6ef] text-lg">{displayName}</p>
            <p className="text-sm text-[#3d5870]">{isStaff ? ROLE_LABELS[activeRole] : (form.clinic_name || 'Sin clínica configurada')}</p>
            {!isStaff && <p className="text-xs text-[#3d5870] mt-1 font-mono">{form.email}</p>}
          </div>
        </div>

        <div className="space-y-5">

          {/* Datos personales */}
          <Card title="Datos personales" icon="👤">
            <Field label={isStaff ? '¿Cómo quieres que te vean en el sistema y el chat?' : '¿Cómo quieres que APEX te llame?'}>
              <input
                value={form.display_name}
                onChange={e => set('display_name', e.target.value)}
                className={inp}
                placeholder="Ej: Alejandra, Dra. Alejandra, Enf. Gloria..."
              />
              <p className="text-xs text-[#3d5870] mt-1">
                {isStaff
                  ? 'Así te verá el equipo en el chat y en las notas — con tu nombre y foto, no como “Recepción” o “Enfermería”.'
                  : 'Este nombre se usa en el saludo del home y en las respuestas de la IA.'}
              </p>
            </Field>
            <Field label="Celular / WhatsApp">
              <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inp} placeholder="+52 55 1234 5678" />
            </Field>
            {/* Foto de perfil — visible para todos (es la que aparece en el chat) */}
            <Field label="FOTO DE PERFIL">
              <div className="flex items-center gap-4">
                {/* Preview */}
                <div className="flex-shrink-0">
                  {form.photo_url ? (
                    <img src={form.photo_url} alt="foto" className="w-16 h-16 rounded-xl object-cover border-2 border-[#00e5a0]/30" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-2xl font-black text-black">
                      {displayName[0]?.toUpperCase() || 'D'}
                    </div>
                  )}
                </div>
                {/* Botón subir + input URL */}
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoFile}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 px-4 rounded-lg text-sm font-semibold border border-[#1e2d3d] text-[#0ea5e9] hover:border-[#0ea5e9] hover:bg-[rgba(14,165,233,.08)] transition"
                  >
                    📷 Subir y recortar imagen
                  </button>
                  <input
                    value={form.photo_url.startsWith('data:') ? '' : form.photo_url}
                    onChange={e => set('photo_url', e.target.value)}
                    className={inp}
                    placeholder="O pega una URL de imagen..."
                  />
                </div>
              </div>
              {form.photo_url && (
                <button type="button" onClick={() => set('photo_url', '')}
                  className="mt-2 text-xs text-[#f43f5e] hover:underline">
                  × Quitar foto
                </button>
              )}
            </Field>
          </Card>

          {/* Clínica — solo el doctor/admin configura el consultorio */}
          {!isStaff && (
            <Card title="Mi clínica" icon="🏥">
              <Field label="Correo electrónico">
                <input value={form.email} onChange={e => set('email', e.target.value)} className={inp} placeholder="doctor@clinica.com" />
              </Field>
              <Field label="Nombre de la clínica o consultorio">
                <input value={form.clinic_name} onChange={e => set('clinic_name', e.target.value)} className={inp} placeholder="Clínica Longevidad, Consultorio García..." />
              </Field>
              <Field label="URL del logo de la clínica (opcional)">
                <input value={form.clinic_logo_url} onChange={e => set('clinic_logo_url', e.target.value)} className={inp} placeholder="https://..." />
              </Field>
            </Card>
          )}

          {/* Tu rol (definido por tu cuenta — ya no se cambia a mano) */}
          <Card title="Tu rol en la clínica" icon="🔑">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-lg text-sm font-bold"
                style={{ background: (ROLE_COLORS[activeRole] || '#7a95aa') + '22', color: ROLE_COLORS[activeRole] || '#7a95aa' }}>
                {ROLE_LABELS[activeRole] || activeRole}
              </span>
              <p className="text-xs text-[#7a95aa]">
                Tu acceso lo determina tu cuenta. Si necesitas otro rol o más permisos, pídelo al administrador de la clínica.
              </p>
            </div>
          </Card>

          {/* Preferencias de IA — solo doctor/admin */}
          {!isStaff && (
          <Card title="Preferencias para la IA" icon="🤖">
            <Field label="¿Cómo quieres que la IA te dirija en los análisis?">
              <select value={form.ai_name_preference} onChange={e => set('ai_name_preference', e.target.value)} className={inp}>
                <option value="">Doctor / Doctora (por default)</option>
                <option value="nombre">Por mi nombre: {form.display_name || '...'}</option>
                <option value="colega">Como colega: "te sugiero..." / "considera..."</option>
                <option value="formal">Formal: "El médico tratante..."</option>
              </select>
              <p className="text-xs text-[#3d5870] mt-1">Esto personaliza cómo la IA redacta los diagnósticos y protocolos.</p>
            </Field>
          </Card>
          )}

          {/* Membrete de la receta / documentos — solo doctor/admin */}
          {!isStaff && (
          <Card title="Membrete para recetas y documentos" icon="📄">
            <p className="text-xs text-[#7a95aa] -mt-2">Aparece en las recetas, reportes y solicitudes de estudios que entregas al paciente.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ['profesional', 'Nombre profesional'],
                ['especialidad', 'Especialidad'],
                ['cedula_profesional', 'Cédula profesional'],
                ['cedula_especialidad', 'Cédula de especialidad'],
                ['universidad', 'Universidad'],
                ['clinica', 'Nombre de la clínica'],
                ['direccion', 'Dirección'],
                ['ciudad', 'Ciudad / C.P.'],
                ['telefono', 'Teléfono'],
                ['whatsapp', 'WhatsApp'],
                ['website', 'Sitio web'],
                ['email', 'Correo de contacto'],
                ['logo_url', 'URL del logotipo (opcional)'],
              ] as [string, string][]).map(([k, label]) => (
                <Field key={k} label={label}>
                  <input className={inp} value={form.letterhead?.[k] || ''}
                    onChange={e => setForm(prev => ({ ...prev, letterhead: { ...prev.letterhead, [k]: e.target.value } }))} />
                </Field>
              ))}
            </div>
          </Card>
          )}

          {/* Botón guardar */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 text-base font-bold rounded-2xl transition"
            style={{ background: 'var(--c-green)', color: 'var(--c-green-fg)' }}
          >
            {saving ? 'Guardando...' : saved ? '✓ Perfil guardado correctamente' : 'Guardar cambios'}
          </button>

        </div>
      </main>
      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onSave={(base64) => { setForm(prev => ({ ...prev, photo_url: base64 })); setCropFile(null); }}
        />
      )}
    </div>
  );
}

const inp = "w-full px-4 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] text-sm outline-none focus:border-[#0ea5e9] transition placeholder-[#3d5870]";

const Card = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
    <h3 className="text-sm font-semibold text-[#dde6ef] flex items-center gap-2">{icon} {title}</h3>
    {children}
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-xs font-mono text-[#7a95aa] mb-1.5 block uppercase tracking-wider">{label}</label>
    {children}
  </div>
);
