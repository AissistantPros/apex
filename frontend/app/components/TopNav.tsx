'use client';

import { useRouter, usePathname } from 'next/navigation';
import { signOut } from '@/app/lib/auth';
import { getRole, setRole, setPerms, clearRoleCache, ROLE_LABELS, UserRole } from '@/app/lib/role';
import { applyBrand, clearBrandCache, readCachedBrand, type ClinicBrand } from '@/app/lib/brand';
import { planNombre } from '@/app/lib/producto';
import Icon, { type IconName } from '@/app/components/Icon';
import ApexLogo from '@/app/components/ApexLogo';
import { clearEntitlementsCache } from '@/app/lib/useEntitlements';
import { useCallback, useEffect, useRef, useState } from 'react';

interface TopNavProps {
  userName?: string;
  photoUrl?: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

// primary: se muestra siempre en la barra. El resto se agrupa en el menú "Más".
const ALL_LINKS: Array<{ href: string; icon: IconName; label: string; roles: string[]; feature?: string; primary?: boolean }> = [
  { href: '/dashboard',            icon: 'home',      label: 'Inicio',      roles: ['admin','doctor','nurse','receptionist','accounting','marketing'], primary: true },
  { href: '/dashboard/patients',   icon: 'users',     label: 'Pacientes',   roles: ['admin','doctor','nurse','receptionist'], feature: 'pacientes', primary: true },
  { href: '/dashboard/agenda',     icon: 'calendar',  label: 'Agenda',      roles: ['doctor','nurse','receptionist'], feature: 'agenda', primary: true },
  { href: '/dashboard/sala',       icon: 'bell',      label: 'Sala',        roles: ['doctor','nurse'], primary: true },
  { href: '/dashboard/proximos',   icon: 'clock',     label: 'Próximos',    roles: ['doctor'], feature: 'sala_espera', primary: true },
  { href: '/dashboard/clinic',     icon: 'wallet',    label: 'Cobros',      roles: ['receptionist'], feature: 'contabilidad', primary: true },
  { href: '/dashboard/clinic',     icon: 'building',  label: 'Mi consultorio', roles: ['admin','doctor','accounting'], feature: 'contabilidad' },
  { href: '/dashboard/marketing',  icon: 'megaphone', label: 'Marketing',   roles: ['admin','doctor','marketing'], feature: 'marketing' },
  { href: '/dashboard/biblioteca', icon: 'book',      label: 'Biblioteca',  roles: ['admin'] },
  { href: '/dashboard/staff',      icon: 'team',      label: 'Equipo',      roles: ['admin','doctor'] },
  { href: '/dashboard/aprobaciones', icon: 'check',   label: 'Aprobaciones', roles: ['doctor'] },
  { href: '/dashboard/stats',      icon: 'activity',  label: 'Estadísticas', roles: ['doctor'] },
  { href: '/dashboard/help',       icon: 'book',      label: 'Ayuda',       roles: ['doctor','nurse','receptionist','accounting'] },
  { href: '/dashboard/soporte',    icon: 'message',   label: 'Soporte',     roles: ['doctor'] },
];

// ── Helpers de tema ──────────────────────────────────────────────────────────
function getTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light';
  return (localStorage.getItem('apex-theme') as 'dark' | 'light') || 'light';
}
function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('apex-theme', theme);
}
function applyPlan(plan: string | null) {
  const v = plan === 'apex_lite' ? 'lite' : 'pro';
  document.documentElement.setAttribute('data-plan', v);
  try { localStorage.setItem('apex_plan', v); } catch { /* sin storage */ }
}

const Badge = ({ n, tone = 'accent' }: { n: number; tone?: 'accent' | 'danger' }) => (
  <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold flex items-center justify-center text-white"
    style={{ background: tone === 'danger' ? 'var(--c-danger)' : 'var(--c-accent)' }}>{n}</span>
);

export default function TopNav({ userName = 'Doctor', photoUrl }: TopNavProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const [role, setRoleState]     = useState<UserRole>('doctor');
  const [theme, setThemeState]   = useState<'dark' | 'light'>('light');
  const [aprobCount, setAprobCount] = useState(0);
  const [waitCount, setWaitCount] = useState(0);  // sala de espera en vivo
  const [feats, setFeats] = useState<Record<string, boolean> | null>(null);  // servicios contratados
  const [plan, setPlan] = useState<string | null>(null);
  const [brand, setBrand] = useState<ClinicBrand | null>(null);
  const [credits, setCredits] = useState<{ remaining: number; low: boolean; empty: boolean } | null>(null);
  const [rechargeSent, setRechargeSent] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Rol, permisos, plan y marca REALES de la cuenta (los define el backend, no el navegador).
  const cargarWhoami = useCallback(async () => {
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
      const ent = who?.entitlements;
      if (ent?.plan) { setPlan(ent.plan); applyPlan(ent.plan); }
      if (ent && typeof ent.ai_credits_remaining === 'number') {
        setCredits({ remaining: ent.ai_credits_remaining, low: !!ent.ai_credits_low, empty: !!ent.ai_credits_empty });
      }
      if (who?.clinic_brand) { setBrand(who.clinic_brand); applyBrand(who.clinic_brand); }
      else { setBrand(null); clearBrandCache(); }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    setRoleState(getRole());
    const saved = getTheme();
    setThemeState(saved);
    applyTheme(saved);
    setBrand(readCachedBrand());           // sin parpadeo: lo último que se conocía
    cargarWhoami();
    // Si el doctor cambia su logotipo o su foto, la barra se actualiza sin recargar.
    const alCambiar = () => cargarWhoami();
    window.addEventListener('apex:brand-updated', alCambiar);
    return () => window.removeEventListener('apex:brand-updated', alCambiar);
  }, [cargarWhoami]);

  const isLite = plan === 'apex_lite';
  const hasAI = !!feats && Object.entries(feats).some(([k, v]) => k.startsWith('ia_') && v);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    applyTheme(next);
  };

  // El doctor no controla el cobro (eso es del proveedor); ante créditos bajos, SOLICITA la
  // recarga y se abre un ticket de soporte al proveedor.
  const requestRecharge = async () => {
    if (rechargeSent) return;
    if (!window.confirm('¿Enviar una solicitud de recarga de créditos de IA al proveedor?')) return;
    try {
      const { getSession } = await import('@/app/lib/auth');
      const s = await getSession().catch(() => null);
      if (!s?.access_token) return;
      const B = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      await fetch(`${B}/support/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({
          subject: 'Solicitud de recarga de créditos IA',
          body: 'La clínica solicita recargar créditos de IA (saldo bajo o agotado).',
          kind: 'other',
        }),
      });
      setRechargeSent(true);
    } catch { /* silencioso */ }
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

  // Aviso de pacientes esperando en la sala en vivo (enfermería y doctor)
  useEffect(() => {
    if (role !== 'doctor' && role !== 'nurse') { setWaitCount(0); return; }
    let alive = true;
    const poll = async () => {
      try {
        const { getSession } = await import('@/app/lib/auth');
        const s = await getSession().catch(() => null);
        if (!s?.access_token) return;
        const B = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const r = await fetch(`${B}/appointments/waitroom/count`, { headers: { Authorization: `Bearer ${s.access_token}` } });
        if (r.ok && alive) setWaitCount((await r.json()).count || 0);
      } catch { /* silencioso */ }
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [role]);

  // Se muestran solo los módulos del rol Y de los servicios contratados (si ya se cargaron)
  const links = ALL_LINKS.filter(l =>
    l.roles.includes(role) && (!l.feature || !feats || feats[l.feature] !== false));
  const primaryLinks = links.filter(l => l.primary);
  const overflowLinks = links.filter(l => !l.primary);
  const overflowBadge = overflowLinks.some(l => l.href === '/dashboard/aprobaciones') ? aprobCount : 0;

  // Cerrar el menú "Más" al hacer clic fuera o con Escape
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [moreOpen]);

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  // ── Identidad visual del consultorio ──────────────────────────────────────────
  const colores = brand?.brand?.colors || {};
  const primario = HEX.test(colores.primary || '') ? colores.primary : null;
  const acento = HEX.test(colores.accent || '') ? colores.accent : null;
  const logoBlanco = brand?.brand?.logo_white_url || null;
  const logoColor = brand?.logo_url || null;
  const oscuro = theme === 'dark';
  // Con colores de marca y logo en blanco, la barra se pinta del color del consultorio (membrete).
  const banda = !oscuro && !!primario && !!logoBlanco;
  const logoSrc = (banda || oscuro) && logoBlanco ? logoBlanco : logoColor;
  const logoEnPlaca = !!logoSrc && !banda && oscuro && !logoBlanco;   // logo a color sobre fondo oscuro
  const lineaActiva = banda
    ? (acento && primario && acento.toLowerCase() !== primario.toLowerCase() ? 'var(--c-accent)' : '#ffffff')
    : 'var(--c-primary)';
  const fg      = banda ? '#ffffff' : 'var(--c-text)';
  const fgSuave = banda ? 'rgba(255,255,255,0.78)' : 'var(--c-text-2)';
  const fgActivo = banda ? '#ffffff' : 'var(--c-primary)';
  const hoverBg = banda ? 'hover:bg-white/10' : 'hover:bg-[var(--c-subtle)]';

  return (
    <header
      className="fixed top-0 left-0 right-0 h-[72px] z-50 flex items-center px-4 md:px-6 gap-3"
      style={{
        background: banda ? 'var(--c-primary)' : 'var(--c-nav)',
        borderBottom: banda ? 'none' : '1px solid var(--c-border)',
        borderTop: '3px solid var(--c-accent)',
        color: fg,
      }}
    >
      {/* Identidad: logotipo COMPLETO del consultorio arriba a la izquierda + marca Apex */}
      <button onClick={() => router.push('/dashboard')} className="flex items-center gap-4 mr-2 flex-shrink-0 h-full" aria-label="Ir al inicio">
        {logoSrc ? (
          logoEnPlaca ? (
            <span className="rounded-md bg-white px-2.5 py-1.5 flex items-center">
              <img src={logoSrc} alt={brand?.name || 'Consultorio'} className="h-[40px] w-auto max-w-[190px] object-contain" />
            </span>
          ) : (
            <img src={logoSrc} alt={brand?.name || 'Consultorio'} className="h-[52px] w-auto max-w-[230px] object-contain" />
          )
        ) : (
          <span className="text-[19px] font-semibold tracking-tight max-w-[220px] truncate" style={{ color: banda ? '#fff' : 'var(--c-primary)' }}>
            {brand?.name || 'Apex'}
          </span>
        )}
        <span className="hidden lg:flex items-center gap-4">
          <span className="w-px h-8" style={{ background: banda ? 'rgba(255,255,255,0.3)' : 'var(--c-border-2)' }} />
          <span style={{ color: fgSuave }}><ApexLogo plan={planNombre(plan)} size="sm" /></span>
        </span>
      </button>

      {/* Navegación: el módulo activo se marca con una línea, sin cápsulas ni brillos */}
      <nav className="flex items-stretch gap-0.5 self-stretch" aria-label="Principal">
        {primaryLinks.map(({ href, icon, label }) => {
          const active = isActive(href);
          return (
            <button key={href + label} onClick={() => router.push(href)} title={label} aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center gap-2 px-3 text-[14px] font-medium transition-colors ${hoverBg}`}
              style={{ color: active ? fgActivo : fgSuave }}>
              <Icon name={icon} size={18} />
              <span className="hidden md:inline">{label}</span>
              {href === '/dashboard/sala' && waitCount > 0 && <Badge n={waitCount} />}
              {active && <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-t-full" style={{ background: lineaActiva }} />}
            </button>
          );
        })}

        {overflowLinks.length > 0 && (
          <div className="relative flex items-stretch" ref={moreRef}>
            <button onClick={() => setMoreOpen(o => !o)} aria-haspopup="menu" aria-expanded={moreOpen}
              className={`flex items-center gap-1.5 px-3 text-[14px] font-medium transition-colors ${hoverBg}`}
              style={{ color: moreOpen ? fgActivo : fgSuave }}>
              <Icon name="more" size={18} />
              <span className="hidden md:inline">Más</span>
              <Icon name="chevron" size={14} />
              {!moreOpen && overflowBadge > 0 && <Badge n={overflowBadge} tone="danger" />}
            </button>

            {moreOpen && (
              <div role="menu"
                className="absolute left-0 top-full mt-1 min-w-[220px] rounded-lg py-1 z-50"
                style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', boxShadow: '0 8px 24px rgba(16,24,40,.18)' }}>
                {overflowLinks.map(({ href, icon, label }) => (
                  <button key={href + label} role="menuitem" onClick={() => { setMoreOpen(false); router.push(href); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium text-left transition-colors hover:bg-[var(--c-subtle)]"
                    style={{ color: isActive(href) ? 'var(--c-primary)' : 'var(--c-text)' }}>
                    <Icon name={icon} size={17} />
                    <span className="flex-1">{label}</span>
                    {href === '/dashboard/aprobaciones' && aprobCount > 0 && <Badge n={aprobCount} tone="danger" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="flex-1" />

      {/* Aviso de créditos de IA: solo si el consultorio tiene IA contratada */}
      {hasAI && credits && (credits.low || credits.empty) && (role === 'doctor' || role === 'admin') && (
        <button
          onClick={role === 'admin' ? () => router.push('/admin') : requestRecharge}
          title={`Créditos de IA restantes: ${credits.remaining.toLocaleString('es-MX')}`}
          className="hidden sm:flex items-center gap-2 text-[13px] font-medium px-3 py-1.5 rounded-lg flex-shrink-0"
          style={{ color: credits.empty ? 'var(--c-danger)' : 'var(--c-warn)', border: '1px solid currentColor', background: 'var(--c-card)' }}
        >
          <span>{credits.empty ? 'Sin créditos de IA' : 'Créditos de IA bajos'}</span>
          <span style={{ opacity: .75 }}>· {role === 'admin' ? 'Recargar' : (rechargeSent ? 'Solicitud enviada' : 'Solicitar recarga')}</span>
        </button>
      )}

      {/* Ancla del chat del equipo — TeamChat monta aquí su botón (barra superior, siempre visible) */}
      <div className="apex-chat-slot flex items-center" />

      {/* Tema claro / oscuro (Lite y Pro) */}
      <button onClick={toggleTheme} aria-label={oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        title={oscuro ? 'Tema claro' : 'Tema oscuro'}
        className={`p-2 rounded-lg transition-colors ${hoverBg}`} style={{ color: fgSuave }}>
        <Icon name={oscuro ? 'sun' : 'moon'} size={19} />
      </button>

      {/* Persona: nombre, rol y acceso al perfil */}
      <button onClick={() => router.push('/dashboard/profile')} aria-label="Ver mi perfil"
        className={`flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-lg transition-colors ${hoverBg}`}>
        <div className="text-right hidden md:block leading-tight">
          <p className="text-[14px] font-semibold" style={{ color: fg }}>{userName}</p>
          <p className="text-[12px]" style={{ color: fgSuave }}>{ROLE_LABELS[role]}</p>
        </div>
        {photoUrl ? (
          <img src={photoUrl} alt="" className="w-10 h-10 rounded-full object-cover"
            style={{ border: banda ? '2px solid rgba(255,255,255,0.55)' : '1px solid var(--c-border-2)' }} />
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-[15px] font-semibold"
            style={banda ? { background: 'rgba(255,255,255,0.18)', color: '#fff' } : { background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}>
            {userName[0]?.toUpperCase() || 'D'}
          </div>
        )}
      </button>

      <button
        onClick={async () => {
          clearRoleCache(); clearBrandCache(); clearEntitlementsCache();
          try { localStorage.removeItem('apex_plan'); document.documentElement.removeAttribute('data-plan'); } catch { /* sin storage */ }
          await signOut(); router.push('/auth/login');
        }}
        title="Cerrar sesión" aria-label="Cerrar sesión"
        className={`p-2 rounded-lg transition-colors ${hoverBg}`}
        style={{ color: fgSuave }}
      >
        <Icon name="logout" size={18} />
      </button>
    </header>
  );
}
