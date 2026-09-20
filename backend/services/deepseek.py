"""Cliente DeepSeek compartido (endpoint compatible con Anthropic) para tareas de solo texto.

DeepSeek V3.2 es ~20-30x más barato que Sonnet/Opus, pero es SOLO TEXTO: no tiene visión
(imágenes/PDF) ni las herramientas server-side de Anthropic (web_search). Úsalo solo para
tareas de texto (resúmenes, aclaraciones, validaciones), con fallback al modelo Anthropic.
"""
import os
from anthropic import Anthropic

DEEPSEEK_API_KEY  = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/anthropic")
DEEPSEEK_MODEL    = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

_client = None


def get_deepseek_client():
    """Devuelve el cliente DeepSeek si hay API key configurada; si no, None (usar Anthropic)."""
    global _client
    if _client is None and DEEPSEEK_API_KEY:
        _client = Anthropic(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, timeout=60)
    return _client
