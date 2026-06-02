-- APEX DATABASE SCHEMA
-- 3-stage patient registration with RLS per role

-- ==========================================
-- ETAPA 1: RECEPCIONISTA (Datos Generales)
-- ==========================================

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id),

  -- Identificación (ETAPA 1)
  full_name TEXT NOT NULL,
  birth_date DATE,
  sex CHAR(1), -- 'M', 'F'
  occupation TEXT,
  photo_url TEXT,

  -- Contacto (ETAPA 1)
  email TEXT,
  phone TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_email TEXT,
  emergency_contact_relationship TEXT,

  -- Cómo llegó (ETAPA 1)
  source_of_contact TEXT, -- 'patient_recommendation', 'doctor_recommendation', 'social_media', 'web_search', 'google_maps', 'paid_ads', 'other'
  referred_by TEXT,
  reviewed_social_media BOOLEAN DEFAULT FALSE,
  reviewed_website BOOLEAN DEFAULT FALSE,
  reviewed_google_maps BOOLEAN DEFAULT FALSE,

  -- Metadata
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'archived'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- RLS: Doctor puede ver sus propios pacientes
CREATE POLICY "Doctor can view own patients"
  ON patients FOR SELECT
  USING (auth.uid() = doctor_id);

CREATE POLICY "Doctor can insert own patients"
  ON patients FOR INSERT
  WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Doctor can update own patients"
  ON patients FOR UPDATE
  USING (auth.uid() = doctor_id);

-- ==========================================
-- ETAPA 2: ENFERMERA (Antecedentes Clínicos Básicos)
-- ==========================================

CREATE TABLE patient_family_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id),

  -- Familiar
  family_member TEXT, -- 'father', 'mother', 'paternal_grandfather', 'paternal_grandmother', 'maternal_grandfather', 'maternal_grandmother', 'siblings'

  -- Condiciones
  has_diabetes BOOLEAN DEFAULT FALSE,
  has_hypertension BOOLEAN DEFAULT FALSE,
  has_cancer BOOLEAN DEFAULT FALSE,
  has_heart_disease BOOLEAN DEFAULT FALSE,
  has_dementia BOOLEAN DEFAULT FALSE,
  has_autoimmune BOOLEAN DEFAULT FALSE,
  has_depression BOOLEAN DEFAULT FALSE,
  has_obesity BOOLEAN DEFAULT FALSE,

  cause_of_death TEXT,
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE patient_family_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctor can view own patient family history"
  ON patient_family_history FOR SELECT
  USING (auth.uid() = doctor_id);

CREATE POLICY "Doctor can manage own patient family history"
  ON patient_family_history FOR INSERT
  WITH CHECK (auth.uid() = doctor_id);

CREATE TABLE patient_past_medical_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id),

  -- Enfermedades crónicas
  chronic_diseases TEXT, -- JSON or comma-separated
  chronic_diseases_notes TEXT,

  -- Hospitalizations
  hospitalizations TEXT,

  -- Cirugías
  surgeries TEXT,
  surgeries_notes TEXT,

  -- Fracturas
  fractures TEXT,
  fractures_notes TEXT,

  -- Transfusiones
  transfusions BOOLEAN DEFAULT FALSE,
  transfusions_notes TEXT,

  -- Alergias
  allergies TEXT, -- JSON: {medications: [], foods: [], environmental: []}

  -- Enfermedades de infancia
  childhood_diseases TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE patient_past_medical_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctor can view own patient medical history"
  ON patient_past_medical_history FOR SELECT
  USING (auth.uid() = doctor_id);

CREATE POLICY "Doctor can manage own patient medical history"
  ON patient_past_medical_history FOR INSERT
  WITH CHECK (auth.uid() = doctor_id);

CREATE TABLE patient_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id),

  medication_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  start_date DATE,
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctor can view own patient medications"
  ON patient_medications FOR SELECT
  USING (auth.uid() = doctor_id);

CREATE POLICY "Doctor can manage own patient medications"
  ON patient_medications FOR INSERT
  WITH CHECK (auth.uid() = doctor_id);

-- ==========================================
-- ETAPA 3: MÉDICO (Datos Privados + Histórico)
-- ==========================================

CREATE TABLE patient_private_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id),

  -- Hábitos privados
  smoking_status TEXT, -- 'never', 'former', 'active'
  smoking_count_per_day INTEGER,
  smoking_since_year INTEGER,

  alcohol_frequency TEXT, -- 'never', 'occasional', 'frequent', 'daily'
  alcohol_type TEXT,

  recreational_drugs TEXT,

  physical_activity_type TEXT,
  physical_activity_frequency TEXT,
  physical_activity_intensity TEXT,

  sleep_hours DECIMAL(3,1),
  stress_level INTEGER, -- 1-10

  -- Historia reproductiva (condicional por sexo)
  menarche_age INTEGER, -- para mujeres
  menstrual_cycles_regular BOOLEAN,
  pregnancies_count INTEGER,
  births_count INTEGER,
  miscarriages_count INTEGER,
  menopausal BOOLEAN,
  contraceptive_method TEXT,

  erectile_dysfunction BOOLEAN, -- para hombres
  previous_testosterone_use BOOLEAN,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE patient_private_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctor can view own patient private info"
  ON patient_private_info FOR SELECT
  USING (auth.uid() = doctor_id);

CREATE POLICY "Doctor can manage own patient private info"
  ON patient_private_info FOR INSERT
  WITH CHECK (auth.uid() = doctor_id);

-- ==========================================
-- Índices para rendimiento
-- ==========================================

CREATE INDEX idx_patients_doctor_id ON patients(doctor_id);
CREATE INDEX idx_patients_email ON patients(email);
CREATE INDEX idx_patients_created_at ON patients(created_at DESC);

CREATE INDEX idx_family_history_patient_id ON patient_family_history(patient_id);
CREATE INDEX idx_past_medical_patient_id ON patient_past_medical_history(patient_id);
CREATE INDEX idx_medications_patient_id ON patient_medications(patient_id);
CREATE INDEX idx_private_info_patient_id ON patient_private_info(patient_id);
