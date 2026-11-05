// Utilidades de estilo compartidas.

/** Versión translúcida de un color (hex o var(--token)): reemplaza a "color + '22'" con hex. */
export const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
