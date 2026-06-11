'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSession } from '@/app/lib/auth';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type MsgRole = 'user' | 'assistant';

interface ChatMsg {
  id: string;
  role: MsgRole;
  content: string | Array<{ type: string; text?: string; image_data?: string; image_type?: string }>;
  displayText: string;
  imagePreview?: string;
}

const SUGGESTIONS = [
  '¿Cuáles son las últimas guías de HTA?',
  '¿Qué estudios pedir en síndrome metabólico?',
  'Dosis de metformina en ERC leve',
  'Nuevos datos de GLP-1 en longevidad',
];

export default function ChatBubble() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending]   = useState(false);
  const [imageFile, setImageFile] = useState<{ data: string; type: string; preview: string } | null>(null);
  const [unread, setUnread]     = useState(0);

  const chatEndRef  = useRef<HTMLDivElement>(null);
  const imageRef    = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (open) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, open]);

  // Marcar leídos al abrir
  useEffect(() => { if (open) setUnread(0); }, [open]);

  // Focus textarea al abrir
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 120);
  }, [open]);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('Máximo 8 MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const d = ev.target?.result as string;
      setImageFile({ data: d, type: file.type, preview: d });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text && !imageFile) return;
    if (sending) return;

    const userMsg: ChatMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: imageFile
        ? [{ type: 'text', text }, { type: 'image', image_data: imageFile.data, image_type: imageFile.type }]
        : text,
      displayText: text || '(imagen)',
      imagePreview: imageFile?.preview,
    };

    const next = [...messages, userMsg];
    setMessages(next);
    setInputText('');
    setImageFile(null);
    setSending(true);

    // Reset textarea height
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    try {
      const session = await getSession();
      const token = session?.access_token;
      const res = await fetch(`${BACKEND()}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      const aiMsg: ChatMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'Sin respuesta.',
        displayText: data.response || 'Sin respuesta.',
      };
      setMessages(prev => [...prev, aiMsg]);
      if (!open) setUnread(u => u + 1);
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Error de conexión. Intenta de nuevo.',
        displayText: 'Error de conexión. Intenta de nuevo.',
      }]);
    } finally {
      setSending(false);
    }
  }, [inputText, imageFile, messages, sending, open]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      {/* ── Ventana de chat ──────────────────────────────────────────────── */}
      <div
        className="fixed z-[9998] transition-all duration-300 ease-out"
        style={{
          bottom: '96px',
          right: '24px',
          width: '400px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: open ? '620px' : '0',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(16px)',
          transformOrigin: 'bottom right',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,.6)',
          border: '1px solid var(--c-border)',
          background: 'var(--c-card)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: 'var(--c-deep)', borderBottom: '1px solid var(--c-border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-sm font-black text-black flex-shrink-0">
              A
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--c-text)' }}>APEX AI</p>
              <p className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>
                {sending ? '✦ escribiendo…' : '● en línea'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs px-2 py-0.5 rounded-full font-mono"
              style={{ color: '#f59e0b', background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.2)' }}>
              sin memoria
            </span>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])}
                className="text-xs px-2 py-1 rounded-lg transition ml-1"
                style={{ color: 'var(--c-text-3)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#f43f5e'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--c-text-3)'}>
                ✕
              </button>
            )}
            <button onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-lg transition ml-0.5"
              style={{ color: 'var(--c-text-2)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--c-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              ⌄
            </button>
          </div>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          style={{ minHeight: '200px' }}>

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-2xl font-black text-black mb-3">
                A
              </div>
              <p className="font-semibold text-sm mb-0.5" style={{ color: 'var(--c-text)' }}>Hola, soy APEX AI</p>
              <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>Pregúntame cualquier cosa</p>
              <div className="flex flex-col gap-1.5 w-full">
                {SUGGESTIONS.map(s => (
                  <button key={s}
                    onClick={() => { setInputText(s); textareaRef.current?.focus(); }}
                    className="text-left text-xs px-3 py-2 rounded-xl transition w-full"
                    style={{ color: 'var(--c-text-2)', background: 'var(--c-hover)', border: '1px solid var(--c-border)' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--c-green)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--c-border)'}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-xs font-black text-black flex-shrink-0 mb-0.5">
                  A
                </div>
              )}
              <div className="max-w-[82%] space-y-1">
                {msg.imagePreview && (
                  <img src={msg.imagePreview} alt=""
                    className="rounded-2xl max-h-40 object-contain block"
                    style={{ border: '1px solid var(--c-border)' }} />
                )}
                <div className="px-3.5 py-2.5 text-sm leading-relaxed"
                  style={msg.role === 'user' ? {
                    background: 'var(--c-green)',
                    color: 'var(--c-green-fg)',
                    borderRadius: '18px 18px 4px 18px',
                  } : {
                    background: 'var(--c-hover)',
                    color: 'var(--c-text)',
                    border: '1px solid var(--c-border)',
                    borderRadius: '18px 18px 18px 4px',
                  }}>
                  <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.displayText}</p>
                </div>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex items-end gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-xs font-black text-black flex-shrink-0 mb-0.5">A</div>
              <div className="px-3.5 py-3 text-sm"
                style={{ background: 'var(--c-hover)', border: '1px solid var(--c-border)', borderRadius: '18px 18px 18px 4px' }}>
                <span className="flex gap-1.5">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce inline-block"
                      style={{ background: 'var(--c-green)', animationDelay: `${d}ms` }} />
                  ))}
                </span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Preview imagen */}
        {imageFile && (
          <div className="px-4 pb-2 flex items-center gap-2"
            style={{ borderTop: '1px solid var(--c-border)' }}>
            <img src={imageFile.preview} alt="" className="h-10 w-10 object-cover rounded-lg"
              style={{ border: '1px solid var(--c-border)' }} />
            <span className="text-xs flex-1" style={{ color: 'var(--c-text-2)' }}>Lista para enviar</span>
            <button onClick={() => setImageFile(null)}
              className="text-xs" style={{ color: '#f43f5e' }}>✕</button>
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 pt-2 flex gap-2 items-end flex-shrink-0"
          style={{ borderTop: '1px solid var(--c-border)' }}>
          <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
          <button onClick={() => imageRef.current?.click()}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 transition"
            style={{ background: 'var(--c-hover)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--c-green)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--c-border)'}>
            🖼️
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={e => {
              setInputText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKey}
            placeholder="Escribe aquí…  (⏎ enviar)"
            className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none transition"
            style={{
              background: 'var(--c-hover)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-text)',
              minHeight: '36px',
              maxHeight: '120px',
              lineHeight: '1.5',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={sending || (!inputText.trim() && !imageFile)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0 transition disabled:opacity-40"
            style={{ background: 'var(--c-green)', color: 'var(--c-green-fg)' }}>
            ↑
          </button>
        </div>
      </div>

      {/* ── Burbuja flotante ─────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed z-[9999] flex items-center justify-center transition-all duration-200"
        style={{
          bottom: '24px',
          right: '24px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: open
            ? 'var(--c-hover)'
            : 'linear-gradient(135deg, var(--c-green) 0%, #0ea5e9 100%)',
          boxShadow: open
            ? '0 4px 20px rgba(0,0,0,.4)'
            : '0 4px 24px rgba(0,229,160,.35)',
          border: '2px solid var(--c-border)',
          transform: open ? 'rotate(0deg)' : 'rotate(0deg)',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {/* Badge de no leídos */}
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#f43f5e] text-white text-xs font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
        <span className="text-xl select-none" style={{ color: open ? 'var(--c-text-2)' : '#000' }}>
          {open ? '✕' : '✦'}
        </span>
      </button>
    </>
  );
}
