'use client';

// Servicios contratados por el consultorio (plan) y composición del equipo.
import { useEffect, useState } from 'react';
import { getSession } from '@/app/lib/auth';
import { usaConsultaLite } from '@/app/lib/consultaLite';

export interface ClinicTeamInfo {
  has_receptionist: boolean;
  has_nurse: boolean;
  has_accounting: boolean;
  has_marketing: boolean;
  is_solo_doctor: boolean;
  roles: string[];
  members_count: number;
}

export interface DailyAiInfo {
  used: number;
  limit: number;
  remaining: number;
}

interface EntitlementsCache {
  features: Record<string, boolean>;
  plan: string | null;
  team: ClinicTeamInfo;
  dailyAi: DailyAiInfo;
}

const DEFAULT_TEAM: ClinicTeamInfo = {
  has_receptionist: false,
  has_nurse: false,
  has_accounting: false,
  has_marketing: false,
  is_solo_doctor: true,
  roles: ['doctor'],
  members_count: 1,
};

const DEFAULT_DAILY_AI: DailyAiInfo = {
  used: 0,
  limit: 50,
  remaining: 50,
};

let cache: EntitlementsCache | null = null;

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
        cache = {
          features: j.features || {},
          plan: j.plan || null,
          team: j.team || DEFAULT_TEAM,
          dailyAi: {
            used: j.ai_daily_used ?? 0,
            limit: j.ai_daily_limit ?? 50,
            remaining: j.ai_daily_remaining ?? 50,
          },
        };
        if (vivo) setDatos(cache);
      } catch { /* sin datos del plan: se usa el flujo normal */ }
    })();
    return () => { vivo = false; };
  }, []);
  const features = datos?.features ?? null;
  const team = datos?.team ?? DEFAULT_TEAM;
  const dailyAi = datos?.dailyAi ?? DEFAULT_DAILY_AI;
  return { features, plan: datos?.plan ?? null, lite: usaConsultaLite(features), team, dailyAi };
}
