'use client';

// Servicios contratados por el consultorio (plan). Se pide una vez por sesión y se comparte.
import { useEffect, useState } from 'react';
import { getSession } from '@/app/lib/auth';
import { usaConsultaLite } from '@/app/lib/consultaLite';

let cache: Record<string, boolean> | null = null;

export function clearEntitlementsCache() { cache = null; }

export function useEntitlements() {
  const [features, setFeatures] = useState<Record<string, boolean> | null>(cache);
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
        cache = (await r.json()).features || {};
        if (vivo) setFeatures(cache);
      } catch { /* sin datos del plan: se usa el flujo normal */ }
    })();
    return () => { vivo = false; };
  }, []);
  return { features, lite: usaConsultaLite(features) };
}
