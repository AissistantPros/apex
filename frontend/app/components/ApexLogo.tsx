// Marca de Apex: un pico (apex) cuya barra es un pulso, más el nombre y el plan.
// Usa currentColor: se adapta a barras de color, fondo claro u oscuro.

export function ApexMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3.5 20 12 4l8.5 16" />
      <path d="M7.2 14.6h2.4l1.3-2.8 1.9 4.6 1.3-1.8h2.7" />
    </svg>
  );
}

export default function ApexLogo({ plan = 'Lite', size = 'md', className = '' }: {
  plan?: string; size?: 'sm' | 'md' | 'lg'; className?: string;
}) {
  const dim = size === 'lg' ? { mark: 34, name: 'text-[26px]', plan: 'text-[11px]' }
    : size === 'sm' ? { mark: 18, name: 'text-[15px]', plan: 'text-[9px]' }
    : { mark: 24, name: 'text-[19px]', plan: 'text-[10px]' };
  return (
    <span className={`inline-flex items-center gap-2 leading-none ${className}`} aria-label={`Apex ${plan}`}>
      <ApexMark size={dim.mark} />
      <span className={`${dim.name} font-semibold tracking-tight`}>Apex</span>
      <span className={`${dim.plan} font-semibold uppercase tracking-[0.16em] opacity-70 self-end pb-[3px]`}>{plan}</span>
    </span>
  );
}
