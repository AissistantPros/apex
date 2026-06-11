'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ─── Saludo dinámico ─────────────────────────────────────────────────────────
const getGreeting = (name: string) => {
  const h = new Date().getHours();
  if (h >= 0  && h < 4)  return { line1: 'Todavía en pie,',  line2: name };
  if (h >= 4  && h < 6)  return { line1: 'Madrugando,',      line2: name };
  if (h >= 6  && h < 12) return { line1: 'Buenos días,',     line2: name };
  if (h >= 12 && h < 19) return { line1: 'Buenas tardes,',   line2: name };
  if (h >= 19 && h < 24) return { line1: 'Buenas noches,',   line2: name };
  return                         { line1: 'Desvelado,',       line2: name };
};

// ─── Tipos del chat ───────────────────────────────────────────────────────────
type MsgRole = 'user' | 'assistant';
interface ChatMsg {
  id: string;
  role: MsgRole;
  content: string | Array<{ type: string; text?: string; image_data?: string; image_type?: string }>;
  displayText: string;  // siempre texto plano para mostrar
  imagePreview?: string; // URL local para preview
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser]       = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Buscador
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [allPatients, setAllPatients]   = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Chat
  const [messages, setMessages]   = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending]     = useState(false);
  const [imageFile, setImageFile] = useState<{ data: string; type: string; preview: string } | null>(null);
  const chatEndRef  = useRef<HTMLDivElement>(null);
  const imageRef    = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    getUser().then(u => {
      if (!u) { router.push('/auth/login'); return; }
      setUser(u);
      fetchData();
    });
  }, [router]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const fetchData = async () => {
    try {
      const session = await getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [pRes, profileRes] = await Promise.all([
        fetch(`${BACKEND()}/patients?limit=200`, { headers }),
        fetch(`${BACKEND()}/doctor/profile`, { headers }),
      ]);
      const pData      = await pRes.json();
      const profileData = await profileRes.json();
      setAllPatients(pData.patients || []);
      setProfile(profileData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // ── Buscador ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(
      allPatients.filter(p =>
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      ).slice(0, 8)
    );
    setShowDropdown(true);
  }, [searchQuery, allPatients]);

  // ── Chat — auto-scroll ────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // ── Chat — imagen ─────────────────────────────────────────────────────────
  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('La imagen no debe superar 8 MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setImageFile({ data: dataUrl, type: file.type, preview: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Chat — enviar ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text && !imageFile) return;
    if (sending) return;

    const userMsg: ChatMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: imageFile
        ? [
            { type: 'text',  text },
            { type: 'image', image_data: imageFile.data, image_type: imageFile.type },
          ]
        : text,
      displayText: text || '(imagen)',
      imagePreview: imageFile?.preview,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setImageFile(null);
    setSending(true);

    try {
      const session = await getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Construir historial para el backend (solo role + content)
      const history = newMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`${BACKEND()}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json();
      const assistantMsg: ChatMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'Sin respuesta.',
        displayText: data.response || 'Sin respuesta.',
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Error al conectar con el servidor. Por favor intenta de nuevo.',
        displayText: 'Error al conectar con el servidor. Por favor intenta de nuevo.',
      }]);
    } finally {
      setSending(false);
    }
  }, [inputText, imageFile, messages, sending]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Derivados ─────────────────────────────────────────────────────────────
  const displayName = profile?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] || 'Doctor';
  const clinicName = profile?.clinic_name || null;
  const photoUrl   = profile?.photo_url || profile?.clinic_logo_url || null;
  const greeting   = getGreeting(displayName);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef] text-lg">
      Cargando…
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav userName={displayName} photoUrl={photoUrl} />

      <main className="pt-16 max-w-5xl mx-auto px-6 flex flex-col gap-6 pb-10">

        {/* ── Encabezado ── */}
        <div className="flex flex-col items-center pt-10 pb-2 text-center">
          {photoUrl ? (
            <img src={photoUrl} alt="foto"
              className="w-28 h-28 rounded-full object-cover mb-5 border-2 border-[#00e5a0]/40 shadow-lg shadow-black/50" />
          ) : (
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-4xl font-black text-black mb-5 shadow-lg shadow-black/50">
              {displayName[0]?.toUpperCase() || 'D'}
            </div>
          )}
          <h1 className="text-3xl font-serif font-bold text-[#dde6ef] leading-tight">
            {greeting.line1} <span style={{ color: 'var(--c-green)' }}>{greeting.line2}</span>
          </h1>
          {clinicName && (
            <p className="text-sm text-[#7a95aa] mt-1.5 font-mono">{clinicName}</p>
          )}
        </div>

        {/* ── 3 botones grandes ── */}
        <div className="grid grid-cols-3 gap-4">
          <BigButton icon="👤" label="Paciente Nuevo" color="#00e5a0"
            onClick={() => router.push('/dashboard/new-patient/flow')} />
          <BigButton icon="📊" label="Estadísticas" color="#0ea5e9"
            onClick={() => router.push('/dashboard/stats')} />
          <BigButton icon="👥" label="Mis Pacientes" color="#a78bfa"
            onClick={() => router.push('/dashboard/patients')} />
        </div>

        {/* ── Buscador ── */}
        <div ref={searchRef} className="relative">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔍</span>
            <input type="text"
              placeholder="Buscar paciente por nombre, ID, correo o teléfono..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery && setShowDropdown(true)}
              className="w-full pl-12 pr-10 py-4 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl text-[#dde6ef] text-base placeholder-[#3d5870] outline-none focus:border-[#00e5a0] transition"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setShowDropdown(false); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3d5870] hover:text-[#dde6ef] text-2xl leading-none">×</button>
            )}
          </div>

          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden shadow-2xl z-50">
              {searchResults.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-2xl mb-1">🔍</p>
                  <p className="text-[#7a95aa] font-medium">Sin resultados para "{searchQuery}"</p>
                </div>
              ) : (
                <>
                  {searchResults.map(p => {
                    const age = (() => {
                      const dob = p.date_of_birth || p.birth_date;
                      return dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000*60*60*24*365.25)) : null;
                    })();
                    const initials = `${p.first_name?.[0]||''}${p.last_name?.[0]||''}`.toUpperCase();
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#111820] transition border-b border-[#1e2d3d] last:border-0">
                        {p.photo_url
                          ? <img src={p.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-[#1e2d3d]" />
                          : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">{initials||'?'}</div>
                        }
                        <div className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => { router.push(`/dashboard/patient/${p.id}`); setShowDropdown(false); setSearchQuery(''); }}>
                          <p className="font-semibold text-[#dde6ef] text-sm truncate">{p.full_name}</p>
                          <p className="text-xs text-[#3d5870] font-mono">{age !== null ? `${age} años` : p.id.slice(0,8)}</p>
                        </div>
                        <button onClick={() => { router.push(`/dashboard/patient/${p.id}/new-visit`); setShowDropdown(false); setSearchQuery(''); }}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg hover:opacity-90 transition flex-shrink-0"
                          style={{ background: 'var(--c-green)', color: 'var(--c-green-fg)' }}>
                          + Visita
                        </button>
                      </div>
                    );
                  })}
                  <div className="px-5 py-2.5 border-t border-[#1e2d3d]">
                    <button onClick={() => { router.push('/dashboard/patients'); setShowDropdown(false); }}
                      className="text-xs text-[#0ea5e9] hover:underline w-full text-center">
                      Ver todos los pacientes →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ══ CHAT CON IA ══════════════════════════════════════════════════════ */}
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl flex flex-col overflow-hidden"
          style={{ minHeight: '480px' }}>

          {/* Header del chat */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e2d3d]"
            style={{ background: 'var(--c-deep)' }}>
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🤖</span>
              <div>
                <p className="font-bold text-[#dde6ef] text-sm">APEX AI</p>
                <p className="text-xs text-[#3d5870] font-mono">Asistente médico · Búsqueda web</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Indicador sin memoria */}
              <span className="text-xs font-mono px-2.5 py-1 rounded-lg"
                style={{ color: '#f59e0b', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.2)' }}>
                ⚡ Sin memoria — la conversación se borra al salir
              </span>
              {messages.length > 0 && (
                <button onClick={() => setMessages([])}
                  className="text-xs text-[#3d5870] hover:text-[#f43f5e] transition px-2 py-1 rounded">
                  Borrar
                </button>
              )}
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
            style={{ minHeight: '280px', maxHeight: '520px' }}>

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                <span className="text-5xl mb-4">💬</span>
                <p className="text-[#dde6ef] font-semibold text-lg mb-1">¿En qué te puedo ayudar?</p>
                <p className="text-[#7a95aa] text-sm max-w-sm">
                  Pregunta sobre medicina, estudios, medicamentos, o cualquier cosa. Puedo buscar en internet para darte información actualizada.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 justify-center max-w-lg">
                  {[
                    '¿Cuáles son las últimas guías de HTA?',
                    '¿Qué estudios pedir en síndrome metabólico?',
                    '¿Dosis de metformina en ERC?',
                    'Nuevos datos de GLP-1 en longevidad',
                  ].map(s => (
                    <button key={s} onClick={() => { setInputText(s); textareaRef.current?.focus(); }}
                      className="text-xs px-3 py-1.5 rounded-xl border transition hover:opacity-80"
                      style={{ color: 'var(--c-text-2)', borderColor: 'var(--c-border)', background: 'var(--c-hover)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-xs font-bold text-black mr-2 mt-1 flex-shrink-0">A</div>
                )}
                <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'rounded-br-sm'
                    : 'rounded-bl-sm'
                }`}
                  style={msg.role === 'user'
                    ? { background: 'var(--c-green)', color: 'var(--c-green-fg)' }
                    : { background: 'var(--c-hover)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }
                  }>
                  {msg.imagePreview && (
                    <img src={msg.imagePreview} alt="imagen enviada"
                      className="rounded-xl mb-2 max-h-48 object-contain" />
                  )}
                  <p style={{ whiteSpace: 'pre-wrap' }}>{msg.displayText}</p>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-xs font-bold text-black mr-2 mt-1 flex-shrink-0">A</div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm text-sm"
                  style={{ background: 'var(--c-hover)', border: '1px solid var(--c-border)' }}>
                  <span className="flex gap-1 items-center text-[#7a95aa]">
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
                  </span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Preview imagen pendiente */}
          {imageFile && (
            <div className="px-5 pb-2 flex items-center gap-2">
              <img src={imageFile.preview} alt="preview" className="h-12 w-12 object-cover rounded-lg border border-[#1e2d3d]" />
              <span className="text-xs text-[#7a95aa]">Imagen lista para enviar</span>
              <button onClick={() => setImageFile(null)}
                className="ml-auto text-xs text-[#f43f5e] hover:underline">Quitar</button>
            </div>
          )}

          {/* Input */}
          <div className="px-4 pb-4 pt-2 border-t border-[#1e2d3d] flex gap-3 items-end">
            {/* Botón imagen */}
            <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            <button onClick={() => imageRef.current?.click()}
              title="Adjuntar imagen"
              className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition text-lg"
              style={{ background: 'var(--c-hover)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
              🖼️
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={e => {
                setInputText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu consulta... (Enter para enviar, Shift+Enter para nueva línea)"
              className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none transition"
              style={{
                background: 'var(--c-hover)',
                border: '1px solid var(--c-border)',
                color: 'var(--c-text)',
                minHeight: '44px',
                maxHeight: '140px',
              }}
            />

            {/* Botón enviar */}
            <button
              onClick={sendMessage}
              disabled={sending || (!inputText.trim() && !imageFile)}
              className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold transition disabled:opacity-40"
              style={{ background: 'var(--c-green)', color: 'var(--c-green-fg)' }}>
              {sending ? '⏳' : '↑'}
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}

// ─── BigButton ────────────────────────────────────────────────────────────────
function BigButton({ icon, label, color, onClick }: { icon: string; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center justify-center gap-3 py-8 rounded-2xl hover:shadow-xl transition-all group"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '66'; e.currentTarget.style.background = color + '12'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.background = 'var(--c-card)'; }}>
      <span className="text-4xl group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-sm font-bold text-center leading-tight" style={{ color: 'var(--c-text)' }}>{label}</span>
    </button>
  );
}
