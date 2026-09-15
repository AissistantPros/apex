'use client';

import { useState } from 'react';

export interface Note {
  id: string;
  author_role: string;
  author_name: string;
  content: string;
  created_at: string;
  visit_id?: string | null;
}

interface Props {
  patientId: string;
  visitId?: string;
  notes: Note[];
  onNoteAdded: (note: Note) => void;
  onNoteDeleted: (id: string) => void;
  defaultRole?: string;
  compact?: boolean;
}

const ROLES = [
  { key: 'receptionist', label: 'Recepción',  color: '#0ea5e9', bg: 'rgba(14,165,233,.12)', icon: '🟦' },
  { key: 'nurse',        label: 'Enfermería', color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: '🟨' },
  { key: 'doctor',       label: 'Médico',     color: '#a78bfa', bg: 'rgba(167,139,250,.12)', icon: '🟣' },
];

function roleConfig(key: string) {
  return ROLES.find(r => r.key === key) || ROLES[2];
}

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Ahora mismo';
  if (mins < 60)  return `Hace ${mins} min`;
  if (hours < 24) return `Hace ${hours}h`;
  if (days < 7)   return `Hace ${days}d`;
  return new Date(isoDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function absoluteTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function NoteThread({
  patientId, visitId, notes, onNoteAdded, onNoteDeleted,
  defaultRole = 'doctor', compact = false,
}: Props) {
  const [text, setText]           = useState('');
  const [role, setRole]           = useState(defaultRole);
  const [authorName, setAuthorName] = useState('');
  const [saving, setSaving]       = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [hoverId, setHoverId]     = useState<string | null>(null);
  const [audiencia, setAudiencia] = useState<'general' | 'nurse' | 'doctor'>('general');

  const handleAdd = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND()}/patients/${patientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.trim(),
          author_role: role,
          author_name: authorName.trim(),
          visit_id: visitId || null,
          audiencia,
        }),
      });
      if (!res.ok) throw new Error();
      const note = await res.json();
      onNoteAdded(note);
      setText('');
      setShowForm(false);
    } catch {
      alert('Error al guardar nota');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta nota?')) return;
    try {
      await fetch(`${BACKEND()}/patients/${patientId}/notes/${id}`, { method: 'DELETE' });
      onNoteDeleted(id);
    } catch {
      alert('Error al eliminar');
    }
  };

  const rc = roleConfig(role);

  return (
    <div className="space-y-3">

      {/* Lista de notas */}
      {notes.length === 0 ? (
        !compact && (
          <div className="text-center py-6 text-[#3d5870] text-sm">
            <p className="text-2xl mb-1">📝</p>
            <p>Sin notas aún</p>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {notes.map(n => {
            const rc2 = roleConfig(n.author_role);
            return (
              <div
                key={n.id}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId(null)}
                className="relative rounded-xl p-4 transition"
                style={{ background: rc2.bg, border: `1px solid ${rc2.color}33` }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ color: rc2.color, background: `${rc2.color}22` }}
                    >
                      {rc2.icon} {rc2.label}
                    </span>
                    {n.author_name && (
                      <span className="text-xs text-[#7a95aa]">— {n.author_name}</span>
                    )}
                    {n.visit_id && (
                      <span className="text-xs font-mono text-[#3d5870]">• visita</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className="text-xs text-[#3d5870] font-mono"
                      title={absoluteTime(n.created_at)}
                    >
                      {relativeTime(n.created_at)}
                    </span>
                    {hoverId === n.id && (
                      <button
                        onClick={() => handleDelete(n.id)}
                        className="text-xs text-[#f43f5e] opacity-60 hover:opacity-100 transition"
                        title="Eliminar nota"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                {/* Contenido */}
                <p className="text-sm text-[#dde6ef] leading-relaxed whitespace-pre-wrap">{n.content}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Botón abrir / cerrar formulario */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2.5 border border-dashed border-[#1e2d3d] rounded-xl text-sm text-[#7a95aa] hover:border-[#00e5a0] hover:text-[#00e5a0] transition flex items-center justify-center gap-2"
        >
          <span>+</span> Agregar nota
        </button>
      ) : (
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-4 space-y-3">
          {/* Selección de rol */}
          <div className="flex gap-2 flex-wrap">
            {ROLES.map(r => (
              <button
                key={r.key}
                onClick={() => setRole(r.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                style={{
                  background: role === r.key ? r.bg : 'transparent',
                  color: role === r.key ? r.color : '#7a95aa',
                  border: `1px solid ${role === r.key ? r.color + '66' : '#1e2d3d'}`,
                }}
              >
                {r.icon} {r.label}
              </button>
            ))}
          </div>

          {/* Nombre del autor (opcional) */}
          <input
            value={authorName}
            onChange={e => setAuthorName(e.target.value)}
            placeholder="Tu nombre (opcional)"
            className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-sm text-[#dde6ef] placeholder-[#3d5870] outline-none focus:border-[#7a95aa]"
          />

          {/* Texto de la nota */}
          <textarea
            rows={3}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Escribe tu nota aquí..."
            className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-lg text-sm text-[#dde6ef] placeholder-[#3d5870] outline-none resize-none"
            style={{ borderColor: text ? rc.color + '66' : undefined }}
            autoFocus
          />

          {/* Destinatario de la nota */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#7a95aa] mr-1">Visible para:</span>
            {([['general', 'Todos'], ['nurse', 'Enfermería'], ['doctor', 'Médico']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setAudiencia(v)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition"
                style={{ background: audiencia === v ? '#00e5a0' : '#111820', color: audiencia === v ? '#000' : '#7a95aa' }}>{l}</button>
            ))}
          </div>

          {/* Acciones */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); setText(''); }}
              className="px-3 py-1.5 text-xs text-[#7a95aa] hover:text-[#dde6ef] transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={!text.trim() || saving}
              className="px-4 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40"
              style={{ background: rc.color, color: '#000' }}
            >
              {saving ? 'Guardando...' : 'Guardar nota'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
