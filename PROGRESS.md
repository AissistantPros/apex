# APEX — Progress Report

## ✅ COMPLETADO (2 Semanas)

### Week 1: Setup + Auth + Home
- Next.js 14 + React 18 frontend ✅
- FastAPI backend ✅
- Supabase Auth (login/logout) ✅
- Dashboard médico con navbar ✅
- GitHub repo (private) ✅

### Week 2: Nuevo Paciente (Stage 1 - Receptionist)
- 5-step patient registration form ✅
- Frontend → Backend connection ✅
- Patient creation endpoint ✅
- In-memory storage for MVP ✅
- Auto-redirect to patient detail page ✅

**Current Status:** MVP funciona end-to-end. Pacientes se crean correctamente.

---

## 🔧 STACK ACTUAL

```
Frontend:    http://localhost:3000 (Next.js 14 + Tailwind)
Backend:     http://localhost:8000 (FastAPI)
Database:    Supabase (auth only, patients in-memory for MVP)
Auth:        Supabase JWT
```

---

## 📋 NEXT STEPS

### Week 3: Nueva Visita (Stage 2 + 3)
- [ ] Form con 7 bloques (A-G): motivo, signos vitales, composición, pruebas, subjetivo, observaciones, labs
- [ ] Frontend form builder
- [ ] Backend endpoints para guardar visita

### Week 4: Análisis + Documentos
- [ ] Claude API integration para diagnóstico
- [ ] 3 PDFs: receta, reporte, solicitud estudios
- [ ] Protocolo generation

### Luego (Fase 1.5)
- Conectar completamente con Supabase (reemplazar in-memory)
- Refinar preguntas basado en feedback
- RLS policies validation

---

## 🚀 CÓMO CONTINUAR

**Terminal 1 - Backend:**
```bash
cd backend
python main.py
# Corre en http://localhost:8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Corre en http://localhost:3000
```

**Test:** http://localhost:3000/dashboard → "Nuevo Paciente"

---

## 📁 ESTRUCTURA

```
.
├── frontend/           # Next.js 14
│   ├── app/
│   │   ├── auth/login
│   │   ├── dashboard
│   │   ├── dashboard/new-patient
│   │   └── dashboard/patient/[id]
│   └── lib/
│       ├── supabase.ts
│       ├── auth.ts
│       └── api.ts
├── backend/            # FastAPI
│   ├── main.py
│   ├── models.py
│   ├── routes_patients.py
│   ├── db_schema.sql
│   └── .env.local
└── V1/                 # Original HTML prototypes
```

---

## 🔑 CREDENCIALES (en .env.local)

```
Frontend:  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
Backend:   SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY
```

---

## 📊 ETAPAS DEL PACIENTE

**Stage 1 (Receptionist)** ✅ DONE
- Datos generales, contacto, cómo llegó

**Stage 2 (Nurse)** ⏳ TODO
- Antecedentes familiares, personales, medicamentos
- Signos vitales, composición corporal, pruebas funcionales

**Stage 3 (Doctor)** ⏳ TODO
- Hábitos privados, historia reproductiva
- Análisis clínico, diagnóstico, protocolo

---

## 🎯 PRÓXIMA SESIÓN

Empezar Week 3: Nueva Visita (7-block form for vital signs, measurements, labs)

Referencia: APEX_spec_v4.md (líneas 195-251 para descripción completa)

---

**Last updated:** 2 de Junio 2026
**Commits:** 4 (init, schema, frontend-connect, mvp-working)
**Lines of code:** ~3000
