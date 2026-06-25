'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/app/lib/auth';

export default function StaffPage() {
  const router = useRouter();

  useEffect(() => {
    getUser().then(u => { if (!u) router.push('/auth/login'); });
  }, []);

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <main className="page-content pt-16 px-6 py-10">
        <h1 className="text-2xl font-serif font-semibold text-[#dde6ef] mb-2">🩺 Gestión de Staff</h1>
        <p className="text-[#7a95aa] mb-8">Administra los permisos de tu equipo de trabajo.</p>
        <div className="bg-[#0d1520] border border-[#a78bfa]/30 rounded-2xl p-10 text-center">
          <p className="text-5xl mb-4">🚧</p>
          <p className="text-[#dde6ef] text-lg font-semibold mb-2">Próximamente</p>
          <p className="text-[#7a95aa] text-sm max-w-md mx-auto">
            Aquí podrás dar de alta recepcionistas y enfermeras, asignar permisos
            y controlar el acceso de cada miembro de tu equipo.
          </p>
        </div>
      </main>
    </div>
  );
}
