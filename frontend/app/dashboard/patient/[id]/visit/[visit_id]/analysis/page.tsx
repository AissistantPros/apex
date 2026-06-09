'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────
type Step =
  | 'init'
  | 'loading_traditional'
  | 'review_traditional'
  | 'loading_functional'
  | 'review_functional'
  | 'loading_longevity'
  | 'review_longevity'
  | 'loading_protocol_traditional'
  | 'review_protocol_traditional'
  | 'loading_protocol_functional'
  | 'review_protocol_functional'
  | 'loading_protocol_longevity'
  | 'review_protocol_longevity'
  | 'documents'
  | 'complete';

interface DiagnosisState {
  ai_text: string;       // lo que generó la IA
  doctor_text: string;   // versión final del médico (puede diferir)
  validation: string;
  confirmed: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'divider';
  content: string;
}

const STEP_INFO: Record<string, { label: string; color: string; badge: string }> = {
  review_traditional:         { label: 'Diagnóstico Tradicional',  color: '#0ea5e9', badge: 'MEDICINA TRADICIONAL' },
  review_functional:          { label: 'Diagnóstico Funcional',    color: '#00e5a0', badge: 'MEDICINA FUNCIONAL' },
  review_longevity:           { label: 'Diagnóstico Longevidad',   color: '#a78bfa', badge: 'LONGEVIDAD' },
  review_protocol_traditional:{ label: 'Protocolo Tradicional',   color: '#0ea5e9', badge: 'PROTOCOLO TRADICIONAL' },
  review_protocol_functional: { label: 'Protocolo Funcional',     color: '#00e5a0', badge: 'PROTOCOLO FUNCIONAL' },
  review_protocol_longevity:  { label: 'Protocolo Longevidad',    color: '#a78bfa', badge: 'PROTOCOLO LONGEVIDAD' },
};

// ─────────────────────────────────────────────
// Componentes
// ─────────────────────────────────────────────
const Spinner = ({ color = '#00e5a0' }: { color?: string }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4">
    <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
      style={{ borderColor: `${color}44`, borderTopColor: color }} />
    <p className="text-sm font-mono" style={{ color }}>Generando...</p>
  </div>
);

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────
export default function AnalysisPage() {
  const router = useRouter();
  const params = useParams();
  const visit_id  = params.visit_id as string;
  const patient_id = params.id as string;

  const [user, setUser]       = useState<any>(null);
  const [step, setStep]       = useState<Step>('init');
  const [patientData, setPatientData] = useState<any>(null);
  const [error, setError]     = useState('');

  // Diagnósticos
  const [traditional, setTraditional] = useState<DiagnosisState>({ ai_text: '', doctor_text: '', validation: '', confirmed: false });
  const [functional,  setFunctional]  = useState<DiagnosisState>({ ai_text: '', doctor_text: '', validation: '', confirmed: false });
  const [longevity,   setLongevity]   = useState<DiagnosisState>({ ai_text: '', doctor_text: '', validation: '', confirmed: false });
  const [protTrad,    setProtTrad]    = useState<DiagnosisState>({ ai_text: '', doctor_text: '', validation: '', confirmed: false });
  const [protFunc,    setProtFunc]    = useState<DiagnosisState>({ ai_text: '', doctor_text: '', validation: '', confirmed: false });
  const [protLong,    setProtLong]    = useState<DiagnosisState>({ ai_text: '', doctor_text: '', validation: '', confirmed: false });

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]       = useState('');
  const [chatLoading, setChatLoading]   = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Modo edición
  const [editMode, setEditMode] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  const authHeader = { Authorization: `Bearer ${user?.id}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    getUser().then(u => {
      if (!u) router.push('/auth/login');
      else setUser(u);
    });
  }, [router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Cargar datos del paciente + visita para el análisis
  const loadPatientData = async (): Promise<any> => {
    const [patRes, visRes] = await Promise.all([
      fetch(`${apiBase}/patients/${patient_id}`, { headers: authHeader }),
      fetch(`${apiBase}/visits/${patient_id}`,   { headers: authHeader }),
    ]);
    const pat = await patRes.json();
    const vis = await visRes.json();
    const visits = vis.visits || [];
    const lastVisit = visits.find((v: any) => v.id === visit_id) || visits[0] || {};
    return { ...pat, ...lastVisit };
  };

  const addDivider = (label: string) =>
    setChatMessages(prev => [...prev, { role: 'divider', content: label }]);

  // ── Paso 1: Diagnóstico Tradicional ────────────────────────────────────────
  const startTraditional = async () => {
    setStep('loading_traditional');
    setError('');
    // Paso 1: el historial empieza vacío
    setChatMessages([]);
    setEditMode(false);
    try {
      const data = await loadPatientData();
      setPatientData(data);

      const res = await fetch(`${apiBase}/analyze/${visit_id}/traditional`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();

      setTraditional({ ai_text: json.diagnosis, doctor_text: json.diagnosis, validation: json.validation, confirmed: false });
      setStep('review_traditional');
    } catch (e: any) {
      setError('Error: ' + e.message);
      setStep('init');
    }
  };

  // ── Paso 2: Diagnóstico Funcional ──────────────────────────────────────────
  const startFunctional = async () => {
    setStep('loading_functional');
    setError('');
    addDivider('── Diagnóstico Funcional ──');
    setEditMode(false);
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/functional`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          doctor_traditional:       traditional.doctor_text,
          ai_traditional_original:  traditional.ai_text,   // lo que propuso la IA
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();

      setFunctional({ ai_text: json.diagnosis, doctor_text: json.diagnosis, validation: json.validation, confirmed: false });
      setStep('review_functional');
    } catch (e: any) {
      setError('Error: ' + e.message);
      setStep('review_traditional');
    }
  };

  // ── Paso 3: Diagnóstico Longevidad ─────────────────────────────────────────
  const startLongevity = async () => {
    setStep('loading_longevity');
    setError('');
    addDivider('── Diagnóstico Longevidad ──');
    setEditMode(false);
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/longevity`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          doctor_traditional:       traditional.doctor_text,
          doctor_functional:        functional.doctor_text,
          ai_traditional_original:  traditional.ai_text,
          ai_functional_original:   functional.ai_text,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();

      setLongevity({ ai_text: json.diagnosis, doctor_text: json.diagnosis, validation: json.validation, confirmed: false });
      setStep('review_longevity');
    } catch (e: any) {
      setError('Error: ' + e.message);
      setStep('review_functional');
    }
  };

  // ── Pasos 4-6: Protocolos ──────────────────────────────────────────────────
  const startProtocol = async (type: 'traditional' | 'functional' | 'longevity') => {
    const loadingStep = `loading_protocol_${type}` as Step;
    const reviewStep  = `review_protocol_${type}` as Step;
    setStep(loadingStep);
    setError('');
    addDivider(`── Protocolo ${type.charAt(0).toUpperCase() + type.slice(1)} ──`);
    setEditMode(false);
    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/protocol`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          protocol_type:       type,
          doctor_traditional:  traditional.doctor_text,
          doctor_functional:   functional.doctor_text,
          doctor_longevity:    longevity.doctor_text,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();

      const setter = type === 'traditional' ? setProtTrad : type === 'functional' ? setProtFunc : setProtLong;
      setter({ ai_text: json.protocol, doctor_text: json.protocol, validation: '', confirmed: false });
      setStep(reviewStep);
    } catch (e: any) {
      setError('Error: ' + e.message);
    }
  };

  // ── Chat ────────────────────────────────────────────────────────────────────
  const getCurrentStepKey = (): string => {
    if (step === 'review_traditional') return 'traditional';
    if (step === 'review_functional')  return 'functional';
    if (step === 'review_longevity')   return 'longevity';
    if (step === 'review_protocol_traditional') return 'protocol_traditional';
    if (step === 'review_protocol_functional')  return 'protocol_functional';
    if (step === 'review_protocol_longevity')   return 'protocol_longevity';
    return 'traditional';
  };

  const getCurrentDiagnosisText = (): string => {
    if (step === 'review_traditional') return traditional.doctor_text;
    if (step === 'review_functional')  return functional.doctor_text;
    if (step === 'review_longevity')   return longevity.doctor_text;
    if (step === 'review_protocol_traditional') return protTrad.doctor_text;
    if (step === 'review_protocol_functional')  return protFunc.doctor_text;
    if (step === 'review_protocol_longevity')   return protLong.doctor_text;
    return '';
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const q = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    const userMsg: ChatMessage = { role: 'user', content: q };
    setChatMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch(`${apiBase}/analyze/${visit_id}/${getCurrentStepKey()}/chat`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          question: q,
          current_diagnosis: getCurrentDiagnosisText(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: json.answer }]);
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + e.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Helpers para aceptar/editar ─────────────────────────────────────────────
  const getCurrentSetters = () => {
    if (step === 'review_traditional') return { state: traditional, setState: setTraditional };
    if (step === 'review_functional')  return { state: functional,  setState: setFunctional };
    if (step === 'review_longevity')   return { state: longevity,   setState: setLongevity };
    if (step === 'review_protocol_traditional') return { state: protTrad, setState: setProtTrad };
    if (step === 'review_protocol_functional')  return { state: protFunc, setState: setProtFunc };
    if (step === 'review_protocol_longevity')   return { state: protLong, setState: setProtLong };
    return { state: traditional, setState: setTraditional };
  };

  // Qué pasa al click "Continuar"
  const handleContinue = () => {
    const { setState } = getCurrentSetters();
    setState(prev => ({ ...prev, confirmed: true }));

    if (step === 'review_traditional')          return startFunctional();
    if (step === 'review_functional')           return startLongevity();
    if (step === 'review_longevity')            return startProtocol('traditional');
    if (step === 'review_protocol_traditional') return startProtocol('functional');
    if (step === 'review_protocol_functional')  return startProtocol('longevity');
    if (step === 'review_protocol_longevity')   return setStep('documents');
  };

  // ── Info del step actual ────────────────────────────────────────────────────
  const info = STEP_INFO[step] || { label: '', color: '#00e5a0', badge: '' };
  const { state, setState } = getCurrentSetters();
  const isReviewStep = step.startsWith('review_');
  const isLoadingStep = step.startsWith('loading_');
  const isProtocolStep = step.startsWith('review_protocol_');

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav />

      <main className="pt-16 pb-32">
        <div className="max-w-3xl mx-auto px-4 py-8">

          {/* ── INICIO ── */}
          {step === 'init' && (
            <div className="text-center py-12">
              <div className="text-6xl mb-6">🔬</div>
              <h1 className="text-3xl font-serif text-[#dde6ef] mb-3">Análisis Clínico APEX</h1>
              <p className="text-[#7a95aa] mb-2 max-w-md mx-auto">
                El análisis es paso a paso. Cada diagnóstico espera tu confirmación antes de continuar.
              </p>
              <p className="text-xs font-mono text-[#3d5870] mb-8 max-w-md mx-auto">
                Tu versión final de cada paso es la que alimenta los siguientes.
              </p>

              {/* Pasos visuales */}
              <div className="flex items-center justify-center gap-2 mb-10 flex-wrap">
                {[
                  { n: 1, label: 'Tradicional', color: '#0ea5e9' },
                  { n: 2, label: 'Funcional', color: '#00e5a0' },
                  { n: 3, label: 'Longevidad', color: '#a78bfa' },
                  { n: 4, label: 'Protocolos', color: '#f97316' },
                  { n: 5, label: 'Documentos', color: '#f59e0b' },
                ].map((s, i) => (
                  <div key={s.n} className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black" style={{ background: s.color }}>
                        {s.n}
                      </div>
                      <span className="text-[10px] font-mono" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    {i < 4 && <div className="w-6 h-px bg-[#1e2d3d] mb-4" />}
                  </div>
                ))}
              </div>

              {error && <p className="text-[#f43f5e] text-sm mb-4">{error}</p>}

              <button onClick={startTraditional}
                className="px-8 py-3 bg-[#00e5a0] text-black font-semibold rounded-lg hover:bg-[#00ffb0] transition text-sm">
                Iniciar Análisis →
              </button>
            </div>
          )}

          {/* ── LOADING ── */}
          {isLoadingStep && (
            <Spinner color={
              step.includes('functional') ? '#00e5a0' :
              step.includes('longevity')  ? '#a78bfa' :
              step.includes('protocol')   ? '#f97316' : '#0ea5e9'
            } />
          )}

          {/* ── REVIEW: Diagnóstico o Protocolo ── */}
          {isReviewStep && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="px-2 py-1 rounded text-[10px] font-mono" style={{ background: `${info.color}15`, color: info.color, border: `1px solid ${info.color}33` }}>
                  {info.badge}
                </div>
                <h2 className="text-xl font-serif text-[#dde6ef]">{info.label}</h2>
              </div>

              {/* Diagnóstico */}
              {!editMode ? (
                <div className="bg-[#0d1520] border rounded-lg p-5" style={{ borderColor: `${info.color}33` }}>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-mono text-[#7a95aa]">
                      {state.confirmed ? '✓ CONFIRMADO — TU VERSIÓN FINAL' : 'GENERADO POR IA'}
                    </span>
                    <button onClick={() => setEditMode(true)}
                      className="text-xs font-mono px-2 py-1 rounded border border-[#1e2d3d] text-[#7a95aa] hover:border-[#f97316] hover:text-[#f97316] transition">
                      ✏️ Editar
                    </button>
                  </div>
                  <div className="text-sm text-[#dde6ef] font-serif leading-relaxed whitespace-pre-wrap">
                    {state.doctor_text}
                  </div>
                </div>
              ) : (
                <div className="bg-[#0d1520] border rounded-lg p-5" style={{ borderColor: '#f97316' }}>
                  <p className="text-xs font-mono text-[#f97316] mb-3">EDITANDO — Tu versión se usará en los pasos siguientes</p>
                  <textarea
                    value={state.doctor_text}
                    onChange={e => setState(prev => ({ ...prev, doctor_text: e.target.value }))}
                    className="w-full bg-[#111820] border border-[#1e2d3d] rounded p-3 text-[#dde6ef] text-sm font-serif leading-relaxed outline-none focus:border-[#f97316] min-h-[300px] resize-y"
                  />
                  <div className="flex gap-3 mt-3">
                    <button onClick={() => setEditMode(false)}
                      className="px-4 py-2 bg-[#f97316] text-black text-sm font-semibold rounded-lg hover:bg-[#f97316]/90 transition">
                      ✓ Guardar edición
                    </button>
                    <button onClick={() => { setState(prev => ({ ...prev, doctor_text: prev.ai_text })); setEditMode(false); }}
                      className="px-4 py-2 border border-[#1e2d3d] text-[#7a95aa] text-sm rounded-lg hover:border-[#7a95aa] transition">
                      Restaurar original IA
                    </button>
                  </div>
                </div>
              )}

              {/* Validación anti-alucinaciones */}
              {state.validation && !isProtocolStep && (
                <details className="bg-[#070a0e] border border-[#1e2d3d] rounded-lg">
                  <summary className="px-4 py-3 text-xs font-mono text-[#3d5870] cursor-pointer hover:text-[#7a95aa]">
                    🔍 Ver validación anti-alucinaciones
                  </summary>
                  <div className="px-4 pb-4 text-xs text-[#7a95aa] font-mono whitespace-pre-wrap leading-relaxed border-t border-[#1e2d3d] pt-3">
                    {state.validation}
                  </div>
                </details>
              )}

              {/* CHAT */}
              <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e2d3d]">
                  <div className="w-2 h-2 rounded-full bg-[#00e5a0]" />
                  <span className="text-xs font-mono text-[#7a95aa]">CHAT CON IA — Pregunta, aclara, o comparte nueva información</span>
                </div>

                {/* Mensajes */}
                <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-[#3d5870] font-mono">
                      Puedes preguntar sobre el diagnóstico, pedir que explique algo, o compartir información adicional que cambie el análisis...
                    </p>
                  )}
                  {chatMessages.map((m, i) => (
                    m.role === 'divider' ? (
                      <div key={i} className="flex items-center gap-2 py-1">
                        <div className="flex-1 h-px bg-[#1e2d3d]" />
                        <span className="text-[10px] font-mono text-[#3d5870] whitespace-nowrap">{m.content}</span>
                        <div className="flex-1 h-px bg-[#1e2d3d]" />
                      </div>
                    ) : (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-4 py-2.5 rounded-lg text-sm leading-relaxed ${
                          m.role === 'user'
                            ? 'bg-[#a78bfa] text-black font-medium'
                            : 'bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] font-serif'
                        }`}>
                          {m.role === 'assistant' && (
                            <div className="text-[10px] font-mono text-[#00e5a0] mb-1">APEX IA</div>
                          )}
                          {m.content}
                        </div>
                      </div>
                    )
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-[#111820] border border-[#1e2d3d] rounded-lg px-4 py-2.5">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#00e5a0] animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-[#00e5a0] animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-[#00e5a0] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div className="flex gap-2 p-3 border-t border-[#1e2d3d]">
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder="Escribe tu pregunta o información adicional..."
                    className="flex-1 bg-[#111820] border border-[#1e2d3d] rounded-lg px-3 py-2 text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0] resize-none min-h-[38px] max-h-[100px] placeholder-[#3d5870]"
                    rows={1}
                  />
                  <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                    className="px-4 py-2 bg-[#00e5a0] text-black text-sm font-semibold rounded-lg hover:bg-[#00ffb0] disabled:opacity-40 transition flex-shrink-0">
                    →
                  </button>
                </div>
              </div>

              {error && <p className="text-[#f43f5e] text-sm">{error}</p>}
            </div>
          )}

          {/* ── DOCUMENTOS ── */}
          {step === 'documents' && (
            <div className="space-y-5 text-center py-8">
              <div className="text-5xl mb-4">📄</div>
              <h2 className="text-2xl font-serif text-[#dde6ef]">Generar Documentos</h2>
              <p className="text-[#7a95aa] text-sm">Los tres diagnósticos y protocolos han sido confirmados.</p>

              <div className="grid grid-cols-3 gap-4 my-8">
                {[
                  { icon: '📋', label: 'Receta médica', sub: 'Medicamentos nivel 1' },
                  { icon: '🧪', label: 'Solicitud estudios', sub: 'Labs recomendados' },
                  { icon: '📊', label: 'Reporte completo', sub: 'Para el paciente' },
                ].map(d => (
                  <div key={d.label} className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg p-4 cursor-pointer hover:border-[#00e5a0] transition">
                    <div className="text-2xl mb-2">{d.icon}</div>
                    <p className="text-sm font-semibold text-[#dde6ef]">{d.label}</p>
                    <p className="text-xs text-[#7a95aa]">{d.sub}</p>
                    <p className="text-xs font-mono text-[#3d5870] mt-2">Próximamente</p>
                  </div>
                ))}
              </div>

              <button onClick={async () => {
                // Generar resumen de preferencias antes de cerrar
                try {
                  await fetch(`${apiBase}/analyze/${visit_id}/generate-preferences-summary?patient_id=${patient_id}`, {
                    method: 'POST',
                    headers: authHeader,
                  });
                } catch (_) {}
                setStep('complete');
              }}
                className="px-8 py-3 bg-[#00e5a0] text-black font-semibold rounded-lg hover:bg-[#00ffb0] transition text-sm">
                Cerrar Visita ✓
              </button>
            </div>
          )}

          {/* ── COMPLETO ── */}
          {step === 'complete' && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-2xl font-serif text-[#00e5a0] mb-3">Visita Completada</h2>
              <p className="text-[#7a95aa] text-sm mb-8">Todos los diagnósticos y protocolos han sido guardados.</p>
              <button onClick={() => router.push(`/dashboard/patient/${patient_id}`)}
                className="px-8 py-3 bg-[#00e5a0] text-black font-semibold rounded-lg hover:bg-[#00ffb0] transition text-sm">
                ← Volver a ficha del paciente
              </button>
            </div>
          )}

        </div>
      </main>

      {/* ── Barra de acciones inferior ── */}
      {isReviewStep && !editMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#070a0e] border-t border-[#1e2d3d] px-6 py-4 flex justify-between items-center z-40">
          <div className="text-xs font-mono text-[#3d5870]">
            {state.doctor_text !== state.ai_text
              ? '✏️ Has editado este diagnóstico — tu versión se usará en los pasos siguientes'
              : 'Puedes aceptar como está o editar antes de continuar'}
          </div>
          <button
            onClick={handleContinue}
            className="px-6 py-2.5 text-sm font-semibold rounded-lg transition text-black"
            style={{ background: info.color }}
          >
            {step === 'review_protocol_longevity' ? 'Generar Documentos →' : 'Confirmar y continuar →'}
          </button>
        </div>
      )}
    </div>
  );
}
