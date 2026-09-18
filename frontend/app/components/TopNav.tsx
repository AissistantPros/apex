'use client';

import { useRouter, usePathname } from 'next/navigation';
import { signOut } from '@/app/lib/auth';
import { getRole, setRole, setPerms, clearRoleCache, ROLE_LABELS, ROLE_COLORS, UserRole } from '@/app/lib/role';
import { useEffect, useState } from 'react';

interface TopNavProps {
  userName?: string;
  photoUrl?: string | null;
}

const ALL_LINKS = [
  { href: '/dashboard',          icon: '🏠', label: 'Inicio',     roles: ['admin','doctor','nurse','receptionist','accounting','marketing'] },
  { href: '/dashboard/patients', icon: '👥', label: 'Pacientes',  roles: ['admin','doctor','nurse','receptionist'], feature: 'pacientes' },
  { href: '/dashboard/agenda',   icon: '📅', label: 'Agenda',     roles: ['doctor','nurse','receptionist'], feature: 'agenda' },
  { href: '/dashboard/proximos', icon: '🔜', label: 'Próximos',   roles: ['doctor'], feature: 'sala_espera' },
  { href: '/dashboard/clinic',   icon: '🏥', label: 'Mi Clínica', roles: ['admin','doctor','accounting'], feature: 'contabilidad' },
  { href: '/dashboard/clinic',   icon: '💳', label: 'Cobros',     roles: ['receptionist'], feature: 'contabilidad' },
  { href: '/dashboard/marketing', icon: '📣', label: 'Marketing',  roles: ['admin','doctor','marketing'], feature: 'marketing' },
  { href: '/dashboard/biblioteca', icon: '📚', label: 'Biblioteca', roles: ['admin'] },
  { href: '/dashboard/staff',    icon: '🩺', label: 'Staff',      roles: ['admin','doctor'] },
  { href: '/dashboard/soporte',  icon: '💬', label: 'Soporte',    roles: ['doctor'] },
  { href: '/dashboard/aprobaciones', icon: '✅', label: 'Aprobaciones', roles: ['doctor'] },
];

// ── Helpers de tema ──────────────────────────────────────────────────────────
function getTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem('apex-theme') as 'dark' | 'light') || 'dark';
}
function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('apex-theme', theme);
}

// ── Script de hidratación temprana (evita flash) ─────────────────────────────
// Se inyecta en el <head> via layout.tsx — exportado por separado
export const themeScript = `
(function(){
  var t = localStorage.getItem('apex-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();
`;

export default function TopNav({ userName = 'Doctor', photoUrl }: TopNavProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const [role, setRoleState]     = useState<UserRole>('doctor');
  const [theme, setThemeState]   = useState<'dark' | 'light'>('dark');
  const [aprobCount, setAprobCount] = useState(0);
  const [feats, setFeats] = useState<Record<string, boolean> | null>(null);  // servicios contratados

  useEffect(() => {
    setRoleState(getRole());
    const saved = getTheme();
    setThemeState(saved);
    applyTheme(saved);
    // Sincroniza el rol REAL desde el backend según la cuenta autenticada.
    // Sin sesión válida no se cambia nada (el usuario será enviado al login por la página).
    (async () => {
      try {
        const { getSession } = await import('@/app/lib/auth');
        const s = await getSession().catch(() => null);
        if (!s?.access_token) return;
        const B = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const r = await fetch(`${B}/staff/whoami`, { headers: { Authorization: `Bearer ${s.access_token}` } });
        if (!r.ok) return;
        const who = await r.json();
        if (who?.role && ['admin', 'doctor', 'nurse', 'receptionist', 'accounting', 'marketing'].includes(who.role)) {
          setRole(who.role); setRoleState(who.role);
        }
        if (who?.permissions) setPerms(who.permissions);
        if (who?.entitlements?.features) setFeats(who.entitlements.features);
      } catch { /* silencioso */ }
    })();
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    applyTheme(next);
  };

  // Aviso de bajas de expediente pendientes (solo el doctor las aprueba)
  useEffect(() => {
    if (role !== 'doctor') { setAprobCount(0); return; }
    let alive = true;
    const poll = async () => {
      try {
        const { getSession } = await import('@/app/lib/auth');
        const s = await getSession().catch(() => null);
        if (!s?.access_token) return;
        const B = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const r = await fetch(`${B}/deletions/pending/count`, { headers: { Authorization: `Bearer ${s.access_token}` } });
        if (r.ok && alive) setAprobCount((await r.json()).count || 0);
      } catch { /* silencioso */ }
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [role]);

  // Se muestran solo los módulos del rol Y de los servicios contratados (si ya se cargaron)
  const links = ALL_LINKS.filter(l =>
    l.roles.includes(role) && (!('feature' in l) || !feats || feats[(l as any).feature] !== false));

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  const roleColor = ROLE_COLORS[role];

  const isDark = theme === 'dark';

  return (
    <header
      className="fixed top-0 left-0 right-0 h-16 z-50 backdrop-blur-2xl flex items-center px-6 gap-4"
      style={{
        background:  isDark ? 'rgba(7,10,14,0.98)'    : 'rgba(255,255,255,0.98)',
        borderBottom: `1px solid ${isDark ? '#1e2d3d' : '#cddae6'}`,
      }}
    >

      {/* Logo */}
      <div className="flex items-center gap-2 mr-2 flex-shrink-0">
        <span className="text-xl font-black tracking-widest" style={{ color: 'var(--c-green)' }}>APEX</span>
        <span className="font-mono text-xs px-1.5 py-0.5 rounded"
          style={{ color: 'var(--c-blue)', background: 'var(--c-blue-10)', border: '1px solid var(--c-blue-25)' }}>
          PRO
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {links.map(({ href, icon, label }) => (
          <button key={href} onClick={() => router.push(href)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background:  isActive(href) ? 'var(--c-green-10)' : 'transparent',
              color:       isActive(href) ? 'var(--c-green)'    : 'var(--c-text-2)',
              border:      isActive(href) ? '1px solid var(--c-green-20)' : '1px solid transparent',
            }}>
            <span>{icon}</span>
            <span className="hidden md:inline">{label}</span>
            {href === '/dashboard/aprobaciones' && aprobCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#f43f5e] text-white text-[10px] font-bold flex items-center justify-center">{aprobCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Ancla del chat del equipo — TeamChat monta aquí su botón (barra superior, siempre visible) */}
      <div className="apex-chat-slot flex items-center mr-1.5" />

      {/* Toggle dark/light */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all"
        style={{
          background:  isDark ? 'rgba(255,255,255,0.07)' : 'rgba(12,31,46,0.07)',
          color:       'var(--c-text-2)',
          border:      `1px solid var(--c-border)`,
        }}
      >
        <span className="text-base">{isDark ? '☀️' : '🌙'}</span>
        <span className="hidden sm:inline text-xs">{isDark ? 'Claro' : 'Oscuro'}</span>
      </button>

      {/* Badge de rol */}
      <span
        className="hidden sm:flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg flex-shrink-0"
        style={{ color: roleColor, background: roleColor + '15', border: `1px solid ${roleColor}33` }}
      >
        {role === 'doctor' ? '🟣' : role === 'nurse' ? '🟨' : '🟦'} {ROLE_LABELS[role]}
      </span>

      {/* Perfil */}
      <button
        onClick={() => router.push('/dashboard/profile')}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all"
        style={{ border: '1px solid transparent' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--c-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div className="text-right hidden md:block">
          <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{userName}</p>
          <p className="font-mono text-xs" style={{ color: 'var(--c-text-3)' }}>Ver perfil</p>
        </div>
        {photoUrl ? (
          <img src={photoUrl} alt="foto" className="w-9 h-9 rounded-full object-cover border-2"
            style={{ borderColor: 'var(--c-green-30)' }} />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-sm font-bold text-black">
            {userName[0]?.toUpperCase() || 'D'}
          </div>
        )}
      </button>

      {/* Salir */}
      <button
        onClick={async () => { clearRoleCache(); await signOut(); router.push('/auth/login'); }}
        className="px-3 py-1.5 rounded-lg text-xs font-mono transition"
        style={{ color: 'var(--c-text-2)', border: '1px solid transparent' }}
        onMouseEnter={e => {
          e.currentTarget.style.color = '#f43f5e';
          e.currentTarget.style.background = 'rgba(244,63,94,.08)';
          e.currentTarget.style.borderColor = 'rgba(244,63,94,.2)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--c-text-2)';
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'transparent';
        }}
      >
        Salir
      </button>
    </header>
  );
}
