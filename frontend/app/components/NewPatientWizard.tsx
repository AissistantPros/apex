'use client';

/**
 * WIZARD DE NUEVO PACIENTE (APEX ADAPTIVE BENTO SLIDES)
 * Formulario modular por slides con auto-guardado en tiempo real:
 * - Slide 1: Identificación y Canales de Contacto (con cálculo reactivo de edad).
 * - Slide 2: Contacto de Emergencia y Origen / Referencia.
 * - Slide 3: Facturación Fiscal (CFDI) y Pase Inmediato a Sala de Espera.
 * - Cero "aire muerto": distribución Bento Grid en pantalla completa auto-ajustable.
 * - Auto-guardado continuo en localStorage para evitar pérdida de datos.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import Icon from '@/app/components/Icon';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const STORAGE_KEY = 'apex_draft_new_patient';

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession().catch(() => null);
  return { 'Content-Type': 'application/json', ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}) };
}

async function api(path: string, opts: RequestInit = {}) {
  let r: Response;
  try {
    r = await fetch(`${B()}${path}`, { ...opts, headers: { ...(await authHeaders()), ...(opts.headers || {}) } });
  } catch {
    throw new Error('Error de conexión con el servidor.');
  }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.detail || `Error ${r.status}`);
  }
  return r.json();
}

// Chips de opciones comunes
const PARENTESCOS = ['Cónyuge', 'Madre', 'Padre', 'Hijo/a', 'Hermano/a', 'Amigo/a', 'Otro'];
const ORIGENES = [
  'Recomendación de paciente',
  'Recomendación médica',
  'Redes sociales',
  'Google Maps',
  'Doctoralia',
  'Página web',
  'Otro',
];
const MOTIVOS_PRIMERA_VEZ = [
  'Primera consulta general',
  'Chequeo preventivo / Check-up',
  'Dolencia aguda / Síntomas',
  'Revisión de estudios / Labs',
  'Segunda opinión médica',
  'Seguimiento de padecimiento',
];
const REGIMENES_SAT = [
  { code: '605', label: '605 - Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { code: '612', label: '612 - Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '626', label: '626 - Régimen Simplificado de Confianza (RESICO)' },
  { code: '601', label: '601 - General de Ley Personas Morales' },
  { code: '606', label: '606 - Arrendamiento' },
  { code: '616', label: '616 - Sin obligaciones fiscales' },
];
const USOS_CFDI = [
  { code: 'D01', label: 'D01 - Honorarios médicos, dentales y gastos hospitalarios' },
  { code: 'G03', label: 'G03 - Gastos en general' },
  { code: 'S01', label: 'S01 - Sin efectos fiscales' },
  { code: 'CP01', label: 'CP01 - Pagos' },
];

export interface NewPatientFormData {
  // Slide 1: Identidad y Contacto
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  occupation: string;
  city: string;
  phone: string;
  phone_landline: string;
  email: string;
  reception_notes: string;

  // Slide 2: Emergencia y Origen
  emergency_name: string;
  emergency_relationship: string;
  emergency_phone: string;
  emergency_email: string;
  referred_type: string;
  referred_by: string;

  // Slide 3: Facturación Fiscal y Pase a Sala
  factura_requiere: boolean;
  factura_rfc: string;
  factura_razon_social: string;
  factura_regimen: string;
  factura_uso_cfdi: string;
  factura_cp: string;
  factura_email: string;

  // Pase a sala
  enviar_a_sala: boolean;
  doctor_id: string;
  location_id: string;
  motivo_visita: string;
}

const INITIAL_FORM: NewPatientFormData = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  gender: 'Femenino',
  occupation: '',
  city: '',
  phone: '',
  phone_landline: '',
  email: '',
  reception_notes: '',

  emergency_name: '',
  emergency_relationship: 'Cónyuge',
  emergency_phone: '',
  emergency_email: '',
  referred_type: 'Recomendación de paciente',
  referred_by: '',

  factura_requiere: false,
  factura_rfc: '',
  factura_razon_social: '',
  factura_regimen: '612',
  factura_uso_cfdi: 'D01',
  factura_cp: '',
  factura_email: '',

  enviar_a_sala: true,
  doctor_id: '',
  location_id: '',
  motivo_visita: 'Primera consulta general',
};

// Estilos de inputs compartidos
const inpClass =
  'w-full px-3.5 py-2.5 bg-[#070a0e] border border-[#1e2d3d] rounded-xl text-[#dde6ef] text-xs sm:text-sm outline-none placeholder-[#3d5870] focus:border-[#00e5a0] transition shadow-inner';
const labelClass = 'text-[11px] font-mono uppercase tracking-wider text-[#7a95aa] font-semibold block mb-1';

interface NewPatientWizardProps {
  initialPrefillName?: string;
  onCancel?: () => void;
  onSuccess?: (patientId: string, fullName: string) => void;
}

export default function NewPatientWizard({
  initialPrefillName,
  onCancel,
  onSuccess,
}: NewPatientWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Paso actual (1, 2 o 3)
  const [currentStep, setCurrentStep] = useState(1);

  // Formulario reactivo
  const [formData, setFormData] = useState<NewPatientFormData>(INITIAL_FORM);

  // Contexto clínico
  const [doctors, setDoctors] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // Estado de auto-guardado en borrador
  const [draftRestored, setDraftRestored] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 1. Inicialización y restauración de borrador
  useEffect(() => {
    // Si viene nombre pre-llenado desde query string o prop
    const queryName = searchParams?.get('name') || initialPrefillName || '';

    // Cargar doctores y sedes de la clínica
    api('/appointments/context')
      .then(ctx => {
        setDoctors(ctx.doctors || []);
        setLocations(ctx.locations || []);
        setFormData(prev => ({
          ...prev,
          doctor_id: prev.doctor_id || ctx.doctors?.[0]?.id || '',
          location_id: prev.location_id || ctx.locations?.[0]?.id || '',
        }));
      })
      .catch(() => {});

    // Intentar restaurar borrador guardado en localStorage
    try {
      const savedDraft = localStorage.getItem(STORAGE_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        setFormData(prev => ({ ...prev, ...parsed }));
        setDraftRestored(true);
        setLastSavedTime('Recuperado de sesión anterior');
        return;
      }
    } catch {
      // Ignorar errores de parseo
    }

    // Si no había borrador pero sí un queryName, separar en first_name y last_name
    if (queryName.trim()) {
      const parts = queryName.trim().split(' ');
      if (parts.length === 1) {
        setFormData(prev => ({ ...prev, first_name: parts[0] }));
      } else {
        const first = parts.slice(0, Math.ceil(parts.length / 2)).join(' ');
        const last = parts.slice(Math.ceil(parts.length / 2)).join(' ');
        setFormData(prev => ({ ...prev, first_name: first, last_name: last }));
      }
    }
  }, []); // eslint-disable-line

  // 2. Auto-guardado en tiempo real en localStorage al cambiar cualquier campo
  const saveTimeoutRef = useRef<any>(null);
  const updateField = (field: keyof NewPatientFormData, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setLastSavedTime(`Guardado a las ${time}`);
        } catch {
          /* noop */
        }
      }, 350);
      return updated;
    });
    setErrorMessage('');
  };

  // Descartar borrador y empezar de cero
  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* */
    }
    setFormData(INITIAL_FORM);
    setDraftRestored(false);
    setLastSavedTime('');
  };

  // 3. Cálculo dinámico de edad según fecha de nacimiento
  const edadCalculada = useMemo(() => {
    if (!formData.date_of_birth) return null;
    const dob = new Date(formData.date_of_birth);
    if (isNaN(dob.getTime())) return null;
    const diffMs = Date.now() - dob.getTime();
    const ageDate = new Date(diffMs);
    const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    return age;
  }, [formData.date_of_birth]);

  // Link de WhatsApp para el celular
  const whatsappUrl = useMemo(() => {
    if (!formData.phone) return null;
    const clean = formData.phone.replace(/\D/g, '');
    if (clean.length < 10) return null;
    return `https://wa.me/${clean}`;
  }, [formData.phone]);

  // Validaciones antes de avanzar de slide
  const validateStep1 = () => {
    if (!formData.first_name.trim()) {
      setErrorMessage('Por favor escribe el nombre de pila del paciente.');
      return false;
    }
    if (!formData.last_name.trim()) {
      setErrorMessage('Por favor escribe los apellidos del paciente.');
      return false;
    }
    if (!formData.date_of_birth) {
      setErrorMessage('Por favor selecciona la fecha de nacimiento.');
      return false;
    }
    if (!formData.phone.trim()) {
      setErrorMessage('Por favor ingresa un teléfono celular de contacto (WhatsApp).');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!validateStep1()) return;
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (currentStep === 2) {
      setCurrentStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      onCancel?.();
    }
  };

  // Guardado final en Backend
  const handleFinalSubmit = async () => {
    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      // 1. Preparar payload de creación de paciente
      const patientPayload: Record<string, any> = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        date_of_birth: formData.date_of_birth,
        gender: formData.gender,
        occupation: formData.occupation.trim(),
        city: formData.city.trim(),
        phone: formData.phone.trim(),
        phone_landline: formData.phone_landline.trim(),
        email: formData.email.trim(),
        reception_notes: formData.reception_notes.trim(),

        emergency_contact_name: formData.emergency_name.trim(),
        emergency_contact_relationship: formData.emergency_relationship,
        emergency_contact_phone: formData.emergency_phone.trim(),
        emergency_contact_email: formData.emergency_email.trim(),

        referred_type: formData.referred_type,
        referred_by: formData.referred_by.trim(),

        factura_requiere: Boolean(formData.factura_requiere),
        factura_rfc: formData.factura_rfc.trim().toUpperCase(),
        factura_razon_social: formData.factura_razon_social.trim(),
        factura_regimen: formData.factura_regimen,
        factura_uso_cfdi: formData.factura_uso_cfdi,
        factura_cp: formData.factura_cp.trim(),
        factura_email: formData.factura_email.trim(),

        // Estado inicial de recepción
        registration_phase: 'reception',
      };

      const resPatient = await api('/patients', {
        method: 'POST',
        body: JSON.stringify(patientPayload),
      });

      const newPatientId = resPatient.id;
      const newFullName = resPatient.full_name || `${formData.first_name} ${formData.last_name}`;

      // 2. Si se activó "Enviar a sala de espera inmediatamente", crear la visita
      if (formData.enviar_a_sala && newPatientId) {
        const nowIso = new Date().toISOString();
        await api('/visits', {
          method: 'POST',
          body: JSON.stringify({
            patient_id: newPatientId,
            doctor_id: formData.doctor_id || null,
            location_id: formData.location_id || null,
            motivo_visita: formData.motivo_visita || 'Primera consulta general',
            created_at: nowIso,
          }),
        });

        // Asegurar ancla en recepción
        await api(`/patients/${newPatientId}`, {
          method: 'PUT',
          body: JSON.stringify({
            registration_phase: 'reception',
            updated_at: nowIso,
          }),
        });
      }

      // 3. Limpiar borrador guardado en localStorage
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* */
      }

      if (onSuccess) {
        onSuccess(newPatientId, newFullName);
      } else {
        router.push(formData.enviar_a_sala ? '/dashboard/sala' : `/dashboard/patient/${newPatientId}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo guardar el paciente. Revisa los datos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#070a0e] text-[#dde6ef] select-none">
      {/* ── 1. CABECERA Y STEPPER SUPERIOR (PROGRESO CLARO) ── */}
      <header className="sticky top-0 z-30 bg-[#0d1520]/95 backdrop-blur-md border-b border-[#1e2d3d] px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Título y subtítulo */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel || (() => router.back())}
              className="p-2 rounded-xl text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer"
              title="Volver atrás"
            >
              <Icon name="back" size={18} />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-[#dde6ef] flex items-center gap-2">
                <span>Alta de Nuevo Paciente</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#00e5a0]/15 text-[#00e5a0]">
                  Paso {currentStep} de 3
                </span>
              </h1>
              <p className="text-[11px] text-[#7a95aa]">
                {currentStep === 1 && 'Identificación básica y canales de comunicación'}
                {currentStep === 2 && 'Contacto de emergencia y fuente de recomendación'}
                {currentStep === 3 && 'Datos fiscales para factura y pase a sala de espera'}
              </p>
            </div>
          </div>

          {/* Stepper interactivo de 3 pasos (clicable) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {[
              { step: 1, label: 'Identidad', icon: '👤' },
              { step: 2, label: 'Emergencia', icon: '🚨' },
              { step: 3, label: 'Facturación & Pase', icon: '🧾' },
            ].map(s => {
              const isActive = currentStep === s.step;
              const isPast = currentStep > s.step;

              return (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => {
                    if (s.step === 1 || (s.step === 2 && validateStep1()) || (s.step === 3 && validateStep1())) {
                      setCurrentStep(s.step);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                    isActive
                      ? 'bg-[#00e5a0]/15 border-[#00e5a0] text-[#00e5a0] shadow-sm ring-1 ring-[#00e5a0]'
                      : isPast
                      ? 'bg-[#111820] border-[#1e2d3d] text-[#dde6ef] hover:border-[#4b6377]'
                      : 'bg-[#070a0e] border-transparent text-[#4b6377] hover:text-[#7a95aa]'
                  }`}
                >
                  <span>{isPast ? '✓' : s.icon}</span>
                  <span className="hidden md:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Barra de progreso porcentual visual */}
        <div className="max-w-6xl mx-auto mt-2 h-1 bg-[#162231] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00e5a0] to-[#38bdf8] transition-all duration-300"
            style={{ width: `${(currentStep / 3) * 100}%` }}
          />
        </div>
      </header>

      {/* ── AVISO DE BORRADOR RECUPERADO (SI APLICA) ── */}
      {draftRestored && (
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 pt-3">
          <div className="p-2.5 rounded-xl bg-[#38bdf8]/10 border border-[#38bdf8]/30 flex items-center justify-between text-xs text-[#38bdf8]">
            <span className="flex items-center gap-1.5">
              <span>💾</span> Se restauró un borrador previo no guardado.
            </span>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-xs text-[#38bdf8] underline hover:text-[#fff] transition cursor-pointer"
            >
              Descartar borrador y empezar en blanco
            </button>
          </div>
        </div>
      )}

      {/* ── 2. CONTENIDO PRINCIPAL: BENTO GRID FULL SCREEN POR SLIDE ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-8 space-y-6 pb-28">
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-[#f43f5e]/15 border border-[#f43f5e]/40 text-xs text-[#f43f5e] font-semibold animate-in fade-in">
            {errorMessage}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            SLIDE 1: IDENTIDAD BÁSICA Y CANALES DE CONTACTO
           ════════════════════════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 animate-in fade-in">
            {/* MÓDULO 1: IDENTIFICACIÓN DEL PACIENTE */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#0d1520] border border-[#1e2d3d] space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-[#1e2d3d]/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[#00e5a0]/15 text-[#00e5a0] flex items-center justify-center font-bold text-sm">
                    👤
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[#dde6ef]">
                      Identificación Personal
                    </h2>
                    <p className="text-[11px] text-[#7a95aa]">Datos demográficos principales</p>
                  </div>
                </div>
                {edadCalculada !== null && (
                  <span className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-[#00e5a0]/15 text-[#00e5a0] border border-[#00e5a0]/30">
                    🎂 {edadCalculada} años
                  </span>
                )}
              </div>

              {/* Nombre y Apellidos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>
                    Nombre(s) <span className="text-[#f43f5e]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={e => updateField('first_name', e.target.value)}
                    placeholder="Ej. Juan Carlos"
                    className={inpClass}
                    autoFocus
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Apellidos <span className="text-[#f43f5e]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={e => updateField('last_name', e.target.value)}
                    placeholder="Ej. Pérez Gómez"
                    className={inpClass}
                  />
                </div>
              </div>

              {/* Fecha de Nacimiento y Sexo Biológico */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>
                    Fecha de nacimiento <span className="text-[#f43f5e]">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={e => updateField('date_of_birth', e.target.value)}
                    className={inpClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Sexo biológico</label>
                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                    {['Femenino', 'Masculino', 'Otro'].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => updateField('gender', g)}
                        className={`py-2 px-1 rounded-xl text-xs font-semibold border transition cursor-pointer text-center ${
                          formData.gender === g
                            ? 'bg-[#00e5a0]/20 border-[#00e5a0] text-[#00e5a0] font-bold'
                            : 'bg-[#070a0e] border-[#1e2d3d] text-[#7a95aa] hover:text-[#dde6ef]'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ocupación y Ciudad */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Ocupación / Profesión</label>
                  <input
                    type="text"
                    value={formData.occupation}
                    onChange={e => updateField('occupation', e.target.value)}
                    placeholder="Ej. Ingeniero de software, Docente"
                    className={inpClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Ciudad / Municipio</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={e => updateField('city', e.target.value)}
                    placeholder="Ej. Cancún, Quintana Roo"
                    className={inpClass}
                  />
                </div>
              </div>
            </div>

            {/* MÓDULO 2: CANALES DE CONTACTO DIRECTO */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#0d1520] border border-[#1e2d3d] space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#1e2d3d]/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-[#38bdf8]/15 text-[#38bdf8] flex items-center justify-center font-bold text-sm">
                      📞
                    </span>
                    <div>
                      <h2 className="text-sm sm:text-base font-bold text-[#dde6ef]">
                        Canales de Contacto
                      </h2>
                      <p className="text-[11px] text-[#7a95aa]">Comunicación y recordatorios de citas</p>
                    </div>
                  </div>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#25D366] font-semibold hover:underline flex items-center gap-1"
                    >
                      <span>💬 Probar WhatsApp</span>
                    </a>
                  )}
                </div>

                {/* Teléfono Celular (WhatsApp) */}
                <div>
                  <label className={labelClass}>
                    Celular principal (WhatsApp) <span className="text-[#f43f5e]">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    placeholder="Ej. 998 123 4567"
                    className={inpClass}
                  />
                  <p className="text-[10px] text-[#7a95aa] mt-1">
                    Se usará para enviar confirmaciones automáticas e interactuar con el Agente IA.
                  </p>
                </div>

                {/* Teléfono Fijo y Correo Electrónico */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Teléfono fijo / Alternativo</label>
                    <input
                      type="tel"
                      value={formData.phone_landline}
                      onChange={e => updateField('phone_landline', e.target.value)}
                      placeholder="Ej. 998 884 0000"
                      className={inpClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Correo electrónico</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => updateField('email', e.target.value)}
                      placeholder="paciente@correo.com"
                      className={inpClass}
                    />
                  </div>
                </div>

                {/* Notas internas de recepción */}
                <div>
                  <label className={labelClass}>Notas internas de recepción (opcional)</label>
                  <textarea
                    rows={3}
                    value={formData.reception_notes}
                    onChange={e => updateField('reception_notes', e.target.value)}
                    placeholder="Ej. Prefiere citas por la tarde; paciente con dificultad motriz para silla de ruedas…"
                    className={`${inpClass} resize-none`}
                  />
                </div>
              </div>

              <div className="pt-2 text-[11px] text-[#7a95aa] flex items-center gap-1.5">
                <span>💡</span>
                <span>Los campos con (*) son requeridos para la ficha básica de admisión.</span>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            SLIDE 2: CONTACTO DE EMERGENCIA Y ORIGEN / REFERENCIA
           ════════════════════════════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 animate-in fade-in">
            {/* MÓDULO 3: CONTACTO DE EMERGENCIA */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#0d1520] border border-[#1e2d3d] space-y-4 shadow-xl">
              <div className="flex items-center gap-2.5 border-b border-[#1e2d3d]/80 pb-3">
                <span className="w-8 h-8 rounded-xl bg-[#f43f5e]/15 text-[#f43f5e] flex items-center justify-center font-bold text-sm">
                  🚨
                </span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-[#dde6ef]">
                    Contacto de Emergencia
                  </h2>
                  <p className="text-[11px] text-[#7a95aa]">Familiar o persona responsable</p>
                </div>
              </div>

              {/* Nombre de Contacto */}
              <div>
                <label className={labelClass}>Nombre completo del familiar / contacto</label>
                <input
                  type="text"
                  value={formData.emergency_name}
                  onChange={e => updateField('emergency_name', e.target.value)}
                  placeholder="Ej. María Elena Torres"
                  className={inpClass}
                  autoFocus
                />
              </div>

              {/* Parentesco (Chips táctiles) */}
              <div>
                <label className={labelClass}>Parentesco con el paciente</label>
                <div className="flex flex-wrap gap-1.5">
                  {PARENTESCOS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => updateField('emergency_relationship', p)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        formData.emergency_relationship === p
                          ? 'bg-[#f43f5e]/20 border-[#f43f5e] text-[#f43f5e]'
                          : 'bg-[#070a0e] border-[#1e2d3d] text-[#7a95aa] hover:text-[#dde6ef]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Teléfono y Correo de Emergencia */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Teléfono de emergencia</label>
                  <input
                    type="tel"
                    value={formData.emergency_phone}
                    onChange={e => updateField('emergency_phone', e.target.value)}
                    placeholder="Ej. 998 555 1234"
                    className={inpClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Correo (opcional)</label>
                  <input
                    type="email"
                    value={formData.emergency_email}
                    onChange={e => updateField('emergency_email', e.target.value)}
                    placeholder="familiar@correo.com"
                    className={inpClass}
                  />
                </div>
              </div>
            </div>

            {/* MÓDULO 4: ¿CÓMO CONOCIÓ LA CLÍNICA? (REFERENCIA) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#0d1520] border border-[#1e2d3d] space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 border-b border-[#1e2d3d]/80 pb-3">
                  <span className="w-8 h-8 rounded-xl bg-[#a78bfa]/15 text-[#a78bfa] flex items-center justify-center font-bold text-sm">
                    🌐
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[#dde6ef]">
                      Fuente de Llegada / Referencia
                    </h2>
                    <p className="text-[11px] text-[#7a95aa]">¿Cómo conoció el consultorio o clínica?</p>
                  </div>
                </div>

                {/* Chips de origen */}
                <div>
                  <label className={labelClass}>Canal de procedencia</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ORIGENES.map(orig => {
                      const selected = formData.referred_type === orig;
                      return (
                        <button
                          key={orig}
                          type="button"
                          onClick={() => updateField('referred_type', orig)}
                          className={`p-2.5 rounded-xl text-left border text-xs font-semibold transition cursor-pointer flex items-center justify-between ${
                            selected
                              ? 'bg-[#a78bfa]/20 border-[#a78bfa] text-[#a78bfa] shadow-sm'
                              : 'bg-[#070a0e] border-[#1e2d3d] text-[#7a95aa] hover:text-[#dde6ef]'
                          }`}
                        >
                          <span className="truncate">{orig}</span>
                          {selected && <span className="text-xs">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Persona que recomendó */}
                <div>
                  <label className={labelClass}>
                    Nombre de quien recomendó o detalle (opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.referred_by}
                    onChange={e => updateField('referred_by', e.target.value)}
                    placeholder="Ej. Dr. Mario Soto, Familia Gutiérrez, Instagram…"
                    className={inpClass}
                  />
                  <p className="text-[10px] text-[#7a95aa] mt-1">
                    Permite atribuir métricas de recomendación y agradecer al colega o paciente que refirió.
                  </p>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-[#7a95aa] flex items-center gap-1.5">
                <span>📊</span>
                <span>Estos datos alimentan los indicadores de retorno de inversión de la clínica.</span>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            SLIDE 3: FACTURACIÓN FISCAL (CFDI) Y ASIGNACIÓN INMEDIATA A SALA
           ════════════════════════════════════════════════════════════════════════ */}
        {currentStep === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 animate-in fade-in">
            {/* MÓDULO 5: FACTURACIÓN FISCAL (CFDI) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#0d1520] border border-[#1e2d3d] space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-[#1e2d3d]/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[#f59e0b]/15 text-[#f59e0b] flex items-center justify-center font-bold text-sm">
                    🧾
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[#dde6ef]">
                      Facturación Fiscal (CFDI)
                    </h2>
                    <p className="text-[11px] text-[#7a95aa]">Emisión de comprobante fiscal digital</p>
                  </div>
                </div>

                {/* Toggle Requiere Factura */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs font-semibold text-[#dde6ef]">¿Requiere factura?</span>
                  <input
                    type="checkbox"
                    checked={formData.factura_requiere}
                    onChange={e => updateField('factura_requiere', e.target.checked)}
                    className="w-4 h-4 accent-[#f59e0b] cursor-pointer"
                  />
                </label>
              </div>

              {formData.factura_requiere ? (
                <div className="space-y-3 animate-in fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>RFC del Paciente / Empresa</label>
                      <input
                        type="text"
                        value={formData.factura_rfc}
                        onChange={e => updateField('factura_rfc', e.target.value.toUpperCase())}
                        placeholder="XAXX010101000"
                        className={inpClass}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Código Postal Fiscal</label>
                      <input
                        type="text"
                        maxLength={5}
                        value={formData.factura_cp}
                        onChange={e => updateField('factura_cp', e.target.value)}
                        placeholder="77500"
                        className={inpClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Razón Social o Nombre Fiscal</label>
                    <input
                      type="text"
                      value={formData.factura_razon_social}
                      onChange={e => updateField('factura_razon_social', e.target.value)}
                      placeholder="Nombre exacto como aparece en la constancia de situación fiscal"
                      className={inpClass}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Régimen Fiscal</label>
                      <select
                        value={formData.factura_regimen}
                        onChange={e => updateField('factura_regimen', e.target.value)}
                        className={inpClass}
                      >
                        {REGIMENES_SAT.map(r => (
                          <option key={r.code} value={r.code}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Uso de CFDI</label>
                      <select
                        value={formData.factura_uso_cfdi}
                        onChange={e => updateField('factura_uso_cfdi', e.target.value)}
                        className={inpClass}
                      >
                        {USOS_CFDI.map(u => (
                          <option key={u.code} value={u.code}>{u.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Correo para envío de factura</label>
                    <input
                      type="email"
                      value={formData.factura_email}
                      onChange={e => updateField('factura_email', e.target.value)}
                      placeholder="facturacion@correo.com"
                      className={inpClass}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-[#111820]/60 border border-dashed border-[#1e2d3d] text-center space-y-2">
                  <p className="text-xs text-[#7a95aa]">
                    El paciente no requiere factura en este momento.
                  </p>
                  <p className="text-[11px] text-[#4b6377]">
                    Se registrarán las notas de cobro al público en general. Podrá agregarse un RFC en cualquier momento posterior.
                  </p>
                </div>
              )}
            </div>

            {/* MÓDULO 6: PASE DIRECTO A SALA DE ESPERA */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[#0d1520] border border-[#1e2d3d] space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#1e2d3d]/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-[#00e5a0]/15 text-[#00e5a0] flex items-center justify-center font-bold text-sm">
                      🩺
                    </span>
                    <div>
                      <h2 className="text-sm sm:text-base font-bold text-[#dde6ef]">
                        Pase a Sala de Espera
                      </h2>
                      <p className="text-[11px] text-[#7a95aa]">Apertura de turno de atención inmediata</p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs font-semibold text-[#00e5a0]">¿Pasa a sala ahora?</span>
                    <input
                      type="checkbox"
                      checked={formData.enviar_a_sala}
                      onChange={e => updateField('enviar_a_sala', e.target.checked)}
                      className="w-4 h-4 accent-[#00e5a0] cursor-pointer"
                    />
                  </label>
                </div>

                {formData.enviar_a_sala ? (
                  <div className="space-y-3 animate-in fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Médico que atenderá</label>
                        <select
                          value={formData.doctor_id}
                          onChange={e => updateField('doctor_id', e.target.value)}
                          className={inpClass}
                        >
                          {doctors.map(d => (
                            <option key={d.id} value={d.id}>{d.display_name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Sede / Consultorio</label>
                        <select
                          value={formData.location_id}
                          onChange={e => updateField('location_id', e.target.value)}
                          className={inpClass}
                        >
                          {locations.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>Motivo de la primera consulta</label>
                      <input
                        type="text"
                        value={formData.motivo_visita}
                        onChange={e => updateField('motivo_visita', e.target.value)}
                        placeholder="Ej. Chequeo preventivo general..."
                        className={`${inpClass} mb-2`}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {MOTIVOS_PRIMERA_VEZ.map(mot => (
                          <button
                            key={mot}
                            type="button"
                            onClick={() => updateField('motivo_visita', mot)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                              formData.motivo_visita === mot
                                ? 'bg-[#00e5a0]/15 border-[#00e5a0] text-[#00e5a0]'
                                : 'bg-[#070a0e] border-[#1e2d3d] text-[#7a95aa] hover:text-[#dde6ef]'
                            }`}
                          >
                            {mot}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-[#00e5a0]/10 border border-[#00e5a0]/30 text-xs text-[#00e5a0] flex items-center gap-2">
                      <span>✓</span>
                      <span>El paciente aparecerá inmediatamente en la cola activa de la Sala de Espera.</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-[#111820]/60 border border-dashed border-[#1e2d3d] text-center space-y-2">
                    <p className="text-xs text-[#7a95aa]">
                      Solo se creará el expediente del paciente sin abrir turno de atención hoy.
                    </p>
                    <p className="text-[11px] text-[#4b6377]">
                      Podrás agendarle una cita posterior en el calendario o registrar su visita cuando llegue.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2 text-[11px] text-[#7a95aa] flex items-center gap-1.5">
                <span>🔒</span>
                <span>Todos los datos clínicos y personales se almacenan con encriptación y aislamiento de clínica.</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── 3. BARRA INFERIOR FIJA (STICKY ACTION BAR) ── */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-[#0d1520]/95 backdrop-blur-md border-t border-[#1e2d3d] px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Botón Anterior / Cancelar */}
          <button
            type="button"
            onClick={handleBack}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#7a95aa] hover:text-[#dde6ef] hover:bg-[#162231] transition cursor-pointer flex items-center gap-1.5"
          >
            <Icon name="back" size={16} />
            <span>{currentStep === 1 ? 'Cancelar' : 'Anterior'}</span>
          </button>

          {/* Indicador de estado de auto-guardado en tiempo real */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#00e5a0] font-mono">
            <span className="w-2 h-2 rounded-full bg-[#00e5a0] animate-pulse" />
            <span>{lastSavedTime || 'Borrador guardado automáticamente'}</span>
          </div>

          {/* Botón Siguiente / Registrar */}
          {currentStep < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c] transition cursor-pointer shadow-md flex items-center gap-2"
            >
              <span>Siguiente Paso</span>
              <span className="rotate-180 inline-block"><Icon name="back" size={16} /></span>
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={handleFinalSubmit}
              className="px-7 py-2.5 rounded-xl text-xs font-bold bg-[#00e5a0] text-[#051b14] hover:bg-[#00c98c] transition cursor-pointer shadow-lg flex items-center gap-2"
            >
              {saving ? (
                <span>Guardando paciente...</span>
              ) : (
                <>
                  <span>✓</span>
                  <span>{formData.enviar_a_sala ? 'Registrar Paciente y Pasar a Sala' : 'Registrar Paciente'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
