'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────
type Step =
  | 'init' | 'clarifying' | 'clarifying_functional' | 'select' | 'loading'
  | 'review_traditional' | 'review_functional' | 'review_longevity'
  | 'review_protocol_traditional' | 'review_protocol_functional' | 'review_protocol_longevity'
  | 'documents' | 'complete';

type AnalysisType = 'traditional' | 'functional' | 'longevity';
const ALL_TYPES: AnalysisType[] = ['traditional', 'functional', 'longevity'];

const TYPE_META: Record<AnalysisType, {
  dxLabel: string; protoLabel: string; badge: string; protoBadge: string;
  color: string; short: string; icon: string; selectLabel: string; selectDesc: string;
}> = {
  traditional: {
    dxLabel: 'Diagnóstico Convencional', protoLabel: 'Protocolo Convencional',
    badge: 'MEDICINA CONVENCIONAL', protoBadge: 'PROTOCOLO CONVENCIONAL',
    color: '#0ea5e9', short: 'Conv.', icon: '🩺',
    selectLabel: 'Medicina Convencional',
    selectDesc: 'Diagnóstico clínico clásico, subespecialidades y estudios de confirmación.',
  },
  functional: {
    dxLabel: 'Diagnóstico Funcional', protoLabel: 'Protocolo Funcional',
    badge: 'MEDICINA FUNCIONAL', protoBadge: 'PROTOCOLO FUNCIONAL',
    color: '#00e5a0', short: 'Func.', icon: '🧬',
    selectLabel: 'Medicina Funcional',
    selectDesc: 'Raíz del problema, cascada de causalidad y sistemas desregulados.',
  },
  longevity: {
    dxLabel: 'Diagnóstico Longevidad', protoLabel: 'Protocolo Longevidad',
    badge: 'LONGEVIDAD', protoBadge: 'PROTOCOLO LONGEVIDAD',
    color: '#a78bfa', short: 'Long.', icon: '⏳',
    selectLabel: 'Medicina de Longevidad',
    selectDesc: 'Edad biológica, riesgos a 5-10 años y potencial de mejora.',
  },
};

function stepCfgFor(s: Step): { label: string; color: string; badge: string } {
  let m = s.match(/^review_protocol_(traditional|functional|longevity)$/);
  if (m) { const t = TYPE_META[m[1] as AnalysisType]; return { label: t.protoLabel, color: t.color, badge: t.protoBadge }; }
  m = s.match(/^review_(traditional|functional|longevity)$/);
  if (m) { const t = TYPE_META[m[1] as AnalysisType]; return { label: t.dxLabel, color: t.color, badge: t.badge }; }
  return { label: '', color: '#00e5a0', badge: '' };
}

function buildStepperLabels(types: AnalysisType[]): { label: string; color: string }[] {
  const dx    = types.map(t => ({ label: `Dx ${TYPE_META[t].short}`,    color: TYPE_META[t].color }));
  const proto = types.map(t => ({ label: `Proto ${TYPE_META[t].short}`, color: TYPE_META[t].color }));
  return [...dx, ...proto, { label: 'Documentos', color: '#f59e0b' }];
}

interface DiagnosisState {
  ai_text: string;
  doctor_text: string;
  validation: string;
  confirmed: boolean;
  confidence: number;
  approved?: boolean[];
  doctor_notes?: string;
}

interface ChatMsg {
  role: 'user' | 'assistant' | 'divider';
  content: string;
  ts?: number;
}

const EMPTY_DX: DiagnosisState = {
  ai_text: '', doctor_text: '', validation: '',
  confirmed: false, confidence: 75, approved: [], doctor_notes: '',
};

// ─── Loading steps ────────────────────────────────────────────────────────────
const LOAD_MSGS = [
  'Cargando historial clínico completo',
  'Analizando signos vitales y datos de la visita',
  'Revisando antecedentes y medicamentos actuales',
  'Consultando base de conocimiento clínico',
  'Procesando con IA médica especializada',
  'Cruzando datos con patrones clínicos',
  'Calculando diagnósticos diferenciales',
  'Verificando fuentes y evidencia',
  'Filtrando alucinaciones clínicas',
  'Preparando diagnóstico estructurado',
];

// ─── Markdown / Section Parsers ───────────────────────────────────────────────

/** Renders inline bold: **text** → <strong> */
function Md({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-bold text-[#dde6ef]">{p}</strong>
          : p
      )}
    </>
  );
}

function parseSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  // Primary: ═══ TITLE ═══
  const r1 = /═══\s*(.+?)\s*═══\s*\n([\s\S]*?)(?=═══|$)/g;
  let m;
  while ((m = r1.exec(text)) !== null) sections[m[1].trim()] = m[2].trim();
  if (Object.keys(sections).length > 0) return sections;

  // Secondary: ══ TITLE ══
  const r2 = /══\s*(.+?)\s*══\s*\n([\s\S]*?)(?=══|$)/g;
  while ((m = r2.exec(text)) !== null) sections[m[1].trim()] = m[2].trim();
  if (Object.keys(sections).length > 0) return sections;

  return sections;
}

// ─── Section Renderers ────────────────────────────────────────────────────────

/** Busca una línea "ESTUDIO PARA CONFIRMAR: ..." y la separa del resto del texto */
function extractStudy(text: string): { rest: string; study: string | null } {
  const m = text.match(/ESTUDIOS?\s*(?:PARA CONFIRMAR|SUGERIDOS?)?:\s*(.+)/i);
  if (!m) return { rest: text, study: null };
  const rest = (text.slice(0, m.index) + text.slice((m.index || 0) + m[0].length)).trim();
  return { rest, study: m[1].trim() };
}

function StudyTag({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 bg-[rgba(14,165,233,.07)] border border-[rgba(14,165,233,.2)] rounded-lg px-3 py-2">
      <span className="text-[#0ea5e9] text-xs flex-shrink-0 mt-0.5">🔬</span>
      <p className="text-xs text-[#7a95aa] font-mono leading-relaxed">
        <span className="text-[#0ea5e9] font-bold">Estudio para confirmar: </span>
        <Md text={text} />
      </p>
    </div>
  );
}

function MainDxBlock({ body, color }: { body: string; color: string }) {
  const { rest, study } = extractStudy(body);
  const lines = rest.split('\n').filter(l => l.trim());
  const headline = lines[0] || '';
  const detail = lines.slice(1).join('\n').trim();
  return (
    <div className="rounded-xl p-4" style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
      <p className="font-bold text-base leading-snug mb-2" style={{ color }}>
        <Md text={headline} />
      </p>
      {detail && (
        <p className="text-lg text-[#dde6ef] leading-relaxed font-serif">
          <Md text={detail} />
        </p>
      )}
      {study && <StudyTag text={study} />}
    </div>
  );
}

// Marca que el médico estampa en la línea del diagnóstico elegido — se guarda
// directamente en doctor_text, así viaja a todos los pasos/prompts siguientes.
const DX_MARK = '⭐ ELEGIDO POR EL MÉDICO — ';

function RankedDiagnosesBlock({ body, color, onToggleSelect }: {
  body: string; color: string; onToggleSelect?: (rawLine: string) => void;
}) {
  const lines = body.split('\n');
  const items: { name: string; pct: number | null; detail: string; study: string | null; selected: boolean; rawLine: string }[] = [];
  let current: { name: string; pct: number | null; detail: string[]; selected: boolean; rawLine: string } | null = null;

  const flush = () => {
    if (!current) return;
    const { rest, study } = extractStudy(current.detail.join(' ').trim());
    items.push({ name: current.name, pct: current.pct, detail: rest, study, selected: current.selected, rawLine: current.rawLine });
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    const head = t.match(/^\d+\.\s*(.+?)(?:\s*\|\s*(\d{1,3})\s*%)?\s*$/);
    if (head) {
      flush();
      let name = head[1].trim();
      let selected = false;
      if (name.startsWith(DX_MARK)) { selected = true; name = name.slice(DX_MARK.length).trim(); }
      current = { name, pct: head[2] ? parseInt(head[2], 10) : null, detail: [], selected, rawLine: t };
    } else if (current) {
      current.detail.push(t);
    }
  }
  flush();

  if (!items.length) {
    return <DefaultBlock body={body} />;
  }

  const anySelected = items.some(it => it.selected);

  return (
    <div>
      <p className="text-xs text-[#7a95aa] font-serif mb-3 italic">
        {onToggleSelect
          ? 'Diagnósticos posibles, del más al menos probable según la IA. Marca con ⭐ el o los que consideres correctos — tu criterio manda.'
          : 'Diagnósticos posibles con la información disponible, del más al menos probable:'}
      </p>
      <div className="flex flex-col gap-3">
        {items.map((item, i) => {
          const isFirst = i === 0;
          const highlight = item.selected || (!anySelected && isFirst);
          const pctColor = item.pct == null ? '#7a95aa' : item.pct >= 75 ? color : item.pct >= 50 ? '#f59e0b' : '#7a95aa';
          return (
            <div key={i} className="rounded-xl p-4"
              style={item.selected
                ? { background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.4)' }
                : highlight
                ? { background: `${color}10`, border: `1px solid ${color}30` }
                : { background: '#070a0e', border: '1px solid #1e2d3d' }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="font-bold text-sm leading-snug flex items-center gap-1.5" style={{ color: item.selected ? '#f59e0b' : highlight ? color : '#dde6ef' }}>
                  {item.selected ? '⭐ ' : highlight ? '🎯 ' : `${i + 1}. `}<Md text={item.name} />
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.pct != null && (
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded whitespace-nowrap"
                      style={{ color: pctColor, background: `${pctColor}15`, border: `1px solid ${pctColor}40` }}>
                      {item.pct}%
                    </span>
                  )}
                  {onToggleSelect && (
                    <button type="button" onClick={() => onToggleSelect(item.rawLine)}
                      title={item.selected ? 'Quitar como diagnóstico elegido' : 'Marcar como el diagnóstico correcto'}
                      className="text-base leading-none px-1.5 py-1 rounded-md border transition"
                      style={item.selected
                        ? { color: '#f59e0b', borderColor: 'rgba(245,158,11,.5)', background: 'rgba(245,158,11,.12)' }
                        : { color: '#3d5870', borderColor: '#1e2d3d', background: 'transparent' }}>
                      {item.selected ? '⭐' : '☆'}
                    </button>
                  )}
                </div>
              </div>
              {item.detail && (
                <p className="text-lg text-[#dde6ef] leading-relaxed font-serif"><Md text={item.detail} /></p>
              )}
              {item.study && <StudyTag text={item.study} />}
            </div>
          );
        })}
      </div>
      {onToggleSelect && anySelected && (
        <p className="text-xs text-[#f59e0b] font-mono mt-3">
          ⭐ Tu selección se usará como diagnóstico de referencia en los siguientes pasos.
        </p>
      )}
    </div>
  );
}

function AddDiagnosisForm({ onAdd, color, big }: {
  onAdd: (input: { nombre: string; pct: string; detalle: string; estudio: string }) => void; color: string; big?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [pct, setPct] = useState('');
  const [detalle, setDetalle] = useState('');
  const [estudio, setEstudio] = useState('');

  const handleSubmit = () => {
    if (!nombre.trim()) return;
    onAdd({ nombre, pct, detalle, estudio });
    setNombre(''); setPct(''); setDetalle(''); setEstudio('');
    setOpen(false);
  };

  if (!open) {
    return big ? (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 text-sm font-bold px-4 py-3.5 rounded-xl border-2 border-dashed transition mt-2"
        style={{ color, borderColor: `${color}55`, background: `${color}0d` }}>
        + Agregar diagnóstico adicional propio
      </button>
    ) : (
      <button type="button" onClick={() => setOpen(true)}
        className="text-xs font-mono px-3 py-2 rounded-lg border transition mt-1"
        style={{ color, borderColor: `${color}40`, background: `${color}08` }}>
        + Agregar mi propio diagnóstico
      </button>
    );
  }

  return (
    <div className="bg-[#070a0e] border rounded-xl p-4 space-y-3 mt-1" style={{ borderColor: `${color}40` }}>
      <p className="text-xs font-mono" style={{ color }}>TU DIAGNÓSTICO — llena solo lo que quieras, nada es obligatorio</p>
      <div>
        <label className="text-[10px] font-mono text-[#3d5870] mb-1 block">NOMBRE DEL DIAGNÓSTICO</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Migraña tensional crónica"
          className="w-full bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-2 text-lg text-[#dde6ef] outline-none focus:border-[#7a95aa]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-mono text-[#3d5870] mb-1 block">% DE CONFIANZA (opcional)</label>
          <input type="number" min={0} max={100} value={pct} onChange={e => setPct(e.target.value)} placeholder="Ej. 85"
            className="w-full bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-2 text-lg text-[#dde6ef] outline-none focus:border-[#7a95aa]" />
        </div>
        <div>
          <label className="text-[10px] font-mono text-[#3d5870] mb-1 block">ESTUDIO PARA CONFIRMAR (opcional)</label>
          <input value={estudio} onChange={e => setEstudio(e.target.value)} placeholder="Ej. RMN cerebral"
            className="w-full bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-2 text-lg text-[#dde6ef] outline-none focus:border-[#7a95aa]" />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-mono text-[#3d5870] mb-1 block">JUSTIFICACIÓN CLÍNICA (opcional)</label>
        <textarea rows={2} value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Qué datos del paciente lo sustentan"
          className="w-full bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-2 text-lg text-[#dde6ef] outline-none focus:border-[#7a95aa] resize-none" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={handleSubmit}
          className="px-4 py-2 text-black text-xs font-bold rounded-lg transition" style={{ background: color }}>
          ✓ Agregar a la lista
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="px-4 py-2 border border-[#1e2d3d] text-[#7a95aa] text-xs rounded-lg hover:border-[#7a95aa] transition">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function AlertsBlock({ body }: { body: string }) {
  const raw = body.trim();
  if (!raw || raw.toLowerCase().includes('sin alertas')) {
    return (
      <div className="flex items-center gap-2 bg-[rgba(0,229,160,.07)] border border-[rgba(0,229,160,.2)] rounded-xl px-4 py-3 text-sm text-[#00e5a0]">
        <span>✓</span> Sin alertas inmediatas
      </div>
    );
  }
  const lines = raw.split('\n').filter(l => l.trim());
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, i) => {
        const clean = line.replace(/^[•\-\*]\s*/, '');
        return (
          <div key={i} className="flex items-start gap-2.5 bg-[rgba(249,115,22,.07)] border border-[rgba(249,115,22,.25)] rounded-xl px-4 py-3">
            <span className="text-[#f97316] flex-shrink-0 mt-0.5 text-base">⚠</span>
            <p className="text-lg text-[#dde6ef] leading-relaxed font-serif"><Md text={clean} /></p>
          </div>
        );
      })}
    </div>
  );
}

function CascadeBlock({ body }: { body: string }) {
  const lines = body.split('\n').filter(l => l.trim());
  // Find the chain line (has →)
  const chain = lines.find(l => l.includes('→'));
  const rest = lines.filter(l => l !== chain);
  if (!chain) {
    return <p className="text-lg text-[#dde6ef] font-serif leading-relaxed whitespace-pre-wrap">{body}</p>;
  }
  const nodes = chain.split('→').map(n => n.trim()).filter(Boolean);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 mb-3 bg-[#070a0e] border border-[#1e2d3d] rounded-xl p-3">
        {nodes.map((node, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#dde6ef] whitespace-nowrap">
              {node}
            </span>
            {i < nodes.length - 1 && (
              <span className="text-[#3d5870] text-sm">→</span>
            )}
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <p className="text-lg text-[#dde6ef] font-serif leading-relaxed whitespace-pre-wrap"><Md text={rest.join('\n')} /></p>
      )}
    </div>
  );
}

function TableBlock({ body }: { body: string }) {
  // Parse pipe-separated table
  const lines = body.split('\n').filter(l => l.trim() && !l.trim().startsWith('|---') && !l.trim().startsWith('|:'));
  if (lines.length < 2) {
    return <p className="text-lg text-[#dde6ef] font-serif leading-relaxed whitespace-pre-wrap">{body}</p>;
  }
  // Check if lines have | separator
  const hasTable = lines.some(l => l.includes('|'));
  if (!hasTable) {
    // Format: "Param | Value | Range | Status" style without pipes at line start
    const rows = lines.map(l => l.split('|').map(c => c.trim()));
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <tbody>
            {rows.map((cols, i) => (
              <tr key={i} className={i === 0 ? '' : 'border-t border-[#1e2d3d]'}>
                {cols.map((col, j) => (
                  <td key={j} className={`px-3 py-2 text-left ${i === 0 ? 'font-mono text-[10px] text-[#3d5870] uppercase' : 'text-[#dde6ef] font-serif'}`}>
                    {col}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const rows = lines.map(l => l.split('|').map(c => c.trim()).filter(Boolean));
  const statusColor = (s: string) => {
    const u = s.toUpperCase();
    if (u.includes('ALTO') || u.includes('ALERTA')) return '#f43f5e';
    if (u.includes('BAJO')) return '#f59e0b';
    if (u.includes('OK') || u.includes('NORMAL') || u.includes('ÓPTIMO')) return '#00e5a0';
    return '#dde6ef';
  };
  return (
    <div className="bg-[#070a0e] border border-[#1e2d3d] rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((cols, i) => (
            <tr key={i} className="border-b border-[#1e2d3d] last:border-0">
              {cols.map((col, j) => {
                const isStatus = j === cols.length - 1 && i > 0;
                const sc = isStatus ? statusColor(col) : undefined;
                return (
                  <td key={j} className={`px-4 py-2.5 ${i === 0 ? 'font-mono text-[10px] text-[#3d5870] uppercase' : 'font-serif'}`}
                    style={{ color: isStatus ? sc : i === 0 ? undefined : '#dde6ef' }}>
                    {isStatus && sc === '#f43f5e' && '↑ '}
                    {isStatus && sc === '#f59e0b' && '↓ '}
                    {col}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RisksBlock({ body }: { body: string }) {
  const lines = body.split('\n').filter(l => l.trim());
  const riskColor = (text: string) => {
    if (text.includes('ALTO')) return { bg: 'rgba(244,63,94,.1)', color: '#f43f5e', border: 'rgba(244,63,94,.25)' };
    if (text.includes('MODERADO')) return { bg: 'rgba(245,158,11,.1)', color: '#f59e0b', border: 'rgba(245,158,11,.25)' };
    return { bg: 'rgba(0,229,160,.08)', color: '#00e5a0', border: 'rgba(0,229,160,.2)' };
  };
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, i) => {
        const clean = line.replace(/^[•\-\*]\s*/, '');
        const c = riskColor(clean);
        const [label, ...rest] = clean.split('—');
        return (
          <div key={i} className="flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ background: c.bg, border: `1px solid ${c.border}` }}>
            <span className="text-xs font-mono font-bold flex-shrink-0 mt-0.5 whitespace-nowrap" style={{ color: c.color }}>
              {label?.trim() || '—'}
            </span>
            {rest.length > 0 && (
              <span className="text-lg text-[#dde6ef] font-serif">{rest.join('—').trim()}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProtocolBlock({ body }: { body: string }) {
  // Each numbered item is a drug/supplement
  const sections: { name: string; fields: string[] }[] = [];
  const lines = body.split('\n');
  let current: { name: string; fields: string[] } | null = null;

  for (const line of lines) {
    const t = line.trim();
    if (/^\d+\./.test(t)) {
      if (current) sections.push(current);
      current = { name: t.replace(/^\d+\.\s*/, ''), fields: [] };
    } else if (current && t.startsWith('•')) {
      current.fields.push(t.replace(/^•\s*/, ''));
    } else if (current && t && !t.startsWith('═') && !t.startsWith('══')) {
      current.fields.push(t);
    }
  }
  if (current) sections.push(current);

  if (!sections.length) {
    // Fallback: render as bullet list
    const bullets = body.split('\n').filter(l => l.trim());
    return (
      <div className="flex flex-col gap-2">
        {bullets.map((b, i) => {
          const clean = b.replace(/^[•\-\*\d+\.]\s*/, '');
          if (!clean) return null;
          return (
            <div key={i} className="bg-[#070a0e] border border-[#1e2d3d] rounded-xl px-4 py-3">
              <p className="text-lg text-[#dde6ef] font-serif leading-relaxed"><Md text={clean} /></p>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((sec, i) => (
        <div key={i} className="bg-[#070a0e] border border-[#1e2d3d] rounded-xl p-4">
          <p className="font-bold text-[#dde6ef] text-sm mb-2"><Md text={sec.name} /></p>
          {sec.fields.map((f, j) => {
            const [label, ...val] = f.split(':');
            return (
              <div key={j} className="flex gap-2 text-xs mb-1">
                {val.length > 0 ? (
                  <>
                    <span className="font-mono text-[#3d5870] flex-shrink-0">{label}:</span>
                    <span className="text-[#dde6ef] font-serif">{val.join(':').trim()}</span>
                  </>
                ) : (
                  <span className="text-[#7a95aa] font-serif">{f}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Protocolo estructurado (JSON) ────────────────────────────────────────────

interface ProtocolItem {
  tipo?: string;
  nombre_generico: string;
  nombre_comercial?: string;
  nivel_evidencia?: string;
  alerta?: string;
  presentacion?: string;
  dosis?: string;
  via?: string;
  frecuencia?: string;
  duracion?: string;
  indicacion?: string;
  ajuste_especial?: string;
  monitoreo?: string;
  reacciones_adversas?: string;
  interacciones?: string;
  mecanismo?: string;
}

interface ProtocolData {
  items: ProtocolItem[];
  monitoreo_general?: {
    proxima_revision?: string;
    labs_control?: string;
    criterios_exito?: string;
    senales_alarma?: string;
    nota_doctor?: string;
  };
}

function parseProtocolJson(text: string): ProtocolData | null {
  if (!text) return null;
  let raw = text.trim();
  const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) {
    raw = fence[1].trim();
  } else {
    // Respuesta truncada (sin ``` de cierre, p.ej. por límite de tokens) — quita solo la apertura
    const openFence = raw.match(/^```(?:json)?\s*([\s\S]*)$/);
    if (openFence) raw = openFence[1].trim();
  }
  const start = raw.indexOf('{');
  if (start === -1) return null;
  raw = raw.slice(start);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) return parsed as ProtocolData;
    return null;
  } catch {
    // JSON truncado a mitad de un item — recupera los items completos que sí cerraron
    const itemsMatch = raw.match(/"items"\s*:\s*\[/);
    if (!itemsMatch) return null;
    const arrStart = itemsMatch.index! + itemsMatch[0].length;
    const items: ProtocolItem[] = [];
    let depth = 0, objStart = -1;
    for (let i = arrStart; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '{') { if (depth === 0) objStart = i; depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0 && objStart !== -1) {
          try { items.push(JSON.parse(raw.slice(objStart, i + 1))); } catch { /* item incompleto, se descarta */ }
          objStart = -1;
        }
      }
    }
    return items.length > 0 ? { items } : null;
  }
}

function ProtocolItemCard({ item, color, selected, onToggle }: {
  item: ProtocolItem; color: string; selected?: boolean; onToggle?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasAlert = !!(item.alerta && item.alerta.trim());
  const hasDosis = !!(item.presentacion || item.dosis || item.frecuencia);
  const hasExtra = !!(item.reacciones_adversas || item.interacciones || item.mecanismo);
  const selectable = typeof onToggle === 'function';

  return (
    <div className="rounded-xl overflow-hidden border transition"
      style={{
        borderColor: hasAlert ? 'rgba(244,63,94,.35)' : '#1e2d3d',
        opacity: selectable && !selected ? 0.45 : 1,
      }}>
      {/* Franja de alerta — siempre presente, cambia de estilo según haya o no riesgo */}
      <div className="px-4 py-2 text-base font-semibold flex items-start gap-2"
        style={{
          background: hasAlert ? 'rgba(244,63,94,.12)' : 'rgba(0,229,160,.08)',
          color: hasAlert ? '#f43f5e' : '#00e5a0',
        }}>
        <span className="flex-shrink-0">{hasAlert ? '⚠' : '✓'}</span>
        <span className="leading-snug">{hasAlert ? item.alerta : 'Sin contraindicaciones absolutas reportadas'}</span>
      </div>

      <div className="bg-[#0d1520] p-4 space-y-4">
        {/* Identificación */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <label className={`flex items-start gap-3 ${selectable ? 'cursor-pointer' : ''}`}>
            {selectable && (
              <input type="checkbox" checked={!!selected} onChange={onToggle}
                className="w-5 h-5 mt-1 accent-[#00e5a0] flex-shrink-0" />
            )}
            <div>
              <p className="text-lg font-bold leading-snug" style={{ color }}>{item.nombre_generico}</p>
              {item.nombre_comercial && <p className="text-base text-[#7a95aa]">{item.nombre_comercial}</p>}
              {item.tipo && (
                <span className="inline-block mt-1.5 text-xs font-mono px-2 py-0.5 rounded-full"
                  style={{ color, background: `${color}15`, border: `1px solid ${color}40` }}>
                  {item.tipo}
                </span>
              )}
            </div>
          </label>
          {item.nivel_evidencia && (
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] font-mono text-[#3d5870]">EVIDENCIA</p>
              <p className="text-xs text-[#dde6ef] font-semibold max-w-[180px]">{item.nivel_evidencia}</p>
            </div>
          )}
        </div>

        {/* Dosis y administración */}
        {hasDosis && (
          <div className="bg-[#070a0e] border border-[#1e2d3d] rounded-lg p-3 space-y-1.5 text-sm">
            {item.presentacion && (
              <p><span className="text-[#3d5870] font-mono text-xs">Presentación: </span><span className="text-[#dde6ef]">{item.presentacion}</span></p>
            )}
            {(item.dosis || item.via) && (
              <p><span className="text-[#3d5870] font-mono text-xs">Dosis: </span><span className="text-[#dde6ef]">{item.dosis}{item.via ? ` — ${item.via}` : ''}</span></p>
            )}
            {(item.frecuencia || item.duracion) && (
              <p><span className="text-[#3d5870] font-mono text-xs">Frecuencia: </span><span className="text-[#dde6ef]">{item.frecuencia}{item.duracion ? ` · Duración: ${item.duracion}` : ''}</span></p>
            )}
          </div>
        )}

        {/* Indicación */}
        {item.indicacion && (
          <div>
            <p className="text-[10px] font-mono text-[#3d5870] mb-1">INDICACIÓN</p>
            <p className="text-lg text-[#dde6ef] font-serif leading-relaxed">{item.indicacion}</p>
            {item.ajuste_especial && (
              <p className="text-xs text-[#7a95aa] italic mt-1.5 bg-[#070a0e] border border-[#1e2d3d] rounded-md px-2.5 py-1.5">
                {item.ajuste_especial}
              </p>
            )}
          </div>
        )}

        {/* Monitorización */}
        {item.monitoreo && (
          <div>
            <p className="text-[10px] font-mono text-[#3d5870] mb-1">MONITORIZACIÓN REQUERIDA</p>
            <p className="text-lg text-[#dde6ef] font-serif leading-relaxed">{item.monitoreo}</p>
          </div>
        )}

        {/* Acordeón — plegado por defecto */}
        {hasExtra && (
          <div className="border-t border-[#1e2d3d] pt-3">
            <button onClick={() => setOpen(o => !o)}
              className="text-xs font-mono text-[#7a95aa] hover:text-[#dde6ef] transition flex items-center gap-1.5">
              <span>{open ? '▲' : '▼'}</span> Más detalle — reacciones, interacciones, mecanismo
            </button>
            {open && (
              <div className="mt-3 space-y-2.5 text-xs text-[#7a95aa] font-serif leading-relaxed">
                {item.reacciones_adversas && (
                  <p><span className="text-[#dde6ef] font-semibold">Reacciones adversas frecuentes: </span>{item.reacciones_adversas}</p>
                )}
                {item.interacciones && (
                  <p><span className="text-[#dde6ef] font-semibold">Interacciones: </span>{item.interacciones}</p>
                )}
                {item.mecanismo && (
                  <p><span className="text-[#dde6ef] font-semibold">Mecanismo de acción: </span>{item.mecanismo}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const PROTOCOL_GROUPS: { label: string; match: (tipo: string) => boolean }[] = [
  { label: 'FÁRMACOS', match: t => /f[aá]rmaco|medicament|off-?label/i.test(t) },
  { label: 'SUPLEMENTOS Y VITAMINAS', match: t => /suplement|vitamina/i.test(t) },
  { label: 'ESTILO DE VIDA Y EJERCICIO', match: t => /estilo de vida|ejercicio|h[aá]bito/i.test(t) },
];

function groupProtocolItems(items: ProtocolItem[]): { label: string; indices: number[] }[] {
  const groups = PROTOCOL_GROUPS.map(g => ({ label: g.label, indices: [] as number[] }));
  const other: number[] = [];
  items.forEach((item, i) => {
    const tipo = item.tipo || '';
    const g = PROTOCOL_GROUPS.findIndex(g => g.match(tipo));
    if (g !== -1) groups[g].indices.push(i); else other.push(i);
  });
  if (other.length) groups.push({ label: 'OTROS', indices: other });
  return groups.filter(g => g.indices.length > 0);
}

function ProtocolStructuredView({ data, color, approved, onToggle, onAddItem }: {
  data: ProtocolData; color: string;
  approved?: boolean[]; onToggle?: (i: number) => void; onAddItem?: (item: ProtocolItem) => void;
}) {
  const mg = data.monitoreo_general;
  const hasGeneral = !!(mg && (mg.proxima_revision || mg.labs_control || mg.criterios_exito || mg.senales_alarma));
  const groups = groupProtocolItems(data.items);
  const [addingOwn, setAddingOwn] = useState(false);
  const [ownItem, setOwnItem] = useState<ProtocolItem>({ nombre_generico: '' });

  const submitOwn = () => {
    if (!ownItem.nombre_generico.trim() || !onAddItem) return;
    onAddItem(ownItem);
    setOwnItem({ nombre_generico: '' });
    setAddingOwn(false);
  };

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <div key={g.label}>
          <p className="text-xs font-mono text-[#3d5870] mb-2 tracking-widest">{g.label}</p>
          <div className="space-y-4">
            {g.indices.map(i => (
              <ProtocolItemCard key={i} item={data.items[i]} color={color}
                selected={approved ? approved[i] !== false : undefined}
                onToggle={onToggle ? () => onToggle(i) : undefined} />
            ))}
          </div>
        </div>
      ))}

      {onAddItem && (
        addingOwn ? (
          <ProtocolItemForm item={ownItem}
            onChange={(field, value) => setOwnItem(prev => ({ ...prev, [field]: value }))}
            onRemove={() => setAddingOwn(false)} />
        ) : (
          <button type="button" onClick={() => setAddingOwn(true)}
            className="text-[#00e5a0] border border-[#00e5a0]/30 rounded-xl hover:bg-[#00e5a0]/10 transition font-semibold px-4 py-2 text-base">
            + Agregar medicamento / suplemento / intervención propia
          </button>
        )
      )}
      {addingOwn && (
        <button type="button" onClick={submitOwn}
          className="px-4 py-2 bg-[#00e5a0] text-black text-sm font-bold rounded-lg hover:opacity-90 transition -mt-3">
          ✓ Agregar a la lista
        </button>
      )}

      {hasGeneral && (
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-4">
          <p className="text-xs font-mono text-[#3d5870] mb-3">SEGUIMIENTO GENERAL DEL PROTOCOLO</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {mg!.proxima_revision && (
              <div><p className="text-[10px] font-mono text-[#3d5870]">PRÓXIMA REVISIÓN</p><p className="text-[#dde6ef]">{mg!.proxima_revision}</p></div>
            )}
            {mg!.labs_control && (
              <div><p className="text-[10px] font-mono text-[#3d5870]">LABORATORIOS DE CONTROL</p><p className="text-[#dde6ef]">{mg!.labs_control}</p></div>
            )}
            {mg!.criterios_exito && (
              <div><p className="text-[10px] font-mono text-[#3d5870]">CRITERIOS DE ÉXITO</p><p className="text-[#dde6ef]">{mg!.criterios_exito}</p></div>
            )}
            {mg!.senales_alarma && (
              <div><p className="text-[10px] font-mono text-[#f43f5e]">SEÑALES DE ALARMA</p><p className="text-[#dde6ef]">{mg!.senales_alarma}</p></div>
            )}
            {mg!.nota_doctor && (
              <div className="md:col-span-2"><p className="text-[10px] font-mono text-[#00e5a0]">NOTA DEL DOCTOR</p><p className="text-[#dde6ef]">{mg!.nota_doctor}</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edición estructurada del protocolo ───────────────────────────────────────

const PROTOCOL_FIELD_DEFS: { key: keyof ProtocolItem; label: string; placeholder: string; textarea?: boolean }[] = [
  { key: 'tipo',                label: 'TIPO',                              placeholder: 'Fármaco, Suplemento, Off-label, Ejercicio...' },
  { key: 'nombre_generico',     label: 'NOMBRE GENÉRICO / PRINCIPIO ACTIVO', placeholder: 'Ej. Metformina' },
  { key: 'nombre_comercial',    label: 'NOMBRE COMERCIAL (si aplica)',       placeholder: 'Ej. Glucophage' },
  { key: 'presentacion',        label: 'PRESENTACIÓN',                      placeholder: 'Ej. 500 mg' },
  { key: 'dosis',               label: 'DOSIS',                             placeholder: 'Ej. 1 tableta' },
  { key: 'via',                 label: 'VÍA DE ADMINISTRACIÓN',             placeholder: 'Oral, IV, Tópico...' },
  { key: 'frecuencia',          label: 'FRECUENCIA',                        placeholder: 'Ej. Cada 12 horas' },
  { key: 'duracion',            label: 'DURACIÓN',                          placeholder: 'Ej. 4 semanas, Indefinido' },
  { key: 'nivel_evidencia',     label: 'NIVEL DE EVIDENCIA',                placeholder: 'Ej. Clase I, Nivel A' },
  { key: 'indicacion',          label: 'INDICACIÓN EN ESTE PACIENTE',       placeholder: 'Para qué se lo das', textarea: true },
  { key: 'alerta',              label: 'ALERTA / CONTRAINDICACIÓN',         placeholder: 'Dejar vacío si no hay', textarea: true },
  { key: 'ajuste_especial',     label: 'AJUSTE RENAL / HEPÁTICO',           placeholder: 'Dejar vacío si no aplica', textarea: true },
  { key: 'monitoreo',           label: 'MONITORIZACIÓN REQUERIDA',          placeholder: 'Qué vigilar y cuándo', textarea: true },
  { key: 'reacciones_adversas', label: 'REACCIONES ADVERSAS',               placeholder: 'Opcional', textarea: true },
  { key: 'interacciones',       label: 'INTERACCIONES',                     placeholder: 'Opcional', textarea: true },
  { key: 'mecanismo',           label: 'MECANISMO DE ACCIÓN',               placeholder: 'Opcional', textarea: true },
];

function ProtocolItemForm({ item, onChange, onRemove }: {
  item: ProtocolItem; onChange: (field: keyof ProtocolItem, value: string) => void; onRemove: () => void;
}) {
  return (
    <div className="bg-[#070a0e] border border-[#00e5a0]/20 rounded-xl p-4 space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs font-mono text-[#00e5a0]">Llena solo lo que quieras — nada es obligatorio</p>
        <button type="button" onClick={onRemove} className="text-[#3d5870] hover:text-[#f43f5e] transition text-sm">✕ Quitar</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PROTOCOL_FIELD_DEFS.map(({ key, label, placeholder, textarea }) => (
          <div key={key} className={textarea ? 'md:col-span-2' : ''}>
            <label className="text-[10px] font-mono text-[#3d5870] mb-1 block">{label}</label>
            {textarea ? (
              <textarea rows={2} value={(item[key] as string) || ''} onChange={e => onChange(key, e.target.value)}
                placeholder={placeholder}
                className="w-full bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-2 text-lg text-[#dde6ef] outline-none focus:border-[#00e5a0] resize-none" />
            ) : (
              <input value={(item[key] as string) || ''} onChange={e => onChange(key, e.target.value)}
                placeholder={placeholder}
                className="w-full bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-2 text-lg text-[#dde6ef] outline-none focus:border-[#00e5a0]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProtocolEditMode({ data, onSave, onCancel }: {
  data: ProtocolData; onSave: (text: string) => void; onCancel: () => void;
}) {
  const [keep, setKeep] = useState<boolean[]>(data.items.map(() => true));
  const [ownItems, setOwnItems] = useState<ProtocolItem[]>([]);

  const toggleKeep = (i: number) => setKeep(prev => prev.map((v, j) => j === i ? !v : v));
  const addOwnItem = () => setOwnItems(prev => [...prev, { nombre_generico: '' }]);
  const updateOwnItem = (i: number, field: keyof ProtocolItem, value: string) =>
    setOwnItems(prev => prev.map((it, j) => j === i ? { ...it, [field]: value } : it));
  const removeOwnItem = (i: number) => setOwnItems(prev => prev.filter((_, j) => j !== i));

  const handleSave = () => {
    const kept = data.items.filter((_, i) => keep[i]);
    const cleanOwn = ownItems.filter(it => it.nombre_generico && it.nombre_generico.trim());
    const finalData: ProtocolData = { items: [...kept, ...cleanOwn], monitoreo_general: data.monitoreo_general };
    onSave(JSON.stringify(finalData));
  };

  return (
    <div className="bg-[#0d1520] border rounded-xl p-5 mb-5" style={{ borderColor: '#f97316' }}>
      <p className="text-xs font-mono text-[#f97316] mb-4">EDITANDO PROTOCOLO — acepta, rechaza o agrega intervenciones</p>

      {data.items.length > 0 && (
        <div className="space-y-2 mb-5">
          <p className="text-[10px] font-mono text-[#3d5870] mb-1">SUGERIDOS POR LA IA — desmarca lo que no quieras incluir</p>
          {data.items.map((item, i) => (
            <label key={i} className="flex items-start gap-3 bg-[#070a0e] border border-[#1e2d3d] rounded-lg px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={keep[i]} onChange={() => toggleKeep(i)}
                className="w-4 h-4 mt-0.5 accent-[#00e5a0] flex-shrink-0" />
              <div className={keep[i] ? '' : 'opacity-40 line-through'}>
                <p className="text-sm font-semibold text-[#dde6ef]">
                  {item.nombre_generico}{item.nombre_comercial ? ` (${item.nombre_comercial})` : ''}
                </p>
                <p className="text-xs text-[#7a95aa]">
                  {[item.presentacion, item.dosis, item.frecuencia].filter(Boolean).join(' · ')}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}

      {ownItems.length > 0 && (
        <div className="space-y-4 mb-5">
          <p className="text-[10px] font-mono text-[#00e5a0] mb-1">TUS INTERVENCIONES AGREGADAS</p>
          {ownItems.map((item, i) => (
            <ProtocolItemForm key={i} item={item}
              onChange={(field, value) => updateOwnItem(i, field, value)}
              onRemove={() => removeOwnItem(i)} />
          ))}
        </div>
      )}

      <button type="button" onClick={addOwnItem}
        className="text-[#00e5a0] border border-[#00e5a0]/30 rounded-xl hover:bg-[#00e5a0]/10 transition font-semibold px-4 py-2 text-xs mb-5">
        + Agregar medicamento / suplemento / intervención propia
      </button>

      <div className="flex gap-3">
        <button onClick={handleSave}
          className="px-4 py-2 bg-[#f97316] text-black text-sm font-semibold rounded-lg hover:bg-[#f97316]/90 transition">
          ✓ Guardar edición
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 border border-[#1e2d3d] text-[#7a95aa] text-sm rounded-lg hover:border-[#7a95aa] transition">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Diagnosis Candidates — JSON estructurado (medicina convencional) ──────────

interface DiagnosisCandidate {
  nombre: string;
  cie10?: string;
  confianza?: number;
  por_que_confianza?: string;
  resumen_breve?: string;
  explicacion_completa?: string;
  fuentes?: string[];
  estudios_sugeridos?: string[];
  // Estado del doctor — no viene de la IA, se inyecta al normalizar la respuesta
  dx_aceptado?: boolean;
  estudios_seleccionados?: boolean[];
  estudios_doctor?: string[];
  estudios_finalizados?: boolean;
}

interface DiagnosisListData {
  diagnosticos: DiagnosisCandidate[];
  alertas_clinicas?: string[];
  estudios_adicionales?: string[];     // estudios sin diagnóstico específico asociado
}

function parseDiagnosisJson(text: string): DiagnosisListData | null {
  if (!text) return null;
  let raw = text.trim();
  const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) {
    raw = fence[1].trim();
  } else {
    const openFence = raw.match(/^```(?:json)?\s*([\s\S]*)$/);
    if (openFence) raw = openFence[1].trim();
  }
  const start = raw.indexOf('{');
  if (start === -1) return null;
  raw = raw.slice(start);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.diagnosticos) && parsed.diagnosticos.length > 0)
      return parsed as DiagnosisListData;
    return null;
  } catch {
    // JSON truncado — recupera los candidatos que sí cerraron completos
    const arrMatch = raw.match(/"diagnosticos"\s*:\s*\[/);
    if (!arrMatch) return null;
    const arrStart = arrMatch.index! + arrMatch[0].length;
    const diagnosticos: DiagnosisCandidate[] = [];
    let depth = 0, objStart = -1;
    for (let i = arrStart; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '{') { if (depth === 0) objStart = i; depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0 && objStart !== -1) {
          try { diagnosticos.push(JSON.parse(raw.slice(objStart, i + 1))); } catch { /* incompleto */ }
          objStart = -1;
        }
      }
    }
    return diagnosticos.length > 0 ? { diagnosticos } : null;
  }
}

/** Inyecta valores por defecto de estado del doctor sin pisar los que ya existan. */
function withDxDefaults(data: DiagnosisListData): DiagnosisListData {
  return {
    ...data,
    diagnosticos: data.diagnosticos.map((d) => ({
      ...d,
      dx_aceptado: d.dx_aceptado ?? false,
      estudios_seleccionados: d.estudios_seleccionados
        ?? (d.estudios_sugeridos || []).map(() => false),
      estudios_doctor: d.estudios_doctor ?? [],
      estudios_finalizados: d.estudios_finalizados ?? false,
    })),
    estudios_adicionales: data.estudios_adicionales ?? [],
  };
}

function DiagnosisCandidateCard({ item, color, onAcceptDx, onAcceptStudies, onAcceptBoth, onToggleStudy, onAddStudy, onEditStudy, onRemoveStudy }: {
  item: DiagnosisCandidate; color: string;
  onAcceptDx: () => void;
  onAcceptStudies: () => void;
  onAcceptBoth: () => void;
  onToggleStudy: (studyIdx: number) => void;
  onAddStudy: (study: string) => void;
  onEditStudy: (idx: number, val: string) => void;
  onRemoveStudy: (idx: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pctOpen, setPctOpen] = useState(false);
  const [studyInput, setStudyInput] = useState('');
  const [editingStudyIdx, setEditingStudyIdx] = useState<number | null>(null);
  const [editStudyVal, setEditStudyVal] = useState('');

  const dxAceptado = !!item.dx_aceptado;
  const estudiosFinalizados = !!item.estudios_finalizados;
  const pctColor = item.confianza == null ? '#7a95aa'
    : item.confianza >= 75 ? color
    : item.confianza >= 50 ? '#f59e0b'
    : '#7a95aa';
  const sugeridos = item.estudios_sugeridos || [];
  const seleccionados = item.estudios_seleccionados || sugeridos.map(() => false);
  const doctorStudies = item.estudios_doctor || [];

  const commitStudy = () => {
    if (!studyInput.trim()) return;
    onAddStudy(studyInput.trim());
    setStudyInput('');
  };

  const startEditStudy = (idx: number) => {
    setEditingStudyIdx(idx);
    setEditStudyVal(doctorStudies[idx]);
  };

  const saveEditStudy = (idx: number, onEdit: (idx: number, val: string) => void) => {
    if (editStudyVal.trim()) onEdit(idx, editStudyVal.trim());
    setEditingStudyIdx(null);
  };

  return (
    <div className="rounded-xl overflow-hidden transition"
      style={dxAceptado
        ? { background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.4)' }
        : { background: '#070a0e', border: '1px solid #1e2d3d' }}>

      {/* ── Bloque 1: Diagnóstico ── */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="font-bold text-base leading-snug" style={{ color: dxAceptado ? '#f59e0b' : '#dde6ef' }}>
            {dxAceptado ? '⭐ ' : ''}<Md text={item.nombre} />
            {item.cie10 && (
              <span className="text-xs font-mono text-[#3d5870] font-normal ml-1.5">({item.cie10})</span>
            )}
          </span>
          {item.confianza != null && (
            <div className="relative flex-shrink-0">
              <button type="button" onClick={() => setPctOpen(o => !o)}
                className="text-xs font-mono font-bold px-2 py-1 rounded flex items-center gap-1 transition hover:opacity-80"
                style={{ color: pctColor, background: `${pctColor}15`, border: `1px solid ${pctColor}40` }}>
                {item.confianza}% <span className="text-[10px] opacity-60">?</span>
              </button>
              {pctOpen && (
                <div className="absolute right-0 top-8 z-20 w-72 rounded-xl p-3 shadow-2xl"
                  style={{ background: '#0d1520', border: `1px solid ${pctColor}50` }}>
                  <p className="font-mono text-[10px] mb-1.5" style={{ color: pctColor }}>POR QUÉ {item.confianza}%</p>
                  <p className="text-xs font-serif leading-relaxed text-[#dde6ef]">
                    {item.por_que_confianza || 'Basado en los hallazgos disponibles en el expediente.'}
                  </p>
                  <button type="button" onClick={() => setPctOpen(false)}
                    className="mt-2 text-[10px] font-mono text-[#3d5870] hover:text-[#7a95aa]">cerrar ✕</button>
                </div>
              )}
            </div>
          )}
        </div>

        {item.resumen_breve && (
          <p className="text-[15px] text-[#dde6ef] leading-relaxed font-serif mb-2.5">{item.resumen_breve}</p>
        )}

        {item.explicacion_completa && (
          <div>
            <button type="button" onClick={() => setExpanded(o => !o)}
              className="text-xs font-mono text-[#7a95aa] hover:text-[#dde6ef] transition flex items-center gap-1.5">
              <span>{expanded ? '▲' : '▼'}</span>
              {expanded ? 'Ocultar explicación y fuentes' : 'Ver explicación completa y fuentes'}
            </button>
            {expanded && (
              <div className="mt-2.5 space-y-2.5">
                <p className="text-sm text-[#7a95aa] font-serif leading-relaxed">{item.explicacion_completa}</p>
                {item.fuentes && item.fuentes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {item.fuentes.map((f, fi) => (
                      <span key={fi} className="text-[10px] font-mono px-2 py-1 rounded-full"
                        style={{ color, background: `${color}12`, border: `1px solid ${color}35` }}>
                        📖 {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bloque 2: Estudios sugeridos ── */}
      {(sugeridos.length > 0 || doctorStudies.length > 0) && (
        <div className="border-t border-[#1e2d3d] bg-[#050810] p-4 space-y-3">
          <p className="text-xs font-mono text-[#0ea5e9] font-bold">🔬 ESTUDIOS SUGERIDOS</p>

          {/* Estudios de la IA — uno por uno con checkbox */}
          {sugeridos.length > 0 && (
            <div className="space-y-2">
              {sugeridos.map((s, si) => {
                const sel = seleccionados[si] ?? false;
                return (
                  <label key={si}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition"
                    style={{ background: sel ? 'rgba(14,165,233,.1)' : '#0d1520', border: `1px solid ${sel ? 'rgba(14,165,233,.35)' : '#1e2d3d'}` }}>
                    <input type="checkbox" checked={sel} onChange={() => onToggleStudy(si)}
                      className="mt-0.5 w-4 h-4 flex-shrink-0 rounded accent-[#0ea5e9]" />
                    <span className="text-sm text-[#dde6ef] font-serif leading-relaxed">{s}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Estudios que el doctor ya agregó — editables */}
          {doctorStudies.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono text-[#3d5870]">ESTUDIOS QUE AGREGASTE</p>
              {doctorStudies.map((s, si) => (
                <div key={si} className="flex items-center gap-2 px-3 py-2 rounded-lg group"
                  style={{ background: 'rgba(0,229,160,.07)', border: '1px solid rgba(0,229,160,.25)' }}>
                  {editingStudyIdx === si ? (
                    <>
                      <input autoFocus value={editStudyVal} onChange={e => setEditStudyVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEditStudy(si, onEditStudy); if (e.key === 'Escape') setEditingStudyIdx(null); }}
                        className="flex-1 bg-transparent text-sm text-[#dde6ef] outline-none border-b border-[#00e5a0]/40" />
                      <button type="button" onClick={() => saveEditStudy(si, onEditStudy)}
                        className="text-[10px] font-mono text-[#00e5a0] hover:opacity-70 px-1">guardar</button>
                      <button type="button" onClick={() => setEditingStudyIdx(null)}
                        className="text-[10px] font-mono text-[#3d5870] hover:opacity-70 px-1">✕</button>
                    </>
                  ) : (
                    <>
                      <span className="text-[#00e5a0] text-xs flex-shrink-0">✓</span>
                      <span className="text-sm text-[#dde6ef] font-serif leading-relaxed flex-1">{s}</span>
                      <button type="button" onClick={() => startEditStudy(si)}
                        className="text-[10px] text-[#3d5870] hover:text-[#0ea5e9] opacity-0 group-hover:opacity-100 transition px-1">✎</button>
                      <button type="button" onClick={() => onRemoveStudy(si)}
                        className="text-[10px] text-[#3d5870] hover:text-[#f43f5e] opacity-0 group-hover:opacity-100 transition px-1">✕</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Ingresar estudio adicional */}
          <div className="pt-1 border-t border-[#1e2d3d]">
            <p className="text-[10px] font-mono text-[#3d5870] mb-2">INGRESAR ESTUDIO ADICIONAL</p>
            <div className="flex gap-2">
              <input
                value={studyInput}
                onChange={e => setStudyInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitStudy(); }}
                placeholder="Escribe el nombre del estudio…"
                className="flex-1 bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-2 text-sm text-[#dde6ef] outline-none focus:border-[#0ea5e9] placeholder-[#3d5870] transition" />
              {studyInput.trim() && (
                <button type="button" onClick={commitStudy}
                  className="text-xs font-mono px-3 py-2 rounded-lg border border-[rgba(14,165,233,.4)] text-[#0ea5e9] hover:bg-[rgba(14,165,233,.1)] transition whitespace-nowrap">
                  Ingresar otro estudio
                </button>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ── Bloque 3: Botones de aceptación ── */}
      <div className="border-t border-[#1e2d3d] bg-[#050810] px-4 py-3 space-y-2">
        {/* Secundarios */}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onAcceptDx}
            className="text-xs font-mono px-3 py-1.5 rounded-lg border transition"
            style={dxAceptado && !estudiosFinalizados
              ? { color: '#f59e0b', borderColor: 'rgba(245,158,11,.5)', background: 'rgba(245,158,11,.1)' }
              : { color: '#7a95aa', borderColor: '#1e2d3d', background: 'transparent' }}>
            Aceptar solo diagnóstico
          </button>
          <button type="button" onClick={onAcceptStudies}
            className="text-xs font-mono px-3 py-1.5 rounded-lg border transition"
            style={estudiosFinalizados && !dxAceptado
              ? { color: '#0ea5e9', borderColor: 'rgba(14,165,233,.5)', background: 'rgba(14,165,233,.1)' }
              : { color: '#7a95aa', borderColor: '#1e2d3d', background: 'transparent' }}>
            Aceptar solo estudios
          </button>
        </div>
        {/* Primario */}
        <button type="button" onClick={onAcceptBoth}
          className="w-full py-3 rounded-xl font-bold text-sm transition"
          style={dxAceptado && estudiosFinalizados
            ? { background: 'rgba(245,158,11,.2)', border: '2px solid rgba(245,158,11,.7)', color: '#f59e0b' }
            : { background: color + '18', border: `2px solid ${color}60`, color }}>
          {dxAceptado && estudiosFinalizados
            ? '⭐ Diagnóstico y estudios aceptados'
            : 'Aceptar Diagnóstico y Estudios'}
        </button>
      </div>
    </div>
  );
}

function DiagnosisStructuredView({ data, color, onAcceptDx, onAcceptStudies, onAcceptBoth, onToggleStudy, onAddStudy, onEditStudy, onRemoveStudy, onAddNew, onAddExtraStudies }: {
  data: DiagnosisListData; color: string;
  onAcceptDx: (i: number) => void;
  onAcceptStudies: (i: number) => void;
  onAcceptBoth: (i: number) => void;
  onToggleStudy: (i: number, si: number) => void;
  onAddStudy: (i: number, study: string) => void;
  onEditStudy: (i: number, si: number, val: string) => void;
  onRemoveStudy: (i: number, si: number) => void;
  onAddNew: (input: { nombre: string; pct: string; detalle: string; estudio: string }) => void;
  onAddExtraStudies: (study: string) => void;
}) {
  const alertas = (data.alertas_clinicas || []).filter(a => a && a.trim());
  const extraStudies = data.estudios_adicionales || [];
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraInput, setExtraInput] = useState('');

  const commitExtra = () => {
    if (!extraInput.trim()) return;
    onAddExtraStudies(extraInput.trim());
    setExtraInput('');
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#7a95aa] font-serif italic">
        Diagnósticos posibles, del más al menos probable según la IA. Pueden coexistir más de uno — acepta el o los que consideres correctos.
      </p>

      {alertas.length > 0 && (
        <div className="rounded-xl p-3.5 space-y-1.5"
          style={{ background: 'rgba(244,63,94,.08)', border: '1px solid rgba(244,63,94,.3)' }}>
          <p className="text-xs font-mono font-bold mb-1" style={{ color: '#f43f5e' }}>⚠ ALERTAS CLÍNICAS</p>
          {alertas.map((a, ai) => (
            <p key={ai} className="text-sm text-[#dde6ef] font-serif leading-relaxed">• {a}</p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {data.diagnosticos.map((item, i) => (
          <DiagnosisCandidateCard key={i} item={item} color={color}
            onAcceptDx={() => onAcceptDx(i)}
            onAcceptStudies={() => onAcceptStudies(i)}
            onAcceptBoth={() => onAcceptBoth(i)}
            onToggleStudy={si => onToggleStudy(i, si)}
            onAddStudy={study => onAddStudy(i, study)}
            onEditStudy={(si, val) => onEditStudy(i, si, val)}
            onRemoveStudy={si => onRemoveStudy(i, si)} />
        ))}
      </div>

      {/* + Agregar Estudios (sin diagnóstico) */}
      {!extraOpen && extraStudies.length === 0 ? (
        <button type="button" onClick={() => setExtraOpen(true)}
          className="w-full py-3 rounded-xl font-semibold text-sm border-2 border-dashed transition hover:border-[#7a95aa] hover:text-[#7a95aa]"
          style={{ borderColor: '#1e2d3d', color: '#3d5870', background: 'transparent' }}>
          + Agregar Estudios
        </button>
      ) : (
        <div className="rounded-xl border-2 border-dashed p-4 space-y-3"
          style={{ borderColor: '#1e2d3d', background: '#050810' }}>
          <p className="text-xs font-mono text-[#3d5870]">ESTUDIOS ADICIONALES SIN DIAGNÓSTICO</p>
          {extraStudies.length > 0 && (
            <div className="space-y-1.5">
              {extraStudies.map((s, si) => (
                <div key={si} className="flex items-center gap-2 text-xs text-[#7a95aa] font-mono group">
                  <span className="text-[#3d5870]">•</span>
                  <span className="flex-1">{s}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input autoFocus={extraOpen} value={extraInput} onChange={e => setExtraInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitExtra(); if (e.key === 'Escape') setExtraOpen(false); }}
              placeholder="Estudio que quieres pedir sin diagnóstico específico…"
              className="flex-1 bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-2 text-sm text-[#dde6ef] outline-none focus:border-[#7a95aa] placeholder-[#3d5870] transition" />
            {extraInput.trim() && (
              <button type="button" onClick={commitExtra}
                className="text-xs font-mono px-3 py-2 rounded-lg border border-[#1e2d3d] text-[#7a95aa] hover:border-[#7a95aa] transition whitespace-nowrap">
                + Agregar
              </button>
            )}
          </div>
          {!extraStudies.length && (
            <button type="button" onClick={() => setExtraOpen(false)}
              className="text-[10px] font-mono text-[#3d5870] hover:text-[#7a95aa]">cancelar</button>
          )}
        </div>
      )}

      {/* + Agregar Mi Diagnóstico */}
      <AddDiagnosisForm onAdd={onAddNew} color={color} big />
    </div>
  );
}

function DefaultBlock({ body }: { body: string }) {
  const lines = body.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-1" />;
        const isBullet = /^[•\-\*]/.test(t);
        const clean = t.replace(/^[•\-\*]\s*/, '');
        if (isBullet) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[#3d5870] flex-shrink-0 mt-1 text-xs">•</span>
              <p className="text-lg text-[#dde6ef] font-serif leading-relaxed"><Md text={clean} /></p>
            </div>
          );
        }
        return (
          <p key={i} className="text-lg text-[#dde6ef] font-serif leading-relaxed">
            <Md text={t} />
          </p>
        );
      })}
    </div>
  );
}

function StudiesBlock({ body, color, onToggleSelect }: {
  body: string; color: string; onToggleSelect?: (rawLine: string) => void;
}) {
  const lines = body.split('\n').filter(l => l.trim());
  if (!lines.length) return <DefaultBlock body={body} />;
  return (
    <div>
      <p className="text-sm text-[#7a95aa] font-serif mb-3 italic">
        {onToggleSelect ? 'Marca los estudios que quieres solicitar — el resto no se incluirá.' : 'Estudios sugeridos:'}
      </p>
      <div className="flex flex-col gap-2">
        {lines.map((raw, i) => {
          const t = raw.trim();
          const bulletMatch = t.match(/^([•\-\*]\s*)(.+)$/);
          const numMatch = t.match(/^(\d+\.\s*)(.+)$/);
          const rest = bulletMatch ? bulletMatch[2] : numMatch ? numMatch[2] : t;
          const selected = rest.trim().startsWith(DX_MARK);
          const clean = selected ? rest.trim().slice(DX_MARK.length) : rest.trim();
          return (
            <label key={i} className={`flex items-start gap-3 bg-[#070a0e] border rounded-lg px-3 py-2.5 ${onToggleSelect ? 'cursor-pointer' : ''}`}
              style={{ borderColor: selected ? `${color}60` : '#1e2d3d', background: selected ? `${color}10` : '#070a0e' }}>
              {onToggleSelect && (
                <input type="checkbox" checked={selected} onChange={() => onToggleSelect(t)}
                  className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ accentColor: color }} />
              )}
              <p className="text-base text-[#dde6ef] font-serif leading-relaxed"><Md text={clean} /></p>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section Dispatcher ───────────────────────────────────────────────────────
function SectionContent({ title, body, color, onToggleSelect }: {
  title: string; body: string; color: string; onToggleSelect?: (rawLine: string) => void;
}) {
  const t = title.toUpperCase();
  if (t.includes('DIAGNÓSTICOS POSIBLES')) {
    return <RankedDiagnosesBlock body={body} color={color} onToggleSelect={onToggleSelect} />;
  }
  if (t.includes('ESTUDIO')) {
    return <StudiesBlock body={body} color={color} onToggleSelect={onToggleSelect} />;
  }
  if (t.includes('DIAGNÓSTICO PRINCIPAL') || t.includes('RAÍZ DEL PROBLEMA') || t.includes('EDAD BIOLÓGICA')) {
    return <MainDxBlock body={body} color={color} />;
  }
  if (t.includes('ALERTA')) {
    return <AlertsBlock body={body} />;
  }
  if (t.includes('CASCADA')) {
    return <CascadeBlock body={body} />;
  }
  if (t.includes('ESTADO ACTUAL') || t.includes('ÓPTIMO')) {
    return <TableBlock body={body} />;
  }
  if (t.includes('RIESGOS')) {
    return <RisksBlock body={body} />;
  }
  if (t.includes('PROTOCOLO') || t.includes('NIVEL') || t.includes('MEDICAMENTO') || t.includes('SUPLEMENTO')) {
    return <ProtocolBlock body={body} />;
  }
  return <DefaultBlock body={body} />;
}

// ─── Confidence Bar ───────────────────────────────────────────────────────────
function ConfidenceBar({ pct, color }: { pct: number; color: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(pct), 200); return () => clearTimeout(t); }, [pct]);
  const label = pct >= 85 ? 'Alta confianza' : pct >= 65 ? 'Confianza moderada' : 'Confianza limitada';
  return (
    <div className="mb-5">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-mono text-[#7a95aa]">{label} en el diagnóstico</span>
        <span className="text-sm font-mono font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1e2d3d] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-[1200ms] ease-out"
          style={{ width: `${width}%`, background: `linear-gradient(90deg, #0ea5e9, ${color})` }} />
      </div>
    </div>
  );
}

// ─── Diagnosis Card ───────────────────────────────────────────────────────────
function DiagnosisCard({
  state, color, onEdit, onRestore, editMode, setEditMode, setState,
}: {
  state: DiagnosisState; color: string;
  onEdit: () => void; onRestore: () => void;
  editMode: boolean; setEditMode: (v: boolean) => void;
  setState: (fn: (prev: DiagnosisState) => DiagnosisState) => void;
}) {
  const protocolData = parseProtocolJson(state.doctor_text);
  const diagnosisData = !protocolData ? parseDiagnosisJson(state.doctor_text) : null;
  const dxData = diagnosisData ? withDxDefaults(diagnosisData) : null;
  const sections = parseSections(state.doctor_text);
  const hasStructure = Object.keys(sections).length > 0;
  const SKIP_SECTIONS: string[] = [];

  const approved = protocolData
    ? (state.approved && state.approved.length === protocolData.items.length ? state.approved : protocolData.items.map(() => true))
    : undefined;

  // ── Mutación de diagnósticos estructurados (dxData) ──────────────────────────
  const updateDx = (mutate: (data: DiagnosisListData) => DiagnosisListData) => {
    setState(prev => {
      const parsed = parseDiagnosisJson(prev.doctor_text);
      if (!parsed) return prev;
      const next = mutate(withDxDefaults(parsed));
      return { ...prev, doctor_text: JSON.stringify(next) };
    });
  };

  const handleAcceptDx = (i: number) => updateDx(data => ({
    ...data,
    diagnosticos: data.diagnosticos.map((d, j) => j === i ? { ...d, dx_aceptado: !d.dx_aceptado } : d),
  }));

  const handleAcceptStudies = (i: number) => updateDx(data => ({
    ...data,
    diagnosticos: data.diagnosticos.map((d, j) => j === i ? { ...d, estudios_finalizados: !d.estudios_finalizados } : d),
  }));

  const handleAcceptBoth = (i: number) => updateDx(data => ({
    ...data,
    diagnosticos: data.diagnosticos.map((d, j) => {
      if (j !== i) return d;
      const already = d.dx_aceptado && d.estudios_finalizados;
      return { ...d, dx_aceptado: !already, estudios_finalizados: !already };
    }),
  }));

  const handleToggleStudy = (i: number, si: number) => updateDx(data => ({
    ...data,
    diagnosticos: data.diagnosticos.map((d, j) => {
      if (j !== i) return d;
      const base = d.estudios_seleccionados ?? (d.estudios_sugeridos || []).map(() => false);
      return { ...d, estudios_seleccionados: base.map((v, k) => k === si ? !v : v) };
    }),
  }));

  const handleAddStudyToDiagnosis = (i: number, study: string) => updateDx(data => ({
    ...data,
    diagnosticos: data.diagnosticos.map((d, j) =>
      j === i ? { ...d, estudios_doctor: [...(d.estudios_doctor || []), study] } : d),
  }));

  const handleEditStudy = (i: number, si: number, val: string) => updateDx(data => ({
    ...data,
    diagnosticos: data.diagnosticos.map((d, j) => {
      if (j !== i) return d;
      const arr = [...(d.estudios_doctor || [])];
      arr[si] = val;
      return { ...d, estudios_doctor: arr };
    }),
  }));

  const handleRemoveStudy = (i: number, si: number) => updateDx(data => ({
    ...data,
    diagnosticos: data.diagnosticos.map((d, j) => {
      if (j !== i) return d;
      const arr = [...(d.estudios_doctor || [])];
      arr.splice(si, 1);
      return { ...d, estudios_doctor: arr };
    }),
  }));

  const handleAddExtraStudies = (study: string) => updateDx(data => ({
    ...data,
    estudios_adicionales: [...(data.estudios_adicionales || []), study],
  }));

  const handleAddNewDiagnosis = (input: { nombre: string; pct: string; detalle: string; estudio: string }) => {
    if (!input.nombre.trim()) return;
    updateDx(data => ({
      ...data,
      diagnosticos: [...data.diagnosticos, {
        nombre: input.nombre.trim(),
        confianza: input.pct.trim() ? parseInt(input.pct.trim(), 10) : undefined,
        resumen_breve: input.detalle.trim(),
        estudios_sugeridos: input.estudio.trim() ? [input.estudio.trim()] : [],
        estudios_seleccionados: input.estudio.trim() ? [true] : [],
        dx_aceptado: true,
        estudios_finalizados: false,
        estudios_doctor: [],
      }],
    }));
  };

  const handleToggleApproved = (i: number) => {
    setState(prev => {
      const pd = parseProtocolJson(prev.doctor_text);
      if (!pd) return prev;
      const base = prev.approved && prev.approved.length === pd.items.length ? prev.approved : pd.items.map(() => true);
      const next = base.map((v, j) => j === i ? !v : v);
      return { ...prev, approved: next };
    });
  };

  const handleAddProtocolItem = (item: ProtocolItem) => {
    setState(prev => {
      const pd = parseProtocolJson(prev.doctor_text);
      if (!pd) return prev;
      const newData: ProtocolData = { items: [...pd.items, item], monitoreo_general: pd.monitoreo_general };
      const base = prev.approved && prev.approved.length === pd.items.length ? prev.approved : pd.items.map(() => true);
      return { ...prev, doctor_text: JSON.stringify(newData), approved: [...base, true] };
    });
  };

  const handleToggleSelect = (rawLine: string) => {
    setState(prev => {
      const lines = prev.doctor_text.split('\n');
      const idx = lines.findIndex(l => l.trim() === rawLine);
      if (idx === -1) return prev;
      const numHead = lines[idx].match(/^(\s*\d+\.\s*)(.+)$/);
      const bulletHead = lines[idx].match(/^(\s*[•\-\*]\s*)(.+)$/);
      const head = numHead || bulletHead;
      if (!head) return prev;
      const [, prefix, rest] = head;
      const newRest = rest.trim().startsWith(DX_MARK) ? rest.trim().slice(DX_MARK.length) : DX_MARK + rest.trim();
      const newLines = [...lines];
      newLines[idx] = prefix + newRest;
      return { ...prev, doctor_text: newLines.join('\n') };
    });
  };

  const handleAddDiagnosis = (input: { nombre: string; pct: string; detalle: string; estudio: string }) => {
    if (!input.nombre.trim()) return;
    setState(prev => {
      const secs = parseSections(prev.doctor_text);
      const key = Object.keys(secs).find(k => k.toUpperCase().includes('DIAGNÓSTICOS POSIBLES'));
      const delim = prev.doctor_text.includes('═══') ? '═══' : '══';
      const existingBody = key ? secs[key] : '';
      const nextNum = (existingBody.match(/^\d+\./gm) || []).length + 1;
      const pctPart = input.pct.trim() ? ` | ${input.pct.trim()}%` : '';
      let entry = `${nextNum}. ${DX_MARK}${input.nombre.trim()}${pctPart}`;
      if (input.detalle.trim()) entry += `\n${input.detalle.trim()}`;
      if (input.estudio.trim()) entry += `\nESTUDIO PARA CONFIRMAR: ${input.estudio.trim()}`;

      if (key) {
        const idx = prev.doctor_text.indexOf(existingBody);
        if (idx === -1) return prev;
        const before = prev.doctor_text.slice(0, idx + existingBody.length);
        const after = prev.doctor_text.slice(idx + existingBody.length);
        return { ...prev, doctor_text: `${before}\n\n${entry}${after}` };
      }
      const newSection = `${delim} DIAGNÓSTICOS POSIBLES ${delim}\n${entry}\n\n`;
      return { ...prev, doctor_text: newSection + prev.doctor_text };
    });
  };

  // El modo edición global solo aplica a protocolos y diagnósticos funcional/longevidad
  // (que usan texto con delimitadores). Para diagnósticos convencionales en JSON (dxData),
  // la edición es per-candidato directamente en la card — nunca se activa el textarea global.
  if (editMode && !dxData) {
    if (protocolData) {
      return (
        <ProtocolEditMode
          data={protocolData}
          onSave={(text) => { setState(prev => ({ ...prev, doctor_text: text })); setEditMode(false); }}
          onCancel={() => setEditMode(false)}
        />
      );
    }
    return (
      <div className="bg-[#0d1520] border rounded-xl p-5 mb-5" style={{ borderColor: '#f97316' }}>
        <p className="text-xs font-mono text-[#f97316] mb-3">EDITANDO — tu versión se usa en los pasos siguientes</p>
        <textarea
          value={state.doctor_text}
          onChange={e => setState(prev => ({ ...prev, doctor_text: e.target.value }))}
          className="w-full bg-[#111820] border border-[#1e2d3d] rounded-lg p-3 text-[#dde6ef] text-sm font-mono leading-relaxed outline-none focus:border-[#f97316] min-h-[300px] resize-y"
        />
        <div className="flex gap-3 mt-3">
          <button onClick={() => setEditMode(false)}
            className="px-4 py-2 bg-[#f97316] text-black text-sm font-semibold rounded-lg hover:bg-[#f97316]/90 transition">
            ✓ Guardar edición
          </button>
          <button onClick={onRestore}
            className="px-4 py-2 border border-[#1e2d3d] text-[#7a95aa] text-sm rounded-lg hover:border-[#7a95aa] transition">
            Restaurar original IA
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5">
      {/* Edit bar — solo para diagnósticos funcional/longevidad y protocolos, no para dxData */}
      {!dxData && (
        <div className="flex justify-between items-center px-1 mb-3">
          <span className="text-xs font-mono text-[#3d5870]">
            {state.confirmed ? '✓ CONFIRMADO' : 'GENERADO POR IA'}
            {state.doctor_text !== state.ai_text && ' · ✏️ EDITADO'}
          </span>
          <button onClick={onEdit}
            className="text-xs font-mono px-2 py-1 rounded border border-[#1e2d3d] text-[#7a95aa] hover:border-[#f97316] hover:text-[#f97316] transition">
            ✏️ Editar
          </button>
        </div>
      )}

      {/* Protocolo estructurado (JSON) — prioridad */}
      {protocolData ? (
        <ProtocolStructuredView data={protocolData} color={color}
          approved={approved} onToggle={handleToggleApproved} onAddItem={handleAddProtocolItem} />
      ) : dxData ? (
        /* Diagnóstico convencional estructurado (JSON) — nueva vista per-candidato */
        <DiagnosisStructuredView data={dxData} color={color}
          onAcceptDx={handleAcceptDx}
          onAcceptStudies={handleAcceptStudies}
          onAcceptBoth={handleAcceptBoth}
          onToggleStudy={handleToggleStudy}
          onAddStudy={handleAddStudyToDiagnosis}
          onEditStudy={handleEditStudy}
          onRemoveStudy={handleRemoveStudy}
          onAddNew={handleAddNewDiagnosis}
          onAddExtraStudies={handleAddExtraStudies} />
      ) : hasStructure ? (
        /* Structured sections (diagnósticos, formato de secciones ═══) */
        <div className="space-y-4">
          {Object.entries(sections).map(([title, body]) => {
            if (SKIP_SECTIONS.some(s => title.toUpperCase().includes(s))) return null;
            return (
              <div key={title}>
                <div className="text-[10px] font-mono tracking-widest mb-2 px-1"
                  style={{ color: title.toUpperCase().includes('DIAGNÓSTICO PRINCIPAL') || title.toUpperCase().includes('RAÍZ') ? color : '#3d5870' }}>
                  {title}
                </div>
                <SectionContent title={title} body={body} color={color} onToggleSelect={handleToggleSelect} />
                {title.toUpperCase().includes('DIAGNÓSTICOS POSIBLES') && (
                  <div className="mt-3"><AddDiagnosisForm onAdd={handleAddDiagnosis} color={color} /></div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Fallback: render raw text with inline markdown (protocolos viejos, pre-JSON) */
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-5">
          <DefaultBlock body={state.doctor_text} />
        </div>
      )}

      {/* Notas propias del doctor — siempre disponibles al final del paso */}
      <div className="mt-5 bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-4">
        <p className="text-xs font-mono text-[#3d5870] mb-2 tracking-widest">TUS CONSIDERACIONES (opcional)</p>
        <textarea
          value={state.doctor_notes || ''}
          onChange={e => setState(prev => ({ ...prev, doctor_notes: e.target.value }))}
          placeholder="Agrega cualquier consideración propia para este paso…"
          rows={3}
          className="w-full bg-[#070a0e] border border-[#1e2d3d] rounded-lg px-3 py-2 text-base text-[#dde6ef] outline-none focus:border-[#3d5870] resize-none placeholder-[#3d5870] transition"
        />
      </div>
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
function LoadingScreen({ label }: { label: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => { i++; if (i < LOAD_MSGS.length) setActiveIdx(i); else clearInterval(iv); }, 1800);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="fixed inset-0 bg-[#070a0e] z-50 flex flex-col items-center justify-center px-6">
      <div className="fixed left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(0,229,160,.4),transparent)', animation: 'scan 2.2s linear infinite' }} />
      <div className="w-full max-w-md">
        <div className="text-[#00e5a0] text-3xl font-black tracking-widest mb-1">APEX</div>
        <div className="font-mono text-[10px] tracking-[4px] text-[#3d5870] mb-8 uppercase">{label}</div>
        <div className="flex flex-col gap-2 mb-6">
          {LOAD_MSGS.map((msg, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border font-mono text-xs transition-all duration-500 ${
              i === activeIdx ? 'border-[rgba(0,229,160,.3)] bg-[rgba(0,229,160,.05)] text-[#00e5a0]'
              : i < activeIdx ? 'border-[rgba(14,165,233,.15)] text-[#3d5870]'
              : 'border-[#111820] text-[#1e2d3d]'
            }`}>
              <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${
                i === activeIdx ? 'bg-[#00e5a0] text-black' : i < activeIdx ? 'bg-[#0ea5e9] text-white' : 'bg-[#1e2d3d] text-[#3d5870]'
              }`} style={i === activeIdx ? { animation: 'pulse 0.8s ease-in-out infinite' } : {}}>
                {i < activeIdx ? '✓' : i === activeIdx ? '●' : '—'}
              </div>
              {msg}
            </div>
          ))}
        </div>
        <div className="h-0.5 bg-[#1e2d3d] rounded overflow-hidden">
          <div className="h-full rounded transition-all duration-[1800ms] ease-out"
            style={{ width: `${((activeIdx + 1) / LOAD_MSGS.length) * 100}%`, background: 'linear-gradient(90deg, #0ea5e9, #00e5a0)' }} />
        </div>
      </div>
      <style>{`
        @keyframes scan { 0% { top: 0 } 100% { top: 100vh } }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(0,229,160,.4)} 60%{box-shadow:0 0 0 6px rgba(0,229,160,0)} }
      `}</style>
    </div>
  );
}

// ─── Clarifying Questions Step ────────────────────────────────────────────────
function ClarifyStep({
  questions,
  answers,
  setAnswers,
  onSubmit,
  onSkip,
  loadingAnalysis,
}: {
  questions: string[];
  answers: string[];
  setAnswers: (a: string[]) => void;
  onSubmit: () => void;
  onSkip: () => void;
  loadingAnalysis: boolean;
}) {
  return (
    <div className="py-4">
      {/* AI header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-sm font-black text-black flex-shrink-0 mt-0.5">A</div>
        <div className="flex-1">
          <p className="font-bold text-[#dde6ef] mb-0.5">APEX IA</p>
          <p className="text-sm text-[#7a95aa] font-serif">
            {questions.length === 0
              ? 'Los datos son suficientes. Continuando con el análisis...'
              : 'Tengo algunas preguntas antes de analizar el caso. Puedes responderlas o continuar directamente.'}
          </p>
        </div>
      </div>

      {questions.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {questions.map((q, i) => (
            <div key={i} className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-[10px] font-mono px-2 py-1 rounded-lg flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(167,139,250,.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,.25)' }}>
                  P{i + 1}
                </span>
                <p className="text-lg text-[#dde6ef] leading-relaxed font-serif">{q}</p>
              </div>
              <textarea
                value={answers[i] || ''}
                onChange={e => {
                  const n = [...answers];
                  n[i] = e.target.value;
                  setAnswers(n);
                }}
                placeholder="Respuesta (opcional)…"
                rows={2}
                className="w-full bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2 text-lg text-[#dde6ef] outline-none focus:border-[#a78bfa] resize-none placeholder-[#3d5870] transition"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <button
          onClick={onSubmit}
          disabled={loadingAnalysis}
          className="px-6 py-2.5 text-black text-sm font-bold rounded-xl disabled:opacity-40 transition"
          style={{ background: '#00e5a0' }}>
          {loadingAnalysis ? 'Analizando...' : 'Continuar a diagnóstico →'}
        </button>
        {questions.length > 0 && (
          <button
            onClick={onSkip}
            disabled={loadingAnalysis}
            className="px-5 py-2.5 border border-[#1e2d3d] text-[#7a95aa] text-sm rounded-xl hover:border-[#3d5870] disabled:opacity-40 transition">
            Continuar sin responder
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Select Analysis Step ───────────────────────────────────────────────────────
function SelectAnalysisStep({
  selected, onToggle, onContinue,
}: {
  selected: AnalysisType[]; onToggle: (t: AnalysisType) => void; onContinue: () => void;
}) {
  return (
    <div className="py-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-serif text-[#dde6ef] mb-2">¿Qué análisis necesitas?</h2>
        <p className="text-sm text-[#7a95aa] max-w-md mx-auto">
          Elige uno, varios o los tres. Cada uno genera su propio diagnóstico y protocolo —
          solo se procesa lo que selecciones.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {ALL_TYPES.map(t => {
          const meta = TYPE_META[t];
          const isOn = selected.includes(t);
          return (
            <button key={t} type="button" onClick={() => onToggle(t)}
              className="relative flex flex-col items-center text-center gap-3 rounded-2xl p-6 transition-all"
              style={{
                background: isOn ? `${meta.color}14` : '#0d1520',
                border: `2px solid ${isOn ? meta.color : '#1e2d3d'}`,
                boxShadow: isOn ? `0 0 0 4px ${meta.color}1f` : 'none',
              }}>
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={{
                  background: isOn ? meta.color : 'transparent',
                  border: `2px solid ${isOn ? meta.color : '#3d5870'}`,
                  color: isOn ? '#04110b' : 'transparent',
                }}>✓</div>
              <div className="text-4xl">{meta.icon}</div>
              <div className="text-base font-bold" style={{ color: isOn ? meta.color : '#dde6ef' }}>
                {meta.selectLabel}
              </div>
              <p className="text-xs text-[#7a95aa] leading-relaxed">{meta.selectDesc}</p>
            </button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <button onClick={onContinue} disabled={selected.length === 0}
          className="px-8 py-3 text-black text-sm font-bold rounded-xl disabled:opacity-40 transition"
          style={{ background: '#00e5a0' }}>
          Comenzar análisis →
        </button>
      </div>
    </div>
  );
}

// ─── Floating Chat ────────────────────────────────────────────────────────────
function FloatingChat({
  messages, input, setInput, onSend, loading, unread, onOpen, isOpen, setIsOpen, stepLabel, hasActionBar,
}: {
  messages: ChatMsg[]; input: string; setInput: (v: string) => void;
  onSend: () => void; loading: boolean; unread: number;
  onOpen: () => void; isOpen: boolean; setIsOpen: (v: boolean) => void;
  stepLabel: string; hasActionBar: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomPx = hasActionBar ? 96 : 24;

  useEffect(() => { if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isOpen]);
  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 100); }, [isOpen]);

  return (
    <div className="fixed right-6 z-50 flex flex-col items-end gap-3" style={{ bottom: `${bottomPx}px` }}>
      {/* Expanded panel */}
      {isOpen && (
        <div className="w-[340px] bg-[#0d1520] border border-[#1e2d3d] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ maxHeight: '460px', boxShadow: '0 8px 40px rgba(0,0,0,.7)' }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e2d3d] bg-[#0c1118]">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-black"
              style={{ background: 'linear-gradient(135deg,#00e5a0,#0ea5e9)' }}>A</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[#dde6ef]">APEX IA</div>
              <div className="text-[10px] font-mono text-[#3d5870] truncate">{stepLabel}</div>
            </div>
            <button onClick={() => setIsOpen(false)}
              className="w-6 h-6 rounded-md bg-[#1e2d3d] flex items-center justify-center text-[#7a95aa] hover:text-[#dde6ef] transition text-xs">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0" style={{ maxHeight: 280 }}>
            {messages.length === 0 && (
              <div className="text-xs font-mono text-[#3d5870] text-center py-4">
                Pregunta sobre el diagnóstico o comparte info adicional.
              </div>
            )}
            {messages.map((m, i) => (
              m.role === 'divider' ? (
                <div key={i} className="flex items-center gap-2 py-1">
                  <div className="flex-1 h-px bg-[#1e2d3d]" />
                  <span className="text-[9px] font-mono text-[#3d5870] whitespace-nowrap">{m.content}</span>
                  <div className="flex-1 h-px bg-[#1e2d3d]" />
                </div>
              ) : (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-[#a78bfa] text-black font-medium' : 'bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] font-serif'
                  }`}>
                    {m.role === 'assistant' && <div className="text-[9px] font-mono text-[#00e5a0] mb-1">APEX</div>}
                    {m.content}
                  </div>
                </div>
              )
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2">
                  <div className="flex gap-1 py-1">
                    {[0, 150, 300].map(d => (
                      <div key={d} className="w-1.5 h-1.5 rounded-full bg-[#00e5a0]"
                        style={{ animation: `bounce 1s ${d}ms infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2 p-3 border-t border-[#1e2d3d]">
            <textarea ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder="Pregunta o nueva información..."
              rows={1}
              className="flex-1 bg-[#111820] border border-[#1e2d3d] rounded-lg px-3 py-2 text-lg text-[#dde6ef] outline-none focus:border-[#00e5a0] resize-none min-h-[36px] max-h-[80px] placeholder-[#3d5870] transition"
            />
            <button onClick={onSend} disabled={loading || !input.trim()}
              className="px-3 py-2 bg-[#00e5a0] text-black text-sm font-bold rounded-lg hover:bg-[#00ffb0] disabled:opacity-40 transition flex-shrink-0">→</button>
          </div>
        </div>
      )}
      {/* Toggle button */}
      <button onClick={() => { setIsOpen(!isOpen); onOpen(); }}
        className="w-14 h-14 rounded-full shadow-2xl flex items-center justify-center relative transition-transform hover:scale-105 active:scale-95"
        style={{ background: 'linear-gradient(135deg,#00e5a0,#0ea5e9)', boxShadow: '0 4px 24px rgba(0,229,160,.35)' }}>
        <span className="text-black font-black text-lg">{isOpen ? '✕' : 'A'}</span>
        {unread > 0 && !isOpen && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#f43f5e] flex items-center justify-center text-white text-[10px] font-bold">
            {unread}
          </div>
        )}
      </button>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }`}</style>
    </div>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ current, completed, onGoTo, labels }: {
  current: number; completed: number; onGoTo: (i: number) => void; labels: { label: string; color: string }[];
}) {
  return (
    <div className="flex items-start gap-1 mb-6 overflow-x-auto pb-1">
      {labels.map((s, i) => {
        const isDone = i < completed;
        const isActive = i === current;
        return (
          <div key={i} className="flex items-start gap-1 flex-shrink-0">
            <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => isDone && onGoTo(i)}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                isDone ? 'text-white' : isActive ? 'text-black' : 'text-[#3d5870]'
              }`} style={{
                background: isDone ? s.color : isActive ? s.color : '#1e2d3d',
                boxShadow: isActive ? `0 0 0 3px ${s.color}33` : 'none',
              }}>
                {isDone ? '✓' : i + 1}
              </div>
              <span className="text-[9px] font-mono text-center leading-tight whitespace-nowrap"
                style={{ color: isActive ? s.color : isDone ? s.color + 'aa' : '#3d5870' }}>
                {s.label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className="h-0.5 w-4 mt-3.5 rounded" style={{ background: i < completed ? s.color : '#1e2d3d' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const router = useRouter();
  const params = useParams();
  const visit_id   = params.visit_id as string;
  const patient_id = params.id as string;

  const [token, setToken]   = useState<string | null>(null);
  const [step, setStep]     = useState<Step>('init');
  const [loadingLabel, setLoadingLabel] = useState('');
  const [patientData, setPatientData]   = useState<any>(null);
  const [error, setError]   = useState('');
  const [editMode, setEditMode] = useState(false);
  const [completedStepIdx, setCompletedStepIdx] = useState(-1);

  // Clarifying questions
  const [clarifyQuestions, setClarifyQuestions] = useState<string[]>([]);
  const [clarifyAnswers, setClarifyAnswers]     = useState<string[]>([]);
  const [clarifyLoading, setClarifyLoading]     = useState(false);
  const [funcClarifyQuestions, setFuncClarifyQuestions] = useState<string[]>([]);
  const [funcClarifyAnswers, setFuncClarifyAnswers]     = useState<string[]>([]);
  const [funcClarifyLoading, setFuncClarifyLoading]     = useState(false);

  // Selección de tipos de análisis a ejecutar
  const [selectedTypes, setSelectedTypes] = useState<AnalysisType[]>(['traditional', 'functional', 'longevity']);
  const activeTypes = useMemo(() => ALL_TYPES.filter(t => selectedTypes.includes(t)), [selectedTypes]);
  const stepOrder = useMemo<Step[]>(() => {
    const dx    = activeTypes.map(t => `review_${t}` as Step);
    const proto = activeTypes.map(t => `review_protocol_${t}` as Step);
    return [...dx, ...proto, 'documents'];
  }, [activeTypes]);
  const stepperLabels = useMemo(() => buildStepperLabels(activeTypes), [activeTypes]);

  // Diagnósticos
  const [traditional, setTraditional] = useState<DiagnosisState>(EMPTY_DX);
  const [functional,  setFunctional]  = useState<DiagnosisState>(EMPTY_DX);
  const [longevity,   setLongevity]   = useState<DiagnosisState>(EMPTY_DX);
  const [protTrad,    setProtTrad]    = useState<DiagnosisState>(EMPTY_DX);
  const [protFunc,    setProtFunc]    = useState<DiagnosisState>(EMPTY_DX);
  const [protLong,    setProtLong]    = useState<DiagnosisState>(EMPTY_DX);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]       = useState('');
  const [chatLoading, setChatLoading]   = useState(false);
  const [chatOpen, setChatOpen]         = useState(false);
  const [chatUnread, setChatUnread]     = useState(0);

  const apiBase = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  const authH = useCallback((): Record<string, string> => ({
    Authorization: `Bearer ${token || ''}`,
    'Content-Type': 'application/json',
  }), [token]);

  useEffect(() => {
    const init = async () => {
      const u = await getUser();
      if (!u) { router.push('/auth/login'); return; }
      const session = await getSession();
      setToken(session?.access_token || null);
    };
    init();
  }, [router]);

  // ── Load patient data ───────────────────────────────────────────────────────
  const loadPatientData = async (): Promise<any> => {
    const headers = authH();
    const [patRes, visRes] = await Promise.all([
      fetch(`${apiBase}/patients/${patient_id}`, { headers }),
      fetch(`${apiBase}/visits/${patient_id}`, { headers }),
    ]);
    const pat = await patRes.json();
    const vis = await visRes.json();
    const visits = vis.visits || [];
    const lastVisit = visits.find((v: any) => v.id === visit_id) || visits[0] || {};
    return { ...pat, ...lastVisit };
  };

  // ── Chat ────────────────────────────────────────────────────────────────────
  const addDivider = (label: string) =>
    setChatMessages(prev => [...prev, { role: 'divider', content: label }]);

  const getCurrentStepKey = (): string => {
    if (step === 'review_traditional')          return 'traditional';
    if (step === 'review_functional')           return 'functional';
    if (step === 'review_longevity')            return 'longevity';
    if (step === 'review_protocol_traditional') return 'protocol_traditional';
    if (step === 'review_protocol_functional')  return 'protocol_functional';
    if (step === 'review_protocol_longevity')   return 'protocol_longevity';
    return 'traditional';
  };

  const getCurrentDiagnosisText = (): string => {
    const map: Record<Step, string> = {
      review_traditional: traditional.doctor_text,
      review_functional:  functional.doctor_text,
      review_longevity:   longevity.doctor_text,
      review_protocol_traditional: protTrad.doctor_text,
      review_protocol_functional:  protFunc.doctor_text,
      review_protocol_longevity:   protLong.doctor_text,
      init: '', clarifying: '', clarifying_functional: '', select: '', loading: '', documents: '', complete: '',
    };
    return map[step] || '';
  };

  const buildAnswersText = (questions: string[], answers: string[]): string => {
    const hasAnswers = questions.length > 0 && answers.some(a => a.trim());
    if (!hasAnswers) return '';
    return questions
      .map((q, i) => answers[i]?.trim() ? `P: ${q}\nR: ${answers[i].trim()}` : null)
      .filter(Boolean)
      .join('\n\n');
  };

  const buildDoctorAnswersText = (answers: string[]): string => buildAnswersText(clarifyQuestions, answers);

  const enterStep = (s: Step) => {
    setStep(s);
    setCompletedStepIdx(stepOrder.indexOf(s) - 1);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const q = chatInput.trim();
    setChatInput('');
    setChatLoading(true);
    setChatMessages(prev => [...prev, { role: 'user', content: q }]);
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/${getCurrentStepKey()}/chat`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({ question: q, current_diagnosis: getCurrentDiagnosisText() }),
      });
      const json = await res.json();
      const answer = json.answer || 'Error al obtener respuesta';
      setChatMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      if (!chatOpen) setChatUnread(prev => prev + 1);
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + e.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  const openChat = () => setChatUnread(0);

  // ── Step 0: Analiza el caso completo (borrador silencioso) y genera preguntas ──
  const startClarify = async () => {
    setError('');
    setClarifyLoading(true);
    setStep('loading');
    setLoadingLabel('ANALIZANDO EL CASO COMPLETO...');
    try {
      const data = patientData || (await loadPatientData());
      if (!patientData) setPatientData(data);

      const first = activeTypes[0] || 'traditional';
      const res = await fetch(`${apiBase}/analyze/${visit_id}/clarify`, {
        method: 'POST',
        headers: authH(),
        body: JSON.stringify({ patient_data: data, selected_type: first }),
      });
      const json = await res.json();
      const questions: string[] = json.questions || [];
      setClarifyQuestions(questions);
      setClarifyAnswers(new Array(questions.length).fill(''));
      setStep('clarifying');
    } catch (e: any) {
      // Si falla el análisis silencioso, no podemos continuar — regresa al selector
      setError('Error al analizar el caso: ' + e.message);
      setClarifyQuestions([]);
      setClarifyAnswers([]);
      setStep('select');
    } finally {
      setClarifyLoading(false);
    }
  };

  // ── Cierra el ciclo de preguntas: usa el borrador o lo ajusta con las respuestas ──
  const finalizeFirstDiagnosis = async (answers: string[]) => {
    const first = activeTypes[0] || 'traditional';
    setStep('loading');
    setLoadingLabel('FINALIZANDO DIAGNÓSTICO...');
    setError('');
    setChatMessages([]);
    setEditMode(false);
    try {
      const doctorAnswers = buildDoctorAnswersText(answers);
      const res = await fetch(`${apiBase}/analyze/${visit_id}/finalize_first`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({ doctor_answers: doctorAnswers }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const rawFinal = json.diagnosis as string;
      let doctorFinal = rawFinal;
      if (first === 'traditional') {
        const parsedFinal = parseDiagnosisJson(rawFinal);
        if (parsedFinal) doctorFinal = JSON.stringify(withDxDefaults(parsedFinal));
      }
      const result: DiagnosisState = {
        ai_text: rawFinal, doctor_text: doctorFinal,
        validation: json.validation, confirmed: false, confidence: json.confidence || 75,
      };
      if (first === 'functional') setFunctional(result);
      else if (first === 'longevity') setLongevity(result);
      else setTraditional(result);
      enterStep(`review_${first}` as Step);
    } catch (e: any) {
      setError('Error: ' + e.message);
      setStep('clarifying');
    }
  };

  // ── Step 1: Traditional analysis (with optional answers) ─────────────────────
  const startTraditional = async (answersOverride?: string[]) => {
    setStep('loading');
    setLoadingLabel('ANALIZANDO — MEDICINA CONVENCIONAL');
    setError('');
    setChatMessages([]);
    setEditMode(false);

    try {
      const data = patientData || (await loadPatientData());
      if (!patientData) setPatientData(data);

      const answers = answersOverride ?? clarifyAnswers;
      const doctorAnswers = buildDoctorAnswersText(answers);

      const payload = { ...data, ...(doctorAnswers ? { _doctor_answers: doctorAnswers } : {}) };

      const res = await fetch(`${apiBase}/analyze/${visit_id}/traditional`, {
        method: 'POST', headers: authH(), body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const rawTx = json.diagnosis as string;
      const parsedTx = parseDiagnosisJson(rawTx);
      const normalizedTx = parsedTx ? JSON.stringify(withDxDefaults(parsedTx)) : rawTx;
      setTraditional({ ai_text: rawTx, doctor_text: normalizedTx, validation: json.validation, confirmed: false, confidence: json.confidence || 75 });
      enterStep('review_traditional');
    } catch (e: any) { setError('Error: ' + e.message); setStep('select'); }
  };

  // ── Antes de funcional: preguntas dirigidas a buscar la causa raíz ───────────
  const startClarifyFunctional = async () => {
    setError('');
    setFuncClarifyLoading(true);
    setStep('loading');
    setLoadingLabel('BUSCANDO LA CAUSA RAÍZ...');
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/clarify_functional`, {
        method: 'POST',
        headers: authH(),
        body: JSON.stringify({ doctor_traditional: traditional.doctor_text, patient_id }),
      });
      const json = await res.json();
      const questions: string[] = json.questions || [];
      setFuncClarifyQuestions(questions);
      setFuncClarifyAnswers(new Array(questions.length).fill(''));
      if (questions.length === 0) {
        return startFunctional('');
      }
      setStep('clarifying_functional');
    } catch (e: any) {
      // Si falla, no bloquear el flujo — continúa directo a funcional
      setFuncClarifyQuestions([]);
      setFuncClarifyAnswers([]);
      return startFunctional('');
    } finally {
      setFuncClarifyLoading(false);
    }
  };

  const startFunctional = async (doctorAnswersOverride?: string) => {
    setStep('loading');
    setLoadingLabel('ANALIZANDO — MEDICINA FUNCIONAL');
    if (doctorAnswersOverride === undefined) addDivider('── Diagnóstico Funcional ──');
    else { setChatMessages([]); setError(''); }
    setEditMode(false);
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/functional`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({
          doctor_traditional: traditional.doctor_text,
          ai_traditional_original: traditional.ai_text,
          doctor_answers: doctorAnswersOverride || '',
          patient_id,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setFunctional({ ai_text: json.diagnosis, doctor_text: json.diagnosis, validation: json.validation, confirmed: false, confidence: json.confidence || 75 });
      enterStep('review_functional');
    } catch (e: any) { setError('Error: ' + e.message); setStep(doctorAnswersOverride === undefined ? 'review_traditional' : 'select'); }
  };

  const startLongevity = async (doctorAnswersOverride?: string) => {
    setStep('loading');
    setLoadingLabel('ANALIZANDO — LONGEVIDAD');
    if (doctorAnswersOverride === undefined) addDivider('── Diagnóstico Longevidad ──');
    else { setChatMessages([]); setError(''); }
    setEditMode(false);
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/longevity`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({
          doctor_traditional: traditional.doctor_text,
          doctor_functional: functional.doctor_text,
          ai_traditional_original: traditional.ai_text,
          ai_functional_original: functional.ai_text,
          doctor_answers: doctorAnswersOverride || '',
          patient_id,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setLongevity({ ai_text: json.diagnosis, doctor_text: json.diagnosis, validation: json.validation, confirmed: false, confidence: json.confidence || 75 });
      enterStep('review_longevity');
    } catch (e: any) {
      setError('Error: ' + e.message);
      setStep(doctorAnswersOverride === undefined ? (activeTypes.includes('functional') ? 'review_functional' : 'review_traditional') : 'select');
    }
  };

  const startProtocol = async (type: AnalysisType) => {
    setStep('loading');
    setLoadingLabel(`GENERANDO — ${TYPE_META[type].protoBadge}`);
    addDivider(`── ${TYPE_META[type].protoLabel} ──`);
    setEditMode(false);
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/protocol`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({ protocol_type: type, doctor_traditional: traditional.doctor_text, doctor_functional: functional.doctor_text, doctor_longevity: longevity.doctor_text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const s: DiagnosisState = { ai_text: json.protocol, doctor_text: json.protocol, validation: '', confirmed: false, confidence: 90 };
      if (type === 'traditional') setProtTrad(s);
      else if (type === 'functional') setProtFunc(s);
      else setProtLong(s);
      enterStep(`review_protocol_${type}` as Step);
    } catch (e: any) { setError('Error: ' + e.message); }
  };

  // ── Navigation ───────────────────────────────────────────────────────────────
  const getCurrentSetters = () => {
    const map: Record<string, { state: DiagnosisState; setState: (fn: (p: DiagnosisState) => DiagnosisState) => void }> = {
      review_traditional: { state: traditional, setState: setTraditional },
      review_functional:  { state: functional,  setState: setFunctional },
      review_longevity:   { state: longevity,   setState: setLongevity },
      review_protocol_traditional: { state: protTrad, setState: setProtTrad },
      review_protocol_functional:  { state: protFunc, setState: setProtFunc },
      review_protocol_longevity:   { state: protLong, setState: setProtLong },
    };
    return map[step] || { state: traditional, setState: setTraditional };
  };

  const closeVisit = async () => {
    try {
      await fetch(`${apiBase}/analyze/${visit_id}/close`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({
          doctor_traditional: traditional.doctor_text,
          doctor_functional: functional.doctor_text,
          doctor_longevity: longevity.doctor_text,
          protocol_traditional: protTrad.doctor_text,
          protocol_functional: protFunc.doctor_text,
          protocol_longevity: protLong.doctor_text,
        }),
      });
    } catch (e) {
      console.error('Error cerrando visita:', e);
    }
  };

  const advanceTo = (next: Step) => {
    if (next === 'documents') { setStep('documents'); setCompletedStepIdx(stepOrder.length - 1); closeVisit(); return; }
    let m = next.match(/^review_protocol_(traditional|functional|longevity)$/);
    if (m) return startProtocol(m[1] as AnalysisType);
    m = next.match(/^review_(traditional|functional|longevity)$/);
    if (m) {
      const t = m[1] as AnalysisType;
      if (t === 'traditional') return startTraditional();
      if (t === 'functional')  return startClarifyFunctional();
      return startLongevity();
    }
  };

  const handleContinue = () => {
    const { setState } = getCurrentSetters();
    setState(prev => {
      let finalText = prev.doctor_text;
      const pd = parseProtocolJson(finalText);
      const notes = (prev.doctor_notes || '').trim();
      if (pd) {
        const appr = prev.approved && prev.approved.length === pd.items.length ? prev.approved : pd.items.map(() => true);
        const kept = pd.items.filter((_, i) => appr[i] !== false);
        const mg = notes ? { ...pd.monitoreo_general, nota_doctor: notes } : pd.monitoreo_general;
        finalText = JSON.stringify({ items: kept, monitoreo_general: mg });
      } else if (notes) {
        finalText = `${finalText}\n\n--- NOTAS DEL DOCTOR ---\n${notes}`;
      }
      return { ...prev, doctor_text: finalText, confirmed: true };
    });
    const idx = stepOrder.indexOf(step);
    const next = stepOrder[idx + 1];
    if (next) advanceTo(next);
  };

  const handleGoTo = (stepIdx: number) => {
    if (stepIdx <= completedStepIdx) setStep(stepOrder[stepIdx]);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const isReviewStep = step.startsWith('review_');
  const info = stepCfgFor(step);
  const currentStepIdx = stepOrder.indexOf(step);
  const { state, setState } = getCurrentSetters();
  const hasActionBar = isReviewStep && !editMode;

  return (
    <div className="min-h-screen bg-[#070a0e]">

      {step === 'loading' && <LoadingScreen label={loadingLabel} />}

      <main className="pt-16 pb-32">
        <div className="page-content px-6 py-8">

          {/* ── INIT ── */}
          {step === 'init' && (
            <div className="text-center py-16">
              <div className="text-5xl mb-5">🔬</div>
              <h1 className="text-3xl font-serif text-[#dde6ef] mb-3">Análisis Clínico APEX</h1>
              <p className="text-[#7a95aa] text-sm max-w-md mx-auto mb-2">
                Análisis en {stepperLabels.length} pasos: {activeTypes.length || 3} diagnósticos + {activeTypes.length || 3} protocolos. Cada paso espera tu confirmación.
              </p>
              <p className="text-xs font-mono text-[#3d5870] max-w-md mx-auto mb-10">
                APEX analiza el caso completo primero, y solo si hace falta te hace hasta 3 preguntas clave sobre el paciente.
              </p>
              <div className="flex items-center justify-center gap-2 mb-10 flex-wrap">
                {stepperLabels.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black" style={{ background: s.color }}>
                        {i + 1}
                      </div>
                      <span className="text-[9px] font-mono whitespace-nowrap" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    {i < stepperLabels.length - 1 && <div className="w-5 h-px bg-[#1e2d3d] mb-4" />}
                  </div>
                ))}
              </div>
              {error && <p className="text-[#f43f5e] text-sm mb-4">{error}</p>}
              <button onClick={() => setStep('select')}
                className="px-8 py-3 bg-[#00e5a0] text-black font-semibold rounded-xl hover:bg-[#00ffb0] transition text-sm">
                Iniciar Análisis →
              </button>
            </div>
          )}

          {/* ── SELECT ANALYSIS TYPES ── */}
          {step === 'select' && (
            <SelectAnalysisStep
              selected={selectedTypes}
              onToggle={t => setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
              onContinue={startClarify}
            />
          )}

          {/* ── CLARIFYING ── */}
          {step === 'clarifying' && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="px-2.5 py-1 rounded text-[10px] font-mono tracking-wider bg-[rgba(167,139,250,.1)] text-[#a78bfa] border border-[rgba(167,139,250,.25)]">
                  PREGUNTAS PREVIAS
                </div>
                <h2 className="text-xl font-serif text-[#dde6ef]">Antes de mostrar el diagnóstico</h2>
              </div>
              {error && <p className="text-[#f43f5e] text-sm mb-4">{error}</p>}
              <ClarifyStep
                questions={clarifyQuestions}
                answers={clarifyAnswers}
                setAnswers={setClarifyAnswers}
                onSubmit={() => finalizeFirstDiagnosis(clarifyAnswers)}
                onSkip={() => finalizeFirstDiagnosis([])}
                loadingAnalysis={clarifyLoading}
              />
            </div>
          )}

          {/* ── CLARIFYING FUNCTIONAL (causa raíz) ── */}
          {step === 'clarifying_functional' && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="px-2.5 py-1 rounded text-[10px] font-mono tracking-wider bg-[rgba(167,139,250,.1)] text-[#a78bfa] border border-[rgba(167,139,250,.25)]">
                  BUSCANDO LA CAUSA RAÍZ
                </div>
                <h2 className="text-xl font-serif text-[#dde6ef]">Antes del diagnóstico funcional</h2>
              </div>
              {error && <p className="text-[#f43f5e] text-sm mb-4">{error}</p>}
              <ClarifyStep
                questions={funcClarifyQuestions}
                answers={funcClarifyAnswers}
                setAnswers={setFuncClarifyAnswers}
                onSubmit={() => startFunctional(buildAnswersText(funcClarifyQuestions, funcClarifyAnswers))}
                onSkip={() => startFunctional('')}
                loadingAnalysis={funcClarifyLoading}
              />
            </div>
          )}

          {/* ── REVIEW ── */}
          {isReviewStep && (
            <div>
              <Stepper labels={stepperLabels} current={currentStepIdx} completed={completedStepIdx + 1} onGoTo={handleGoTo} />

              <div className="flex items-center gap-3 mb-5">
                <div className="px-2.5 py-1 rounded text-[10px] font-mono tracking-wider"
                  style={{ background: `${info.color}15`, color: info.color, border: `1px solid ${info.color}33` }}>
                  {info.badge}
                </div>
                <h2 className="text-xl font-serif text-[#dde6ef]">{info.label}</h2>
              </div>

              {step.startsWith('review_protocol_') && (
                <div className="flex items-start gap-2.5 bg-[rgba(245,158,11,.07)] border border-[rgba(245,158,11,.25)] rounded-xl px-4 py-3 mb-5">
                  <span className="text-[#f59e0b] flex-shrink-0 mt-0.5">⚠</span>
                  <p className="text-xs text-[#dde6ef] leading-relaxed font-serif">
                    <strong className="text-[#f59e0b]">Sugerencia generada con apoyo de Inteligencia Artificial.</strong> El médico tratante es responsable de validar, ajustar y prescribir cada intervención conforme a su juicio clínico, la evaluación directa del paciente y la normativa vigente. Esta herramienta no sustituye el criterio médico.
                  </p>
                </div>
              )}

              {(step === 'review_functional' || step === 'review_protocol_functional') && (
                <div className="flex items-start gap-2.5 bg-[rgba(167,139,250,.07)] border border-[rgba(167,139,250,.25)] rounded-xl px-4 py-3 mb-5">
                  <span className="text-[#a78bfa] flex-shrink-0 mt-0.5">ⓘ</span>
                  <p className="text-xs text-[#dde6ef] leading-relaxed font-serif">
                    <strong className="text-[#a78bfa]">Medicina funcional: hipótesis de causa raíz.</strong> Es normal no alcanzar 100% de certeza sin estudios de laboratorio. Texto genérico — pendiente de revisión legal.
                  </p>
                </div>
              )}

              {step === 'review_protocol_functional' && (
                <div className="flex items-start gap-2.5 bg-[rgba(245,158,11,.07)] border border-[rgba(245,158,11,.25)] rounded-xl px-4 py-3 mb-5">
                  <span className="text-[#f59e0b] flex-shrink-0 mt-0.5">⚠</span>
                  <p className="text-xs text-[#dde6ef] leading-relaxed font-serif">
                    <strong className="text-[#f59e0b]">Aviso COFEPRIS.</strong> Algunos suplementos o usos sugeridos pueden ser off-label o no estar registrados en México. Verifique el registro sanitario antes de prescribir. Texto genérico — pendiente de revisión legal.
                  </p>
                </div>
              )}

              {step !== 'review_traditional' && (
                <ConfidenceBar pct={state.confidence} color={info.color} />
              )}

              <DiagnosisCard
                state={state}
                color={info.color}
                onEdit={() => setEditMode(true)}
                onRestore={() => { setState(prev => ({ ...prev, doctor_text: prev.ai_text })); setEditMode(false); }}
                editMode={editMode}
                setEditMode={setEditMode}
                setState={setState}
              />

              {state.validation && !step.startsWith('review_protocol_') && (
                <details className="bg-[#070a0e] border border-[#1e2d3d] rounded-xl mb-5">
                  <summary className="px-4 py-3 text-xs font-mono text-[#3d5870] cursor-pointer hover:text-[#7a95aa]">
                    🔍 Validación anti-alucinaciones
                  </summary>
                  <div className="px-4 pb-4 pt-3 text-xs text-[#7a95aa] font-mono whitespace-pre-wrap leading-relaxed border-t border-[#1e2d3d]">
                    {state.validation}
                  </div>
                </details>
              )}

              {error && <p className="text-[#f43f5e] text-sm mb-4">{error}</p>}

              <p className="text-xs font-mono text-[#3d5870] text-center mt-6">
                💬 Usa el chat (esquina inferior derecha) para preguntas o info adicional
              </p>
            </div>
          )}

          {/* ── DOCUMENTS ── */}
          {step === 'documents' && (
            <div>
              <Stepper labels={stepperLabels} current={stepperLabels.length - 1} completed={stepperLabels.length} onGoTo={handleGoTo} />
              <div className="text-center py-8">
                <div className="text-5xl mb-4">📄</div>
                <h2 className="text-2xl font-serif text-[#dde6ef] mb-2">Generar Documentos</h2>
                <p className="text-[#7a95aa] text-sm mb-8">Diagnósticos y protocolos confirmados.</p>
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[
                    { icon: '📋', label: 'Receta médica',        sub: 'Medicamentos + dosis' },
                    { icon: '🔬', label: 'Solicitud estudios',   sub: 'Labs recomendados' },
                    { icon: '📊', label: 'Reporte paciente',     sub: 'Resumen completo' },
                  ].map(d => (
                    <div key={d.label} className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-4 cursor-pointer hover:border-[#00e5a0] transition">
                      <div className="text-3xl mb-2">{d.icon}</div>
                      <p className="text-sm font-semibold text-[#dde6ef]">{d.label}</p>
                      <p className="text-xs text-[#7a95aa] mt-1">{d.sub}</p>
                      <p className="text-[10px] font-mono text-[#3d5870] mt-2">Próximamente</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => setStep('complete')}
                  className="px-8 py-3 bg-[#00e5a0] text-black font-semibold rounded-xl hover:bg-[#00ffb0] transition text-sm">
                  Cerrar Visita ✓
                </button>
              </div>
            </div>
          )}

          {/* ── COMPLETE ── */}
          {step === 'complete' && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-2xl font-serif text-[#00e5a0] mb-3">Visita Completada</h2>
              <p className="text-[#7a95aa] text-sm mb-8">Todos los diagnósticos y protocolos guardados.</p>
              <button onClick={() => router.push(`/dashboard/patient/${patient_id}`)}
                className="px-8 py-3 bg-[#00e5a0] text-black font-semibold rounded-xl hover:bg-[#00ffb0] transition text-sm">
                ← Volver a ficha del paciente
              </button>
            </div>
          )}

        </div>
      </main>

      {/* ── Bottom action bar ── */}
      {hasActionBar && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#070a0e]/95 border-t border-[#1e2d3d] px-6 py-4 flex justify-between items-center z-40 backdrop-blur-sm">
          <div className="text-xs font-mono text-[#3d5870]">
            {state.doctor_text !== state.ai_text
              ? '✏️ Editado — tu versión se usará en los siguientes pasos'
              : 'Puedes aceptar o editar antes de continuar'}
          </div>
          <button onClick={handleContinue}
            className="px-6 py-2.5 text-sm font-bold rounded-xl transition text-black"
            style={{ background: info.color }}>
            {stepOrder.indexOf(step) === stepOrder.length - 2 ? 'Generar Documentos →' : 'Confirmar y continuar →'}
          </button>
        </div>
      )}

      {/* ── Floating Chat ── */}
      {(isReviewStep || step === 'documents') && (
        <FloatingChat
          messages={chatMessages}
          input={chatInput}
          setInput={setChatInput}
          onSend={sendChat}
          loading={chatLoading}
          unread={chatUnread}
          onOpen={openChat}
          isOpen={chatOpen}
          setIsOpen={setChatOpen}
          stepLabel={info.label || 'Análisis'}
          hasActionBar={hasActionBar}
        />
      )}
    </div>
  );
}
