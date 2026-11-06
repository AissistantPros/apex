'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import Icon from '@/app/components/Icon';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const VENTAJAS_PRO = [
  {
    titulo: 'Diagnóstico y Protocolo Asistido por IA en Consulta',
    subtitulo: 'Tres voces clínicas integradas en tiempo real',
    desc: 'Durante la consulta, la IA analiza signos vitales, interrogatorio dirigido, laboratorios e historial para proponerte diagnósticos diferenciales con porcentaje de confianza y protocolos farmacológicos, nutracéuticos y de estilo de vida listos para aceptar o ajustar con un clic.',
    incluye: [
      'Medicina Convencional basada en guías internacionales',
      'Medicina Funcional e Integrativa (causa raíz, eje intestino-cerebro, inflamación, tiroides)',
      'Medicina de Longevidad (biomarcadores de envejecimiento, péptidos, NAD+, senolíticos)',
    ],
  },
  {
    titulo: 'Síntesis del Agente Director y Plan por Fases',
    subtitulo: 'Cero duplicados entre medicamentos, suplementos y estudios',
    desc: 'Un agente director unifica los hallazgos de los 3 enfoques, elimina estudios o suplementos repetidos y genera automáticamente un plan estructurado por fases y una explicación en lenguaje claro para el paciente.',
    incluye: [
      'Receta médica oficial automática sin duplicidades',
      'Orden de estudios de laboratorio e imagen clasificada por prioridad',
      'Reporte ejecutivo para el paciente listo para imprimir o enviar por correo',
    ],
  },
  {
    titulo: 'Biblioteca Clínica Propia con IA',
    subtitulo: 'Tus propios libros, PDFs y guías médicas integrados al razonamiento',
    desc: 'Sube tus libros, artículos científicos y protocolos personales. Tanto el chat como el motor diagnóstico citarán directamente tu biblioteca con título y autor.',
    incluye: [
      'Indexación semántica de libros y manuales médicos',
      'Citas directas en diagnóstico y en el chat médico',
      'Capacidad ampliada de tokens y consultas de IA sin el tope de 50 al día',
    ],
  },
  {
    titulo: 'Sala de Espera Inteligente y Marketing ROI',
    subtitulo: 'Briefing pre-consulta automático y retorno publicitario por canal',
    desc: 'Antes de que el paciente entre al consultorio, tienes un briefing ejecutivo con su evolución. Además, mide cuántos pacientes e ingresos provienen de Meta, Google, Doctoralia, TikTok o referidos.',
    incluye: [
      'Resumen automático en Sala de Espera y Próximos Pacientes',
      'Analítica avanzada de ROI publicitario (ROAS por canal)',
      'Hasta 10–20 usuarios y múltiples sedes/ubicaciones',
    ],
  },
];

const COMPARATIVA = [
  { funcion: 'Expediente clínico continuo (estudios, labs, fotos Antes/Después)', lite: 'Incluido', pro: 'Incluido' },
  { funcion: 'Receta médica manual imprimible con tu membrete y logo', lite: 'Incluido', pro: 'Incluido + Generación IA' },
  { funcion: 'Contabilidad completa (ingresos, gastos, aseguradoras, cirugías, caja)', lite: 'Incluido', pro: 'Incluido' },
  { funcion: 'Envío de cobro e indicaciones a mostrador al cerrar visita', lite: 'Incluido', pro: 'Incluido' },
  { funcion: 'Agenda semanal y mensual + Chat interno del equipo', lite: 'Incluido', pro: 'Incluido' },
  { funcion: 'Chat con Agente IA (Longevidad, Péptidos, Funcional y Base de Datos)', lite: '50 preguntas / día', pro: 'Capacidad ampliada Pro' },
  { funcion: 'Resumen del paciente con IA y Análisis Financiero con IA', lite: 'Incluido (en cuota diaria)', pro: 'Incluido ilimitado / Bolsa Pro' },
  { funcion: 'Consulta de Medicina Funcional y Longevidad (Interrogatorio + IA)', lite: '—', pro: '✦ Exclusivo Pro' },
  { funcion: 'Sugerencia automática de diagnóstico, medicamentos, péptidos y dosis', lite: '—', pro: '✦ Exclusivo Pro' },
  { funcion: 'Agente Director (síntesis en 3 fases y explicación al paciente)', lite: '—', pro: '✦ Exclusivo Pro' },
  { funcion: 'Biblioteca Clínica propia (subir libros y guías médicas)', lite: '—', pro: '✦ Exclusivo Pro' },
  { funcion: 'Sala de espera con briefing IA y Marketing ROI por canal', lite: '—', pro: '✦ Exclusivo Pro' },
];

export default function ApexProPage() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [planInteres, setPlanInteres] = useState<'apex_funcional' | 'apex_longevidad' | 'apex_full'>('apex_full');
  const [notas, setNotas] = useState('');

  const solicitarUpgrade = async () => {
    setEnviando(true);
    try {
      const s = await getSession();
      if (!s?.access_token) return;
      const r = await fetch(`${BACKEND()}/support/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s.access_token}`,
        },
        body: JSON.stringify({
          subject: `Solicitud de actualización a Apex Pro (${planInteres})`,
          body: `El médico solicita información / activación de la versión Apex Pro (${planInteres}). Comentarios: ${notas || 'Activación desde página de ventajas Pro.'}`,
          kind: 'other',
        }),
      });
      if (r.ok) setEnviado(true);
    } catch { /* silencioso */ }
    finally { setEnviando(false); }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--c-bg)' }}>
      <main className="page-content pt-24 px-4 md:px-6 pb-24 max-w-5xl mx-auto space-y-8">

        {/* Encabezado Hero */}
        <section
          className="rounded-2xl p-6 md:p-8 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--c-primary) 12%, var(--c-card)) 0%, var(--c-card) 100%)',
            border: '1px solid color-mix(in srgb, var(--c-primary) 30%, var(--c-border))',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span
              className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
              style={{
                background: 'var(--c-primary)',
                color: 'var(--c-primary-fg)',
              }}
            >
              ✦ Evoluciona tu práctica médica
            </span>
            <button
              onClick={() => router.back()}
              className="text-[13px] font-medium px-3 py-1.5 rounded-lg transition hover:bg-[var(--c-subtle)]"
              style={{ color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
            >
              ← Volver
            </button>
          </div>

          <h1 className="mt-4 text-2xl md:text-3xl font-bold" style={{ color: 'var(--c-text)' }}>
            Conoce todo lo que incluye <span style={{ color: 'var(--c-primary)' }}>Apex Pro</span>
          </h1>
          <p className="mt-2 text-[15px] max-w-3xl leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
            Tu versión <strong>Apex Lite</strong> ya te brinda control total de tu consultorio, agenda, contabilidad, expediente continuo con fotos Antes/Después y tu agente de IA con 50 preguntas diarias. Con <strong>Apex Pro</strong> desbloqueas el motor clínico completo de <strong>Medicina Funcional, Longevidad, Péptidos y Diagnóstico Asistido en Consulta</strong>.
          </p>
        </section>

        {/* Tarjetas de ventajas */}
        <section className="grid md:grid-cols-2 gap-5">
          {VENTAJAS_PRO.map((v, i) => (
            <div
              key={i}
              className="rounded-2xl p-6 flex flex-col justify-between"
              style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: 'color-mix(in srgb, var(--c-primary) 15%, transparent)', color: 'var(--c-primary)' }}
                  >
                    0{i + 1}
                  </span>
                  <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-primary)' }}>
                    {v.subtitulo}
                  </span>
                </div>
                <h2 className="text-[18px] font-bold" style={{ color: 'var(--c-text)' }}>{v.titulo}</h2>
                <p className="text-[14px] mt-2 leading-relaxed" style={{ color: 'var(--c-text-2)' }}>{v.desc}</p>
              </div>
              <ul className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid var(--c-border)' }}>
                {v.incluye.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--c-text)' }}>
                    <span style={{ color: 'var(--c-success)' }}>✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* Tabla comparativa Lite vs Pro */}
        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-subtle)' }}>
            <h2 className="text-[17px] font-bold" style={{ color: 'var(--c-text)' }}>Comparativa detallada: Apex Lite vs Apex Pro</h2>
            <p className="text-[13px]" style={{ color: 'var(--c-text-2)' }}>Apex Pro hereda todas las herramientas de Apex Lite y añade inteligencia diagnóstica y terapéutica en vivo.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <th className="py-3.5 px-6 text-[13px] font-semibold" style={{ color: 'var(--c-text-2)' }}>Capacidad / Módulo</th>
                  <th className="py-3.5 px-4 text-[13px] font-semibold text-center" style={{ color: 'var(--c-text-2)' }}>Apex Lite (Tu plan actual)</th>
                  <th className="py-3.5 px-6 text-[13px] font-bold text-center" style={{ color: 'var(--c-primary)' }}>✦ Apex Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARATIVA.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td className="py-3 px-6 text-[14px] font-medium" style={{ color: 'var(--c-text)' }}>{row.funcion}</td>
                    <td className="py-3 px-4 text-[13px] text-center" style={{ color: row.lite === '—' ? 'var(--c-text-3)' : 'var(--c-text-2)' }}>
                      {row.lite}
                    </td>
                    <td className="py-3 px-6 text-[13px] font-semibold text-center" style={{ color: 'var(--c-primary)' }}>
                      {row.pro}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Solicitar activación */}
        <section
          className="rounded-2xl p-6 md:p-8"
          style={{ background: 'var(--c-card)', border: '2px solid var(--c-primary)' }}
        >
          {enviado ? (
            <div className="text-center py-4 space-y-2">
              <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center text-xl"
                style={{ background: 'color-mix(in srgb, var(--c-success) 15%, transparent)', color: 'var(--c-success)' }}>
                <Icon name="check" size={24} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>¡Solicitud enviada con éxito!</h3>
              <p className="text-sm max-w-lg mx-auto" style={{ color: 'var(--c-text-2)' }}>
                Nuestro equipo activará las funciones de <strong>Apex Pro</strong> en tu consultorio sin perder ningún dato, paciente ni configuración de tu cuenta actual.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>¿Te gustaría activar Apex Pro en tu consultorio?</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
                  Elige la modalidad Pro que más te interese y activaremos los módulos directamente sobre tu cuenta actual.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { id: 'apex_funcional', title: 'Apex Pro · Funcional', desc: 'Medicina Convencional + Medicina Funcional asistida por IA' },
                  { id: 'apex_longevidad', title: 'Apex Pro · Longevidad', desc: 'Medicina Convencional + Longevidad, Péptidos y Suplementación' },
                  { id: 'apex_full', title: 'Apex Pro · Full (3 Voces)', desc: 'Convencional + Funcional + Longevidad + Biblioteca Clínica' },
                ].map(opt => {
                  const sel = planInteres === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPlanInteres(opt.id as 'apex_funcional' | 'apex_longevidad' | 'apex_full')}
                      className="p-4 rounded-xl text-left transition-all"
                      style={{
                        background: sel ? 'color-mix(in srgb, var(--c-primary) 10%, var(--c-card))' : 'var(--c-subtle)',
                        border: sel ? '2px solid var(--c-primary)' : '1px solid var(--c-border)',
                      }}
                    >
                      <p className="font-bold text-sm" style={{ color: sel ? 'var(--c-primary)' : 'var(--c-text)' }}>{opt.title}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--c-text-2)' }}>{opt.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <input
                  type="text"
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Opcional: ¿Alguna duda o requerimiento especial para tu consultorio?"
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm"
                  style={{ background: 'var(--c-subtle)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                />
                <button
                  onClick={solicitarUpgrade}
                  disabled={enviando}
                  className="px-6 py-3 rounded-xl font-bold text-sm transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}
                >
                  {enviando ? 'Enviando solicitud…' : '✦ Solicitar activación de Apex Pro'}
                </button>
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
