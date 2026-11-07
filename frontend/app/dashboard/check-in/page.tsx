'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CheckInModal from '@/app/components/CheckInModal';

export default function CheckInPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-screen bg-[#070a0e] text-[#dde6ef] flex flex-col items-center justify-center p-4">
      <CheckInModal
        isOpen={open}
        onClose={() => router.push('/dashboard/sala')}
        onSuccess={(name) => {
          router.push('/dashboard/sala');
        }}
        onOpenNewPatient={(prefillName) => {
          router.push(`/dashboard/new-patient?name=${encodeURIComponent(prefillName || '')}`);
        }}
      />
    </div>
  );
}
