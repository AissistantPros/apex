// Ejecutar (desde frontend/):  node --test app/lib/consultaLite.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcIMC, interpIMC, avisosSignos, buildVisitPayload, buildPatientPatch, faltantes,
  defaultKind, usaConsultaLite, emptyForm, sintomaTexto, familiarDetalle,
} from './consultaLite.ts';

const base = () => {
  const f = emptyForm();
  f.motivo = 'Dolor en el pecho al caminar';
  f.pa_der_sis = '128'; f.pa_der_dia = '82'; f.fc = '74'; f.peso = '70'; f.talla = '175';
  return f;
};

test('IMC: kg y cm, talla en metros, y datos faltantes', () => {
  assert.equal(calcIMC('70', '175'), 22.9);
  assert.equal(calcIMC('70', '1.75'), 22.9);
  assert.equal(calcIMC('70,5', '175'), 23);
  assert.equal(calcIMC('', '175'), null);
  assert.equal(calcIMC('70', ''), null);
  assert.equal(interpIMC(22.9), 'Normal');
  assert.equal(interpIMC(27), 'Sobrepeso');
  assert.equal(interpIMC(31), 'Obesidad');
  assert.equal(interpIMC(17), 'Bajo peso');
  assert.equal(interpIMC(null), '');
});

test('avisos de signos vitales: normales no avisan, absurdos sí, sin bloquear', () => {
  assert.deepEqual(avisosSignos(base()), []);
  const f = base(); f.fc = '400'; f.spo2 = '101';
  const a = avisosSignos(f);
  assert.equal(a.length, 2);
  assert.match(a.join(' '), /Frecuencia cardiaca/);
  const g = base(); g.pa_der_sis = '80'; g.pa_der_dia = '90';
  assert.match(avisosSignos(g)[0], /sistólica debe ser mayor/);
  const vacio = emptyForm();
  assert.deepEqual(avisosSignos(vacio), []);
});

test('payload de primera vez: columnas existentes, síntomas, IMC y heredofamiliares', () => {
  const f = base();
  f.sintomas.disnea = { si: true, nota: 'al subir escaleras', clase: 'II' };
  f.sintomas.palpitaciones = { si: true, nota: '', clase: '' };
  f.ecg_hecho = 'si'; f.ecg_resultado = 'Ritmo sinusal';
  f.diagnostico = 'HTA'; f.plan = 'Control en 1 mes'; f.proxima_cita = '2026-12-10';
  f.cardiopatia_precoz = true; f.fr = '16';
  const p = buildVisitPayload(f, 'first_visit');
  assert.equal(p.visit_type, 'first_visit');
  assert.equal(p.motivo, 'Dolor en el pecho al caminar');
  assert.equal(p.pa_der_sistolica, 128);
  assert.equal(p.pa_izq_sistolica, null);
  assert.equal(p.heart_rate, 74);
  assert.equal(p.weight, 70);
  assert.equal(p.height, 175);
  assert.equal(p.imc, 22.9);
  assert.equal(p.ecg_done, true);
  assert.equal(p.dx_presuntivo, 'HTA');
  assert.equal(p.symptoms.length, 2);
  assert.equal(p.symptoms[0].descripcion, 'Falta de aire — clase funcional II; al subir escaleras');
  assert.equal(p.symptoms[1].descripcion, 'Palpitaciones');
  assert.equal(p.medication_adherence, '');
  const lite = p.dynamic_answers.lite;
  assert.equal(lite.kind, 'first_visit');
  assert.equal(lite.signos.fr, 16);
  assert.equal(lite.cierre.proxima_cita, '2026-12-10');
  assert.equal(lite.heredofamiliar.cardiopatia_precoz, true);
  assert.equal(lite.seguimiento, undefined);
});

test('payload de seguimiento: tipo de control, apego y sin heredofamiliares', () => {
  const f = base();
  f.tipo_control = 'resultados'; f.apego = 'parcial'; f.cambios_medicamentos = 'Subió dosis';
  f.efectos_adversos = 'Tos seca'; f.pa_domicilio = '130/80 en promedio'; f.resultados_estudios = 'Perfil de lípidos';
  const p = buildVisitPayload(f, 'follow_up');
  assert.equal(p.visit_type, 'follow_up');
  assert.equal(p.visit_reason, 'Entrega de resultados: Dolor en el pecho al caminar');
  assert.equal(p.symptom_since, '');
  assert.equal(p.medication_adherence, 'Parcialmente');
  assert.equal(p.medication_changes, 'Subió dosis');
  assert.equal(p.labs_notes, 'Perfil de lípidos');
  const lite = p.dynamic_answers.lite;
  assert.equal(lite.seguimiento.tipo, 'resultados');
  assert.equal(lite.seguimiento.pa_domicilio, '130/80 en promedio');
  assert.equal(lite.heredofamiliar, undefined);
});

test('parche del paciente: solo lo capturado, con los formatos que ya usa el registro', () => {
  const f = emptyForm();
  assert.deepEqual(buildPatientPatch(f), {});
  f.familiares = [
    { parentesco: 'Padre', enfermedad: 'Infarto o enfermedad coronaria', edad: '52', nota: 'falleció' },
    { parentesco: 'Madre', enfermedad: '', edad: '', nota: '' },
  ];
  f.condiciones = ['Hipertensión', 'Diabetes'];
  f.tabaco = 'Fumador activo'; f.cigarros_dia = '10'; f.anios_tabaco = '15';
  f.alcohol = 'Ocasional'; f.alergias = 'Penicilina';
  f.medicamentos = [{ nombre: 'Losartán', dosis: '50 mg' }, { nombre: '', dosis: '' }];
  const p = buildPatientPatch(f);
  assert.deepEqual(p.family_other_history, [
    { parentesco: 'Padre', enfermedad: 'Infarto o enfermedad coronaria', detalle: 'a los 52 años — falleció' },
  ]);
  assert.equal(p.chronic_diseases, 'Hipertensión, Diabetes');
  assert.equal(p.smoking_status, 'Fumador activo');
  assert.equal(p.cigarettes_per_day, '10');
  assert.equal(p.smoking_years, '15');
  assert.equal(p.alcohol_status, 'Ocasional');
  assert.equal(p.allergies_medications, 'Penicilina');
  assert.equal(p.medications.length, 1);
  assert.equal(p.medications[0].nombre, 'Losartán');
  assert.equal(p.surgeries, undefined);
  // Quien nunca fumó no manda cigarros por día aunque haya texto escrito
  const g = emptyForm(); g.tabaco = 'Nunca fumó'; g.cigarros_dia = '5';
  assert.equal(buildPatientPatch(g).cigarros_dia, undefined);
});

test('faltantes: primera vez exige heredofamiliares; seguimiento no', () => {
  const f = base();
  assert.match(faltantes(f, 'first_visit').join(' '), /heredofamiliares/);
  assert.deepEqual(faltantes(f, 'follow_up'), []);
  f.sin_antecedentes_fam = true;
  assert.deepEqual(faltantes(f, 'first_visit'), []);
  const g = emptyForm();
  assert.equal(faltantes(g, 'follow_up').length, 2);   // motivo y signos
});

test('tipo de visita por defecto y detección del consultorio Lite', () => {
  assert.equal(defaultKind(0), 'first_visit');
  assert.equal(defaultKind(3), 'follow_up');
  assert.equal(usaConsultaLite({ ia_consulta: false, pacientes: true }), true);
  assert.equal(usaConsultaLite({ ia_consulta: true }), false);
  assert.equal(usaConsultaLite(null), false);
  assert.equal(usaConsultaLite({}), false);
});

test('textos auxiliares', () => {
  assert.equal(sintomaTexto('mareo', { si: true, nota: '', clase: '' }), 'Mareo');
  assert.equal(familiarDetalle({ parentesco: 'x', enfermedad: 'y', edad: '60', nota: '' }), 'a los 60 años');
  assert.equal(familiarDetalle({ parentesco: 'x', enfermedad: 'y', edad: '', nota: '' }), '');
});
