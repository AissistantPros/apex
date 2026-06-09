/**
 * Gestión del rol activo del usuario.
 * Temporal hasta implementar auth real con JWT.
 * El rol se guarda en localStorage y se sincroniza con el perfil del doctor.
 */

export type UserRole = 'doctor' | 'nurse' | 'receptionist';

export function getRole(): UserRole {
  if (typeof window === 'undefined') return 'doctor';
  return (localStorage.getItem('apex_role') as UserRole) || 'doctor';
}

export function setRole(role: UserRole) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('apex_role', role);
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  doctor:       'Médico',
  nurse:        'Enfermería',
  receptionist: 'Recepción',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  doctor:       '#a78bfa',
  nurse:        '#f97316',
  receptionist: '#0ea5e9',
};
