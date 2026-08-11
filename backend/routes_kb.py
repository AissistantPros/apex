"""
Biblioteca clínica del médico (RAG).

El médico sube sus libros y guías; el sistema los indexa y los usa para fundamentar las
recomendaciones de medicina funcional y de longevidad, citando la fuente.
"""
import base64
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Header, BackgroundTasks, File, Form, UploadFile
from pydantic import BaseModel

from auth import get_doctor_id_from_token
from db import (
    create_kb_document, update_kb_document, list_kb_documents, delete_kb_document,
    insert_kb_chunks, search_kb,
)
from services.knowledge_base import (
    extraer_paginas, fragmentar, embed_textos, embed_consulta,
    embeddings_disponibles, formatear_fragmentos, es_pdf_escaneado, ocr_pdf,
)

router = APIRouter(prefix="/kb", tags=["knowledge-base"])


async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    return get_doctor_id_from_token(authorization) or "550e8400-e29b-41d4-a716-446655440000"


class UploadRequest(BaseModel):
    titulo: str
    autor: str = ""
    tipo: str = "libro"          # libro | guia | paper | protocolo | notas
    area: str = "general"        # functional | longevity | traditional | general
    archivo: str                 # nombre del archivo
    data: str                    # contenido en base64 (data URL o crudo)


class SearchRequest(BaseModel):
    consulta: str
    area: str = ""
    limite: int = 8


def _procesar_documento(doc_id: str, raw: bytes, nombre: str):
    """Extrae, fragmenta, genera embeddings e indexa. Corre en segundo plano porque un libro
    de 500 páginas puede tardar varios minutos."""
    try:
        paginas = extraer_paginas(raw, nombre)

        # Si el PDF viene escaneado (páginas como imagen), se le hace OCR automáticamente
        # con la visión de Claude — sin pedirle nada al médico.
        es_pdf = (nombre or "").lower().endswith(".pdf")
        if es_pdf and es_pdf_escaneado(paginas):
            update_kb_document(doc_id, {
                "estado": "procesando",
                "error_msg": "PDF escaneado detectado — transcribiendo con OCR, puede tardar varios minutos…",
            })

            def _avance(hechas, total):
                update_kb_document(doc_id, {
                    "error_msg": f"OCR en curso: {hechas}/{total} páginas transcritas…"
                })

            paginas, err_ocr = ocr_pdf(raw, progreso=_avance)
            if err_ocr:
                update_kb_document(doc_id, {"estado": "error",
                                            "error_msg": f"OCR fallido: {err_ocr}"})
                return
            print(f"[KB] OCR completado en '{nombre}': {len(paginas)} páginas con texto")

        if not paginas:
            update_kb_document(doc_id, {
                "estado": "error",
                "error_msg": "No se pudo extraer texto del documento.",
            })
            return

        chunks = fragmentar(paginas)
        if not chunks:
            update_kb_document(doc_id, {"estado": "error", "error_msg": "El documento no tiene texto aprovechable."})
            return

        vectores, err_embed = embed_textos([c["contenido"] for c in chunks], tipo="document")
        if err_embed:
            # Traducir el error técnico a algo que el médico pueda accionar
            if "rate" in err_embed.lower() or "429" in err_embed:
                mensaje = (
                    "Límite de velocidad de Voyage alcanzado. La cuenta sin método de pago está "
                    "limitada a 3 peticiones y 10,000 tokens por minuto, insuficiente para un libro. "
                    "Agrega una tarjeta en dashboard.voyageai.com → Billing: los 200 millones de "
                    "tokens gratuitos se conservan, solo se desbloquean los límites normales."
                )
            else:
                mensaje = f"Fallo al generar los embeddings: {err_embed}"
            update_kb_document(doc_id, {"estado": "error", "error_msg": mensaje})
            return

        filas = []
        for i, (c, v) in enumerate(zip(chunks, vectores)):
            if v is None:
                continue
            filas.append({
                "document_id": doc_id,
                "chunk_index": i,
                "pagina": c.get("pagina"),
                "contenido": c["contenido"],
                "embedding": v,
                "tokens": len(c["contenido"]) // 4,
            })

        if not filas:
            update_kb_document(doc_id, {
                "estado": "error",
                "error_msg": f"Se extrajeron {len(chunks)} fragmentos pero ninguno obtuvo embedding válido.",
            })
            return

        insertados, err = insert_kb_chunks(filas)
        update_kb_document(doc_id, {
            "estado": "listo" if insertados else "error",
            "n_chunks": insertados,
            "paginas": len(paginas),
            # Mostrar el error REAL de la base, no un mensaje genérico que no se puede depurar
            "error_msg": None if insertados else (
                f"No se pudo indexar ningún fragmento. Error de la base: {err}" if err
                else "No se pudo indexar ningún fragmento."
            ),
        })
        print(f"[KB] '{nombre}': {len(paginas)} páginas → {insertados} fragmentos indexados")

    except Exception as e:
        print(f"[ERROR] procesando documento {doc_id}: {e}")
        update_kb_document(doc_id, {"estado": "error", "error_msg": str(e)[:400]})


@router.get("/status")
async def kb_status():
    """¿Está lista la biblioteca para usarse?"""
    docs = list_kb_documents()
    return {
        "embeddings_configurados": embeddings_disponibles(),
        "documentos": len(docs),
        "listos": len([d for d in docs if d.get("estado") == "listo"]),
        "fragmentos": sum(d.get("n_chunks") or 0 for d in docs),
    }


@router.get("/diagnostico")
async def kb_diagnostico():
    """Prueba la cadena completa (embedding → guardar → borrar) y reporta dónde falla.
    Sirve para dejar de adivinar cuándo la indexación no funciona."""
    pasos = {}

    pasos["1_embeddings_configurados"] = embeddings_disponibles()
    if not embeddings_disponibles():
        return {"ok": False, "pasos": pasos, "diagnostico": "Falta VOYAGE_API_KEY en el backend"}

    vectores, err = embed_textos(["Prueba de conexión con el proveedor de embeddings."], tipo="document")
    vector = vectores[0] if vectores and vectores[0] is not None else None
    pasos["2_voyage_responde"] = vector is not None
    pasos["2_error"] = err
    pasos["2_dimensiones"] = len(vector) if vector else None
    if vector is None:
        return {"ok": False, "pasos": pasos, "diagnostico": f"Voyage no respondió: {err}"}
    if len(vector) != 1024:
        return {"ok": False, "pasos": pasos,
                "diagnostico": f"El modelo devuelve {len(vector)} dimensiones pero la tabla espera 1024"}

    doc = create_kb_document({"titulo": "__diagnostico__", "tipo": "notas",
                              "area": "general", "estado": "procesando"})
    pasos["3_documento_creado"] = bool(doc)
    if not doc:
        return {"ok": False, "pasos": pasos, "diagnostico": "No se pudo escribir en kb_documents"}

    insertados, err_ins = insert_kb_chunks([{
        "document_id": doc["id"], "chunk_index": 0, "pagina": 1,
        "contenido": "Fragmento de prueba.", "embedding": vector, "tokens": 5,
    }])
    pasos["4_fragmento_guardado"] = insertados == 1
    pasos["4_error"] = err_ins
    delete_kb_document(doc["id"])

    ok = insertados == 1
    return {
        "ok": ok, "pasos": pasos,
        "diagnostico": "Todo funciona: la biblioteca puede indexar." if ok
                       else f"Falla al guardar el vector en la base: {err_ins}",
    }


@router.get("/documents")
async def kb_list():
    return {"documents": list_kb_documents()}


@router.post("/upload")
async def kb_upload(body: UploadRequest, background_tasks: BackgroundTasks,
                    doctor_id: str = Depends(get_doctor_id)):
    """Sube un libro o guía. La indexación corre en segundo plano."""
    if not embeddings_disponibles():
        raise HTTPException(
            400,
            "Falta configurar el proveedor de embeddings. Define la variable de entorno "
            "VOYAGE_API_KEY en el backend para poder indexar la biblioteca."
        )

    payload = body.data or ""
    if payload.startswith("data:"):
        try:
            payload = payload.split(",", 1)[1]
        except (ValueError, IndexError):
            raise HTTPException(400, "El archivo no se pudo leer")
    try:
        raw = base64.b64decode(payload)
    except Exception:
        raise HTTPException(400, "El archivo no está en base64 válido")

    if not raw:
        raise HTTPException(400, "El archivo está vacío")

    doc = create_kb_document({
        "titulo": body.titulo.strip() or body.archivo,
        "autor": body.autor.strip() or None,
        "tipo": body.tipo,
        "area": body.area,
        "archivo": body.archivo,
        "estado": "procesando",
        "doctor_id": doctor_id,
    })
    if not doc:
        raise HTTPException(500, "No se pudo registrar el documento")

    background_tasks.add_task(_procesar_documento, doc["id"], raw, body.archivo)
    return {"ok": True, "document": doc,
            "mensaje": "Indexando en segundo plano. Puede tardar varios minutos en un libro grande."}


@router.post("/upload_file")
async def kb_upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    titulo: str = Form(""),
    autor: str = Form(""),
    tipo: str = Form("libro"),
    area: str = Form("general"),
    doctor_id: str = Depends(get_doctor_id),
):
    """Subida por multipart — la vía correcta para libros grandes.
    Base64 en JSON infla el archivo ~33% (un PDF de 22 MB se vuelve una petición de 30 MB
    y se cae). Multipart manda los bytes tal cual."""
    if not embeddings_disponibles():
        raise HTTPException(
            400,
            "Falta configurar el proveedor de embeddings. Define VOYAGE_API_KEY en el backend."
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "El archivo está vacío")

    nombre = file.filename or "documento.pdf"
    doc = create_kb_document({
        "titulo": (titulo or "").strip() or nombre,
        "autor": (autor or "").strip() or None,
        "tipo": tipo,
        "area": area,
        "archivo": nombre,
        "estado": "procesando",
        "doctor_id": doctor_id,
    })
    if not doc:
        raise HTTPException(500, "No se pudo registrar el documento")

    background_tasks.add_task(_procesar_documento, doc["id"], raw, nombre)
    return {"ok": True, "document": doc,
            "mensaje": "Indexando en segundo plano. Puede tardar varios minutos en un libro grande."}


@router.delete("/documents/{doc_id}")
async def kb_delete(doc_id: str, doctor_id: str = Depends(get_doctor_id)):
    return {"ok": delete_kb_document(doc_id)}


@router.post("/search")
async def kb_search(body: SearchRequest):
    """Búsqueda semántica — útil para probar la biblioteca desde la interfaz."""
    if not embeddings_disponibles():
        raise HTTPException(400, "Embeddings no configurados (falta VOYAGE_API_KEY)")
    vector = embed_consulta(body.consulta)
    if not vector:
        raise HTTPException(500, "No se pudo generar el embedding de la consulta")
    fragmentos = search_kb(vector, match_count=body.limite, area=body.area or None)
    return {"fragmentos": fragmentos, "bloque": formatear_fragmentos(fragmentos)}
