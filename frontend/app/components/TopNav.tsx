'use client';

import { useRouter, usePathname } from 'next/navigation';
import { signOut } from '@/app/lib/auth';
import { getRole, setRole, setPerms, clearRoleCache, ROLE_LABELS, UserRole } from '@/app/lib/role';
import { applyBrand, clearBrandCache, readCachedBrand, type ClinicBrand } from '@/app/lib/brand';
import { planNombre } from '@/app/lib/producto';
import Icon, { type IconName } from '@/app/components/Icon';
import ApexLogo from '@/app/components/ApexLogo';
import { clearEntitlementsCache } from '@/app/lib/useEntitlements';
import { useCallback, useEffect, useState } from 'react';

interface TopNavProps {
  userName?: string;
  photoUrl?: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

// Menú principal: Inicio, Sala de espera, Pacientes, Agenda, Chat, Estadísticas, Mi Consultorio.
// Soporte se ubica pegado al fondo (separado del menú principal).
const ALL_LINKS: Array<{ href: string; icon: IconName; label: string; roles: string[]; feature?: string }> = [
  { href: '/dashboard',            icon: 'home',      label: 'Inicio',         roles: ['admin','doctor','nurse','receptionist','accounting','marketing'] },
  { href: '/dashboard/sala',       icon: 'bell',      label: 'Sala de espera', roles: ['admin','doctor','nurse','receptionist'] },
  { href: '/dashboard/patients',   icon: 'users',     label: 'Pacientes',      roles: ['admin','doctor','nurse','receptionist'], feature: 'pacientes' },
  { href: '/dashboard/agenda',     icon: 'calendar',  label: 'Agenda',         roles: ['doctor','nurse','receptionist'], feature: 'agenda' },
  { href: '/dashboard/stats',      icon: 'activity',  label: 'Estadísticas',   roles: ['admin','doctor'] },
  { href: '/dashboard/clinic',     icon: 'building',  label: 'Mi Consultorio', roles: ['admin','doctor','receptionist','accounting'], feature: 'contabilidad' },
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
  const [dailyAi, setDailyAi] = useState<{ used: number; limit: number } | null>(null);
  const [isSoloDoctor, setIsSoloDoctor] = useState<boolean>(true);
  const [teamCount, setTeamCount] = useState<number>(1);
  const [rechargeSent, setRechargeSent] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    const onState = (e: any) => setChatOpen(!!e?.detail?.open);
    const onUnread = (e: any) => setChatUnread(e?.detail?.count || 0);
    window.addEventListener('apex:chat-state', onState);
    window.addEventListener('apex:chat-unread', onUnread);
    return () => {
      window.removeEventListener('apex:chat-state', onState);
      window.removeEventListener('apex:chat-unread', onUnread);
    };
  }, []);

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
      if (ent && typeof ent.ai_daily_limit === 'number' && ent.ai_daily_limit > 0) {
        setDailyAi({ used: ent.ai_daily_used || 0, limit: ent.ai_daily_limit });
      }
      const team = who?.clinic_team || ent?.team;
      if (team) {
        setIsSoloDoctor(!!team.is_solo_doctor);
        setTeamCount(team.members_count || 1);
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

  // Se muestran solo los módulos del rol Y de los servicios contratados (y adaptados al equipo)
  const links = ALL_LINKS.filter(l => {
    if (!l.roles.includes(role)) return false;
    if (l.feature && feats && feats[l.feature] === false) return false;
    // Si el médico trabaja solo y no hay solicitudes de baja pendientes, no estorbar con "Aprobaciones"
    if (l.href === '/dashboard/aprobaciones' && isSoloDoctor && aprobCount === 0) return false;
    // Si el médico trabaja solo y no hay nadie en sala de espera, no estorbar con "Sala"
    if (l.href === '/dashboard/sala' && isSoloDoctor && waitCount === 0 && !feats?.sala_espera) return false;
    return true;
  });

  const clinicalLinks = links.filter(l => ['/dashboard', '/dashboard/sala', '/dashboard/patients', '/dashboard/agenda'].includes(l.href));
  const adminLinks = links.filter(l => !['/dashboard', '/dashboard/sala', '/dashboard/patients', '/dashboard/agenda'].includes(l.href));

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
    <>
      {/* ── Barra superior limpia (sin menú horizontal abarrotado) ── */}
      <header
        className="fixed top-0 left-0 right-0 h-[72px] z-50 flex items-center px-4 md:px-6 gap-3 print:hidden"
        style={{
          background: banda ? 'var(--c-primary)' : 'var(--c-nav)',
          borderBottom: banda ? 'none' : '1px solid var(--c-border)',
          borderTop: '3px solid var(--c-accent)',
          color: fg,
        }}
      >
        {/* Botón menú móvil */}
        <button
          onClick={() => setMobileMenuOpen(o => !o)}
          className={`md:hidden p-2 rounded-lg transition-colors ${hoverBg}`}
          style={{ color: fg }}
          aria-label="Abrir menú lateral"
        >
          <Icon name="more" size={20} />
        </button>

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
          <span className="hidden sm:flex items-center gap-4">
            <span className="w-px h-8" style={{ background: banda ? 'rgba(255,255,255,0.3)' : 'var(--c-border-2)' }} />
            <span style={{ color: fgSuave }}><ApexLogo plan={planNombre(plan)} size="sm" /></span>
          </span>
        </button>

        <div className="flex-1" />

        {/* Contador diario de IA en Plan Lite + acceso a versión Pro */}
        {isLite && role === 'doctor' && dailyAi && (
          <div className="hidden lg:flex items-center gap-2">
            <span
              className="text-[12px] font-medium px-3 py-1.5 rounded-lg"
              style={{
                background: banda ? 'rgba(255,255,255,0.14)' : 'var(--c-subtle)',
                color: fg,
                border: banda ? '1px solid rgba(255,255,255,0.22)' : '1px solid var(--c-border)',
              }}
              title="Preguntas y resúmenes con IA disponibles hoy en tu plan Lite"
            >
              ✦ IA Lite: {Math.max(0, dailyAi.limit - dailyAi.used)}/{dailyAi.limit} hoy
            </span>
            <button
              onClick={() => router.push('/dashboard/pro')}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
              style={{
                background: banda ? '#ffffff' : 'var(--c-primary)',
                color: banda ? 'var(--c-primary)' : 'var(--c-primary-fg)',
              }}
            >
              ✦ Conocer versión Pro
            </button>
          </div>
        )}

        {/* Aviso de créditos de IA: solo si el consultorio tiene bolsa de créditos baja */}
        {!isLite && hasAI && credits && (credits.low || credits.empty) && (role === 'doctor' || role === 'admin') && (
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

      {/* ── Menú lateral izquierdo (todos los módulos activos para el cliente) ── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden print:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        aria-label="Menú principal del consultorio"
        className={`fixed top-[72px] bottom-0 left-0 w-[232px] z-40 flex flex-col justify-between py-4 px-3 overflow-y-auto transition-transform duration-200 print:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{
          background: 'var(--c-card)',
          borderRight: '1px solid var(--c-border)',
        }}
      >
        <div className="space-y-3">
          {/* Bloque 1: Clínica y Pacientes */}
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-mono font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>
              Clínica
            </p>
            {clinicalLinks.map((linkItem) => {
              const { href, icon, label } = linkItem;
              const active = isActive(href);
              return (
                <button
                  key={href + label}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    router.push(href);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium text-left transition-all"
                  style={{
                    background: active ? 'color-mix(in srgb, var(--c-primary) 12%, transparent)' : 'transparent',
                    color: active ? 'var(--c-primary)' : 'var(--c-text-2)',
                    fontWeight: active ? 600 : 500,
                    borderLeft: active ? '3px solid var(--c-primary)' : '3px solid transparent',
                  }}
                >
                  <Icon name={icon} size={18} />
                  <span className="flex-1 truncate">{label}</span>
                  {href === '/dashboard/sala' && waitCount > 0 && <Badge n={waitCount} />}
                </button>
              );
            })}
          </div>

          {/* Bloque 2: Gestión y Consultorio */}
          {adminLinks.length > 0 && (
            <div className="pt-1">
              <hr className="border-[var(--c-border)] opacity-60 mb-2" />
              <p className="px-3 pb-1 text-[10px] font-mono font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>
                Gestión
              </p>
              <div className="space-y-0.5">
                {adminLinks.map((linkItem) => {
                  const { href, icon, label } = linkItem;
                  const active = isActive(href);
                  return (
                    <button
                      key={href + label}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        router.push(href);
                      }}
                      aria-current={active ? 'page' : undefined}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium text-left transition-all"
                      style={{
                        background: active ? 'color-mix(in srgb, var(--c-primary) 12%, transparent)' : 'transparent',
                        color: active ? 'var(--c-primary)' : 'var(--c-text-2)',
                        fontWeight: active ? 600 : 500,
                        borderLeft: active ? '3px solid var(--c-primary)' : '3px solid transparent',
                      }}
                    >
                      <Icon name={icon} size={18} />
                      <span className="flex-1 truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bloque 3: Registros Rápidos (Sutiles y Separados) */}
          {(role === 'receptionist' || role === 'doctor' || role === 'admin') && (
            <div className="pt-1">
              <hr className="border-[var(--c-border)] opacity-60 mb-2" />
              <p className="px-3 pb-1 text-[10px] font-mono font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>
                Registros
              </p>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    router.push('/dashboard/clinic?tab=ingresos&action=nuevo');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors text-[var(--c-text-2)] hover:text-[var(--c-primary)] hover:bg-[var(--c-subtle)] group"
                >
                  <span className="w-5 h-5 rounded-md flex items-center justify-center bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-[var(--c-primary)] font-bold text-xs group-hover:bg-[var(--c-primary)] group-hover:text-[var(--c-primary-fg)] transition-colors">
                    +
                  </span>
                  <span className="truncate">Registrar Ingreso</span>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    router.push('/dashboard/clinic?tab=gastos&action=nuevo');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors text-[var(--c-text-2)] hover:text-[#f43f5e] hover:bg-[var(--c-subtle)] group"
                >
                  <span className="w-5 h-5 rounded-md flex items-center justify-center bg-[color-mix(in_srgb,#f43f5e_15%,transparent)] text-[#f43f5e] font-bold text-xs group-hover:bg-[#f43f5e] group-hover:text-white transition-colors">
                    +
                  </span>
                  <span className="truncate">Registrar Gasto</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pie del menú lateral: soporte abajo de todo + ventajas Pro */}
        <div className="pt-3 mt-auto space-y-2 border-t border-[var(--c-border)]">
          {isLite && role === 'doctor' && (
            <button
              onClick={() => { setMobileMenuOpen(false); router.push('/dashboard/pro'); }}
              className="w-full text-left p-2.5 rounded-xl transition-all hover:opacity-95 mb-1"
              style={{
                background: 'color-mix(in srgb, var(--c-primary) 8%, var(--c-card))',
                border: '1px solid color-mix(in srgb, var(--c-primary) 30%, var(--c-border))',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--c-primary)' }}>
                  ✦ Apex Pro
                </span>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--c-primary)' }}>Ver →</span>
              </div>
              <p className="text-[11px] mt-0.5 leading-tight" style={{ color: 'var(--c-text-2)' }}>
                Medicina Funcional & Longevidad
              </p>
            </button>
          )}

          {/* Chat del equipo — estilo WhatsApp sutil y destello suave */}
          {['admin', 'doctor', 'nurse', 'receptionist'].includes(role) && (
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                window.dispatchEvent(new CustomEvent('apex:toggle-chat'));
              }}
              title="Chat del equipo"
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-left transition-all ${
                chatOpen
                  ? 'bg-[rgba(37,211,102,0.12)] text-[#25D366]'
                  : 'text-[var(--c-text-2)] hover:text-[#25D366] hover:bg-[rgba(37,211,102,0.08)]'
              }`}
            >
              <div className="relative flex items-center justify-center text-[#25D366]">
                <Icon name="message" size={17} />
                {/* Destello muy sutil */}
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span
                    className="absolute inline-flex h-full w-full rounded-full opacity-25"
                    style={{
                      background: '#25D366',
                      animation: 'apexPulseSubtle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }}
                  />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: '#25D366', opacity: 0.85 }} />
                </span>
              </div>
              <span className="flex-1 truncate">Chat</span>
              {chatUnread > 0 && (
                <span
                  className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                  style={{ background: '#25D366' }}
                >
                  {chatUnread}
                </span>
              )}
            </button>
          )}

          {/* Soporte hasta abajo pegado al fondo (fuera del menú principal) */}
          <button
            onClick={() => { setMobileMenuOpen(false); router.push('/dashboard/soporte'); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-left transition-colors text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-subtle)]"
          >
            <Icon name="message" size={17} />
            <span className="flex-1">Soporte</span>
          </button>
          <style>{`@keyframes apexPulseSubtle{0%,100%{transform:scale(1);opacity:.2}50%{transform:scale(1.7);opacity:0}}`}</style>
        </div>
      </aside>
    </>
  );
}
