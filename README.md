# APEX — Plataforma de Inteligencia Clínica

Sistema SaaS para médicos que combina expediente clínico, motor de diagnóstico con IA, y generación de protocolos.

## Estructura del Proyecto

```
.
├── frontend/              # Next.js 14 - UI para médicos
│   ├── app/
│   │   ├── auth/login     # Pantalla de login
│   │   ├── dashboard/     # Home del médico
│   │   ├── components/    # Componentes reutilizables
│   │   └── lib/           # Utilidades (Supabase, Auth)
│   └── package.json
│
├── backend/               # FastAPI - API + análisis con IA
│   ├── main.py            # Servidor principal
│   ├── requirements.txt    # Dependencias Python
│   └── .env.local         # Variables de entorno (local)
│
├── V1/                    # Prototipos HTML originales
└── SETUP.md               # Guía de configuración inicial
```

## Stack Técnico

| Componente | Tecnología |
|-----------|-----------|
| Frontend | Next.js 14 + React 18 + Tailwind |
| Backend | FastAPI + Python |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + JWT |
| IA | Anthropic Claude API |
| Deploy | Vercel (frontend) + cualquier servidor (backend) |

## Quick Start

1. **Setup Supabase**: Lee [SETUP.md](SETUP.md)
2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. **Backend**:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python main.py
   ```

Frontend: http://localhost:3000
Backend: http://localhost:8000

## Roadmap MVP (4 semanas)

- **Week 1** ✅ Setup + Auth + Home
  - [x] Next.js + FastAPI
  - [x] Login con Supabase
  - [x] Dashboard médico
  - [ ] Conectar con Supabase (necesita credenciales)

- **Week 2** Nuevo Paciente (Parte 1)
  - [ ] Formulario 5 pasos
  - [ ] Validación
  - [ ] Base de datos

- **Week 3** Nueva Visita (Captura de Datos)
  - [ ] Interfaz 7 bloques
  - [ ] Guardado en DB

- **Week 4** Análisis + Documentos
  - [ ] Claude API integration
  - [ ] Generación de PDFs

## Licencia

Privado - Apex Medical Inc.
