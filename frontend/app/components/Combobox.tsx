'use client';

// Campo con autocompletado: se escribe y, desde la segunda letra, la lista muestra lo que
// coincide (sin importar mayúsculas ni acentos). Si lo escrito no está en la lista, se puede
// usar igual y, con la casilla, guardarlo para la próxima vez ("Otro" → se va alimentando
// el catálogo con el uso). Sirve para pacientes, clientes, proveedores, lugares, conceptos…

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/app/components/Icon';
import { buscarExacta, filtrar, type Opcion } from '@/app/lib/buscar';

export interface NuevoConfig {
  /** Cómo se llama lo que se agrega, en minúsculas y singular: "lugar", "proveedor"… */
  nombre: string;
  /** Texto de la casilla. Por defecto: "Guardar este {nombre} para la próxima vez". */
  etiquetaGuardar?: string;
  guardar: boolean;
  onGuardar: (v: boolean) => void;
}

interface Props {
  label: string;
  value: string;
  /** `elegida` es la opción de la lista (o null si lo escrito es texto libre). */
  onChange: (texto: string, elegida: Opcion | null) => void;
  opciones: Opcion[];
  placeholder?: string;
  requerido?: boolean;
  /** Si las opciones aún se están cargando. */
  cargando?: boolean;
  /** Si se pasa, permite usar un valor que no está en la lista y guardarlo. */
  nuevo?: NuevoConfig;
  /** Texto de ayuda bajo el campo. */
  ayuda?: string;
  autoFocus?: boolean;
  maxOpciones?: number;
}

const ESPACIO_LISTA = 240;

export default function Combobox({
  label, value, onChange, opciones, placeholder, requerido, cargando, nuevo, ayuda, autoFocus, maxOpciones = 8,
}: Props) {
  const uid = useId();
  const inputId = `cb-${uid}`;
  const listaId = `cbl-${uid}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  // -1 = ninguna resaltada: Enter conserva lo escrito (así un nombre nuevo no se cambia por el primero parecido).
  const [activo, setActivo] = useState(-1);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);

  const exacta = useMemo(() => buscarExacta(opciones, value), [opciones, value]);
  const coinciden = useMemo(() => {
    const r = filtrar(opciones, value, maxOpciones);
    // Las opciones de un mismo grupo van juntas (el orden dentro de cada grupo se conserva).
    const orden = new Map<string, number>();
    r.forEach(o => { const g = o.group ?? ''; if (!orden.has(g)) orden.set(g, orden.size); });
    return [...r].sort((a, b) => orden.get(a.group ?? '')! - orden.get(b.group ?? '')!);
  }, [opciones, value, maxOpciones]);
  const escribio = value.trim().length > 0;
  const esNuevo = !!nuevo && escribio && !exacta;

  // Filas de la lista: coincidencias (con su grupo) y, al final, la fila de "Otro".
  type Fila = { tipo: 'op'; op: Opcion; grupo?: string } | { tipo: 'otro' };
  const filas: Fila[] = useMemo(() => {
    const f: Fila[] = coinciden.map(op => ({ tipo: 'op', op }));
    if (nuevo && !esNuevo) f.push({ tipo: 'otro' });
    return f;
  }, [coinciden, nuevo, esNuevo]);

  useEffect(() => { setActivo(-1); }, [value, abierto]);

  // Posición de la lista: fija respecto a la ventana para que no la recorte el scroll del popup.
  const calcularPos = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (!r) return;
    const abajo = window.innerHeight - r.bottom;
    const arriba = r.top;
    if (abajo < 180 && arriba > abajo) {
      setPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 });
    } else {
      setPos({ left: r.left, width: r.width, top: r.bottom + 4 });
    }
  };
  useLayoutEffect(() => {
    if (!abierto) return;
    calcularPos();
    const f = () => calcularPos();
    window.addEventListener('resize', f);
    window.addEventListener('scroll', f, true);
    return () => { window.removeEventListener('resize', f); window.removeEventListener('scroll', f, true); };
  }, [abierto, value]);

  const elegir = (op: Opcion) => {
    onChange(op.label, op);
    setAbierto(false);
  };

  const elegirOtro = () => {
    // "Otro": se limpia para escribir el nombre nuevo.
    onChange('', null);
    setAbierto(false);
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!abierto) { setAbierto(true); return; }
      setActivo(a => Math.min(a + 1, filas.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo(a => Math.max(a - 1, -1));
    } else if (e.key === 'Enter') {
      // Nunca envía el formulario desde aquí.
      if (!abierto) return;
      e.preventDefault();
      const f = filas[activo];
      if (!f) setAbierto(false);
      else if (f.tipo === 'op') elegir(f.op);
      else elegirOtro();
    } else if (e.key === 'Escape') {
      if (abierto) { e.preventDefault(); e.stopPropagation(); setAbierto(false); }
    } else if (e.key === 'Tab') {
      setAbierto(false);
    }
  };

  const alSalir = () => {
    setAbierto(false);
    // Si lo escrito es una opción (aunque con otras mayúsculas/acentos), se deja con su nombre oficial.
    if (exacta && exacta.label !== value) onChange(exacta.label, exacta);
  };

  const mostrarLista = abierto && !!pos && (filas.length > 0 || cargando);
  const grupoDe = (i: number) => {
    const f = filas[i];
    if (f.tipo !== 'op' || !f.op.group) return null;
    const prev = filas[i - 1];
    return prev && prev.tipo === 'op' && prev.op.group === f.op.group ? null : f.op.group;
  };

  return (
    <div>
      <label htmlFor={inputId} className="block text-[13px] font-medium text-[var(--c-text-2)] mb-1.5">
        {label}{requerido && <span className="text-[var(--c-danger)]"> *</span>}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={mostrarLista && filas[activo] ? `${listaId}-${activo}` : undefined}
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          onFocus={() => setAbierto(true)}
          onBlur={alSalir}
          onChange={e => {
            const t = e.target.value;
            onChange(t, buscarExacta(opciones, t) ?? null);
            setAbierto(true);
          }}
          onKeyDown={onKey}
          className="h-11 w-full rounded-lg border border-[var(--c-border-2)] bg-[var(--c-card)] pl-3 pr-9 text-base text-[var(--c-text)] placeholder:text-[var(--c-text-3)] outline-none transition focus:border-[var(--c-primary)] focus:shadow-[0_0_0_3px_var(--c-green-15)]"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-text-3)]">
          {exacta
            ? <Icon name="tick" size={16} className="text-[var(--c-success)]" title="En tu lista" />
            : <Icon name="chevron" size={16} />}
        </span>
      </div>

      {mostrarLista && createPortal(
        <ul
          id={listaId}
          role="listbox"
          aria-label={label}
          style={{ position: 'fixed', left: pos!.left, width: pos!.width, top: pos!.top, bottom: pos!.bottom, maxHeight: ESPACIO_LISTA }}
          className="z-[200] overflow-y-auto rounded-lg border border-[var(--c-border-2)] bg-[var(--c-card)] py-1 shadow-[0_8px_24px_rgba(15,23,42,0.14)]"
        >
          {cargando && filas.length === 0 && (
            <li className="px-3 py-2.5 text-[13px] text-[var(--c-text-3)]">Cargando…</li>
          )}
          {filas.map((f, i) => {
            const g = grupoDe(i);
            const esActivo = i === activo;
            return (
              <li key={f.tipo === 'op' ? f.op.id : 'otro'} role="presentation">
                {g && <div className="px-3 pt-2 pb-1 text-[12px] font-medium text-[var(--c-text-3)]">{g}</div>}
                <div
                  id={`${listaId}-${i}`}
                  role="option"
                  aria-selected={esActivo}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => (f.tipo === 'op' ? elegir(f.op) : elegirOtro())}
                  onMouseEnter={() => setActivo(i)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-[15px] ${
                    esActivo ? 'bg-[var(--c-hover)]' : ''
                  } ${f.tipo === 'otro' ? 'border-t border-[var(--c-border)] text-[var(--c-primary)] font-medium' : 'text-[var(--c-text)]'}`}
                >
                  {f.tipo === 'op' ? (
                    <>
                      <span className="truncate">{f.op.label}</span>
                      {f.op.hint && <span className="shrink-0 text-[13px] text-[var(--c-text-3)]">{f.op.hint}</span>}
                    </>
                  ) : (
                    <span className="flex items-center gap-2"><Icon name="plus" size={15} />Otro {nuevo!.nombre}…</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}

      {esNuevo && nuevo && (
        <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-lg bg-[var(--c-subtle)] px-3 py-2.5 text-[14px] text-[var(--c-text)]">
          <input
            type="checkbox"
            checked={nuevo.guardar}
            onChange={e => nuevo.onGuardar(e.target.checked)}
            className="mt-0.5 shrink-0 accent-[var(--c-primary)]"
          />
          <span>
            {nuevo.etiquetaGuardar ?? `Guardar este ${nuevo.nombre} para la próxima vez`}
            <span className="block text-[13px] text-[var(--c-text-3)]">«{value.trim()}» aún no está en tu lista.</span>
          </span>
        </label>
      )}

      {ayuda && !esNuevo && <p className="mt-1.5 text-[13px] text-[var(--c-text-3)]">{ayuda}</p>}
    </div>
  );
}
