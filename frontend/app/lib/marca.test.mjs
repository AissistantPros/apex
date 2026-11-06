// Ejecutar (desde frontend/):  node --test app/lib/marca.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { brandCss, contrastFg, lighten } from './brand.ts';
import { kb, dataUrlABlob } from './imgutil.ts';
import { PRODUCTO, planNombre, textoVersion } from './producto.ts';

const luz = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const tono = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const contraste = (a, b) => { const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('texto sobre el color de marca: blanco en oscuros, casi negro en claros', () => {
  assert.equal(contrastFg('#042C64'), '#ffffff');
  assert.equal(contrastFg('#EAF1F9'), '#111827');
  assert.equal(contrastFg('#E4040C'), '#ffffff');
});

test('aclarar para fondo oscuro: mismo tono, mucho más claro y legible', () => {
  for (const c of ['#042C64', '#E4040C', '#1D3557']) {
    const l = lighten(c);
    assert.match(l, /^#[0-9a-f]{6}$/);
    assert.ok(luz(l) > luz(c), `${c} → ${l}`);
    if (luz(c) < 0.05) assert.ok(luz(l) > luz(c) * 3, `un color oscuro debe aclararse mucho: ${c} → ${l}`);
    assert.ok(Math.abs(tono(l) - tono(c)) < 6, `tono ${c} → ${l}`);
    assert.ok(contraste(l, '#0f141c') >= 4.5, `contraste de ${l} sobre el fondo oscuro`);
  }
  assert.equal(lighten('#808080').length, 7);     // grises no se rompen
});

test('CSS de marca: claro con su color, oscuro con el aclarado; ignora lo inválido', () => {
  const css = brandCss({ brand: { colors: { primary: '#042C64', accent: '#E4040C' } } });
  assert.match(css, /\[data-theme="light"\]\{--c-primary:#042C64;--c-primary-fg:#ffffff;--c-accent:#E4040C\}/);
  assert.match(css, /\[data-plan="lite"\]\[data-theme="dark"\]\{--c-primary:#[0-9a-f]{6};--c-primary-fg:#0b1220;--c-accent:#[0-9a-f]{6}\}/);
  assert.equal(brandCss(null), '');
  assert.equal(brandCss({ brand: { colors: { primary: 'red; background:url(x)', accent: 'javascript:1' } } }), '');
  const soloAcento = brandCss({ brand: { colors: { accent: '#E4040C' } } });
  assert.ok(!soloAcento.includes('--c-primary:'));
});

test('tamaños legibles y conversión de data URL a archivo', async () => {
  assert.equal(kb(512), '512 B');
  assert.equal(kb(18 * 1024), '18 KB');
  const b = dataUrlABlob('data:image/jpeg;base64,/9j/4AAQ');
  assert.equal(b.type, 'image/jpeg');
  assert.equal(b.size, 6);
});

test('datos del producto para el pie de página', () => {
  assert.equal(PRODUCTO.nombre, 'Apex');
  assert.ok(PRODUCTO.desarrollador.length > 0);
  assert.match(textoVersion(), /^v\d+\.\d+\.\d+/);
  assert.equal(planNombre('apex_lite'), 'Lite');
  assert.equal(planNombre('apex_full'), 'Pro');
  assert.equal(planNombre(null), 'Pro');
});
