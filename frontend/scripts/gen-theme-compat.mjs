// Genera app/theme-compat.css: redirige las clases Tailwind con color fijo (p. ej. bg-[#111820],
// text-[#00e5a0]/10) a los tokens del tema claro, sin editar miles de líneas.
// Uso (desde frontend/):  node scripts/gen-theme-compat.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../app', import.meta.url));
const OUT = join(ROOT, 'theme-compat.css');

// ── Tabla hex → rol ───────────────────────────────────────────────────────────
const NEUTRO = {
  bg: {
    '--c-bg': ['#070a0e', '#080b10', '#040c18', '#080f1c', '#070e1a', '#0c1118', '#0d1117', '#1a1a1a'],
    '--c-card': ['#0d1520', '#0a1622', '#101c28', '#0a1018'],
    '--c-subtle': ['#111820', '#161f28', '#182030', '#1a2535'],
    '--c-subtle-2': ['#1e2d3d', '#2a3a4d', '#2d4158', '#2a3f54'],
  },
  text: {
    '--c-text': ['#dde6ef', '#c8d6e5', '#c3d1de'],
    '--c-text-2': ['#7a95aa', '#8fa8bd', '#9fb2c4'],
    '--c-text-3': ['#3d5870', '#5a7fa0'],
  },
  border: {
    '--c-border': ['#1e2d3d', '#2a3a4d', '#2d4158', '#1a2535', '#182030', '#161f28'],
    '--c-border-2': ['#2a3f54', '#3a5570'],
  },
};
const ACENTO = {
  '--c-primary': ['#00e5a0', '#00ffb0', '#0ea5e9', '#0891b2', '#7dd3fc', '#6366f1', '#a78bfa', '#c4b5fd', '#f472b6', '#ec4899'],
  '--c-warn': ['#f97316', '#f59e0b'],
  '--c-danger': ['#f43f5e'],
};
const FG = { '--c-primary': 'var(--c-primary-fg)', '--c-warn': '#ffffff', '--c-danger': '#ffffff' };

const lookup = (util, hex) => {
  const h = hex.toLowerCase();
  for (const [v, list] of Object.entries(ACENTO)) if (list.includes(h)) return { v, accent: true };
  const group = util === 'divide' || util === 'ring' ? 'border' : util === 'placeholder' || util === 'accent' ? 'text' : util;
  const table = NEUTRO[group];
  if (!table) return null;
  for (const [v, list] of Object.entries(table)) if (list.includes(h)) return { v, accent: false };
  return null;
};

const esc = (s) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
const val = (v, alpha) => alpha ? `color-mix(in srgb, var(${v}) ${alpha}%, transparent)` : `var(${v})`;

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(n)) out.push(p);
  }
  return out;
}

const tok = /(?<![\w\[\]\-:/#.])((?:[a-z0-9-]+:)*)([a-z-]+)-\[(#[0-9a-fA-F]{3,8})\](\/\d+)?/g;
const seen = new Map();
for (const f of walk(ROOT)) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(tok)) {
    const [full, variant, util, hex, a] = m;
    if (!['bg', 'text', 'border', 'placeholder', 'accent', 'from', 'to', 'divide'].includes(util)) continue;
    if (hex.length !== 7) continue;                       // #rgba/#rgb con alfa embebido: se deja
    if (!['', 'hover:', 'focus:', 'group-hover:'].includes(variant)) continue;
    seen.set(full, { variant, util, hex, alpha: a ? Number(a.slice(1)) : 0 });
  }
}

const SCOPE = ':is([data-theme="light"], [data-plan="lite"])';
const rules = [];
for (const [cls, { variant, util, hex, alpha }] of [...seen].sort()) {
  const r = lookup(util, hex);
  if (!r) continue;
  const c = `.${esc(cls)}`;
  const sel = variant === 'hover:' ? `${c}:hover` : variant === 'focus:' ? `${c}:focus`
    : variant === 'group-hover:' ? `.group:hover ${c}` : c;
  const v = val(r.v, alpha);
  let decl;
  switch (util) {
    case 'bg': decl = `background-color:${v} !important;` + (r.accent && !alpha ? `color:${FG[r.v]} !important;` : ''); break;
    case 'text': decl = `color:${v} !important;`; break;
    case 'border': decl = `border-color:${v} !important;`; break;
    case 'accent': decl = `accent-color:${v} !important;`; break;
    case 'from': decl = `--tw-gradient-from:${v} var(--tw-gradient-from-position) !important;--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to) !important;`; break;
    case 'to': decl = `--tw-gradient-to:${v} var(--tw-gradient-to-position) !important;`; break;
    case 'divide': rules.push(`${SCOPE} ${c} > * + *{border-color:${v} !important;}`); continue;
    case 'placeholder': rules.push(`${SCOPE} ${c}::placeholder{color:${v} !important;}`); continue;
  }
  rules.push(`${SCOPE} ${sel}{${decl}}`);
}

const header = `/* GENERADO por scripts/gen-theme-compat.mjs — no editar a mano.
   Redirige las clases con color fijo a los tokens del tema claro y de Apex Lite (claro y oscuro). */\n`;
writeFileSync(OUT, header + rules.join('\n') + '\n');
console.log(`${seen.size} clases encontradas → ${rules.length} reglas en app/theme-compat.css`);
