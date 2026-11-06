// Llamadas al backend de "Mi Consultorio" compartidas por la página y sus ventanas.
import { getSession } from '@/app/lib/auth';

export const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
export const money = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-MX');

export async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}

/** Texto legible del error del backend (FastAPI manda `detail` como texto o como lista de campos). */
function mensajeError(detail: unknown, status: number): string {
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    const msgs = detail
      .map((d: any) => (typeof d?.msg === 'string' ? d.msg : ''))
      .filter(Boolean);
    if (msgs.length) return `Revisa los datos: ${msgs.join('. ')}`;
  }
  return `No se pudo completar la acción (error ${status}).`;
}

export async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(mensajeError(e.detail, res.status));
  }
  return res.json();
}

export interface Catalogos {
  proveedores: any[];
  clientes: any[];
  conceptos_gasto: any[];
  lugares: any[];
}

export const CATALOGOS_VACIOS: Catalogos = { proveedores: [], clientes: [], conceptos_gasto: [], lugares: [] };
