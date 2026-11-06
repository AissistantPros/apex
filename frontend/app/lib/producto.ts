// Datos del producto que se muestran en el pie de página y en el login.
// La versión y el build salen de la compilación (ver next.config.js); lo demás se puede
// cambiar con variables de entorno de Vercel sin tocar el código.
export const PRODUCTO = {
  nombre: 'Apex',
  descripcion: 'Administración de consultorios',
  version: process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0',
  build: process.env.NEXT_PUBLIC_BUILD || '',
  desarrollador: process.env.NEXT_PUBLIC_DEV_NAME || 'AissistantPros',
  web: process.env.NEXT_PUBLIC_DEV_WEB || '',
  soporte: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '',
};

export const textoVersion = () => `v${PRODUCTO.version}${PRODUCTO.build ? ` · ${PRODUCTO.build}` : ''}`;
export const planNombre = (plan?: string | null) => (plan === 'apex_lite' ? 'Lite' : 'Pro');
