/**
 * Gestión del rol activo del usuario.
 * El rol real viene del backend (/staff/whoami) y se cachea en localStorage para el nav.
 */

export type UserRole = 'doctor' | 'nurse' | 'receptionist' | 'accounting' | 'marketing';

export const AREAS = ['pacientes', 'cobros', 'finanzas', 'marketing', 'biblioteca', 'equipo'] as const;
export type Area = typeof AREAS[number];
export type PermLevel = 'none' | 'view' | 'edit';

export function getRole(): UserRole {
  if (typeof window === 'undefined') return 'doctor';
  return (localStorage.getItem('apex_role') as UserRole) || 'doctor';
}

export function setRole(role: UserRole) {
  if (typeof window !== 'undefined') localStorage.setItem('apex_role', role);
}

export function getPerms(): Partial<Record<Area, PermLevel>> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('apex_perms') || '{}'); } catch { return {}; }
}

export function setPerms(perms: Partial<Record<Area, PermLevel>>) {
  if (typeof window !== 'undefined') localStorage.setItem('apex_perms', JSON.stringify(perms || {}));
}

export const ROLE_LABELS: Record<UserRole, string> = {
  doctor:       'Médico',
  nurse:        'Enfermería',
  receptionist: 'Recepción',
  accounting:   'Contabilidad',
  marketing:    'Agencia de Marketing',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  doctor:       '#a78bfa',
  nurse:        '#f97316',
  receptionist: '#0ea5e9',
  accounting:   '#00e5a0',
  marketing:    '#f472b6',
};

export const AREA_LABELS: Record<Area, string> = {
  pacientes:  'Pacientes y diagnósticos',
  cobros:     'Cobros',
  finanzas:   'Finanzas y gastos',
  marketing:  'Marketing y ROI',
  biblioteca: 'Biblioteca clínica',
  equipo:     'Equipo (staff)',
};
