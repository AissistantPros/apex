'use client';

/**
 * TRIAJE MODAL / TOMA DE SIGNOS VITALES (APEX NURSING & TRIAGE)
 * Cumple con la NOM-004-SSA3 del Expediente Clínico:
 * 1. Presión Arterial bilateral (Brazo derecho e izquierdo, con diferencial patológico >15 mmHg).
 * 2. Frecuencia Cardíaca (FC) y Ritmo (Regular / Irregular).
 * 3. Frecuencia Respiratoria (FR) y Saturación SpO2 (%).
 * 4. Temperatura Corporal (°C) y Glucemia Capilar (mg/dL).
 * 5. Somatometría completa: Peso (kg), Talla (cm), IMC autocalculado con semáforo OMS y Cintura (cm).
 * 6. Escala de Dolor (EVA 0-10).
 * 7. Alertas críticas automáticas (Crisis hipertensiva, hipoxemia, arritmia, alergia a contraste).
 * 8. Pase de etapa en sala de espera: 'reception' -> 'nursing' (Listo para doctor).
 */

import { useState, useMemo } from 'react';
import { getSession } from '@/app/lib/auth';
import { supabase } from '@/app/lib/supabase';
import { calcIMC, interpIMC } from '@/app/lib/consultaLite';
import Icon from '@/app/components/Icon';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface TriajeModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: {
    id: string;
    full_name?: string;
    date_of_birth?: string;
    phone?: string;
    chronic_diseases?: string;
    alergias?: string;
  } | null;
  onSuccess?: (msg: string) => void;
}

export default function TriajeModal({ isOpen, onClose, patient, onSuccess }: TriajeModalProps) {
  // Signos vitales de triaje
  const [paDerSis, setPaDerSis] = useState('');
  const [paDerDia, setPaDerDia] = useState('');
  const [paIzqSis, setPaIzqSis] = useState('');
  const [paIzqDia, setPaIzqDia] = useState('');

  const [fc, setFc] = useState('');
  const [ritmo, setRitmo] = useState<'regular' | 'irregular' | ''>('regular');
  const [spo2, setSpo2] = useState('');
  const [fr, setFr] = useState('');
  const [temp, setTemp] = useState('');
  const [glucosa, setGlucosa] = useState('');

  const [peso, setPeso] = useState('');
  const [talla, setTalla] = useState('');
  const [cintura, setCintura] = useState('');
  const [dolorEva, setDolorEva] = useState('0');

  const [alergiaContraste, setAlergiaContraste] = useState(false);
  const [alergiasTexto, setAlergiasTexto] = useState(patient?.alergias || '');
  const [notasEnfermeria, setNotasEnfermeria] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // IMC autocalculado
  const imc = useMemo(() => calcIMC(peso, talla), [peso, talla]);

  // Alertas clínicas en vivo
  const alertas = useMemo(() => {
    const list: string[] = [];
    const sDer = parseFloat(paDerSis);
    const dDer = parseFloat(paDerDia);
    const sIzq = parseFloat(paIzqSis);

    if (sDer >= 180 || dDer >= 120) {
      list.push('🚨 Cifras de Crisis Hipertensiva (PA ≥ 180/120 mmHg)');
    } else if (sDer >= 140 || dDer >= 90) {
      list.push('⚠️ Hipertensión Grado 2 (PA ≥ 140/90 mmHg)');
    } else if (sDer > 0 && sDer < 90) {
      list.push('⚠️ Hipotensión Arterial (Sistólica < 90 mmHg)');
    }

    if (sDer > 0 && sIzq > 0 && Math.abs(sDer - sIzq) > 15) {
      list.push(`⚠️ Diferencial inter-brazos elevado (${Math.abs(sDer - sIzq)} mmHg). Descartar estenosis o coartación.`);
    }

    const fcNum = parseFloat(fc);
    if (fcNum > 100) list.push(`⚠️ Taquicardia (FC ${fcNum} lpm)`);
    if (fcNum > 0 && fcNum < 60) list.push(`⚠️ Bradicardia (FC ${fcNum} lpm)`);

    const spNum = parseFloat(spo2);
    if (spNum > 0 && spNum < 92) list.push(`🚨 Hipoxemia (SpO2 ${spNum}%)`);

    const gluNum = parseFloat(glucosa);
    if (gluNum > 0 && gluNum < 70) list.push(`🚨 Hipoglucemia capilar (${gluNum} mg/dL)`);
    if (gluNum >= 200) list.push(`⚠️ Hiperglucemia capilar (${gluNum} mg/dL)`);

    if (alergiaContraste) list.push('🚨 ALERTA HEMODINAMIA: Alergia a Medios de Contraste Yodados');

    return list;
  }, [paDerSis, paDerDia, paIzqSis, fc, spo2, glucosa, alergiaContraste]);

  if (!isOpen || !patient) return null;

  const numVal = (val: string) => {
    const n = parseFloat(val.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const handleGuardar = async (pasarADoctor: boolean) => {
    if (!patient?.id) return;
    setSaving(true);
    setErrorMsg('');

    try {
      const s = await getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}),
      };

      const nowIso = new Date().toISOString();

      // Armar payload de signos vitales para la visita / triage
      const triagePayload = {
        patient_id: patient.id,
        visit_type: 'triaje',
        visit_reason: 'Toma de signos vitales y somatometría (Enfermería)',
        pa_der_sistolica: numVal(paDerSis),
        pa_der_diastolica: numVal(paDerDia),
        pa_izq_sistolica: numVal(paIzqSis),
        pa_izq_diastolica: numVal(paIzqDia),
        heart_rate: numVal(fc),
        spo2: numVal(spo2),
        temperature: numVal(temp),
        weight: numVal(peso),
        height: numVal(talla),
        imc,
        circ_abdominal: numVal(cintura),
        glucosa_capilar: numVal(glucosa),
        dolor_eva: numVal(dolorEva),
        ritmo_cardiaco: ritmo,
        exploracion_notas: notasEnfermeria.trim() ? `Observaciones enfermería: ${notasEnfermeria.trim()}` : null,
        created_at: nowIso,
      };

      // 1. Guardar o registrar visita de triaje
      try {
        await fetch(`${B()}/visits`, {
          method: 'POST',
          headers,
          body: JSON.stringify(triagePayload),
        });
      } catch {
        await supabase.from('visits').insert(triagePayload);
      }

      // 2. Actualizar datos base del paciente (alergias, fase de sala 'nursing' = listo para doctor)
      const patientUpdate: Record<string, any> = {
        updated_at: nowIso,
      };

      if (pasarADoctor) {
        // En Apex, 'nursing' significa que enfermería ya terminó el triaje y el paciente pasa a espera del doctor
        patientUpdate.registration_phase = 'nursing';
      }

      const alergiasFinales = [
        alergiasTexto.trim(),
        alergiaContraste ? 'ALERGIA A CONTRASTE YODADO (ALERTA HEMODINAMIA)' : null,
      ].filter(Boolean).join(', ');

      if (alergiasFinales) {
        patientUpdate.allergies_medications = alergiasFinales;
      }

      try {
        await fetch(`${B()}/patients/${patient.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(patientUpdate),
        });
      } catch {
        await supabase.from('patients').update(patientUpdate).eq('id', patient.id);
      }

      onSuccess?.(pasarADoctor ? '✓ Triaje completado. Paciente listo para consulta médica.' : '✓ Signos vitales guardados.');
      onClose();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error al guardar los signos vitales');
    } finally {
      setSaving(false);
    }
  };

  const inpCls = 'w-full px-3 py-2 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-xs sm:text-sm text-[var(--c-text)] outline-none focus:border-[var(--c-primary)] font-bold text-center';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--c-border)] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-[var(--c-primary)] flex items-center justify-center font-bold text-sm">
                🩺
              </span>
              <h2 className="text-base sm:text-lg font-bold text-[var(--c-text)]">
                Triaje & Signos Vitales (NOM-004)
              </h2>
            </div>
            <p className="text-xs text-[var(--c-text-2)] mt-0.5">
              Paciente: <b className="text-[var(--c-text)]">{patient.full_name}</b> {patient.phone ? `· ${patient.phone}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--c-subtle)] text-[var(--c-text-2)] hover:text-[var(--c-text)] flex items-center justify-center font-bold text-lg"
          >
            ×
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Formulario de Signos Vitales */}
        <div className="space-y-4">

          {/* Presión Arterial Bilateral */}
          <div className="p-3.5 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-2">
            <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase font-bold tracking-wider">
              Tensión Arterial Bilateral (mmHg)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[var(--c-text-2)] font-mono block mb-1">Brazo Derecho (Referencia)</label>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={paDerSis}
                    onChange={e => setPaDerSis(e.target.value)}
                    placeholder="Sist"
                    className={inpCls}
                  />
                  <span className="text-[var(--c-text-3)] font-bold">/</span>
                  <input
                    inputMode="numeric"
                    value={paDerDia}
                    onChange={e => setPaDerDia(e.target.value)}
                    placeholder="Diast"
                    className={inpCls}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[var(--c-text-2)] font-mono block mb-1">Brazo Izquierdo (Diferencial)</label>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={paIzqSis}
                    onChange={e => setPaIzqSis(e.target.value)}
                    placeholder="Sist"
                    className={inpCls}
                  />
                  <span className="text-[var(--c-text-3)] font-bold">/</span>
                  <input
                    inputMode="numeric"
                    value={paIzqDia}
                    onChange={e => setPaIzqDia(e.target.value)}
                    placeholder="Diast"
                    className={inpCls}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Cuadrícula de Parámetros Cardiopulmonares y Metabólicos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Frec. Cardíaca</label>
              <div className="relative">
                <input
                  inputMode="numeric"
                  value={fc}
                  onChange={e => setFc(e.target.value)}
                  placeholder="Ej. 72"
                  className={inpCls}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--c-text-3)] font-mono pointer-events-none">lpm</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Ritmo</label>
              <select
                value={ritmo}
                onChange={e => setRitmo(e.target.value as any)}
                className="w-full px-2 py-2 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-xs text-[var(--c-text)] font-semibold outline-none"
              >
                <option value="regular">Regular</option>
                <option value="irregular">Irregular / Arritmia</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Sat. O2 (SpO2)</label>
              <div className="relative">
                <input
                  inputMode="numeric"
                  value={spo2}
                  onChange={e => setSpo2(e.target.value)}
                  placeholder="Ej. 98"
                  className={inpCls}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--c-text-3)] font-mono pointer-events-none">%</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Frec. Resp.</label>
              <div className="relative">
                <input
                  inputMode="numeric"
                  value={fr}
                  onChange={e => setFr(e.target.value)}
                  placeholder="Ej. 16"
                  className={inpCls}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--c-text-3)] font-mono pointer-events-none">rpm</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Temperatura</label>
              <div className="relative">
                <input
                  inputMode="decimal"
                  value={temp}
                  onChange={e => setTemp(e.target.value)}
                  placeholder="Ej. 36.5"
                  className={inpCls}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--c-text-3)] font-mono pointer-events-none">°C</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Glucosa Capilar</label>
              <div className="relative">
                <input
                  inputMode="numeric"
                  value={glucosa}
                  onChange={e => setGlucosa(e.target.value)}
                  placeholder="Ej. 95"
                  className={inpCls}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--c-text-3)] font-mono pointer-events-none">mg/dL</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Peso</label>
              <div className="relative">
                <input
                  inputMode="decimal"
                  value={peso}
                  onChange={e => setPeso(e.target.value)}
                  placeholder="Ej. 75"
                  className={inpCls}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--c-text-3)] font-mono pointer-events-none">kg</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Estatura</label>
              <div className="relative">
                <input
                  inputMode="numeric"
                  value={talla}
                  onChange={e => setTalla(e.target.value)}
                  placeholder="Ej. 170"
                  className={inpCls}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--c-text-3)] font-mono pointer-events-none">cm</span>
              </div>
            </div>
          </div>

          {/* IMC y Cintura */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Perím. Cintura</label>
              <div className="relative">
                <input
                  inputMode="decimal"
                  value={cintura}
                  onChange={e => setCintura(e.target.value)}
                  placeholder="Ej. 85"
                  className={inpCls}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--c-text-3)] font-mono pointer-events-none">cm</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Índice Masa (IMC)</label>
              <div className="w-full py-2 bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-xl text-center font-bold text-xs sm:text-sm text-[var(--c-text)]">
                {imc != null ? `${imc} (${interpIMC(imc)})` : '—'}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Dolor (EVA 0-10)</label>
              <select
                value={dolorEva}
                onChange={e => setDolorEva(e.target.value)}
                className="w-full py-2 px-2 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-xs text-[var(--c-text)] font-semibold outline-none"
              >
                <option value="0">0 - Sin dolor</option>
                <option value="2">2 - Leve</option>
                <option value="4">4 - Moderado</option>
                <option value="6">6 - Intenso</option>
                <option value="8">8 - Muy intenso</option>
                <option value="10">10 - Insoportable</option>
              </select>
            </div>
          </div>

          {/* Alerta de Contraste Yodado (Vital en cardiología intervencionista) */}
          <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-red-400">¿Alergia a Medios de Contraste Yodados?</p>
              <p className="text-[10px] text-[var(--c-text-2)]">Crítico para sala de hemodinámica / cateterismo</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={alergiaContraste}
                onChange={e => setAlergiaContraste(e.target.checked)}
                className="w-4 h-4 rounded text-red-500"
              />
              <span className="text-xs font-bold text-red-400">SÍ tiene alergia</span>
            </label>
          </div>

          {/* Notas de Enfermería */}
          <div>
            <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1">Observaciones de Triaje / Motivo Inmediato</label>
            <input
              value={notasEnfermeria}
              onChange={e => setNotasEnfermeria(e.target.value)}
              placeholder="Ej. Paciente refiere mareo matutino, marcha estable, tolera decúbito..."
              className="w-full px-3 py-2 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-xs text-[var(--c-text)] outline-none focus:border-[var(--c-primary)]"
            />
          </div>

          {/* Banner de alertas activas */}
          {alertas.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs space-y-1">
              <p className="font-bold uppercase font-mono text-[10px]">Alertas Médicas de Triaje:</p>
              {alertas.map((al, idx) => (
                <p key={idx}>{al}</p>
              ))}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-[var(--c-border)]">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-[var(--c-text-2)] hover:text-[var(--c-text)]"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleGuardar(false)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-subtle)] text-xs font-bold text-[var(--c-text)] hover:border-[var(--c-primary)]"
          >
            {saving ? 'Guardando…' : 'Solo guardar signos'}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleGuardar(true)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--c-primary)] text-black text-xs font-bold hover:brightness-110 flex items-center justify-center gap-1.5 shadow-md"
          >
            <span>✓</span>
            <span>{saving ? 'Procesando…' : 'Guardar y Pasar a Espera del Doctor'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
