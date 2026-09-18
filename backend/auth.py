"""
Autenticación real: verifica el JWT de Supabase contra las llaves públicas del
proyecto (JWKS, firma asimétrica ES256) y resuelve quién actúa y sobre qué clínica.

Seguridad:
- La firma se VERIFICA (no basta con decodificar): un token forjado se rechaza.
- Sin token válido → 401. No hay acceso anónimo ni "cuenta por defecto" en
  producción. Solo si APEX_DEV_AUTH_FALLBACK=1 (desarrollo local) se permite un
  usuario de respaldo.
"""
import os
from typing import Optional

import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"

# Solo para desarrollo local: si no hay token, actuar como esta cuenta.
FALLBACK_DOCTOR_ID = "1c330e4b-c0e8-424b-8b06-0700e9e3dcc5"  # doc@test.com
_ALLOW_FALLBACK = os.getenv("APEX_DEV_AUTH_FALLBACK") == "1"

# Cliente JWKS con caché de llaves (se refresca solo si aparece un kid nuevo).
_jwk_client: Optional[PyJWKClient] = None


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(JWKS_URL, cache_keys=True, lifespan=3600)
    return _jwk_client


def _verify_token(token: str) -> Optional[dict]:
    """Devuelve el payload si la firma y la expiración son válidas; None si no."""
    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            # El aud de Supabase para usuarios logueados es "authenticated", pero no
            # lo forzamos para no bloquear tokens con aud distinto: lo crítico es la firma.
            options={"verify_aud": False, "verify_exp": True},
        )
    except Exception:
        return None


def _resolve_user_id(authorization: Optional[str]) -> str:
    """Extrae y VERIFICA el user id del header Authorization: Bearer <jwt>."""
    token = ""
    if authorization:
        token = authorization.replace("Bearer ", "").strip()

    if token and not token.startswith("mock-"):
        payload = _verify_token(token)
        if payload and payload.get("sub"):
            return payload["sub"]

    # Token ausente o inválido
    if _ALLOW_FALLBACK:
        return FALLBACK_DOCTOR_ID
    raise HTTPException(status_code=401, detail="Sesión inválida o expirada. Inicia sesión de nuevo.")


def get_doctor_id_from_token(authorization: Optional[str]) -> str:
    """Compatibilidad: el user id verificado del token (antes devolvía un fallback)."""
    return _resolve_user_id(authorization)


def get_actor(authorization: Optional[str]) -> dict:
    """Resuelve quién actúa y sobre qué clínica.

    Un recepcionista opera sobre la clínica de SU médico (parent_doctor_id), así que su
    `doctor_id` efectivo es el del médico. Un médico opera sobre sí mismo.
    Devuelve {user_id, role, doctor_id, permissions}.
    """
    user_id = _resolve_user_id(authorization)
    try:
        from db import get_doctor_profile
        prof = get_doctor_profile(user_id) or {}
    except Exception:
        prof = {}
    role = prof.get("role") or "doctor"
    parent = prof.get("parent_doctor_id")
    # Cualquier rol que no sea médico y tenga médico padre opera sobre la clínica de ese médico
    doctor_id = parent if (role != "doctor" and parent) else user_id
    return {
        "user_id": user_id, "role": role, "doctor_id": doctor_id,
        "clinic_id": prof.get("clinic_id"),
        "is_local_admin": bool(prof.get("is_local_admin")),
        "username": prof.get("username") or prof.get("email"),
        "permissions": prof.get("permissions") or {},
    }
