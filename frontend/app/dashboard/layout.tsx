'use client';

import TopNav from '@/app/components/TopNav';
import TeamChat from '@/app/components/TeamChat';
import ChatBubble from '@/app/components/ChatBubble';
import AppFooter from '@/app/components/AppFooter';
import { useDoctorProfile } from '@/app/lib/useDoctorProfile';
import { getRole } from '@/app/lib/role';
import { useEffect, useState } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { displayName, photoUrl } = useDoctorProfile();
  const [isDoctor, setIsDoctor] = useState(false);

  useEffect(() => {
    setIsDoctor(getRole() === 'doctor');
  }, []);

  return (
    <>
      <TopNav userName={displayName} photoUrl={photoUrl} />
      <div className="md:pl-[232px] print:pl-0">
        {children}
        <AppFooter />
      </div>
      <TeamChat />
      {isDoctor && <ChatBubble />}
    </>
  );
}
