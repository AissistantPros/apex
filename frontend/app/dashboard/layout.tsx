'use client';

import TopNav from '@/app/components/TopNav';
import TeamChat from '@/app/components/TeamChat';
import { useDoctorProfile } from '@/app/lib/useDoctorProfile';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { displayName, photoUrl } = useDoctorProfile();
  return (
    <>
      <TopNav userName={displayName} photoUrl={photoUrl} />
      {children}
      <TeamChat />
    </>
  );
}
