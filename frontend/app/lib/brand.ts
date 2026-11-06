// Marca por consultorio: el color principal y el de acento de cada clínica personalizan la
// interfaz del tema claro (Apex Lite). Los valores vienen de /staff/whoami → clinic_brand.
// Se guardan en localStorage como CSS ya armado para aplicarse antes de pintar (ver layout.tsx).

export interface ClinicBrand {
  name?: string | null;
  logo_url?: string | null;
  brand?: { colors?: Record<string, string>; tagline?: string; logo_white_url?: string | null } | null;
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

/** Aclara un color conservando su tono, para que se lea sobre fondos oscuros (un azul marino
 *  sobre negro no se ve). Mismo tono, luminosidad fija y saturación acotada. */
export function lighten(hex: string, luz = 0.68): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const l0 = (max + min) / 2;
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  const s = Math.min(s0, 0.85), l = luz;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

/** CSS con los colores de la clínica: tema claro tal cual; tema oscuro de Lite con el color
 *  aclarado. Solo acepta #rrggbb (nada de CSS libre). */
export function brandCss(b: ClinicBrand | null | undefined): string {
  const colors = b?.brand?.colors || {};
  const primary = HEX.test(colors.primary || '') ? colors.primary : null;
  const accent = HEX.test(colors.accent || '') ? colors.accent : null;
  if (!primary && !accent) return '';
  const claro: string[] = [];
  const oscuro: string[] = [];
  if (primary) {
    claro.push(`--c-primary:${primary}`, `--c-primary-fg:${contrastFg(primary)}`);
    oscuro.push(`--c-primary:${lighten(primary)}`, '--c-primary-fg:#0b1220');
  }
  if (accent) { claro.push(`--c-accent:${accent}`); oscuro.push(`--c-accent:${lighten(accent)}`); }
  return `[data-theme="light"]{${claro.join(';')}}[data-plan="lite"][data-theme="dark"]{${oscuro.join(';')}}`;
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
  try { localStorage.setItem(KEY, JSON.stringify({ css, brand: b ? { name: b.name, logo_url: b.logo_url, brand: { logo_white_url: b.brand?.logo_white_url ?? null, colors: b.brand?.colors } } : null })); } catch { /* sin storage */ }
}

export function clearBrandCache() {
  try { localStorage.removeItem(KEY); } catch { /* sin storage */ }
  if (typeof document !== 'undefined') document.getElementById('apex-brand')?.remove();
}
