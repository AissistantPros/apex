'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';

// ─── Types ────────────────────────────────────────────────────────────────────
type Step =
  | 'init' | 'loading'
  | 'review_traditional' | 'review_functional' | 'review_longevity'
  | 'review_protocol_traditional' | 'review_protocol_functional' | 'review_protocol_longevity'
  | 'documents' | 'complete';

interface DiagnosisState {
  ai_text: string;
  doctor_text: string;
  validation: string;
  confirmed: boolean;
  confidence: number;
  ai_question: string | null;
}

interface ChatMsg {
  role: 'user' | 'assistant' | 'divider';
  content: string;
  ts?: number;
}

const EMPTY_DX: DiagnosisState = { ai_text: '', doctor_text: '', validation: '', confirmed: false, confidence: 75, ai_question: null };

// ─── Loading screen steps ─────────────────────────────────────────────────────
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

// ─── Step config ──────────────────────────────────────────────────────────────
const STEP_CFG: Record<string, { label: string; color: string; badge: string; stepIdx: number }> = {
  review_traditional:          { label: 'Diagnóstico Tradicional',  color: '#0ea5e9', badge: 'MEDICINA TRADICIONAL',   stepIdx: 0 },
  review_functional:           { label: 'Diagnóstico Funcional',    color: '#00e5a0', badge: 'MEDICINA FUNCIONAL',     stepIdx: 1 },
  review_longevity:            { label: 'Diagnóstico Longevidad',   color: '#a78bfa', badge: 'LONGEVIDAD',             stepIdx: 2 },
  review_protocol_traditional: { label: 'Protocolo Tradicional',    color: '#0ea5e9', badge: 'PROTOCOLO TRADICIONAL',  stepIdx: 3 },
  review_protocol_functional:  { label: 'Protocolo Funcional',      color: '#00e5a0', badge: 'PROTOCOLO FUNCIONAL',    stepIdx: 4 },
  review_protocol_longevity:   { label: 'Protocolo Longevidad',     color: '#a78bfa', badge: 'PROTOCOLO LONGEVIDAD',   stepIdx: 5 },
};

const STEPPER_LABELS = [
  { label: 'Dx Tradicional', color: '#0ea5e9' },
  { label: 'Dx Funcional',   color: '#00e5a0' },
  { label: 'Longevidad',     color: '#a78bfa' },
  { label: 'Proto Trad.',    color: '#0ea5e9' },
  { label: 'Proto Func.',    color: '#00e5a0' },
  { label: 'Proto Long.',    color: '#a78bfa' },
  { label: 'Documentos',     color: '#f59e0b' },
];

// ─── Parse sections from AI text ──────────────────────────────────────────────
function parseSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const regex = /═══\s*(.+?)\s*═══\s*\n([\s\S]*?)(?=═══|$)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    sections[m[1].trim()] = m[2].trim();
  }
  return sections;
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

// ─── Studies Section ──────────────────────────────────────────────────────────
function StudiesBlock({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n').filter(l => l.trim());
  const dots: Record<string, string> = { 'URGENTE': '#f43f5e', 'DESEADO': '#f59e0b', 'COMPLEMENTARIO': '#0ea5e9' };
  return (
    <div className="mb-5 bg-[#070a0e] border border-[#1e2d3d] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono tracking-widest text-[#3d5870]">ESTUDIOS SUGERIDOS</span>
      </div>
      <div className="flex flex-col gap-2">
        {lines.map((line, i) => {
          const level = Object.keys(dots).find(k => line.includes(k));
          const color = level ? dots[level] : '#3d5870';
          const clean = line.replace(/^[•\-\*]\s*/, '').replace(/^(URGENTE|DESEADO|COMPLEMENTARIO):\s*/i, '');
          return (
            <div key={i} className="flex items-start gap-3 bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: color, boxShadow: level === 'URGENTE' ? `0 0 6px ${color}` : 'none' }} />
              <div>
                {level && <span className="text-[10px] font-mono mr-2" style={{ color }}>{level}</span>}
                <span className="text-sm text-[#dde6ef]">{clean}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Diagnosis Card ───────────────────────────────────────────────────────────
function DiagnosisCard({ state, color, onEdit, onRestore, editMode, setEditMode, setState }: {
  state: DiagnosisState; color: string;
  onEdit: () => void; onRestore: () => void;
  editMode: boolean; setEditMode: (v: boolean) => void;
  setState: (fn: (prev: DiagnosisState) => DiagnosisState) => void;
}) {
  const sections = parseSections(state.doctor_text);
  const hasStructure = Object.keys(sections).length > 0;

  if (editMode) {
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
    <div className="bg-[#0d1520] border rounded-xl overflow-hidden mb-5" style={{ borderColor: `${color}33` }}>
      <div className="flex justify-between items-center px-5 py-3 border-b" style={{ borderColor: `${color}22` }}>
        <span className="text-xs font-mono text-[#7a95aa]">
          {state.confirmed ? '✓ CONFIRMADO' : 'GENERADO POR IA'}
          {state.doctor_text !== state.ai_text && ' · ✏️ EDITADO'}
        </span>
        <button onClick={onEdit}
          className="text-xs font-mono px-2 py-1 rounded border border-[#1e2d3d] text-[#7a95aa] hover:border-[#f97316] hover:text-[#f97316] transition">
          ✏️ Editar
        </button>
      </div>
      <div className="p-5">
        {hasStructure ? (
          <div className="space-y-5">
            {Object.entries(sections).map(([title, body]) => {
              if (title.includes('ESTUDIOS')) return null; // Rendered separately
              const isMainDx = title.includes('DIAGNÓSTICO PRINCIPAL') || title.includes('RAÍZ') || title.includes('EDAD BIOLÓGICA');
              return (
                <div key={title}>
                  <div className="text-[10px] font-mono tracking-widest mb-2" style={{ color: isMainDx ? color : '#3d5870' }}>
                    {title}
                  </div>
                  <div className="text-sm text-[#dde6ef] leading-relaxed whitespace-pre-wrap font-serif">
                    {body}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-[#dde6ef] leading-relaxed whitespace-pre-wrap font-serif">
            {state.doctor_text}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
function LoadingScreen({ label }: { label: string }) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i < LOAD_MSGS.length) setActiveIdx(i);
      else clearInterval(interval);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#070a0e] z-50 flex flex-col items-center justify-center px-6">
      {/* Scan line */}
      <div className="fixed left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(0,229,160,.4),transparent)', animation: 'scan 2.2s linear infinite' }} />

      <div className="w-full max-w-md">
        <div className="text-[#00e5a0] text-3xl font-black tracking-widest mb-1">APEX</div>
        <div className="font-mono text-[10px] tracking-[4px] text-[#3d5870] mb-8 uppercase">{label}</div>

        <div className="flex flex-col gap-2 mb-6">
          {LOAD_MSGS.map((msg, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border font-mono text-xs transition-all duration-500 ${
              i === activeIdx
                ? 'border-[rgba(0,229,160,.3)] bg-[rgba(0,229,160,.05)] text-[#00e5a0]'
                : i < activeIdx
                  ? 'border-[rgba(14,165,233,.15)] bg-transparent text-[#3d5870]'
                  : 'border-[#111820] bg-transparent text-[#1e2d3d]'
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

// ─── Floating Chat Bubble ─────────────────────────────────────────────────────
function FloatingChat({
  messages, input, setInput, onSend, loading, unread, onOpen, isOpen, setIsOpen, currentStep
}: {
  messages: ChatMsg[]; input: string; setInput: (v: string) => void;
  onSend: () => void; loading: boolean; unread: number;
  onOpen: () => void; isOpen: boolean; setIsOpen: (v: boolean) => void;
  currentStep: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const stepLabel = STEP_CFG[currentStep]?.label || 'Análisis';

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Expanded panel */}
      {isOpen && (
        <div className="w-[340px] bg-[#0d1520] border border-[#1e2d3d] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ maxHeight: '480px', boxShadow: '0 8px 40px rgba(0,0,0,.7)' }}>
          {/* Header */}
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

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0" style={{ maxHeight: 300 }}>
            {messages.length === 0 && (
              <div className="text-xs font-mono text-[#3d5870] text-center py-4">
                Pregunta sobre el diagnóstico o comparte info adicional.<br/>
                <span className="text-[#1e2d3d]">El contexto se mantiene durante toda la sesión.</span>
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
                    m.role === 'user'
                      ? 'bg-[#a78bfa] text-black font-medium'
                      : 'bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] font-serif'
                  }`}>
                    {m.role === 'assistant' && (
                      <div className="text-[9px] font-mono text-[#00e5a0] mb-1">APEX</div>
                    )}
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

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-[#1e2d3d]">
            <textarea ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder="Pregunta o nueva información..."
              rows={1}
              className="flex-1 bg-[#111820] border border-[#1e2d3d] rounded-lg px-3 py-2 text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0] resize-none min-h-[36px] max-h-[80px] placeholder-[#3d5870] transition"
            />
            <button onClick={onSend} disabled={loading || !input.trim()}
              className="px-3 py-2 bg-[#00e5a0] text-black text-sm font-bold rounded-lg hover:bg-[#00ffb0] disabled:opacity-40 transition flex-shrink-0">
              →
            </button>
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
function Stepper({ current, completed, onGoTo }: { current: number; completed: number; onGoTo: (i: number) => void }) {
  return (
    <div className="flex items-start gap-1 mb-6 overflow-x-auto pb-1">
      {STEPPER_LABELS.map((s, i) => {
        const isDone = i < completed;
        const isActive = i === current;
        const canClick = isDone;
        return (
          <div key={i} className="flex items-start gap-1 flex-shrink-0">
            <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => canClick && onGoTo(i)}>
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
            {i < STEPPER_LABELS.length - 1 && (
              <div className="h-0.5 w-4 mt-3.5 rounded" style={{ background: i < completed ? s.color : '#1e2d3d' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── AI Question Banner ───────────────────────────────────────────────────────
function AIQuestionBanner({ question, onReply }: { question: string; onReply: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="bg-[rgba(167,139,250,.07)] border border-[rgba(167,139,250,.25)] rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-black mt-0.5"
        style={{ background: 'linear-gradient(135deg,#a78bfa,#0ea5e9)' }}>A</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono text-[#a78bfa] mb-1">APEX PREGUNTA</div>
        <p className="text-sm text-[#dde6ef] leading-relaxed">{question}</p>
        <div className="flex gap-2 mt-2">
          <button onClick={onReply}
            className="text-xs px-3 py-1.5 bg-[#a78bfa] text-black font-semibold rounded-lg hover:bg-[#b49ef5] transition">
            Responder en chat
          </button>
          <button onClick={() => setDismissed(true)}
            className="text-xs px-3 py-1.5 border border-[#1e2d3d] text-[#7a95aa] rounded-lg hover:border-[#3d5870] transition">
            Ignorar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const router = useRouter();
  const params = useParams();
  const visit_id  = params.visit_id as string;
  const patient_id = params.id as string;

  const [token, setToken]   = useState<string | null>(null);
  const [step, setStep]     = useState<Step>('init');
  const [loadingLabel, setLoadingLabel] = useState('');
  const [patientData, setPatientData]   = useState<any>(null);
  const [error, setError]   = useState('');
  const [editMode, setEditMode] = useState(false);
  const [completedStepIdx, setCompletedStepIdx] = useState(-1);

  // Diagnósticos
  const [traditional, setTraditional] = useState<DiagnosisState>(EMPTY_DX);
  const [functional,  setFunctional]  = useState<DiagnosisState>(EMPTY_DX);
  const [longevity,   setLongevity]   = useState<DiagnosisState>(EMPTY_DX);
  const [protTrad,    setProtTrad]    = useState<DiagnosisState>(EMPTY_DX);
  const [protFunc,    setProtFunc]    = useState<DiagnosisState>(EMPTY_DX);
  const [protLong,    setProtLong]    = useState<DiagnosisState>(EMPTY_DX);

  // Chat (global, persiste toda la sesión)
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

  // ── Chat helpers ────────────────────────────────────────────────────────────
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
      init: '', loading: '', documents: '', complete: '',
    };
    return map[step] || '';
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const q = chatInput.trim();
    setChatInput('');
    setChatLoading(true);
    setChatMessages(prev => [...prev, { role: 'user', content: q }]);

    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/${getCurrentStepKey()}/chat`, {
        method: 'POST',
        headers: authH(),
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

  // Inject AI question into chat
  const injectAIQuestion = (question: string | null, stepLabel: string) => {
    if (!question) return;
    setChatMessages(prev => [...prev, {
      role: 'assistant',
      content: `❓ ${question}`,
    }]);
    if (!chatOpen) setChatUnread(prev => prev + 1);
  };

  // ── API calls ────────────────────────────────────────────────────────────────
  const startTraditional = async () => {
    setStep('loading');
    setLoadingLabel('ANALIZANDO — MEDICINA TRADICIONAL');
    setError('');
    setChatMessages([]);
    setEditMode(false);
    try {
      const data = await loadPatientData();
      setPatientData(data);
      const res = await fetch(`${apiBase}/analyze/${visit_id}/traditional`, {
        method: 'POST', headers: authH(), body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setTraditional({ ai_text: json.diagnosis, doctor_text: json.diagnosis, validation: json.validation, confirmed: false, confidence: json.confidence || 75, ai_question: json.ai_question || null });
      setStep('review_traditional');
      setCompletedStepIdx(-1);
      injectAIQuestion(json.ai_question, 'Dx Tradicional');
    } catch (e: any) { setError('Error: ' + e.message); setStep('init'); }
  };

  const startFunctional = async () => {
    setStep('loading');
    setLoadingLabel('ANALIZANDO — MEDICINA FUNCIONAL');
    addDivider('── Diagnóstico Funcional ──');
    setEditMode(false);
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/functional`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({ doctor_traditional: traditional.doctor_text, ai_traditional_original: traditional.ai_text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setFunctional({ ai_text: json.diagnosis, doctor_text: json.diagnosis, validation: json.validation, confirmed: false, confidence: json.confidence || 75, ai_question: json.ai_question || null });
      setStep('review_functional');
      setCompletedStepIdx(0);
      injectAIQuestion(json.ai_question, 'Dx Funcional');
    } catch (e: any) { setError('Error: ' + e.message); setStep('review_traditional'); }
  };

  const startLongevity = async () => {
    setStep('loading');
    setLoadingLabel('ANALIZANDO — LONGEVIDAD');
    addDivider('── Diagnóstico Longevidad ──');
    setEditMode(false);
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/longevity`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({ doctor_traditional: traditional.doctor_text, doctor_functional: functional.doctor_text, ai_traditional_original: traditional.ai_text, ai_functional_original: functional.ai_text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setLongevity({ ai_text: json.diagnosis, doctor_text: json.diagnosis, validation: json.validation, confirmed: false, confidence: json.confidence || 75, ai_question: json.ai_question || null });
      setStep('review_longevity');
      setCompletedStepIdx(1);
      injectAIQuestion(json.ai_question, 'Dx Longevidad');
    } catch (e: any) { setError('Error: ' + e.message); setStep('review_functional'); }
  };

  const startProtocol = async (type: 'traditional' | 'functional' | 'longevity') => {
    setStep('loading');
    setLoadingLabel(`GENERANDO — PROTOCOLO ${type.toUpperCase()}`);
    addDivider(`── Protocolo ${type} ──`);
    setEditMode(false);
    const idx = { traditional: 3, functional: 4, longevity: 5 }[type];
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/protocol`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({ protocol_type: type, doctor_traditional: traditional.doctor_text, doctor_functional: functional.doctor_text, doctor_longevity: longevity.doctor_text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const s: DiagnosisState = { ai_text: json.protocol, doctor_text: json.protocol, validation: '', confirmed: false, confidence: 90, ai_question: null };
      if (type === 'traditional') setProtTrad(s);
      else if (type === 'functional') setProtFunc(s);
      else setProtLong(s);
      setStep(`review_protocol_${type}` as Step);
      setCompletedStepIdx(idx - 1);
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

  const handleContinue = () => {
    const { setState } = getCurrentSetters();
    setState(prev => ({ ...prev, confirmed: true }));
    if (step === 'review_traditional')          return startFunctional();
    if (step === 'review_functional')           return startLongevity();
    if (step === 'review_longevity')            return startProtocol('traditional');
    if (step === 'review_protocol_traditional') return startProtocol('functional');
    if (step === 'review_protocol_functional')  return startProtocol('longevity');
    if (step === 'review_protocol_longevity')   { setStep('documents'); setCompletedStepIdx(5); }
  };

  const handleGoTo = (stepIdx: number) => {
    const stepMap: Step[] = [
      'review_traditional', 'review_functional', 'review_longevity',
      'review_protocol_traditional', 'review_protocol_functional', 'review_protocol_longevity',
      'documents',
    ];
    if (stepIdx <= completedStepIdx) setStep(stepMap[stepIdx]);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const isReviewStep = step.startsWith('review_');
  const info = STEP_CFG[step] || { label: '', color: '#00e5a0', badge: '', stepIdx: -1 };
  const { state, setState } = getCurrentSetters();
  const sections = parseSections(state.doctor_text);
  const studiesText = sections['ESTUDIOS SUGERIDOS'] || '';

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav />

      {/* Loading overlay */}
      {step === 'loading' && <LoadingScreen label={loadingLabel} />}

      <main className="pt-16 pb-32">
        <div className="max-w-3xl mx-auto px-4 py-8">

          {/* ── INIT ── */}
          {step === 'init' && (
            <div className="text-center py-16">
              <div className="text-5xl mb-5">🔬</div>
              <h1 className="text-3xl font-serif text-[#dde6ef] mb-3">Análisis Clínico APEX</h1>
              <p className="text-[#7a95aa] text-sm max-w-md mx-auto mb-2">
                Análisis en 6 pasos: 3 diagnósticos + 3 protocolos. Cada paso espera tu confirmación.
              </p>
              <p className="text-xs font-mono text-[#3d5870] max-w-md mx-auto mb-10">
                Tu versión de cada diagnóstico alimenta los pasos siguientes.
              </p>

              <div className="flex items-center justify-center gap-2 mb-10 flex-wrap">
                {STEPPER_LABELS.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black" style={{ background: s.color }}>
                        {i + 1}
                      </div>
                      <span className="text-[9px] font-mono whitespace-nowrap" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    {i < STEPPER_LABELS.length - 1 && <div className="w-5 h-px bg-[#1e2d3d] mb-4" />}
                  </div>
                ))}
              </div>

              {error && <p className="text-[#f43f5e] text-sm mb-4">{error}</p>}

              <button onClick={startTraditional}
                className="px-8 py-3 bg-[#00e5a0] text-black font-semibold rounded-xl hover:bg-[#00ffb0] transition text-sm">
                Iniciar Análisis →
              </button>
            </div>
          )}

          {/* ── REVIEW ── */}
          {isReviewStep && (
            <div>
              {/* Stepper */}
              <Stepper current={info.stepIdx} completed={completedStepIdx + 1} onGoTo={handleGoTo} />

              {/* Badge + title */}
              <div className="flex items-center gap-3 mb-5">
                <div className="px-2.5 py-1 rounded text-[10px] font-mono tracking-wider"
                  style={{ background: `${info.color}15`, color: info.color, border: `1px solid ${info.color}33` }}>
                  {info.badge}
                </div>
                <h2 className="text-xl font-serif text-[#dde6ef]">{info.label}</h2>
              </div>

              {/* AI Question Banner */}
              {state.ai_question && (
                <AIQuestionBanner
                  question={state.ai_question}
                  onReply={() => { setChatOpen(true); setChatUnread(0); }}
                />
              )}

              {/* Confidence bar */}
              <ConfidenceBar pct={state.confidence} color={info.color} />

              {/* Studies block */}
              {studiesText && <StudiesBlock text={studiesText} />}

              {/* Main diagnosis card */}
              <DiagnosisCard
                state={state}
                color={info.color}
                onEdit={() => setEditMode(true)}
                onRestore={() => { setState(prev => ({ ...prev, doctor_text: prev.ai_text })); setEditMode(false); }}
                editMode={editMode}
                setEditMode={setEditMode}
                setState={setState}
              />

              {/* Validation (collapsible) */}
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
                💬 Usa el chat (esquina inferior derecha) para preguntar o compartir info adicional
              </p>
            </div>
          )}

          {/* ── DOCUMENTS ── */}
          {step === 'documents' && (
            <div>
              <Stepper current={6} completed={6} onGoTo={handleGoTo} />
              <div className="text-center py-8">
                <div className="text-5xl mb-4">📄</div>
                <h2 className="text-2xl font-serif text-[#dde6ef] mb-2">Generar Documentos</h2>
                <p className="text-[#7a95aa] text-sm mb-8">Diagnósticos y protocolos confirmados.</p>
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[
                    { icon: '📋', label: 'Receta médica', sub: 'Medicamentos + dosis' },
                    { icon: '🔬', label: 'Solicitud estudios', sub: 'Labs recomendados' },
                    { icon: '📊', label: 'Reporte paciente', sub: 'Resumen completo' },
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
      {isReviewStep && !editMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#070a0e]/95 border-t border-[#1e2d3d] px-6 py-4 flex justify-between items-center z-40 backdrop-blur-sm">
          <div className="text-xs font-mono text-[#3d5870]">
            {state.doctor_text !== state.ai_text
              ? '✏️ Editado — tu versión se usará en los siguientes pasos'
              : 'Puedes aceptar como está o editar antes de continuar'}
          </div>
          <button onClick={handleContinue}
            className="px-6 py-2.5 text-sm font-bold rounded-xl transition text-black"
            style={{ background: info.color }}>
            {step === 'review_protocol_longevity' ? 'Generar Documentos →' : 'Confirmar y continuar →'}
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
          currentStep={step}
        />
      )}
    </div>
  );
}
