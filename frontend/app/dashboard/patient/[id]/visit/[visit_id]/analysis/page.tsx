'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────
type Step =
  | 'init' | 'clarifying' | 'clarifying_functional' | 'clarifying_longevity' | 'select' | 'loading'
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
  // Intercalado: Dx → Proto por cada especialidad, en el mismo orden que stepOrder.
  const seq = types.flatMap(t => [
    { label: `Dx ${TYPE_META[t].short}`,    color: TYPE_META[t].color },
    { label: `Proto ${TYPE_META[t].short}`, color: TYPE_META[t].color },
  ]);
  return [...seq, { label: 'Documentos', color: '#f59e0b' }];
}

interface DiagnosisState {
  ai_text: string;
  doctor_text: string;
  validation: string;
  confirmed: boolean;
  confidence: number;
  approved?: boolean[];
  doctor_notes?: string;
  /** Objeciones de la segunda opinión que el generador NO aceptó — el médico decide. */
  banderas?: { item?: string; problema?: string; accion?: string }[];
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
// Mensajes de carga por contexto — cada pantalla de espera describe lo que REALMENTE
// se está procesando en ese paso, no una lista genérica.
const LOAD_MSGS_DIAGNOSTICO = [
  'Cargando historial clínico completo',
  'Analizando signos vitales y datos de la visita',
  'Revisando antecedentes y medicamentos actuales',
  'Consultando guías clínicas y evidencia',
  'Cruzando datos con patrones clínicos',
  'Calculando diagnósticos diferenciales',
  'Verificando fuentes en bases oficiales',
  'Jerarquizando causa raíz sobre complicaciones',
  'Preparando diagnóstico estructurado',
];
const LOAD_MSGS_FUNCIONAL = [
  'Cargando el diagnóstico convencional confirmado',
  'Revisando antecedentes, hábitos y situación actual',
  'Evaluando ejes de la matriz de salud',
  'Rastreando la cascada de causalidad',
  'Ubicando la causa raíz más probable',
  'Identificando factores perpetuantes',
  'Seleccionando estudios que confirmarían la raíz',
  'Preparando explicación de causa raíz',
];
const LOAD_MSGS_LONGEVIDAD = [
  'Cargando diagnóstico y causa raíz confirmados',
  'Analizando biomarcadores de envejecimiento',
  'Estimando edad biológica vs cronológica',
  'Proyectando riesgos a 5–10 años',
  'Comparando estado actual vs óptimo',
  'Calculando potencial de mejora',
  'Preparando perfil de longevidad',
];
const LOAD_MSGS_PROTOCOLO = [
  'Cargando el diagnóstico confirmado por el médico',
  'Revisando medicamentos actuales, alergias e interacciones',
  'Diseñando el protocolo terapéutico personalizado',
  'Verificando dosis y concentraciones',
  'Confirmando disponibilidad y registro sanitario',
  'Revisando traslapes entre intervenciones',
  'Ajustando monitoreo y señales de alarma',
  'Preparando el protocolo estructurado',
];

// Elige el set de mensajes según lo que dice el label de carga.
function pickLoadMsgs(label: string): string[] {
  const l = (label || '').toUpperCase();
  if (l.includes('PROTOCOLO') || l.includes('GENERANDO')) return LOAD_MSGS_PROTOCOLO;
  if (l.includes('LONGEVIDAD')) return LOAD_MSGS_LONGEVIDAD;
  if (l.includes('CAUSA RAÍZ') || l.includes('FUNCIONAL')) return LOAD_MSGS_FUNCIONAL;
  return LOAD_MSGS_DIAGNOSTICO;
}

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

/** Extrae la edad biológica del cuerpo de la sección "EDAD BIOLÓGICA ESTIMADA".
 *  Formato esperado: "[X] años (cronológica: [Y] años = [+/-Z] años). Biomarcadores clave: ..." */
function parseBioAge(body: string): { bio: number | null; crono: number | null; deltaTxt: string; rest: string } {
  const clean = body.replace(/^[·•\-\s]+/, '');
  const bioM = clean.match(/(\d{1,3})\s*años/);
  const cronoM = clean.match(/cronol[oó]gica:\s*(\d{1,3})\s*años/i);
  const deltaM = clean.match(/=\s*([+\-]?\s*\d{1,3})\s*años/);
  const bio = bioM ? parseInt(bioM[1], 10) : null;
  const crono = cronoM ? parseInt(cronoM[1], 10) : null;
  const deltaTxt = deltaM ? deltaM[1].replace(/\s+/g, '') : (bio != null && crono != null ? (bio - crono >= 0 ? `+${bio - crono}` : `${bio - crono}`) : '');
  // Explicación: la parte después del primer paréntesis de cierre "). "
  const closeIdx = clean.indexOf(').');
  const rest = closeIdx >= 0 ? clean.slice(closeIdx + 2).trim() : clean.replace(/Biomarcadores/i, 'Biomarcadores').trim();
  return { bio, crono, deltaTxt, rest };
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
          <div key={i} className="flex items-start gap-2.5 bg-[rgba(249,115,22,.06)] border border-[rgba(249,115,22,.2)] rounded-xl px-4 py-2.5">
            <span className="text-[#f97316] flex-shrink-0 mt-0.5 text-sm">⚠</span>
            <p className="text-base text-[#dde6ef] leading-relaxed font-serif"><Md text={clean} /></p>
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
  cofepris?: string; // "aprobado" | "no_aprobado" | "na"
  momento?: string;  // "iniciar_ahora" | "condicionado" | "ajustar_segun"
  condicion?: string; // disparador cuando momento != iniciar_ahora
  para_que_sirve?: string;
}

type Peptido = { nombre?: string; para_que?: string; como_se_usa?: string; por_que_encaja?: string; disclaimer?: string; cofepris?: string };
interface ProtocolData {
  items: ProtocolItem[];
  peptidos?: Peptido[];
  monitoreo_general?: {
    proxima_revision?: string;
    labs_control?: string;
    criterios_exito?: string;
    senales_alarma?: string;
    nota_doctor?: string;
    plan_por_fases?: { fase?: string; foco?: string; cuando?: string }[];
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
  const [theoryOpen, setTheoryOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const hasAlert = !!(item.alerta && item.alerta.trim());
  const hasDosis = !!(item.presentacion || item.dosis || item.frecuencia);
  const notApproved = (item.cofepris || '').toLowerCase() === 'no_aprobado';
  // El mecanismo del no-aprobado ya se muestra como "teoría" arriba; no lo repitas en el acordeón.
  const hasExtra = !!(item.reacciones_adversas || item.interacciones || (item.mecanismo && !notApproved));
  const selectable = typeof onToggle === 'function';

  return (
    <div className="rounded-xl overflow-hidden border transition"
      style={{
        borderColor: hasAlert ? 'rgba(244,63,94,.35)' : '#1e2d3d',
        opacity: selectable && !selected ? 0.45 : 1,
      }}>
      {/* Franja de alerta — solo cuando hay riesgo real; discreta, no gritada */}
      {hasAlert && (
        <div className="px-3.5 py-1.5 text-[11px] flex items-start gap-1.5"
          style={{ background: 'rgba(244,63,94,.08)', color: '#f43f5e' }}>
          <span className="flex-shrink-0 mt-0.5 text-[10px]">⚠</span>
          <span className="leading-snug">{item.alerta}</span>
        </div>
      )}

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
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                {item.tipo && (
                  <span className="inline-block text-xs font-mono px-2 py-0.5 rounded-full"
                    style={{ color, background: `${color}15`, border: `1px solid ${color}40` }}>
                    {item.tipo}
                  </span>
                )}
                {notApproved && (
                  <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full"
                    style={{ color: '#f59e0b', background: 'rgba(245,158,11,.10)', border: '1px solid rgba(245,158,11,.30)' }}>
                    no aprobado por COFEPRIS
                  </span>
                )}
              </div>
            </div>
          </label>
          {item.nivel_evidencia && (
            <div className="text-right flex-shrink-0">
              <button type="button" onClick={() => setEvidenceOpen(o => !o)}
                className="text-[10px] font-mono text-[#3d5870] hover:text-[#7a95aa] transition flex items-center gap-1 ml-auto">
                EVIDENCIA <span>{evidenceOpen ? '▲' : '▼'}</span>
              </button>
              {evidenceOpen && (
                <p className="text-xs text-[#dde6ef] font-semibold max-w-[200px] mt-1">{item.nivel_evidencia}</p>
              )}
            </div>
          )}
        </div>

        {/* Condición temporal: qué resultado lo activa, o cómo se ajusta según el laboratorio */}
        {item.condicion && item.momento && item.momento !== 'iniciar_ahora' && (
          <div className="rounded-lg px-3 py-2 flex items-start gap-2"
            style={{
              background: item.momento === 'ajustar_segun' ? 'rgba(14,165,233,.07)' : 'rgba(245,158,11,.07)',
              border: `1px solid ${item.momento === 'ajustar_segun' ? 'rgba(14,165,233,.25)' : 'rgba(245,158,11,.25)'}`,
            }}>
            <span className="text-xs flex-shrink-0 mt-0.5">{item.momento === 'ajustar_segun' ? '⚖' : '⏳'}</span>
            <div>
              <p className="text-[10px] font-mono mb-0.5"
                style={{ color: item.momento === 'ajustar_segun' ? '#0ea5e9' : '#f59e0b' }}>
                {item.momento === 'ajustar_segun' ? 'SE INICIA — AJUSTAR SEGÚN RESULTADO' : 'NO INICIAR TODAVÍA'}
              </p>
              <p className="text-xs text-[#dde6ef] leading-snug">{item.condicion}</p>
            </div>
          </div>
        )}

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

        {/* Teoría COFEPRIS — solo para items sin aprobación: badge discreto + teoría plegable */}
        {notApproved && item.mecanismo && (
          <div className="rounded-lg border" style={{ borderColor: 'rgba(245,158,11,.25)', background: 'rgba(245,158,11,.05)' }}>
            <button onClick={() => setTheoryOpen(o => !o)}
              className="w-full text-left px-3.5 py-2.5 flex items-center gap-2 text-xs font-mono transition"
              style={{ color: '#f59e0b' }}>
              <span>{theoryOpen ? '▲' : '▼'}</span>
              <span>Sin aprobación COFEPRIS — evidencia preliminar. Ver teoría de cómo funciona</span>
            </button>
            {theoryOpen && (
              <p className="px-3.5 pb-3 text-sm text-[#dde6ef] font-serif leading-relaxed">{item.mecanismo}</p>
            )}
          </div>
        )}

        {/* ¿Para qué sirve? — 1 línea, esencia del "por qué a este paciente" */}
        {item.para_que_sirve && (
          <div className="rounded-lg px-3 py-2" style={{ background: `${color}0d`, border: `1px solid ${color}33` }}>
            <p className="text-[10px] font-mono mb-1 flex items-center gap-1.5" style={{ color }}>
              <span>💡</span> ¿PARA QUÉ SIRVE?
            </p>
            <p className="text-sm text-[#dde6ef] font-serif leading-snug">{item.para_que_sirve}</p>
          </div>
        )}

        {/* Indicación */}
        {item.indicacion && (
          <div>
            <p className="text-[10px] font-mono text-[#3d5870] mb-1">INDICACIÓN CLÍNICA</p>
            <p className="text-sm text-[#dde6ef] font-serif leading-snug">{item.indicacion}</p>
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
            <p className="text-base text-[#7a95aa] font-serif leading-relaxed">{item.monitoreo}</p>
          </div>
        )}

        {/* Acordeón + Aprende más — plegado por defecto */}
        {(hasExtra || (item.tipo && /f[aá]rmaco|off-?label|suplement|vitamina/i.test(item.tipo))) && (
          <div className="border-t border-[#1e2d3d] pt-3 flex items-center gap-4 flex-wrap">
            {hasExtra && (
              <button onClick={() => setOpen(o => !o)}
                className="text-xs font-mono text-[#7a95aa] hover:text-[#dde6ef] transition flex items-center gap-1.5">
                <span>{open ? '▲' : '▼'}</span> Más detalle
              </button>
            )}
            {item.tipo && /f[aá]rmaco|off-?label|suplement|vitamina/i.test(item.tipo) && item.nombre_generico && (
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(item.nombre_generico + ' medicamento indicaciones dosis interacciones')}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs font-mono text-[#0ea5e9] hover:text-[#7dd3fc] transition flex items-center gap-1.5">
                🔍 Aprende más
              </a>
            )}
            {open && hasExtra && (
              <div className="w-full mt-3 space-y-2 text-xs text-[#7a95aa] font-serif leading-snug">
                {item.reacciones_adversas && (
                  <p><span className="text-[#dde6ef] font-semibold">Reacciones: </span>{item.reacciones_adversas}</p>
                )}
                {item.interacciones && (
                  <p><span className="text-[#dde6ef] font-semibold">Interacciones: </span>{item.interacciones}</p>
                )}
                {item.mecanismo && (
                  <p><span className="text-[#dde6ef] font-semibold">Mecanismo: </span>{item.mecanismo}</p>
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

/** Separa el protocolo en lo que se empieza HOY y lo que queda supeditado a estudios.
 *  Es lo que evita entregarle al médico una lista larga con la mitad diciendo "todavía no". */
function splitByMomento(items: ProtocolItem[]): { ahora: number[]; pendiente: number[] } {
  const ahora: number[] = [], pendiente: number[] = [];
  items.forEach((it, i) => {
    (((it.momento || 'iniciar_ahora') === 'condicionado') ? pendiente : ahora).push(i);
  });
  return { ahora, pendiente };
}

function ProtocolStructuredView({ data, color, approved, onToggle, onAddItem }: {
  data: ProtocolData; color: string;
  approved?: boolean[]; onToggle?: (i: number) => void; onAddItem?: (item: ProtocolItem) => void;
}) {
  const mg = data.monitoreo_general;
  const hasFases = !!(mg && Array.isArray(mg.plan_por_fases) && mg.plan_por_fases.some(f => f && (f.fase || f.foco)));
  const hasGeneral = !!(mg && (mg.proxima_revision || mg.labs_control || mg.criterios_exito || mg.senales_alarma || hasFases));
  const groups = groupProtocolItems(data.items);
  const [addingOwn, setAddingOwn] = useState(false);
  const [ownItem, setOwnItem] = useState<ProtocolItem>({ nombre_generico: '' });

  const submitOwn = () => {
    if (!ownItem.nombre_generico.trim() || !onAddItem) return;
    onAddItem(ownItem);
    setOwnItem({ nombre_generico: '' });
    setAddingOwn(false);
  };

  const { ahora, pendiente } = splitByMomento(data.items);
  const renderGrupos = (indices: number[]) => {
    const permitidos = new Set(indices);
    return groups
      .map(g => ({ label: g.label, indices: g.indices.filter(i => permitidos.has(i)) }))
      .filter(g => g.indices.length > 0)
      .map(g => (
        <div key={g.label}>
          <p className="text-xs font-mono text-[#3d5870] mb-3 tracking-widest">{g.label}</p>
          <div className="space-y-8">
            {g.indices.map(i => (
              <ProtocolItemCard key={i} item={data.items[i]} color={color}
                selected={approved ? approved[i] !== false : undefined}
                onToggle={onToggle ? () => onToggle(i) : undefined} />
            ))}
          </div>
        </div>
      ));
  };

  return (
    <div className="space-y-10">
      {/* Lo que el paciente empieza HOY */}
      {ahora.length > 0 && (
        <div className="space-y-10">
          {pendiente.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono tracking-widest px-2.5 py-1 rounded-full"
                style={{ color: '#00e5a0', background: 'rgba(0,229,160,.10)', border: '1px solid rgba(0,229,160,.30)' }}>
                ▶ INICIA HOY
              </span>
              <div className="flex-1 h-px bg-[#1a2535]" />
            </div>
          )}
          {renderGrupos(ahora)}
        </div>
      )}

      {/* Lo que queda supeditado a estudios */}
      {pendiente.length > 0 && (
        <div className="space-y-10 pt-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono tracking-widest px-2.5 py-1 rounded-full"
              style={{ color: '#f59e0b', background: 'rgba(245,158,11,.10)', border: '1px solid rgba(245,158,11,.30)' }}>
              ⏳ CONDICIONADO A ESTUDIOS
            </span>
            <div className="flex-1 h-px bg-[#1a2535]" />
          </div>
          <p className="text-[11px] text-[#7a95aa] leading-snug -mt-6">
            No se inicia todavía. Cada item indica qué resultado lo activa.
          </p>
          {renderGrupos(pendiente)}
        </div>
      )}

      {/* Péptidos / terapias avanzadas que pudieran ayudar (NO van en la receta oficial) */}
      {Array.isArray(data.peptidos) && data.peptidos.filter(p => p && p.nombre).length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono tracking-widest px-2.5 py-1 rounded-full"
              style={{ color: '#0891b2', background: 'rgba(8,145,178,.10)', border: '1px solid rgba(8,145,178,.30)' }}>
              🧬 PÉPTIDOS QUE PUDIERAN AYUDAR
            </span>
            <div className="flex-1 h-px bg-[#1a2535]" />
          </div>
          <p className="text-[11px] text-[#7a95aa] -mt-1">Opciones avanzadas para tu consideración — no forman parte de la receta oficial (COFEPRIS). Tú decides.</p>
          {data.peptidos.filter(p => p && p.nombre).map((p, i) => (
            <div key={i} className="rounded-xl border border-[rgba(8,145,178,.3)] bg-[#07141a] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(8,145,178,.08)' }}>
                <span className="text-lg">🧬</span>
                <p className="font-bold text-[14px] text-[#dde6ef] flex-1">{p.nombre}</p>
                {p.cofepris === 'no_aprobado' && <span className="text-[8px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5">no aprobado COFEPRIS</span>}
              </div>
              <div className="px-4 py-3 space-y-1.5 text-[12px]">
                {p.para_que && <p className="text-[#dde6ef]"><span className="text-[#0891b2] font-semibold">¿Para qué? </span>{p.para_que}</p>}
                {p.por_que_encaja && <p className="text-[#7a95aa]"><span className="text-[#3d5870]">Por qué encaja aquí: </span>{p.por_que_encaja}</p>}
                {p.como_se_usa && <p className="text-[#7a95aa]"><span className="text-[#3d5870]">Cómo se usa: </span>{p.como_se_usa}</p>}
                {p.disclaimer && <p className="text-amber-400/90 text-[11px]">⚠ {p.disclaimer}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

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
          {hasFases && (
            <div className="mb-4">
              <p className="text-[10px] font-mono mb-2 tracking-widest" style={{ color }}>🗺️ PLAN DE TRABAJO POR FASES</p>
              <div className="space-y-2">
                {mg!.plan_por_fases!.filter(f => f && (f.fase || f.foco)).map((f, i) => (
                  <div key={i} className="flex items-start gap-3 bg-[#111820] rounded-lg px-3 py-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold mt-0.5"
                      style={{ color, border: `1px solid ${color}55` }}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[#dde6ef]">{f.fase}</span>
                        {f.cuando && <span className="text-[10px] font-mono text-[#7a95aa]">· {f.cuando}</span>}
                      </div>
                      {f.foco && <p className="text-xs text-[#7a95aa] leading-snug mt-0.5">{f.foco}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
    const finalData: ProtocolData = { items: [...kept, ...cleanOwn], peptidos: data.peptidos, monitoreo_general: data.monitoreo_general };
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
  es_complicacion_de?: string;   // nombre del diagnóstico raíz del que este es consecuencia/complicación
  // Estado del doctor — no viene de la IA, se inyecta al normalizar la respuesta
  dx_aceptado?: boolean;
  estudios_seleccionados?: boolean[];
  estudios_doctor?: string[];
  estudios_finalizados?: boolean;
  doctor_added?: boolean;        // true cuando el doctor agregó este diagnóstico manualmente
}

interface DiagnosisListData {
  diagnosticos: DiagnosisCandidate[];
  alertas_clinicas?: string[];
  estudios_adicionales?: string[];     // estudios sin diagnóstico específico asociado
}

// ── Diagnóstico FUNCIONAL estructurado (JSON) — para la vista modular por bloques ──
type FuncNodo = { nodo?: string; mecanismo?: string; evidencia?: string };
type FuncPerp = { factor?: string; impacto?: string };
type FuncEstudio = { estudio?: string; prioridad?: string; confirma?: string; impacto?: string };
type FuncEstCubierto = { estudio?: string; cubierto_por?: string; para_que?: string };
type FuncDx = {
  confianza?: number; confianza_nota?: string;
  cadena_causal?: { terreno?: string; disparador?: string; motor?: string; perpetuadores?: string; sintoma?: string };
  raiz?: string;
  nodos?: FuncNodo[];
  perpetuantes?: FuncPerp[];
  estudios?: FuncEstudio[];
  estudios_ya_cubiertos?: FuncEstCubierto[];
  estudios_seleccionados?: boolean[];
  historia_paciente?: string;
};
function parseFunctionalJson(text: string): FuncDx | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  if (!t.startsWith('{')) return null;
  try {
    const d = JSON.parse(t);
    if (d && typeof d === 'object' && !Array.isArray(d) && !d.diagnosticos && !d.items
        && (d.cadena_causal || d.raiz || d.nodos || d.historia_paciente)) {
      return d as FuncDx;
    }
  } catch { /* no es JSON funcional */ }
  return null;
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

function DiagnosisCandidateCard({ item, color, onAcceptBoth, onToggleStudy, onAddStudy, onEditStudy, onRemoveStudy }: {
  item: DiagnosisCandidate; color: string;
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

  const accepted = !!item.dx_aceptado;
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

  return (
    <div className="rounded-2xl overflow-hidden transition-all duration-300"
      style={accepted
        ? { background: 'rgba(245,158,11,.04)', border: '2px solid rgba(245,158,11,.45)', boxShadow: '0 4px 24px rgba(245,158,11,.07)' }
        : { background: '#07101e', border: '1px solid #1a2a3a', boxShadow: '0 2px 12px rgba(0,0,0,.3)' }}>

      {/* ── Bloque 1: Diagnóstico ── */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            {accepted && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full mb-2 border"
                style={{ background: 'rgba(245,158,11,.12)', color: '#f59e0b', borderColor: 'rgba(245,158,11,.3)' }}>
                ✓ ACEPTADO
              </span>
            )}
            {item.es_complicacion_de && (
              <p className="text-[11px] font-mono text-[#7a95aa] mb-1 flex items-center gap-1">
                <span style={{ color }}>↳</span> Complicación de <span className="font-bold" style={{ color }}>{item.es_complicacion_de}</span>
              </p>
            )}
            <p className="font-bold text-[17px] leading-snug" style={{ color: accepted ? '#f59e0b' : '#dde6ef' }}>
              <Md text={item.nombre} />
              {item.cie10 && (
                <span className="text-xs font-mono text-[#3d5870] font-normal ml-2">({item.cie10})</span>
              )}
            </p>
          </div>

          {item.confianza != null && (
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setPctOpen(o => !o)}
                className="badge-pulse font-mono font-bold rounded-lg flex items-center gap-1.5 transition-all hover:scale-105 select-none"
                style={{
                  fontSize: '13px',
                  padding: '6px 10px',
                  color: pctColor,
                  background: `${pctColor}1a`,
                  border: `1.5px solid ${pctColor}55`,
                  ['--pulse-clr' as any]: `${pctColor}55`,
                }}>
                {item.confianza}%
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black"
                  style={{ background: `${pctColor}28`, color: pctColor }}>?</span>
              </button>
              {pctOpen && (
                <div className="absolute right-0 top-10 z-20 w-72 rounded-xl p-4 shadow-2xl"
                  style={{ background: '#0a1525', border: `1px solid ${pctColor}40`, boxShadow: `0 8px 32px rgba(0,0,0,.5), 0 0 0 1px ${pctColor}20` }}>
                  <p className="font-mono text-[10px] tracking-widest mb-2" style={{ color: pctColor }}>POR QUÉ {item.confianza}%</p>
                  <p className="text-sm font-serif leading-relaxed text-[#dde6ef]">
                    {item.por_que_confianza || 'Nivel de certeza basado en los hallazgos disponibles en el expediente.'}
                  </p>
                  <button type="button" onClick={() => setPctOpen(false)}
                    className="mt-3 text-[10px] font-mono text-[#3d5870] hover:text-[#7a95aa]">cerrar ✕</button>
                </div>
              )}
            </div>
          )}
        </div>

        {item.resumen_breve && (
          <p className="text-[15px] text-[#c8d6e5] leading-relaxed font-serif mb-3">{item.resumen_breve}</p>
        )}

        {item.explicacion_completa && (
          <div>
            <button type="button" onClick={() => setExpanded(o => !o)}
              className="text-xs font-mono text-[#7a95aa] hover:text-[#dde6ef] transition flex items-center gap-1.5">
              <span>{expanded ? '▲' : '▼'}</span>
              {expanded ? 'Ocultar explicación y fuentes' : 'Ver explicación completa y fuentes'}
            </button>
            {expanded && (
              <div className="mt-3 space-y-3 pl-3 border-l border-[#1e2d3d]">
                <p className="text-sm text-[#7a95aa] font-serif leading-relaxed">{item.explicacion_completa}</p>
                {item.fuentes && item.fuentes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
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

      {/* ── Bloque 2: Estudios ── */}
      <div className="border-t border-[#182030] bg-[#040c18] px-5 py-4 space-y-3">
        <p className="text-[10px] font-mono font-bold tracking-widest" style={{ color: '#0ea5e9' }}>🔬 ESTUDIOS SUGERIDOS</p>

        {sugeridos.length > 0 && (
          <div className="space-y-1.5">
            {sugeridos.map((s, si) => {
              const sel = seleccionados[si] ?? false;
              return (
                <label key={si}
                  className="flex items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-all"
                  style={{ background: sel ? 'rgba(14,165,233,.09)' : '#080f1c', border: `1px solid ${sel ? 'rgba(14,165,233,.3)' : '#182030'}` }}>
                  <input type="checkbox" checked={sel} onChange={() => onToggleStudy(si)}
                    className="mt-0.5 w-4 h-4 flex-shrink-0 rounded accent-[#0ea5e9]" />
                  <span className="text-sm text-[#dde6ef] font-serif leading-relaxed">{s}</span>
                </label>
              );
            })}
          </div>
        )}

        {doctorStudies.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-mono text-[#a78bfa] tracking-wider">AGREGADOS POR EL DOCTOR</p>
            {doctorStudies.map((s, si) => (
              <div key={si} className="flex items-center gap-2 px-3 py-2 rounded-xl group"
                style={{ background: 'rgba(167,139,250,.06)', border: '1px solid rgba(167,139,250,.2)' }}>
                {editingStudyIdx === si ? (
                  <>
                    <input autoFocus value={editStudyVal} onChange={e => setEditStudyVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { if (editStudyVal.trim()) onEditStudy(si, editStudyVal.trim()); setEditingStudyIdx(null); }
                        if (e.key === 'Escape') setEditingStudyIdx(null);
                      }}
                      className="flex-1 bg-transparent text-sm text-[#dde6ef] outline-none border-b border-[#a78bfa]/40" />
                    <button type="button" onClick={() => { if (editStudyVal.trim()) onEditStudy(si, editStudyVal.trim()); setEditingStudyIdx(null); }}
                      className="text-[10px] font-mono text-[#a78bfa] hover:opacity-70 px-1">guardar</button>
                    <button type="button" onClick={() => setEditingStudyIdx(null)}
                      className="text-[10px] font-mono text-[#3d5870] hover:opacity-70 px-1">✕</button>
                  </>
                ) : (
                  <>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: 'rgba(167,139,250,.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,.25)' }}>DR</span>
                    <span className="text-sm text-[#dde6ef] font-serif flex-1">{s}</span>
                    <button type="button" onClick={() => { setEditingStudyIdx(si); setEditStudyVal(s); }}
                      className="text-[10px] text-[#3d5870] hover:text-[#a78bfa] opacity-0 group-hover:opacity-100 transition px-1">✎</button>
                    <button type="button" onClick={() => onRemoveStudy(si)}
                      className="text-[10px] text-[#3d5870] hover:text-[#f43f5e] opacity-0 group-hover:opacity-100 transition px-1">✕</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <input
            value={studyInput}
            onChange={e => setStudyInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitStudy(); }}
            placeholder="Agregar estudio a este diagnóstico…"
            className="flex-1 bg-[#080f1c] border border-[#182030] rounded-xl px-3 py-2 text-sm text-[#dde6ef] outline-none focus:border-[rgba(167,139,250,.4)] placeholder-[#2d4158] transition" />
          {studyInput.trim() && (
            <button type="button" onClick={commitStudy}
              className="text-xs font-mono px-3 py-2 rounded-xl border border-[rgba(167,139,250,.35)] text-[#a78bfa] hover:bg-[rgba(167,139,250,.08)] transition whitespace-nowrap">
              + Agregar
            </button>
          )}
        </div>
      </div>

      {/* ── Bloque 3: Un solo botón de aceptación ── */}
      <div className="border-t border-[#182030] bg-[#040c18] px-5 py-4">
        <button type="button" onClick={onAcceptBoth}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 hover:scale-[1.01]"
          style={accepted
            ? { background: 'rgba(245,158,11,.14)', border: '2px solid rgba(245,158,11,.55)', color: '#f59e0b' }
            : { background: `${color}12`, border: `2px solid ${color}50`, color }}>
          {accepted ? '⭐ Diagnóstico aceptado — clic para desmarcar' : 'Aceptar este diagnóstico'}
        </button>
      </div>
    </div>
  );
}

function DiagnosisStructuredView({ data, color, onAcceptBoth, onToggleStudy, onAddStudy, onEditStudy, onRemoveStudy, onAddNew, onAddExtraStudies }: {
  data: DiagnosisListData; color: string;
  onAcceptBoth: (i: number) => void;
  onToggleStudy: (i: number, si: number) => void;
  onAddStudy: (i: number, study: string) => void;
  onEditStudy: (i: number, si: number, val: string) => void;
  onRemoveStudy: (i: number, si: number) => void;
  onAddNew: (input: { nombre: string; pct: string; detalle: string; estudio: string }) => void;
  onAddExtraStudies: (study: string) => void;
}) {
  const alertas = (data.alertas_clinicas || []).filter(a => a && a.trim());

  // Split AI vs doctor diagnoses
  const aiDiagnoses = data.diagnosticos.map((d, i) => ({ d, i })).filter(({ d }) => !d.doctor_added);
  const doctorDiagnoses = data.diagnosticos.map((d, i) => ({ d, i })).filter(({ d }) => !!d.doctor_added);
  const extraStudies = data.estudios_adicionales || [];

  const [dxOpen, setDxOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraInput, setExtraInput] = useState('');

  const commitExtra = () => {
    if (!extraInput.trim()) return;
    onAddExtraStudies(extraInput.trim());
    setExtraInput('');
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-[#7a95aa] font-serif italic">
        Diagnósticos posibles, del más al menos probable según la IA. Pueden coexistir más de uno — acepta el o los que consideres correctos.
      </p>

      {alertas.length > 0 && (
        <div className="rounded-xl px-3.5 py-2.5 space-y-1"
          style={{ background: 'rgba(244,63,94,.07)', border: '1px solid rgba(244,63,94,.25)' }}>
          <p className="text-[10px] font-mono font-bold mb-1" style={{ color: '#f43f5e' }}>⚠ ALERTAS CLÍNICAS</p>
          {alertas.map((a, ai) => (
            <p key={ai} className="text-[11px] text-[#dde6ef] font-serif leading-snug">• {a}</p>
          ))}
        </div>
      )}

      {/* ── BLOQUE IA ── */}
      {aiDiagnoses.length > 0 && (
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono tracking-widest text-[#3d5870]">PROPUESTAS DE LA IA</span>
            <div className="flex-1 h-px bg-[#1a2535]" />
          </div>
          {aiDiagnoses.map(({ d, i }) => (
            <DiagnosisCandidateCard key={i} item={d} color={color}
              onAcceptBoth={() => onAcceptBoth(i)}
              onToggleStudy={si => onToggleStudy(i, si)}
              onAddStudy={study => onAddStudy(i, study)}
              onEditStudy={(si, val) => onEditStudy(i, si, val)}
              onRemoveStudy={si => onRemoveStudy(i, si)} />
          ))}
        </div>
      )}

      {/* ── BLOQUE DOCTOR ── */}
      {doctorDiagnoses.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono tracking-widest text-[#a78bfa]">AGREGADOS POR EL DOCTOR</span>
            <div className="flex-1 h-px bg-[#a78bfa]/15" />
          </div>
          {doctorDiagnoses.map(({ d, i }) => (
            <div key={i} className="relative">
              <div className="absolute -top-0 left-4 z-10">
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-b-md"
                  style={{ background: 'rgba(167,139,250,.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,.25)', borderTop: 'none' }}>
                  DR
                </span>
              </div>
              <div className="pt-4">
                <DiagnosisCandidateCard item={d} color="#a78bfa"
                  onAcceptBoth={() => onAcceptBoth(i)}
                  onToggleStudy={si => onToggleStudy(i, si)}
                  onAddStudy={study => onAddStudy(i, study)}
                  onEditStudy={(si, val) => onEditStudy(i, si, val)}
                  onRemoveStudy={si => onRemoveStudy(i, si)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SECCIÓN DOCTOR: agregar diagnóstico / estudios ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#070e1a', border: '1px solid #1a2535' }}>
        <div className="px-5 py-3 border-b border-[#1a2535]">
          <p className="text-[10px] font-mono tracking-widest text-[#a78bfa]">APORTACIÓN DEL DOCTOR</p>
          <p className="text-xs text-[#3d5870] font-serif mt-0.5">Lo que agregues aquí quedará marcado como tuyo para la IA.</p>
        </div>

        <div className="p-5 space-y-3">
          {/* Dos botones iguales: primero Diagnóstico, luego Estudios */}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => { setDxOpen(o => !o); setExtraOpen(false); }}
              className="py-3.5 rounded-xl font-semibold text-sm border-2 border-dashed transition-all hover:border-[#a78bfa]/60 hover:text-[#a78bfa]"
              style={dxOpen
                ? { borderColor: 'rgba(167,139,250,.5)', color: '#a78bfa', background: 'rgba(167,139,250,.06)' }
                : { borderColor: '#1a2535', color: '#3d5870', background: 'transparent' }}>
              + Agregar Diagnóstico
            </button>
            <button type="button" onClick={() => { setExtraOpen(o => !o); setDxOpen(false); }}
              className="py-3.5 rounded-xl font-semibold text-sm border-2 border-dashed transition-all hover:border-[#a78bfa]/60 hover:text-[#a78bfa]"
              style={extraOpen
                ? { borderColor: 'rgba(167,139,250,.5)', color: '#a78bfa', background: 'rgba(167,139,250,.06)' }
                : { borderColor: '#1a2535', color: '#3d5870', background: 'transparent' }}>
              + Agregar Estudios
            </button>
          </div>

          {/* Formulario de diagnóstico */}
          {dxOpen && (
            <div className="rounded-xl border border-[rgba(167,139,250,.25)] bg-[#040c18] p-4">
              <AddDiagnosisForm onAdd={(input) => { onAddNew(input); setDxOpen(false); }} color="#a78bfa" big={false} />
            </div>
          )}

          {/* Formulario de estudios sin diagnóstico */}
          {extraOpen && (
            <div className="rounded-xl border border-[rgba(167,139,250,.25)] bg-[#040c18] p-4 space-y-3">
              {extraStudies.length > 0 && (
                <div className="space-y-1.5">
                  {extraStudies.map((s, si) => (
                    <div key={si} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                      style={{ background: 'rgba(167,139,250,.05)', border: '1px solid rgba(167,139,250,.15)' }}>
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: 'rgba(167,139,250,.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,.25)' }}>DR</span>
                      <span className="text-sm text-[#dde6ef] font-serif">{s}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input autoFocus value={extraInput} onChange={e => setExtraInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitExtra(); if (e.key === 'Escape') setExtraOpen(false); }}
                  placeholder="Nombre del estudio que quieres pedir…"
                  className="flex-1 bg-[#070e1a] border border-[#1a2535] rounded-xl px-3 py-2 text-sm text-[#dde6ef] outline-none focus:border-[rgba(167,139,250,.4)] placeholder-[#2d4158] transition" />
                {extraInput.trim() && (
                  <button type="button" onClick={commitExtra}
                    className="text-xs font-mono px-3 py-2 rounded-xl border border-[rgba(167,139,250,.35)] text-[#a78bfa] hover:bg-[rgba(167,139,250,.08)] transition whitespace-nowrap">
                    + Agregar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
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
              <p className="text-base text-[#dde6ef] font-serif leading-relaxed"><Md text={clean} /></p>
            </div>
          );
        }
        return (
          <p key={i} className="text-base text-[#dde6ef] font-serif leading-relaxed">
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

// ─── Longevity Hero — edad biológica como número grande con animación ─────────
function LongevityHero({ body, color }: { body: string; color: string }) {
  const { bio, crono, deltaTxt, rest } = parseBioAge(body);
  const [display, setDisplay] = useState(crono ?? 0);

  useEffect(() => {
    if (bio == null) return;
    const from = crono ?? Math.max(0, bio - 12);
    const to = bio;
    const dur = 1400;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bio, crono]);

  const older = bio != null && crono != null && bio > crono;
  const deltaColor = older ? '#f43f5e' : '#00e5a0';

  if (bio == null) {
    // Sin número parseable — cae al render normal de sección
    return <SectionContent title="EDAD BIOLÓGICA ESTIMADA" body={body} color={color} onToggleSelect={() => {}} />;
  }

  return (
    <div className="rounded-2xl p-6 text-center relative overflow-hidden"
      style={{ background: `radial-gradient(circle at 50% 0%, ${color}18, transparent 70%), #07101e`, border: `1px solid ${color}33` }}>
      <div className="text-[10px] font-mono tracking-[3px] mb-3" style={{ color }}>EDAD BIOLÓGICA ESTIMADA</div>
      <div className="flex items-end justify-center gap-2 leading-none">
        <span className="font-black tabular-nums" style={{ fontSize: '76px', color, textShadow: `0 0 40px ${color}55` }}>{display}</span>
        <span className="text-2xl font-bold text-[#7a95aa] mb-3">años</span>
      </div>
      <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
        {crono != null && (
          <span className="text-sm font-mono text-[#7a95aa]">Cronológica: <span className="text-[#dde6ef] font-bold">{crono}</span></span>
        )}
        {deltaTxt && (
          <span className="text-sm font-mono font-bold px-2.5 py-1 rounded-full"
            style={{ color: deltaColor, background: `${deltaColor}18`, border: `1px solid ${deltaColor}40` }}>
            {deltaTxt} años {older ? '↑' : '↓'}
          </span>
        )}
      </div>
      {rest && (
        <p className="text-sm text-[#7a95aa] font-serif leading-relaxed mt-5 text-left max-w-2xl mx-auto border-t border-[#1e2d3d] pt-4">
          {rest}
        </p>
      )}
    </div>
  );
}

// ─── Cascada de causalidad — flujo vertical raíz → lo que se ve ────────────────
function CausalityFlow({ body, color }: { body: string; color: string }) {
  // El cuerpo viene como "raíz → disfunción A → disfunción B → síntoma visible".
  // Puede venir en varias líneas; nos quedamos con la línea que tenga flechas.
  const line = body.split('\n').map(l => l.trim()).filter(Boolean).find(l => l.includes('→')) || body;
  const nodes = line.split('→').map(n => n.replace(/^[·•\-\s]+/, '').trim()).filter(Boolean);

  if (nodes.length < 2) {
    return <SectionContent title="CASCADA DE CAUSALIDAD" body={body} color={color} onToggleSelect={() => {}} />;
  }

  return (
    <div className="flex flex-col items-stretch gap-0">
      {nodes.map((node, i) => {
        const isRoot = i === 0;
        const isVisible = i === nodes.length - 1;
        const tag = isRoot ? 'RAÍZ DEL PROBLEMA' : isVisible ? 'LO QUE SE VE (diagnóstico)' : `PASO ${i}`;
        const nodeColor = isRoot ? color : isVisible ? '#f43f5e' : '#7a95aa';
        return (
          <div key={i}>
            <div className="rounded-xl px-4 py-3 flex items-start gap-3"
              style={{
                background: isRoot ? `${color}12` : isVisible ? 'rgba(244,63,94,.08)' : '#07101e',
                border: `1px solid ${isRoot ? `${color}44` : isVisible ? 'rgba(244,63,94,.3)' : '#1a2a3a'}`,
              }}>
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-black mt-0.5"
                style={{ background: nodeColor, color: '#000' }}>{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-mono tracking-widest mb-0.5" style={{ color: nodeColor }}>{tag}</div>
                <div className="text-[15px] text-[#dde6ef] font-serif leading-snug">{node}</div>
              </div>
            </div>
            {!isVisible && (
              <div className="flex justify-center py-1">
                <span className="text-2xl leading-none" style={{ color: `${color}99` }}>↓</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Vista modular del diagnóstico FUNCIONAL (bloques, poca carga cognitiva) ─────
function FuncCollapsible({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[#1e2d3d] overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#0d1520] transition">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#dde6ef]"><span>{icon}</span>{title}</span>
        <span className="text-[#7a95aa] text-xs">{open ? 'ocultar ▲' : 'ver más ▼'}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function CausalChain({ cc, color }: { cc: NonNullable<FuncDx['cadena_causal']>; color: string }) {
  const blocks = [
    { k: 'Terreno', v: cc.terreno, icon: '🧬' },
    { k: 'Disparador', v: cc.disparador, icon: '⚡' },
    { k: 'Motor (causa raíz)', v: cc.motor, icon: '⚙️', hot: true },
    { k: 'Perpetuadores', v: cc.perpetuadores, icon: '🔁' },
    { k: 'Síntoma / queja', v: cc.sintoma, icon: '🎯' },
  ].filter(b => (b.v || '').toString().trim());
  return (
    <div className="flex flex-col md:flex-row gap-1.5 items-stretch">
      {blocks.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col md:flex-row items-stretch gap-1.5">
          <div className="flex-1 rounded-xl p-3" style={{ background: b.hot ? `${color}18` : '#0d1520', border: `1px solid ${b.hot ? color : '#1e2d3d'}` }}>
            <p className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: b.hot ? color : '#7a95aa' }}>{b.icon} {b.k}</p>
            <p className="text-[12px] text-[#dde6ef] leading-snug">{b.v}</p>
          </div>
          {i < blocks.length - 1 && <div className="flex items-center justify-center text-[#3d5870] text-lg md:px-0.5"><span className="md:rotate-0 rotate-90">→</span></div>}
        </div>
      ))}
    </div>
  );
}

function _prioColor(p?: string): string {
  const u = (p || '').toUpperCase();
  if (u.includes('URGENTE')) return '#f43f5e';
  if (u.includes('DESEADO')) return '#0ea5e9';
  return '#7a95aa';
}
function _resumenConvencional(dxText?: string): string {
  if (!dxText) return '';
  const d = parseDiagnosisJson(dxText);
  if (d && d.diagnosticos?.length) {
    return d.diagnosticos.slice(0, 3).map((x: any) => x.nombre).filter(Boolean).join(' · ');
  }
  return dxText.replace(/\s+/g, ' ').slice(0, 140);
}
function _medsConvencional(protText?: string): string[] {
  if (!protText) return [];
  const p = parseProtocolJson(protText);
  if (!p?.items) return [];
  const MED = ['fármaco', 'farmaco', 'off-label', 'suplemento', 'vitamina', 'mineral'];
  return p.items.filter((it: any) => MED.includes((it.tipo || '').toLowerCase()))
    .map((it: any) => it.nombre_generico).filter(Boolean).slice(0, 8);
}

function FunctionalStructuredView({ data, color, anchor, onToggleStudy }: {
  data: FuncDx; color: string;
  anchor?: { dxText?: string; protText?: string };
  onToggleStudy: (i: number) => void;
}) {
  const cc = data.cadena_causal;
  const estudios = data.estudios || [];
  const sel = (data.estudios_seleccionados && data.estudios_seleccionados.length === estudios.length)
    ? data.estudios_seleccionados : estudios.map(() => true);
  const nodos = data.nodos || [];
  const perp = data.perpetuantes || [];
  const convResumen = _resumenConvencional(anchor?.dxText);
  const convMeds = _medsConvencional(anchor?.protText);

  return (
    <div className="space-y-4">
      {/* PASO 1 — Ancla convencional (la medicina convencional manda; funcional coadyuva) */}
      {anchor && (convResumen || convMeds.length > 0) && (
        <div className="rounded-xl p-3.5" style={{ background: 'rgba(14,165,233,.06)', border: '1px solid rgba(14,165,233,.3)' }}>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(14,165,233,.15)', color: '#0ea5e9' }}>⚓ BASE CONVENCIONAL — MANDA</span>
            <span className="text-[10px] text-[#7a95aa]">Funcional coadyuva; no sustituye ni contradice el manejo convencional</span>
          </div>
          {convResumen && <p className="text-[12px] text-[#dde6ef]">{convResumen}</p>}
          {convMeds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {convMeds.map((m, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#0d1520] border border-[#1e2d3d] text-[#7a95aa]">💊 {m}</span>)}
            </div>
          )}
        </div>
      )}

      {/* PASO 2 — Cadena causal (overview gráfico) */}
      {cc && (
        <div>
          <p className="text-[10px] font-mono tracking-widest mb-2 px-1" style={{ color }}>CADENA CAUSAL — DE LA RAÍZ AL SÍNTOMA</p>
          <CausalChain cc={cc} color={color} />
        </div>
      )}
      {data.raiz && (
        <div className="rounded-xl p-3.5" style={{ background: `${color}0d`, border: `1px solid ${color}33` }}>
          <p className="text-[10px] font-mono tracking-wider mb-1" style={{ color }}>RAÍZ DEL PROBLEMA{data.confianza_nota ? ` · ${data.confianza_nota}` : ''}</p>
          <p className="text-[13px] text-[#dde6ef] leading-relaxed">{data.raiz}</p>
        </div>
      )}

      {/* Detalle profundo, colapsado por defecto (no llenar la pantalla) */}
      {nodos.length > 0 && (
        <FuncCollapsible title={`Nodos desregulados (${nodos.length})`} icon="🕸️" color={color}>
          <div className="space-y-2">
            {nodos.map((n, i) => (
              <div key={i} className="rounded-lg px-3 py-2 bg-[#0d1520] border border-[#1e2d3d]">
                <p className="text-[13px] font-semibold text-[#dde6ef]">{i + 1}. {n.nodo}</p>
                {n.mecanismo && <p className="text-[12px] text-[#7a95aa]">{n.mecanismo}</p>}
                {n.evidencia && <p className="text-[11px] text-[#3d5870] mt-0.5">Evidencia: {n.evidencia}</p>}
              </div>
            ))}
          </div>
        </FuncCollapsible>
      )}
      {perp.length > 0 && (
        <FuncCollapsible title={`Factores que lo perpetúan (${perp.length})`} icon="🔁" color={color}>
          <div className="space-y-1.5">
            {perp.map((p, i) => (
              <div key={i} className="text-[12px]"><span className="font-semibold text-[#dde6ef]">{p.factor}</span>{p.impacto && <span className="text-[#7a95aa]"> — {p.impacto}</span>}</div>
            ))}
          </div>
        </FuncCollapsible>
      )}

      {/* PASO 3 — Estudios (accionable: qué confirma / qué decide) */}
      {estudios.length > 0 && (
        <div>
          <p className="text-[10px] font-mono tracking-widest mb-1 px-1" style={{ color }}>ESTUDIOS SUGERIDOS</p>
          <p className="text-[11px] text-[#7a95aa] mb-2 px-1">Marca los que quieres solicitar — el resto no se incluirá.</p>
          <div className="space-y-2">
            {estudios.map((e, i) => (
              <label key={i} className="flex items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition"
                style={{ background: sel[i] ? `${color}0d` : '#0d1520', border: `1px solid ${sel[i] ? `${color}40` : '#1e2d3d'}` }}>
                <input type="checkbox" checked={!!sel[i]} onChange={() => onToggleStudy(i)} className="mt-1 accent-[#00e5a0]" />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-[#dde6ef]">{e.estudio}
                    {e.prioridad && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full align-middle" style={{ background: _prioColor(e.prioridad) + '22', color: _prioColor(e.prioridad) }}>{e.prioridad}</span>}
                  </p>
                  {e.confirma && <p className="text-[11px] text-[#7a95aa] mt-0.5"><span className="text-[#3d5870]">Confirma:</span> {e.confirma}</p>}
                  {e.impacto && <p className="text-[11px] text-[#7a95aa]"><span className="text-[#3d5870]">Decide:</span> {e.impacto}</p>}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Estudios que este enfoque aprovecha pero que el médico YA aceptó antes (no se re-piden) */}
      {(data.estudios_ya_cubiertos?.length ?? 0) > 0 && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: '#0d1520', border: '1px dashed #1e2d3d' }}>
          <p className="text-[10px] font-mono tracking-widest mb-1.5 flex items-center gap-1.5 text-[#7a95aa]"><span>✓</span> YA SOLICITADOS (no hace falta pedirlos de nuevo)</p>
          <ul className="space-y-1">
            {data.estudios_ya_cubiertos!.map((e, i) => (
              <li key={i} className="text-[12px] text-[#9fb2c4] leading-snug">
                <span className="text-[#dde6ef] font-medium">{e.estudio}</span>
                {e.cubierto_por && <span className="text-[#3d5870]"> — {e.cubierto_por}</span>}
                {e.para_que && <span className="text-[#7a95aa]"> · sirve aquí para: {e.para_que}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Historia del paciente (paso "Tell") */}
      {data.historia_paciente && (
        <div className="rounded-xl p-4" style={{ background: `${color}0d`, border: `1px solid ${color}33` }}>
          <p className="text-[10px] font-mono tracking-widest mb-2 flex items-center gap-1.5" style={{ color }}><span>🗣️</span> LA HISTORIA DEL PACIENTE</p>
          <p className="text-[13px] text-[#dde6ef] leading-relaxed whitespace-pre-wrap">{data.historia_paciente}</p>
        </div>
      )}
    </div>
  );
}

// ─── Diagnosis Card ───────────────────────────────────────────────────────────
function DiagnosisCard({
  state, color, onEdit, onRestore, editMode, setEditMode, setState, anchor,
}: {
  state: DiagnosisState; color: string;
  onEdit: () => void; onRestore: () => void;
  editMode: boolean; setEditMode: (v: boolean) => void;
  setState: (fn: (prev: DiagnosisState) => DiagnosisState) => void;
  anchor?: { dxText?: string; protText?: string };
}) {
  const protocolData = parseProtocolJson(state.doctor_text);
  const funcData = !protocolData ? parseFunctionalJson(state.doctor_text) : null;
  const diagnosisData = (!protocolData && !funcData) ? parseDiagnosisJson(state.doctor_text) : null;
  const dxData = diagnosisData ? withDxDefaults(diagnosisData) : null;
  const sections = parseSections(state.doctor_text);
  const hasStructure = Object.keys(sections).length > 0;
  const SKIP_SECTIONS: string[] = [];

  // Toggle de selección de estudios en el diagnóstico funcional (se persiste en doctor_text).
  const handleToggleFuncStudy = (i: number) => setState(prev => {
    const fd = parseFunctionalJson(prev.doctor_text);
    if (!fd) return prev;
    const est = fd.estudios || [];
    const base = (fd.estudios_seleccionados && fd.estudios_seleccionados.length === est.length)
      ? fd.estudios_seleccionados : est.map(() => true);
    const next = { ...fd, estudios_seleccionados: base.map((v, k) => k === i ? !v : v) };
    return { ...prev, doctor_text: JSON.stringify(next) };
  });

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
        doctor_added: true,
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
      const newData: ProtocolData = { items: [...pd.items, item], peptidos: pd.peptidos, monitoreo_general: pd.monitoreo_general };
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
      ) : funcData ? (
        /* Diagnóstico FUNCIONAL estructurado (JSON) — vista modular por bloques */
        <FunctionalStructuredView data={funcData} color={color} anchor={anchor} onToggleStudy={handleToggleFuncStudy} />
      ) : dxData ? (
        /* Diagnóstico convencional estructurado (JSON) — nueva vista per-candidato */
        <DiagnosisStructuredView data={dxData} color={color}
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
            // La edad biológica se presenta como número grande animado (es el dato que "vende")
            if (title.toUpperCase().includes('EDAD BIOLÓGICA') || title.toUpperCase().includes('EDAD BIOLOGICA')) {
              return <div key={title}><LongevityHero body={body} color={color} /></div>;
            }
            // La cascada de causalidad se presenta como flujo gráfico raíz → síntoma
            // (compatibilidad con reportes previos; los nuevos usan "LÍNEA DE TIEMPO (ATM)").
            if (title.toUpperCase().includes('CASCADA DE CAUSALIDAD') || title.toUpperCase().includes('CASCADA')) {
              return (
                <div key={title}>
                  <div className="text-[10px] font-mono tracking-widest mb-2 px-1" style={{ color }}>{title}</div>
                  <CausalityFlow body={body} color={color} />
                </div>
              );
            }
            // Paso "Tell" (GOTOIT): la historia del paciente, en tarjeta destacada para leerle.
            if (title.toUpperCase().includes('HISTORIA DEL PACIENTE')) {
              return (
                <div key={title} className="rounded-xl p-4" style={{ background: `${color}0d`, border: `1px solid ${color}33` }}>
                  <div className="text-[10px] font-mono tracking-widest mb-2 px-1 flex items-center gap-1.5" style={{ color }}>
                    <span>🗣️</span> {title}
                  </div>
                  <SectionContent title={title} body={body} color={color} onToggleSelect={handleToggleSelect} />
                </div>
              );
            }
            const isAccentTitle = title.toUpperCase().includes('DIAGNÓSTICO PRINCIPAL')
              || title.toUpperCase().includes('RAÍZ')
              || title.toUpperCase().includes('LÍNEA DE TIEMPO')
              || title.toUpperCase().includes('LINEA DE TIEMPO');
            return (
              <div key={title}>
                <div className="text-[10px] font-mono tracking-widest mb-2 px-1"
                  style={{ color: isAccentTitle ? color : '#3d5870' }}>
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
function LoadingScreen({ label, streamedText }: { label: string; streamedText?: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const liveRef = useRef<HTMLDivElement>(null);
  const isStreaming = !!streamedText && streamedText.length > 0;
  const msgs = pickLoadMsgs(label);

  useEffect(() => {
    setActiveIdx(0);
    if (isStreaming) return; // ya hay contenido real llegando — no simular pasos falsos
    let i = 0;
    const iv = setInterval(() => { i++; if (i < msgs.length) setActiveIdx(i); else clearInterval(iv); }, 1800);
    return () => clearInterval(iv);
  }, [isStreaming, label]);

  useEffect(() => {
    if (liveRef.current) liveRef.current.scrollTop = liveRef.current.scrollHeight;
  }, [streamedText]);

  return (
    <div className="fixed inset-0 bg-[#070a0e] z-50 flex flex-col items-center justify-center px-6">
      <div className="fixed left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(0,229,160,.4),transparent)', animation: 'scan 2.2s linear infinite' }} />
      <div className="w-full max-w-md">
        <div className="text-[#00e5a0] text-3xl font-black tracking-widest mb-1">APEX</div>
        <div className="font-mono text-[10px] tracking-[4px] text-[#3d5870] mb-8 uppercase">{label}</div>

        {isStreaming ? (
          <div ref={liveRef}
            className="h-64 overflow-y-auto rounded-lg border border-[rgba(0,229,160,.2)] bg-[rgba(0,229,160,.03)] p-4 font-mono text-[11px] leading-relaxed text-[#7a95aa] whitespace-pre-wrap">
            {streamedText}
            <span className="inline-block w-1.5 h-3.5 bg-[#00e5a0] ml-0.5 align-middle" style={{ animation: 'blink 1s step-end infinite' }} />
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-6">
            {msgs.map((msg, i) => (
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
        )}

        {!isStreaming && (
          <div className="h-0.5 bg-[#1e2d3d] rounded overflow-hidden">
            <div className="h-full rounded transition-all duration-[1800ms] ease-out"
              style={{ width: `${((activeIdx + 1) / msgs.length) * 100}%`, background: 'linear-gradient(90deg, #0ea5e9, #00e5a0)' }} />
          </div>
        )}
      </div>
      <style>{`
        @keyframes scan { 0% { top: 0 } 100% { top: 100vh } }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(0,229,160,.4)} 60%{box-shadow:0 0 0 6px rgba(0,229,160,0)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}

// ─── Disclaimer clínico ───────────────────────────────────────────────────────
// Se muestra en toda pantalla donde el sistema sugiere un diagnóstico o un protocolo.
function AIDisclaimer() {
  return (
    <p className="flex items-start gap-1 text-[9px] text-[#7a95aa] leading-snug mb-3 px-1">
      <span className="text-[#f59e0b] flex-shrink-0 text-[10px]">⚠</span>
      <span>
        <span className="text-[#f59e0b] font-medium">Generado con apoyo de IA</span> — no sustituye el criterio médico. El médico tratante revisa, valida y acepta cada diagnóstico e intervención.
      </span>
    </p>
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
  round = 1,
  maxRound = 1,
}: {
  questions: string[];
  answers: string[];
  setAnswers: (a: string[]) => void;
  onSubmit: () => void;
  onSkip: () => void;
  loadingAnalysis: boolean;
  round?: number;
  maxRound?: number;
}) {
  const isLastRound = round >= maxRound;
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
              : `Para el análisis necesito completar la información del paciente (${questions.length} ${questions.length === 1 ? 'pregunta' : 'preguntas'}). Responde lo que puedas o continúa.`}
          </p>
          {round >= 2 && questions.length > 0 && (
            <p className="text-[11px] text-[#f59e0b] mt-1">
              Ronda {round} de {maxRound}{isLastRound ? ' (última ronda de seguimiento)' : ' — puede haber una ronda más si hace falta'}.
            </p>
          )}
        </div>
      </div>

      {questions.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {questions.map((q, i) => {
            const mm = q.match(/^\s*\[(.+?)\]\s*(.*)$/);
            const dominio = mm ? mm[1] : '';
            const texto = mm ? mm[2] : q;
            return (
            <div key={i} className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-[10px] font-mono px-2 py-1 rounded-lg flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(167,139,250,.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,.25)' }}>
                  P{i + 1}
                </span>
                <div className="flex-1">
                  {dominio && <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-[#00e5a0] mb-1">{dominio}</span>}
                  <p className="text-lg text-[#dde6ef] leading-relaxed font-serif">{texto}</p>
                </div>
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
            );
          })}
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <button
          onClick={onSubmit}
          disabled={loadingAnalysis}
          className="px-6 py-2.5 text-black text-sm font-bold rounded-xl disabled:opacity-40 transition"
          style={{ background: '#00e5a0' }}>
          {loadingAnalysis ? 'Procesando...' : (isLastRound ? 'Continuar a diagnóstico →' : 'Enviar respuestas →')}
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
  selected, onToggle, onContinue, available = ALL_TYPES,
}: {
  selected: AnalysisType[]; onToggle: (t: AnalysisType) => void; onContinue: () => void;
  available?: AnalysisType[];
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
        {available.map(t => {
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
  const [step, setStep]     = useState<Step>('select');   // entra directo al selector de análisis (sin pantalla intermedia)
  const [loadingLabel, setLoadingLabel] = useState('');
  const [streamedText, setStreamedText] = useState('');
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
  const [funcRound, setFuncRound]     = useState(1);              // ronda 1 o 2
  const [funcPrevQA, setFuncPrevQA]   = useState<{ q: string; a: string }[]>([]);
  // Longevidad — cuestionario con hasta 2 rondas
  const [longClarifyQuestions, setLongClarifyQuestions] = useState<string[]>([]);
  const [longClarifyAnswers, setLongClarifyAnswers]     = useState<string[]>([]);
  const [longRound, setLongRound]     = useState(1);
  const [longPrevQA, setLongPrevQA]   = useState<{ q: string; a: string }[]>([]);

  const qaToText = (qa: { q: string; a: string }[]): string => {
    const withA = qa.filter(x => (x.a || '').trim());
    if (!withA.length) return '';
    return withA.map(x => `${x.q}\n${x.a.trim()}`).join('\n\n');
  };

  // Rondas de interrogatorio dirigido permitidas por etapa (convencional = 1, sin follow-up).
  // Funcional y longevidad: las rondas son un TOPE, no una meta. La IA debe preguntar SOLO lo
  // que realmente falta y parar en cuanto tenga lo esencial (no llenar el espacio disponible).
  const MAX_FUNC_ROUNDS = 4;
  const MAX_LONG_ROUNDS = 3;
  const MAX_Q_PER_ROUND = 10;

  // Q&A dirigido de la etapa convencional (las preguntas de aclaración iniciales + respuestas).
  const convQA = (): { q: string; a: string }[] =>
    clarifyQuestions.map((q, i) => ({ q, a: clarifyAnswers[i] || '' }));

  // Q&A dirigido acumulado de la etapa funcional (todas sus rondas) — se fija al cerrar funcional.
  const [funcQAAll, setFuncQAAll] = useState<{ q: string; a: string }[]>([]);

  // Arma el bloque de "interrogatorio dirigido previo" (encadenado) para pasarlo a la etapa siguiente.
  const labeledPriorQA = (sections: { title: string; qa: { q: string; a: string }[] }[]): string =>
    sections
      .map(s => { const t = qaToText(s.qa); return t ? `## ${s.title}\n${t}` : ''; })
      .filter(Boolean)
      .join('\n\n');

  const priorForFunctional = (): string =>
    labeledPriorQA([{ title: 'Interrogatorio dirigido — Medicina convencional', qa: convQA() }]);

  const priorForLongevity = (): string =>
    labeledPriorQA([
      { title: 'Interrogatorio dirigido — Medicina convencional', qa: convQA() },
      { title: 'Interrogatorio dirigido — Medicina funcional', qa: funcQAAll },
    ]);

  // Servicios de IA contratados (para ofrecer solo las voces habilitadas)
  const [aiFeatures, setAiFeatures] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        const headers: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
        const r = await fetch(`${apiBase}/staff/entitlements`, { headers });
        if (r.ok) setAiFeatures((await r.json()).features || {});
      } catch { /* si falla, se ofrecen todas */ }
    })();
  }, []); // eslint-disable-line
  const availableTypes = useMemo<AnalysisType[]>(() => ALL_TYPES.filter(t =>
    t === 'traditional'
    || (t === 'functional' && aiFeatures?.ia_funcional !== false)
    || (t === 'longevity' && aiFeatures?.ia_longevidad !== false)
  ), [aiFeatures]);

  // Selección de tipos de análisis a ejecutar
  const [selectedTypes, setSelectedTypes] = useState<AnalysisType[]>(['traditional', 'functional', 'longevity']);
  // Al conocer los servicios, quita de la selección lo no contratado
  useEffect(() => { setSelectedTypes(prev => prev.filter(t => availableTypes.includes(t))); }, [availableTypes]);
  const activeTypes = useMemo(() => ALL_TYPES.filter(t => selectedTypes.includes(t)), [selectedTypes]);
  const stepOrder = useMemo<Step[]>(() => {
    // Flujo intercalado por especialidad: diagnóstico → tratamiento → (siguiente especialidad).
    // Así cada voz posterior recibe el diagnóstico Y el tratamiento ya aceptados de las anteriores.
    const seq = activeTypes.flatMap(t => [`review_${t}` as Step, `review_protocol_${t}` as Step]);
    return [...seq, 'documents'];
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

  // Preferencia que el sistema ofrece recordar tras un cambio del médico en el chat.
  const [pendingPref, setPendingPref] = useState<
    { tipo: string; de_item: string; a_item: string; descripcion: string } | null
  >(null);

  const apiBase = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  // Headers de auth con token SIEMPRE fresco: getSession() refresca el access_token si está
  // por expirar (Supabase autoRefresh). Evita sacar al médico a media entrevista larga (>1h)
  // por token vencido. Si getSession falla, cae al token en caché como último recurso.
  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    let t = token;
    try {
      const s = await getSession();
      if (s?.access_token) {
        t = s.access_token;
        if (s.access_token !== token) setToken(s.access_token);
      }
    } catch { /* usa el token en caché */ }
    return { Authorization: `Bearer ${t || ''}`, 'Content-Type': 'application/json' };
  }, [token]);

  // Consume un endpoint de streaming SSE (deltas de texto en vivo + un evento final
  // "done" con el JSON completo). onDelta actualiza la UI en vivo; el retorno es el
  // JSON del evento "done".
  const streamSSE = useCallback(async (url: string, body: any, onDelta: (text: string) => void): Promise<any> => {
    const res = await fetch(url, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) });
    if (!res.ok || !res.body) {
      let msg = 'Error de streaming';
      try { const t = await res.text(); try { msg = JSON.parse(t).detail || t || msg; } catch { msg = t || msg; } } catch {}
      const err: any = new Error(msg); err.status = res.status; throw err;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done: any = null;
    let errMsg = '';
    let acc = '';  // texto acumulado, por si el stream se corta antes del evento final
    while (true) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let payload: any;
        try { payload = JSON.parse(line.slice(6)); } catch { continue; }
        if (payload.type === 'delta') { onDelta(payload.text); acc += payload.text || ''; }
        else if (payload.type === 'done') done = payload;
        else if (payload.type === 'error') errMsg = payload.message || 'Error en el análisis';
      }
    }
    if (done) return done;
    // El stream se cortó sin evento final. Si ya llegó texto suficiente, lo APROVECHAMOS
    // (no perder el diagnóstico); si no, mostramos el error real del backend.
    if (acc.trim().length > 40) {
      return { diagnosis: acc, validation: null, confidence: 0, _salvaged: true };
    }
    throw new Error(errMsg || 'El análisis se interrumpió antes de terminar. Intenta de nuevo (tus respuestas se conservan).');
  }, [authHeaders]);

  useEffect(() => {
    const init = async () => {
      const u = await getUser();
      if (!u) { router.push('/auth/login'); return; }
      const session = await getSession();
      setToken(session?.access_token || null);
    };
    init();
  }, [router]);

  // ── Autoguardado local del interrogatorio (para no perder nada si la sesión caduca) ──
  // Guarda todo el avance de la consulta en localStorage por visita. Si el médico tiene que
  // volver a iniciar sesión a media entrevista, al regresar a esta visita se restaura solo.
  const STORAGE_KEY = `apex_analysis_draft_${visit_id}`;
  const hydratedRef = useRef(false);
  const [restored, setRestored] = useState(false);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* entorno sin storage */ }
  }, [STORAGE_KEY]);

  // Restaurar (una sola vez, al montar) lo guardado de esta visita.
  useEffect(() => {
    if (!visit_id || hydratedRef.current) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        // TTL de 24h para no resucitar sesiones viejas.
        if (s && s.savedAt && (Date.now() - s.savedAt) < 24 * 60 * 60 * 1000) {
          if (s.step) setStep(s.step);
          if (typeof s.completedStepIdx === 'number') setCompletedStepIdx(s.completedStepIdx);
          if (Array.isArray(s.selectedTypes)) setSelectedTypes(s.selectedTypes);
          if (Array.isArray(s.clarifyQuestions)) setClarifyQuestions(s.clarifyQuestions);
          if (Array.isArray(s.clarifyAnswers)) setClarifyAnswers(s.clarifyAnswers);
          if (Array.isArray(s.funcClarifyQuestions)) setFuncClarifyQuestions(s.funcClarifyQuestions);
          if (Array.isArray(s.funcClarifyAnswers)) setFuncClarifyAnswers(s.funcClarifyAnswers);
          if (typeof s.funcRound === 'number') setFuncRound(s.funcRound);
          if (Array.isArray(s.funcPrevQA)) setFuncPrevQA(s.funcPrevQA);
          if (Array.isArray(s.funcQAAll)) setFuncQAAll(s.funcQAAll);
          if (Array.isArray(s.longClarifyQuestions)) setLongClarifyQuestions(s.longClarifyQuestions);
          if (Array.isArray(s.longClarifyAnswers)) setLongClarifyAnswers(s.longClarifyAnswers);
          if (typeof s.longRound === 'number') setLongRound(s.longRound);
          if (Array.isArray(s.longPrevQA)) setLongPrevQA(s.longPrevQA);
          if (s.traditional) setTraditional(s.traditional);
          if (s.functional) setFunctional(s.functional);
          if (s.longevity) setLongevity(s.longevity);
          if (s.protTrad) setProtTrad(s.protTrad);
          if (s.protFunc) setProtFunc(s.protFunc);
          if (s.protLong) setProtLong(s.protLong);
          // Solo avisamos si había algo capturado que valga la pena.
          const algoCapturado = (s.clarifyAnswers || []).some((x: string) => (x || '').trim())
            || (s.funcClarifyAnswers || []).some((x: string) => (x || '').trim())
            || (s.longClarifyAnswers || []).some((x: string) => (x || '').trim())
            || !!(s.traditional?.doctor_text || s.functional?.doctor_text || s.longevity?.doctor_text);
          if (algoCapturado) setRestored(true);
        }
      }
    } catch { /* JSON corrupto / sin storage: empezar limpio */ }
    hydratedRef.current = true;
  }, [visit_id, STORAGE_KEY]);

  // Guardar el avance cada vez que cambie algo relevante (tras hidratar).
  useEffect(() => {
    if (!visit_id || !hydratedRef.current) return;
    // Al terminar (documentos/completo) ya no es un borrador: se limpia.
    if (step === 'documents' || step === 'complete') { clearDraft(); return; }
    try {
      const snap = {
        step, completedStepIdx, selectedTypes,
        clarifyQuestions, clarifyAnswers,
        funcClarifyQuestions, funcClarifyAnswers, funcRound, funcPrevQA, funcQAAll,
        longClarifyQuestions, longClarifyAnswers, longRound, longPrevQA,
        traditional, functional, longevity, protTrad, protFunc, protLong,
        savedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch { /* cuota excedida / ventana privada: no bloquear el flujo */ }
  }, [visit_id, STORAGE_KEY, clearDraft, step, completedStepIdx, selectedTypes,
      clarifyQuestions, clarifyAnswers, funcClarifyQuestions, funcClarifyAnswers,
      funcRound, funcPrevQA, funcQAAll, longClarifyQuestions, longClarifyAnswers,
      longRound, longPrevQA, traditional, functional, longevity, protTrad, protFunc, protLong]);

  // ── Load patient data ───────────────────────────────────────────────────────
  const loadPatientData = async (): Promise<any> => {
    const headers = await authHeaders();
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
      init: '', clarifying: '', clarifying_functional: '', clarifying_longevity: '', select: '', loading: '', documents: '', complete: '',
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
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ question: q, current_diagnosis: getCurrentDiagnosisText() }),
      });
      const json = await res.json();
      const answer = json.answer || 'Error al obtener respuesta';
      setChatMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      // Si el médico confirmó una edición, el backend devuelve el reporte completo actualizado:
      // lo escribimos directamente sobre el paso actual (se re-renderiza al instante).
      if (json.updated_report && typeof json.updated_report === 'string' && json.updated_report.trim()) {
        const { setState } = getCurrentSetters();
        setState(prev => ({ ...prev, doctor_text: json.updated_report.trim(), approved: [] }));
        setChatMessages(prev => [...prev, { role: 'divider', content: '✓ Reporte actualizado en pantalla' }]);
        // El sistema aprende del médico: si el cambio es generalizable, ofrecerle recordarlo.
        if (json.preferencia_sugerida) setPendingPref(json.preferencia_sugerida);
      }
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
        headers: await authHeaders(),
        body: JSON.stringify({ patient_data: data, selected_type: first }),
      });
      const json = await res.json();
      const questions: string[] = json.questions || [];
      setClarifyQuestions(questions);
      setClarifyAnswers(new Array(questions.length).fill(''));
      // Sin preguntas de seguimiento ⇒ el caso ya es claro: continúa directo al
      // diagnóstico en vez de dejar al médico en una pantalla vacía con un botón
      // (mismo comportamiento que funcional/longevidad).
      if (questions.length === 0) {
        return finalizeFirstDiagnosis([]);
      }
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
    setStreamedText('');
    setError('');
    setChatMessages([]);
    setEditMode(false);
    try {
      const doctorAnswers = buildDoctorAnswersText(answers);
      const json = await streamSSE(
        `${apiBase}/analyze/${visit_id}/finalize_first/stream`,
        { doctor_answers: doctorAnswers },
        (delta) => setStreamedText(prev => prev + delta),
      );
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
        method: 'POST', headers: await authHeaders(), body: JSON.stringify(payload),
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
    setFuncRound(1); setFuncPrevQA([]); setFuncQAAll([]);
    setFuncClarifyLoading(true);
    setStep('loading');
    setLoadingLabel('PREPARANDO CUESTIONARIO FUNCIONAL...');
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/clarify_functional`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          doctor_traditional: traditional.doctor_text, patient_id,
          prior_qa: priorForFunctional(),                 // encadena el Q&A convencional
          es_ultima_ronda: MAX_FUNC_ROUNDS <= 1,
        }),
      });
      const json = await res.json();
      const questions: string[] = (json.questions || []).slice(0, MAX_Q_PER_ROUND);
      setFuncClarifyQuestions(questions);
      setFuncClarifyAnswers(new Array(questions.length).fill(''));
      if (questions.length === 0) { setFuncQAAll([]); return startFunctional(''); }
      setStep('clarifying_functional');
    } catch (e: any) {
      setFuncClarifyQuestions([]); setFuncClarifyAnswers([]);
      setFuncQAAll([]);
      return startFunctional('');
    } finally {
      setFuncClarifyLoading(false);
    }
  };

  // Envío del cuestionario funcional: hasta MAX_FUNC_ROUNDS rondas; cada ronda acumula el Q&A.
  const submitFuncClarify = async () => {
    const round = funcClarifyQuestions.map((q, i) => ({ q, a: funcClarifyAnswers[i] || '' }));
    const accumulated = [...funcPrevQA, ...round];   // todo el Q&A funcional hasta ahora
    if (funcRound >= MAX_FUNC_ROUNDS) {
      setFuncQAAll(accumulated);
      return startFunctional(qaToText(accumulated));
    }
    setFuncClarifyLoading(true);
    setStep('loading');
    setLoadingLabel('REVISANDO RESPUESTAS...');
    try {
      const nextRound = funcRound + 1;
      const res = await fetch(`${apiBase}/analyze/${visit_id}/clarify_functional`, {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({
          doctor_traditional: traditional.doctor_text, patient_id,
          previous: accumulated,                          // acumulado de ESTA etapa (todas las rondas)
          prior_qa: priorForFunctional(),                 // encadena el Q&A convencional
          es_ultima_ronda: nextRound >= MAX_FUNC_ROUNDS,
        }),
      });
      const q2: string[] = ((await res.json()).questions || []).slice(0, MAX_Q_PER_ROUND);
      if (q2.length === 0) { setFuncQAAll(accumulated); return startFunctional(qaToText(accumulated)); }
      setFuncPrevQA(accumulated); setFuncRound(nextRound);
      setFuncClarifyQuestions(q2); setFuncClarifyAnswers(new Array(q2.length).fill(''));
      setStep('clarifying_functional');
    } catch {
      setFuncQAAll(accumulated);
      return startFunctional(qaToText(accumulated));
    } finally { setFuncClarifyLoading(false); }
  };

  const startFunctional = async (doctorAnswersOverride?: string) => {
    setStep('loading');
    setLoadingLabel('ANALIZANDO — MEDICINA FUNCIONAL');
    if (doctorAnswersOverride === undefined) addDivider('── Diagnóstico Funcional ──');
    else { setChatMessages([]); setError(''); }
    setEditMode(false);
    setStreamedText('');
    try {
      const json = await streamSSE(
        `${apiBase}/analyze/${visit_id}/functional/stream`,
        {
          doctor_traditional: traditional.doctor_text,
          ai_traditional_original: traditional.ai_text,
          protocol_traditional: protTrad.doctor_text,
          doctor_answers: doctorAnswersOverride || '',
          prior_qa: priorForFunctional(),               // Q&A dirigido convencional (encadenado)
          patient_id,
        },
        (delta) => setStreamedText(prev => prev + delta),
      );
      setFunctional({ ai_text: json.diagnosis, doctor_text: json.diagnosis, validation: json.validation, confirmed: false, confidence: json.confidence || 75 });
      enterStep('review_functional');
    } catch (e: any) {
      setError(e.message || 'Error');
      // Si venía del cuestionario, regresa a ÉL (conserva las respuestas) en vez de a 'select',
      // para no perder lo capturado; así puede reintentar tras resolver el problema (p. ej. créditos).
      setStep(doctorAnswersOverride === undefined ? 'review_traditional' : 'clarifying_functional');
    }
  };

  const startLongevity = async (doctorAnswersOverride?: string) => {
    setStep('loading');
    setLoadingLabel('ANALIZANDO — LONGEVIDAD');
    if (doctorAnswersOverride === undefined) addDivider('── Diagnóstico Longevidad ──');
    else { setChatMessages([]); setError(''); }
    setEditMode(false);
    setStreamedText('');
    try {
      const json = await streamSSE(
        `${apiBase}/analyze/${visit_id}/longevity/stream`,
        {
          doctor_traditional: traditional.doctor_text,
          doctor_functional: functional.doctor_text,
          ai_traditional_original: traditional.ai_text,
          ai_functional_original: functional.ai_text,
          protocol_traditional: protTrad.doctor_text,
          protocol_functional: protFunc.doctor_text,
          doctor_answers: doctorAnswersOverride || '',
          prior_qa: priorForLongevity(),                // Q&A convencional + funcional (encadenado)
          patient_id,
        },
        (delta) => setStreamedText(prev => prev + delta),
      );
      setLongevity({ ai_text: json.diagnosis, doctor_text: json.diagnosis, validation: json.validation, confirmed: false, confidence: json.confidence || 75 });
      enterStep('review_longevity');
    } catch (e: any) {
      setError(e.message || 'Error');
      // Conserva el cuestionario de longevidad si venía de él (no pierde respuestas).
      setStep(doctorAnswersOverride === undefined ? (activeTypes.includes('functional') ? 'review_functional' : 'review_traditional') : 'clarifying_longevity');
    }
  };

  // ── Antes de longevidad: cuestionario de longevidad (hasta MAX_LONG_ROUNDS rondas) ─────────
  const startClarifyLongevity = async () => {
    setError('');
    setLongRound(1); setLongPrevQA([]);
    setStep('loading');
    setLoadingLabel('PREPARANDO CUESTIONARIO DE LONGEVIDAD...');
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/clarify_longevity`, {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({
          doctor_functional: functional.doctor_text, patient_id,
          prior_qa: priorForLongevity(),                 // encadena Q&A convencional + funcional
          es_ultima_ronda: MAX_LONG_ROUNDS <= 1,
        }),
      });
      const questions: string[] = ((await res.json()).questions || []).slice(0, MAX_Q_PER_ROUND);
      setLongClarifyQuestions(questions);
      setLongClarifyAnswers(new Array(questions.length).fill(''));
      if (questions.length === 0) return startLongevity('');
      setStep('clarifying_longevity');
    } catch {
      setLongClarifyQuestions([]); setLongClarifyAnswers([]);
      return startLongevity('');
    }
  };

  const submitLongClarify = async () => {
    const round = longClarifyQuestions.map((q, i) => ({ q, a: longClarifyAnswers[i] || '' }));
    const accumulated = [...longPrevQA, ...round];
    if (longRound >= MAX_LONG_ROUNDS) {
      return startLongevity(qaToText(accumulated));
    }
    setStep('loading');
    setLoadingLabel('REVISANDO RESPUESTAS...');
    try {
      const nextRound = longRound + 1;
      const res = await fetch(`${apiBase}/analyze/${visit_id}/clarify_longevity`, {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({
          doctor_functional: functional.doctor_text, patient_id,
          previous: accumulated,                          // acumulado de ESTA etapa
          prior_qa: priorForLongevity(),                 // encadena Q&A convencional + funcional
          es_ultima_ronda: nextRound >= MAX_LONG_ROUNDS,
        }),
      });
      const q2: string[] = ((await res.json()).questions || []).slice(0, MAX_Q_PER_ROUND);
      if (q2.length === 0) return startLongevity(qaToText(accumulated));
      setLongPrevQA(accumulated); setLongRound(nextRound);
      setLongClarifyQuestions(q2); setLongClarifyAnswers(new Array(q2.length).fill(''));
      setStep('clarifying_longevity');
    } catch {
      return startLongevity(qaToText(accumulated));
    }
  };

  const startProtocol = async (type: AnalysisType) => {
    setStep('loading');
    setLoadingLabel(`GENERANDO — ${TYPE_META[type].protoBadge}`);
    setStreamedText('');
    addDivider(`── ${TYPE_META[type].protoLabel} ──`);
    setEditMode(false);
    try {
      const json = await streamSSE(
        `${apiBase}/analyze/${visit_id}/protocol/stream`,
        { protocol_type: type, doctor_traditional: traditional.doctor_text, doctor_functional: functional.doctor_text, doctor_longevity: longevity.doctor_text },
        (delta) => setStreamedText(prev => prev + delta),
      );
      const s: DiagnosisState = {
        ai_text: json.protocol, doctor_text: json.protocol, validation: '',
        confirmed: false, confidence: 90,
        banderas: Array.isArray(json.banderas) ? json.banderas : [],
      };
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
        method: 'POST', headers: await authHeaders(),
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
      return startClarifyLongevity();
    }
  };

  /** Guarda una preferencia que el médico pidió recordar para casos futuros. */
  const saveDoctorPreference = async (pref: { tipo: string; de_item: string; a_item: string }, cuando = '') => {
    try {
      await fetch(`${apiBase}/analyze/preferences`, {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ ...pref, cuando, origen: 'chat' }),
      });
      setChatMessages(prev => [...prev, { role: 'divider', content: '★ Preferencia guardada — se aplicará en casos futuros' }]);
    } catch { /* no bloquear el flujo si falla */ }
    setPendingPref(null);
  };

  /** Registra qué aceptó/agregó/quitó el médico respecto a lo que propuso la IA.
   *  Sin datos del paciente: solo el caso clínico y el tratamiento (fire-and-forget). */
  const logPractice = async (protocolType: string, aiText: string, doctorText: string) => {
    if (!aiText || !doctorText) return;
    const dxContext = [traditional.doctor_text, functional.doctor_text]
      .filter(Boolean).join(' | ').slice(0, 400);
    fetch(`${apiBase}/analyze/${visit_id}/log_practice`, {
      method: 'POST', headers: await authHeaders(),
      body: JSON.stringify({
        protocol_type: protocolType, diagnostico_contexto: dxContext,
        ai_protocol: aiText, doctor_protocol: doctorText,
      }),
    }).catch(() => {});
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
        finalText = JSON.stringify({ items: kept, peptidos: pd.peptidos, monitoreo_general: mg });
      } else if (notes) {
        finalText = `${finalText}\n\n--- NOTAS DEL DOCTOR ---\n${notes}`;
      }
      // Aprender de la práctica real: comparar lo que propuso la IA vs lo que el médico dejó.
      const m = step.match(/^review_protocol_(traditional|functional|longevity)$/);
      if (m) logPractice(m[1], prev.ai_text, finalText);
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

      {step === 'loading' && <LoadingScreen label={loadingLabel} streamedText={streamedText} />}

      <main className="pt-16 pb-32">
        <div className="page-content px-6 py-8">

          {restored && (
            <div className="flex items-center justify-between gap-3 bg-[rgba(0,229,160,.08)] border border-[rgba(0,229,160,.3)] rounded-xl px-4 py-3 mb-5">
              <p className="text-sm text-[#00e5a0]">
                ✓ Recuperamos tu progreso de esta consulta. Puedes continuar donde te quedaste.
              </p>
              <button onClick={() => setRestored(false)}
                className="text-[#7a95aa] hover:text-[#dde6ef] text-lg leading-none px-2">✕</button>
            </div>
          )}

          {!!error && /(sesión|sesion|expir)/i.test(error) && (
            <div className="bg-[rgba(245,158,11,.08)] border border-[rgba(245,158,11,.35)] rounded-xl px-4 py-3 mb-5">
              <p className="text-sm text-[#f59e0b] font-semibold mb-1">Tu sesión expiró.</p>
              <p className="text-xs text-[#dde6ef] mb-3">
                Tranquilo: <strong>tus respuestas de esta consulta están guardadas</strong>. Inicia sesión de
                nuevo y vuelve a esta visita — retomarás justo donde te quedaste.
              </p>
              <button onClick={() => router.push('/auth/login')}
                className="px-4 py-2 bg-[#f59e0b] text-black text-xs font-bold rounded-lg hover:opacity-90 transition">
                Iniciar sesión de nuevo
              </button>
            </div>
          )}

          {/* ── INIT ── */}
          {step === 'init' && (
            <div className="text-center py-16">
              <div className="text-5xl mb-5">🔬</div>
              <h1 className="text-3xl font-serif text-[#dde6ef] mb-3">Análisis Clínico APEX</h1>
              <p className="text-[#7a95aa] text-sm max-w-md mx-auto mb-2">
                Análisis en {stepperLabels.length} pasos: {activeTypes.length || 3} diagnósticos + {activeTypes.length || 3} protocolos. Cada paso espera tu confirmación.
              </p>
              <p className="text-xs font-mono text-[#3d5870] max-w-md mx-auto mb-10">
                APEX analiza el caso completo primero, y solo si hace falta te hace las preguntas clave que necesite sobre el paciente (una ronda, máximo 10).
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
              available={availableTypes}
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
                onSubmit={submitFuncClarify}
                onSkip={() => { setFuncQAAll(funcPrevQA); startFunctional(funcRound >= 2 ? qaToText(funcPrevQA) : ''); }}
                loadingAnalysis={funcClarifyLoading}
                round={funcRound}
                maxRound={MAX_FUNC_ROUNDS}
              />
            </div>
          )}

          {step === 'clarifying_longevity' && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="px-2.5 py-1 rounded text-[10px] font-mono tracking-wider bg-[rgba(0,229,160,.1)] text-[#00e5a0] border border-[rgba(0,229,160,.25)]">
                  CUESTIONARIO DE LONGEVIDAD
                </div>
                <h2 className="text-xl font-serif text-[#dde6ef]">Antes del análisis de longevidad</h2>
              </div>
              {error && <p className="text-[#f43f5e] text-sm mb-4">{error}</p>}
              <ClarifyStep
                questions={longClarifyQuestions}
                answers={longClarifyAnswers}
                setAnswers={setLongClarifyAnswers}
                onSubmit={submitLongClarify}
                onSkip={() => startLongevity(longRound >= 2 ? qaToText(longPrevQA) : '')}
                loadingAnalysis={false}
                round={longRound}
                maxRound={MAX_LONG_ROUNDS}
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

              {/* Disclaimer clínico — aparece en TODA sugerencia de diagnóstico o protocolo */}
              <AIDisclaimer />

              {(step === 'review_functional' || step === 'review_protocol_functional') && (
                <div className="flex items-start gap-2.5 bg-[rgba(167,139,250,.07)] border border-[rgba(167,139,250,.25)] rounded-xl px-4 py-3 mb-5">
                  <span className="text-[#a78bfa] flex-shrink-0 mt-0.5">ⓘ</span>
                  <p className="text-xs text-[#dde6ef] leading-relaxed font-serif">
                    <strong className="text-[#a78bfa]">Medicina funcional: hipótesis de causa raíz.</strong> La medicina funcional busca el ORIGEN del diagnóstico convencional, no solo nombrarlo. La certeza aumenta con los estudios dirigidos que se sugieren en cada hallazgo.
                  </p>
                </div>
              )}

              {step === 'review_protocol_functional' && (
                <div className="flex items-start gap-2.5 bg-[rgba(245,158,11,.07)] border border-[rgba(245,158,11,.25)] rounded-xl px-4 py-3 mb-5">
                  <span className="text-[#f59e0b] flex-shrink-0 mt-0.5">⚠</span>
                  <p className="text-xs text-[#dde6ef] leading-relaxed font-serif">
                    <strong className="text-[#f59e0b]">Aviso COFEPRIS.</strong> Algunos suplementos o usos sugeridos pueden ser off-label o no estar registrados en México. Verifique el registro sanitario antes de prescribir.
                  </p>
                </div>
              )}

              {/* Segunda opinión: objeciones que el revisor levantó y el generador NO aceptó.
                  Se muestran para que el médico tenga la discusión completa y decida él. */}
              {state.banderas && state.banderas.length > 0 && (
                <div className="rounded-xl border mb-5 overflow-hidden"
                  style={{ borderColor: 'rgba(14,165,233,.30)', background: 'rgba(14,165,233,.05)' }}>
                  <p className="text-[10px] font-mono px-3.5 pt-2.5 pb-1.5 tracking-wider" style={{ color: '#0ea5e9' }}>
                    ⚖ SEGUNDA OPINIÓN — puntos que el revisor dejó abiertos ({state.banderas.length})
                  </p>
                  <div className="px-3.5 pb-3 space-y-2">
                    {state.banderas.map((b, i) => (
                      <div key={i} className="text-xs leading-snug">
                        {b.item && <span className="text-[#dde6ef] font-semibold">{b.item}: </span>}
                        <span className="text-[#7a95aa]">{b.problema}</span>
                        {b.accion && <span className="text-[#7a95aa] italic"> — sugerencia: {b.accion}</span>}
                      </div>
                    ))}
                  </div>
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
                anchor={(step === 'review_functional' || step === 'review_longevity')
                  ? { dxText: traditional.doctor_text, protText: protTrad.doctor_text }
                  : undefined}
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
                    { icon: '📊', label: 'Reporte paciente',     sub: 'Diagnóstico y consejos' },
                  ].map(d => (
                    <div key={d.label} className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-4">
                      <div className="text-3xl mb-2">{d.icon}</div>
                      <p className="text-sm font-semibold text-[#dde6ef]">{d.label}</p>
                      <p className="text-xs text-[#7a95aa] mt-1">{d.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button onClick={() => router.push(`/dashboard/patient/${patient_id}/visit/${visit_id}/documentos`)}
                    className="px-8 py-3 bg-[#00e5a0] text-black font-semibold rounded-xl hover:bg-[#00ffb0] transition text-sm">
                    Generar receta y documentos →
                  </button>
                  <button onClick={() => setStep('complete')}
                    className="px-6 py-3 border border-[#1e2d3d] text-[#7a95aa] font-semibold rounded-xl hover:text-[#dde6ef] transition text-sm">
                    Cerrar sin documentos
                  </button>
                </div>
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

      {/* ── ¿Recordar esta preferencia? — el sistema se adapta a la práctica del médico ── */}
      {pendingPref && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,520px)]"
          style={{ bottom: hasActionBar ? '5.5rem' : '1.5rem' }}>
          <div className="rounded-2xl border shadow-2xl p-4"
            style={{ background: '#0d1520', borderColor: 'rgba(0,229,160,.35)' }}>
            <p className="text-[10px] font-mono tracking-wider mb-1.5" style={{ color: '#00e5a0' }}>
              ★ ¿RECORDAR ESTA PREFERENCIA?
            </p>
            <p className="text-sm text-[#dde6ef] font-serif leading-snug mb-3">
              {pendingPref.descripcion}
            </p>
            <p className="text-[11px] text-[#7a95aa] leading-snug mb-3">
              Si la recuerdo, la aplicaré en casos futuros similares sin que tengas que pedirlo.
              Puedes desactivarla después.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => saveDoctorPreference(pendingPref)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold transition"
                style={{ background: '#00e5a0', color: '#000' }}>
                Recordar siempre
              </button>
              <button onClick={() => setPendingPref(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition text-[#7a95aa] border-[#2a3a4d] hover:text-[#dde6ef]">
                Solo esta vez
              </button>
            </div>
          </div>
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
