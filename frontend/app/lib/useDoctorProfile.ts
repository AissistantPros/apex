import { useEffect, useState } from 'react';
import { getUser, getSession } from '@/app/lib/auth';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Fuente única de nombre/foto del doctor para el TopNav — evita que cada
// pantalla resuelva esto a su manera y termine mostrando datos distintos.
export function useDoctorProfile() {
  const [displayName, setDisplayName] = useState('Doctor');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [u, session] = await Promise.all([getUser(), getSession()]);
        const token = session?.access_token;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${BACKEND()}/doctor/profile`, { headers });
        const profile = res.ok ? await res.json() : null;
        if (!active) return;
        setDisplayName(
          profile?.display_name
          || u?.user_metadata?.full_name
          || u?.email?.split('@')[0]
          || 'Doctor'
        );
        setPhotoUrl(profile?.photo_url || profile?.clinic_logo_url || null);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { active = false; };
  }, []);

  return { displayName, photoUrl };
}
