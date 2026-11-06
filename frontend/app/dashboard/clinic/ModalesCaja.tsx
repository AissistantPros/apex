'use client';

// Ventanas "Registrar ingreso" y "Registrar gasto". Las listas (pacientes, clientes, lugares,
// proveedores, conceptos) se escriben con autocompletado y, si algo no está, se guarda al usarlo.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon from '@/app/components/Icon';
import Combobox from '@/app/components/Combobox';
import { api, money, type Catalogos } from './clinicApi';
import { buscarExacta, sinRepetidos, type Opcion } from '@/app/lib/buscar';

const LUGAR_BASE = 'Consultorio propio';

// Sugerencias para el primer día, cuando el catálogo de gastos aún está vacío.
const CONCEPTOS_GASTO_BASE = [
  'Renta del consultorio', 'Insumos médicos', 'Doctoralia', 'Publicidad en Meta',
  'Internet y celular', 'Papelería', 'Luz', 'Limpieza',
];

const parseMonto = (t: string) => {
  const n = Number(t.replace(/[,\s$]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Fecha de hoy en la zona del usuario (toISOString la daría en UTC y cambia de día por la tarde). */
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const nombreDe = (x: any) => String(x?.nombre || '').trim();

// ─────────────────────────────────────────────────────────────────────────────
// Piezas compartidas
// ─────────────────────────────────────────────────────────────────────────────
function Hoja({
  titulo, subtitulo, onClose, children, pie,
}: { titulo: string; subtitulo?: string; onClose: () => void; children: ReactNode; pie: ReactNode }) {
  const tituloId = useId();
  const pulsoEnFondo = useRef(false);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', alTeclear);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', alTeclear); document.body.style.overflow = previo; };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(15,23,42,0.5)] sm:items-center sm:p-4"
      // Solo cierra si el clic empezó y terminó en el fondo (no al soltar una selección de texto).
      onMouseDown={e => { pulsoEnFondo.current = e.target === e.currentTarget; }}
      onClick={e => { if (pulsoEnFondo.current && e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="flex max-h-[94dvh] w-full flex-col rounded-t-2xl border border-[var(--c-border)] bg-[var(--c-card)] shadow-[0_20px_50px_rgba(15,23,42,0.25)] sm:max-h-[90dvh] sm:max-w-[480px] sm:rounded-xl"
      >
        <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div>
            <h2 id={tituloId} className="text-xl font-semibold text-[var(--c-text)]">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-[13px] text-[var(--c-text-3)]">{subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 flex h-11 w-11 items-center justify-center rounded-lg text-[var(--c-text-3)] transition hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-3">{children}</div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--c-border)] px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{pie}</footer>
      </div>
    </div>
  );
}

function CampoMonto({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[var(--c-text-2)]">
        Monto<span className="text-[var(--c-danger)]"> *</span>
      </label>
      <div className="flex h-14 items-center rounded-lg border border-[var(--c-border-2)] bg-[var(--c-card)] px-3 transition focus-within:border-[var(--c-primary)] focus-within:shadow-[0_0_0_3px_var(--c-green-15)]">
        <span className="text-xl text-[var(--c-text-3)]">$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="0.00"
          value={value}
          onChange={e => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
          className="w-full bg-transparent px-2 text-2xl font-semibold tabular-nums text-[var(--c-text)] outline-none placeholder:font-normal placeholder:text-[var(--c-text-3)]"
        />
        <span className="text-[13px] text-[var(--c-text-3)]">MXN</span>
      </div>
    </div>
  );
}

function Opciones<T extends string>({
  label, value, onChange, items, columnas,
}: { label: string; value: T; onChange: (v: T) => void; items: { id: T; l: string }[]; columnas: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-[var(--c-text-2)]">{label}</div>
      <div role="radiogroup" aria-label={label} className={`grid gap-2 ${columnas}`}>
        {items.map(it => {
          const on = it.id === value;
          return (
            <button
              key={it.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(it.id)}
              className={`h-11 rounded-lg border px-1 text-[14px] transition ${
                on
                  ? 'border-[var(--c-primary)] bg-[var(--c-green-10)] font-semibold text-[var(--c-primary)]'
                  : 'border-[var(--c-border-2)] bg-[var(--c-card)] text-[var(--c-text-2)] hover:bg-[var(--c-hover)]'
              }`}
            >
              {it.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Interruptor({ label, ayuda, value, onChange }: { label: string; ayuda?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[15px] text-[var(--c-text)]">{label}</div>
        {ayuda && <div className="text-[13px] text-[var(--c-text-3)]">{ayuda}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${value ? 'bg-[var(--c-primary)]' : 'bg-[var(--c-border-2)]'}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-[color-mix(in_srgb,var(--c-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--c-danger)_8%,transparent)] px-3 py-2.5 text-[14px] text-[var(--c-danger)]"
    >
      {texto}
    </p>
  );
}

const campoTexto =
  'h-11 w-full rounded-lg border border-[var(--c-border-2)] bg-[var(--c-card)] px-3 text-base text-[var(--c-text)] placeholder:text-[var(--c-text-3)] outline-none transition focus:border-[var(--c-primary)] focus:shadow-[0_0_0_3px_var(--c-green-15)]';
const botonSec =
  'h-11 rounded-lg px-4 text-[15px] font-medium text-[var(--c-text-2)] transition hover:bg-[var(--c-hover)] disabled:opacity-50';
const botonPri =
  'h-11 min-w-[148px] rounded-lg bg-[var(--c-primary)] px-5 text-[15px] font-semibold text-[var(--c-primary-fg)] transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50';

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRAR INGRESO
// ─────────────────────────────────────────────────────────────────────────────
type PagoIngreso = 'efectivo' | 'tarjeta' | 'transferencia' | 'pendiente';

export function ModalRegistrarIngreso({
  patients, services, catalogs, cargando, onClose, onSuccess,
}: {
  patients: any[];
  services: any[];
  catalogs: Catalogos;
  /** true mientras llegan pacientes y catálogos (la ventana ya se puede usar). */
  cargando: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [quien, setQuien] = useState('');
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [guardarCliente, setGuardarCliente] = useState(true);
  const [lugar, setLugar] = useState(LUGAR_BASE);
  const [guardarLugar, setGuardarLugar] = useState(true);
  const [pago, setPago] = useState<PagoIngreso>('efectivo');
  const [tarjeta, setTarjeta] = useState('');
  const [facturada, setFacturada] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const opcionesQuien = useMemo<Opcion[]>(() => {
    const pac = patients.map((p: any) => ({
      id: `p:${p.id}`,
      label: String(p.full_name || `${p.first_name || ''} ${p.last_name || ''}`).trim(),
      group: 'Pacientes',
    }));
    const cli = catalogs.clientes.map((c: any) => ({
      id: `c:${c.id}`, label: nombreDe(c), group: 'Clientes', hint: c.categoria || undefined,
    }));
    return sinRepetidos([...pac, ...cli]).filter(o => o.label);
  }, [patients, catalogs.clientes]);

  const opcionesLugar = useMemo<Opcion[]>(
    () => sinRepetidos([{ id: 'base', label: LUGAR_BASE }, ...catalogs.lugares.map((l: any) => ({ id: `l:${l.id}`, label: nombreDe(l) }))]),
    [catalogs.lugares],
  );

  const opcionesConcepto = useMemo<Opcion[]>(
    () => services.filter((s: any) => s.nombre).map((s: any) => ({
      id: `s:${s.id}`,
      label: s.nombre,
      hint: s.precio_tipo === 'fijo' && s.precio > 0 ? money(s.precio) : undefined,
      data: s,
    })),
    [services],
  );

  const guardar = async () => {
    const importe = parseMonto(monto);
    if (importe <= 0) return setErr('Escribe el monto cobrado.');
    if (!concepto.trim()) return setErr('Escribe el concepto del cobro.');

    const esPaciente = !!pacienteId;
    const pagador = quien.trim();
    const estado = pago === 'pendiente' ? 'pendiente' : 'cobrado';
    const cobrado = estado === 'cobrado';
    const lugarFinal = lugar.trim() || LUGAR_BASE;

    setSaving(true);
    setErr('');
    try {
      await api('/clinic/sales', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: pacienteId,
          items: [{ concepto: concepto.trim(), precio: importe, cantidad: 1, precio_tipo: 'variable' }],
          estado,
          metodo_pago: cobrado ? pago : null,
          facturada: cobrado ? facturada : false,
          lugar: lugarFinal,
          aseguradora: !esPaciente && pagador ? pagador : null,
          procedimiento: concepto.trim(),
          tarjeta_nombre: pago === 'tarjeta' ? tarjeta.trim() : null,
          guardar_cliente: !esPaciente && !!pagador && guardarCliente && !buscarExacta(opcionesQuien, pagador),
          guardar_lugar: guardarLugar && !buscarExacta(opcionesLugar, lugarFinal),
        }),
      });
      onSuccess();
    } catch (e: any) {
      setErr(e.message || 'No se pudo guardar el ingreso.');
      setSaving(false);
    }
  };

  return (
    <Hoja
      titulo="Registrar ingreso"
      subtitulo="Un cobro del consultorio, de un hospital o de una aseguradora."
      onClose={onClose}
      pie={
        <>
          <button type="button" onClick={onClose} className={botonSec}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={saving} className={botonPri}>
            {saving ? 'Guardando…' : 'Guardar ingreso'}
          </button>
        </>
      }
    >
      <CampoMonto value={monto} onChange={setMonto} />

      <Combobox
        label="Paciente o cliente"
        placeholder="Escribe el nombre"
        value={quien}
        opciones={opcionesQuien}
        cargando={cargando}
        onChange={(t, op) => {
          setQuien(t);
          setPacienteId(op?.id.startsWith('p:') ? op.id.slice(2) : null);
        }}
        nuevo={{
          nombre: 'cliente',
          etiquetaGuardar: 'Guardar este cliente (aseguradora, empresa…) para la próxima vez',
          guardar: guardarCliente,
          onGuardar: setGuardarCliente,
        }}
        ayuda="Elige un paciente o escribe una aseguradora o empresa."
      />

      <Combobox
        label="Concepto"
        requerido
        placeholder="Consulta, estudio, cirugía…"
        value={concepto}
        opciones={opcionesConcepto}
        onChange={(t, op) => {
          setConcepto(t);
          const s: any = op?.data;
          if (s && s.precio_tipo === 'fijo' && s.precio > 0 && !parseMonto(monto)) setMonto(String(s.precio));
        }}
        ayuda={opcionesConcepto.length ? 'Los conceptos con precio salen de la pestaña Servicios.' : undefined}
      />

      <Combobox
        label="Lugar"
        placeholder="Dónde se realizó"
        value={lugar}
        opciones={opcionesLugar}
        cargando={cargando}
        onChange={t => setLugar(t)}
        nuevo={{ nombre: 'lugar', guardar: guardarLugar, onGuardar: setGuardarLugar }}
      />

      <div className="space-y-3">
        <Opciones<PagoIngreso>
          label="Forma de pago"
          value={pago}
          onChange={setPago}
          columnas="grid-cols-2 sm:grid-cols-4"
          items={[
            { id: 'efectivo', l: 'Efectivo' },
            { id: 'tarjeta', l: 'Tarjeta' },
            { id: 'transferencia', l: 'Transferencia' },
            { id: 'pendiente', l: 'Por cobrar' },
          ]}
        />
        {pago === 'tarjeta' && (
          <input
            className={campoTexto}
            placeholder="¿Cuál tarjeta o terminal? (opcional)"
            aria-label="Tarjeta o terminal"
            value={tarjeta}
            onChange={e => setTarjeta(e.target.value)}
          />
        )}
        {pago === 'pendiente' && (
          <p className="text-[13px] text-[var(--c-text-3)]">Quedará en cuentas por cobrar hasta que se marque como cobrado.</p>
        )}
      </div>

      {pago !== 'pendiente' && (
        <Interruptor label="Se emitió factura" value={facturada} onChange={setFacturada} />
      )}

      {err && <Aviso texto={err} />}
    </Hoja>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRAR GASTO
// ─────────────────────────────────────────────────────────────────────────────
type PagoGasto = 'efectivo' | 'transferencia' | 'tarjeta';

const ORIGEN_FONDO: Record<PagoGasto, string> = {
  efectivo: 'caja_consultorio',
  tarjeta: 'tarjeta_consultorio',
  transferencia: 'transferencia_consultorio',
};

export function ModalRegistrarGasto({
  catalogs, cargando, onClose, onSuccess,
}: {
  catalogs: Catalogos;
  cargando: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [guardarConcepto, setGuardarConcepto] = useState(true);
  const [proveedor, setProveedor] = useState('');
  const [guardarProveedor, setGuardarProveedor] = useState(true);
  const [pago, setPago] = useState<PagoGasto>('efectivo');
  const [tarjeta, setTarjeta] = useState('');
  const [facturado, setFacturado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const opcionesConcepto = useMemo<Opcion[]>(() => sinRepetidos([
    ...catalogs.conceptos_gasto.map((c: any) => ({
      id: `c:${c.id}`, label: nombreDe(c), hint: c.monto_sugerido ? money(c.monto_sugerido) : undefined, data: c,
    })),
    ...CONCEPTOS_GASTO_BASE.map(c => ({ id: `b:${c}`, label: c })),
  ]).filter(o => o.label), [catalogs.conceptos_gasto]);

  const opcionesProveedor = useMemo<Opcion[]>(
    () => sinRepetidos(catalogs.proveedores.map((p: any) => ({ id: `p:${p.id}`, label: nombreDe(p) }))).filter(o => o.label),
    [catalogs.proveedores],
  );

  const guardar = async () => {
    const importe = parseMonto(monto);
    if (importe <= 0) return setErr('Escribe el monto del gasto.');
    if (!concepto.trim()) return setErr('Escribe en qué se gastó.');

    setSaving(true);
    setErr('');
    try {
      await api('/clinic/expenses', {
        method: 'POST',
        body: JSON.stringify({
          concepto: concepto.trim(),
          monto: importe,
          proveedor: proveedor.trim() || null,
          fecha: hoyLocal(),
          facturado,
          metodo_pago: pago,
          origen_fondo: ORIGEN_FONDO[pago],
          tarjeta_nombre: pago === 'tarjeta' ? tarjeta.trim() : null,
          guardar_concepto: guardarConcepto && !buscarExacta(opcionesConcepto, concepto),
          guardar_proveedor: !!proveedor.trim() && guardarProveedor && !buscarExacta(opcionesProveedor, proveedor),
        }),
      });
      onSuccess();
    } catch (e: any) {
      setErr(e.message || 'No se pudo guardar el gasto.');
      setSaving(false);
    }
  };

  return (
    <Hoja
      titulo="Registrar gasto"
      subtitulo="Algo que pagó el consultorio."
      onClose={onClose}
      pie={
        <>
          <button type="button" onClick={onClose} className={botonSec}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={saving} className={botonPri}>
            {saving ? 'Guardando…' : 'Guardar gasto'}
          </button>
        </>
      }
    >
      <CampoMonto value={monto} onChange={setMonto} />

      <Combobox
        label="¿En qué se gastó?"
        requerido
        placeholder="Renta, insumos, publicidad…"
        value={concepto}
        opciones={opcionesConcepto}
        cargando={cargando}
        onChange={(t, op) => {
          setConcepto(t);
          const sugerido = Number((op?.data as any)?.monto_sugerido);
          if (sugerido > 0 && !parseMonto(monto)) setMonto(String(sugerido));
        }}
        nuevo={{ nombre: 'concepto', guardar: guardarConcepto, onGuardar: setGuardarConcepto }}
      />

      <Combobox
        label="Proveedor o comercio"
        placeholder="A quién se le pagó (opcional)"
        value={proveedor}
        opciones={opcionesProveedor}
        cargando={cargando}
        onChange={t => setProveedor(t)}
        nuevo={{ nombre: 'proveedor', guardar: guardarProveedor, onGuardar: setGuardarProveedor }}
      />

      <div className="space-y-3">
        <Opciones<PagoGasto>
          label="Forma de pago"
          value={pago}
          onChange={setPago}
          columnas="grid-cols-3"
          items={[
            { id: 'efectivo', l: 'Efectivo' },
            { id: 'transferencia', l: 'Transferencia' },
            { id: 'tarjeta', l: 'Tarjeta' },
          ]}
        />
        {pago === 'tarjeta' && (
          <input
            className={campoTexto}
            placeholder="¿Cuál tarjeta? (opcional)"
            aria-label="Tarjeta"
            value={tarjeta}
            onChange={e => setTarjeta(e.target.value)}
          />
        )}
      </div>

      <Interruptor label="Me dieron factura" value={facturado} onChange={setFacturado} />

      {err && <Aviso texto={err} />}
    </Hoja>
  );
}
