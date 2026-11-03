-- Marca por consultorio: colores, tipografías y datos para documentos (ver services/branding.py).
-- Aplicar una vez en el SQL Editor del proyecto Supabase de Apex. Es idempotente.
alter table public.clinics
  add column if not exists brand jsonb not null default '{}'::jsonb;

comment on column public.clinics.brand is
  'Identidad del consultorio: colors, palette, fonts, tagline, doctor, contacto, logo_white_url, avatar_url.';
