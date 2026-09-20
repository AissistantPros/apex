"""Tarifas de la API de Claude y cálculo de costo. Solo lectura / instrumentación.

Los precios están hardcodeados aquí a propósito (una sola fuente de verdad). Si Anthropic
cambia precios: edita PRICES, sube PRECIOS_VERSION y redeploy. Los endpoints de costo
devuelven `precios_version` para que se note si el número quedó viejo.
"""

# Fecha/versión de esta tabla de precios (se expone en las respuestas de costo).
PRECIOS_VERSION = "2026-09-20"

# USD por 1,000,000 de tokens: (input, output).
PRICES = {
    "claude-opus-4-8":   (5, 25),
    "claude-opus-4-7":   (5, 25),
    "claude-opus-4-6":   (5, 25),
    "claude-sonnet-4-6": (3, 15),
    "claude-sonnet-4-5": (3, 15),
    "claude-haiku-4-5":  (1, 5),
    "claude-opus-4-1-20250805": (15, 75),   # legacy
    # DeepSeek V4 Flash (lo que sirve "deepseek-chat"). Tarifa off-peak aprox — AJUSTAR si cambia.
    "deepseek-chat":     (0.15, 0.60),
    "deepseek-v4-flash": (0.15, 0.60),
    "deepseek-reasoner": (0.15, 0.60),
}
DEFAULT_PRICE = (3, 15)          # modelo no listado → se asume tarifa Sonnet
SONNET = "claude-sonnet-4-6"


def price_for(model: str):
    return PRICES.get(model or "", DEFAULT_PRICE)


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    pi, po = price_for(model)
    return round((int(input_tokens or 0) / 1e6) * pi + (int(output_tokens or 0) / 1e6) * po, 6)


def cost_if_sonnet(model: str, input_tokens: int, output_tokens: int) -> float:
    """Cuánto habría costado el mismo paso si un Opus se hubiera corrido con Sonnet."""
    m = SONNET if (model or "").startswith("claude-opus") else model
    return cost_usd(m, input_tokens, output_tokens)
