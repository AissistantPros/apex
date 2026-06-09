"""
Utilidades de autenticación — extrae doctor_id del JWT de Supabase.
"""
import os
import base64
import json
from fastapi import Header, HTTPException
from typing import Optional

FALLBACK_DOCTOR_ID = "1c330e4b-c0e8-424b-8b06-0700e9e3dcc5"  # doc@test.com


def decode_jwt_payload(token: str) -> dict:
    """Decodifica el payload del JWT sin verificar firma (Supabase ya lo firmó)."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        payload_b64 = parts[1]
        # Añadir padding si hace falta
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        return json.loads(payload_bytes)
    except Exception:
        return {}


def get_doctor_id_from_token(authorization: Optional[str]) -> str:
    """
    Extrae el user ID del header Authorization: Bearer <jwt>.
    Si no hay token válido, devuelve el ID de fallback (doc@test.com).
    """
    if not authorization:
        return FALLBACK_DOCTOR_ID

    token = authorization.replace("Bearer ", "").strip()
    if not token or token.startswith("mock-"):
        return FALLBACK_DOCTOR_ID

    payload = decode_jwt_payload(token)
    user_id = payload.get("sub")
    return user_id if user_id else FALLBACK_DOCTOR_ID
