-- =====================================================
-- APEX — SCHEMA COMPLETO PARA SUPABASE
-- =====================================================

-- Tabla: patients
-- Almacena datos de los pacientes (3 fases: receptionist, nurse, doctor)
CREATE TABLE IF NOT EXISTS public.patients (
  id TEXT PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- FASE 1: Recepcionista
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(200),
  date_of_birth DATE,
  sex VARCHAR(20),
  occupation VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20),

  -- Contacto emergencia
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_email VARCHAR(100),
  emergency_contact_relationship VARCHAR(50),

  -- Fuentes de referencia
  source_of_contact VARCHAR(100),
  referred_by VARCHAR(100),
  reviewed_social_media BOOLEAN DEFAULT FALSE,
  reviewed_website BOOLEAN DEFAULT FALSE,
  reviewed_google_maps BOOLEAN DEFAULT FALSE,

  -- FASE 2: Enfermera
  chronic_diseases TEXT,
  surgeries TEXT,
  hospitalizations TEXT,
  fractures TEXT,
  transfusions BOOLEAN DEFAULT FALSE,
  childhood_diseases TEXT,
  allergies_medications TEXT,
  allergies_foods TEXT,
  allergies_environmental TEXT,
  med_notas TEXT,

  -- Medicamentos dinámicos (JSON array)
  medications JSONB DEFAULT '[]'::jsonb,

  -- Hábitos
  smoking_status VARCHAR(50),
  smoking_count VARCHAR(50),
  smoking_since VARCHAR(50),
  alcohol_status VARCHAR(50),
  alcohol_type VARCHAR(100),
  alcohol_amount VARCHAR(50),

  -- FASE 3: Doctor
  sexo_biologico VARCHAR(50),
  genero_identidad VARCHAR(100),
  sust_recreativas TEXT,
  libido_basal INT,
  salud_sexual_notas TEXT,
  dx_psiquiatrico TEXT,
  med_psiquiatrica TEXT,
  trauma_relevante TEXT,

  -- Reproductiva femenina (condicional)
  menarca_age VARCHAR(50),
  ciclos_regulares VARCHAR(50),
  pregnancies VARCHAR(50),
  births VARCHAR(50),
  miscarriages VARCHAR(50),
  menopausal BOOLEAN,
  menopausal_age VARCHAR(50),
  menopausal_tipo VARCHAR(50),
  contraceptive VARCHAR(100),
  pap_ultimo VARCHAR(50),
  masto_ultima VARCHAR(50),
  colpo_ultima VARCHAR(50),

  -- Reproductiva masculina (condicional)
  erectile_dysfunction VARCHAR(50),
  testosterone_use VARCHAR(50),
  testosterone_detalle VARCHAR(100),
  children VARCHAR(50),
  psa_ultimo VARCHAR(50),
  psa_valor FLOAT,

  -- Familia (JSON array)
  family_history JSONB DEFAULT '[]'::jsonb,

  -- Aprendizaje de preferencias del médico
  doctor_preferences TEXT,

  -- Fases completadas
  phases_completed TEXT[] DEFAULT ARRAY[]::TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patients_doctor_id ON public.patients(doctor_id);
CREATE INDEX idx_patients_created_at ON public.patients(created_at DESC);

-- =====================================================

-- Tabla: visits
-- Almacena datos de visitas (7 bloques A-G)
CREATE TABLE IF NOT EXISTS public.visits (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- BLOQUE A: Motivo visita
  visit_reason TEXT,
  discomfort_intensity INT,
  symptom_since VARCHAR(100),
  first_time VARCHAR(50),
  medication_changes TEXT,

  -- Notas por rol (recepción / enfermería)
  reception_notes TEXT,
  nursing_notes TEXT,

  -- BLOQUE B: Signos vitales
  pa_der_sistolica FLOAT,
  pa_der_diastolica FLOAT,
  pa_izq_sistolica FLOAT,
  pa_izq_diastolica FLOAT,
  pa_dominant_arm VARCHAR(50),
  heart_rate FLOAT,
  temperature FLOAT,
  spo2 FLOAT,
  glucose FLOAT,
  glucose_fasting_hours INT,
  ecg_done BOOLEAN,
  ecg_interpretation TEXT,

  -- BLOQUE C: Composición corporal
  weight FLOAT,
  height FLOAT,
  imc FLOAT,
  circ_abdominal FLOAT,
  circ_waist FLOAT,
  circ_hip FLOAT,
  circ_neck FLOAT,
  circ_biceps FLOAT,
  circ_wrist FLOAT,
  inbody_fat_pct FLOAT,
  inbody_muscle_kg FLOAT,
  inbody_water_pct FLOAT,
  inbody_visceral FLOAT,
  activity_type VARCHAR(100),
  activity_frequency VARCHAR(50),
  activity_intensity VARCHAR(50),

  -- BLOQUE D: Pruebas funcionales
  grip_right FLOAT,
  grip_left FLOAT,
  walk_4m_seconds FLOAT,
  sit_stand_30s INT,
  balance_seconds INT,
  vo2max FLOAT,

  -- BLOQUE E: Reporte subjetivo
  energy_morning INT,
  energy_noon INT,
  energy_evening INT,
  sleep_quality INT,
  sleep_hours FLOAT,
  wakes_rested VARCHAR(50),
  mood TEXT[],
  libido INT,
  digestion TEXT[],
  urine_color VARCHAR(50),
  urine_color_afternoon VARCHAR(50),
  pain_today BOOLEAN,
  pain_location VARCHAR(100),
  pain_intensity INT,
  pains JSONB DEFAULT '[]'::jsonb,
  patient_goals TEXT,

  -- BLOQUE F: Exploración clínica
  general_inspection TEXT,
  skin_findings TEXT,
  eye_findings TEXT,
  mouth_findings TEXT,
  thyroid_findings TEXT,
  abdomen_findings TEXT,
  neuro_findings TEXT,
  other_findings TEXT,
  imaging_type VARCHAR(100),
  imaging_findings TEXT,
  minicog_done BOOLEAN,
  minicog_words INT,
  minicog_clock VARCHAR(50),
  minicog_notes TEXT,

  -- BLOQUE G: Labs
  labs_pdf_url TEXT,
  labs_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_visits_patient_id ON public.visits(patient_id);
CREATE INDEX idx_visits_doctor_id ON public.visits(doctor_id);
CREATE INDEX idx_visits_created_at ON public.visits(created_at DESC);

-- =====================================================

-- Tabla: analyses
-- Almacena resultados de análisis clínico
CREATE TABLE IF NOT EXISTS public.analyses (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 3 diagnósticos
  diagnosis_traditional TEXT,
  validation_traditional TEXT,
  doctor_traditional TEXT,

  diagnosis_functional TEXT,
  validation_functional TEXT,
  doctor_functional TEXT,

  diagnosis_longevity TEXT,
  validation_longevity TEXT,
  doctor_longevity TEXT,

  -- 3 protocolos
  protocol_traditional TEXT,
  protocol_functional TEXT,
  protocol_longevity TEXT,
  protocol_experimental TEXT,

  -- Historial de chat (JSON array)
  chat_history JSONB DEFAULT '[]'::jsonb,

  -- Preferencias aprendidas del médico
  preferences_summary TEXT,

  -- Borrador del primer diagnóstico (análisis silencioso antes de mostrarlo al médico,
  -- usado para generar preguntas de aclaración basadas en el caso real, no genéricas)
  draft_diagnosis TEXT,
  draft_validation TEXT,
  draft_confidence INT,
  draft_type TEXT,

  status VARCHAR(50) DEFAULT 'in_progress',  -- in_progress, completed, closed

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analyses_visit_id ON public.analyses(visit_id);
CREATE INDEX idx_analyses_patient_id ON public.analyses(patient_id);
CREATE INDEX idx_analyses_doctor_id ON public.analyses(doctor_id);

-- =====================================================

-- RLS (Row Level Security) — Datos accesibles solo por el doctor propietario
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- Pacientes: solo el doctor que creó
CREATE POLICY patients_doctor_select ON public.patients
  FOR SELECT USING (doctor_id = auth.uid());

CREATE POLICY patients_doctor_insert ON public.patients
  FOR INSERT WITH CHECK (doctor_id = auth.uid());

CREATE POLICY patients_doctor_update ON public.patients
  FOR UPDATE USING (doctor_id = auth.uid());

-- Visitas: solo el doctor que creó
CREATE POLICY visits_doctor_select ON public.visits
  FOR SELECT USING (doctor_id = auth.uid());

CREATE POLICY visits_doctor_insert ON public.visits
  FOR INSERT WITH CHECK (doctor_id = auth.uid());

CREATE POLICY visits_doctor_update ON public.visits
  FOR UPDATE USING (doctor_id = auth.uid());

-- Análisis: solo el doctor que creó
CREATE POLICY analyses_doctor_select ON public.analyses
  FOR SELECT USING (doctor_id = auth.uid());

CREATE POLICY analyses_doctor_insert ON public.analyses
  FOR INSERT WITH CHECK (doctor_id = auth.uid());

CREATE POLICY analyses_doctor_update ON public.analyses
  FOR UPDATE USING (doctor_id = auth.uid());

-- =====================================================
-- FIN SCHEMA
-- =====================================================
