'use client';

import { useRouter, usePathname } from 'next/navigation';
import { signOut } from '@/app/lib/auth';

interface TopNavProps {
  userName?: string;
  photoUrl?: string | null;
}

export default function TopNav({ userName = 'Doctor', photoUrl }: TopNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  const links = [
    { href: '/dashboard',          icon: '🏠', label: 'Inicio'     },
    { href: '/dashboard/patients', icon: '👥', label: 'Pacientes'  },
    { href: '/dashboard/clinic',   icon: '🏥', label: 'Mi Clínica' },
    { href: '/dashboard/staff',    icon: '🩺', label: 'Staff'      },
  ];

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <header className="fixed top-0 left-0 right-0 h-16 z-50 bg-[rgba(7,10,14,.98)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6 gap-4">

      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <span className="text-xl font-black text-[#00e5a0] tracking-widest">APEX</span>
        <span className="font-mono text-xs bg-[rgba(14,165,233,.15)] border border-[rgba(14,165,233,.25)] px-1.5 py-0.5 rounded text-[#0ea5e9]">PRO</span>
      </div>

      {/* Nav */}
      <nav className="flex items-center gap-1">
        {links.map(({ href, icon, label }) => (
          <button key={href} onClick={() => router.push(href)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: isActive(href) ? 'rgba(0,229,160,.12)' : 'transparent',
              color:      isActive(href) ? '#00e5a0' : '#7a95aa',
              border:     isActive(href) ? '1px solid rgba(0,229,160,.2)' : '1px solid transparent',
            }}>
            <span>{icon}</span>
            <span className="hidden md:inline">{label}</span>
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Perfil del doctor */}
      <button
        onClick={() => router.push('/dashboard/profile')}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-[#1e2d3d] transition"
      >
        <div className="text-right hidden md:block">
          <p className="text-sm font-semibold text-[#dde6ef]">Dr. {userName}</p>
          <p className="font-mono text-xs text-[#3d5870]">Ver perfil</p>
        </div>
        {photoUrl ? (
          <img src={photoUrl} alt="foto" className="w-9 h-9 rounded-full object-cover border-2 border-[#00e5a0]/30" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-sm font-bold text-black">
            {userName[0]?.toUpperCase() || 'D'}
          </div>
        )}
      </button>

      <button
        onClick={async () => { await signOut(); router.push('/auth/login'); }}
        className="px-3 py-1.5 rounded-lg text-xs font-mono text-[#7a95aa] hover:text-[#f43f5e] hover:bg-[rgba(244,63,94,.08)] transition border border-transparent hover:border-[rgba(244,63,94,.2)]"
      >
        Salir
      </button>
    </header>
  );
}
