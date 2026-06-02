'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from './lib/auth';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const session = await getSession();
      if (session) {
        router.push('/dashboard');
      } else {
        router.push('/auth/login');
      }
    };
    checkAuth();
  }, [router]);

  return <div className="flex items-center justify-center h-screen">Cargando...</div>;
}
