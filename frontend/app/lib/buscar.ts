// Búsqueda para los campos con autocompletado (pacientes, clientes, proveedores, lugares…).
// Ignora mayúsculas y acentos: "clinica" encuentra "Clínica San José".

export interface Opcion {
  id: string;
  label: string;
  /** Texto secundario a la derecha (ej. "Cliente", "usado 3 veces"). */
  hint?: string;
  /** Título del grupo en la lista (ej. "Pacientes"). Las opciones del mismo grupo van juntas. */
  group?: string;
  /** Datos propios del llamador (precio sugerido, categoría…). */
  data?: unknown;
}

/** Minúsculas, sin acentos y con espacios colapsados. */
export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Desde cuántas letras se filtra. Con menos, se muestra la lista completa (como un desplegable). */
export const MIN_LETRAS = 2;

/** Sin filtro, si hay varios grupos (pacientes y clientes) se muestran todos, no solo el primero. */
function repartir(opciones: Opcion[], max: number): Opcion[] {
  const grupos = new Set(opciones.map(o => o.group ?? ''));
  if (grupos.size < 2) return opciones.slice(0, max);
  const tope = Math.max(3, Math.floor(max / grupos.size));
  const usados = new Map<string, number>();
  const elegidas = new Set<Opcion>();
  for (const o of opciones) {
    const g = o.group ?? '';
    const n = usados.get(g) ?? 0;
    if (n < tope) { elegidas.add(o); usados.set(g, n + 1); }
  }
  // Si sobra lugar (un grupo tiene pocas opciones), se completa con las demás.
  for (const o of opciones) {
    if (elegidas.size >= max) break;
    elegidas.add(o);
  }
  return opciones.filter(o => elegidas.has(o)).slice(0, max);
}

/**
 * Opciones que coinciden con lo escrito: cada palabra escrita debe aparecer en el nombre.
 * Primero las que empiezan con lo escrito, luego las que tienen una palabra que empieza así,
 * luego el resto; a igualdad, orden alfabético.
 */
export function filtrar(opciones: Opcion[], consulta: string, max = 8): Opcion[] {
  const q = normalizar(consulta);
  if (q.length < MIN_LETRAS) return repartir(opciones, max);

  const palabras = q.split(' ');
  const puntuadas: { o: Opcion; peso: number; n: string }[] = [];
  for (const o of opciones) {
    const n = normalizar(o.label);
    if (!palabras.every(p => n.includes(p))) continue;
    const peso = n.startsWith(q) ? 0 : n.split(' ').some(w => w.startsWith(palabras[0])) ? 1 : 2;
    puntuadas.push({ o, peso, n });
  }
  puntuadas.sort((a, b) => a.peso - b.peso || a.n.localeCompare(b.n, 'es'));
  return puntuadas.slice(0, max).map(x => x.o);
}

/** La opción cuyo nombre es exactamente lo escrito (sin importar mayúsculas ni acentos). */
export function buscarExacta(opciones: Opcion[], texto: string): Opcion | undefined {
  const q = normalizar(texto);
  if (!q) return undefined;
  return opciones.find(o => normalizar(o.label) === q);
}

/** Quita repetidos (sin importar mayúsculas ni acentos) conservando la primera aparición. */
export function sinRepetidos(opciones: Opcion[]): Opcion[] {
  const vistos = new Set<string>();
  return opciones.filter(o => {
    const k = normalizar(o.label);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}
