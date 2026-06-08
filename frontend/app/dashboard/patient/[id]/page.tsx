'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUser } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function PatientPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params?.id as string;

  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ficha' | 'visitas'>('ficha');
  const [showDanger, setShowDanger] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notes, setNotes] = useState({ reception: '', nurse: '', doctor: '' });
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  useEffect(() => {
    getUser().then(u => {
      if (!u) router.push('/auth/login');
      else { setUser(u); loadData(); }
    });
  }, [patientId]);

  const loadData = async () => {
    try {
      const [pRes, vRes] = await Promise.all([
        fetch(`${BACKEND()}/patients/${patientId}`),
        fetch(`${BACKEND()}/visits/${patientId}`),
      ]);
      const pData = await pRes.json();
      const vData = await vRes.json();
      setPatient(pData);
      setVisits(vData.visits || []);
      setNotes({
        reception: pData.notes_reception || '',
        nurse: pData.notes_nurse || '',
        doctor: pData.notes_doctor || '',
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await fetch(`${BACKEND()}/patients/${patientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes_reception: notes.reception,
          notes_nurse: notes.nurse,
          notes_doctor: notes.doctor,
        }),
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 3000);
    } catch (e) {
      alert('Error al guardar notas');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`${BACKEND()}/patients/${patientId}`, { method: 'DELETE' });
      router.push('/dashboard/patients');
    } catch (e) {
      alert('Error al eliminar paciente');
      setDeleting(false);
    }
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Doctor';

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">
      Cargando ficha...
    </div>
  );

  if (!patient) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">
      Paciente no encontrado.
    </div>
  );

  const dob = patient.date_of_birth || patient.birth_date;
  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
  const initials = `${patient.first_name?.[0] || ''}${patient.last_name?.[0] || ''}`.toUpperCase();

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav userName={userName} />

      <main className="pt-16 max-w-4xl mx-auto px-6 py-8">

        {/* Header del paciente */}
        <div className="flex items-start gap-5 mb-8 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-2xl font-black text-white flex-shrink-0">
            {initials || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-serif font-bold text-[#dde6ef] mb-1">{patient.full_name}</h1>
            <p className="font-mono text-sm text-[#3d5870] mb-3">{patient.id}</p>
            <div className="flex flex-wrap gap-3">
              {age !== null && <Chip icon="🎂" text={`${age} años`} />}
              {patient.sexo_biologico && <Chip icon="🧬" text={patient.sexo_biologico} />}
              {patient.occupation && <Chip icon="💼" text={patient.occupation} />}
              {patient.city && <Chip icon="📍" text={patient.city} />}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/dashboard/patient/${patientId}/visit`)}
              className="px-4 py-2.5 bg-[#00e5a0] text-black text-sm font-bold rounded-xl hover:opacity-90 transition"
            >
              + Nueva Visita
            </button>
            <button
              onClick={() => router.push(`/dashboard/patient/${patientId}/edit`)}
              className="px-4 py-2.5 bg-[#1e2d3d] text-[#dde6ef] text-sm font-semibold rounded-xl hover:bg-[#2a3a4d] transition"
            >
              ✏️ Editar
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { key: 'ficha',   label: '📋 Ficha del paciente' },
            { key: 'visitas', label: `🗓 Visitas (${visits.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition"
              style={{
                background: tab === t.key ? '#0ea5e9' : '#0d1520',
                color:      tab === t.key ? '#000' : '#7a95aa',
                border:     `1px solid ${tab === t.key ? '#0ea5e9' : '#1e2d3d'}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: FICHA ── */}
        {tab === 'ficha' && (
          <div className="space-y-5">

            {/* Datos generales y contacto */}
            <Section title="Datos de contacto" icon="📱">
              <Grid>
                <Info label="Correo electrónico" value={patient.email} />
                <Info label="Celular" value={patient.phone} />
                <Info label="Teléfono fijo" value={patient.phone_landline} />
                <Info label="Ciudad" value={patient.city} />
              </Grid>
              {patient.emergency_contact_name && (
                <div className="mt-4 p-4 bg-[#111820] rounded-xl border border-[#1e2d3d]">
                  <p className="text-xs font-mono text-[#f97316] mb-2 uppercase tracking-wider">🆘 Contacto de emergencia</p>
                  <Grid>
                    <Info label="Nombre" value={patient.emergency_contact_name} />
                    <Info label="Relación" value={patient.emergency_contact_relationship} />
                    <Info label="Teléfono" value={patient.emergency_contact_phone} />
                    <Info label="Correo" value={patient.emergency_contact_email} />
                  </Grid>
                </div>
              )}
            </Section>

            {/* Antecedentes */}
            <Section title="Antecedentes médicos" icon="🏥">
              <Grid>
                <Info label="Enfermedades crónicas" value={patient.chronic_diseases} />
                <Info label="Cirugías" value={patient.surgeries} />
                <Info label="Hospitalizaciones" value={patient.hospitalizations} />
                <Info label="Alergias a medicamentos" value={patient.allergies_medications} />
                <Info label="Alergias alimentarias" value={patient.allergies_foods} />
                <Info label="Alergias ambientales" value={patient.allergies_environmental} />
              </Grid>
            </Section>

            {/* Hábitos */}
            <Section title="Hábitos" icon="🌿">
              <Grid>
                <Info label="Tabaquismo" value={patient.smoking_status} />
                <Info label="Alcohol" value={patient.alcohol_status} />
                <Info label="Sustancias recreativas" value={patient.sust_recreativas} />
              </Grid>
            </Section>

            {/* Historia clínica privada */}
            <Section title="Historia clínica privada" icon="🔒">
              <Grid>
                <Info label="Sexo biológico" value={patient.sexo_biologico} />
                <Info label="Libido basal" value={patient.libido_basal ? `${patient.libido_basal}/10` : undefined} />
                <Info label="Dx psiquiátrico" value={patient.dx_psiquiatrico} />
                <Info label="Med. psiquiátrica" value={patient.med_psiquiatrica} />
              </Grid>
            </Section>

            {/* Notas del equipo — editables */}
            <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[#dde6ef] flex items-center gap-2">
                  📝 Notas del equipo
                </h3>
                <button onClick={saveNotes} disabled={savingNotes}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg transition"
                  style={{ background: notesSaved ? '#00e5a0' : '#0ea5e9', color: '#000' }}>
                  {savingNotes ? 'Guardando...' : notesSaved ? '✓ Guardado' : 'Guardar notas'}
                </button>
              </div>
              <div className="space-y-4">
                <NoteInput role="Recepción" icon="🟦" color="#0ea5e9"
                  value={notes.reception} onChange={v => setNotes(n => ({ ...n, reception: v }))} />
                <NoteInput role="Enfermería" icon="🟧" color="#f97316"
                  value={notes.nurse} onChange={v => setNotes(n => ({ ...n, nurse: v }))} />
                <NoteInput role="Médico" icon="🟣" color="#a78bfa"
                  value={notes.doctor} onChange={v => setNotes(n => ({ ...n, doctor: v }))} />
              </div>
            </div>

            {/* Zona de peligro */}
            <div className="mt-8 border border-[#f43f5e]/30 rounded-2xl p-5 bg-[#f43f5e]/5">
              <button
                onClick={() => setShowDanger(!showDanger)}
                className="flex items-center gap-2 text-[#f43f5e] font-semibold text-sm hover:opacity-80 transition"
              >
                ⚠️ Zona de peligro {showDanger ? '▲' : '▼'}
              </button>
              {showDanger && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-[#7a95aa]">
                    Estas acciones son permanentes y no se pueden deshacer.
                  </p>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-5 py-2.5 bg-[#f43f5e] text-white text-sm font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
                  >
                    {deleting ? 'Eliminando...' : '🗑 Eliminar paciente permanentemente'}
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── TAB: VISITAS ── */}
        {tab === 'visitas' && (
          <div className="space-y-4">
            {visits.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🗓</p>
                <p className="text-[#7a95aa] text-lg font-medium">No hay visitas registradas</p>
                <button
                  onClick={() => router.push(`/dashboard/patient/${patientId}/visit`)}
                  className="mt-4 px-6 py-3 bg-[#00e5a0] text-black font-bold rounded-xl hover:opacity-90 transition"
                >
                  Registrar primera visita
                </button>
              </div>
            ) : (
              visits.map((v, i) => (
                <VisitCard key={v.id} visit={v} index={visits.length - i} onClick={() => router.push(`/dashboard/patient/${patientId}/visit/${v.id}/analysis`)} />
              ))
            )}
          </div>
        )}

      </main>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────

const Chip = ({ icon, text }: { icon: string; text: string }) => (
  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#111820] border border-[#1e2d3d] rounded-full text-xs text-[#7a95aa]">
    {icon} {text}
  </span>
);

const Section = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5">
    <h3 className="text-sm font-semibold text-[#dde6ef] mb-4 flex items-center gap-2">
      {icon} {title}
    </h3>
    {children}
  </div>
);

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
);

const Info = ({ label, value }: { label: string; value?: string | null }) => (
  value ? (
    <div>
      <p className="text-xs font-mono text-[#3d5870] mb-0.5 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-[#dde6ef]">{value}</p>
    </div>
  ) : null
);

const NoteInput = ({ role, icon, color, value, onChange }: {
  role: string; icon: string; color: string; value: string; onChange: (v: string) => void;
}) => (
  <div className="rounded-xl border p-4" style={{ borderColor: color + '33', background: color + '08' }}>
    <p className="text-xs font-mono mb-2 uppercase tracking-wider" style={{ color }}>
      {icon} Notas de {role}
    </p>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={3}
      placeholder={`Escribir notas de ${role.toLowerCase()}...`}
      className="w-full bg-transparent text-sm text-[#dde6ef] placeholder-[#3d5870] outline-none resize-none"
    />
  </div>
);

const VisitCard = ({ visit, index, onClick }: { visit: any; index: number; onClick: () => void }) => {
  const date = new Date(visit.created_at).toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  return (
    <div
      onClick={onClick}
      className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-5 hover:border-[#0ea5e9]/40 hover:bg-[#0d1520] cursor-pointer transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/20 px-2 py-0.5 rounded-full">
              Visita #{index}
            </span>
            <span className="text-xs text-[#3d5870]">{date}</span>
          </div>
          <p className="text-[#dde6ef] font-medium">
            {visit.visit_reason || 'Sin motivo registrado'}
          </p>
          {visit.discomfort_intensity && (
            <p className="text-xs text-[#7a95aa] mt-1">
              Intensidad del malestar: {visit.discomfort_intensity}/10
            </p>
          )}
        </div>
        <span className="text-[#3d5870] text-xl ml-4">›</span>
      </div>
      {/* Datos clave de la visita */}
      <div className="flex flex-wrap gap-3 mt-3">
        {visit.weight && <MiniChip label="Peso" value={`${visit.weight} kg`} />}
        {visit.heart_rate && <MiniChip label="FC" value={`${visit.heart_rate} lpm`} />}
        {visit.pa_der_sistolica && <MiniChip label="PA" value={`${visit.pa_der_sistolica}/${visit.pa_der_diastolica}`} />}
        {visit.glucose && <MiniChip label="Glucosa" value={`${visit.glucose} mg/dL`} />}
      </div>
    </div>
  );
};

const MiniChip = ({ label, value }: { label: string; value: string }) => (
  <span className="text-xs bg-[#111820] border border-[#1e2d3d] rounded-lg px-2.5 py-1 text-[#7a95aa]">
    <span className="text-[#3d5870]">{label}:</span> {value}
  </span>
);
