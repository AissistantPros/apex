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
    embeddings_disponibles, formatear_fragmentos,
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
        if not paginas:
            update_kb_document(doc_id, {
                "estado": "error",
                "error_msg": "No se pudo extraer texto. Si es un PDF escaneado (imagen), "
                             "necesita OCR previo.",
            })
            return

        # Detección de escaneo parcial: un PDF de texto tiene cientos de caracteres por página.
        # Si el promedio es muy bajo, casi seguro es un escaneo del que solo se leyó el índice
        # o los encabezados, y lo indexado sería basura.
        total_chars = sum(len(t) for _, t in paginas)
        promedio = total_chars / max(len(paginas), 1)
        if promedio < 120:
            update_kb_document(doc_id, {
                "estado": "error",
                "error_msg": (f"Parece un PDF escaneado (imagen): solo {int(promedio)} caracteres "
                              f"por página en promedio. Necesita OCR antes de subirlo."),
            })
            return

        chunks = fragmentar(paginas)
        if not chunks:
            update_kb_document(doc_id, {"estado": "error", "error_msg": "El documento no tiene texto aprovechable."})
            return

        vectores = embed_textos([c["contenido"] for c in chunks], tipo="document")
        if not vectores:
            update_kb_document(doc_id, {
                "estado": "error",
                "error_msg": "No hay proveedor de embeddings configurado (falta VOYAGE_API_KEY).",
            })
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
