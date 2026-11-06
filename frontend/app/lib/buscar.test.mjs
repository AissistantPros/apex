// Ejecutar (desde frontend/):  node --test app/lib/buscar.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, filtrar, buscarExacta, sinRepetidos } from './buscar.ts';

const op = (label, extra = {}) => ({ id: label, label, ...extra });
const lugares = [
  op('Consultorio propio'),
  op('Hospital Amerimed Cancún'),
  op('Hospital Joya Cancún'),
  op('Clínica San José'),
  op('Hospital Playamed'),
];

test('normalizar: sin acentos, minúsculas y espacios colapsados', () => {
  assert.equal(normalizar('  Clínica   SAN  José '), 'clinica san jose');
  assert.equal(normalizar('Ñandú'), 'nandu');
  assert.equal(normalizar(null), '');
  assert.equal(normalizar(undefined), '');
});

test('con menos de 2 letras muestra la lista completa (hasta el máximo)', () => {
  assert.equal(filtrar(lugares, '').length, 5);
  assert.equal(filtrar(lugares, 'h').length, 5);
  assert.equal(filtrar(lugares, '', 3).length, 3);
});

test('desde la segunda letra filtra, sin importar mayúsculas ni acentos', () => {
  assert.deepEqual(filtrar(lugares, 'cl').map(o => o.label), ['Clínica San José']);
  assert.deepEqual(filtrar(lugares, 'CLINICA').map(o => o.label), ['Clínica San José']);
  assert.deepEqual(filtrar(lugares, 'cancun').map(o => o.label), ['Hospital Amerimed Cancún', 'Hospital Joya Cancún']);
  assert.deepEqual(filtrar(lugares, 'san jose').map(o => o.label), ['Clínica San José']);
});

test('varias palabras: todas deben aparecer, en cualquier orden', () => {
  assert.deepEqual(filtrar(lugares, 'cancun joya').map(o => o.label), ['Hospital Joya Cancún']);
  assert.deepEqual(filtrar(lugares, 'hospital zzz'), []);
});

test('orden: empieza con lo escrito, luego una palabra que empieza así, luego el resto', () => {
  const l = [op('Farmacia Hospital'), op('Pre-hospitalario'), op('Hospital Playamed'), op('Clínica del hospital')];
  assert.deepEqual(
    filtrar(l, 'hos').map(o => o.label),
    ['Hospital Playamed', 'Clínica del hospital', 'Farmacia Hospital', 'Pre-hospitalario'],
  );
});

test('sin filtro y con varios grupos, se ven todos los grupos', () => {
  const l = [
    ...Array.from({ length: 10 }, (_, i) => op(`Paciente ${i}`, { group: 'Pacientes' })),
    op('GNP', { group: 'Clientes' }), op('AXA', { group: 'Clientes' }),
  ];
  const r = filtrar(l, '', 8).map(o => o.label);
  assert.ok(r.includes('GNP') && r.includes('AXA'));
  assert.equal(r.length, 8);
});

test('buscarExacta ignora mayúsculas y acentos', () => {
  assert.equal(buscarExacta(lugares, 'hospital joya cancun')?.label, 'Hospital Joya Cancún');
  assert.equal(buscarExacta(lugares, 'hospital joya'), undefined);
  assert.equal(buscarExacta(lugares, '  '), undefined);
});

test('sinRepetidos conserva la primera aparición', () => {
  const r = sinRepetidos([op('Clínica Sur'), op('clinica sur'), op('Clínica Norte'), op('')]);
  assert.deepEqual(r.map(o => o.label), ['Clínica Sur', 'Clínica Norte']);
});
