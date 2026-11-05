import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Apex',
  description: 'Administración de consultorios',
};

// Antes de pintar: tema guardado (claro por defecto) y marca del consultorio en caché,
// para que no haya parpadeo de colores al cargar.
const initScript = `(function(){try{
var t=localStorage.getItem('apex-theme')||'light';
document.documentElement.setAttribute('data-theme',t);
var b=JSON.parse(localStorage.getItem('apex_brand')||'null');
if(b&&typeof b.css==='string'){var s=document.createElement('style');s.id='apex-brand';s.textContent=b.css;document.head.appendChild(s);}
}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
