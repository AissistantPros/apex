'use client';

/**
 * DynamicQuestions — render dinámico del banco de preguntas configurable.
 *
 * Trae el cuestionario activo de la clínica para un bloque (convencional / consulta /
 * funcional / longevidad) desde `/questionnaires/mine/{block}` y renderiza los campos
 * según su tipo. Reporta las respuestas hacia arriba como una lista AUTODESCRIPTIVA
 * (incluye key + label + unit) para que queden "perfectamente mapeadas" entre el
 * formulario, la DB (visits.dynamic_answers) y el prompt de la IA.
 *
 * Es ADITIVO y seguro: si la clínica no tiene preguntas configuradas para el bloque,
 * el componente no renderiza nada.
 */

import { useEffect, useState } from 'react';
import { getSession } from '@/app/lib/auth';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export type DynQuestion = {
  key: string;
  label: string;
  type: 'number' | 'text' | 'textarea' | 'select' | 'multiselect' | 'boolean' | 'scale';
  unit?: string;
  options?: string[];
  required?: boolean;
  help?: string;
  order?: number;
};

export type DynAnswer = {
  key: string;
  label: string;
  type: string;
  unit?: string;
  value: any;
};

export default function DynamicQuestions({
  block,
  title,
  accent = '#a78bfa',
  tablet = false,
  onChange,
}: {
  block: string;
  title?: string;
  accent?: string;
  tablet?: boolean;
  onChange?: (answers: DynAnswer[]) => void;
}) {
  const [questions, setQuestions] = useState<DynQuestion[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await getSession();
        const token = session?.access_token;
        const res = await fetch(`${BACKEND()}/questionnaires/mine/${block}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) { if (alive) setLoading(false); return; }
        const data = await res.json();
        if (alive) {
          const qs: DynQuestion[] = (data.questions || []).sort(
            (a: DynQuestion, b: DynQuestion) => (a.order || 0) - (b.order || 0)
          );
          setQuestions(qs);
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [block]);

  // Reportar hacia arriba las respuestas con valor (autodescriptivas).
  useEffect(() => {
    if (!onChange) return;
    const answers: DynAnswer[] = questions
      .map((q) => ({ key: q.key, label: q.label, type: q.type, unit: q.unit, value: values[q.key] }))
      .filter((a) => {
        const v = a.value;
        if (v === undefined || v === null || v === '') return false;
        if (Array.isArray(v) && v.length === 0) return false;
        return true;
      });
    onChange(answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, questions]);

  const set = (key: string, v: any) => setValues((prev) => ({ ...prev, [key]: v }));

  if (loading || questions.length === 0) return null;

  const inputCls = `w-full px-3 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] outline-none placeholder-[#3d5870] transition ${tablet ? 'py-3.5 text-base min-h-[52px]' : 'py-2 text-sm'}`;

  const renderField = (q: DynQuestion) => {
    const v = values[q.key];
    switch (q.type) {
      case 'number':
        return (
          <div className="flex items-center gap-2">
            <input
              type="number" inputMode="decimal" value={v ?? ''} placeholder={q.help || ''}
              onChange={(e) => set(q.key, e.target.value)}
              className={inputCls}
              style={{ borderColor: undefined }} />
            {q.unit && <span className="text-xs text-[#7a95aa] whitespace-nowrap">{q.unit}</span>}
          </div>
        );
      case 'textarea':
        return (
          <textarea rows={tablet ? 4 : 3} value={v ?? ''} placeholder={q.help || ''}
            onChange={(e) => set(q.key, e.target.value)}
            className={`${inputCls} resize-none`} />
        );
      case 'select':
        return (
          <select value={v ?? ''} onChange={(e) => set(q.key, e.target.value)} className={inputCls}>
            <option value="">Seleccionar…</option>
            {(q.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case 'multiselect':
        return (
          <div className="flex flex-wrap gap-2">
            {(q.options || []).map((o) => {
              const arr: string[] = Array.isArray(v) ? v : [];
              const on = arr.includes(o);
              return (
                <button type="button" key={o}
                  onClick={() => set(q.key, on ? arr.filter((x) => x !== o) : [...arr, o])}
                  className={`px-3 rounded-lg border transition ${tablet ? 'py-2.5 text-sm' : 'py-1.5 text-xs'}`}
                  style={{ background: on ? accent : '#1e2d3d', borderColor: on ? accent : '#2a3a4d', color: on ? '#000' : '#dde6ef' }}>
                  {o}
                </button>
              );
            })}
          </div>
        );
      case 'boolean':
        return (
          <div className="flex gap-2">
            {['Sí', 'No'].map((o) => (
              <button type="button" key={o} onClick={() => set(q.key, o)}
                className={`flex-1 rounded-lg border transition ${tablet ? 'py-3 text-sm' : 'py-2 text-xs'}`}
                style={{ background: v === o ? accent : '#1e2d3d', borderColor: v === o ? accent : '#2a3a4d', color: v === o ? '#000' : '#dde6ef' }}>
                {o}
              </button>
            ))}
          </div>
        );
      case 'scale': {
        const n = typeof v === 'number' ? v : parseInt(v || '0') || 0;
        return (
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-[#3d5870]">1</span>
              <span className="font-mono font-black text-lg" style={{ color: accent }}>{n || '—'}</span>
              <span className="text-[10px] text-[#3d5870]">10</span>
            </div>
            <input type="range" min={1} max={10} value={n || 1}
              onChange={(e) => set(q.key, parseInt(e.target.value))}
              className="w-full" style={{ accentColor: accent }} />
          </div>
        );
      }
      default:
        return (
          <input type="text" value={v ?? ''} placeholder={q.help || ''}
            onChange={(e) => set(q.key, e.target.value)} className={inputCls} />
        );
    }
  };

  return (
    <div className="space-y-4 bg-[#0d1520] border rounded-2xl p-5" style={{ borderColor: `${accent}30` }}>
      <div>
        <p className={`font-mono ${tablet ? 'text-sm' : 'text-xs'}`} style={{ color: accent }}>
          {title || '📋 CUESTIONARIO DE LA CLÍNICA'}
        </p>
        <p className="text-[10px] text-[#3d5870] mt-0.5">Preguntas configuradas por tu clínica.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {questions.map((q) => (
          <div key={q.key} className={q.type === 'textarea' || q.type === 'multiselect' ? 'md:col-span-2' : ''}>
            <label className={`font-mono text-[#7a95aa] mb-1.5 block ${tablet ? 'text-sm' : 'text-xs'}`}>
              {q.label}{q.required && <span className="text-[#f43f5e] ml-1">*</span>}
              {q.unit && q.type !== 'number' ? <span className="text-[#3d5870] ml-1">({q.unit})</span> : null}
            </label>
            {renderField(q)}
          </div>
        ))}
      </div>
    </div>
  );
}
