import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'APEX — Plataforma de Inteligencia Clínica',
  description: 'Sistema de diagnóstico y protocolos para médicos',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&family=Lora:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet" />
        {/* Aplica el tema guardado ANTES de que se pinte la página — evita flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('apex-theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
