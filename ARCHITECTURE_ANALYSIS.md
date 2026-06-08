# APEX — Sistema de Análisis IA Cascada

## 🏗️ Arquitectura Completa (Post-Registro)

```
┌─────────────────────────────────────────────────────────────────┐
│  PACIENTE REGISTRADO (Fase 1, 2, 3 completadas)                │
│  ✓ Identificación + Antecedentes + Hábitos + Reproductiva      │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  NUEVA VISITA (A-G)    │
        │  - Motivo              │
        │  - Signos vitales      │
        │  - Composición         │
        │  - Pruebas funcionales │
        │  - Subjetivo           │
        │  - Clínicas            │
        │  - Labs                │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────────────────┐
        │  BOTÓN: "Analizar Caso"           │
        │  → Redirige a /analysis/          │
        └────────────┬───────────────────────┘
                     │
    ╔════════════════╩══════════════════════════════════════════════════════════╗
    ║  SISTEMA DE ANÁLISIS IA (8 PASOS CON LOOPS INTERACTIVOS)                 ║
    ╚════════════════╦══════════════════════════════════════════════════════════╝
                     │
     ┌───────────────┼───────────────┬───────────────────────────┐
     │               │               │                           │
     ▼               ▼               ▼                           ▼
 ┌─────────┐   ┌─────────┐   ┌──────────┐              ┌──────────────┐
 │ PASO 1  │───│ PASO 2  │───│ PASO 3   │              │ PASOS 4-6    │
 │ Trad    │   │ Func    │   │ Longevity│              │ Protocolos   │
 │ Diagn   │   │ Diagn   │   │ Diagn    │              │              │
 └─────────┘   └─────────┘   └──────────┘              └──────────────┘
     │               │               │                           │
     │               │               │                           │
     └───────────────┴───────────────┴───────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  PASO 7: DOCUMENTOS    │
        │  - Receta médica       │
        │  - Solicitud estudios  │
        │  - Reporte completo    │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  PASO 8: CERRAR VISITA │
        │  - Guardar en BD       │
        │  - Marcar completada   │
        └────────────────────────┘
```

---

## 📋 PASOS 1-3: DIAGNÓSTICOS EN CASCADA

Cada paso tiene el mismo **loop interactivo**:

```
┌─────────────────────────────────────────────────┐
│  DIAGNÓSTICO GENERADO (Claude LLM)             │
│  - Basado en datos del paciente                 │
│  - Validado anti-alucinaciones (2do LLM)       │
│  - Presentado con fuentes/evidencia             │
└────────────────┬────────────────────────────────┘
                 │
     ┌───────────┼───────────┬──────────────┐
     │           │           │              │
     ▼           ▼           ▼              ▼
  ┌─────┐   ┌─────┐   ┌──────┐         ┌──────┐
  │ ✓   │   │ ✏️  │   │ ✍️   │         │ 💬   │
  │Acept│   │Edit │   │Propio│         │Chat  │
  └──┬──┘   └──┬──┘   └──┬───┘         └──┬───┘
     │        │        │                  │
     │ ┌──────┘        │                  │
     │ │               │                  │
     ├─┼───────────────┼──────────────────┤
     │ │               │                  │
     └─▼───────────────▼──────────────────┘
              │
              ▼
        SIGUIENTE PASO
```

### PASO 1: Diagnóstico Tradicional
- **Input**: Edad, sexo, antecedentes, labs, síntomas
- **Output**: Diagnóstico médico estándar + especialidades
- **LLM**: Claude Opus 4.1 + Validación secundaria
- **Doctor puede**: Aceptar / Editar / Escribir propio / Preguntar

### PASO 2: Diagnóstico Funcional  
- **Input**: Diagnóstico tradicional + datos del paciente
- **Output**: Raíz del problema + Cascada de causalidad + Sistemas desregulados
- **Ej**: "Intestino permeable → Inflamación → Depresión + Fatiga"
- **Doctor puede**: Aceptar / Editar / Escribir propio / Preguntar

### PASO 3: Diagnóstico Longevidad
- **Input**: Diagnóstico funcional + marcadores de envejecimiento
- **Output**: 
  - Edad biológica estimada (vs edad cronológica)
  - Riesgos a 5-10 años (cardiovascular, metabólico, neurológico, oncológico)
  - Optimizaciones posibles (mejora esperada si sigue protocolo)
  - Biomarcadores: actual vs óptimo
- **Doctor puede**: Aceptar / Editar / Escribir propio / Preguntar

---

## 💊 PASOS 4-6: PROTOCOLOS DE 3 NIVELES

Para CADA diagnóstico (Tradicional, Funcional, Longevidad):

```
┌──────────────────────────────────────────────────────────────┐
│  PROTOCOLO [Tipo]                                            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  NIVEL 1: [Medicamentos / Suplementos / Péptidos]           │
│  ├─ Nombre exacto (DCI + marca)                              │
│  ├─ Dosis (ej: 500mg BID con comida)                        │
│  ├─ Duración (ej: 12 semanas)                                │
│  ├─ Indicación (qué síntoma trata)                           │
│  ├─ Justificación científica                                 │
│  ├─ Efectos secundarios esperados                            │
│  ├─ Monitoreo sugerido                                       │
│  └─ Contraindicaciones para este paciente                    │
│                                                               │
│  NIVEL 2: [Suplementos / Lifestyle / Nutraceuticos]         │
│  ├─ [Item 1] - Descripción                                   │
│  └─ [Item 2] - Descripción                                   │
│                                                               │
│  NIVEL 3: [Investigacionales / Optimizaciones]              │
│  ├─ ⚠️ SOLO INFORMATIVO - NO VA EN RECETA                   │
│  ├─ Péptidos: BPC157, TB500, GHK-Cu                         │
│  ├─ Hormonas: NAD+, Melatonina, Testosterona               │
│  └─ Intervenciones: Hipoxia, Sauna, Crioterapia            │
│                                                               │
│  MONITOREO GENERAL:                                          │
│  ├─ Examen seguimiento en: X semanas                         │
│  ├─ Labs de control: [lista]                                │
│  └─ Criterios de éxito: [métricas]                          │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Doctor puede**: Aceptar / Editar Nivel 1 / Editar Nivel 2 / Escribir propio para cada nivel

---

## 📄 PASO 7: DOCUMENTOS

Genera 3 PDFs:

```
┌──────────────────────────────────────┐
│  1. RECETA MÉDICA                    │
│  ├─ Membretada del doctor            │
│  ├─ Medicamentos Nivel 1 (sellados)  │
│  ├─ Firmas digital                   │
│  └─ Válida para farmacia             │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  2. SOLICITUD DE ESTUDIOS            │
│  ├─ Nombre de estudios               │
│  ├─ Urgencia (URGENTE/DESEADO)      │
│  ├─ Firma doctor                     │
│  └─ Imprimible directo al lab        │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  3. REPORTE PACIENTE (Completo)      │
│  ├─ Edad cronológica + biológica     │
│  ├─ Signos vitales + antropometría   │
│  ├─ Diagnóstico simplificado         │
│  ├─ Protocolo de tratamiento         │
│  ├─ Estudios recomendados            │
│  └─ Próxima cita                     │
└──────────────────────────────────────┘
```

---

## 🔄 FLUJO COMPLETO DE USUARIO

```
1. LOGIN
   ↓
2. DASHBOARD
   ↓
3. NUEVO PACIENTE
   ├─ Fase 1: Recepcionista (Identificación + Contacto)
   ├─ Fase 2: Enfermera (Heredofamiliares + Patológicos)
   └─ Fase 3: Doctor (Hábitos + Reproductiva)
   ↓
4. FICHA PACIENTE
   ├─ Botón: "Nueva Visita"
   │  └─ Recopila: A(Motivo) → B(Vitales) → C(Antropo) → D(Funcionales)
   │             → E(Subjetivo) → F(Clínicas) → G(Labs)
   │  └─ Guarda visita con ID
   ↓
5. ANÁLISIS IA (POST-VISITA)
   ├─ PASO 1: Diagnóstico Tradicional
   │  ├─ Claude genera
   │  ├─ 2do LLM valida
   │  └─ Doctor: Acepta/Edita/Propio/Chat
   ├─ PASO 2: Diagnóstico Funcional
   │  ├─ Usa output Paso 1
   │  └─ Doctor: Acepta/Edita/Propio/Chat
   ├─ PASO 3: Diagnóstico Longevidad
   │  ├─ Calcula edad biológica
   │  └─ Doctor: Acepta/Edita/Propio/Chat
   ├─ PASO 4: Protocolo Tradicional (3 niveles)
   ├─ PASO 5: Protocolo Funcional (3 niveles)
   ├─ PASO 6: Protocolo Longevidad (3 niveles)
   ├─ PASO 7: Generar PDFs (Receta + Estudios + Reporte)
   └─ PASO 8: Cerrar visita
   ↓
6. DESCARGAR DOCUMENTOS O VOLVER A FICHA
```

---

## 🔧 STACK TÉCNICO

### Frontend
- **Next.js 14** - App Router
- **React 18** - UI Components  
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety

### Backend
- **FastAPI** - API Framework
- **Python 3.13** - Runtime
- **Anthropic SDK** - Claude API
- **Pydantic** - Data validation

### IA/LLM
- **Claude Opus 4.1** - Análisis diagnóstico
- **Claude Opus 4.1** - Validación anti-alucinaciones
- **Prompt Engineering** - System prompts clínicos
- **Token Counting** - Optimización de costos

### Datos (MVP)
- **In-memory storage** (Semanas 1-4)
- **Transición a Supabase** (Semana 5+)

---

## 📊 FLUJO DE DATOS MÍNIMO

```
Patient + Visit Data → Claude API → Diagnosis JSON
                   ↓
          Secondary Validation
                   ↓
         Doctor Review (Accept/Edit)
                   ↓
            Protocol Generation
                   ↓
            PDF Generation
                   ↓
         Save to Database
```

---

## 🚀 PRÓXIMOS PASOS (No MVP)

1. **RAG System** - Integrar base de conocimiento médica
   - Textos medicina interna
   - Pharmacology databases (PLM, Vandecuum)
   - Internal clinical protocols

2. **Persistent Storage** - Supabase integration
   - Guardar análisis completos
   - Historial de pacientes
   - Auditoría de cambios

3. **Advanced Features**
   - Multi-language support
   - Integration with EHR systems
   - Email/SMS notifications
   - Doctor scheduling

4. **Security & Compliance**
   - HIPAA compliance
   - Data encryption
   - Audit logging
   - Role-based access control

---

## 📈 MÉTRICAS DE ÉXITO (MVP)

- ✅ Doctor puede registrar paciente completo (3 fases)
- ✅ Doctor puede crear visita completa (7 bloques)
- ✅ Sistema genera 3 diagnósticos en cascada (30-60 seg)
- ✅ Doctor puede interactuar con IA via chat
- ✅ Sistema genera protocolos automáticos
- ✅ PDFs se descargan correctamente
- ✅ Flujo completo toma < 5 minutos (después de visita)
