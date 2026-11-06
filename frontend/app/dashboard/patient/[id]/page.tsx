'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import NoteThread, { Note } from '@/app/components/NoteThread';
import { useRevealScroll } from '@/app/lib/useRevealScroll';
import PhotoCropModal from '@/app/components/PhotoCropModal';
import { getRole } from '@/app/lib/role';
import { useEntitlements } from '@/app/lib/useEntitlements';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const ORINA_LABELS: Record<string, string> = {
  '#FFF9C4': 'Muy pálido — bien hidratado',
  '#FFF176': 'Amarillo pálido — normal',
  '#FFD600': 'Amarillo — hidratación aceptable',
  '#F9A825': 'Amarillo intenso — poca hidratación',
  '#E65100': 'Naranja — deshidratación',
  '#BF360C': 'Naranja oscuro — evaluar',
};

export default function PatientPage() {
  const router   = useRouter();
  const params   = useParams();
  const patientId = params?.id as string;

  const [user, setUser]       = useState<any>(null);
  const [role, setRole]       = useState<string>('doctor');
  const [patient, setPatient] = useState<any>(null);
  const [visits,  setVisits]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<'ficha' | 'visitas' | 'archivos'>('ficha');
  const [showDanger,    setShowDanger]    = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [pendingDel,    setPendingDel]    = useState<any>(null);   // solicitud de baja pendiente
  const [delReason,     setDelReason]     = useState('');
  const dangerRevealRef  = useRevealScroll<HTMLDivElement>(showDanger);
  const confirmRevealRef = useRevealScroll<HTMLDivElement>(confirmDelete);
  const [patientNotes,    setPatientNotes]    = useState<Note[]>([]);
  const [visitsError,     setVisitsError]     = useState<string | null>(null);
  const [expandedVisit,   setExpandedVisit]   = useState<string | null>(null);
  const [uploadingPhoto,  setUploadingPhoto]  = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Registro continuo: estudios, laboratorios y fotos (Antes y Después) sin requerir visita
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

  // Resumen con IA del paciente (Lite + Pro)
  const [aiSummary, setAiSummary] = useState<{ text: string; generated_at?: string; visits_count?: number; files_count?: number } | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState('');
  const [showAiSummary, setShowAiSummary] = useState(false);

  const handlePhotoSelected = (file: File) => {
    if (!file.type.startsWith('image/')) { alert('Selecciona un archivo de imagen'); return; }
    if (file.size > 25 * 1024 * 1024) { alert('La imagen no debe superar 25 MB'); return; }
    setCropFile(file);
  };

  const handleCroppedUpload = async (base64: string) => {
    setCropFile(null);
    setUploadingPhoto(true);
    try {
      const session = await getSession();
      const token   = session?.access_token;
      const headers: Record<string,string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`${BACKEND()}/patients/${patientId}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ photo_url: base64 }),
      });
      if (res.ok) setPatient((prev: any) => ({ ...prev, photo_url: base64 }));
      else alert('Error al guardar la foto');
    } catch { alert('Error de conexión'); }
    setUploadingPhoto(false);
  };

  useEffect(() => { setRole(getRole()); }, []);

  // Consultorios Lite (IA de consulta apagada) capturan la consulta con el formulario básico.
  const { lite, team } = useEntitlements();

  useEffect(() => {
    getUser().then(async u => {
      if (!u) { router.push('/auth/login'); return; }
      setUser(u);
      loadData(u);
    });
  }, [patientId]);

  const loadData = async (u?: any) => {
    try {
      const session = await getSession();
      const token   = session?.access_token;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [pRes, vRes, fRes] = await Promise.all([
        fetch(`${BACKEND()}/patients/${patientId}`, { headers }),
        fetch(`${BACKEND()}/visits/${patientId}`,   { headers }),
        fetch(`${BACKEND()}/patients/${patientId}/files`, { headers }).catch(() => null),
      ]);
      const pData    = await pRes.json();
      const vData    = await vRes.json();
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
        const nRes  = await fetch(`${BACKEND()}/patients/${patientId}/notes`, { headers });
        const nData = await nRes.json();
        setPatientNotes(nData.notes || []);
      } catch (_) {}
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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

  // Eliminación directa cuando el usuario es el médico (sin auto-autorizarse)
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

  // ¿Ya hay una solicitud de baja pendiente para este expediente?
  useEffect(() => {
    if (!patientId) return;
    (async () => {
      try {
        const session = await getSession();
        const headers: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
        const r = await fetch(`${BACKEND()}/deletions/for-patient/${patientId}`, { headers });
        if (r.ok) { const d = await r.json(); setPendingDel(d.pending ? d.request : null); }
      } catch { /* silencioso */ }
    })();
  }, [patientId]);

  // Solicitar la baja del expediente (NO borra: la aprueba el doctor).
  const requestDeletion = async () => {
    setDeleting(true);
    try {
      const session = await getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) };
      const r = await fetch(`${BACKEND()}/deletions/request`, {
        method: 'POST', headers, body: JSON.stringify({ patient_id: patientId, reason: delReason }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || 'No se pudo enviar la solicitud');
      setPendingDel(d.request || { reason: delReason });
      setConfirmDelete(false); setDelReason('');
    } catch (e: any) {
      alert(e.message || 'No se pudo enviar la solicitud de baja');
    } finally { setDeleting(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">Cargando ficha...</div>
  );
  if (!patient) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">Paciente no encontrado.</div>
  );

  const dob      = patient.date_of_birth || patient.birth_date;
  const age      = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000*60*60*24*365.25)) : null;
  const initials = `${patient.first_name?.[0]||''}${patient.last_name?.[0]||''}`.toUpperCase();
  const latestVisit = visits[0] || null;

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-6 py-8">

        {/* ── Header del paciente ── */}
        <div className="mb-6 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6">
          <div className="flex items-start gap-5">
            {/* Avatar clicable — cambia foto */}
            <div className="relative flex-shrink-0 group cursor-pointer"
              onClick={() => photoInputRef.current?.click()}
              title="Cambiar foto del paciente">
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelected(f); e.target.value = ''; }} />
              {patient.photo_url ? (
                <img src={patient.photo_url} alt="foto"
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-[#1e2d3d] group-hover:border-[#00e5a0] transition" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-[#1e2d3d] text-[#7a95aa] flex items-center justify-center text-2xl font-semibold group-hover:opacity-80 transition">
                  {uploadingPhoto ? '…' : (initials || '?')}
                </div>
              )}
              <div className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <span className="text-white text-xs font-bold text-center leading-tight px-1">
                  {uploadingPhoto ? 'Subiendo…' : 'Cambiar foto'}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-serif font-bold text-[#dde6ef] mb-0.5">{patient.full_name}</h1>
              <p className="font-mono text-xs text-[#3d5870]">{patient.id}</p>
            </div>
            {/* Botones acción */}
            <div className="flex flex-wrap gap-2 flex-shrink-0 justify-end">
              {role !== 'receptionist' && (
                <button
                  onClick={handleGenerateAiSummary}
                  disabled={aiSummaryLoading}
                  className="px-3.5 py-2.5 rounded-xl text-sm font-bold transition whitespace-nowrap border"
                  style={{
                    background: 'color-mix(in srgb, var(--c-primary) 14%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--c-primary) 40%, transparent)',
                    color: 'var(--c-primary)',
                  }}
                  title="Analiza con IA todas las visitas, estudios, laboratorios, medicamentos y evolución del paciente"
                >
                  {aiSummaryLoading ? '✦ Analizando con IA…' : '✦ Resumen con IA'}
                </button>
              )}
              {role !== 'receptionist' && (
                <button
                  onClick={() => setTab('archivos')}
                  className="px-3.5 py-2.5 bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] text-sm font-semibold rounded-xl hover:border-[#00e5a0] transition whitespace-nowrap"
                  title="Subir estudios, análisis o fotos de Antes y Después sin abrir visita"
                >
                  📎 Subir estudio / foto
                </button>
              )}
              <button
                onClick={() => router.push(`/dashboard/patient/${patientId}/${lite ? 'consulta' : 'new-visit'}`)}
                className="px-4 py-2.5 bg-[#00e5a0] text-black text-sm font-bold rounded-xl hover:opacity-90 transition whitespace-nowrap"
              >
                {lite ? 'Nueva consulta' : 'Nueva visita'}
              </button>
              <button
                onClick={() => router.push(`/dashboard/new-patient/flow?patient_id=${patientId}&phase=1`)}
                className="px-4 py-2.5 bg-[#1e2d3d] text-[#dde6ef] text-sm font-semibold rounded-xl hover:bg-[#2a3a4d] transition"
              >
                Editar
              </button>
              <button
                onClick={async () => {
                  try {
                    const s = await getSession().catch(() => null);
                    const res = await fetch(`${BACKEND()}/patients/${patientId}/send-prescription`, {
                      method: 'POST',
                      headers: s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {},
                    });
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { alert(d.detail || 'No se pudo enviar la prescripción'); return; }
                    if (d.enviado) alert(`Prescripción enviada a ${d.to}`);
                    else if (d.mailto) { window.location.href = d.mailto; }
                    else alert('Prescripción lista para enviar');
                  } catch { alert('Error al enviar la prescripción'); }
                }}
                className="px-4 py-2.5 bg-[#1e2d3d] text-[#dde6ef] text-sm font-semibold rounded-xl hover:bg-[#2a3a4d] transition whitespace-nowrap"
                title="Envía al paciente la última prescripción del médico"
              >
                Enviar prescripción
              </button>
            </div>
          </div>
          {/* Datos rápidos — fila completa, repartida con etiquetas */}
          <div className="flex flex-wrap gap-2.5 mt-5 pt-5 border-t border-[#1e2d3d]">
            {age !== null && <Chip icon="" label="Edad" text={`${age} años`} />}
            {dob        && <Chip icon="" label="Nacimiento" text={new Date(dob+'T00:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'})} />}
            {patient.sexo_biologico && <Chip icon="" label="Sexo" text={patient.sexo_biologico} color={patient.sexo_biologico==='Masculino'?'var(--c-blue)':'var(--c-pink)'} />}
            {patient.occupation    && <Chip icon="" label="Ocupación" text={patient.occupation} />}
            {patient.city          && <Chip icon="" label="Ciudad" text={patient.city} />}
            {patient.registration_phase === 'complete'
              ? <Chip icon="" label="Estado" text="Registro completo" color="var(--c-green)" />
              : <Chip icon="" label="Estado" text="Registro incompleto" color="var(--c-amber)" />}
          </div>
        </div>

        {/* ── Resumen clínico con IA (visible al generarlo o si ya existe en caché) ── */}
        {role !== 'receptionist' && (showAiSummary || aiSummary?.text) && (
          <div className="mb-6 bg-[#0d1520] border border-[#00e5a0]/35 rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✦</span>
                <h2 className="text-sm font-bold text-[#dde6ef] uppercase tracking-wider">Resumen integral del paciente con IA</h2>
                {aiSummary?.generated_at && (
                  <span className="text-[11px] font-mono text-[#7a95aa]">
                    · Actualizado {new Date(aiSummary.generated_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateAiSummary}
                  disabled={aiSummaryLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#111820] border border-[#1e2d3d] text-[#00e5a0] hover:border-[#00e5a0] transition disabled:opacity-50"
                >
                  {aiSummaryLoading ? 'Generando…' : '↻ Actualizar resumen'}
                </button>
                <button
                  onClick={() => setShowAiSummary(false)}
                  className="text-xs text-[#7a95aa] hover:text-[#dde6ef] px-2 py-1"
                >
                  Ocultar
                </button>
              </div>
            </div>
            {aiSummaryLoading && (
              <div className="flex items-center gap-3 py-4 text-sm text-[#7a95aa]">
                <span className="w-4 h-4 border-2 border-[#00e5a0] border-t-transparent rounded-full animate-spin" />
                Leyendo historial clínico, visitas, recetas, estudios, laboratorios y fotos del paciente…
              </div>
            )}
            {aiSummaryError && (
              <p className="text-xs text-[#f43f5e] bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-xl px-3 py-2">{aiSummaryError}</p>
            )}
            {!aiSummaryLoading && aiSummary?.text && (
              <div className="text-sm text-[#dde6ef] whitespace-pre-wrap leading-relaxed bg-[#111820] border border-[#1e2d3d] rounded-xl p-4">
                {aiSummary.text}
              </div>
            )}
          </div>
        )}

        {/* ── Banner registro pendiente ── */}
        {patient.registration_phase && patient.registration_phase !== 'complete' && (
          <div className="mb-6 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-2xl px-5 py-4 flex items-center gap-4">
            <span className="text-2xl"></span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#f59e0b]">Registro pendiente</p>
              <p className="text-xs text-[#7a95aa] mt-0.5">
                {patient.registration_phase === 'reception' && team.has_nurse
                  ? 'Faltan secciones de Enfermería y Médico.'
                  : 'Falta la sección del Médico.'}
              </p>
            </div>
            <button
              onClick={() => router.push(`/dashboard/new-patient/flow?patient_id=${patientId}&phase=${patient.registration_phase === 'reception' && team.has_nurse ? 2 : 3}`)}
              className="px-4 py-2 bg-[#f59e0b] text-black text-xs font-bold rounded-xl hover:opacity-90 transition flex-shrink-0"
            >
              Continuar →
            </button>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-6 mb-6" style={{ borderBottom: '1px solid var(--c-border)' }}>
          {[
            { key: 'ficha',   label: role === 'receptionist' ? ' Ficha' : ' Ficha clínica' },
            ...(role !== 'receptionist' ? [
              { key: 'visitas',  label: ` Visitas (${visits.length})` },
              { key: 'archivos', label: ` Estudios y Fotos · Antes/Después (${patientFiles.length})` },
            ] : []),
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className="px-1 pb-3 -mb-px text-[15px] font-medium transition"
              style={{ color: tab===t.key ? 'var(--c-primary)' : 'var(--c-text-2)', borderBottom: `2px solid ${tab===t.key ? 'var(--c-primary)' : 'transparent'}` }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════
            TAB: FICHA
        ════════════════════════════════ */}
        {tab === 'ficha' && (
          <div className="space-y-5">

            {/* Datos generales */}
            <Section title="Datos generales" icon="">
              <Grid>
                <Info label="Nombre completo"   value={patient.full_name} />
                <Info label="Fecha de nacimiento" value={dob ? new Date(dob+'T00:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}) : undefined} />
                <Info label="Edad"               value={age ? `${age} años` : undefined} />
                <Info label="Ocupación"          value={patient.occupation} />
                <Info label="Ciudad / Estado"    value={patient.city} />
              </Grid>
            </Section>

            {/* Contacto y captación: NO los ve enfermería */}
            {role !== 'nurse' && <>
            {/* Contacto */}
            <Section title="Contacto" icon="">
              <Grid>
                <Info label="Correo"       value={patient.email} />
                <Info label="Celular"      value={patient.phone} />
                <Info label="Teléfono fijo" value={patient.phone_landline} />
              </Grid>
              {patient.emergency_contact_name && (
                <div className="mt-4 p-4 bg-[#111820] rounded-xl border border-[#1e2d3d]">
                  <p className="text-xs font-mono text-[#f97316] mb-3 uppercase tracking-wider">🆘 Contacto de emergencia</p>
                  <Grid>
                    <Info label="Nombre"    value={patient.emergency_contact_name} />
                    <Info label="Relación"  value={patient.emergency_contact_relationship} />
                    <Info label="Teléfono"  value={patient.emergency_contact_phone} />
                    <Info label="Correo"    value={patient.emergency_contact_email} />
                  </Grid>
                </div>
              )}
            </Section>

            {/* Cómo nos conoció */}
            {(patient.sources_of_contact?.length > 0 || patient.referred_other || patient.social_network || patient.prev_redes || patient.prev_web || patient.prev_gmaps) && (
              <Section title="¿Cómo nos conoció? / ¿Revisó antes?" icon="">
                {Array.isArray(patient.sources_of_contact) && patient.sources_of_contact.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {patient.sources_of_contact.map((s: string) => (
                      <span key={s} className="px-3 py-1 bg-[#0ea5e9]/10 border border-[#0ea5e9]/30 rounded-full text-xs text-[#0ea5e9]">{s}</span>
                    ))}
                  </div>
                )}
                <Grid>
                  <Info label="Red social"          value={patient.social_network} />
                  <Info label="Especificación Otro" value={patient.referred_other} />
                </Grid>
                {(patient.prev_redes || patient.prev_web || patient.prev_gmaps) && (
                  <div className="mt-3">
                    <p className="text-xs font-mono text-[#3d5870] mb-2 uppercase tracking-wider">Revisó antes de venir</p>
                    <div className="flex flex-wrap gap-2">
                      {patient.prev_redes && <span className="px-3 py-1 bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-full text-xs text-[#6366f1]"> Redes sociales</span>}
                      {patient.prev_web   && <span className="px-3 py-1 bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-full text-xs text-[#6366f1]"> Página web</span>}
                      {patient.prev_gmaps && <span className="px-3 py-1 bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-full text-xs text-[#6366f1]"> Google Maps</span>}
                    </div>
                  </div>
                )}
              </Section>
            )}
            </>}

            {/* Todo el bloque clínico: NO lo ve recepción */}
            {role !== 'receptionist' && <>
            {/* Antecedentes médicos */}
            <Section title="Antecedentes médicos" icon="">
              <Grid>
                <Info label="Enfermedades crónicas"    value={patient.chronic_diseases} />
                <Info label="Cirugías"                 value={patient.surgeries} />
                <Info label="Hospitalizaciones"        value={patient.hospitalizations} />
                <Info label="Fracturas"                value={patient.fractures} />
                <Info label="Transfusiones"            value={patient.transfusions} />
                <Info label="Enfermedades infantiles"  value={patient.childhood_diseases} />
                <Info label="Alergias a medicamentos"  value={patient.allergies_medications} />
                <Info label="Alergias alimentarias"    value={patient.allergies_foods} />
                <Info label="Alergias ambientales"     value={patient.allergies_environmental} />
              </Grid>
              {patient.med_notas && (
                <div className="mt-3">
                  <Info label="Notas adicionales de medicamentos" value={patient.med_notas} />
                </div>
              )}
            </Section>

            {/* Medicamentos actuales */}
            {Array.isArray(patient.medications) && patient.medications.length > 0 && (
              <Section title="Medicamentos actuales" icon="">
                <div className="space-y-3">
                  {patient.medications.map((m: any, i: number) => (
                    <div key={i} className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-3">
                      <p className="font-semibold text-[#dde6ef] text-sm">{m.nombre || '—'}</p>
                      <div className="flex flex-wrap gap-4 mt-1.5">
                        {m.dosis       && <span className="text-xs text-[#7a95aa]"><span className="text-[#3d5870]">Dosis:</span> {m.dosis}</span>}
                        {m.frecuencia  && <span className="text-xs text-[#7a95aa]"><span className="text-[#3d5870]">Frecuencia:</span> {m.frecuencia}</span>}
                        {m.adherencia  && <span className="text-xs text-[#7a95aa]"><span className="text-[#3d5870]">Adherencia:</span> {m.adherencia}</span>}
                        {m.desde       && <span className="text-xs text-[#7a95aa]"><span className="text-[#3d5870]">Desde:</span> {m.desde}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Historia familiar */}
            {patient.family_history_table && (
              <Section title="Historia heredofamiliar" icon="">
                <div className="space-y-3">
                  {(['padre','madre','hermanos'] as const).map(fam => {
                    const row = patient.family_history_table[fam];
                    if (!row) return null;
                    const conditions = [
                      row.diabetes     && 'Diabetes',
                      row.hipertension && 'Hipertensión',
                      row.cancer       && 'Cáncer',
                      row.cardiopatia  && 'Cardiopatía',
                      row.otra         && row.otra,
                    ].filter(Boolean) as string[];
                    return (
                      <div key={fam} className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-semibold text-[#dde6ef] capitalize min-w-[70px]">{fam}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${row.vivo ? 'bg-[#00e5a0]/10 text-[#00e5a0]' : 'bg-[#f43f5e]/10 text-[#f43f5e]'}`}>
                            {row.vivo ? 'Vivo' : 'Fallecido'}
                          </span>
                          {conditions.length > 0
                            ? conditions.map(c => <span key={c} className="text-xs bg-[#f97316]/10 border border-[#f97316]/30 text-[#f97316] px-2 py-0.5 rounded-full">{c}</span>)
                            : <span className="text-xs text-[#3d5870]">Sin antecedentes registrados</span>}
                        </div>
                        {!row.vivo && (row.causa_muerte || row.edad_muerte) && (
                          <p className="text-xs text-[#7a95aa] mt-1.5 ml-1">
                            {row.causa_muerte && `Causa: ${row.causa_muerte}`}
                            {row.causa_muerte && row.edad_muerte && ' · '}
                            {row.edad_muerte && `Edad: ${row.edad_muerte}`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Heredofamiliares capturados en la consulta (familiar · enfermedad · edad) */}
            {Array.isArray(patient.family_other_history) && patient.family_other_history.length > 0 && (
              <Section title="Heredofamiliares registrados" icon="">
                <div className="space-y-2">
                  {patient.family_other_history.map((r: any, i: number) => (
                    <div key={i} className="bg-[#111820] border border-[#1e2d3d] rounded-xl px-3 py-2 text-sm text-[#dde6ef]">
                      <span className="font-semibold">{r.parentesco}</span>
                      <span className="text-[#7a95aa]"> · {r.enfermedad}</span>
                      {r.detalle && <span className="text-[#7a95aa]"> · {r.detalle}</span>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Hábitos */}
            <Section title="Hábitos" icon="">
              <Grid>
                <Info label="Tabaquismo"       value={patient.smoking_status} />
                {patient.smoking_status && patient.smoking_status !== 'Nunca' && <>
                  <Info label="Fumador desde"  value={patient.smoking_since} />
                  <Info label="Años fumando"   value={patient.smoking_years} />
                </>}
                <Info label="Alcohol"          value={patient.alcohol_status} />
                {patient.alcohol_status && patient.alcohol_status !== 'No consume' && <>
                  {Array.isArray(patient.alcohol_tipo) && patient.alcohol_tipo.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-[#3d5870] mb-1 uppercase tracking-wider">Tipo de bebida</p>
                      <div className="flex flex-wrap gap-1.5">
                        {patient.alcohol_tipo.map((t: string) => <span key={t} className="text-xs bg-[#1e2d3d] text-[#7a95aa] px-2 py-0.5 rounded-full">{t}</span>)}
                      </div>
                    </div>
                  )}
                  <Info label="Cantidad / frecuencia" value={patient.alcohol_cantidad} />
                </>}
              </Grid>
            </Section>

            {/* Historia clínica privada — MÉDICO */}
            <div className="bg-[#0d1520] border border-[#a78bfa]/30 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-[#dde6ef] mb-4 flex items-center gap-2">
                 Historia clínica privada
                <span className="text-xs font-normal text-[#a78bfa] bg-[#a78bfa]/10 px-2 py-0.5 rounded-full border border-[#a78bfa]/20">Solo médico</span>
              </h3>
              <div className="space-y-5">

                {/* Sexo / género */}
                <Grid>
                  <Info label="Sexo biológico de nacimiento" value={patient.sexo_biologico} />
                  <Info label="Género con que se identifica"  value={patient.genero_identidad} />
                </Grid>

                {/* Reproductiva femenina */}
                {patient.sexo_biologico === 'Femenino' && (
                  <div>
                    <p className="text-xs font-mono text-[#ec4899] mb-2 uppercase tracking-wider"> Historia gineco-obstétrica</p>
                    <Grid>
                      <Info label="Menarca (edad)"       value={patient.menarca_age} />
                      <Info label="Ciclos menstruales"   value={patient.ciclos_regulares} />
                      <Info label="Embarazos"            value={patient.pregnancies} />
                      <Info label="Partos / Cesáreas"    value={patient.births} />
                      <Info label="Abortos"              value={patient.miscarriages} />
                      <Info label="Menopausia"           value={patient.menopausal_tipo} />
                      <Info label="Edad de menopausia"   value={patient.menopausal_age} />
                      <Info label="Anticonceptivo actual" value={patient.contraceptive} />
                      <Info label="Último Pap"           value={patient.pap_ultimo} />
                      <Info label="Última mastografía"   value={patient.masto_ultima} />
                      <Info label="Última colposcopía"   value={patient.colpo_ultima} />
                    </Grid>
                  </div>
                )}

                {/* Reproductiva masculina */}
                {patient.sexo_biologico === 'Masculino' && (
                  <div>
                    <p className="text-xs font-mono text-[#0ea5e9] mb-2 uppercase tracking-wider"> Historia reproductiva masculina</p>
                    <Grid>
                      <Info label="Disfunción eréctil"       value={patient.erectile_dysfunction} />
                      <Info label="Uso de testosterona"       value={patient.testosterone_use} />
                      <Info label="Detalle testosterona"      value={patient.testosterone_detalle} />
                      <Info label="Número de hijos"          value={patient.children} />
                      <Info label="Último PSA (año)"         value={patient.psa_ultimo} />
                      <Info label="Resultado PSA (ng/mL)"    value={patient.psa_valor} />
                    </Grid>
                  </div>
                )}

                {/* Salud sexual */}
                <div>
                  <p className="text-xs font-mono text-[#a78bfa] mb-2 uppercase tracking-wider"> Salud sexual</p>
                  <Grid>
                    <Info label="Libido basal"  value={patient.libido_basal ? `${patient.libido_basal}/10` : undefined} />
                  </Grid>
                  <Info label="Notas de salud sexual" value={patient.salud_sexual_notas} />
                </div>

                {/* Salud mental */}
                <div>
                  <p className="text-xs font-mono text-[#a78bfa] mb-2 uppercase tracking-wider"> Salud mental</p>
                  <Grid>
                    <Info label="Diagnósticos psiquiátricos"   value={patient.dx_psiquiatrico} />
                    <Info label="Medicamentos psiquiátricos"   value={patient.med_psiquiatrica} />
                    <Info label="Eventos traumáticos"          value={patient.trauma_relevante} />
                  </Grid>
                </div>

                {/* Sustancias recreativas */}
                {patient.sust_recreativas && (
                  <div>
                    <p className="text-xs font-mono text-[#a78bfa] mb-2 uppercase tracking-wider"> Sustancias recreativas</p>
                    <p className="text-sm text-[#dde6ef]">{patient.sust_recreativas}</p>
                  </div>
                )}
              </div>
            </div>
            </>}

            {/* Notas del equipo */}
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-[#dde6ef] flex items-center gap-2 mb-4">
                 Notas del equipo
                {patientNotes.length > 0 && (
                  <span className="text-xs font-mono text-[#3d5870] font-normal">{patientNotes.length} nota{patientNotes.length>1?'s':''}</span>
                )}
              </h3>
              <NoteThread
                patientId={patientId}
                notes={patientNotes}
                onNoteAdded={n => setPatientNotes(prev => [...prev, n])}
                onNoteDeleted={id => setPatientNotes(prev => prev.filter(n => n.id !== id))}
              />
            </div>

            {/* Baja de expediente: si es el médico, borra directamente tras confirmación; si es staff, solicita autorización */}
            <div className="mt-2 border border-[#f43f5e]/20 rounded-2xl p-5 bg-[#f43f5e]/5">
              <button onClick={() => setShowDanger(!showDanger)}
                className="flex items-center gap-2 text-[#f43f5e] font-semibold text-sm hover:opacity-80 transition">
                 {role === 'doctor' ? 'Eliminar registro de paciente' : 'Baja de expediente'} {showDanger ? '▲' : '▼'}
              </button>
              {showDanger && (
                <div ref={dangerRevealRef} className="mt-4 space-y-3">
                  {role === 'doctor' ? (
                    <div className="space-y-3">
                      <p className="text-sm text-[#7a95aa]">
                        Como médico titular puedes eliminar este registro directamente sin pasos intermedios.
                      </p>
                      <button
                        onClick={deletePatientDirectly}
                        disabled={deleting}
                        className="px-5 py-2.5 bg-[#f43f5e] text-white text-sm font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition"
                      >
                        {deleting ? 'Eliminando…' : '🗑️ Borrar registro definitivamente'}
                      </button>
                    </div>
                  ) : pendingDel ? (
                    <div className="bg-[#f59e0b]/10 border border-[#f59e0b]/40 rounded-xl p-4">
                      <p className="text-sm font-bold text-[#f59e0b]"> Baja pendiente de aprobación del doctor</p>
                      <p className="text-xs text-[#7a95aa] mt-1">Ya se solicitó la baja de este expediente. Solo el doctor puede aprobarla desde su plataforma.</p>
                      {pendingDel.reason && <p className="text-xs text-[#7a95aa] mt-1">Motivo: <span className="text-[#dde6ef]">{pendingDel.reason}</span></p>}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-[#7a95aa]">
                        Se enviará una <strong className="text-[#dde6ef]">solicitud de baja</strong> para que el médico la autorice.
                      </p>
                      {!confirmDelete ? (
                        <button onClick={() => setConfirmDelete(true)}
                          className="px-5 py-2.5 bg-[#f43f5e]/20 text-[#f43f5e] border border-[#f43f5e]/40 text-sm font-bold rounded-xl hover:bg-[#f43f5e]/30 transition">
                           Solicitar baja de expediente
                        </button>
                      ) : (
                        <div ref={confirmRevealRef} className="bg-[#f43f5e]/10 border border-[#f43f5e]/50 rounded-xl p-4 space-y-3">
                          <p className="text-sm font-bold text-[#f43f5e]">Solicitar baja de <strong className="text-[#dde6ef]">{patient.full_name}</strong></p>
                          <textarea value={delReason} onChange={e => setDelReason(e.target.value)} rows={3}
                            placeholder="Motivo de la baja (recomendado)…"
                            className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-xl text-[#dde6ef] text-sm outline-none focus:border-[#f43f5e]" />
                          <div className="flex gap-3">
                            <button onClick={requestDeletion} disabled={deleting}
                              className="px-5 py-2.5 bg-[#f43f5e] text-white text-sm font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition">
                              {deleting ? 'Enviando…' : 'Enviar solicitud al doctor'}
                            </button>
                            <button onClick={() => { setConfirmDelete(false); setDelReason(''); }}
                              className="px-5 py-2.5 text-sm text-[#7a95aa] border border-[#1e2d3d] rounded-xl hover:border-[#7a95aa] transition">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════
            TAB: VISITAS
        ════════════════════════════════ */}
        {tab === 'visitas' && (
          <div className="space-y-4">
            {visitsError && (
              <div className="text-center py-6 bg-[rgba(244,63,94,.08)] border border-[#f43f5e]/40 rounded-2xl">
                <p className="text-[#f43f5e] font-medium"> No se pudieron cargar las visitas: {visitsError}</p>
                <button onClick={() => loadData()}
                  className="mt-3 px-4 py-2 border border-[#f43f5e]/40 text-[#f43f5e] text-sm rounded-lg hover:bg-[#f43f5e]/10 transition">
                  Reintentar
                </button>
              </div>
            )}
            {visits.length === 0 && !visitsError ? (
              <div className="text-center py-16 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl">
                <p className="text-4xl mb-3"></p>
                <p className="text-[#7a95aa] text-lg font-medium">No hay visitas registradas</p>
                <button onClick={() => router.push(`/dashboard/new-patient/flow?patient_id=${patientId}&phase=2`)}
                  className="mt-4 px-6 py-3 bg-[#00e5a0] text-black font-bold rounded-xl hover:opacity-90 transition">
                  Registrar primera visita
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

        {/* ════════════════════════════════
            TAB: ESTUDIOS, LABORATORIOS Y FOTOS (ANTES Y DESPUÉS) SIN VISITA
        ════════════════════════════════ */}
        {tab === 'archivos' && role !== 'receptionist' && (
          <div className="space-y-6">
            {/* Formulario para agregar estudio/foto sin abrir visita */}
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#dde6ef]">Subir estudio, análisis o foto de evolución (sin registrar visita)</h3>
                <p className="text-xs text-[#7a95aa] mt-0.5">
                  Ideal cuando el paciente envía resultados por WhatsApp o correo, o para llevar control fotográfico de Antes y Después. La IA leerá automáticamente estos archivos al generar el resumen del paciente.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Tipo de archivo</label>
                  <select
                    value={fileCat}
                    onChange={e => setFileCat(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-xl text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                  >
                    <option value="laboratorio">🧪 Resultados de laboratorio</option>
                    <option value="estudio">📄 Estudio / Gabinete / Imagen</option>
                    <option value="foto_clinica">📸 Foto clínica (Antes / Después)</option>
                  </select>
                </div>
                {fileCat === 'foto_clinica' && (
                  <div>
                    <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Etapa (Antes / Después)</label>
                    <select
                      value={fileStage}
                      onChange={e => setFileStage(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-xl text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                    >
                      <option value="antes">Antes (Basal)</option>
                      <option value="seguimiento">Seguimiento intermedio</option>
                      <option value="despues">Después (Resultado)</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">
                    {fileCat === 'foto_clinica' ? 'Zona anatómica / ángulo' : 'Nombre del estudio'}
                  </label>
                  <input
                    value={fileZona}
                    onChange={e => setFileZona(e.target.value)}
                    placeholder={fileCat === 'foto_clinica' ? 'Ej. Rostro frontal, Abdomen…' : 'Ej. Biometría hemática, Perfil tiroideo…'}
                    className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-xl text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Fecha del estudio / toma</label>
                  <input
                    type="date"
                    value={fileFecha}
                    onChange={e => setFileFecha(e.target.value)}
                    className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-xl text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-mono text-[#7a95aa] uppercase block mb-1">Notas u observaciones clínicas (opcional)</label>
                <input
                  value={fileNotas}
                  onChange={e => setFileNotas(e.target.value)}
                  placeholder="Ej. Paciente envió por WhatsApp tras 4 semanas de tratamiento; mejoría notable en textura…"
                  className="w-full px-3 py-2 bg-[#111820] border border-[#1e2d3d] rounded-xl text-sm text-[#dde6ef] outline-none focus:border-[#00e5a0]"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
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
                <span className="text-xs text-[#7a95aa]">Formatos admitidos: PDF (con lectura automática de texto), JPG, PNG, WebP, HEIC.</span>
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => continuousFileRef.current?.click()}
                  className="px-5 py-2.5 bg-[#00e5a0] text-black text-sm font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
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
                <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-[#dde6ef] uppercase tracking-wider">📸 Comparativo Antes y Después</h3>
                      <p className="text-xs text-[#7a95aa]">Selecciona dos fotografías para comparar la evolución del paciente lado a lado.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: 'ANTES / BASAL', current: beforeFoto, setSel: setCompareBeforeId },
                      { label: 'DESPUÉS / EVOLUCIÓN', current: afterFoto, setSel: setCompareAfterId },
                    ].map((col, idx) => (
                      <div key={idx} className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono font-bold text-[#00e5a0]">{col.label}</span>
                          <select
                            value={col.current?.id || ''}
                            onChange={e => col.setSel(e.target.value)}
                            className="bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-2 py-1 text-xs text-[#dde6ef]"
                          >
                            {fotos.map(f => (
                              <option key={f.id} value={f.id}>
                                {(f.fecha || '').slice(0, 10)} · {f.stage?.toUpperCase() || 'FOTO'} {f.zona ? `(${f.zona})` : `— ${f.name}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        {col.current?.url && (
                          <div className="aspect-[4/3] bg-black/40 rounded-lg overflow-hidden flex items-center justify-center">
                            <img src={col.current.url} alt={col.current.name} className="max-h-full max-w-full object-contain" />
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-[#7a95aa]">
                          <span>{col.current?.zona || col.current?.name}</span>
                          <span>{col.current?.fecha}</span>
                        </div>
                        {col.current?.notas && <p className="text-xs text-[#dde6ef]">{col.current.notas}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Lista de archivos subidos */}
            {patientFiles.length === 0 ? (
              <div className="text-center py-12 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl">
                <p className="text-[#7a95aa] text-sm">Aún no hay estudios, laboratorios ni fotos de evolución cargados directamente en la ficha.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {patientFiles.map((f: any) => {
                  const isImg = (f.mime || '').startsWith('image/');
                  return (
                    <div key={f.id} className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#00e5a0]/10 text-[#00e5a0] border border-[#00e5a0]/30">
                              {f.category === 'foto_clinica' ? `📸 Foto ${f.stage || ''}` : f.category === 'laboratorio' ? '🧪 Laboratorio' : '📄 Estudio'}
                            </span>
                            {f.zona && <span className="text-xs font-semibold text-[#dde6ef]">{f.zona}</span>}
                            <span className="text-[11px] font-mono text-[#7a95aa]">· {f.fecha}</span>
                          </div>
                          <p className="text-xs text-[#7a95aa] truncate">{f.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {f.url && (
                            <a href={f.url} target="_blank" rel="noreferrer"
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#111820] border border-[#1e2d3d] text-[#00e5a0] hover:border-[#00e5a0]">
                              Abrir ↗
                            </a>
                          )}
                          <button
                            onClick={() => handleDeleteContinuousFile(f.id)}
                            className="text-xs text-[#f43f5e] hover:opacity-80 px-1.5 py-1"
                            title="Eliminar archivo"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {isImg && f.url && (
                        <a href={f.url} target="_blank" rel="noreferrer" className="block bg-black/30 rounded-xl overflow-hidden max-h-56 flex items-center justify-center">
                          <img src={f.url} alt={f.name} className="max-h-56 object-contain" />
                        </a>
                      )}
                      {f.notas && <p className="text-xs text-[#dde6ef] bg-[#111820] rounded-lg px-3 py-2">{f.notas}</p>}
                      {f.extracted_text && (
                        <details className="text-xs text-[#7a95aa] bg-[#111820] rounded-lg px-3 py-2">
                          <summary className="cursor-pointer font-mono text-[11px] text-[#00e5a0]">Texto extraído para IA ({f.extracted_text.length} caracteres)</summary>
                          <p className="mt-2 whitespace-pre-wrap text-[11px] text-[#dde6ef] max-h-40 overflow-y-auto">{f.extracted_text}</p>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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

// ─── Sub-componentes ───────────────────────────────────────────────────────

const CHIP_TONO: Record<string, string> = { 'var(--c-green)': 'var(--c-success)', 'var(--c-amber)': 'var(--c-warn)' };
const Chip = ({ label, text, color }: { icon?: string; label: string; text: string; color?: string }) => (
  <span className="inline-flex items-baseline gap-2 px-3 py-1.5 bg-[#111820] border border-[#1e2d3d] rounded-lg text-sm">
    <span className="text-[#3d5870] text-xs">{label}</span>
    <span style={{ color: (color && CHIP_TONO[color]) || 'var(--c-text)', fontWeight: 500 }}>{text}</span>
  </span>
);

const Section = ({ title, children }: { title: string; icon?: string; children: React.ReactNode }) => (
  <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
    <h3 className="text-[15px] font-semibold text-[#dde6ef] mb-4">{title}</h3>
    {children}
  </div>
);

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
);

const Info = ({ label, value }: { label: string; value?: string | number | null }) => (
  value !== null && value !== undefined && value !== '' ? (
    <div>
      <p className="text-xs font-mono text-[#3d5870] mb-0.5 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-[#dde6ef]">{String(value)}</p>
    </div>
  ) : null
);

// ─── Tarjeta de visita expandible ──────────────────────────────────────────

const ORINA_LABELS_LOCAL: Record<string, string> = {
  '#FFF9C4': 'Muy pálido — bien hidratado',
  '#FFF176': 'Amarillo pálido — normal',
  '#FFD600': 'Amarillo — aceptable',
  '#F9A825': 'Amarillo intenso — poca hidratación',
  '#E65100': 'Naranja — deshidratación',
  '#BF360C': 'Naranja oscuro — evaluar',
};

function VisitDetail({ patientId, visit: v, index, expanded, onToggle }: {
  patientId: string; visit: any; index: number; expanded: boolean; onToggle: () => void;
}) {
  const router = useRouter();
  const detailRef = useRevealScroll<HTMLDivElement>(expanded);
  const date = new Date(v.created_at).toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
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
        const token   = session?.access_token;
        const res = await fetch(`${BACKEND()}/analyze/${v.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setAnalysis(await res.json());
      } catch { /* sin diagnóstico disponible */ }
      setAnalysisFetched(true);
      setAnalysisLoading(false);
    })();
  }, [expanded, analysisFetched, v.id]);

  // Resolución de campos (español y inglés para compatibilidad)
  const peso    = v.peso    || v.weight;
  const talla   = v.talla   || v.height;
  const fc      = v.fc      || v.heart_rate;
  const temp    = v.temperatura || v.temperature;
  const glucosa = v.glucosa || v.glucose;
  const imc     = v.imc;
  const motivo  = v.motivo  || v.visit_reason;
  const intensidad = v.motivo_intensidad || v.discomfort_intensity;

  return (
    <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden">
      {/* Header de la visita — siempre visible */}
      <div className="w-full text-left p-5 hover:bg-[#111820] transition">
        <div className="flex items-center justify-between gap-2">
          <button onClick={onToggle} className="flex items-center gap-3 text-left flex-1">
            <span className="text-xs font-mono bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/20 px-2.5 py-1 rounded-full">
              Visita #{index}
            </span>
            <span className="text-xs text-[#3d5870]">{date.charAt(0).toUpperCase() + date.slice(1)}</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); router.push(`/dashboard/patient/${patientId}/visit/${v.id}/documentos`); }}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#111820] border border-[#1e2d3d] text-[#00e5a0] hover:border-[#00e5a0] transition"
            >
              🖨️ Receta / Documentos
            </button>
            <button onClick={onToggle} className="text-[#3d5870] text-lg px-2">{expanded ? '▲' : '▼'}</button>
          </div>
        </div>
        <div onClick={onToggle} className="cursor-pointer">
          {motivo && <p className="text-[#dde6ef] font-medium mt-2 text-sm">{motivo}</p>}
          {/* Chips resumen rápido */}
          <div className="flex flex-wrap gap-2 mt-2">
            {peso      && <MiniChip label="Peso"    value={`${peso} kg`} />}
            {fc        && <MiniChip label="FC"      value={`${fc} lpm`} />}
            {v.pa_der_sistolica && <MiniChip label="PA" value={`${v.pa_der_sistolica}/${v.pa_der_diastolica}`} />}
            {glucosa   && <MiniChip label="Glucosa" value={`${glucosa} mg/dL`} />}
            {v.spo2    && <MiniChip label="SpO₂"   value={`${v.spo2}%`} />}
            {intensidad && <MiniChip label="Intensidad" value={`${intensidad}/10`} />}
          </div>
        </div>
      </div>

      {/* Detalle expandido — TODOS los datos */}
      {expanded && (
        <div ref={detailRef} className="px-5 pb-6 border-t border-[#1e2d3d] space-y-6 pt-5">

          {/* Signos vitales */}
          {(v.pa_der_sistolica || fc || temp || v.spo2 || glucosa) && (
            <VisitSection title="Signos vitales" icon="">
              <Grid>
                {v.pa_der_sistolica && <Info label="PA Derecha"       value={`${v.pa_der_sistolica}/${v.pa_der_diastolica} mmHg`} />}
                {v.pa_izq_sistolica && <Info label="PA Izquierda"     value={`${v.pa_izq_sistolica}/${v.pa_izq_diastolica} mmHg`} />}
                <Info label="Frec. cardíaca"  value={fc   ? `${fc} lpm`   : undefined} />
                <Info label="Temperatura"     value={temp ? `${temp} °C`  : undefined} />
                <Info label="SpO₂"           value={v.spo2   ? `${v.spo2}%`   : undefined} />
                <Info label="Glucosa"         value={glucosa  ? `${glucosa} mg/dL` : undefined} />
                <Info label="Glucosa en ayuno" value={v.glucosa_ayuno} />
                {v.ecg_realizado !== undefined && v.ecg_realizado !== null &&
                  <Info label="ECG realizado" value={v.ecg_realizado ? 'Sí' : 'No'} />}
              </Grid>
            </VisitSection>
          )}

          {/* Composición corporal */}
          {(peso || talla || imc || v.circ_cintura || v.inbody_grasa) && (
            <VisitSection title="Composición corporal" icon="⚖️">
              <Grid>
                <Info label="Peso"           value={peso  ? `${peso} kg`       : undefined} />
                <Info label="Talla"          value={talla ? `${talla} cm`       : undefined} />
                <Info label="IMC"            value={imc   ? `${imc} kg/m²`      : undefined} />
                <Info label="Circ. abdominal" value={v.circ_abdominal ? `${v.circ_abdominal} cm` : undefined} />
                <Info label="Circ. cintura"  value={v.circ_cintura ? `${v.circ_cintura} cm` : undefined} />
                <Info label="Circ. cadera"   value={v.circ_cadera  ? `${v.circ_cadera} cm`  : undefined} />
                <Info label="Circ. cuello"   value={v.circ_cuello  ? `${v.circ_cuello} cm`  : undefined} />
                <Info label="Circ. bíceps"   value={v.circ_biceps  ? `${v.circ_biceps} cm`  : undefined} />
                <Info label="Circ. muñeca"   value={v.circ_muneca  ? `${v.circ_muneca} cm`  : undefined} />
              </Grid>
              {(v.inbody_grasa || v.inbody_musculo || v.inbody_agua || v.inbody_visceral) && (
                <div className="mt-3">
                  <p className="text-xs font-mono text-[#3d5870] mb-2 uppercase tracking-wider">InBody / Bioimpedancia</p>
                  <Grid>
                    <Info label="Grasa"    value={v.inbody_grasa    ? `${v.inbody_grasa}%`     : undefined} />
                    <Info label="Músculo"  value={v.inbody_musculo  ? `${v.inbody_musculo} kg`  : undefined} />
                    <Info label="Agua"     value={v.inbody_agua     ? `${v.inbody_agua}%`       : undefined} />
                    <Info label="Visceral" value={v.inbody_visceral ? `${v.inbody_visceral}`     : undefined} />
                  </Grid>
                </div>
              )}
            </VisitSection>
          )}

          {/* Actividad física */}
          {v.actividad_si !== undefined && v.actividad_si !== null && (
            <VisitSection title="Actividad física" icon="">
              <p className="text-sm text-[#dde6ef] mb-2">{v.actividad_si ? 'Sí realiza actividad física regularmente' : 'No realiza actividad física regular'}</p>
              {v.actividad_si && (
                <Grid>
                  <Info label="Tipo de ejercicio" value={v.actividad_tipo} />
                  <Info label="Frecuencia"         value={v.actividad_frecuencia} />
                  <Info label="Intensidad"         value={v.actividad_intensidad} />
                </Grid>
              )}
            </VisitSection>
          )}

          {/* Pruebas funcionales */}
          {(v.fuerza_mano_der || v.marcha_4m || v.equilibrio_seg || v.sentarse_levantarse) && (
            <VisitSection title="Pruebas funcionales" icon="">
              <Grid>
                <Info label="Fuerza prensil Der." value={v.fuerza_mano_der  ? `${v.fuerza_mano_der} kg`  : undefined} />
                <Info label="Fuerza prensil Izq." value={v.fuerza_mano_izq  ? `${v.fuerza_mano_izq} kg`  : undefined} />
                <Info label="Marcha 4m"          value={v.marcha_4m         ? `${v.marcha_4m} seg`       : undefined} />
                <Info label="Equilibrio"         value={v.equilibrio_seg    ? `${v.equilibrio_seg} seg`  : undefined} />
                <Info label="Sentarse/levantarse" value={v.sentarse_levantarse ? `${v.sentarse_levantarse}×` : undefined} />
              </Grid>
            </VisitSection>
          )}

          {/* Reporte subjetivo */}
          {(v.energia_despertar || v.sueno_calidad || v.metas) && (
            <VisitSection title="Reporte subjetivo del paciente" icon="">
              <Grid>
                <Info label="Energía al despertar" value={v.energia_despertar ? `${v.energia_despertar}/10` : undefined} />
                <Info label="Energía por la tarde" value={v.energia_tarde     ? `${v.energia_tarde}/10`     : undefined} />
                <Info label="Energía por la noche" value={v.energia_noche     ? `${v.energia_noche}/10`     : undefined} />
                <Info label="Calidad del sueño"    value={v.sueno_calidad     ? `${v.sueno_calidad}/10`     : undefined} />
                <Info label="Horas de sueño"       value={v.sueno_horas       ? `${v.sueno_horas} h`        : undefined} />
                <Info label="Digestión"            value={v.digestion_val     ? `${v.digestion_val}/10`     : undefined} />
                <Info label="Libido"               value={v.libido_visita     ? `${v.libido_visita}/10`     : undefined} />
              </Grid>
              {Array.isArray(v.animo_tags) && v.animo_tags.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-mono text-[#3d5870] mb-1.5 uppercase">Estado anímico</p>
                  <div className="flex flex-wrap gap-1.5">
                    {v.animo_tags.map((t: string) => <span key={t} className="text-xs bg-[#a78bfa]/10 border border-[#a78bfa]/20 text-[#a78bfa] px-2 py-0.5 rounded-full">{t}</span>)}
                  </div>
                </div>
              )}
              {Array.isArray(v.digestion_tags) && v.digestion_tags.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-mono text-[#3d5870] mb-1.5 uppercase">Síntomas digestivos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {v.digestion_tags.map((t: string) => <span key={t} className="text-xs bg-[#f97316]/10 border border-[#f97316]/20 text-[#f97316] px-2 py-0.5 rounded-full">{t}</span>)}
                  </div>
                </div>
              )}
              {/* Color orina */}
              {(v.orina_color_manana || v.orina_color_tarde) && (
                <div className="mt-3">
                  <p className="text-xs font-mono text-[#3d5870] mb-1.5 uppercase">Color de orina</p>
                  <div className="flex gap-4">
                    {v.orina_color_manana && (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full border border-[#1e2d3d]" style={{ background: v.orina_color_manana }} />
                        <span className="text-xs text-[#7a95aa]">Mañana: {ORINA_LABELS_LOCAL[v.orina_color_manana] || v.orina_color_manana}</span>
                      </div>
                    )}
                    {v.orina_color_tarde && (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full border border-[#1e2d3d]" style={{ background: v.orina_color_tarde }} />
                        <span className="text-xs text-[#7a95aa]">Tarde: {ORINA_LABELS_LOCAL[v.orina_color_tarde] || v.orina_color_tarde}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {v.metas && (
                <div className="mt-3">
                  <p className="text-xs font-mono text-[#3d5870] mb-1 uppercase">Metas del paciente</p>
                  <p className="text-sm text-[#dde6ef]">{v.metas}</p>
                </div>
              )}
            </VisitSection>
          )}

          {/* Exploración física */}
          {(v.exploracion_general || v.exploracion_piel || v.exploracion_abdomen) && (
            <VisitSection title="Exploración física" icon="">
              <Grid>
                <Info label="Aspecto general"       value={v.exploracion_general} />
                <Info label="Piel / Faneras"         value={v.exploracion_piel} />
                <Info label="Ojos / Conjuntivas"     value={v.exploracion_ojos} />
                <Info label="Boca / Mucosas"         value={v.exploracion_boca} />
                <Info label="Cuello / Tiroides"      value={v.exploracion_tiroides} />
                <Info label="Abdomen"                value={v.exploracion_abdomen} />
                <Info label="Extremidades"           value={v.exploracion_extremidades} />
              </Grid>
              {v.exploracion_notas && (
                <div className="mt-3">
                  <Info label="Notas adicionales" value={v.exploracion_notas} />
                </div>
              )}
            </VisitSection>
          )}

          {/* Diagnóstico y protocolo autorizados por el doctor */}
          {analysisLoading && (
            <VisitSection title="Diagnóstico y protocolo" icon="">
              <p className="text-sm text-[#3d5870]">Cargando…</p>
            </VisitSection>
          )}
          {!analysisLoading && analysis?.status === 'closed' && (
            <VisitSection title="Diagnóstico y protocolo (autorizado por el doctor)" icon="">
              <div className="space-y-4">
                {[
                  { label: 'Diagnóstico convencional', dx: analysis.doctor_traditional, proto: analysis.protocol_traditional, color: 'var(--c-blue)' },
                  { label: 'Diagnóstico funcional',     dx: analysis.doctor_functional,  proto: analysis.protocol_functional,  color: 'var(--c-green)' },
                  { label: 'Diagnóstico de longevidad',  dx: analysis.doctor_longevity,   proto: analysis.protocol_longevity,   color: 'var(--c-violet)' },
                ].filter(s => (s.dx && s.dx.trim()) || (s.proto && s.proto.trim())).map(s => (
                  <div key={s.label} className="bg-[#111820] border border-[#1e2d3d] rounded-xl p-4">
                    <p className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: s.color }}>{s.label}</p>
                    {s.dx && s.dx.trim() && (
                      <p className="text-sm text-[#dde6ef] whitespace-pre-wrap mb-3">{s.dx}</p>
                    )}
                    {s.proto && s.proto.trim() && (
                      <ProtocolMiniList rawText={s.proto} />
                    )}
                  </div>
                ))}
              </div>
            </VisitSection>
          )}

          {/* Laboratorios */}
          {(v.labs_notas || v.dx_presuntivo || (Array.isArray(v.labs_files) && v.labs_files.length > 0)) && (
            <VisitSection title="Laboratorios y diagnóstico" icon="">
              {v.labs_notas && <Info label="Notas de laboratorio" value={v.labs_notas} />}
              {v.dx_presuntivo && (
                <div className="mt-3 p-3 bg-[#a78bfa]/10 border border-[#a78bfa]/20 rounded-xl">
                  <p className="text-xs font-mono text-[#a78bfa] mb-1 uppercase">Diagnóstico presuntivo</p>
                  <p className="text-sm text-[#dde6ef]">{v.dx_presuntivo}</p>
                </div>
              )}
              {Array.isArray(v.labs_files) && v.labs_files.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-mono text-[#3d5870] mb-2 uppercase">Archivos adjuntos ({v.labs_files.length})</p>
                  <div className="space-y-1.5">
                    {v.labs_files.map((f: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 bg-[#111820] border border-[#1e2d3d] rounded-lg px-3 py-2">
                        <span>{f.type?.includes('pdf') ? '' : f.type?.startsWith('image') ? '' : ''}</span>
                        <span className="text-xs text-[#dde6ef] flex-1 truncate">{f.name}</span>
                        <span className="text-xs text-[#3d5870]">{f.size ? `${(f.size/1024).toFixed(0)} KB` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </VisitSection>
          )}

          {/* Consulta Lite: cierre, receta manual y seguimiento */}
          {v.dynamic_answers?.lite && (() => {
            const L = v.dynamic_answers.lite;
            const c = L.cierre || {};
            const sg = L.seguimiento || {};
            const hf = L.heredofamiliar || {};
            const rec = Array.isArray(L.receta) ? L.receta.filter((m: any) => m?.nombre_generico || m?.nombre) : [];
            if (!(c.plan || c.evolucion || c.estudios_solicitados || c.proxima_cita || sg.efectos_adversos || sg.pa_domicilio || sg.hospitalizado_desde || hf.cardiopatia_precoz || rec.length > 0)) return null;
            return (
              <VisitSection title={L.kind === 'follow_up' ? 'Seguimiento y Receta' : 'Plan y Receta'} icon="">
                {hf.cardiopatia_precoz && <Info label="Heredofamiliar" value="Familiar con cardiopatía precoz" />}
                {sg.hospitalizado_desde && <Info label="Hospitalización o urgencias" value={sg.hospitalizado_desde} />}
                {sg.efectos_adversos && <Info label="Efectos adversos" value={sg.efectos_adversos} />}
                {sg.pa_domicilio && <Info label="Presión en casa" value={sg.pa_domicilio} />}
                {c.evolucion && <Info label="Evolución" value={c.evolucion} />}
                {c.plan && <Info label="Plan e indicaciones" value={c.plan} />}
                {c.estudios_solicitados && <Info label="Estudios solicitados" value={c.estudios_solicitados} />}
                {c.proxima_cita && <Info label="Próxima cita" value={new Date(c.proxima_cita + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} />}
                {rec.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-mono text-[#00e5a0] uppercase">Receta prescrita ({rec.length})</p>
                    {rec.map((m: any, idx: number) => (
                      <div key={idx} className="bg-[#111820] border border-[#1e2d3d] rounded-lg px-3 py-2 text-xs text-[#dde6ef]">
                        <span className="font-semibold">{m.nombre_generico || m.nombre}</span>
                        {m.presentacion ? ` · ${m.presentacion}` : ''}
                        <span className="text-[#7a95aa]"> — {[m.dosis, m.via, m.frecuencia, m.duracion].filter(Boolean).join(' · ')}</span>
                        {m.indicacion && <p className="text-[11px] text-[#7a95aa] mt-0.5">{m.indicacion}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </VisitSection>
            );
          })()}

        </div>
      )}
    </div>
  );
}

function parseProtocolItemsSafe(text: string): any[] {
  if (!text) return [];
  let raw = text.trim();
  const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  if (start === -1) return [];
  raw = raw.slice(start);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

const ProtocolMiniList = ({ rawText }: { rawText: string }) => {
  const items = parseProtocolItemsSafe(rawText);
  if (items.length === 0) {
    return <p className="text-sm text-[#dde6ef] whitespace-pre-wrap">{rawText}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((it: any, i: number) => (
        <div key={i} className="flex items-start gap-2 bg-[#0d1520] border border-[#1e2d3d] rounded-lg px-3 py-2">
          <span className="text-xs font-mono text-[#3d5870] mt-0.5">{it.tipo || 'Item'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[#dde6ef] font-medium">{it.nombre_generico}{it.nombre_comercial ? ` (${it.nombre_comercial})` : ''}</p>
            {(it.dosis || it.frecuencia || it.via) && (
              <p className="text-xs text-[#7a95aa] mt-0.5">{[it.dosis, it.via, it.frecuencia].filter(Boolean).join(' · ')}</p>
            )}
            {it.indicacion && <p className="text-xs text-[#3d5870] mt-0.5">{it.indicacion}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};

const VisitSection = ({ title, children }: { title: string; icon?: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[13px] font-semibold text-[#7a95aa] mb-3">{title}</p>
    {children}
  </div>
);

const MiniChip = ({ label, value }: { label: string; value: string }) => (
  <span className="text-xs bg-[#111820] border border-[#1e2d3d] rounded-lg px-2.5 py-1 text-[#7a95aa]">
    <span className="text-[#3d5870]">{label}:</span> {value}
  </span>
);
