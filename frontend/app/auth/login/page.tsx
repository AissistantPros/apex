'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, getSession, resetPassword } from '@/app/lib/auth';
import { setRole, setPerms } from '@/app/lib/role';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const field = 'w-full min-h-[48px] px-3.5 rounded-lg text-[16px] outline-none transition focus:border-[var(--c-primary)]';
const fieldStyle = { background: 'var(--c-card)', border: '1px solid var(--c-border-2)', color: 'var(--c-text)' };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');

  // Si ya hay sesión activa, directo al inicio
  useEffect(() => {
    getSession().then(s => { if (s) router.push('/dashboard'); });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      // Login por USUARIO (sin correo): si no escribieron un correo, resolvemos el usuario.
      let loginEmail = email.trim();
      if (!loginEmail.includes('@')) {
        try {
          const res = await fetch(`${BACKEND()}/auth/resolve-username/${encodeURIComponent(loginEmail.toLowerCase())}`);
          if (res.ok) loginEmail = (await res.json()).email || loginEmail;
        } catch { /* si falla, se intenta tal cual */ }
      }
      const { data, error: authError } = await signIn(loginEmail, password);
      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'El usuario o la contraseña no coinciden. Revísalos e inténtalo de nuevo.'
          : authError.message);
        setLoading(false);
        return;
      }
      if (data?.session) {
        // Fijar el rol y permisos REALES de esta cuenta (los define el backend, no el usuario)
        let destino = '/dashboard';
        try {
          const who = await fetch(`${BACKEND()}/staff/whoami`, {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          }).then(r => r.ok ? r.json() : null);
          if (who?.role) setRole(who.role);
          if (who?.permissions) setPerms(who.permissions);
          // El admin proveedor va a SU plataforma, no al dashboard clínico.
          if (who?.role === 'admin') destino = '/admin';
        } catch { /* la barra de navegación lo re-sincroniza igual */ }
        router.push(destino);
      }
    } catch {
      setError('No se pudo conectar. Revisa tu internet e inténtalo de nuevo.');
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotError('');
    setForgotSending(true);
    const { error: err } = await resetPassword(forgotEmail.trim());
    setForgotSending(false);
    if (err) setForgotError('No se pudo enviar el correo. Revisa la dirección e inténtalo de nuevo.');
    else setForgotSent(true);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-10" style={{ background: 'var(--c-bg)' }}>
      <div className="w-full max-w-[400px]">
        <p className="text-[26px] font-semibold tracking-tight mb-8" style={{ color: 'var(--c-primary)' }}>Apex</p>

        <div className="rounded-xl p-7" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
          {!forgotOpen ? (
            <form onSubmit={handleLogin} className="space-y-5" noValidate>
              <div>
                <h1 className="text-[22px]" style={{ color: 'var(--c-text)' }}>Iniciar sesión</h1>
                <p className="text-[14px] mt-1" style={{ color: 'var(--c-text-2)' }}>Entra con tu usuario y contraseña.</p>
              </div>

              <div>
                <label htmlFor="usuario" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--c-text)' }}>Usuario o correo</label>
                <input id="usuario" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username"
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} className={field} style={fieldStyle} />
              </div>

              <div>
                <label htmlFor="clave" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--c-text)' }}>Contraseña</label>
                <input id="clave" type="password" value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password" className={field} style={fieldStyle} />
              </div>

              {error && (
                <p role="alert" className="text-[14px] rounded-lg px-3.5 py-2.5"
                  style={{ color: 'var(--c-danger)', background: 'color-mix(in srgb, var(--c-danger) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger) 28%, transparent)' }}>
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading || !email || !password}
                className="w-full min-h-[48px] rounded-lg text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}>
                {loading ? 'Entrando…' : 'Entrar'}
              </button>

              <button type="button" onClick={() => { setForgotOpen(true); setForgotEmail(email.includes('@') ? email : ''); }}
                className="block mx-auto text-[14px] font-medium hover:underline" style={{ color: 'var(--c-primary)' }}>
                Olvidé mi contraseña
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgot} className="space-y-5" noValidate>
              <div>
                <h1 className="text-[22px]" style={{ color: 'var(--c-text)' }}>Recuperar contraseña</h1>
                <p className="text-[14px] mt-1" style={{ color: 'var(--c-text-2)' }}>
                  {forgotSent ? 'Revisa tu correo: te enviamos un enlace para crear una contraseña nueva.' : 'Escribe tu correo y te enviamos un enlace para crear una contraseña nueva.'}
                </p>
              </div>

              {!forgotSent && (
                <div>
                  <label htmlFor="correo" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--c-text)' }}>Correo</label>
                  <input id="correo" type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    autoComplete="email" className={field} style={fieldStyle} />
                </div>
              )}

              {forgotError && (
                <p role="alert" className="text-[14px]" style={{ color: 'var(--c-danger)' }}>{forgotError}</p>
              )}

              {!forgotSent && (
                <button type="submit" disabled={forgotSending || !forgotEmail.trim()}
                  className="w-full min-h-[48px] rounded-lg text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--c-primary)', color: 'var(--c-primary-fg)' }}>
                  {forgotSending ? 'Enviando…' : 'Enviar enlace'}
                </button>
              )}

              <button type="button" onClick={() => { setForgotOpen(false); setForgotSent(false); setForgotError(''); }}
                className="block mx-auto text-[14px] font-medium hover:underline" style={{ color: 'var(--c-primary)' }}>
                Volver a iniciar sesión
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
