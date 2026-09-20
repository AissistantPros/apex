"""
Supabase client y helpers para APEX
"""
import os
import datetime as _dt
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Cliente con service role (puede escribir en cualquier tabla)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_supabase() -> Client:
    """Retorna el cliente Supabase"""
    return supabase

# Helpers para operaciones comunes
def insert_patient(patient_data: dict) -> dict:
    """Inserta un paciente y retorna el resultado"""
    result = supabase.table("patients").insert(patient_data).execute()
    return result.data[0] if result.data else None

def check_duplicate_patients(first_name: str, last_name: str, date_of_birth: str) -> list:
    """Busca pacientes con mismo nombre y fecha de nacimiento (case-insensitive)"""
    fn = first_name.strip().lower()
    ln = last_name.strip().lower()
    result = supabase.table("patients").select(
        "id, full_name, first_name, last_name, date_of_birth, birth_date, registration_phase, created_at"
    ).ilike("first_name", fn).ilike("last_name", ln).execute()
    if not result.data:
        return []
    # Filtrar por fecha de nacimiento
    matches = [
        p for p in result.data
        if (p.get("date_of_birth") or p.get("birth_date") or "").startswith(date_of_birth)
    ]
    return matches

def list_patients(doctor_id: str = None, limit: int = 50) -> list:
    """Lista todos los pacientes"""
    query = supabase.table("patients").select("id, full_name, first_name, last_name, date_of_birth, birth_date, email, phone, created_at").order("created_at", desc=True).limit(limit)
    result = query.execute()
    return result.data if result.data else []

def get_patient(patient_id: str) -> dict:
    """Obtiene un paciente por ID"""
    result = supabase.table("patients").select("*").eq("id", patient_id).execute()
    return result.data[0] if result.data else None

def update_patient(patient_id: str, data: dict) -> dict:
    """Actualiza un paciente"""
    result = supabase.table("patients").update(data).eq("id", patient_id).execute()
    return result.data[0] if result.data else None

def list_patient_visits(patient_id: str) -> list:
    """Lista todas las visitas de un paciente"""
    result = supabase.table("visits").select("*").eq("patient_id", patient_id).order("created_at", desc=True).execute()
    return result.data if result.data else []

def insert_visit(visit_data: dict) -> dict:
    """Inserta una visita"""
    result = supabase.table("visits").insert(visit_data).execute()
    return result.data[0] if result.data else None

def get_visit(visit_id: str) -> dict:
    """Obtiene una visita por ID"""
    result = supabase.table("visits").select("*").eq("id", visit_id).execute()
    return result.data[0] if result.data else None

def update_visit(visit_id: str, data: dict) -> dict:
    """Actualiza una visita"""
    result = supabase.table("visits").update(data).eq("id", visit_id).execute()
    return result.data[0] if result.data else None

def get_doctor_profile(doctor_id: str) -> dict:
    result = supabase.table("doctor_profiles").select("*").eq("id", doctor_id).execute()
    return result.data[0] if result.data else None

def upsert_doctor_profile(doctor_id: str, data: dict) -> dict:
    data["id"] = doctor_id
    data["updated_at"] = __import__('datetime').datetime.utcnow().isoformat()
    result = supabase.table("doctor_profiles").upsert(data).execute()
    return result.data[0] if result.data else None

def add_patient_note(patient_id: str, visit_id: str | None, author_role: str, author_name: str,
                     content: str, audiencia: str = "general") -> dict:
    """Agrega una nota con timestamp, autor y audiencia (general | nurse | doctor)"""
    import uuid
    from datetime import datetime
    data = {
        "id": uuid.uuid4().hex,
        "patient_id": patient_id,
        "visit_id": visit_id,
        "author_role": author_role,
        "author_name": author_name,
        "content": content,
        "audiencia": audiencia if audiencia in ("general", "nurse", "doctor") else "general",
        "created_at": datetime.utcnow().isoformat(),
    }
    result = supabase.table("patient_notes").insert(data).execute()
    return result.data[0] if result.data else None

def get_patient_notes(patient_id: str) -> list:
    """Lista todas las notas de un paciente, en orden cronológico"""
    result = supabase.table("patient_notes").select("*").eq("patient_id", patient_id).order("created_at", desc=False).execute()
    return result.data if result.data else []

def delete_patient_note(note_id: str) -> bool:
    """Elimina una nota por ID"""
    supabase.table("patient_notes").delete().eq("id", note_id).execute()
    return True

def insert_analysis(analysis_data: dict) -> dict:
    """Inserta un análisis"""
    result = supabase.table("analyses").insert(analysis_data).execute()
    return result.data[0] if result.data else None

def get_analysis(visit_id: str) -> dict:
    """Obtiene el análisis de una visita"""
    result = supabase.table("analyses").select("*").eq("visit_id", visit_id).execute()
    return result.data[0] if result.data else None

def update_analysis(visit_id: str, data: dict) -> dict:
    """Actualiza un análisis"""
    result = supabase.table("analyses").update(data).eq("visit_id", visit_id).execute()
    return result.data[0] if result.data else None

def list_patient_analyses(patient_id: str) -> list:
    """Análisis (diagnósticos + protocolos/recetas confirmados) de TODAS las visitas del
    paciente. Sirve para dar SEGUIMIENTO: qué se le diagnosticó, qué tratamiento/medicamentos
    y qué estudios se le indicaron en visitas anteriores."""
    if not patient_id:
        return []
    result = supabase.table("analyses").select(
        "visit_id, doctor_traditional, doctor_functional, doctor_longevity, "
        "protocol_traditional, protocol_functional, protocol_longevity, updated_at"
    ).eq("patient_id", patient_id).execute()
    return result.data if result.data else []

def insert_ai_call_log(data: dict) -> dict:
    """Registra una llamada a la IA (prompt/respuesta/latencia) para poder auditarla después"""
    result = supabase.table("ai_call_logs").insert(data).execute()
    return result.data[0] if result.data else None

def list_ai_call_logs(visit_id: str) -> list:
    """Lista las llamadas a la IA de una visita, en orden cronológico"""
    result = supabase.table("ai_call_logs").select("*").eq("visit_id", visit_id).order("created_at", desc=False).execute()
    return result.data if result.data else []


# ── Preferencias del médico y registro de práctica ────────────────────────────
# El sistema se adapta al médico, no al revés: lo que él receta, edita o pide recordar
# tiene prioridad sobre lo que la IA propone por defecto.

def save_doctor_preference(pref: dict) -> dict:
    """Guarda una preferencia explícita del médico ('recuérdalo para casos futuros')."""
    try:
        result = supabase.table("doctor_preferences").insert(pref).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"[WARN] no se pudo guardar la preferencia: {e}")
        return None


def get_doctor_preferences(doctor_id: str) -> list:
    """Preferencias activas del médico, las más usadas primero."""
    if not doctor_id:
        return []
    try:
        result = (supabase.table("doctor_preferences").select("*")
                  .eq("doctor_id", doctor_id).eq("activa", True)
                  .order("veces_aplicada", desc=True).limit(60).execute())
        return result.data if result.data else []
    except Exception as e:
        print(f"[WARN] no se pudieron leer las preferencias: {e}")
        return []


def deactivate_doctor_preference(pref_id: str) -> bool:
    try:
        supabase.table("doctor_preferences").update(
            {"activa": False, "updated_at": _dt.datetime.utcnow().isoformat()}
        ).eq("id", pref_id).execute()
        return True
    except Exception as e:
        print(f"[WARN] no se pudo desactivar la preferencia: {e}")
        return False


def log_prescriptions(rows: list) -> int:
    """Registra qué aceptó/agregó/quitó el médico. PRIVACIDAD: estas filas NO llevan
    identificador de paciente — solo el contexto clínico y el tratamiento."""
    if not rows:
        return 0
    try:
        supabase.table("prescription_log").insert(rows).execute()
        return len(rows)
    except Exception as e:
        print(f"[WARN] no se pudo registrar la práctica: {e}")
        return 0


def get_prescription_stats(doctor_id: str, limit: int = 40) -> list:
    """Lo que este médico más receta y en qué contexto — para personalizar sus protocolos."""
    if not doctor_id:
        return []
    try:
        result = (supabase.table("prescription_log").select("*")
                  .eq("doctor_id", doctor_id)
                  .order("created_at", desc=True).limit(600).execute())
        rows = result.data or []
    except Exception as e:
        print(f"[WARN] no se pudieron leer las estadísticas de práctica: {e}")
        return []

    agg = {}
    for r in rows:
        name = (r.get("item_nombre") or "").strip()
        if not name:
            continue
        key = name.lower()
        a = agg.setdefault(key, {
            "item_nombre": name, "item_tipo": r.get("item_tipo"),
            "aceptado_ia": 0, "agregado_doctor": 0, "eliminado_doctor": 0,
            "contextos": set(),
        })
        accion = r.get("accion")
        if accion in a:
            a[accion] += 1
        ctx = (r.get("diagnostico_contexto") or "").strip()
        if ctx:
            a["contextos"].add(ctx[:80])

    out = []
    for a in agg.values():
        a["contextos"] = sorted(a["contextos"])[:3]
        a["total"] = a["aceptado_ia"] + a["agregado_doctor"]
        out.append(a)
    out.sort(key=lambda x: (x["agregado_doctor"], x["total"]), reverse=True)
    return out[:limit]


# ── Vademécum (medications_db) ────────────────────────────────────────────────
# Fuente de verdad curada para que la voz de conciencia pueda responder
# "¿hay una mejor versión de lo que estás mandando?" con un dato duro, no con opinión.

import re as _re
import time as _time
import difflib as _difflib

_VADEMECUM_CACHE = {"data": None, "ts": 0.0}
_VADEMECUM_TTL = 600  # 10 min


def _load_vademecum() -> list:
    """Carga (y cachea) el vademécum completo. Es una tabla chica: traerla entera y hacer
    el match en Python es más robusto que armar filtros ILIKE, porque los nombres reales
    vienen con calificadores ('Vitamina D3 (colecalciferol)') que rompen el match por
    substring en una sola dirección."""
    now = _time.time()
    if _VADEMECUM_CACHE["data"] is not None and (now - _VADEMECUM_CACHE["ts"]) < _VADEMECUM_TTL:
        return _VADEMECUM_CACHE["data"]
    try:
        result = supabase.table("medications_db").select("*").execute()
        data = result.data if result.data else []
        _VADEMECUM_CACHE["data"] = data
        _VADEMECUM_CACHE["ts"] = now
        return data
    except Exception as e:
        print(f"[WARN] no se pudo cargar el vademécum: {e}")
        return _VADEMECUM_CACHE["data"] or []


# Palabras que no distinguen un fármaco de otro: se ignoran al comparar.
_STOPWORDS = {
    "vitamina", "vitamin", "acido", "acid", "de", "del", "la", "el", "y", "and", "con",
    "mg", "mcg", "ui", "iu", "gr", "g", "ml", "tableta", "tablet", "capsula", "capsule",
    "oral", "sc", "iv", "im", "liberacion", "prolongada", "xr", "er", "sr", "monohidrato",
    "hcl", "clorhidrato", "sal", "elemental", "extracto", "extract", "puro", "pure",
}


def _norm(s: str) -> str:
    """Normaliza para comparar: minúsculas, sin paréntesis, sin acentos, sin puntuación.
    Además acerca cognados español/inglés recortando terminaciones típicas del español
    ('metformina'→'metformin', 'creatina'→'creatin') para que 'Metformin' del LLM haga
    match con 'Metformina' del vademécum."""
    s = (s or "").lower()
    s = _re.sub(r"\([^)]*\)", " ", s)            # quita "(colecalciferol)", "(MK-7)"
    for a, b in (("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ü","u"),("ñ","n")):
        s = s.replace(a, b)
    s = _re.sub(r"[^a-z0-9+ ]", " ", s)          # conserva el '+' de "D3 + K2"
    return _re.sub(r"\s+", " ", s).strip()


def _stem(w: str) -> str:
    """Recorta terminaciones para unir cognados ES/EN: metformina/metformin,
    semaglutida/semaglutide, creatina/creatine, colecalciferol/cholecalciferol."""
    if len(w) > 5:
        for suf in ("ina", "ine", "ida", "ide", "ato", "ate", "ol", "a", "e", "o"):
            if w.endswith(suf) and len(w) - len(suf) >= 4:
                return w[: -len(suf)]
    return w


def _tokens(s: str) -> set:
    """Tokens significativos (sin stopwords), con stemming para cognados."""
    return {_stem(t) for t in _norm(s).split() if len(t) > 1 and t not in _STOPWORDS}


def _fuzzy(a: str, b: str) -> float:
    return _difflib.SequenceMatcher(None, a, b).ratio()


def _matches(entry_name: str, query_names: list) -> bool:
    """True si el nombre del vademécum y alguno del protocolo se refieren a lo mismo.
    Tolera: calificadores entre paréntesis, nombres en inglés, faltas de ortografía y
    orden distinto de palabras. El LLM no siempre escribe el nombre igual que la tabla."""
    e_norm = _norm(entry_name)
    if not e_norm or len(e_norm) < 3:
        return False
    e_tok = _tokens(entry_name)

    for q in query_names:
        q_norm = _norm(q)
        if not q_norm or len(q_norm) < 3:
            continue

        # 1) Substring en cualquier dirección (el item suele traer calificadores extra)
        if e_norm in q_norm or q_norm in e_norm:
            return True

        # 2) Cadena completa muy parecida (typos: "metfromina" vs "metformina")
        if _fuzzy(e_norm, q_norm) >= 0.87:
            return True

        # 3) Tokens significativos: todos los del vademécum presentes en el item
        #    (tolera orden distinto y palabras de relleno). Con stemming ES/EN.
        q_tok = _tokens(q)
        if e_tok and q_tok:
            if e_tok <= q_tok or q_tok <= e_tok:
                return True
            # Cada token del vademécum tiene un equivalente en el item: aproximado (typos)
            # o por contención ("glicinat" dentro de "bisglicinat").
            if all(any(_fuzzy(et, qt) >= 0.85 or et in qt or qt in et for qt in q_tok)
                   for et in e_tok):
                return True
    return False


def get_vademecum_by_voice(voz: str, seccion: str = None) -> list:
    """Arsenal que le corresponde a una voz (traditional/functional/longevity).
    seccion opcional: 'clasico' (seguro/consolidado) o 'experimental' (solo informativo)."""
    rows = [r for r in _load_vademecum() if (r.get("voz") or "") == voz]
    if seccion:
        rows = [r for r in rows if (r.get("seccion") or "") == seccion]
    return rows


# ── Base de conocimiento (RAG) ────────────────────────────────────────────────

def create_kb_document(doc: dict) -> dict:
    try:
        r = supabase.table("kb_documents").insert(doc).execute()
        return r.data[0] if r.data else None
    except Exception as e:
        print(f"[WARN] no se pudo crear el documento: {e}")
        return None


def update_kb_document(doc_id: str, data: dict) -> bool:
    try:
        supabase.table("kb_documents").update(data).eq("id", doc_id).execute()
        return True
    except Exception as e:
        print(f"[WARN] no se pudo actualizar el documento: {e}")
        return False


def list_kb_documents() -> list:
    try:
        r = supabase.table("kb_documents").select("*").order("created_at", desc=True).execute()
        return r.data or []
    except Exception as e:
        print(f"[WARN] no se pudieron listar los documentos: {e}")
        return []


def delete_kb_document(doc_id: str) -> bool:
    try:
        supabase.table("kb_documents").delete().eq("id", doc_id).execute()  # cascada a chunks
        return True
    except Exception as e:
        print(f"[WARN] no se pudo borrar el documento: {e}")
        return False


def insert_kb_chunks(rows: list) -> tuple:
    """Inserta fragmentos con su embedding. Devuelve (insertados, ultimo_error).

    pgvector espera el vector en su representación TEXTUAL "[0.1,0.2,...]". Si se manda
    como lista de Python, PostgREST la serializa como arreglo JSON y el INSERT falla.
    Los lotes son chicos porque cada vector de 1024 dimensiones pesa ~20 KB en texto.
    """
    if not rows:
        return 0, None
    total, ultimo_error = 0, None
    for i in range(0, len(rows), 20):
        lote = []
        for r in rows[i:i + 20]:
            fila = dict(r)
            emb = fila.get("embedding")
            if isinstance(emb, (list, tuple)):
                fila["embedding"] = "[" + ",".join(f"{float(x):.7f}" for x in emb) + "]"
            lote.append(fila)
        try:
            supabase.table("kb_chunks").insert(lote).execute()
            total += len(lote)
        except Exception as e:
            ultimo_error = str(e)[:300]
            print(f"[WARN] fallo al insertar fragmentos (lote {i}): {e}")
    return total, ultimo_error


def search_kb(query_embedding: list, match_count: int = 8, area: str = None,
              min_similitud: float = 0.35) -> list:
    """Búsqueda semántica en la biblioteca del médico."""
    if not query_embedding:
        return []
    try:
        r = supabase.rpc("match_kb_chunks", {
            "query_embedding": query_embedding,
            "match_count": match_count,
            "filtro_area": area,
            "min_similitud": min_similitud,
        }).execute()
        return r.data or []
    except Exception as e:
        print(f"[WARN] búsqueda en la biblioteca falló: {e}")
        return []


def get_clinical_baselines(voz: str = None) -> list:
    """Recomendaciones base por edad/sexo/condición — el piso que no se debe omitir."""
    try:
        q = supabase.table("clinical_baselines").select("*").eq("activa", True)
        if voz:
            q = q.eq("voz", voz)
        result = q.execute()
        return result.data if result.data else []
    except Exception as e:
        print(f"[WARN] no se pudieron leer las recomendaciones base: {e}")
        return []


def _aliases(row: dict) -> list:
    """Todos los nombres por los que se puede conocer una entrada: el genérico, cada sinónimo
    y cada marca comercial. Los campos de sinónimos/marcas son LISTAS separadas por comas,
    así que hay que partirlos: 'estatina, Lipitor' son dos alias, no uno."""
    out = []
    for field in ("nombre_generico", "sinonimos", "nombres_comerciales_mx"):
        val = row.get(field) or ""
        for part in str(val).split(","):
            part = part.strip()
            if len(part) >= 3:
                out.append(part)
    return out


def _row_matches(row: dict, names: list) -> bool:
    """True si cualquier alias de la entrada corresponde a alguno de los items del protocolo."""
    return any(_matches(alias, names) for alias in _aliases(row))


def find_medications(names: list) -> list:
    """Fichas del vademécum para los items del protocolo (genérico, sinónimos o marca)."""
    if not names:
        return []
    return [row for row in _load_vademecum() if _row_matches(row, names)]


def _already_present(entry_name: str, query_names: list) -> bool:
    """True solo si alguno de los items del protocolo YA ES esa entrada. Check DIRECCIONAL:
    todos los tokens distintivos de la entrada deben estar en el item. Así 'Vitamina D3'
    NO cuenta como que ya trae 'Vitamina D3 + K2' (le falta el token k2), pero
    'Vitamina D3 + K2 (MK-7)' sí."""
    e_norm = _norm(entry_name)
    if not e_norm or len(e_norm) < 3:
        return False
    e_tok = _tokens(entry_name)
    for q in query_names:
        q_norm = _norm(q)
        if e_norm and e_norm in q_norm:
            return True
        q_tok = _tokens(q)
        # Todos los tokens de la entrada presentes (aprox.) en el item → ya lo trae
        if e_tok and q_tok and all(any(_fuzzy(et, qt) >= 0.85 for qt in q_tok) for et in e_tok):
            return True
    return False


def find_upgrades_for(names: list) -> list:
    """Entradas que son una MEJOR VERSIÓN de alguno de los items del protocolo.
    Es el corazón del chequeo '¿hay algo mejor de lo que estás mandando?'."""
    if not names:
        return []
    vademecum = _load_vademecum()
    # Índice por nombre para resolver `upgrade_de` (texto) a su fila real y poder usar
    # TAMBIÉN sus sinónimos al comparar (ej. upgrade_de='Vitamina D3' cuyo sinónimo es
    # 'colecalciferol' — el LLM puede escribir solo "Cholecalciferol").
    by_name = {_norm(r.get("nombre_generico", "")): r for r in vademecum}

    out = []
    for row in vademecum:
        up = row.get("upgrade_de")
        if not up:
            continue
        # Si el protocolo YA trae la versión mejorada, no hay nada que sugerir.
        # (ej. si ya mandó "Vitamina D3 + K2", no sugerir cambiar D3 por D3+K2)
        if _already_present(row.get("nombre_generico", ""), names):
            continue
        # ¿el item del protocolo ES aquello que esta entrada supera? Se compara contra el
        # nombre del `upgrade_de` y, si esa fila existe, contra TODOS sus alias
        # (sinónimos y marcas), porque el LLM puede escribir la marca en vez del genérico.
        base_row = by_name.get(_norm(up))
        hit = _matches(up, names) or (bool(base_row) and _row_matches(base_row, names))
        if hit:
            out.append({
                "nombre_generico": row.get("nombre_generico"),
                "upgrade_de": up,
                "nota_upgrade": row.get("nota_upgrade"),
                "cofepris": row.get("cofepris"),
                "nivel_evidencia": row.get("nivel_evidencia"),
                "dosis_tipica": row.get("dosis_tipica"),
                "categoria": row.get("categoria"),
            })
    return out
