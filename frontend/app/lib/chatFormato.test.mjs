// node --test app/lib/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  codificarSticker, leerSticker, contarSoloEmojis, etiquetaDia, etiquetaLista,
  vistaPrevia, agruparMensajes, indiceColor, horaCorta,
} from './chatFormato.ts';
import { PAQUETES, buscarSticker } from './chatStickers.ts';

const ahora = new Date(2026, 10, 6, 18, 0); // viernes 6 nov 2026, hora local
const iso = (y, m, d, h = 12, mi = 0) => new Date(y, m, d, h, mi).toISOString();

test('sticker: se codifica y se lee solo si es todo el mensaje', () => {
  assert.equal(leerSticker(codificarSticker('equipo-gracias')), 'equipo-gracias');
  assert.equal(leerSticker('hola [[sticker:equipo-gracias]]'), null);
  assert.equal(leerSticker('texto normal'), null);
});

test('catálogo de stickers: ids únicos y todos encontrables', () => {
  const ids = PAQUETES.flatMap(p => p.stickers.map(x => x.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(buscarSticker(id), id);
  assert.ok(ids.every(id => /^[a-z0-9-]+$/.test(id)), 'ids compatibles con leerSticker');
});

test('solo emojis: 1 a 3 emojis se agrandan, texto o más de 3 no', () => {
  assert.equal(contarSoloEmojis('👍'), 1);
  assert.equal(contarSoloEmojis('😂 😂'), 2);
  assert.equal(contarSoloEmojis('👨‍⚕️'), 1);
  assert.equal(contarSoloEmojis('🇲🇽'), 1);
  assert.equal(contarSoloEmojis('🎉🎉🎉🎉'), 0);
  assert.equal(contarSoloEmojis('ok 👍'), 0);
  assert.equal(contarSoloEmojis('123'), 0);
  assert.equal(contarSoloEmojis(''), 0);
});

test('etiquetas de día: hoy, ayer, día de la semana y fecha', () => {
  assert.equal(etiquetaDia(iso(2026, 10, 6, 9), ahora), 'Hoy');
  assert.equal(etiquetaDia(iso(2026, 10, 5, 23), ahora), 'Ayer');
  assert.equal(etiquetaDia(iso(2026, 10, 3, 10), ahora), 'martes');
  assert.equal(etiquetaDia(iso(2026, 9, 20, 10), ahora), '20/10/2026');
});

test('etiqueta de la lista: hora si es hoy, si no el día', () => {
  assert.equal(etiquetaLista(iso(2026, 10, 6, 7, 5), ahora), '07:05');
  assert.equal(etiquetaLista(iso(2026, 10, 5, 7, 5), ahora), 'Ayer');
  assert.equal(horaCorta(iso(2026, 10, 6, 18, 30)), '18:30');
});

test('vista previa: sticker y saltos de línea', () => {
  assert.equal(vistaPrevia('[[sticker:equipo-listo]]'), 'Sticker');
  assert.equal(vistaPrevia('hola\n\nmundo'), 'hola mundo');
});

test('agrupar: separador por día y bloques por persona', () => {
  const msgs = [
    { id: '1', author_id: 'a', content: 'x', created_at: iso(2026, 10, 5, 10, 0) },
    { id: '2', author_id: 'a', content: 'x', created_at: iso(2026, 10, 5, 10, 2) },
    { id: '3', author_id: 'b', content: 'x', created_at: iso(2026, 10, 5, 10, 3) },
    { id: '4', author_id: 'b', content: 'x', created_at: iso(2026, 10, 5, 11, 0) },
    { id: '5', author_id: 'b', content: 'x', created_at: iso(2026, 10, 6, 9, 0) },
  ];
  const r = agruparMensajes(msgs, ahora);
  assert.deepEqual(r.filter(x => x.tipo === 'dia').map(x => x.etiqueta), ['Ayer', 'Hoy']);
  const m = r.filter(x => x.tipo === 'msg');
  assert.deepEqual(m.map(x => x.primero), [true, false, true, true, true]);
  assert.deepEqual(m.map(x => x.ultimo), [false, true, true, true, true]);
});

test('color de autor: estable y dentro de 0-7', () => {
  assert.equal(indiceColor('abc'), indiceColor('abc'));
  for (const id of ['', 'x', 'usuario-123', undefined]) {
    const i = indiceColor(id);
    assert.ok(i >= 0 && i < 8);
  }
});
