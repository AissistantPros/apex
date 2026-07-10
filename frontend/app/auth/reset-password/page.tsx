'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');
  const [ready, setReady]         = useState(false);

  useEffect(() => {
    // Supabase sets the session from the URL hash automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    if (password.length < 6) { setError('Mínimo 6 caracteres.'); return; }
    setSaving(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setError(error.message); }
    else { setDone(true); setTimeout(() => router.push('/auth/login'), 2500); }
  };

  return (
    <div className="fixed inset-0 bg-[#070a0e] flex items-center justify-center"
      style={{
        backgroundImage: 'linear-gradient(rgba(0,229,160,.016) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,160,.016) 1px,transparent 1px)',
        backgroundSize: '48px 48px'
      }}>
      <div className="w-full max-w-[400px] px-6">
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl px-9 py-10"
          style={{ boxShadow: '0 0 80px rgba(0,229,160,.06), 0 32px 64px rgba(0,0,0,.5)' }}>

          <div className="text-center mb-8">
            <div className="text-[42px] font-black text-[#00e5a0] tracking-[3px] leading-none"
              style={{ textShadow: '0 0 60px rgba(0,229,160,.25)' }}>APEX</div>
            <div className="font-mono text-[10px] tracking-[4px] text-[#3d5870] mt-1.5">NUEVA CONTRASEÑA</div>
          </div>

          {done ? (
            <div className="text-center space-y-2">
              <p className="text-[#00e5a0] font-mono text-sm">✓ Contraseña actualizada</p>
              <p className="text-[#3d5870] text-xs font-mono">Redirigiendo al login…</p>
            </div>
          ) : !ready ? (
            <p className="text-center text-[#3d5870] text-xs font-mono">Verificando link…</p>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="block font-mono text-[11px] tracking-[1px] text-[#7a95aa] mb-1.5">NUEVA CONTRASEÑA</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres" autoComplete="new-password"
                  className="w-full px-3.5 py-[11px] bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-[15px] outline-none focus:border-[#00e5a0] focus:shadow-[0_0_0_3px_rgba(0,229,160,.1)] placeholder-[#3d5870] transition" />
              </div>
              <div>
                <label className="block font-mono text-[11px] tracking-[1px] text-[#7a95aa] mb-1.5">CONFIRMAR CONTRASEÑA</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña" autoComplete="new-password"
                  className="w-full px-3.5 py-[11px] bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-[15px] outline-none focus:border-[#00e5a0] focus:shadow-[0_0_0_3px_rgba(0,229,160,.1)] placeholder-[#3d5870] transition" />
              </div>

              {error && (
                <div className="text-[#f43f5e] text-sm font-mono text-center bg-[rgba(244,63,94,.07)] border border-[rgba(244,63,94,.2)] rounded-lg py-2 px-3">
                  {error}
                </div>
              )}

              <button type="submit" disabled={!password || !confirm || saving}
                className="w-full py-[13px] mt-1 rounded-xl font-bold text-[15px] tracking-[0.5px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#00e5a0', color: '#000' }}>
                {saving ? 'Guardando…' : 'Guardar nueva contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
