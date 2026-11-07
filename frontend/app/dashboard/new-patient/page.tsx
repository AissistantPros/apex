'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import NewPatientWizard from '@/app/components/NewPatientWizard';

export default function NewPatientPage() {
  const router = useRouter();

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070a0e] text-[#7a95aa] p-8 flex items-center justify-center">Cargando asistente de nuevo paciente...</div>}>
      <NewPatientWizard
        onCancel={() => router.back()}
        onSuccess={(id) => router.push('/dashboard/sala')}
      />
    </Suspense>
  );
}
