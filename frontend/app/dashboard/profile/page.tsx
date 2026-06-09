'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';
import { getRole, setRole, UserRole, ROLE_LABELS } from '@/app/lib/role';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeRole, setActiveRole] = useState<UserRole>('doctor');

  const [form, setForm] = useState({
    display_name: '',
    email: '',
    phone: '',
    clinic_name: '',
    photo_url: '',
    clinic_logo_url: '',
    ai_name_preference: '',
  });

  useEffect(() => {
    const init = async () => {
      const u = await getUser();
      if (!u) { router.push('/auth/login'); return; }
      setUser(u);
      setActiveRole(getRole());
      try {
        const session = await getSession();
        const tok = session?.access_token;
        const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
        const res = await fetch(`${BACKEND()}/doctor/profile`, { headers });
        const data = await res.json();
        setForm({
          display_name: data.display_name || u.user_metadata?.full_name || '',
          email: data.email || u.email || '',
          phone: data.phone || '',
          clinic_name: data.clinic_name || '',
          photo_url: data.photo_url || '',
          clinic_logo_url: data.clinic_logo_url || '',
          ai_name_preference: data.ai_name_preference || '',
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
      await fetch(`${BACKEND()}/doctor/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(form),
      });
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
      <TopNav userName={displayName} photoUrl={form.photo_url || form.clinic_logo_url} />

      <main className="pt-16 max-w-2xl mx-auto px-6 py-10">

        <div className="mb-8">
          <h1 className="text-2xl font-serif font-bold text-[#dde6ef] mb-1">👤 Mi Perfil</h1>
          <p className="text-[#7a95aa] text-sm">Personaliza cómo APEX te identifica y cómo la IA se dirige a ti.</p>
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
            <p className="text-sm text-[#3d5870]">{form.clinic_name || 'Sin clínica configurada'}</p>
            <p className="text-xs text-[#3d5870] mt-1 font-mono">{form.email}</p>
          </div>
        </div>

        <div className="space-y-5">

          {/* Datos personales */}
          <Card title="Datos personales" icon="👤">
            <Field label="¿Cómo quieres que APEX te llame?">
              <input
                value={form.display_name}
                onChange={e => set('display_name', e.target.value)}
                className={inp}
                placeholder="Ej: García, Alejandro, Dr. Martínez..."
              />
              <p className="text-xs text-[#3d5870] mt-1">Este nombre se usa en el saludo del home y en las respuestas de la IA.</p>
            </Field>
            <Field label="Correo electrónico">
              <input value={form.email} onChange={e => set('email', e.target.value)} className={inp} placeholder="doctor@clinica.com" />
            </Field>
            <Field label="Celular / WhatsApp">
              <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inp} placeholder="+52 55 1234 5678" />
            </Field>
          </Card>

          {/* Clínica */}
          <Card title="Mi clínica" icon="🏥">
            <Field label="Nombre de la clínica o consultorio">
              <input value={form.clinic_name} onChange={e => set('clinic_name', e.target.value)} className={inp} placeholder="Clínica Longevidad, Consultorio García..." />
            </Field>
            <Field label="URL de tu foto de perfil">
              <input value={form.photo_url} onChange={e => set('photo_url', e.target.value)} className={inp} placeholder="https://..." />
              <p className="text-xs text-[#3d5870] mt-1">Sube tu foto a un servicio como imgur.com o cloudinary.com y pega el link aquí.</p>
            </Field>
            <Field label="URL del logo de la clínica (opcional)">
              <input value={form.clinic_logo_url} onChange={e => set('clinic_logo_url', e.target.value)} className={inp} placeholder="https://..." />
            </Field>
          </Card>

          {/* Rol activo */}
          <Card title="Rol activo (temporal hasta auth real)" icon="🔑">
            <Field label="¿CON QUÉ ROL ESTÁS USANDO APEX AHORA?">
              <div className="flex gap-3">
                {(['doctor','nurse','receptionist'] as UserRole[]).map(r => (
                  <button key={r}
                    onClick={() => { setRole(r); setActiveRole(r); }}
                    className="flex-1 py-3 rounded-xl text-sm font-bold transition border"
                    style={{
                      background: activeRole === r ? (r==='doctor' ? '#a78bfa' : r==='nurse' ? '#f97316' : '#0ea5e9') + '20' : 'transparent',
                      color:      activeRole === r ? (r==='doctor' ? '#a78bfa' : r==='nurse' ? '#f97316' : '#0ea5e9') : '#7a95aa',
                      borderColor: activeRole === r ? (r==='doctor' ? '#a78bfa' : r==='nurse' ? '#f97316' : '#0ea5e9') : '#1e2d3d',
                    }}>
                    {r==='doctor' ? '🟣' : r==='nurse' ? '🟨' : '🟦'} {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#3d5870] mt-2">
                El menú superior cambia según el rol. Cuando se implemente auth real, esto será automático.
              </p>
            </Field>
          </Card>

          {/* Preferencias de IA */}
          <Card title="Preferencias para la IA" icon="🤖">
            <Field label="¿Cómo quieres que la IA te dirija en los análisis?">
              <select value={form.ai_name_preference} onChange={e => set('ai_name_preference', e.target.value)} className={inp}>
                <option value="">Doctor / Doctora (por default)</option>
                <option value="nombre">Por mi nombre: Dr. {form.display_name || '...'}</option>
                <option value="colega">Como colega: "te sugiero..." / "considera..."</option>
                <option value="formal">Formal: "El médico tratante..."</option>
              </select>
              <p className="text-xs text-[#3d5870] mt-1">Esto personaliza cómo la IA redacta los diagnósticos y protocolos.</p>
            </Field>
          </Card>

          {/* Botón guardar */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 text-base font-bold rounded-2xl transition"
            style={{ background: saved ? '#00e5a0' : '#0ea5e9', color: '#000' }}
          >
            {saving ? 'Guardando...' : saved ? '✓ Perfil guardado correctamente' : 'Guardar cambios'}
          </button>

        </div>
      </main>
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
