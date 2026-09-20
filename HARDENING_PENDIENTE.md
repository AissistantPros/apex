# HARDENING PENDIENTE — Multi-tenant (aislamiento entre clínicas)

> Documento de hallazgos. **No se corrigió código**; es la lista de trabajo para una sesión futura de *hardening multi-tenant*.
> Fecha: 2026-09-19.

## 1. Hallazgo concreto (confirmado)
`GET /patients` → `db.list_patients()` (**`backend/db.py:42`**) ejecuta:
```python
supabase.table("patients").select("id, full_name, first_name, last_name, date_of_birth, birth_date, email, phone, created_at")
        .order("created_at", desc=True).limit(limit)
```
**No filtra por `clinic_id` ni `doctor_id`.** Como el backend usa **service role** (RLS bypass, ver §4), la respuesta incluye **pacientes de TODAS las clínicas**. Con una sola clínica no se nota; con varios tenants es una **fuga de datos activa** (una clínica ve pacientes de otra).

El router `routes_patients.get_all_patients` aplica `filter_patient(p, role)` — pero eso filtra **campos por rol**, NO por tenant. No hay filtro por clínica en ninguna capa.

## 2. Patrón general del riesgo
En APEX, **cualquier `.select()` de lectura sin `.eq("clinic_id", …)` / `.eq("doctor_id", …)` explícito devuelve filas de todos los tenants**, porque service role ignora RLS. Los guards por rol (`_require_admin`, `_require_manage`, etc.) controlan *quién entra*, pero **no** *qué clínica ve*. Segundo sub-riesgo: endpoints que reciben un `id`/`patient_id`/`visit_id` y devuelven el registro **sin verificar que pertenezca a la clínica del solicitante** (IDOR: acceso por id ajeno).

## 3. Lista tentativa de endpoints/funciones a auditar
Confirmado:
- **`db.list_patients` → `GET /patients`** — sin filtro de clínica (el hallazgo de §1).

Candidatos con el mismo patrón (leen por `id`/`patient_id`/`visit_id` sin verificar propiedad de la clínica — **a confirmar route por route**, no todos son necesariamente vulnerables):
- `db.get_patient` (`db.py:48`) → `GET /patients/{id}`: trae el paciente por id; `filter_patient` filtra campos, no tenant → posible acceso cross-clínica por id.
- `db.list_patient_visits` (`db.py:58`) → `GET /visits/{patient_id}`: filtra por `patient_id` pero no valida que el paciente sea de tu clínica.
- `db.get_visit` (`db.py:68`) y análisis/registros por visita: `get_analyses_by_visit` (`db.py:121`), `list_ai_call_logs` (`db.py:136`) → scoped por `visit_id`, sin verificar clínica.
- `db.get_patient_notes` (`db.py:106`) → notas por `patient_id`, sin verificar clínica.
- `db.list_kb_documents` (`db.py:369`) → confirmar si la biblioteca se filtra por clínica/doctor.
- `db.list_* de clinical_baselines` (`db.py:435`) → filtra por `activa`; confirmar si los baselines son globales por diseño o deben ser por clínica.

> Nota honesta: solo `/patients` (§1) está **confirmado** como fuga amplia. El resto son **candidatos** detectados por patrón; requieren revisión endpoint por endpoint (algunos routers podrían ya tener un check de clínica que no se ve en `db.py`). No están confirmados como vulnerables.

Contrasta: `routes_appointments.patient_brief` **sí** verifica pertenencia (`p.get("clinic_id") in (clinic, None) or p.get("doctor_id") == clinic`) — es el patrón correcto a replicar.

## 4. Contexto de arquitectura
- El backend se conecta con **service role**: `backend/db.py:12` → `create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)` (comentario textual: *"puede escribir en cualquier tabla"*).
- **RLS no protege nada** en las rutas del backend: el service role la ignora por diseño.
- Por lo tanto, la seguridad multi-tenant **depende 100% del código** (filtros `.eq(...)` explícitos por clínica en cada lectura + verificación de propiedad en accesos por id). Hoy eso no está aplicado de forma uniforme.

## 5. Recomendación
Sesión futura dedicada de **"hardening multi-tenant"**, empezando por lo confirmado y de mayor impacto:
1. **`/patients`**: filtrar `list_patients` por `clinic_id`/`doctor_id` del actor (usar el patrón de `_clinic_of(actor)`).
2. Auditar cada acceso por `id`/`patient_id`/`visit_id` y añadir verificación de pertenencia a la clínica (replicar el check de `patient_brief`).
3. Considerar un helper central `assert_pertenece_a_clinica(recurso, actor)` para no repetir el check y evitar olvidos.
4. (Opcional, defensa en profundidad) Evaluar habilitar RLS con políticas por `clinic_id` y usar una clave con RLS para las lecturas — pero eso es un cambio grande; el fix inmediato y suficiente es el filtro explícito en código.
5. Añadir una prueba por endpoint: "usuario de clínica A no puede leer datos de clínica B".
