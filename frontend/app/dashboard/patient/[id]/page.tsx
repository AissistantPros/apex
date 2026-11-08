'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import NoteThread, { Note } from '@/app/components/NoteThread';
import { useRevealScroll } from '@/app/lib/useRevealScroll';
import PhotoCropModal from '@/app/components/PhotoCropModal';
import { getRole } from '@/app/lib/role';
import { useEntitlements } from '@/app/lib/useEntitlements';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type TabKey =
  | 'visitas'
  | 'clinica'
  | 'medicamentos'
  | 'familia'
  | 'privada'
  | 'archivos'
  | 'contacto'
  | 'notas'
  | 'gestion';

export default function PatientPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const patientId = params?.id as string;

  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string>('doctor');
  const [patient, setPatient] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pestaña activa
  const [activeTab, setActiveTab] = useState<TabKey>('visitas');

  // Gestión de bajas y eliminación
  const [showDanger, setShowDanger] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDel, setPendingDel] = useState<any>(null);
  const [delReason, setDelReason] = useState('');
  const dangerRevealRef = useRevealScroll<HTMLDivElement>(showDanger);
  const confirmRevealRef = useRevealScroll<HTMLDivElement>(confirmDelete);

  const [patientNotes, setPatientNotes] = useState<Note[]>([]);
  const [visitsError, setVisitsError] = useState<string | null>(null);
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Registro continuo: estudios, laboratorios y fotos
  const [patientFiles, setPatientFiles] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileCat, setFileCat] = useState<'laboratorio' | 'estudio' | 'foto_clinica'>('laboratorio');
  const [fileStage, setFileStage] = useState<'antes' | 'despues' | 'seguimiento'>('antes');
  const [fileZona, setFileZona] = useState('');
  const [fileFecha, setFileFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [fileNotas, setFileNotas] = useState('');
  const [compareBeforeId, setCompareBeforeId] = useState<string>('');
  const [compareAfterId, setCompareAfterId] = useState<string>('');
  const continuousFileRef = useRef<HTMLInputElement>(null);

  // Resumen con IA
  const [aiSummary, setAiSummary] = useState<{ text: string; generated_at?: string; visits_count?: number; files_count?: number } | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState('');
  const [showAiSummary, setShowAiSummary] = useState(false);

  const { lite, team } = useEntitlements();

  useEffect(() => {
    const r = getRole();
    setRole(r);
    // Asignar tab inicial según rol si no viene query param
    const qTab = searchParams?.get('tab') as TabKey;
    if (qTab) {
      setActiveTab(qTab);
    } else if (r === 'receptionist') {
      setActiveTab('contacto');
    } else {
      setActiveTab('visitas');
    }
  }, [searchParams]);

  useEffect(() => {
    getUser().then(async u => {
      if (!u) {
        router.push('/auth/login');
        return;
      }
      setUser(u);
      loadData();
    });
  }, [patientId]);

  const loadData = async () => {
    try {
      const session = await getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [pRes, vRes, fRes] = await Promise.all([
        fetch(`${BACKEND()}/patients/${patientId}`, { headers }),
        fetch(`${BACKEND()}/visits/${patientId}`, { headers }),
        fetch(`${BACKEND()}/patients/${patientId}/files`, { headers }).catch(() => null),
      ]);
      const pData = await pRes.json();
      const vData = await vRes.json();
      setPatient(pData);
      if (pData?.func_intake?.ai_summary?.text) {
        setAiSummary(pData.func_intake.ai_summary);
      }
      if (fRes && fRes.ok) {
        const fData = await fRes.json().catch(() => ({}));
        setPatientFiles(fData.files || []);
        if (fData.ai_summary?.text) setAiSummary(fData.ai_summary);
      }
      if (vRes.ok) {
        setVisits(vData.visits || []);
        setVisitsError(null);
      } else {
        setVisits([]);
        setVisitsError(vData.detail || 'Error al cargar las visitas del paciente');
      }

      try {
        const nRes = await fetch(`${BACKEND()}/patients/${patientId}/notes`, { headers });
        const nData = await nRes.json();
        setPatientNotes(nData.notes || []);
      } catch (_) {}
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoSelected = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Selecciona un archivo de imagen');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('La imagen no debe superar 25 MB');
      return;
    }
    setCropFile(file);
  };

  const handleCroppedUpload = async (base64: string) => {
    setCropFile(null);
    setUploadingPhoto(true);
    try {
      const session = await getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`${BACKEND()}/patients/${patientId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ photo_url: base64 }),
      });
      if (res.ok) setPatient((prev: any) => ({ ...prev, photo_url: base64 }));
      else alert('Error al guardar la foto');
    } catch {
      alert('Error de conexión');
    }
    setUploadingPhoto(false);
  };

  const handleUploadContinuousFile = async (file: File) => {
    setUploadingFile(true);
    try {
      const session = await getSession();
      const token = session?.access_token;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', fileCat);
      fd.append('stage', fileCat === 'foto_clinica' ? fileStage : '');
      fd.append('zona', fileZona.trim());
      fd.append('fecha', fileFecha);
      fd.append('notas', fileNotas.trim());
      const res = await fetch(`${BACKEND()}/patients/${patientId}/files`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || 'No se pudo subir el archivo');
      setPatientFiles(d.files || []);
      setFileNotas('');
      setFileZona('');
    } catch (e: any) {
      alert(e.message || 'Error al subir archivo');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteContinuousFile = async (fileId: string) => {
    if (!window.confirm('¿Eliminar este archivo de la ficha del paciente?')) return;
    try {
      const session = await getSession();
      const token = session?.access_token;
      const res = await fetch(`${BACKEND()}/patients/${patientId}/files/${fileId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || 'No se pudo eliminar');
      setPatientFiles(d.files || []);
    } catch (e: any) {
      alert(e.message || 'Error al eliminar archivo');
    }
  };

  const handleGenerateAiSummary = async () => {
    setShowAiSummary(true);
    setAiSummaryLoading(true);
    setAiSummaryError('');
    try {
      const session = await getSession();
      const token = session?.access_token;
      const res = await fetch(`${BACKEND()}/patients/${patientId}/ai-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || 'No se pudo generar el resumen con IA');
      setAiSummary({
        text: d.summary,
        generated_at: d.generated_at,
        visits_count: d.visits_count,
        files_count: d.files_count,
      });
    } catch (e: any) {
      setAiSummaryError(e.message || 'Error al generar el resumen con IA');
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const deletePatientDirectly = async () => {
    const ok = window.confirm('¿Está seguro que quiere borrar este registro? Esto no se puede deshacer.');
    if (!ok) return;
    setDeleting(true);
    try {
      const session = await getSession();
      const headers: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      const r = await fetch(`${BACKEND()}/patients/${patientId}`, { method: 'DELETE', headers });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || 'No se pudo eliminar el registro');
      router.push('/dashboard/patients');
    } catch (e: any) {
      alert(e.message || 'No se pudo eliminar el registro');
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!patientId) return;
    (async () => {
      try {
        const session = await getSession();
        const headers: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
        const r = await fetch(`${BACKEND()}/deletions/for-patient/${patientId}`, { headers });
        if (r.ok) {
          const d = await r.json();
          setPendingDel(d.pending ? d.request : null);
        }
      } catch {}
    })();
  }, [patientId]);

  const requestDeletion = async () => {
    setDeleting(true);
    try {
      const session = await getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };
      const r = await fetch(`${BACKEND()}/deletions/request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_id: patientId, reason: delReason }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || 'No se pudo enviar la solicitud');
      setPendingDel(d.request || { reason: delReason });
      setConfirmDelete(false);
      setDelReason('');
    } catch (e: any) {
      alert(e.message || 'No se pudo enviar la solicitud de baja');
    } finally {
      setDeleting(false);
    }
  };

  // WhatsApp url
  const whatsappUrl = useMemo(() => {
    if (!patient?.phone) return null;
    const clean = String(patient.phone).replace(/\D/g, '');
    if (clean.length < 10) return null;
    return `https://wa.me/${clean}`;
  }, [patient?.phone]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--c-bg)] text-[var(--c-text-2)] font-mono text-sm">
        <span className="w-4 h-4 border-2 border-[var(--c-primary)] border-t-transparent rounded-full animate-spin mr-3" />
        Cargando expediente del paciente...
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[var(--c-bg)] text-[var(--c-text)] p-6 space-y-4">
        <p className="text-base font-semibold">Paciente no encontrado.</p>
        <button
          onClick={() => router.push('/dashboard/patients')}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--c-card)] border border-[var(--c-border)] text-[var(--c-text)] hover:border-[var(--c-primary)]"
        >
          ← Volver a lista de pacientes
        </button>
      </div>
    );
  }

  const dob = patient.date_of_birth || patient.birth_date;
  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
  const initials = `${patient.first_name?.[0] || ''}${patient.last_name?.[0] || ''}`.toUpperCase();

  // Alergias destacadas
  const alergiasLista = [
    patient.allergies_medications ? `Med: ${patient.allergies_medications}` : null,
    patient.allergies_foods ? `Alim: ${patient.allergies_foods}` : null,
    patient.allergies_environmental ? `Amb: ${patient.allergies_environmental}` : null,
  ].filter(Boolean);

  // Definición de pestañas por rol
  const TABS_CONFIG: { key: TabKey; label: string; icon: string; count?: number; roleHide?: string[] }[] = [
    { key: 'visitas', label: 'Consultas & Visitas', icon: '🩺', count: visits.length, roleHide: ['receptionist'] },
    { key: 'clinica', label: 'Antecedentes & Alergias', icon: '⚠️', roleHide: ['receptionist'] },
    { key: 'medicamentos', label: 'Medicamentos & Hábitos', icon: '💊', roleHide: ['receptionist'] },
    { key: 'familia', label: 'Heredofamiliares', icon: '🧬', roleHide: ['receptionist'] },
    { key: 'privada', label: 'Historia Privada', icon: '🔒', roleHide: ['receptionist', 'nurse'] },
    { key: 'archivos', label: 'Estudios & Fotos', icon: '📁', count: patientFiles.length, roleHide: ['receptionist'] },
    { key: 'contacto', label: 'Datos & Contacto', icon: '👤', roleHide: ['nurse'] },
    { key: 'notas', label: 'Notas del Equipo', icon: '💬', count: patientNotes.length },
    { key: 'gestion', label: 'Gestión', icon: '⚙️' },
  ];

  const visibleTabs = TABS_CONFIG.filter(t => !t.roleHide?.includes(role));

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)]">
      <main className="max-w-6xl mx-auto pt-16 px-4 sm:px-8 py-8 space-y-6">

        {/* ── HEADER DEL PACIENTE (TARJETA MAESTRA DE IDENTIFICACIÓN) ── */}
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-5 sm:p-7 shadow-sm transition">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">

            {/* Avatar + Datos clave */}
            <div className="flex items-start gap-4 sm:gap-5 min-w-0">
              <div
                className="relative shrink-0 group cursor-pointer"
                onClick={() => photoInputRef.current?.click()}
                title="Cambiar foto del paciente"
              >
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoSelected(f);
                    e.target.value = '';
                  }}
                />
                {patient.photo_url ? (
                  <img
                    src={patient.photo_url}
                    alt="Foto del paciente"
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-[var(--c-border)] group-hover:border-[var(--c-primary)] shadow-sm transition"
                  />
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[var(--c-subtle)] text-[var(--c-text-2)] flex items-center justify-center text-2xl font-bold border border-[var(--c-border)] group-hover:border-[var(--c-primary)] transition">
                    {uploadingPhoto ? '…' : initials || '?'}
                  </div>
                )}
                <div className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <span className="text-white text-[11px] font-bold text-center leading-tight px-1">
                    {uploadingPhoto ? 'Subiendo…' : 'Cambiar foto'}
                  </span>
                </div>
              </div>

              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-[var(--c-text)] truncate">{patient.full_name}</h1>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-[var(--c-subtle)] border border-[var(--c-border)] text-[var(--c-text-2)] font-semibold shrink-0">
                    {patient.id}
                  </span>
                </div>

                {/* Chips de identificación demográfica */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--c-text-2)]">
                  {age !== null && (
                    <span className="px-2.5 py-1 rounded-xl bg-[var(--c-subtle)] border border-[var(--c-border)] font-medium">
                      🎂 {age} años {dob && `(${new Date(dob + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })})`}
                    </span>
                  )}
                  {(patient.sexo_biologico || patient.sex) && (
                    <span className="px-2.5 py-1 rounded-xl bg-[var(--c-subtle)] border border-[var(--c-border)] font-medium">
                      Biología: <strong className="text-[var(--c-text)]">{patient.sexo_biologico || patient.sex}</strong>
                    </span>
                  )}
                  {patient.occupation && (
                    <span className="px-2.5 py-1 rounded-xl bg-[var(--c-subtle)] border border-[var(--c-border)] font-medium truncate max-w-[200px]">
                      💼 {patient.occupation}
                    </span>
                  )}
                  {patient.city && (
                    <span className="px-2.5 py-1 rounded-xl bg-[var(--c-subtle)] border border-[var(--c-border)] font-medium">
                      📍 {patient.city}
                    </span>
                  )}
                </div>

                {/* Banner rápido de Alergias */}
                {alergiasLista.length > 0 && role !== 'receptionist' && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--c-danger)]">Alergias:</span>
                    {alergiasLista.map((a, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[color-mix(in_srgb,var(--c-danger)_15%,transparent)] text-[var(--c-danger)] border border-[color-mix(in_srgb,var(--c-danger)_35%,transparent)]"
                      >
                        ⚠️ {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Botones de acción rápida */}
            <div className="flex flex-wrap gap-2 md:self-start justify-end shrink-0">
              {role !== 'receptionist' && (
                <button
                  type="button"
                  onClick={handleGenerateAiSummary}
                  disabled={aiSummaryLoading}
                  className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap border cursor-pointer hover:opacity-90 shadow-sm flex items-center gap-1.5"
                  style={{
                    background: 'color-mix(in srgb, var(--c-primary) 14%, var(--c-card))',
                    borderColor: 'color-mix(in srgb, var(--c-primary) 40%, transparent)',
                    color: 'var(--c-primary)',
                  }}
                  title="Genera un resumen inteligente de la evolución y antecedentes"
                >
                  <span>✦</span>
                  <span>{aiSummaryLoading ? 'Analizando con IA…' : 'Resumen IA'}</span>
                </button>
              )}

              {role !== 'receptionist' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('archivos')}
                  className="px-3.5 py-2 bg-[var(--c-subtle)] border border-[var(--c-border)] text-[var(--c-text)] text-xs sm:text-sm font-semibold rounded-xl hover:border-[var(--c-primary)] transition whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                  title="Subir estudios, análisis o fotos de Antes y Después"
                >
                  <span>📎</span>
                  <span>Subir estudio</span>
                </button>
              )}

              {role !== 'receptionist' && (
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/patient/${patientId}/${lite ? 'consulta' : 'new-visit'}`)}
                  className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl hover:opacity-90 transition whitespace-nowrap cursor-pointer shadow-sm flex items-center gap-1.5"
                  style={{ background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}
                >
                  <span>+</span>
                  <span>{lite ? 'Nueva consulta' : 'Nueva visita'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => router.push(`/dashboard/new-patient/flow?patient_id=${patientId}&phase=1`)}
                className="px-3.5 py-2 bg-[var(--c-card)] border border-[var(--c-border)] text-[var(--c-text-2)] hover:text-[var(--c-text)] text-xs sm:text-sm font-semibold rounded-xl hover:border-[var(--c-text-2)] transition cursor-pointer"
                title="Editar formulario de admisión"
              >
                ✏️ Editar
              </button>
            </div>
          </div>
        </div>

        {/* ── CARD RESUMEN IA (EXPANDIBLE) ── */}
        {showAiSummary && (
          <div className="bg-[var(--c-card)] border border-[color-mix(in_srgb,var(--c-primary)_35%,transparent)] rounded-3xl p-5 sm:p-6 shadow-sm space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[color-mix(in_srgb,var(--c-primary)_18%,transparent)] text-[var(--c-primary)] flex items-center justify-center font-bold text-xs">
                  ✦
                </span>
                <h3 className="text-sm font-bold text-[var(--c-primary)] uppercase tracking-wider">
                  Síntesis Clínica Inteligente (IA Apex)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateAiSummary}
                  disabled={aiSummaryLoading}
                  className="text-xs text-[var(--c-primary)] hover:underline cursor-pointer font-semibold"
                >
                  {aiSummaryLoading ? 'Actualizando…' : '↻ Regenerar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAiSummary(false)}
                  className="text-xs text-[var(--c-text-2)] hover:text-[var(--c-text)] px-2 py-1 cursor-pointer"
                >
                  Ocultar
                </button>
              </div>
            </div>

            {aiSummaryLoading && (
              <div className="flex items-center gap-3 py-4 text-xs sm:text-sm text-[var(--c-text-2)]">
                <span className="w-4 h-4 border-2 border-[var(--c-primary)] border-t-transparent rounded-full animate-spin" />
                Sintetizando antecedentes, signos vitales, estudios y evolución clínica del paciente…
              </div>
            )}

            {aiSummaryError && (
              <p className="text-xs text-[var(--c-danger)] bg-[color-mix(in_srgb,var(--c-danger)_12%,transparent)] border border-[color-mix(in_srgb,var(--c-danger)_30%,transparent)] rounded-xl p-3">
                {aiSummaryError}
              </p>
            )}

            {!aiSummaryLoading && aiSummary?.text && (
              <div className="text-xs sm:text-sm text-[var(--c-text)] whitespace-pre-wrap leading-relaxed bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-2xl p-4 font-sans">
                {aiSummary.text}
              </div>
            )}
          </div>
        )}

        {/* ── BANNER DE ALERTA: REGISTRO PENDIENTE ── */}
        {patient.registration_phase && patient.registration_phase !== 'complete' && (
          <div className="bg-[color-mix(in_srgb,var(--c-warn)_12%,transparent)] border border-[color-mix(in_srgb,var(--c-warn)_35%,transparent)] rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-xs sm:text-sm font-bold text-[var(--c-warn)]">Expediente incompleto</p>
                <p className="text-xs text-[var(--c-text-2)]">
                  {patient.registration_phase === 'reception' && team.has_nurse
                    ? 'Faltan secciones de Enfermería y Médico para completar la ficha.'
                    : 'Falta la sección del Médico para completar la ficha.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/new-patient/flow?patient_id=${patientId}&phase=${patient.registration_phase === 'reception' && team.has_nurse ? 2 : 3}`)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--c-warn)] text-black hover:opacity-90 transition shrink-0 cursor-pointer shadow-sm"
            >
              Completar etapas →
            </button>
          </div>
        )}

        {/* ── BARRA DE PESTAÑAS (TABS RESPONSIVAS Y FLUIDAS) ── */}
        <div className="border-b border-[var(--c-border)] overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex items-center gap-1 sm:gap-2 min-w-max pb-px">
            {visibleTabs.map(t => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer border ${
                    isActive
                      ? 'bg-[color-mix(in_srgb,var(--c-primary)_14%,var(--c-card))] border-[var(--c-primary)] text-[var(--c-primary)] shadow-sm'
                      : 'bg-transparent border-transparent text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-subtle)]'
                  }`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  {t.count !== undefined && (
                    <span
                      className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? 'bg-[var(--c-primary)] text-[var(--c-primary-fg)]'
                          : 'bg-[var(--c-subtle)] text-[var(--c-text-3)]'
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════════
            PESTAÑA 1: CONSULTAS & VISITAS
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'visitas' && (
          <div className="space-y-4 animate-in fade-in">
            {visitsError && (
              <div className="text-center py-6 bg-[color-mix(in_srgb,var(--c-danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--c-danger)_35%,transparent)] rounded-3xl p-5">
                <p className="text-[var(--c-danger)] font-semibold text-xs sm:text-sm">
                  No se pudieron cargar las visitas: {visitsError}
                </p>
                <button
                  type="button"
                  onClick={() => loadData()}
                  className="mt-3 px-4 py-2 border border-[var(--c-danger)] text-[var(--c-danger)] text-xs rounded-xl hover:bg-[color-mix(in_srgb,var(--c-danger)_15%,transparent)] transition font-bold cursor-pointer"
                >
                  Reintentar
                </button>
              </div>
            )}

            {visits.length === 0 && !visitsError ? (
              <div className="text-center py-16 bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-8 space-y-4">
                <span className="text-4xl block">🩺</span>
                <h3 className="text-base font-bold text-[var(--c-text)]">No hay consultas registradas</h3>
                <p className="text-xs sm:text-sm text-[var(--c-text-2)] max-w-md mx-auto">
                  Abre la primera consulta o visita para registrar signos vitales, evolución, diagnósticos y recetas médicas.
                </p>
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/patient/${patientId}/${lite ? 'consulta' : 'new-visit'}`)}
                  className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-md hover:opacity-90 transition cursor-pointer"
                  style={{ background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}
                >
                  + Iniciar primera consulta
                </button>
              </div>
            ) : (
              visits.map((v, i) => (
                <VisitDetail
                  key={v.id}
                  patientId={patientId}
                  visit={v}
                  index={visits.length - i}
                  expanded={expandedVisit === v.id}
                  onToggle={() => setExpandedVisit(expandedVisit === v.id ? null : v.id)}
                />
              ))
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            PESTAÑA 2: ANTECEDENTES & ALERGIAS
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'clinica' && (
          <div className="space-y-6 animate-in fade-in">
            {/* 1. Alergias Críticas */}
            <div className="bg-[var(--c-card)] border border-[color-mix(in_srgb,var(--c-danger)_25%,var(--c-border))] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--c-border)] pb-3">
                <span className="text-lg">⚠️</span>
                <h3 className="text-sm font-bold text-[var(--c-danger)] uppercase tracking-wider">
                  Alergias Conocidas y Reacciones Adversas
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
                  <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Alergias a Medicamentos</p>
                  <p className={`text-xs sm:text-sm font-medium ${patient.allergies_medications ? 'text-[var(--c-danger)] font-bold' : 'text-[var(--c-text)]'}`}>
                    {patient.allergies_medications || 'Sin alergias a fármacos registradas'}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
                  <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Alergias Alimentarias</p>
                  <p className={`text-xs sm:text-sm font-medium ${patient.allergies_foods ? 'text-[var(--c-danger)] font-bold' : 'text-[var(--c-text)]'}`}>
                    {patient.allergies_foods || 'Sin alergias a alimentos registradas'}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
                  <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Alergias Ambientales / Otras</p>
                  <p className={`text-xs sm:text-sm font-medium ${patient.allergies_environmental ? 'text-[var(--c-danger)] font-bold' : 'text-[var(--c-text)]'}`}>
                    {patient.allergies_environmental || 'Sin alergias ambientales registradas'}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Antecedentes Patológicos y Quirúrgicos */}
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--c-border)] pb-3">
                <span className="text-lg">🏥</span>
                <h3 className="text-sm font-bold text-[var(--c-text)] uppercase tracking-wider">
                  Antecedentes Patológicos & Quirúrgicos
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoCard label="Enfermedades crónicas" value={patient.chronic_diseases} />
                <InfoCard label="Cirugías previas" value={patient.surgeries} />
                <InfoCard label="Hospitalizaciones" value={patient.hospitalizations} />
                <InfoCard label="Fracturas" value={patient.fractures} />
                <InfoCard label="Transfusiones sanguíneas" value={patient.transfusions ? 'Sí' : 'No'} />
                <InfoCard label="Enfermedades infantiles" value={patient.childhood_diseases} />
                <InfoCard label="Infecciones infantiles" value={patient.childhood_infections} />
                <InfoCard label="Antibióticos en infancia" value={patient.childhood_antibiotics} />
              </div>

              {patient.med_notas && (
                <div className="mt-4 p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)]">
                  <p className="text-xs font-mono text-[var(--c-text-3)] uppercase mb-1">Notas clínicas de antecedentes</p>
                  <p className="text-xs sm:text-sm text-[var(--c-text)] whitespace-pre-wrap">{patient.med_notas}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            PESTAÑA 3: MEDICAMENTOS & HÁBITOS
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'medicamentos' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Medicamentos Actuales */}
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💊</span>
                  <h3 className="text-sm font-bold text-[var(--c-text)] uppercase tracking-wider">
                    Medicamentos y Suplementos Actuales
                  </h3>
                </div>
                {Array.isArray(patient.medications) && (
                  <span className="text-xs font-mono text-[var(--c-text-3)] font-bold">
                    {patient.medications.length} registrado(s)
                  </span>
                )}
              </div>

              {Array.isArray(patient.medications) && patient.medications.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {patient.medications.map((m: any, i: number) => (
                    <div key={i} className="bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-2xl p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-[var(--c-text)] text-sm sm:text-base">{m.nombre || 'Sin nombre'}</p>
                        {m.adherencia && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--c-card)] border border-[var(--c-border)] text-[var(--c-text-2)] font-semibold">
                            Apego: {m.adherencia}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-[var(--c-text-2)]">
                        {m.dosis && (
                          <p>
                            <span className="text-[var(--c-text-3)]">Dosis:</span> {m.dosis}
                          </p>
                        )}
                        {m.frecuencia && (
                          <p>
                            <span className="text-[var(--c-text-3)]">Frecuencia:</span> {m.frecuencia}
                          </p>
                        )}
                        {m.desde && (
                          <p>
                            <span className="text-[var(--c-text-3)]">Desde:</span> {m.desde}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-[var(--c-text-2)] py-4 text-center">
                  El paciente no tiene medicamentos activos reportados en este momento.
                </p>
              )}
            </div>

            {/* Hábitos de Vida */}
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--c-border)] pb-3">
                <span className="text-lg">🌿</span>
                <h3 className="text-sm font-bold text-[var(--c-text)] uppercase tracking-wider">
                  Hábitos y Toxicomanías
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoCard label="Tabaquismo" value={patient.smoking_status} />
                {patient.smoking_status && patient.smoking_status !== 'Nunca' && (
                  <>
                    <InfoCard label="Fumador desde" value={patient.smoking_since} />
                    <InfoCard label="Años fumando" value={patient.smoking_years} />
                  </>
                )}
                <InfoCard label="Consumo de alcohol" value={patient.alcohol_status} />
                {patient.alcohol_status && patient.alcohol_status !== 'No consume' && (
                  <>
                    <InfoCard label="Cantidad / Frecuencia" value={patient.alcohol_cantidad} />
                    {Array.isArray(patient.alcohol_tipo) && patient.alcohol_tipo.length > 0 && (
                      <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
                        <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Tipos de bebida</p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {patient.alcohol_tipo.map((t: string) => (
                            <span key={t} className="text-[11px] bg-[var(--c-card)] text-[var(--c-text)] px-2 py-0.5 rounded-lg border border-[var(--c-border)] font-medium">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            PESTAÑA 4: HEREDOFAMILIARES
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'familia' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--c-border)] pb-3">
                <span className="text-lg">🧬</span>
                <h3 className="text-sm font-bold text-[var(--c-text)] uppercase tracking-wider">
                  Carga Genética y Heredofamiliares
                </h3>
              </div>

              {/* Familiares Nucleares */}
              {patient.family_history_table ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(['padre', 'madre', 'hermanos'] as const).map(fam => {
                    const row = patient.family_history_table?.[fam];
                    if (!row) return null;
                    const conditions = [
                      row.diabetes && 'Diabetes',
                      row.hipertension && 'Hipertensión',
                      row.cancer && 'Cáncer',
                      row.cardiopatia && 'Cardiopatía',
                      row.otra && row.otra,
                    ].filter(Boolean) as string[];

                    return (
                      <div key={fam} className="bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[var(--c-text)] capitalize text-base">{fam}</span>
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                              row.vivo
                                ? 'bg-[color-mix(in_srgb,var(--c-success)_15%,transparent)] text-[var(--c-success)] border-[color-mix(in_srgb,var(--c-success)_30%,transparent)]'
                                : 'bg-[color-mix(in_srgb,var(--c-danger)_15%,transparent)] text-[var(--c-danger)] border-[color-mix(in_srgb,var(--c-danger)_30%,transparent)]'
                            }`}
                          >
                            {row.vivo ? 'Vivo' : 'Fallecido'}
                          </span>
                        </div>

                        {!row.vivo && (row.causa_muerte || row.edad_muerte) && (
                          <p className="text-xs text-[var(--c-text-2)] bg-[var(--c-card)] p-2 rounded-xl border border-[var(--c-border)]">
                            {row.causa_muerte && `Causa: ${row.causa_muerte}`}
                            {row.causa_muerte && row.edad_muerte && ' · '}
                            {row.edad_muerte && `Edad: ${row.edad_muerte} años`}
                          </p>
                        )}

                        <div className="space-y-1">
                          <p className="text-[10px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Antecedentes</p>
                          <div className="flex flex-wrap gap-1.5">
                            {conditions.length > 0 ? (
                              conditions.map(c => (
                                <span
                                  key={c}
                                  className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-[color-mix(in_srgb,var(--c-warn)_15%,transparent)] text-[var(--c-warn)] border border-[color-mix(in_srgb,var(--c-warn)_30%,transparent)]"
                                >
                                  {c}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-[var(--c-text-3)]">Sin antecedentes registrados</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-[var(--c-text-2)] py-2">
                  No se registraron antecedentes familiares nucleares en la ficha inicial.
                </p>
              )}

              {/* Antecedentes adicionales capturados en consulta */}
              {Array.isArray(patient.family_other_history) && patient.family_other_history.length > 0 && (
                <div className="mt-6 pt-4 border-t border-[var(--c-border)] space-y-3">
                  <h4 className="text-xs font-mono uppercase text-[var(--c-text-3)] font-bold">
                    Otros familiares registrados durante consultas
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {patient.family_other_history.map((r: any, i: number) => (
                      <div key={i} className="bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-2xl p-3 text-xs sm:text-sm">
                        <span className="font-bold text-[var(--c-text)]">{r.parentesco}</span>
                        <span className="text-[var(--c-text-2)]"> · {r.enfermedad}</span>
                        {r.detalle && <span className="text-[var(--c-text-3)]"> ({r.detalle})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            PESTAÑA 5: HISTORIA CLÍNICA PRIVADA (SOLO MÉDICO)
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'privada' && role === 'doctor' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-[var(--c-card)] border border-[color-mix(in_srgb,var(--c-violet)_35%,transparent)] rounded-3xl p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔒</span>
                  <h3 className="text-sm font-bold text-[var(--c-violet)] uppercase tracking-wider">
                    Historia Clínica Confidencial
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--c-violet)_15%,transparent)] text-[var(--c-violet)] border border-[color-mix(in_srgb,var(--c-violet)_30%,transparent)]">
                  Exclusivo Médico Titular
                </span>
              </div>

              {/* Identidad */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoCard label="Sexo biológico de nacimiento" value={patient.sexo_biologico || patient.sex} />
                <InfoCard label="Género con el que se identifica" value={patient.genero_identidad} />
              </div>

              {/* Reproductiva Femenina */}
              {(patient.sexo_biologico === 'Femenino' || patient.sex === 'Femenino') && (
                <div className="space-y-3 pt-3 border-t border-[var(--c-border)]">
                  <p className="text-xs font-mono text-[#ec4899] font-bold uppercase tracking-wider">
                    🌸 Historia Gineco-obstétrica
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    <InfoCard label="Menarca (edad)" value={patient.menarca_age} />
                    <InfoCard label="Ciclos menstruales" value={patient.ciclos_regulares} />
                    <InfoCard label="Embarazos (G)" value={patient.pregnancies} />
                    <InfoCard label="Partos / Cesáreas (P)" value={patient.births} />
                    <InfoCard label="Abortos (A)" value={patient.miscarriages} />
                    <InfoCard label="Menopausia" value={patient.menopausal_tipo} />
                    <InfoCard label="Edad de menopausia" value={patient.menopausal_age} />
                    <InfoCard label="Anticonceptivo actual" value={patient.contraceptive} />
                    <InfoCard label="Último Papanicolaou" value={patient.pap_ultimo} />
                    <InfoCard label="Última mastografía" value={patient.masto_ultima} />
                    <InfoCard label="Última colposcopía" value={patient.colpo_ultima} />
                  </div>
                </div>
              )}

              {/* Reproductiva Masculina */}
              {(patient.sexo_biologico === 'Masculino' || patient.sex === 'Masculino') && (
                <div className="space-y-3 pt-3 border-t border-[var(--c-border)]">
                  <p className="text-xs font-mono text-[var(--c-primary)] font-bold uppercase tracking-wider">
                    ⚡ Historia Urológica & Andrológica
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <InfoCard label="Disfunción eréctil" value={patient.erectile_dysfunction} />
                    <InfoCard label="Uso de testosterona" value={patient.testosterone_use} />
                    <InfoCard label="Detalle testosterona" value={patient.testosterone_detalle} />
                    <InfoCard label="Número de hijos" value={patient.children} />
                    <InfoCard label="Último PSA (año)" value={patient.psa_ultimo} />
                    <InfoCard label="Resultado PSA (ng/mL)" value={patient.psa_valor} />
                  </div>
                </div>
              )}

              {/* Salud Sexual y Mental */}
              <div className="space-y-4 pt-3 border-t border-[var(--c-border)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
                    <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Salud Sexual</p>
                    <p className="text-xs sm:text-sm text-[var(--c-text)]">
                      Libido basal: <strong>{patient.libido_basal ? `${patient.libido_basal}/10` : 'No especificado'}</strong>
                    </p>
                    {patient.salud_sexual_notas && (
                      <p className="text-xs text-[var(--c-text-2)] pt-1">{patient.salud_sexual_notas}</p>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
                    <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Salud Mental</p>
                    <p className="text-xs sm:text-sm text-[var(--c-text)]">
                      Diagnósticos: <strong>{patient.dx_psiquiatrico || 'Sin diagnóstico reportado'}</strong>
                    </p>
                    {patient.med_psiquiatrica && (
                      <p className="text-xs text-[var(--c-text-2)]">Fármacos: {patient.med_psiquiatrica}</p>
                    )}
                    {patient.trauma_relevante && (
                      <p className="text-xs text-[var(--c-text-2)]">Traumas: {patient.trauma_relevante}</p>
                    )}
                  </div>
                </div>

                {patient.sust_recreativas && (
                  <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
                    <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Sustancias Recreativas</p>
                    <p className="text-xs sm:text-sm text-[var(--c-text)]">{patient.sust_recreativas}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            PESTAÑA 6: ESTUDIOS, LABORATORIOS Y FOTOS (ANTES Y DESPUÉS)
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'archivos' && role !== 'receptionist' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Formulario de carga continua */}
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--c-text)]">
                  Subir estudio, análisis o fotografía clínica
                </h3>
                <p className="text-xs text-[var(--c-text-2)] mt-0.5">
                  Archivos complementarios sin requerir abrir una consulta. La IA leerá automáticamente estos documentos al resumir el caso.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1 font-bold">Tipo de archivo</label>
                  <select
                    value={fileCat}
                    onChange={e => setFileCat(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-xl text-xs sm:text-sm text-[var(--c-text)] outline-none focus:border-[var(--c-primary)]"
                  >
                    <option value="laboratorio">🧪 Resultados de laboratorio</option>
                    <option value="estudio">📄 Estudio / Imagenología</option>
                    <option value="foto_clinica">📸 Foto clínica (Antes / Después)</option>
                  </select>
                </div>

                {fileCat === 'foto_clinica' && (
                  <div>
                    <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1 font-bold">Etapa</label>
                    <select
                      value={fileStage}
                      onChange={e => setFileStage(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-xl text-xs sm:text-sm text-[var(--c-text)] outline-none focus:border-[var(--c-primary)]"
                    >
                      <option value="antes">Antes (Basal)</option>
                      <option value="seguimiento">Seguimiento intermedio</option>
                      <option value="despues">Después (Resultado final)</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1 font-bold">
                    {fileCat === 'foto_clinica' ? 'Zona anatómica / Ángulo' : 'Nombre del estudio'}
                  </label>
                  <input
                    value={fileZona}
                    onChange={e => setFileZona(e.target.value)}
                    placeholder={fileCat === 'foto_clinica' ? 'Ej. Rostro frontal, Abdomen…' : 'Ej. Biometría hemática…'}
                    className="w-full px-3 py-2 bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-xl text-xs sm:text-sm text-[var(--c-text)] outline-none focus:border-[var(--c-primary)]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1 font-bold">Fecha del estudio</label>
                  <input
                    type="date"
                    value={fileFecha}
                    onChange={e => setFileFecha(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-xl text-xs sm:text-sm text-[var(--c-text)] outline-none focus:border-[var(--c-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-[var(--c-text-3)] uppercase block mb-1 font-bold">Observaciones clínicas</label>
                <input
                  value={fileNotas}
                  onChange={e => setFileNotas(e.target.value)}
                  placeholder="Ej. Paciente envió por WhatsApp tras 4 semanas de tratamiento…"
                  className="w-full px-3 py-2 bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-xl text-xs sm:text-sm text-[var(--c-text)] outline-none focus:border-[var(--c-primary)]"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <input
                  ref={continuousFileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadContinuousFile(f);
                    e.target.value = '';
                  }}
                />
                <span className="text-xs text-[var(--c-text-3)]">
                  Formatos admitidos: PDF (con lectura automática de texto para IA), JPG, PNG, WebP.
                </span>
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => continuousFileRef.current?.click()}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:opacity-90 transition disabled:opacity-50 cursor-pointer shrink-0"
                  style={{ background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}
                >
                  {uploadingFile ? 'Subiendo archivo…' : '+ Seleccionar y subir archivo'}
                </button>
              </div>
            </div>

            {/* Comparador visual Antes y Después */}
            {(() => {
              const fotos = patientFiles.filter(f => f.category === 'foto_clinica' || (f.mime || '').startsWith('image/'));
              if (fotos.length < 2) return null;
              const beforeFoto = fotos.find(f => f.id === compareBeforeId) || fotos.find(f => f.stage === 'antes') || fotos[fotos.length - 1];
              const afterFoto = fotos.find(f => f.id === compareAfterId) || fotos.find(f => f.stage === 'despues') || fotos[0];
              return (
                <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--c-text)] uppercase tracking-wider">
                      📸 Comparativo Clínico: Antes y Después
                    </h3>
                    <p className="text-xs text-[var(--c-text-2)]">
                      Compara la evolución visual lado a lado seleccionando las fotografías deseadas.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: 'ANTES (BASAL)', current: beforeFoto, setSel: setCompareBeforeId },
                      { label: 'DESPUÉS (EVOLUCIÓN)', current: afterFoto, setSel: setCompareAfterId },
                    ].map((col, idx) => (
                      <div key={idx} className="bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-bold text-[var(--c-primary)]">{col.label}</span>
                          <select
                            value={col.current?.id || ''}
                            onChange={e => col.setSel(e.target.value)}
                            className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl px-2.5 py-1 text-xs text-[var(--c-text)] outline-none"
                          >
                            {fotos.map(f => (
                              <option key={f.id} value={f.id}>
                                {(f.fecha || '').slice(0, 10)} · {f.stage?.toUpperCase() || 'FOTO'} {f.zona ? `(${f.zona})` : `— ${f.name}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        {col.current?.url && (
                          <div className="aspect-[4/3] bg-black/40 rounded-xl overflow-hidden flex items-center justify-center border border-[var(--c-border)]">
                            <img src={col.current.url} alt={col.current.name} className="max-h-full max-w-full object-contain" />
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-[var(--c-text-2)]">
                          <span className="font-semibold">{col.current?.zona || col.current?.name}</span>
                          <span>{col.current?.fecha}</span>
                        </div>
                        {col.current?.notas && <p className="text-xs text-[var(--c-text)] bg-[var(--c-card)] p-2 rounded-xl">{col.current.notas}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Galería de archivos */}
            {patientFiles.length === 0 ? (
              <div className="text-center py-12 bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6">
                <p className="text-xs sm:text-sm text-[var(--c-text-2)]">
                  Aún no hay estudios, laboratorios ni fotografías clínicas cargadas en este expediente.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {patientFiles.map((f: any) => {
                  const isImg = (f.mime || '').startsWith('image/');
                  return (
                    <div key={f.id} className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-5 flex flex-col gap-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-[var(--c-primary)] border border-[color-mix(in_srgb,var(--c-primary)_30%,transparent)] font-bold">
                              {f.category === 'foto_clinica' ? `📸 Foto ${f.stage || ''}` : f.category === 'laboratorio' ? '🧪 Laboratorio' : '📄 Estudio'}
                            </span>
                            {f.zona && <span className="text-xs font-bold text-[var(--c-text)]">{f.zona}</span>}
                            <span className="text-[11px] font-mono text-[var(--c-text-3)]">· {f.fecha}</span>
                          </div>
                          <p className="text-xs text-[var(--c-text-2)] truncate max-w-[280px]">{f.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {f.url && (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-[var(--c-subtle)] border border-[var(--c-border)] text-[var(--c-primary)] hover:border-[var(--c-primary)] transition"
                            >
                              Abrir ↗
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteContinuousFile(f.id)}
                            className="text-xs text-[var(--c-danger)] hover:opacity-80 px-1.5 py-1 cursor-pointer font-bold"
                            title="Eliminar archivo"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {isImg && f.url && (
                        <a href={f.url} target="_blank" rel="noreferrer" className="block bg-black/20 rounded-2xl overflow-hidden max-h-56 flex items-center justify-center border border-[var(--c-border)]">
                          <img src={f.url} alt={f.name} className="max-h-56 object-contain" />
                        </a>
                      )}

                      {f.notas && <p className="text-xs text-[var(--c-text)] bg-[var(--c-subtle)] rounded-xl p-3 border border-[var(--c-border)]">{f.notas}</p>}

                      {f.extracted_text && (
                        <details className="text-xs text-[var(--c-text-2)] bg-[var(--c-subtle)] rounded-xl p-3 border border-[var(--c-border)]">
                          <summary className="cursor-pointer font-mono text-[11px] text-[var(--c-primary)] font-bold">
                            Texto digitalizado para IA ({f.extracted_text.length} caracteres)
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--c-text)] max-h-40 overflow-y-auto font-sans">{f.extracted_text}</p>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            PESTAÑA 7: DATOS GENERALES & CONTACTO
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'contacto' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Canales de Contacto */}
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--c-border)] pb-3">
                <span className="text-lg">📞</span>
                <h3 className="text-sm font-bold text-[var(--c-text)] uppercase tracking-wider">
                  Canales de Contacto & Notificaciones
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
                  <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Celular (WhatsApp)</p>
                  <p className="text-sm font-bold text-[var(--c-text)]">{patient.phone || 'No registrado'}</p>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#10b981] hover:underline pt-1"
                    >
                      <span>💬</span> Abrir chat de WhatsApp ↗
                    </a>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
                  <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Teléfono Fijo / Alternativo</p>
                  <p className="text-sm font-bold text-[var(--c-text)]">{patient.phone_landline || 'No registrado'}</p>
                </div>

                <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
                  <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold">Correo Electrónico</p>
                  <p className="text-sm font-bold text-[var(--c-text)] truncate">{patient.email || 'No registrado'}</p>
                  {patient.email && (
                    <a href={`mailto:${patient.email}`} className="text-xs text-[var(--c-primary)] font-bold hover:underline pt-1 block">
                      ✉️ Enviar correo
                    </a>
                  )}
                </div>
              </div>

              {/* Contacto de Emergencia */}
              {patient.emergency_contact_name && (
                <div className="mt-4 p-5 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-3">
                  <p className="text-xs font-mono text-[var(--c-warn)] uppercase font-bold tracking-wider">
                    🆘 Contacto de Emergencia
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <InfoCard label="Nombre" value={patient.emergency_contact_name} />
                    <InfoCard label="Parentesco" value={patient.emergency_contact_relationship} />
                    <InfoCard label="Teléfono" value={patient.emergency_contact_phone} />
                    <InfoCard label="Correo" value={patient.emergency_contact_email} />
                  </div>
                </div>
              )}
            </div>

            {/* Facturación Fiscal (CFDI) */}
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--c-border)] pb-3">
                <span className="text-lg">🧾</span>
                <h3 className="text-sm font-bold text-[var(--c-text)] uppercase tracking-wider">
                  Datos Fiscales de Facturación (CFDI)
                </h3>
              </div>

              {patient.billing?.requiere ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <InfoCard label="RFC" value={patient.billing?.rfc} />
                  <InfoCard label="Razón Social / Nombre Fiscal" value={patient.billing?.razon_social} />
                  <InfoCard label="Régimen Fiscal" value={patient.billing?.regimen} />
                  <InfoCard label="Uso de CFDI" value={patient.billing?.uso_cfdi} />
                  <InfoCard label="Código Postal Fiscal" value={patient.billing?.cp} />
                  <InfoCard label="Correo Fiscal" value={patient.billing?.email} />
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-[var(--c-text-2)] py-2">
                  El paciente no requiere facturación fiscal digital. Sus notas de consulta se emiten al público en general.
                </p>
              )}
            </div>

            {/* Canal de Origen / Marketing */}
            {(patient.sources_of_contact?.length > 0 || patient.referred_other || patient.social_network || patient.prev_redes || patient.prev_web || patient.prev_gmaps) && (
              <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-[var(--c-border)] pb-3">
                  <span className="text-lg">📢</span>
                  <h3 className="text-sm font-bold text-[var(--c-text)] uppercase tracking-wider">
                    Canal de Origen & Prospección
                  </h3>
                </div>

                {Array.isArray(patient.sources_of_contact) && patient.sources_of_contact.length > 0 && (
                  <div>
                    <p className="text-xs font-mono text-[var(--c-text-3)] mb-2 uppercase font-semibold">¿Cómo se enteró de la clínica?</p>
                    <div className="flex flex-wrap gap-2">
                      {patient.sources_of_contact.map((s: string) => (
                        <span key={s} className="px-3 py-1 bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] border border-[color-mix(in_srgb,var(--c-primary)_30%,transparent)] rounded-full text-xs font-bold text-[var(--c-primary)]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoCard label="Red social específica" value={patient.social_network} />
                  <InfoCard label="Especificación de referencia" value={patient.referred_other || patient.referred_by} />
                </div>

                {(patient.prev_redes || patient.prev_web || patient.prev_gmaps) && (
                  <div className="pt-2">
                    <p className="text-xs font-mono text-[var(--c-text-3)] mb-2 uppercase font-semibold">Canales consultados antes de asistir</p>
                    <div className="flex flex-wrap gap-2">
                      {patient.prev_redes && (
                        <span className="px-3 py-1 bg-[color-mix(in_srgb,var(--c-violet)_15%,transparent)] border border-[color-mix(in_srgb,var(--c-violet)_30%,transparent)] rounded-full text-xs text-[var(--c-violet)] font-bold">
                          📱 Redes Sociales
                        </span>
                      )}
                      {patient.prev_web && (
                        <span className="px-3 py-1 bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] border border-[color-mix(in_srgb,var(--c-primary)_30%,transparent)] rounded-full text-xs text-[var(--c-primary)] font-bold">
                          🌐 Página Web Oficial
                        </span>
                      )}
                      {patient.prev_gmaps && (
                        <span className="px-3 py-1 bg-[color-mix(in_srgb,var(--c-success)_15%,transparent)] border border-[color-mix(in_srgb,var(--c-success)_30%,transparent)] rounded-full text-xs text-[var(--c-success)] font-bold">
                          📍 Google Maps / GMN
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            PESTAÑA 8: NOTAS DEL EQUIPO
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'notas' && (
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">💬</span>
                <h3 className="text-sm font-bold text-[var(--c-text)] uppercase tracking-wider">
                  Bitácora de Observaciones y Mensajes del Equipo
                </h3>
              </div>
              <span className="text-xs font-mono text-[var(--c-text-3)] font-bold">
                {patientNotes.length} nota(s)
              </span>
            </div>

            <NoteThread
              patientId={patientId}
              notes={patientNotes}
              onNoteAdded={n => setPatientNotes(prev => [...prev, n])}
              onNoteDeleted={id => setPatientNotes(prev => prev.filter(n => n.id !== id))}
            />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            PESTAÑA 9: GESTIÓN Y BAJA DEL EXPEDIENTE
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'gestion' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--c-border)] pb-3">
                <span className="text-lg">⚙️</span>
                <h3 className="text-sm font-bold text-[var(--c-text)] uppercase tracking-wider">
                  Estado Administrativo del Expediente
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <InfoCard label="ID del Paciente" value={patient.id} />
                <InfoCard label="Etapa del Registro" value={patient.registration_phase?.toUpperCase() || 'COMPLETO'} />
                <InfoCard label="Fecha de Registro" value={patient.created_at ? new Date(patient.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'} />
              </div>
            </div>

            {/* Módulo de Baja o Eliminación */}
            <div className="border border-[color-mix(in_srgb,var(--c-danger)_30%,var(--c-border))] rounded-3xl p-6 bg-[color-mix(in_srgb,var(--c-danger)_6%,var(--c-card))] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-[var(--c-danger)]">
                    {role === 'doctor' ? 'Zona Peligrosa: Eliminación Definitiva' : 'Solicitud de Baja de Expediente'}
                  </h4>
                  <p className="text-xs text-[var(--c-text-2)] mt-0.5">
                    {role === 'doctor'
                      ? 'Como médico titular puedes borrar este expediente de forma irreversible.'
                      : 'Solicita la baja del expediente para autorización del médico titular.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDanger(!showDanger)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-[var(--c-danger)] text-[var(--c-danger)] hover:bg-[color-mix(in_srgb,var(--c-danger)_15%,transparent)] transition cursor-pointer"
                >
                  {showDanger ? 'Ocultar opciones ▲' : 'Ver opciones ▼'}
                </button>
              </div>

              {showDanger && (
                <div ref={dangerRevealRef} className="pt-4 border-t border-[color-mix(in_srgb,var(--c-danger)_20%,transparent)] space-y-3">
                  {role === 'doctor' ? (
                    <div className="space-y-3">
                      <p className="text-xs sm:text-sm text-[var(--c-text-2)]">
                        Al eliminar este expediente se borrarán todas sus consultas, recetas, estudios y notas asociadas.
                      </p>
                      <button
                        type="button"
                        onClick={deletePatientDirectly}
                        disabled={deleting}
                        className="px-5 py-2.5 bg-[var(--c-danger)] text-white text-xs sm:text-sm font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition shadow-sm cursor-pointer"
                      >
                        {deleting ? 'Eliminando expediente…' : '🗑️ Borrar registro definitivamente'}
                      </button>
                    </div>
                  ) : pendingDel ? (
                    <div className="bg-[color-mix(in_srgb,var(--c-warn)_15%,transparent)] border border-[color-mix(in_srgb,var(--c-warn)_35%,transparent)] rounded-2xl p-4 space-y-1">
                      <p className="text-xs sm:text-sm font-bold text-[var(--c-warn)]">Baja pendiente de aprobación del doctor</p>
                      <p className="text-xs text-[var(--c-text-2)]">Ya se envió una solicitud de baja para este expediente.</p>
                      {pendingDel.reason && <p className="text-xs text-[var(--c-text)]">Motivo: {pendingDel.reason}</p>}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs sm:text-sm text-[var(--c-text-2)]">
                        Se enviará una solicitud al buzón de aprobaciones del médico titular.
                      </p>
                      {!confirmDelete ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          className="px-5 py-2.5 bg-[color-mix(in_srgb,var(--c-danger)_15%,transparent)] text-[var(--c-danger)] border border-[var(--c-danger)] text-xs sm:text-sm font-bold rounded-xl hover:bg-[color-mix(in_srgb,var(--c-danger)_25%,transparent)] transition cursor-pointer"
                        >
                          Solicitar baja de expediente
                        </button>
                      ) : (
                        <div ref={confirmRevealRef} className="bg-[var(--c-card)] border border-[var(--c-danger)] rounded-2xl p-4 space-y-3">
                          <p className="text-xs sm:text-sm font-bold text-[var(--c-danger)]">
                            Confirmar solicitud para: {patient.full_name}
                          </p>
                          <textarea
                            value={delReason}
                            onChange={e => setDelReason(e.target.value)}
                            rows={3}
                            placeholder="Describe el motivo de la baja…"
                            className="w-full px-3 py-2 bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-xl text-xs sm:text-sm text-[var(--c-text)] outline-none focus:border-[var(--c-danger)]"
                          />
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={requestDeletion}
                              disabled={deleting}
                              className="px-4 py-2 bg-[var(--c-danger)] text-white text-xs font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition cursor-pointer"
                            >
                              {deleting ? 'Enviando…' : 'Enviar solicitud'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDelete(false);
                                setDelReason('');
                              }}
                              className="px-4 py-2 text-xs text-[var(--c-text-2)] border border-[var(--c-border)] rounded-xl hover:text-[var(--c-text)] transition cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onSave={handleCroppedUpload}
        />
      )}
    </div>
  );
}

// ─── COMPONENTES AUXILIARES ESTILIZADOS Y SEMÁNTICOS ───

function InfoCard({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-[var(--c-border)] space-y-1">
      <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-semibold tracking-wider">{label}</p>
      <p className="text-xs sm:text-sm font-bold text-[var(--c-text)]">{String(value)}</p>
    </div>
  );
}

// ─── VISITA EXPANDIBLE (HISTORIAL DETALLADO) ───

function VisitDetail({
  patientId,
  visit: v,
  index,
  expanded,
  onToggle,
}: {
  patientId: string;
  visit: any;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const detailRef = useRevealScroll<HTMLDivElement>(expanded);
  const date = new Date(v.created_at).toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisFetched, setAnalysisFetched] = useState(false);

  useEffect(() => {
    if (!expanded || analysisFetched) return;
    setAnalysisLoading(true);
    (async () => {
      try {
        const session = await getSession();
        const token = session?.access_token;
        const res = await fetch(`${BACKEND()}/analyze/${v.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setAnalysis(await res.json());
      } catch {}
      setAnalysisFetched(true);
      setAnalysisLoading(false);
    })();
  }, [expanded, analysisFetched, v.id]);

  const peso = v.peso || v.weight;
  const talla = v.talla || v.height;
  const fc = v.fc || v.heart_rate;
  const temp = v.temperatura || v.temperature;
  const glucosa = v.glucosa || v.glucose;
  const imc = v.imc;
  const motivo = v.motivo || v.visit_reason;
  const intensidad = v.motivo_intensidad || v.discomfort_intensity;

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl overflow-hidden shadow-sm transition">
      {/* Header de la visita */}
      <div className="w-full text-left p-5 sm:p-6 hover:bg-[var(--c-subtle)]/50 transition">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onToggle} className="flex items-center gap-3 text-left flex-1 cursor-pointer">
            <span className="text-xs font-mono bg-[color-mix(in_srgb,var(--c-primary)_14%,transparent)] text-[var(--c-primary)] border border-[color-mix(in_srgb,var(--c-primary)_30%,transparent)] px-3 py-1 rounded-full font-bold">
              Consulta #{index}
            </span>
            <span className="text-xs sm:text-sm text-[var(--c-text-2)] capitalize font-medium">{date}</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                router.push(`/dashboard/patient/${patientId}/visit/${v.id}/documentos`);
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[var(--c-card)] border border-[var(--c-border)] text-[var(--c-primary)] hover:border-[var(--c-primary)] transition shadow-sm cursor-pointer"
            >
              🖨️ Receta / Docs
            </button>
            <button type="button" onClick={onToggle} className="text-[var(--c-text-3)] text-base px-2 cursor-pointer font-bold">
              {expanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        <div onClick={onToggle} className="cursor-pointer pt-2">
          {motivo && <p className="text-[var(--c-text)] font-bold text-sm sm:text-base">{motivo}</p>}
          <div className="flex flex-wrap gap-2 mt-2.5">
            {peso && <MiniChip label="Peso" value={`${peso} kg`} />}
            {fc && <MiniChip label="FC" value={`${fc} lpm`} />}
            {v.pa_der_sistolica && <MiniChip label="PA Der." value={`${v.pa_der_sistolica}/${v.pa_der_diastolica}`} />}
            {glucosa && <MiniChip label="Glucosa" value={`${glucosa} mg/dL`} />}
            {v.spo2 && <MiniChip label="SpO₂" value={`${v.spo2}%`} />}
            {intensidad && <MiniChip label="Intensidad" value={`${intensidad}/10`} />}
          </div>
        </div>
      </div>

      {/* Detalle expandido */}
      {expanded && (
        <div ref={detailRef} className="px-5 sm:px-6 pb-6 border-t border-[var(--c-border)] space-y-6 pt-5 bg-[var(--c-subtle)]/30">
          {/* Signos Vitales */}
          {(v.pa_der_sistolica || fc || temp || v.spo2 || glucosa) && (
            <div className="space-y-3">
              <p className="text-xs font-mono text-[var(--c-primary)] uppercase font-bold tracking-wider">Signos Vitales</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {v.pa_der_sistolica && <InfoCard label="PA Derecha" value={`${v.pa_der_sistolica}/${v.pa_der_diastolica} mmHg`} />}
                {v.pa_izq_sistolica && <InfoCard label="PA Izquierda" value={`${v.pa_izq_sistolica}/${v.pa_izq_diastolica} mmHg`} />}
                <InfoCard label="Frecuencia Cardíaca" value={fc ? `${fc} lpm` : undefined} />
                <InfoCard label="Temperatura" value={temp ? `${temp} °C` : undefined} />
                <InfoCard label="SpO₂" value={v.spo2 ? `${v.spo2}%` : undefined} />
                <InfoCard label="Glucosa" value={glucosa ? `${glucosa} mg/dL` : undefined} />
                <InfoCard label="Glucosa en ayuno" value={v.glucosa_ayuno} />
                {v.ecg_realizado !== undefined && v.ecg_realizado !== null && (
                  <InfoCard label="ECG realizado" value={v.ecg_realizado ? 'Sí' : 'No'} />
                )}
              </div>
            </div>
          )}

          {/* Composición Corporal */}
          {(peso || talla || imc || v.circ_cintura || v.inbody_grasa) && (
            <div className="space-y-3 pt-3 border-t border-[var(--c-border)]">
              <p className="text-xs font-mono text-[var(--c-primary)] uppercase font-bold tracking-wider">Antropometría & Composición</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <InfoCard label="Peso" value={peso ? `${peso} kg` : undefined} />
                <InfoCard label="Talla" value={talla ? `${talla} cm` : undefined} />
                <InfoCard label="IMC" value={imc ? `${imc} kg/m²` : undefined} />
                <InfoCard label="Circunferencia cintura" value={v.circ_cintura ? `${v.circ_cintura} cm` : undefined} />
              </div>
              {(v.inbody_grasa || v.inbody_musculo || v.inbody_agua || v.inbody_visceral) && (
                <div className="p-4 rounded-2xl bg-[var(--c-card)] border border-[var(--c-border)] space-y-2 mt-2">
                  <p className="text-[11px] font-mono text-[var(--c-text-3)] uppercase font-bold">InBody / Bioimpedancia</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <InfoCard label="Grasa corporal" value={v.inbody_grasa ? `${v.inbody_grasa}%` : undefined} />
                    <InfoCard label="Músculo esquelético" value={v.inbody_musculo ? `${v.inbody_musculo} kg` : undefined} />
                    <InfoCard label="Agua corporal" value={v.inbody_agua ? `${v.inbody_agua}%` : undefined} />
                    <InfoCard label="Nivel visceral" value={v.inbody_visceral ? `${v.inbody_visceral}` : undefined} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Exploración Física */}
          {(v.exploracion_general || v.exploracion_piel || v.exploracion_abdomen) && (
            <div className="space-y-3 pt-3 border-t border-[var(--c-border)]">
              <p className="text-xs font-mono text-[var(--c-primary)] uppercase font-bold tracking-wider">Exploración Física</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <InfoCard label="Aspecto general" value={v.exploracion_general} />
                <InfoCard label="Piel y mucosas" value={v.exploracion_piel} />
                <InfoCard label="Ojos / Conjuntivas" value={v.exploracion_ojos} />
                <InfoCard label="Boca / Faringe" value={v.exploracion_boca} />
                <InfoCard label="Cuello / Tiroides" value={v.exploracion_tiroides} />
                <InfoCard label="Abdomen" value={v.exploracion_abdomen} />
                <InfoCard label="Extremidades" value={v.exploracion_extremidades} />
              </div>
              {v.exploracion_notas && (
                <p className="text-xs text-[var(--c-text)] bg-[var(--c-card)] p-3 rounded-xl border border-[var(--c-border)]">
                  {v.exploracion_notas}
                </p>
              )}
            </div>
          )}

          {/* Consulta Lite: Cierre, Receta y Plan */}
          {v.dynamic_answers?.lite && (() => {
            const L = v.dynamic_answers.lite;
            const c = L.cierre || {};
            const sg = L.seguimiento || {};
            const hf = L.heredofamiliar || {};
            const rec = Array.isArray(L.receta) ? L.receta.filter((m: any) => m?.nombre_generico || m?.nombre) : [];
            if (!(c.plan || c.evolucion || c.estudios_solicitados || c.proxima_cita || sg.efectos_adversos || sg.pa_domicilio || sg.hospitalizado_desde || hf.cardiopatia_precoz || rec.length > 0)) {
              return null;
            }
            return (
              <div className="space-y-3 pt-3 border-t border-[var(--c-border)]">
                <p className="text-xs font-mono text-[var(--c-primary)] uppercase font-bold tracking-wider">
                  {L.kind === 'follow_up' ? 'Seguimiento & Prescripción' : 'Plan Terapéutico & Receta'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoCard label="Evolución clínica" value={c.evolucion} />
                  <InfoCard label="Plan e indicaciones" value={c.plan} />
                  <InfoCard label="Estudios solicitados" value={c.estudios_solicitados} />
                  <InfoCard
                    label="Próxima cita"
                    value={c.proxima_cita ? new Date(c.proxima_cita + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined}
                  />
                </div>

                {rec.length > 0 && (
                  <div className="mt-3 p-4 rounded-2xl bg-[var(--c-card)] border border-[var(--c-border)] space-y-2">
                    <p className="text-xs font-mono text-[var(--c-primary)] uppercase font-bold">
                      Receta Médica Prescrita ({rec.length} medicamentos)
                    </p>
                    <div className="space-y-2">
                      {rec.map((m: any, idx: number) => (
                        <div key={idx} className="bg-[var(--c-subtle)] border border-[var(--c-border)] rounded-xl p-3 text-xs">
                          <p className="font-bold text-[var(--c-text)]">
                            {m.nombre_generico || m.nombre} {m.presentacion ? `· ${m.presentacion}` : ''}
                          </p>
                          <p className="text-[var(--c-text-2)] mt-0.5">
                            {[m.dosis, m.via, m.frecuencia, m.duracion].filter(Boolean).join(' · ')}
                          </p>
                          {m.indicacion && <p className="text-[11px] text-[var(--c-text-3)] mt-1">{m.indicacion}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function MiniChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-xs bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl px-2.5 py-1 text-[var(--c-text-2)] font-medium">
      <span className="text-[var(--c-text-3)]">{label}:</span> {value}
    </span>
  );
}
