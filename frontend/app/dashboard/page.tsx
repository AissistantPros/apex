'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getUser().then(u => {
      if (!u) router.push('/auth/login');
      else { setUser(u); fetchData(); }
    });
  }, [router]);

  // Cerrar dropdown al click fuera
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchData = async () => {
    try {
      const session = await getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [pRes, profileRes] = await Promise.all([
        fetch(`${BACKEND()}/patients?limit=100`, { headers }),
        fetch(`${BACKEND()}/doctor/profile`, { headers }),
      ]);
      const pData = await pRes.json();
      const profileData = await profileRes.json();
      const patients = pData.patients || [];
      setAllPatients(patients);
      setRecentPatients(patients.slice(0, 5));
      setProfile(profileData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Búsqueda en vivo
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const q = searchQuery.toLowerCase();
    const results = allPatients.filter(p =>
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.id || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q)
    ).slice(0, 8);
    setSearchResults(results);
    setShowDropdown(true);
  }, [searchQuery, allPatients]);

  const displayName = profile?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] || 'Doctor';

  const clinicName = profile?.clinic_name || 'APEX';
  const photoUrl = profile?.photo_url || profile?.clinic_logo_url || null;

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">Cargando...</div>
  );

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav userName={displayName} photoUrl={photoUrl} />

      <main className="pt-16 max-w-3xl mx-auto px-6 py-10">

        {/* Bienvenida centrada */}
        <div className="text-center mb-10">
          {photoUrl ? (
            <img src={photoUrl} alt="foto" className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 border-2 border-[#00e5a0]/30" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-3xl font-black text-black mx-auto mb-4">
              {displayName[0]?.toUpperCase() || 'D'}
            </div>
          )}
          <h1 className="text-3xl font-serif font-bold text-[#dde6ef] mb-1">
            Buenos días, {displayName} 👋
          </h1>
          <p className="text-[#7a95aa]">{clinicName} — ¿Con quién trabajamos hoy?</p>
        </div>

        {/* 3 botones grandes */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <BigButton icon="👤" label="Paciente Nuevo" color="#00e5a0"
            onClick={() => router.push('/dashboard/new-patient')} />
          <BigButton icon="📊" label="Estadísticas" color="#0ea5e9"
            onClick={() => router.push('/dashboard/stats')} />
          <BigButton icon="❓" label="Ayuda" color="#f59e0b"
            onClick={() => router.push('/dashboard/help')} />
        </div>

        {/* Buscador con dropdown */}
        <div ref={searchRef} className="relative mb-10">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔍</span>
            <input
              type="text"
              placeholder="Buscar paciente por nombre, ID, correo o teléfono..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery && setShowDropdown(true)}
              className="w-full pl-12 pr-10 py-4 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl text-[#dde6ef] text-base placeholder-[#3d5870] outline-none focus:border-[#00e5a0] transition"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setShowDropdown(false); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3d5870] hover:text-[#dde6ef] text-2xl leading-none">
                ×
              </button>
            )}
          </div>

          {/* Dropdown resultados */}
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden shadow-2xl z-50">
              {searchResults.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-2xl mb-1">🔍</p>
                  <p className="text-[#7a95aa] font-medium">No encontrado</p>
                  <p className="text-[#3d5870] text-xs mt-1">No hay pacientes que coincidan con "{searchQuery}"</p>
                </div>
              ) : (
                <>
                  {searchResults.map(p => {
                    const dob = p.date_of_birth || p.birth_date;
                    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
                    const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
                    return (
                      <div key={p.id}
                        onClick={() => { router.push(`/dashboard/patient/${p.id}`); setShowDropdown(false); setSearchQuery(''); }}
                        className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#111820] cursor-pointer transition border-b border-[#1e2d3d] last:border-0"
                      >
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {initials || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[#dde6ef] text-sm truncate">{p.full_name}</p>
                          <p className="text-xs text-[#3d5870] font-mono">{p.id}</p>
                        </div>
                        {age !== null && <span className="text-xs text-[#3d5870]">{age} años</span>}
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

        {/* Actividad reciente */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#dde6ef]">📋 Actividad reciente</h2>
              <p className="text-xs text-[#3d5870] mt-0.5">Pacientes con cambios recientes</p>
            </div>
            <button onClick={() => router.push('/dashboard/patients')}
              className="text-sm text-[#0ea5e9] hover:underline font-mono">
              Ver todos →
            </button>
          </div>

          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden">
            {recentPatients.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-4xl mb-3">🏥</p>
                <p className="text-[#7a95aa] font-medium">Aún no hay pacientes</p>
                <button onClick={() => router.push('/dashboard/new-patient')}
                  className="mt-4 px-5 py-2.5 bg-[#00e5a0] text-black text-sm font-bold rounded-xl hover:opacity-90 transition">
                  + Paciente Nuevo
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#1e2d3d]">
                {recentPatients.map(p => {
                  const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
                  const dob = p.date_of_birth || p.birth_date;
                  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
                  return (
                    <div key={p.id} onClick={() => router.push(`/dashboard/patient/${p.id}`)}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-[#111820] cursor-pointer transition">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                        {initials || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#dde6ef] truncate">{p.full_name}</p>
                        <p className="text-xs text-[#7a95aa] font-mono">{p.id}</p>
                      </div>
                      {age !== null && <span className="text-xs text-[#3d5870] hidden sm:block">{age} años</span>}
                      <span className="text-[#3d5870] text-lg">›</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}

function BigButton({ icon, label, color, onClick }: { icon: string; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center justify-center gap-3 py-8 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl hover:shadow-xl transition-all group"
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '66'; e.currentTarget.style.background = color + '0d'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d3d'; e.currentTarget.style.background = '#0d1520'; }}
    >
      <span className="text-5xl group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-sm font-bold text-[#dde6ef] text-center leading-tight">{label}</span>
    </button>
  );
}
