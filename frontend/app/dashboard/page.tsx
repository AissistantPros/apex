'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import { getRole } from '@/app/lib/role';
import TopNav from '@/app/components/TopNav';
import ChatBubble from '@/app/components/ChatBubble';
import { useDoctorProfile } from '@/app/lib/useDoctorProfile';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const getGreeting = (name: string) => {
  const h = new Date().getHours();
  if (h >= 0  && h < 4)  return { line1: 'Todavía en pie,',  line2: name };
  if (h >= 4  && h < 6)  return { line1: 'Madrugando,',      line2: name };
  if (h >= 6  && h < 12) return { line1: 'Buenos días,',     line2: name };
  if (h >= 12 && h < 19) return { line1: 'Buenas tardes,',   line2: name };
  return                         { line1: 'Buenas noches,',   line2: name };
};

export default function DashboardPage() {
  const router = useRouter();
  const { displayName, photoUrl, profile } = useDoctorProfile();
  const [user, setUser]         = useState<any>(null);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [isDoctor, setIsDoctor] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getUser().then(u => {
      if (!u) { router.push('/auth/login'); return; }
      setUser(u);
      setIsDoctor(getRole() === 'doctor');
      fetchData();
    });
  }, [router]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const fetchData = async () => {
    try {
      const session = await getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const pRes = await fetch(`${BACKEND()}/patients?limit=200`, { headers });
      setAllPatients((await pRes.json()).patients || []);
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
  const greeting   = getGreeting(displayName);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">Cargando…</div>
  );

  return (
    <>
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav userName={displayName} photoUrl={photoUrl} />

      <main className="pt-16 max-w-5xl mx-auto px-6 flex flex-col gap-7 pb-24">

        {/* ── Encabezado ── */}
        <div className="flex flex-col items-center pt-12 pb-2 text-center">
          {photoUrl ? (
            <img src={photoUrl} alt="foto"
              className="w-28 h-28 rounded-full object-cover mb-5 border-2 border-[#00e5a0]/40 shadow-lg shadow-black/50" />
          ) : (
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-4xl font-black text-black mb-5 shadow-lg shadow-black/50">
              {displayName[0]?.toUpperCase() || 'D'}
            </div>
          )}
          <h1 className="text-3xl font-serif font-bold text-[#dde6ef] leading-tight">
            {greeting.line1}{' '}
            <span style={{ color: 'var(--c-green)' }}>{greeting.line2}</span>
          </h1>
          {clinicName && (
            <p className="text-sm text-[#7a95aa] mt-1.5 font-mono">{clinicName}</p>
          )}
        </div>

        {/* ── 3 acciones principales ── */}
        <div className="grid grid-cols-3 gap-4">
          <BigButton icon="👤" label="Paciente Nuevo" color="#00e5a0"
            onClick={() => router.push('/dashboard/new-patient/flow')} />
          <BigButton icon="📊" label="Estadísticas"  color="#0ea5e9"
            onClick={() => router.push('/dashboard/stats')} />
          <BigButton icon="❓" label="Ayuda"          color="#f59e0b"
            onClick={() => router.push('/dashboard/help')} />
        </div>

        {/* ── Buscador ── */}
        <div ref={searchRef} className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl pointer-events-none">🔍</span>
          <input
            type="text"
            placeholder="Buscar paciente por nombre, ID, correo o teléfono…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery && setShowDropdown(true)}
            className="w-full pl-12 pr-10 py-4 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl text-[#dde6ef] text-base placeholder-[#3d5870] outline-none focus:border-[#00e5a0] transition"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setShowDropdown(false); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3d5870] hover:text-[#dde6ef] text-2xl leading-none">×</button>
          )}

          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden shadow-2xl z-50">
              {searchResults.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-2xl mb-1">🔍</p>
                  <p className="text-[#7a95aa] font-medium">Sin resultados para "{searchQuery}"</p>
                </div>
              ) : (
                <>
                  {searchResults.map(p => {
                    const dob = p.date_of_birth || p.birth_date;
                    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000*60*60*24*365.25)) : null;
                    const initials = `${p.first_name?.[0]||''}${p.last_name?.[0]||''}`.toUpperCase();
                    return (
                      <div key={p.id}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-[#111820] transition border-b border-[#1e2d3d] last:border-0">
                        {p.photo_url
                          ? <img src={p.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-[#1e2d3d]" />
                          : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">{initials||'?'}</div>
                        }
                        <div className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => { router.push(`/dashboard/patient/${p.id}`); setShowDropdown(false); setSearchQuery(''); }}>
                          <p className="font-semibold text-[#dde6ef] text-sm truncate">{p.full_name}</p>
                          <p className="text-xs text-[#3d5870] font-mono">{age !== null ? `${age} años` : p.id.slice(0,8)}</p>
                        </div>
                        <button
                          onClick={() => { router.push(`/dashboard/patient/${p.id}/new-visit`); setShowDropdown(false); setSearchQuery(''); }}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg hover:opacity-90 transition flex-shrink-0"
                          style={{ background: 'var(--c-green)', color: 'var(--c-green-fg)' }}>
                          + Visita
                        </button>
                      </div>
                    );
                  })}
                  <div className="px-5 py-2.5 border-t border-[#1e2d3d]">
                    <button onClick={() => { router.push('/dashboard/patients'); setShowDropdown(false); }}
                      className="text-xs text-[#0ea5e9] hover:underline w-full text-center">
                      Ver todos los pacientes →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Pacientes recientes ── */}
        <div>
          <div className="mb-3">
            <h2 className="font-semibold text-[#dde6ef]">📋 Pacientes recientes</h2>
            <p className="text-xs text-[#3d5870] mt-0.5">Últimos registros</p>
          </div>

          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden">
            {allPatients.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-4xl mb-3">🏥</p>
                <p className="text-[#7a95aa] font-medium">Aún no hay pacientes</p>
                <button onClick={() => router.push('/dashboard/new-patient/flow')}
                  className="mt-4 px-5 py-2.5 text-sm font-bold rounded-xl hover:opacity-90 transition"
                  style={{ background: 'var(--c-green)', color: 'var(--c-green-fg)' }}>
                  + Paciente Nuevo
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#1e2d3d]">
                {allPatients.slice(0, 6).map(p => {
                  const initials = `${p.first_name?.[0]||''}${p.last_name?.[0]||''}`.toUpperCase();
                  const dob = p.date_of_birth || p.birth_date;
                  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000*60*60*24*365.25)) : null;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#111820] transition cursor-pointer"
                      onClick={() => router.push(`/dashboard/patient/${p.id}`)}>
                      {p.photo_url
                        ? <img src={p.photo_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-[#1e2d3d]" />
                        : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">{initials||'?'}</div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#dde6ef] truncate text-sm">{p.full_name}</p>
                        <p className="text-xs text-[#7a95aa]">{age !== null ? `${age} años` : p.id.slice(0,8)}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => router.push(`/dashboard/patient/${p.id}/new-visit`)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg hover:opacity-90 transition"
                          style={{ background: 'var(--c-green)', color: 'var(--c-green-fg)' }}>
                          + Visita
                        </button>
                        <button onClick={() => router.push(`/dashboard/patient/${p.id}`)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg transition hidden sm:block"
                          style={{ background: 'var(--c-hover)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}>
                          Ver ficha
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>

    {/* Chat IA — solo para el médico, solo en home */}
    {isDoctor && <ChatBubble />}
    </>
  );
}

function BigButton({ icon, label, color, onClick }: {
  icon: string; label: string; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center justify-center gap-3 py-9 rounded-2xl transition-all group"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '66'; e.currentTarget.style.background = color + '12'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.background = 'var(--c-card)'; }}>
      <span className="text-4xl group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-sm font-bold text-center" style={{ color: 'var(--c-text)' }}>{label}</span>
    </button>
  );
}
