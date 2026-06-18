import { useCallback, useEffect, useState } from 'react';
import { getUser, getSession } from '@/app/lib/auth';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const PROFILE_UPDATED_EVENT = 'apex:doctor-profile-updated';

// Llamar después de guardar cambios en /dashboard/profile para que el
// TopNav (montado una sola vez en el layout) se refresque sin recargar.
export function notifyDoctorProfileUpdated() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

// Fuente única de nombre/foto del doctor para el TopNav — evita que cada
// pantalla resuelva esto a su manera y termine mostrando datos distintos.
export function useDoctorProfile() {
  const [displayName, setDisplayName] = useState('Doctor');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [profile, setProfileState] = useState<any>(null);

  const load = useCallback(async (active: () => boolean) => {
    // Fallback inmediato con los datos de auth — así nunca se queda
    // pegado en "Doctor" mientras el backend (Render free tier) despierta.
    let u: Awaited<ReturnType<typeof getUser>> = null;
    try {
      u = await getUser();
      if (active() && u) {
        setDisplayName(u.user_metadata?.full_name || u.email?.split('@')[0] || 'Doctor');
      }
    } catch (e) {
      console.error(e);
    }

    // Perfil real (nombre/foto configurados en /dashboard/profile) — sobreescribe
    // el fallback en cuanto responde, sin importar cuánto tarde.
    try {
      const session = await getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${BACKEND()}/doctor/profile`, { headers });
      if (!res.ok || !active()) return;
      const profileData = await res.json();
      if (!active()) return;
      setProfileState(profileData);
      if (profileData?.display_name) setDisplayName(profileData.display_name);
      setPhotoUrl(profileData?.photo_url || profileData?.clinic_logo_url || null);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const isActive = () => mounted;
    load(isActive);

    const onUpdated = () => load(isActive);
    window.addEventListener(PROFILE_UPDATED_EVENT, onUpdated);

    return () => {
      mounted = false;
      window.removeEventListener(PROFILE_UPDATED_EVENT, onUpdated);
    };
  }, [load]);

  return { displayName, photoUrl, profile };
}
