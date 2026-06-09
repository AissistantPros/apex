'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, getSession } from '@/app/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      const session = await getSession();
      if (session) {
        router.push('/dashboard');
      }
    };
    checkAuth();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await signIn(email, password);

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Error al iniciar sesión');
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e]">
      <style>{`
        body::after {
          background-image:
            linear-gradient(rgba(0, 229, 160, 0.016) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 160, 0.016) 1px, transparent 1px);
          background-size: 48px 48px;
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
      `}</style>

      <div className="relative z-10 w-full max-w-md px-8">
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-10 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-9">
            <h1 className="text-5xl font-black text-[#00e5a0] tracking-wider mb-1" style={{ textShadow: '0 0 60px rgba(0, 229, 160, 0.25)' }}>
              APEX
            </h1>
            <p className="font-mono text-xs tracking-wider text-[#3d5870]">
              INTELIGENCIA CLÍNICA
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-xs tracking-wider text-[#7a95aa]">
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] font-sans text-sm outline-none transition-all focus:border-[#00e5a0] focus:shadow-[0_0_0_3px_rgba(0,229,160,.1)] placeholder-[#3d5870]"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-xs tracking-wider text-[#7a95aa]">
                CONTRASEÑA
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] font-sans text-sm outline-none transition-all focus:border-[#00e5a0] focus:shadow-[0_0_0_3px_rgba(0,229,160,.1)] placeholder-[#3d5870]"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="text-red-400 text-sm font-mono text-center">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg font-sans font-bold tracking-wider transition-all text-sm ${
                loading
                  ? 'bg-[#2a3f54] text-transparent cursor-not-allowed'
                  : 'bg-[#00e5a0] text-black hover:bg-[#00ffb0] hover:shadow-[0_6px_28px_rgba(0,229,160,.35)] hover:translate-y-[-1px]'
              }`}
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-[#3d5870] border-t-[#00e5a0] rounded-full animate-spin" />
              ) : (
                'INICIAR SESIÓN'
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
