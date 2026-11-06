'use client';

// Servicios contratados por el consultorio (plan). Se pide una vez por sesión y se comparte.
import { useEffect, useState } from 'react';
import { getSession } from '@/app/lib/auth';
import { usaConsultaLite } from '@/app/lib/consultaLite';

let cache: { features: Record<string, boolean>; plan: string | null } | null = null;

export function clearEntitlementsCache() { cache = null; }

export function useEntitlements() {
  const [datos, setDatos] = useState(cache);
  useEffect(() => {
    if (cache) return;
    let vivo = true;
    (async () => {
      try {
        const s = await getSession();
        if (!s?.access_token) return;
        const B = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const r = await fetch(`${B}/staff/entitlements`, { headers: { Authorization: `Bearer ${s.access_token}` } });
        if (!r.ok) return;
        const j = await r.json();
        cache = { features: j.features || {}, plan: j.plan || null };
        if (vivo) setDatos(cache);
      } catch { /* sin datos del plan: se usa el flujo normal */ }
    })();
    return () => { vivo = false; };
  }, []);
  const features = datos?.features ?? null;
  return { features, plan: datos?.plan ?? null, lite: usaConsultaLite(features) };
}
