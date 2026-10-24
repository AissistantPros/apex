# Auditoría técnica del repositorio APEX

Repo: `AissistantPros/apex` · raíz git: `/Users/esteban/Desktop/Apex/App` · rama `main`.
Método: exploración directa (`ls`, `find`, `grep`, `git ls-files`, lectura de archivos y consulta al esquema Supabase). Toda afirmación lleva ruta:línea o se marca explícitamente como "no existe".

> Nota transversal importante: **los documentos `README.md`/`STATUS.md`/`PROGRESS.md` están obsoletos** (fechados junio 2026). Describen un MVP in-memory sin desplegar; el código real está mucho más avanzado (Supabase completo, RAG, auth ES256, entitlements, desplegado en Render+Vercel). Ver §9.

---

## 1. Estructura y stack

### 1.1 Backend
- **Framework**: FastAPI. `backend/requirements.txt`:
  ```
  fastapi==0.104.1
  uvicorn==0.24.0
  pydantic==2.8.0
  anthropic>=0.40.0
  supabase==2.4.2
  voyageai>=0.3.0
  PyJWT[crypto]>=2.8.0
  python-docx==1.1.2 / openpyxl==3.1.5 / pypdf==5.1.0 / pypdfium2==4.30.0
  duckduckgo-search>=6.0.0
  python-multipart==0.0.6 / python-dotenv==1.0.0
  ```
- **Python efectivo**: 3.11.9 — `.python-version` = `3.11.9`, `runtime.txt` = `python-3.11.9`. (⚠️ `README.md` dice "Python 3.13": es incorrecto.)
- **No hay `pyproject.toml`** (ni en raíz ni en backend); solo `requirements.txt`.
- **Punto de entrada**: `backend/main.py`.

### 1.2 Frontend
- **Es un build con framework, NO HTMLs estáticos**: Next.js 14 (App Router) + React 18 + TypeScript 5 + Tailwind 3. `frontend/package.json`:
  ```json
  "dependencies": { "next": "^14.0.0", "react": "^18.0.0", "@supabase/supabase-js": "^2.38.0",
    "axios": "^1.6.0", "tailwindcss": "^3.4.0", "typescript": "^5.3.0" }
  ```
- Los `apex-*.html` (§6) son el **prototipo V1 legacy**, no el frontend actual.

### 1.3 Punto de entrada y endpoints
`backend/main.py`: crea `FastAPI`, CORS `allow_origins=["*"]`, middleware `usage_logger` (línea 41), manejador global de excepciones (línea 68, devuelve JSON+CORS en español), y registra ~16 routers (líneas 123-138): patients, visits, analysis, chat, kb, stats, clinic, staff, marketing, messages, admin, appointments, support, deletions, questionnaires.
Endpoints núcleo del análisis (`backend/routes_analysis.py`):
```
POST /analyze/{visit_id}/extract_labs      POST /analyze/{visit_id}/clarify
POST /analyze/{visit_id}/traditional       POST /analyze/{visit_id}/finalize_first[/stream]
POST /analyze/{visit_id}/clarify_functional POST /analyze/{visit_id}/functional[/stream]
POST /analyze/{visit_id}/clarify_longevity  POST /analyze/{visit_id}/longevity[/stream]
POST /analyze/{visit_id}/protocol[/stream]  POST /analyze/{visit_id}/{step}/chat
GET  /analyze/{visit_id}   GET /analyze/{visit_id}/logs   GET /analyze/{visit_id}/documents
```

### 1.4 Comunicación front↔back
REST sobre `fetch` contra `NEXT_PUBLIC_BACKEND_URL` (p. ej. `frontend/app/dashboard/patient/[id]/visit/[visit_id]/analysis/page.tsx:2583`). Los diagnósticos usan **SSE** (streaming) leído con `fetch`+reader en `streamSSE(...)`; el chat doctor-IA es **request/response** (`POST /{visit_id}/{step}/chat`). No vi WebSocket en el flujo clínico.

### 1.5 `scripts/`
Un solo script real: `scripts/subir_biblioteca.py` — carga masiva de libros a la base de conocimiento (ingesta RAG por CLI). (También un `.pyc` en `__pycache__`.)

### 1.6 `V1/` y su relación con backend/frontend
`V1/` = **prototipo estático antiguo**: `V1/apex-*.html` (7 HTML con JS embebido) + `V1/APEX_spec_v4.md`. No lo consume el app actual (backend FastAPI + frontend Next.js). Es histórico.

### 1.7 Duplicados / legacy
- `apex-*.html` en **raíz** están duplicados en `V1/` (mismos nombres) — ambos legacy.
- `backend/services/claude_analysis.py` es **código muerto**: `grep` de importaciones no arroja ningún import (solo su propio archivo). Usa un modelo viejo (`claude-opus-4-1-20250805`). El camino vivo es `routes_analysis.py`.

---

## 2. Uso de Claude

1. **Instanciación del cliente**:
   - Activo: `backend/routes_analysis.py:43` → `client = Anthropic()`.
   - OCR de PDFs escaneados: `backend/services/knowledge_base.py:279` → `client = Anthropic()`.
   - Otros: `routes_chat.py`, `routes_appointments.py` (`_resumen_ia`) instancian `Anthropic()` directo.
   - Legacy muerto: `backend/services/claude_analysis.py:18`.
2. **Modelos** (`routes_analysis.py:46-51`, **hardcodeados** como constantes, no env var):
   ```
   MODEL_DIAGNOSE = "claude-opus-4-8"    # diagnóstico final
   MODEL_PROTOCOL = "claude-sonnet-4-6"  # protocolos
   MODEL_EXTRACT  = "claude-sonnet-4-6"  # transcripción de estudios
   MODEL_DRAFT    = "claude-sonnet-4-6"  # borrador
   MODEL_VALIDATE = "claude-haiku-4-5"   # validación secundaria
   MODEL_CHAT     = "claude-haiku-4-5"
   ```
   Única excepción configurable por env: `OCR_MODEL` (`knowledge_base.py:231`, default `claude-sonnet-4-6`).
3. **Llamadas por consulta**: **múltiples** (cascada), no una sola. Un caso completo encadena: `extract_labs` → `clarify` → `finalize_first`/`traditional` → `clarify_functional` → `functional/stream` → `clarify_longevity` → `longevity/stream` → `protocol/stream` (×3) + `chat` bajo demanda. Evidencia real en `usage_events` (draft, clarify, finalize_traditional, protocol_traditional, clarify_functional…). Orden de ~8-15 llamadas por paciente completo.
4. **Prompts**: **embebidos en Python**, no en `.txt`/`.md`. Todo en `backend/services/system_prompt.py` (~1,900 líneas): `IDENTITY_TRADITIONAL/FUNCTIONAL/LONGEVITY`, `build_patient_context`, `build_visit_context`, `get_traditional_diagnosis_prompt`, `get_functional_medicine_prompt`, `get_longevity_diagnosis_prompt`, `get_protocol_prompt`, `get_*_clarifying_questions_prompt`, `FUNCTIONAL_MEDICINE_AXES`, `PEPTIDOS_OFFLABEL_RULE`, `PROTOCOLO_POR_CAPAS_RULE`, `PRINCIPIO_DE_ESTUDIOS`.
5. **Cascada Tradicional→Funcional→Longevidad**: **3 llamadas separadas**, cada una con su endpoint y su prompt; encadenadas (cada etapa recibe como contexto el diagnóstico confirmado por el médico de la anterior). No es un solo prompt ni tool-use.
6. **Errores/reintentos/timeouts**: hay wrappers `call_claude` (`routes_analysis.py:534`) y `call_claude_stream` (:596). Se apoyan en los reintentos por defecto del SDK; **no hay bucle de reintentos ni timeout propios**. En streaming hay *fallback* si el SDK no acepta `temperature`. Los errores suben al manejador global (`main.py:68`).
7. **max_tokens / temperature / top_p**: `max_tokens` por llamada; `thinking:{type:"adaptive"}` en diagnóstico (Opus); `temperature` opcional (solo cuando NO hay thinking, son incompatibles); **no se usa `top_p`**.
8. **Capa de abstracción**: **sí, parcial** — `call_claude`/`call_claude_stream` son el punto único que centraliza modelo, thinking, web_search y **medición de tokens**. No es una interfaz `LLMProvider` formal; módulos como KB-OCR, chat y sala de espera llaman `Anthropic()` directo.

---

## 3. RAG / conocimiento de medicina funcional

1. **Sí existe RAG.** `backend/services/knowledge_base.py` (docstring líneas 1-15): `PDF/DOCX/TXT → texto → fragmentos con solape → embeddings (Voyage) → pgvector → búsqueda por coseno`. Config: `EMBED_MODEL="voyage-3"`, `EMBED_DIMS=1024`, `CHUNK_CHARS=4000`, `CHUNK_OVERLAP=500`.
2. **Libros/PDFs en el repo: NO.** No hay PDFs/EPUBs de medicina funcional versionados. Los libros los **sube el médico en runtime** y viven en Postgres (`kb_documents`, `kb_chunks`). Ingesta: `scripts/subir_biblioteca.py` y `routes_kb.py` (`kb_upload` con `BackgroundTasks`, OCR con Claude si el PDF es escaneado).
3. **Inyección del conocimiento**: `consultar_biblioteca()` (`knowledge_base.py:451`) → `embed_consulta` → coseno en pgvector → fragmentos **con su fuente**. Cableado en `routes_analysis.py`: funcional (`:1301`), longevidad (`:1419`), protocolo (`:1767/1825`) y chat (`:2188`). El **tradicional** usa `web_search="mx"` en vez de KB. Degrada seguro: si falta `VOYAGE_API_KEY`, todo sigue **sin** RAG (`embeddings_disponibles()`).
4. **Código de ingesta/chunking/embedding/retrieval**: todo en `knowledge_base.py` (`extraer_paginas`, `fragmentar`, `embed_textos`, `embed_consulta`, `consultar_biblioteca`) + `routes_kb.py` (subida) + tablas `kb_documents`/`kb_chunks` (pgvector).
5. **Citas de fuentes**: el tradicional tiene campo `"fuentes"` en el JSON (`system_prompt.py:1191`), restringido a guías reconocidas o web verificada. El funcional/longevidad reciben los fragmentos del KB con su fuente para citar. **Matiz**: si la biblioteca está vacía o sin `VOYAGE_API_KEY`, el "grounding" real desaparece y queda conocimiento paramétrico de Claude.

---

## 4. Flujo de una consulta

1. **Traza**: el frontend llama `POST /analyze/{visit_id}/<paso>` → `routes_analysis.py` construye el prompt con `system_prompt.py` (lee **la visita y el paciente desde Supabase** por `visit_id`, más KB/entitlements) → `call_claude[_stream]` (`:534/:596`) → mide tokens (`_usage_tokens` `:527`, `_consume_ai`) → guarda en `ai_call_logs` (`db.insert_ai_call_log`) → responde JSON o SSE al frontend.
2. **Input**: los modelos Pydantic del request son **ligeros** — pasan texto confirmado por el médico + `patient_id` (`FunctionalRequest`, `LongevityRequest`, `ProtocolRequest`, `ClarifyFunctionalRequest`, `:124-176`). **Los "7 bloques" NO viajan en el request**: se capturan al crear la visita (`routes_visits.py`, tabla `visits`) y el análisis los lee de la BD por `visit_id`.
3. **Output**:
   - Tradicional: **JSON estricto** `{"diagnosticos":[{nombre,cie10,confianza,por_que_confianza,resumen_breve,explicacion_completa,fuentes,estudios_sugeridos,es_complicacion_de}], "alertas_clinicas":[]}` (`system_prompt.py:1182+`).
   - Funcional/Longevidad: **texto con secciones** `═══ ... ═══` (RAÍZ, LÍNEA DE TIEMPO (ATM), NODOS DESREGULADOS, HISTORIA DEL PACIENTE, EDAD BIOLÓGICA, etc.).
   - Protocolo: **JSON** `{"items":[...], "monitoreo_general":{...,"plan_por_fases":[...]}}`.
4. **Criterio de parada de preguntas**: por **rondas topadas**, no por umbral de confianza. Convencional `clarify` se recorta a `[:5]` (1 ronda); funcional/longevidad hasta **2 rondas** (`funcRound>=2`/`longRound>=2` fuerzan el diagnóstico). El LLM devuelve `[]` cuando ya tiene suficiente.
5. **¿Preguntas dinámicas?**: **sí, reales** — la IA genera preguntas por caso (`clarify`, `clarify_functional`, `clarify_longevity`), el médico responde y se re-alimentan. **Además** hay captura fija (formulario de visita) y un banco de preguntas configurable. Es híbrido.
6. **Árbol de decisión/reglas duras**: **lo decide el LLM** casi todo. Reglas duras solo en: gating de entitlements, orden de rutas y reglas clínicas **dentro del prompt** (jerarquía raíz-antes-que-síntoma, rangos, ATM, capas). No hay motor de reglas clínicas ni árbol formal.
7. **Protocolos de 3 niveles**: los **genera Claude** (`get_protocol_prompt`), uno por tipo (tradicional/funcional/longevidad), en JSON. No son templates fijos.

---

## 5. Datos, Supabase, auth, llaves

1. **Migración a Supabase: prácticamente completa.** 30 tablas en `public` (consulta al esquema): `patients, visits, analyses, appointments, appointment_blocks, location_hours, locations, clinics, clinic_services, clinic_questionnaires, doctor_profiles, doctor_preferences, clinical_baselines, medications_db, kb_documents, kb_chunks, ai_call_logs, usage_events, prescription_log, deletion_requests, support_tickets, support_ticket_messages, team_messages, sales, expenses, marketing_results, patient_notes, question_presets, user_locations, users, change_log`.
2. **Datos in-memory: no encontré** dicts/listas globales como almacén (grep sin resultados). Todo persiste en Supabase. (⚠️ contradice a `README.md`, que dice "BD: In-memory".)
3. **Autenticación**: **Supabase Auth con verificación de firma asimétrica ES256 vía JWKS** — `backend/auth.py`: `JWKS_URL=.../.well-known/jwks.json` (:19), `PyJWKClient` (:29), `jwt.decode(..., algorithms=["ES256"])` (:40-43). `get_actor` resuelve rol/clínica. Hay un fallback de dev solo si `APEX_DEV_AUTH_FALLBACK=1` (:23). Login por usuario sin correo (`main.py:/auth/resolve-username`).
4. **API keys de Anthropic**: por **variable de entorno** `ANTHROPIC_API_KEY` (el SDK `Anthropic()` la lee sola). En dev, `setup_api_key.sh` la escribe a `backend/.env.local` (que está en `.gitignore`). En prod vive en las env vars de Render. **No** en BD ni keychain. `setup_api_key.sh` línea a línea: imprime instrucciones → `read -p "API Key:"` → valida prefijo `sk-ant-` → `echo "ANTHROPIC_API_KEY=$API_KEY" > backend/.env.local` → `export` en la sesión → mata proceso previo → arranca el backend. Persiste en un archivo de texto plano local (permisos del usuario), **gitignoreado**.
5. **Logs de auditoría de acceso a datos**: parcial. `ai_call_logs` (prompt/respuesta/latencia por `visit_id`+`step`), `usage_events` (acción, tokens, status, rol, clínica), `change_log`, `prescription_log`. Hay trazabilidad **prompt→diagnóstico**. No vi un log dedicado de "quién LEYÓ el expediente" (solo escrituras/entradas relevantes en `usage_logger`, `main.py:47`).

---

## 6. Frontend (detalle)

1. **`apex-*.html`**: `apex-home/-ficha/-nuevo-paciente/-visita/-analisis/-clinica/-help` — prototipo **V1 legacy** (raíz y `V1/`). No los usa el app actual.
2. **Framework y JS**: Next.js 14 (App Router) + React 18 + TypeScript. Páginas en `frontend/app/**` (dashboard, admin, auth). No es vanilla/Alpine; el V1 sí tenía JS embebido.
3. **Petición al backend**: `fetch(url, {headers: authH()})` con `NEXT_PUBLIC_BACKEND_URL`; diagnósticos por SSE en `streamSSE` (`analysis/page.tsx:2582`).
4. **Estados de carga/error/timeouts largos**: sí — `setStep('loading')` con etiquetas, banners de error (`{error && ...}`), y streaming que evita el timeout de request. (Justo se endureció el manejo de 402/errores para no perder el cuestionario.)
5. **Cascada visual**: sí, diferenciada por color y secciones por tipo (tradicional/funcional/longevidad) con render estructurado (`ProtocolStructuredView`, `CausalityFlow`, secciones `═══`).
6. **Chat doctor-IA**: **request/response** (`POST /analyze/{visit_id}/{step}/chat`, `routes_analysis.py:2096`), no streaming.
7. **Disclaimer**: **sí, visible en toda sugerencia** — `AIDisclaimer` (`analysis/page.tsx:2190`): *"Generado con apoyo de IA — no sustituye el criterio médico. El médico tratante revisa, valida y acepta…"*, renderizado en `:3221`.

---

## 7. Testing, seguridad, cumplimiento

1. **Tests: NO hay.** Sin `test_*.py`, `*_test.py`, `tests/`, `__tests__/`, ni `.github/workflows/`.
2. **Plan de testing**: `STATUS.md` marca "TESTING 20%" pero es doc obsoleto; no hay suite ni plan accionable en el repo.
3. **Validación de inputs**: tipos vía Pydantic; **sin** límites de tamaño/sanitización explícitos para texto libre del paciente.
4. **PII/PHI**: se guarda en Supabase (Postgres gestionado: cifrado en reposo por el proveedor, TLS en tránsito). **No hay cifrado a nivel de campo** en la app. RBAC en `access.py` (solo `doctor` ve historial; `filter_patient`/`filter_write`).
5. **Rate limiting**: **NO** (sin slowapi/limiter/throttle).
6. **Disclaimer/consentimiento/regulatorio**: hay **disclaimer clínico** (§6.7). **No hay** consentimiento informado, ni textos HIPAA/GDPR/LFPDPPP/SaMD en código; solo una mención de "HIPAA compliance" como pendiente en `ARCHITECTURE_ANALYSIS.md:294`.
7. **Diagnóstico peligroso**: guardrails **blandos** — reglas de cautela en los prompts (crisis/valores críticos), un paso de **validación secundaria** con Haiku (`MODEL_VALIDATE`), el disclaimer y el **médico en el loop** (confirma cada etapa). No hay filtro/clasificador dedicado de salidas peligrosas.
8. **Trazabilidad prompt→diagnóstico**: **sí**, en `ai_call_logs` (por visita y paso).

---

## 8. Costos y escalabilidad

1. **Tracking de tokens**: sí — `_usage_tokens` (input+output), guardado en `ai_call_logs` y `usage_events`, y descontado de `clinics.ai_credits`/`ai_credits_used` (`services/plans.py`, `services/usage.py`).
2. **Costo por análisis (estimado)**: un caso completo consume ~100k–250k tokens repartidos entre Opus (diagnóstico), Sonnet (protocolos/borrador) y Haiku (validación/chat). A tarifas Opus $5/$25 y Sonnet $3/$15 por 1M, da un rango aproximado de **~$0.5–$2 USD por paciente completo** (estimación, no medida exacta; depende de thinking, longitud y nº de rondas). Evidencia de magnitud: `usage_events` con `protocol_traditional`=23,644 tok, `finalize_traditional`=16,924, `clarify_functional`=12,069, etc.
3. **Caching**: **no** — cada análisis llama a Claude desde cero; no vi prompt caching (`cache_control`) configurado.
4. **Streaming**: **sí** en diagnósticos (`call_claude_stream` + endpoints `/stream` + SSE).
5. **Sin créditos de Anthropic/clínica**: el gate por clínica devuelve **402** (`plans.require_ai`) y el frontend ahora muestra mensaje claro + "solicitar recarga". **No hay fallback** a otro modelo/proveedor si se agota la cuenta Anthropic real.
6. **Concurrencia**: FastAPI async + `BackgroundTasks` (subida KB, extracción de labs) + `ThreadPoolExecutor` (usage logging, timeout de query KB). **No hay** colas/workers (Celery/RQ). Escala vía workers de Render + Supabase.
7. **Almacenamiento de historiales**: en Postgres (Supabase); crece linealmente por visita/análisis. Sin particionado ni archivado definido.

---

## 9. Documentación vs. realidad

- **Contradicciones (docs obsoletos)**: `README.md`/`STATUS.md` (junio 2026) dicen *"BD: In-memory (pronto Supabase)"*, *"DEPLOYMENT 0%"*, *"Python 3.13"*, *"Testing 20%"*. La realidad del código: **Supabase completo (30 tablas), desplegado (Render+Vercel), Python 3.11.9, 0 tests**. El código va **muy por delante** de sus propios docs.
- **Completo vs. stub**: **real y funcionando** — cascada de diagnóstico, protocolos, RAG, auth ES256, entitlements/créditos, agenda, sala de espera, banco de preguntas, admin de proveedor. **Ausente/stub** — tests, cumplimiento legal/consentimiento, fallback de IA, caching. **Muerto** — `services/claude_analysis.py`, `V1/` y `apex-*.html` de raíz.
- **`APEX_Documento_Maestro_v2.txt` (visión original)**: "SaaS de inteligencia clínica **solo para médicos… No es un chatbot con RAG**… CRM + expediente + motor de diagnóstico + protocolos… copiloto, el médico decide". La implementación **cumple** el núcleo (copiloto, cascada, expediente, protocolos) y **se desvió a favor de agregar RAG** como grounding — contradice la frase "no es un chatbot con RAG", pero es coherente con "admite cuando no sabe y dice de dónde viene la info". La visión de "bibliografía integrada en el razonamiento" está **parcialmente** lograda (depende de que la biblioteca esté cargada).
- **`contexto1.1.txt` (148KB) y `conversación completa 2.txt` (131KB)**: son **transcripciones/notas de desarrollo** (planeación temprana), no specs ni código en uso.
- **TODO/FIXME**: prácticamente **no hay** marcadores de deuda en el código (los "TODO" que aparecen son la palabra española "todo" = "todos", falsos positivos).

---

## 10. Evaluación honesta

1. **¿Medicina funcional basada en evidencia con trazabilidad a libros, o texto plausible?**
   La **infraestructura existe** (RAG Voyage+pgvector, citas), pero el grounding real **solo ocurre si el médico cargó libros Y `VOYAGE_API_KEY` está configurada**. Sin eso, es conocimiento paramétrico de Claude (+ web search en el tradicional). Hoy: *puede* fundamentar con libros, pero **no está garantizado por defecto**.
2. **¿Preguntas adaptativas o formulario fijo?**
   **Ambas, reales**: captura estructurada fija (7 bloques) **+** rondas de preguntas generadas por la IA por caso (hasta 2 rondas en funcional/longevidad). No es solo un formulario.
3. **¿Confiable para un médico no experto en funcional?**
   Con reservas. Hay **médico en el loop + disclaimer + validación secundaria (Haiku)**, pero **sin tests, sin validación clínica independiente, sin guardrails duros**. El output es sugerencia que **exige revisión del médico**; no es autónomo ni auditado clínicamente.
4. **Gap más grande README vs código**:
   El README está **groseramente desactualizado** (describe un MVP in-memory sin RAG ni deploy). El gap real es inverso: **el código supera al README**. El gap de *producto* relevante es: **falta de pruebas, de cumplimiento/consentimiento y de garantía de grounding** (RAG opcional/vacío por defecto).
5. **Top 3 para pasar de MVP a producto de clínica real**:
   1. **Seguridad clínica y pruebas**: suite de tests (unit + de prompts/regresión de salidas) y guardrails duros sobre el output (validación estructurada + reglas de valores críticos), porque hoy no hay red de seguridad automatizada.
   2. **Cumplimiento y privacidad**: consentimiento informado, aviso de privacidad (LFPDPPP en México), política de retención/borrado y log de **lecturas** de PHI; hoy solo hay disclaimer y RBAC.
   3. **Grounding garantizado ("evidencia de verdad")**: sembrar la biblioteca base, exigir `VOYAGE_API_KEY` en prod y **forzar citas** cuando el KB tiene material, para que "basado en evidencia" sea real y no opcional.

---
*Auditoría generada por exploración directa del repo. Donde algo no existe, se indicó explícitamente ("no hay …").*
