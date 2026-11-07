'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';
import ChatBubble from '@/app/components/ChatBubble';
import Icon from '@/app/components/Icon';
import { useDoctorProfile } from '@/app/lib/useDoctorProfile';
import { usaConsultaLite } from '@/app/lib/consultaLite';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const saludo = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

const fechaHoy = () => {
  const f = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return f.charAt(0).toUpperCase() + f.slice(1);   // solo la primera letra: "Jueves, 5 de noviembre"
};
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
const edadDe = (p: any) => {
  const dob = p.date_of_birth || p.birth_date;
  return dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
};

const Avatar = ({ p, size = 40 }: { p: any; size?: number }) => {
  const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase() || '?';
  return p.photo_url
    ? <img src={p.photo_url} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size, border: '1px solid var(--c-border)' }} />
    : <div className="rounded-full flex items-center justify-center font-semibold flex-shrink-0 text-[13px]"
        style={{ width: size, height: size, background: 'var(--c-subtle-2)', color: 'var(--c-text-2)' }}>{initials}</div>;
};

const Panel = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="rounded-xl overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
    <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--c-border)' }}>
      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--c-text)' }}>{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

export default function DashboardPage() {
  const router = useRouter();
  const { displayName, profile } = useDoctorProfile();
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [citas, setCitas] = useState<any[]>([]);
  const [lite, setLite] = useState(false);
  const [hasAgenda, setHasAgenda] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDoctor, setIsDoctor] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Consultorio Lite: la consulta se captura con el formulario básico, no con el flujo de IA
  const visitaHref = (id: string) => `/dashboard/patient/${id}/${lite ? 'consulta' : 'new-visit'}`;

  useEffect(() => {
    getUser().then(u => {
      if (!u) { router.push('/auth/login'); return; }
      // El admin proveedor no usa el dashboard clínico: va a su plataforma.
      if (getRole() === 'admin') { router.replace('/admin'); return; }
      setIsDoctor(getRole() === 'doctor');
      fetchData();
    });
  }, [router]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const fetchData = async () => {
    try {
      const session = await getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [pRes, eRes] = await Promise.all([
        fetch(`${BACKEND()}/patients?limit=200`, { headers }),
        fetch(`${BACKEND()}/staff/entitlements`, { headers }),
      ]);
      setAllPatients((await pRes.json()).patients || []);
      if (eRes.ok) {
        const f = (await eRes.json()).features || {};
        setLite(usaConsultaLite(f));
        setHasAgenda(f.agenda !== false);
        if (f.agenda !== false && getRole() === 'doctor') {
          const cRes = await fetch(`${BACKEND()}/appointments/upcoming`, { headers });
          if (cRes.ok) setCitas((await cRes.json()).appointments || []);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(
      allPatients.filter(p =>
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      ).slice(0, 8)
    );
    setShowDropdown(true);
  }, [searchQuery, allPatients]);

  const clinicName = profile?.clinic_name || null;

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--c-bg)', color: 'var(--c-text-2)' }}>Cargando…</div>
  );

  const primaryBtn = 'inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-lg text-[14px] font-semibold transition-opacity hover:opacity-90';
  const primaryStyle = { background: 'var(--c-primary)', color: 'var(--c-primary-fg)' };

  return (
    <>
    <div className="min-h-screen" style={{ background: 'var(--c-bg)' }}>
      <main className="page-content pt-24 px-4 md:px-6 flex flex-col gap-6 pb-24">

        {/* ── Encabezado ── */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px]" style={{ color: 'var(--c-text-2)' }}>{fechaHoy()}</p>
            <h1 className="mt-1" style={{ color: 'var(--c-text)' }}>{saludo()}, {displayName}</h1>
            {clinicName && <p className="text-[14px] mt-0.5" style={{ color: 'var(--c-text-2)' }}>{clinicName}</p>}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => router.push('/dashboard/check-in')}
              className="px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 border"
              style={{
                background: 'color-mix(in srgb, var(--c-primary) 12%, transparent)',
                color: 'var(--c-primary)',
                borderColor: 'color-mix(in srgb, var(--c-primary) 35%, transparent)',
              }}
            >
              <span>📥</span>
              <span>Registrar Visita</span>
            </button>
            <button onClick={() => router.push('/dashboard/new-patient')} className={primaryBtn} style={primaryStyle}>
              <Icon name="plus" size={18} /> Nuevo paciente
            </button>
          </div>
        </header>

        {/* ── Buscador ── */}
        <div ref={searchRef} className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--c-text-3)' }}>
            <Icon name="search" size={20} />
          </span>
          <input
            type="text" aria-label="Buscar paciente"
            placeholder="Buscar paciente por nombre, correo o teléfono"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery && setShowDropdown(true)}
            className="w-full pl-12 pr-10 min-h-[52px] rounded-xl text-[16px] outline-none transition focus:border-[var(--c-primary)]"
            style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setShowDropdown(false); }} aria-label="Borrar búsqueda"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl leading-none" style={{ color: 'var(--c-text-3)' }}>×</button>
          )}

          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50"
              style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', boxShadow: '0 8px 24px rgba(16,24,40,.12)' }}>
              {searchResults.length === 0 ? (
                <p className="px-5 py-6 text-center text-[14px]" style={{ color: 'var(--c-text-2)' }}>
                  No hay pacientes que coincidan con “{searchQuery}”.
                </p>
              ) : (
                <>
                  {searchResults.map(p => {
                    const age = edadDe(p);
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--c-subtle)] transition"
                        style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <Avatar p={p} size={36} />
                        <div className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => { router.push(`/dashboard/patient/${p.id}`); setShowDropdown(false); setSearchQuery(''); }}>
                          <p className="font-medium text-[14px] truncate" style={{ color: 'var(--c-text)' }}>{p.full_name}</p>
                          <p className="text-[12px]" style={{ color: 'var(--c-text-2)' }}>{age !== null ? `${age} años` : p.id.slice(0, 8)}</p>
                        </div>
                        <button
                          onClick={() => { router.push(visitaHref(p.id)); setShowDropdown(false); setSearchQuery(''); }}
                          className="px-3 min-h-[36px] text-[13px] font-semibold rounded-lg hover:opacity-90 transition flex-shrink-0" style={primaryStyle}>
                          Nueva consulta
                        </button>
                      </div>
                    );
                  })}
                  <button onClick={() => { router.push('/dashboard/patients'); setShowDropdown(false); }}
                    className="w-full px-5 py-2.5 text-[13px] font-medium hover:underline text-center" style={{ color: 'var(--c-primary)' }}>
                    Ver todos los pacientes
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className={`grid gap-6 ${hasAgenda && isDoctor ? 'lg:grid-cols-[1fr_340px]' : ''}`}>
          {/* ── Pacientes recientes ── */}
          <Panel title="Pacientes recientes"
            action={allPatients.length > 0 ? (
              <button onClick={() => router.push('/dashboard/patients')} className="text-[13px] font-medium hover:underline" style={{ color: 'var(--c-primary)' }}>Ver todos</button>
            ) : undefined}>
            {allPatients.length === 0 ? (
              <div className="p-10 text-center">
                <p className="font-medium" style={{ color: 'var(--c-text)' }}>Todavía no hay pacientes</p>
                <p className="text-[14px] mt-1" style={{ color: 'var(--c-text-2)' }}>Registra al primero para empezar a llevar su expediente.</p>
                <button onClick={() => router.push('/dashboard/new-patient')} className={`${primaryBtn} mt-4`} style={primaryStyle}>
                  <Icon name="plus" size={18} /> Nuevo paciente
                </button>
              </div>
            ) : (
              <ul>
                {allPatients.slice(0, 7).map(p => {
                  const age = edadDe(p);
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--c-subtle)] transition cursor-pointer"
                      style={{ borderBottom: '1px solid var(--c-border)' }}
                      onClick={() => router.push(`/dashboard/patient/${p.id}`)}>
                      <Avatar p={p} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[15px] truncate" style={{ color: 'var(--c-text)' }}>{p.full_name}</p>
                        <p className="text-[13px]" style={{ color: 'var(--c-text-2)' }}>{age !== null ? `${age} años` : p.id.slice(0, 8)}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => router.push(visitaHref(p.id))}
                          className="px-3 min-h-[38px] text-[13px] font-semibold rounded-lg hover:opacity-90 transition" style={primaryStyle}>
                          Nueva consulta
                        </button>
                        <button onClick={() => router.push(`/dashboard/patient/${p.id}`)}
                          className="px-3 min-h-[38px] text-[13px] font-medium rounded-lg transition hidden sm:block hover:bg-[var(--c-subtle-2)]"
                          style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-2)' }}>
                          Expediente
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* ── Citas de las próximas horas ── */}
          {hasAgenda && isDoctor && (
            <Panel title="Citas de hoy"
              action={<button onClick={() => router.push('/dashboard/agenda')} className="text-[13px] font-medium hover:underline" style={{ color: 'var(--c-primary)' }}>Abrir agenda</button>}>
              {citas.length === 0 ? (
                <p className="px-5 py-8 text-center text-[14px]" style={{ color: 'var(--c-text-2)' }}>No hay citas en las próximas 24 horas.</p>
              ) : (
                <ul>
                  {citas.slice(0, 6).map(c => (
                    <li key={c.id} className="flex gap-4 px-5 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <span className="w-[74px] flex-shrink-0 text-[14px] font-semibold" style={{ color: 'var(--c-primary)' }}>{hora(c.starts_at)}</span>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium truncate" style={{ color: 'var(--c-text)' }}>{c.patient_name || 'Paciente sin nombre'}</p>
                        {c.reason && <p className="text-[13px] truncate" style={{ color: 'var(--c-text-2)' }}>{c.reason}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>

      </main>
    </div>
    </>
  );
}
