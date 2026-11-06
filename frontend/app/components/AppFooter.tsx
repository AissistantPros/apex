'use client';

// Pie de página: producto, versión, quién lo desarrolla y cómo pedir ayuda.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ApexLogo from '@/app/components/ApexLogo';
import { PRODUCTO, planNombre, textoVersion } from '@/app/lib/producto';
import { useEntitlements } from '@/app/lib/useEntitlements';
import { getRole } from '@/app/lib/role';

export default function AppFooter() {
  const router = useRouter();
  const { plan } = useEntitlements();
  const hoy = new Date().getFullYear();
  // El rol vive en el navegador: se lee tras montar (si no, el HTML del servidor no coincide).
  const [esDoctor, setEsDoctor] = useState(false);
  useEffect(() => { setEsDoctor(getRole() === 'doctor'); }, []);

  return (
    <footer className="mt-14" style={{ background: 'var(--c-card)', borderTop: '1px solid var(--c-border)' }}>
      <div className="page-content py-7 grid gap-5 md:grid-cols-3 md:items-center text-[13px]" style={{ color: 'var(--c-text-2)' }}>
        <div className="flex flex-col gap-1.5">
          <span style={{ color: 'var(--c-primary)' }}><ApexLogo plan={planNombre(plan)} size="sm" /></span>
          <span>{PRODUCTO.descripcion}</span>
        </div>

        <div className="md:text-center">
          <p>
            Desarrollado por{' '}
            {PRODUCTO.web
              ? <a href={PRODUCTO.web} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--c-text)' }}>{PRODUCTO.desarrollador}</a>
              : <span className="font-semibold" style={{ color: 'var(--c-text)' }}>{PRODUCTO.desarrollador}</span>}
          </p>
          <p className="mt-0.5">© {hoy} · Todos los derechos reservados</p>
        </div>

        <div className="md:text-right">
          <p>Versión <span className="font-medium" style={{ color: 'var(--c-text)' }}>{textoVersion()}</span></p>
          <p className="mt-0.5">
            {PRODUCTO.soporte && <><a href={`mailto:${PRODUCTO.soporte}`} className="hover:underline" style={{ color: 'var(--c-primary)' }}>{PRODUCTO.soporte}</a>{esDoctor ? ' · ' : ''}</>}
            {esDoctor && <button onClick={() => router.push('/dashboard/soporte')} className="hover:underline" style={{ color: 'var(--c-primary)' }}>Pedir soporte</button>}
          </p>
        </div>
      </div>
    </footer>
  );
}
