'use client';

import TopNav from '@/app/components/TopNav';
import TeamChat from '@/app/components/TeamChat';
import ChatBubble from '@/app/components/ChatBubble';
import AppFooter from '@/app/components/AppFooter';
import { useDoctorProfile } from '@/app/lib/useDoctorProfile';
import { getRole } from '@/app/lib/role';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAgenda = pathname === '/dashboard/agenda';
  const { displayName, photoUrl } = useDoctorProfile();
  const [isDoctor, setIsDoctor] = useState(false);

  useEffect(() => {
    setIsDoctor(getRole() === 'doctor');
  }, []);

  return (
    <>
      <TopNav userName={displayName} photoUrl={photoUrl} />
      <div className={`md:pl-[232px] print:pl-0 ${isAgenda ? 'h-screen overflow-hidden flex flex-col' : ''}`}>
        {children}
        {!isAgenda && <AppFooter />}
      </div>
      <TeamChat />
      {isDoctor && <ChatBubble />}
    </>
  );
}
