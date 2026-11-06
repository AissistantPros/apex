// Genera app/lib/emojis-es.json (emojis con nombre y palabras clave en español) desde emojibase-data.
// Solo emojis de Unicode ≤ 15.0 (los que ya muestran los iPhone con iOS 16.4+ y los sistemas actuales),
// sin tonos de piel ni componentes. Se corre a mano: node scripts/build-emojis.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const datos = require('emojibase-data/es/compact.json');
const grupos = require('emojibase-data/es/messages.json').groups;
const versiones = require('emojibase-data/versions/emoji.json');

const nuevos = new Set();
for (const [v, lista] of Object.entries(versiones)) if (parseFloat(v) > 15) lista.forEach(h => nuevos.add(h));

const nombresGrupo = {
  'smileys-emotion': 'Caritas', 'people-body': 'Personas', 'animals-nature': 'Animales',
  'food-drink': 'Comida', 'travel-places': 'Viajes', activities: 'Actividades',
  objects: 'Objetos', symbols: 'Símbolos', flags: 'Banderas',
};
const salida = [];
for (const g of grupos) {
  if (!nombresGrupo[g.key]) continue; // "component"
  const items = datos
    .filter(e => e.group === g.order && !nuevos.has(e.hexcode))
    .sort((a, b) => a.order - b.order)
    .map(e => [e.unicode, e.label, (e.tags || []).join(' ')]);
  salida.push({ id: g.key, nombre: nombresGrupo[g.key], emojis: items });
}
writeFileSync(new URL('../app/lib/emojis-es.json', import.meta.url), JSON.stringify(salida));
console.log(salida.map(g => `${g.nombre}: ${g.emojis.length}`).join(' | '));
