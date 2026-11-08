'use client';

/**
 * WIZARD DE NUEVO PACIENTE (APEX MEDICAL REGISTRATION)
 * Formulario modular por slides con auto-guardado en tiempo real:
 * - Slide 1: Identificación Personal y Canales de Contacto Directo.
 * - Slide 2: Seguro de Gastos Médicos Mayores (SGMM en México) y Contacto de Emergencia.
 * - Slide 3: Origen y Marketing Digital (Multiselección en cuadrículas estrictas, no mosaico).
 * - Slide 4: Facturación Fiscal (CFDI) y Pase Inmediato a Sala de Espera.
 * - Layout ergonómico: botones centrados que nunca son tapados por el chat flotante.
 * - Cero "aire muerto" y cero textos recortados.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import Icon from '@/app/components/Icon';

const B = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const STORAGE_KEY = 'apex_draft_new_patient_v2';

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
    let msg = 'Error en la solicitud';
    if (typeof d.detail === 'string') {
      msg = d.detail;
    } else if (d.detail && typeof d.detail === 'object') {
      msg = d.detail.message || JSON.stringify(d.detail);
    } else if (d.message) {
      msg = typeof d.message === 'string' ? d.message : JSON.stringify(d.message);
    } else {
      msg = `Error ${r.status}`;
    }
    throw new Error(msg);
  }
  return r.json();
}

// ── CATÁLOGOS Y OPCIONES RIGUROSAS ──
const ASEGURADORAS_MEXICO = [
  'GNP Seguros',
  'AXA Seguros',
  'MetLife México',
  'Seguros Monterrey New York Life',
  'Mapfre México',
  'Bupa México',
  'Allianz México',
  'Seguros Banorte',
  'Seguros Inbursa',
  'Zurich México',
  'Plan Seguro',
  'Seguros Atlas',
  'Chubb Seguros',
  'AIG Seguros',
  'Otra aseguradora',
];

const PARENTESCOS = [
  'Cónyuge / Pareja',
  'Madre',
  'Padre',
  'Hijo / Hija',
  'Hermano / Hermana',
  'Familiar directo',
  'Amigo / Conocido',
  'Tutor legal',
];

const FUENTES_MARKETING = [
  { id: 'rec_paciente', label: 'Recomendación de paciente' },
  { id: 'rec_medico', label: 'Recomendación de otro médico' },
  { id: 'google_search', label: 'Búsqueda en Google / Web' },
  { id: 'google_maps', label: 'Google Maps / Mi Negocio (GMN)' },
  { id: 'redes_sociales', label: 'Redes Sociales (Insta, FB, TikTok)' },
  { id: 'ubicacion_fisica', label: 'Ubicación física / Pasó por la clínica' },
  { id: 'convenio_empresa', label: 'Convenio de empresa / Aseguradora' },
  { id: 'doctoralia', label: 'Doctoralia / Directorio médico' },
];

const CANALES_DIGITALES = [
  { id: 'web', label: 'Página Web Oficial', icon: '🌐' },
  { id: 'gmn', label: 'Google Maps / GMN', icon: '📍' },
  { id: 'instagram', label: 'Instagram', icon: '📸' },
  { id: 'facebook', label: 'Facebook', icon: '📘' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'youtube', label: 'YouTube', icon: '▶️' },
  { id: 'doctoralia', label: 'Doctoralia', icon: '⭐' },
  { id: 'whatsapp', label: 'WhatsApp del Consultorio', icon: '💬' },
];

const MOTIVOS_PRIMERA_VEZ = [
  'Primera consulta general',
  'Chequeo preventivo / Check-up',
  'Dolencia aguda / Síntomas',
  'Revisión de estudios / Labs',
  'Segunda opinión médica',
  'Procedimiento o curación',
];

const REGIMENES_SAT = [
  { code: '605', label: '605 - Sueldos y Salarios e Ingresos Asimilados' },
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

  // Slide 2: Seguro Médico y Contacto de Emergencia
  seguro_tiene: boolean;
  seguro_aseguradora: string;
  seguro_otra: string;
  seguro_poliza: string;
  seguro_usara_hoy: 'pago_directo' | 'reembolso' | 'particular';

  emergency_name: string;
  emergency_relationship: string;
  emergency_phone: string;
  emergency_email: string;

  // Slide 3: Marketing y Canales Digitales (Multiselección)
  marketing_fuentes: string[];
  marketing_canales: string[];
  referred_by: string;

  // Slide 4: Facturación Fiscal y Pase a Sala
  factura_requiere: boolean;
  factura_rfc: string;
  factura_razon_social: string;
  factura_regimen: string;
  factura_uso_cfdi: string;
  factura_cp: string;
  factura_email: string;

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

  seguro_tiene: false,
  seguro_aseguradora: 'GNP Seguros',
  seguro_otra: '',
  seguro_poliza: '',
  seguro_usara_hoy: 'pago_directo',

  emergency_name: '',
  emergency_relationship: 'Cónyuge / Pareja',
  emergency_phone: '',
  emergency_email: '',

  marketing_fuentes: ['Recomendación de paciente'],
  marketing_canales: ['Página Web Oficial'],
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

const inpClass =
  'w-full px-3.5 py-2.5 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-xl text-[var(--c-text)] text-sm outline-none placeholder-[var(--c-text-3)] focus:border-[var(--c-primary)] transition shadow-sm';
const labelClass = 'text-[11px] font-mono uppercase tracking-wider text-[var(--c-text-2)] font-semibold block mb-1.5';

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

  // Paso actual (1, 2, 3 o 4)
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

    // Restaurar borrador de localStorage
    try {
      const savedDraft = localStorage.getItem(STORAGE_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        setFormData(prev => ({ ...prev, ...parsed }));
        setDraftRestored(true);
        setLastSavedTime('Recuperado');
        return;
      }
    } catch {
      // Ignorar errores
    }

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

  // 2. Auto-guardado continuo en tiempo real
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
      }, 300);
      return updated;
    });
    setErrorMessage('');
  };

  // Toggle para selecciones múltiples de marketing
  const toggleArrayItem = (field: 'marketing_fuentes' | 'marketing_canales', item: string) => {
    setFormData(prev => {
      const list = prev[field] || [];
      const updatedList = list.includes(item)
        ? list.filter(i => i !== item)
        : [...list, item];
      return { ...prev, [field]: updatedList };
    });
    setErrorMessage('');
  };

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

  // 3. Cálculo de edad automático
  const edadCalculada = useMemo(() => {
    if (!formData.date_of_birth) return null;
    const dob = new Date(formData.date_of_birth);
    if (isNaN(dob.getTime())) return null;
    const diffMs = Date.now() - dob.getTime();
    const ageDate = new Date(diffMs);
    const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    return age;
  }, [formData.date_of_birth]);

  // Enlace WhatsApp para el celular
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
    } else if (currentStep === 3) {
      setCurrentStep(4);
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
      // 1. Aseguradora formateada
      const aseguradoraTexto = formData.seguro_tiene
        ? (formData.seguro_aseguradora === 'Otra aseguradora' ? formData.seguro_otra : formData.seguro_aseguradora)
        : '';

      const seguroNota = formData.seguro_tiene
        ? `[SEGURO MÉDICO]: ${aseguradoraTexto || 'SGMM'} | Póliza: ${formData.seguro_poliza || 'S/N'} | Uso en visita: ${formData.seguro_usara_hoy}`
        : '[SEGURO MÉDICO]: Atención particular (Sin SGMM)';

      const notasCombinadas = [formData.reception_notes.trim(), seguroNota].filter(Boolean).join('\n\n');

      // 2. Preparar payload de creación de paciente (esquema estricto compatible con Supabase)
      const patientPayload: Record<string, any> = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        date_of_birth: formData.date_of_birth,
        sexo_biologico: formData.gender,
        occupation: formData.occupation.trim(),
        city: formData.city.trim(),
        phone: formData.phone.trim(),
        phone_landline: formData.phone_landline.trim(),
        email: formData.email.trim(),
        notes_reception: notasCombinadas,

        emergency_contact_name: formData.emergency_name.trim(),
        emergency_contact_relationship: formData.emergency_relationship,
        emergency_contact_phone: formData.emergency_phone.trim(),
        emergency_contact_email: formData.emergency_email.trim(),

        // Marketing estructurado compatible con los dashboards de clínica
        sources_of_contact: formData.marketing_fuentes,
        referred_type: formData.marketing_fuentes.join(', '),
        referred_by: formData.referred_by.trim(),
        prev_web: formData.marketing_canales.includes('Página Web Oficial'),
        prev_gmaps: formData.marketing_canales.includes('Google Maps / GMN') || formData.marketing_fuentes.includes('Google Maps / Google Mi Negocio (GMN)'),
        prev_redes: formData.marketing_canales.some(c => ['Instagram', 'Facebook', 'TikTok', 'YouTube'].includes(c)),
        social_network: formData.marketing_canales.filter(c => ['Instagram', 'Facebook', 'TikTok', 'YouTube'].includes(c)).join(', '),

        // Facturación en JSONB nativo `billing` de Supabase
        billing: {
          requiere: Boolean(formData.factura_requiere),
          rfc: formData.factura_rfc.trim().toUpperCase(),
          razon_social: formData.factura_razon_social.trim(),
          regimen: formData.factura_regimen,
          uso_cfdi: formData.factura_uso_cfdi,
          cp: formData.factura_cp.trim(),
          email: formData.factura_email.trim(),
          direccion: '',
        },

        registration_phase: 'reception',
      };

      const resPatient = await api('/patients', {
        method: 'POST',
        body: JSON.stringify(patientPayload),
      });

      const newPatientId = resPatient.id;
      const newFullName = resPatient.full_name || `${formData.first_name} ${formData.last_name}`;

      // 3. Si se marcó pase a sala, registrar la visita inicial
      if (formData.enviar_a_sala && newPatientId) {
        const nowIso = new Date().toISOString();
        const motivoFinal = `${formData.motivo_visita || 'Primera consulta'}${formData.seguro_tiene && aseguradoraTexto ? ` (Seguro: ${aseguradoraTexto})` : ''}`;

        await api('/visits', {
          method: 'POST',
          body: JSON.stringify({
            patient_id: newPatientId,
            doctor_id: formData.doctor_id || null,
            location_id: formData.location_id || null,
            motivo_visita: motivoFinal,
            created_at: nowIso,
          }),
        });

        await api(`/patients/${newPatientId}`, {
          method: 'PUT',
          body: JSON.stringify({
            registration_phase: 'reception',
            updated_at: nowIso,
          }),
        });
      }

      // Limpiar borrador
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
    <div className="flex flex-col min-h-screen bg-[var(--c-bg)] text-[var(--c-text)] select-none">
      {/* ── 1. CABECERA Y STEPPER SUPERIOR (RESPONSIVE Y FLUIDO) ── */}
      <header className="sticky top-0 z-30 bg-[var(--c-card)]/95 backdrop-blur-md border-b border-[var(--c-border)] px-4 sm:px-8 py-3.5 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Título y estado */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onCancel || (() => router.back())}
              className="p-2 rounded-xl text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-subtle)] transition cursor-pointer shrink-0"
              title="Volver atrás"
            >
              <Icon name="back" size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-[var(--c-text)] flex items-center gap-2 truncate">
                <span>Alta de Nuevo Paciente</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-[var(--c-primary)] border border-[color-mix(in_srgb,var(--c-primary)_30%,transparent)] shrink-0">
                  {currentStep} / 4 · {currentStep * 25}%
                </span>
              </h1>
              <p className="text-[11px] text-[var(--c-text-2)] truncate">
                {currentStep === 1 && '1. Identificación Personal y Canales de Contacto'}
                {currentStep === 2 && '2. Seguro Médico (SGMM) y Contacto de Emergencia'}
                {currentStep === 3 && '3. Origen, Recomendación y Canales Digitales'}
                {currentStep === 4 && '4. Facturación CFDI y Pase a Sala de Espera'}
              </p>
            </div>
          </div>

          {/* Stepper interactivo de 4 pasos (Píldoras adaptables) */}
          <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 shrink-0">
            {[
              { step: 1, label: 'Identidad', icon: '👤' },
              { step: 2, label: 'Seguro', icon: '🛡️' },
              { step: 3, label: 'Marketing', icon: '🌐' },
              { step: 4, label: 'Sala', icon: '🩺' },
            ].map(s => {
              const isActive = currentStep === s.step;
              const isPast = currentStep > s.step;

              return (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => {
                    if (s.step === 1 || validateStep1()) {
                      setCurrentStep(s.step);
                    }
                  }}
                  className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                    isActive
                      ? 'bg-[color-mix(in_srgb,var(--c-primary)_15%,var(--c-card))] border-[var(--c-primary)] text-[var(--c-primary)] shadow-sm font-bold ring-1 ring-[var(--c-primary)]'
                      : isPast
                      ? 'bg-[var(--c-subtle)] border-[var(--c-border)] text-[var(--c-text)] hover:border-[var(--c-text-2)]'
                      : 'bg-[var(--c-card)] border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'
                  }`}
                >
                  <span className="text-xs">{isPast ? '✓' : s.icon}</span>
                  <span className="hidden md:inline">{s.label}</span>
                  <span className="md:hidden font-mono text-[11px] font-bold">{s.step}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Barra de progreso visual suave */}
        <div className="max-w-5xl mx-auto mt-2 h-1 bg-[var(--c-subtle-2)] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--c-primary)] to-[var(--c-accent)] transition-all duration-300"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          />
        </div>
      </header>

      {/* ── AVISO DE BORRADOR RECUPERADO (SI APLICA) ── */}
      {draftRestored && (
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-8 pt-3">
          <div className="p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--c-primary)_10%,transparent)] border border-[color-mix(in_srgb,var(--c-primary)_30%,transparent)] flex items-center justify-between text-xs text-[var(--c-primary)]">
            <span className="flex items-center gap-1.5 font-medium">
              <span>💾</span> Se restauró un borrador previo no guardado.
            </span>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-xs text-[var(--c-primary)] underline hover:opacity-80 transition cursor-pointer font-semibold"
            >
              Descartar borrador y empezar en blanco
            </button>
          </div>
        </div>
      )}

      {/* ── 2. CONTENIDO PRINCIPAL (CUADRÍCULA ESTRICTA, SIN AIRE MUERTO NI RECORTES) ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-8 space-y-6 pb-32">
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--c-danger)_12%,transparent)] border border-[color-mix(in_srgb,var(--c-danger)_35%,transparent)] text-xs text-[var(--c-danger)] font-semibold flex items-center justify-between gap-3 animate-in fade-in">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage('')}
              className="px-2 py-0.5 rounded-lg text-xs hover:bg-[color-mix(in_srgb,var(--c-danger)_20%,transparent)] transition cursor-pointer shrink-0 font-bold"
              title="Cerrar aviso"
            >
              ✕
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            SLIDE 1: IDENTIDAD Y CANALES DE CONTACTO
           ════════════════════════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in">
            {/* MÓDULO 1: IDENTIFICACIÓN PERSONAL */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--c-card)] border border-[var(--c-border)] space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-[var(--c-primary)] flex items-center justify-center font-bold text-sm">
                    👤
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[var(--c-text)]">
                      Identificación Personal
                    </h2>
                    <p className="text-[11px] text-[var(--c-text-2)]">Datos demográficos principales</p>
                  </div>
                </div>
                {edadCalculada !== null && (
                  <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-[var(--c-primary)] border border-[color-mix(in_srgb,var(--c-primary)_30%,transparent)]">
                    🎂 {edadCalculada} años
                  </span>
                )}
              </div>

              {/* Nombre y Apellidos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className={labelClass}>
                    Nombre(s) <span className="text-[var(--c-danger)]">*</span>
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
                    Apellidos <span className="text-[var(--c-danger)]">*</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className={labelClass}>
                    Fecha de nacimiento <span className="text-[var(--c-danger)]">*</span>
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
                  <div className="flex rounded-xl bg-[var(--c-bg)] border border-[var(--c-border)] p-1 gap-1">
                    {['Femenino', 'Masculino', 'Otro'].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => updateField('gender', g)}
                        className={`flex-1 py-2 px-1 text-xs font-semibold rounded-lg transition cursor-pointer text-center whitespace-nowrap ${
                          formData.gender === g
                            ? 'bg-[color-mix(in_srgb,var(--c-primary)_18%,var(--c-card))] text-[var(--c-primary)] font-bold border border-[var(--c-primary)] shadow-sm'
                            : 'text-[var(--c-text-2)] hover:text-[var(--c-text)]'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ocupación y Ciudad (Ancho completo para evitar recortes) */}
              <div>
                <label className={labelClass}>Ocupación / Profesión</label>
                <input
                  type="text"
                  value={formData.occupation}
                  onChange={e => updateField('occupation', e.target.value)}
                  placeholder="Ej. Ingeniero de software, Docente, Contador"
                  className={inpClass}
                />
              </div>

              <div>
                <label className={labelClass}>Ciudad / Municipio de residencia</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={e => updateField('city', e.target.value)}
                  placeholder="Ej. Cancún, Quintana Roo"
                  className={inpClass}
                />
              </div>
            </div>

            {/* MÓDULO 2: CANALES DE CONTACTO DIRECTO */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--c-card)] border border-[var(--c-border)] space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--c-accent)_15%,transparent)] text-[var(--c-accent)] flex items-center justify-center font-bold text-sm">
                      📞
                    </span>
                    <div>
                      <h2 className="text-sm sm:text-base font-bold text-[var(--c-text)]">
                        Canales de Contacto
                      </h2>
                      <p className="text-[11px] text-[var(--c-text-2)]">Comunicación y recordatorios de citas</p>
                    </div>
                  </div>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#16a34a] dark:text-[#25D366] font-semibold hover:underline flex items-center gap-1"
                    >
                      <span>💬 Probar WhatsApp</span>
                    </a>
                  )}
                </div>

                {/* Teléfono Celular (WhatsApp) */}
                <div>
                  <label className={labelClass}>
                    Celular principal (WhatsApp) <span className="text-[var(--c-danger)]">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    placeholder="Ej. 998 123 4567"
                    className={inpClass}
                  />
                  <p className="text-[10px] text-[var(--c-text-3)] mt-1">
                    Se usará para enviar confirmaciones automáticas e interactuar con el Agente IA.
                  </p>
                </div>

                {/* Teléfono Fijo y Correo Electrónico */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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

              <div className="pt-2 text-[11px] text-[var(--c-text-3)] flex items-center gap-1.5 border-t border-[var(--c-border)]">
                <span>💡</span>
                <span>Los campos con (*) son indispensables para aperturar el expediente clínico.</span>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            SLIDE 2: SEGURO MÉDICO (SGMM) Y CONTACTO DE EMERGENCIA
           ════════════════════════════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in">
            {/* MÓDULO 3: SEGURO DE GASTOS MÉDICOS MAYORES (MÉXICO) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--c-card)] border border-[var(--c-border)] space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-[var(--c-primary)] flex items-center justify-center font-bold text-sm">
                    🛡️
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[var(--c-text)]">
                      Seguro de Gastos Médicos (SGMM)
                    </h2>
                    <p className="text-[11px] text-[var(--c-text-2)]">Aseguradora y cobertura de la consulta</p>
                  </div>
                </div>
              </div>

              {/* Pregunta: ¿Cuenta con seguro médico? */}
              <div>
                <label className={labelClass}>¿El paciente cuenta con Seguro Médico (SGMM)?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => updateField('seguro_tiene', true)}
                    className={`p-3 rounded-2xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
                      formData.seguro_tiene
                        ? 'bg-[color-mix(in_srgb,var(--c-primary)_18%,var(--c-card))] border-[var(--c-primary)] text-[var(--c-primary)] shadow-sm ring-1 ring-[var(--c-primary)]'
                        : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-subtle)]'
                    }`}
                  >
                    <span>✓ Sí, cuenta con seguro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField('seguro_tiene', false)}
                    className={`p-3 rounded-2xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
                      !formData.seguro_tiene
                        ? 'bg-[color-mix(in_srgb,var(--c-accent)_18%,var(--c-card))] border-[var(--c-accent)] text-[var(--c-accent)] shadow-sm ring-1 ring-[var(--c-accent)]'
                        : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-subtle)]'
                    }`}
                  >
                    <span>Particular (Sin seguro)</span>
                  </button>
                </div>
              </div>

              {formData.seguro_tiene ? (
                <div className="space-y-3.5 pt-2 border-t border-[var(--c-border)] animate-in fade-in">
                  {/* Nombre de la Aseguradora */}
                  <div>
                    <label className={labelClass}>Aseguradora en México</label>
                    <select
                      value={formData.seguro_aseguradora}
                      onChange={e => updateField('seguro_aseguradora', e.target.value)}
                      className={`${inpClass} cursor-pointer`}
                    >
                      {ASEGURADORAS_MEXICO.map(aseg => (
                        <option key={aseg} value={aseg} className="bg-[var(--c-card)] text-[var(--c-text)]">
                          {aseg}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.seguro_aseguradora === 'Otra aseguradora' && (
                    <div>
                      <label className={labelClass}>Especifica el nombre de la aseguradora / fondo</label>
                      <input
                        type="text"
                        value={formData.seguro_otra}
                        onChange={e => updateField('seguro_otra', e.target.value)}
                        placeholder="Ej. Pemex, Seguro Extranjero (BlueCross), etc."
                        className={inpClass}
                        autoFocus
                      />
                    </div>
                  )}

                  {/* Número de Póliza */}
                  <div>
                    <label className={labelClass}>Número de Póliza / Certificado (opcional)</label>
                    <input
                      type="text"
                      value={formData.seguro_poliza}
                      onChange={e => updateField('seguro_poliza', e.target.value)}
                      placeholder="Ej. POL-987654321"
                      className={inpClass}
                    />
                  </div>

                  {/* ¿Usará su seguro en esta visita? Cuadrícula estricta */}
                  <div>
                    <label className={labelClass}>¿Usará su seguro para esta visita / consulta?</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'pago_directo', label: 'Pago Directo / Convenio' },
                        { id: 'reembolso', label: 'Formato de Reembolso' },
                        { id: 'particular', label: 'No, pago particular' },
                      ].map(opt => {
                        const active = formData.seguro_usara_hoy === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => updateField('seguro_usara_hoy', opt.id)}
                            className={`p-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer text-center ${
                              active
                                ? 'bg-[color-mix(in_srgb,var(--c-primary)_15%,var(--c-card))] border-[var(--c-primary)] text-[var(--c-primary)] font-bold shadow-sm'
                                : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-subtle)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[var(--c-subtle)] border border-dashed border-[var(--c-border)] text-center space-y-1">
                  <p className="text-xs font-medium text-[var(--c-text-2)]">
                    Atención médica privada por cuenta propia.
                  </p>
                  <p className="text-[11px] text-[var(--c-text-3)]">
                    Se cobrará directamente al paciente. Puede registrar su aseguradora en cualquier visita futura.
                  </p>
                </div>
              )}
            </div>

            {/* MÓDULO 4: CONTACTO DE EMERGENCIA */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--c-card)] border border-[var(--c-border)] space-y-4 shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-[var(--c-border)] pb-3">
                <span className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--c-danger)_15%,transparent)] text-[var(--c-danger)] flex items-center justify-center font-bold text-sm">
                  🚨
                </span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-[var(--c-text)]">
                    Contacto de Emergencia
                  </h2>
                  <p className="text-[11px] text-[var(--c-text-2)]">Familiar o persona responsable</p>
                </div>
              </div>

              <div>
                <label className={labelClass}>Nombre completo del familiar / contacto</label>
                <input
                  type="text"
                  value={formData.emergency_name}
                  onChange={e => updateField('emergency_name', e.target.value)}
                  placeholder="Ej. María Elena Torres"
                  className={inpClass}
                />
              </div>

              {/* Parentesco en cuadrícula estricta y ordenada (CERO MOSAICO) */}
              <div>
                <label className={labelClass}>Parentesco con el paciente</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {PARENTESCOS.map(p => {
                    const active = formData.emergency_relationship === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateField('emergency_relationship', p)}
                        className={`py-2.5 px-2 rounded-xl text-xs font-semibold border transition cursor-pointer text-center leading-tight min-h-[42px] flex items-center justify-center ${
                          active
                            ? 'bg-[color-mix(in_srgb,var(--c-danger)_15%,var(--c-card))] border-[var(--c-danger)] text-[var(--c-danger)] font-bold shadow-sm'
                            : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-subtle)]'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Teléfono y Correo de Emergencia */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            SLIDE 3: MARKETING, ORIGEN Y CANALES DIGITALES (CUADRÍCULAS ESTRICTAS)
           ════════════════════════════════════════════════════════════════════════ */}
        {currentStep === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in">
            {/* MÓDULO 5: ¿CÓMO SE ENTERÓ DEL DOCTOR? (MULTISELECCIÓN) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--c-card)] border border-[var(--c-border)] space-y-4 shadow-sm">
              <div className="border-b border-[var(--c-border)] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-[var(--c-primary)] flex items-center justify-center font-bold text-sm">
                    1️⃣
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[var(--c-text)]">
                      ¿Cómo se enteró del Doctor / Consultorio?
                    </h2>
                    <p className="text-[11px] text-[var(--c-text-2)]">Selecciona todas las opciones que apliquen</p>
                  </div>
                </div>
              </div>

              {/* Cuadrícula estricta de 2 columnas (CERO MOSAICO) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {FUENTES_MARKETING.map(item => {
                  const checked = formData.marketing_fuentes.includes(item.label);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleArrayItem('marketing_fuentes', item.label)}
                      className={`p-3 rounded-2xl text-left border text-xs font-semibold transition cursor-pointer flex items-center justify-between min-h-[46px] ${
                        checked
                          ? 'bg-[color-mix(in_srgb,var(--c-primary)_12%,var(--c-card))] border-[var(--c-primary)] text-[var(--c-text)] shadow-sm'
                          : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:border-[var(--c-border-2)]'
                      }`}
                    >
                      <span className="leading-snug pr-2">{item.label}</span>
                      <span
                        style={checked ? { background: 'var(--c-primary)', color: 'var(--c-primary-fg)' } : {}}
                        className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] shrink-0 ${
                          checked ? 'border-[var(--c-primary)] font-bold' : 'border-[var(--c-border-2)]'
                        }`}
                      >
                        {checked ? '✓' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Nombre de la persona o médico que recomendó */}
              <div className="pt-2 border-t border-[var(--c-border)]">
                <label className={labelClass}>
                  Nombre de la persona, médico o recomendación (si aplica)
                </label>
                <input
                  type="text"
                  value={formData.referred_by}
                  onChange={e => updateField('referred_by', e.target.value)}
                  placeholder="Ej. Dr. Mario Soto, Familia Gutiérrez, Amigo del trabajo…"
                  className={inpClass}
                />
              </div>
            </div>

            {/* MÓDULO 6: CANALES DIGITALES VISITADOS (MULTISELECCIÓN) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--c-card)] border border-[var(--c-border)] space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b border-[var(--c-border)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--c-accent)_15%,transparent)] text-[var(--c-accent)] flex items-center justify-center font-bold text-sm">
                      2️⃣
                    </span>
                    <div>
                      <h2 className="text-sm sm:text-base font-bold text-[var(--c-text)]">
                        Canales Digitales Consultados
                      </h2>
                      <p className="text-[11px] text-[var(--c-text-2)]">
                        ¿Qué perfiles o canales ha visitado para llegar con el Doctor?
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cuadrícula estricta y simétrica (2x4 o 4x2) */}
                <div className="grid grid-cols-2 gap-2.5">
                  {CANALES_DIGITALES.map(item => {
                    const checked = formData.marketing_canales.includes(item.label);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleArrayItem('marketing_canales', item.label)}
                        className={`p-3 rounded-2xl text-left border text-xs font-semibold transition cursor-pointer flex items-center justify-between min-h-[48px] ${
                          checked
                            ? 'bg-[color-mix(in_srgb,var(--c-primary)_12%,var(--c-card))] border-[var(--c-primary)] text-[var(--c-text)] shadow-sm'
                            : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:border-[var(--c-border-2)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <span className="text-sm shrink-0">{item.icon}</span>
                          <span className="leading-tight text-xs font-semibold">{item.label}</span>
                        </div>
                        <span
                          style={checked ? { background: 'var(--c-primary)', color: 'var(--c-primary-fg)' } : {}}
                          className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] shrink-0 ${
                            checked ? 'border-[var(--c-primary)] font-bold' : 'border-[var(--c-border-2)]'
                          }`}
                        >
                          {checked ? '✓' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 text-[11px] text-[var(--c-text-3)] flex items-center gap-2 border-t border-[var(--c-border)]">
                <span>📈</span>
                <span>Permite atribuir con exactitud el ROI de cada red social y canal publicitario.</span>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            SLIDE 4: FACTURACIÓN FISCAL (CFDI) Y PASE A SALA DE ESPERA
           ════════════════════════════════════════════════════════════════════════ */}
        {currentStep === 4 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in">
            {/* MÓDULO 7: FACTURACIÓN FISCAL (CFDI) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--c-card)] border border-[var(--c-border)] space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--c-warn)_15%,transparent)] text-[var(--c-warn)] flex items-center justify-center font-bold text-sm">
                    🧾
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[var(--c-text)]">
                      Facturación Fiscal (CFDI)
                    </h2>
                    <p className="text-[11px] text-[var(--c-text-2)]">Emisión de comprobante fiscal digital</p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs font-semibold text-[var(--c-text)]">¿Requiere factura?</span>
                  <input
                    type="checkbox"
                    checked={formData.factura_requiere}
                    onChange={e => updateField('factura_requiere', e.target.checked)}
                    className="w-4 h-4 accent-[var(--c-primary)] cursor-pointer"
                  />
                </label>
              </div>

              {formData.factura_requiere ? (
                <div className="space-y-3.5 animate-in fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                      placeholder="Nombre exacto según constancia de situación fiscal"
                      className={inpClass}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className={labelClass}>Régimen Fiscal</label>
                      <select
                        value={formData.factura_regimen}
                        onChange={e => updateField('factura_regimen', e.target.value)}
                        className={`${inpClass} cursor-pointer`}
                      >
                        {REGIMENES_SAT.map(r => (
                          <option key={r.code} value={r.code} className="bg-[var(--c-card)] text-[var(--c-text)]">
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Uso de CFDI</label>
                      <select
                        value={formData.factura_uso_cfdi}
                        onChange={e => updateField('factura_uso_cfdi', e.target.value)}
                        className={`${inpClass} cursor-pointer`}
                      >
                        {USOS_CFDI.map(u => (
                          <option key={u.code} value={u.code} className="bg-[var(--c-card)] text-[var(--c-text)]">
                            {u.label}
                          </option>
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
                <div className="p-6 rounded-2xl bg-[var(--c-subtle)] border border-dashed border-[var(--c-border)] text-center space-y-2">
                  <p className="text-xs font-semibold text-[var(--c-text-2)]">
                    El paciente no requiere factura en este momento.
                  </p>
                  <p className="text-[11px] text-[var(--c-text-3)]">
                    Se registrarán las notas de cobro al público en general. Podrá agregarse un RFC en cualquier momento posterior.
                  </p>
                </div>
              )}
            </div>

            {/* MÓDULO 8: PASE DIRECTO A SALA DE ESPERA */}
            <div className="p-5 sm:p-6 rounded-3xl bg-[var(--c-card)] border border-[var(--c-border)] space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-[var(--c-primary)] flex items-center justify-center font-bold text-sm">
                      🩺
                    </span>
                    <div>
                      <h2 className="text-sm sm:text-base font-bold text-[var(--c-text)]">
                        Pase a Sala de Espera
                      </h2>
                      <p className="text-[11px] text-[var(--c-text-2)]">Apertura de turno de atención inmediata</p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs font-semibold text-[var(--c-primary)]">¿Pasa a sala ahora?</span>
                    <input
                      type="checkbox"
                      checked={formData.enviar_a_sala}
                      onChange={e => updateField('enviar_a_sala', e.target.checked)}
                      className="w-4 h-4 accent-[var(--c-primary)] cursor-pointer"
                    />
                  </label>
                </div>

                {formData.enviar_a_sala ? (
                  <div className="space-y-3.5 animate-in fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className={labelClass}>Médico que atenderá</label>
                        <select
                          value={formData.doctor_id}
                          onChange={e => updateField('doctor_id', e.target.value)}
                          className={`${inpClass} cursor-pointer`}
                        >
                          {doctors.map(d => (
                            <option key={d.id} value={d.id} className="bg-[var(--c-card)] text-[var(--c-text)]">
                              {d.display_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Sede / Consultorio</label>
                        <select
                          value={formData.location_id}
                          onChange={e => updateField('location_id', e.target.value)}
                          className={`${inpClass} cursor-pointer`}
                        >
                          {locations.map(l => (
                            <option key={l.id} value={l.id} className="bg-[var(--c-card)] text-[var(--c-text)]">
                              {l.name}
                            </option>
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

                      {/* Cuadrícula estricta de motivos rápidos */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {MOTIVOS_PRIMERA_VEZ.map(mot => {
                          const isSelected = formData.motivo_visita === mot;
                          return (
                            <button
                              key={mot}
                              type="button"
                              onClick={() => updateField('motivo_visita', mot)}
                              className={`p-2.5 rounded-xl text-xs font-medium border transition cursor-pointer text-center leading-snug min-h-[44px] flex items-center justify-center ${
                                isSelected
                                  ? 'bg-[color-mix(in_srgb,var(--c-primary)_12%,var(--c-card))] border-[var(--c-primary)] text-[var(--c-primary)] font-bold shadow-sm'
                                  : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-text-2)] hover:text-[var(--c-text)] hover:bg-[var(--c-subtle)]'
                              }`}
                            >
                              {mot}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-[color-mix(in_srgb,var(--c-success)_10%,transparent)] border border-[color-mix(in_srgb,var(--c-success)_30%,transparent)] text-xs text-[var(--c-success)] flex items-center gap-2">
                      <span className="font-bold">✓</span>
                      <span className="font-medium">El paciente aparecerá inmediatamente en la cola activa de la Sala de Espera.</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-[var(--c-subtle)] border border-dashed border-[var(--c-border)] text-center space-y-2">
                    <p className="text-xs font-semibold text-[var(--c-text-2)]">
                      Solo se creará el expediente del paciente sin abrir turno de atención hoy.
                    </p>
                    <p className="text-[11px] text-[var(--c-text-3)]">
                      Podrás agendarle una cita posterior en el calendario o registrar su visita cuando llegue.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2 text-[11px] text-[var(--c-text-3)] flex items-center gap-1.5 border-t border-[var(--c-border)]">
                <span>🔒</span>
                <span>Datos resguardados con encriptación y aislamiento multi-tenant por clínica.</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── 3. BARRA INFERIOR FIJA: BOTONES PERFECTAMENTE CENTRADOS Y EMPAREJADOS (COMPATIBLE CON LIGHT Y DARK MODE) ── */}
      <footer className="fixed bottom-0 left-0 md:left-[232px] right-0 z-30 bg-[var(--c-card)]/95 backdrop-blur-md border-t border-[var(--c-border)] px-4 sm:px-8 py-3.5 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          {/* LADO IZQUIERDO (flex-1): Auto-guardado en tiempo real */}
          <div className="flex-1 hidden sm:flex items-center gap-2 text-xs font-mono text-[var(--c-success)]">
            <span className="w-2 h-2 rounded-full bg-[var(--c-success)] animate-pulse shrink-0" />
            <span className="truncate">{lastSavedTime || 'Borrador guardado automáticamente'}</span>
          </div>

          {/* CENTRO: BOTONES DE NAVEGACIÓN ANTERIOR Y SIGUIENTE CENTRADOS Y BALANCEADOS */}
          <div className="flex items-center justify-center gap-3 w-full sm:w-auto">
            {/* Botón Anterior / Cancelar */}
            <button
              type="button"
              onClick={handleBack}
              className="px-5 sm:px-6 py-2.5 rounded-xl text-xs font-semibold text-[var(--c-text-2)] hover:text-[var(--c-text)] bg-[var(--c-card)] hover:bg-[var(--c-subtle)] transition cursor-pointer flex items-center justify-center gap-2 border border-[var(--c-border)] flex-1 sm:flex-none shadow-sm"
            >
              <Icon name="back" size={16} />
              <span>{currentStep === 1 ? 'Cancelar' : 'Anterior'}</span>
            </button>

            {/* Botón Siguiente / Registrar */}
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                style={{ background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}
                className="px-6 sm:px-8 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-md flex items-center justify-center gap-2 flex-1 sm:flex-none hover:opacity-90"
              >
                <span>Siguiente Paso</span>
                <span className="rotate-180 inline-block"><Icon name="back" size={16} /></span>
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleFinalSubmit}
                style={{ background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}
                className="px-6 sm:px-8 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-lg flex items-center justify-center gap-2 flex-1 sm:flex-none hover:opacity-90 disabled:opacity-50"
              >
                {saving ? (
                  <span>Guardando...</span>
                ) : (
                  <>
                    <span>✓</span>
                    <span>{formData.enviar_a_sala ? 'Registrar y Pasar a Sala' : 'Registrar Paciente'}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* LADO DERECHO (flex-1): Contador de progreso para balance simétrico exacto */}
          <div className="flex-1 hidden sm:flex justify-end items-center gap-2 text-xs text-[var(--c-text-2)] font-mono">
            <span>Paso {currentStep} de 4 ({currentStep * 25}%)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
