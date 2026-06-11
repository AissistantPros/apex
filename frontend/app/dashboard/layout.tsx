import ChatBubble from '@/app/components/ChatBubble';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ChatBubble />
    </>
  );
}
