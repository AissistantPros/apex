// Marca por consultorio: el color principal y el de acento de cada clínica personalizan la
// interfaz del tema claro (Apex Lite). Los valores vienen de /staff/whoami → clinic_brand.
// Se guardan en localStorage como CSS ya armado para aplicarse antes de pintar (ver layout.tsx).

export interface ClinicBrand {
  name?: string | null;
  logo_url?: string | null;
  brand?: { colors?: Record<string, string>; tagline?: string } | null;
}

const KEY = 'apex_brand';
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Texto blanco o casi negro según cuál contraste mejor sobre el color (luminancia WCAG). */
export function contrastFg(hex: string): '#ffffff' | '#111827' {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return L > 0.4 ? '#111827' : '#ffffff';
}

/** CSS del tema claro con los colores de la clínica. Solo acepta #rrggbb (nada de CSS libre). */
export function brandCss(b: ClinicBrand | null | undefined): string {
  const colors = b?.brand?.colors || {};
  const primary = HEX.test(colors.primary || '') ? colors.primary : null;
  const accent = HEX.test(colors.accent || '') ? colors.accent : null;
  if (!primary && !accent) return '';
  const decl: string[] = [];
  if (primary) decl.push(`--c-primary:${primary}`, `--c-primary-fg:${contrastFg(primary)}`);
  if (accent) decl.push(`--c-accent:${accent}`);
  return `[data-theme="light"]{${decl.join(';')}}`;
}

export function readCachedBrand(): ClinicBrand | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null')?.brand ?? null; } catch { return null; }
}

/** Aplica la marca ahora y la deja en caché para la próxima carga. */
export function applyBrand(b: ClinicBrand | null | undefined) {
  if (typeof document === 'undefined') return;
  const css = brandCss(b);
  let el = document.getElementById('apex-brand') as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = 'apex-brand'; document.head.appendChild(el); }
  el.textContent = css;
  try { localStorage.setItem(KEY, JSON.stringify({ css, brand: b ? { name: b.name, logo_url: b.logo_url } : null })); } catch { /* sin storage */ }
}

export function clearBrandCache() {
  try { localStorage.removeItem(KEY); } catch { /* sin storage */ }
  if (typeof document !== 'undefined') document.getElementById('apex-brand')?.remove();
}
