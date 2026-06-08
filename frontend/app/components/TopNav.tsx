'use client';

import { useRouter, usePathname } from 'next/navigation';
import { signOut } from '@/app/lib/auth';

export default function TopNav({ userName = 'Doctor' }: { userName?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const links = [
    { href: '/dashboard',          icon: '🏠', label: 'Inicio'    },
    { href: '/dashboard/patients', icon: '👥', label: 'Pacientes' },
    { href: '/dashboard/staff',    icon: '🩺', label: 'Staff'     },
  ];

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  const handleLogout = async () => {
    await signOut();
    router.push('/auth/login');
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 z-50 bg-[rgba(7,10,14,.98)] border-b border-[#1e2d3d] backdrop-blur-2xl flex items-center px-6 gap-6">

      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <span className="text-xl font-black text-[#00e5a0] tracking-widest">APEX</span>
        <span className="font-mono text-xs bg-[rgba(14,165,233,.15)] border border-[rgba(14,165,233,.25)] px-1.5 py-0.5 rounded text-[#0ea5e9]">
          PRO
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex items-center gap-2">
        {links.map(({ href, icon, label }) => (
          <button
            key={href}
            onClick={() => router.push(href)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: isActive(href) ? 'rgba(0,229,160,.12)' : 'transparent',
              color:      isActive(href) ? '#00e5a0' : '#7a95aa',
              border:     isActive(href) ? '1px solid rgba(0,229,160,.25)' : '1px solid transparent',
            }}
          >
            <span className="text-base">{icon}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Doctor info */}
      <div className="flex items-center gap-3">
        <div className="text-right hidden md:block">
          <p className="text-sm font-semibold text-[#dde6ef]">Dr. {userName}</p>
          <p className="font-mono text-xs text-[#3d5870]">Médico</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-sm font-bold text-black">
          {userName[0]?.toUpperCase() || 'D'}
        </div>
        <button
          onClick={handleLogout}
          className="ml-2 px-3 py-1.5 rounded-lg text-xs font-mono text-[#7a95aa] hover:text-[#f43f5e] hover:bg-[rgba(244,63,94,.08)] border border-transparent hover:border-[rgba(244,63,94,.2)] transition"
        >
          Salir
        </button>
      </div>
    </header>
  );
}
