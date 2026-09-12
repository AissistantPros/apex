'use client';

/**
 * Capa profunda de la entrevista funcional / longevidad.
 * Solo se muestra cuando care_type === 'funcional_longevidad'.
 * Cubre los 4 bloques que la metodología (IFM + libro "20 años menos") exige y que la
 * historia general no captura: línea de tiempo (ATM), conexión social/propósito,
 * disponibilidad de estudios óptimos, y edad biológica + metas.
 * Todo se guarda en patients.func_intake (jsonb).
 */
import { useState } from 'react';

type Obj = Record<string, any>;

const C = { card: '#0d1520', border: '#1e2d3d', text: '#dde6ef', muted: '#7a95aa', faint: '#3d5870', green: '#00e5a0', blue: '#0ea5e9' };
const inp = 'w-full bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2.5 text-[#dde6ef] text-sm outline-none focus:border-[#00e5a0] transition placeholder-[#3d5870]';

function Card({ icon, title, sub, children }: { icon: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0d1520] border border-[#00e5a0]/25 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[#dde6ef] flex items-center gap-2">{icon} {title}</h3>
        {sub && <p className="text-[11px] text-[#7a95aa] mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[10px] font-mono text-[#7a95aa] mb-1.5 block uppercase tracking-wider">{label}</label>{children}</div>;
}
function Pills({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button key={o} type="button" onClick={() => onChange(value === o ? '' : o)}
          className="px-3.5 py-2 rounded-xl text-sm font-medium transition border"
          style={{ background: value === o ? 'rgba(0,229,160,.18)' : 'transparent', color: value === o ? C.green : C.muted, borderColor: value === o ? C.green : C.border }}>
          {o}
        </button>
      ))}
    </div>
  );
}
function MultiPills({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const on = value.includes(o);
        return <button key={o} type="button" onClick={() => toggle(o)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition border"
          style={{ background: on ? 'rgba(14,165,233,.18)' : 'transparent', color: on ? C.blue : C.muted, borderColor: on ? C.blue : C.border }}>
          {o}
        </button>;
      })}
    </div>
  );
}

const CONTEXTOS = ['Mudanza', 'Duelo / pérdida', 'Divorcio / separación', 'Pérdida de empleo', 'Estrés laboral intenso',
  'Infección grave', 'Cirugía', 'Embarazo / parto', 'Antibióticos prolongados', 'Intoxicación / exposición', 'Accidente / trauma', 'Otro'];
const LABS = ['ApoB', 'Insulina en ayuno', 'HOMA-IR', 'hs-CRP (PCR ultrasensible)', 'Homocisteína', 'Ferritina',
  '25-OH Vitamina D', 'T3 libre / T3 reversa', 'HbA1c', 'Perfil lipídico', 'Testosterona libre', 'Magnesio eritrocitario', 'Panel tiroideo completo'];
const METAS = ['Más energía', 'Prevención / envejecer bien', 'Composición corporal', 'Rendimiento físico',
  'Claridad mental / cognición', 'Longevidad / healthspan', 'Sueño', 'Estado de ánimo', 'Función sexual / hormonal'];

export default function DeepFunctionalIntake({ value, onChange }: { value: Obj; onChange: (v: Obj) => void }) {
  const v = value || {};
  const set = (k: string, val: any) => onChange({ ...v, [k]: val });

  // ── Línea de tiempo (eventos ATM) ──
  const eventos: Obj[] = Array.isArray(v.timeline) ? v.timeline : [];
  const setEvento = (i: number, k: string, val: any) => set('timeline', eventos.map((e, j) => j === i ? { ...e, [k]: val } : e));
  const addEvento = () => set('timeline', [...eventos, { evento: '', cuando: '', contexto: '' }]);
  const delEvento = (i: number) => set('timeline', eventos.filter((_, j) => j !== i));

  return (
    <div className="space-y-4">
      <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.25)' }}>
        <p className="text-sm font-semibold text-[#00e5a0]">🧬 Entrevista Funcional y de Longevidad</p>
        <p className="text-xs text-[#7a95aa] mt-0.5">Estos bloques son los que permiten una opinión funcional y de longevidad completa.</p>
      </div>

      {/* BLOQUE 1 — Línea de tiempo (Antecedentes–Disparadores–Mediadores) */}
      <Card icon="🕰️" title="Línea de tiempo de salud"
        sub="El eje del método funcional: cuándo empezó cada cosa y qué la disparó. Agrega los eventos que marcaron un antes y un después.">
        <div className="space-y-3">
          {eventos.map((e, i) => (
            <div key={i} className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <input className={inp} placeholder="¿Qué pasó? (síntoma, diagnóstico, cambio)" value={e.evento || ''} onChange={ev => setEvento(i, 'evento', ev.target.value)} />
                <button type="button" onClick={() => delEvento(i)} className="text-[#f43f5e] px-1">×</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={inp} placeholder="¿Cuándo? (edad o año)" value={e.cuando || ''} onChange={ev => setEvento(i, 'cuando', ev.target.value)} />
                <select className={inp} value={e.contexto || ''} onChange={ev => setEvento(i, 'contexto', ev.target.value)}>
                  <option value="">¿Qué pasaba en tu vida entonces?</option>
                  {CONTEXTOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          ))}
          <button type="button" onClick={addEvento} className="text-[#00e5a0] text-sm">+ Agregar evento a la línea de tiempo</button>
        </div>
      </Card>

      {/* BLOQUE 2 — Conexión social y propósito */}
      <Card icon="🤝" title="Conexión social y propósito"
        sub="El aislamiento eleva la mortalidad de forma comparable a fumar (Holt-Lunstad, 2015). Es una palanca clínica, no un extra.">
        <Field label="¿Con qué frecuencia convive con personas cercanas (familia/amigos)?">
          <Pills options={['A diario', 'Cada semana', 'Cada mes', 'Rara vez']} value={v.social_frecuencia || ''} onChange={x => set('social_frecuencia', x)} />
        </Field>
        <Field label="¿Se siente solo o aislado?">
          <Pills options={['Nunca', 'A veces', 'Frecuentemente', 'Casi siempre']} value={v.soledad || ''} onChange={x => set('soledad', x)} />
        </Field>
        <Field label="¿Tiene una red de apoyo con quién contar en momentos difíciles?">
          <Pills options={['Sí, sólida', 'Más o menos', 'Casi no', 'No']} value={v.red_apoyo || ''} onChange={x => set('red_apoyo', x)} />
        </Field>
        <Field label="¿Siente que su vida tiene propósito o sentido?">
          <Pills options={['Mucho', 'Algo', 'Poco', 'Casi nada']} value={v.proposito || ''} onChange={x => set('proposito', x)} />
        </Field>
        <Field label="¿Pertenece a algún grupo o comunidad? (deporte, religión, voluntariado, club)">
          <input className={inp} placeholder="Descríbalo brevemente (o 'ninguno')" value={v.comunidad || ''} onChange={e => set('comunidad', e.target.value)} />
        </Field>
      </Card>

      {/* BLOQUE 3 — Disponibilidad de estudios óptimos */}
      <Card icon="🧪" title="Disponibilidad de estudios de laboratorio"
        sub="Determina qué tan completa puede ser la opinión funcional. Marca los estudios que el paciente ya tiene o puede conseguir.">
        <Field label="¿Tiene laboratorios recientes (menos de 6 meses)?">
          <Pills options={['Sí', 'No', 'Algunos']} value={v.labs_recientes || ''} onChange={x => set('labs_recientes', x)} />
        </Field>
        <Field label="Estudios que tiene o puede realizarse">
          <MultiPills options={LABS} value={Array.isArray(v.labs_disponibles) ? v.labs_disponibles : []} onChange={x => set('labs_disponibles', x)} />
        </Field>
        <Field label="¿Puede realizarse los estudios que solicitemos?">
          <Pills options={['Sin problema', 'Limitado por costo', 'Prefiere los mínimos', 'No por ahora']} value={v.puede_estudios || ''} onChange={x => set('puede_estudios', x)} />
        </Field>
      </Card>

      {/* BLOQUE 4 — Edad biológica y metas */}
      <Card icon="⏳" title="Edad biológica y objetivos"
        sub="El cambio de métrica de la medicina de longevidad: no la edad del acta, sino qué tan rápido envejece.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="¿Se ha hecho una prueba de edad biológica (reloj epigenético)?">
            <input className={inp} placeholder="Resultado si lo tiene (ej. 52 años) o 'no'" value={v.edad_biologica || ''} onChange={e => set('edad_biologica', e.target.value)} />
          </Field>
          <Field label="¿DEXA o InBody reciente?">
            <input className={inp} placeholder="% grasa / músculo / visceral, o 'no'" value={v.composicion || ''} onChange={e => set('composicion', e.target.value)} />
          </Field>
        </div>
        <Field label="¿Qué es lo que más le importa lograr? (puede elegir varias)">
          <MultiPills options={METAS} value={Array.isArray(v.metas) ? v.metas : []} onChange={x => set('metas', x)} />
        </Field>
        <Field label="Expectativa principal en sus propias palabras">
          <textarea className={inp} rows={2} placeholder="¿Qué le gustaría sentir o lograr en 6-12 meses?" value={v.expectativa || ''} onChange={e => set('expectativa', e.target.value)} />
        </Field>
      </Card>
    </div>
  );
}

// Calcula si la entrevista funcional tiene lo mínimo para una opinión completa
export function esFuncionalCompleta(v: Obj): boolean {
  if (!v) return false;
  const tieneTimeline = Array.isArray(v.timeline) && v.timeline.some((e: Obj) => (e.evento || '').trim());
  const tieneSocial = !!v.social_frecuencia && !!v.soledad;
  const tieneLabs = !!v.labs_recientes || (Array.isArray(v.labs_disponibles) && v.labs_disponibles.length > 0);
  const tieneMetas = Array.isArray(v.metas) && v.metas.length > 0;
  return tieneTimeline && tieneSocial && tieneLabs && tieneMetas;
}
