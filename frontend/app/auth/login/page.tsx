'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, getSession } from '@/app/lib/auth';

// ─── Tipos de fase ────────────────────────────────────────────────────────────
type Phase = 'login' | 'booting' | 'done';

// ─── Pasos del arranque ───────────────────────────────────────────────────────
const BOOT_STEPS = [
  'Autenticando credenciales médicas',
  'Cargando base de conocimiento clínico',
  'Iniciando motor de análisis IA',
  'Sincronizando expedientes',
  'Conectando protocolos actualizados',
  'Sistema APEX listo',
];

// ─── Web Audio ────────────────────────────────────────────────────────────────
function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return ctxRef.current;
  }, []);

  const tone = useCallback((freq: number, startTime: number, duration: number, vol = 0.07, type: OscillatorType = 'sine') => {
    try {
      const ctx = getCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
      g.gain.setValueAtTime(0, ctx.currentTime + startTime);
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + startTime + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + startTime);
      o.stop(ctx.currentTime + startTime + duration + 0.05);
    } catch (_) {}
  }, [getCtx]);

  const playBoot = useCallback(() => {
    // Low hum
    tone(55, 0, 3.5, 0.035, 'sine');
    // Rising arpeggio
    [220, 262, 330, 392, 440, 523].forEach((f, i) => {
      tone(f, 0.38 + i * 0.41, 0.16, 0.065);
      tone(f * 1.5, 0.38 + i * 0.41, 0.1, 0.025);
    });
    // Final chimes
    tone(880,  2.95, 0.35, 0.09);
    tone(1100, 3.12, 0.45, 0.07);
    tone(1320, 3.26, 0.55, 0.055);
  }, [tone]);

  const playStepTick = useCallback((i: number) => {
    tone(440 + i * 80, 0, 0.08, 0.04, 'sine');
  }, [tone]);

  return { playBoot, playStepTick };
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [phase, setPhase]       = useState<Phase>('login');
  const [loginOut, setLoginOut] = useState(false);
  const [bootIn, setBootIn]     = useState(false);

  // Animación de pasos
  const [activeStep, setActiveStep]    = useState(-1);
  const [completedSteps, setCompleted] = useState<number[]>([]);
  const [barWidth, setBarWidth]        = useState(0);

  const authDone = useRef(false);
  const animDone = useRef(false);
  const redirectTo = useRef('/dashboard');

  const { playBoot, playStepTick } = useAudio();

  // Verificar sesión activa
  useEffect(() => {
    getSession().then(s => {
      if (s) router.push('/dashboard');
    });
  }, [router]);

  // ── Disparar redirect cuando ambos (auth + anim) terminan ─────────────────
  const tryRedirect = useCallback(() => {
    if (authDone.current && animDone.current) {
      setTimeout(() => router.push(redirectTo.current), 600);
    }
  }, [router]);

  // ── Secuencia de animación del arranque (con loop si auth tarda) ──────────
  const runBootAnimation = useCallback(() => {
    const STEP_DELAY = 1600; // ms entre pasos (~10s para 6 pasos)

    const runCycle = (startIdx: number, baseCompleted: number[]) => {
      BOOT_STEPS.forEach((_, i) => {
        setTimeout(() => {
          playStepTick(i);
          setCompleted(prev => i > 0 ? [...prev, startIdx + i - 1] : prev);
          setActiveStep(startIdx + i);
          // Barra: en loop la barra cicla entre 0 y 95% para no llegar al 100 antes de terminar
          const progress = authDone.current
            ? 100
            : Math.min(95, Math.round(((i + 1) / BOOT_STEPS.length) * 95));
          setBarWidth(progress);
        }, i * STEP_DELAY);
      });

      const cycleTime = BOOT_STEPS.length * STEP_DELAY + 400;
      setTimeout(() => {
        if (authDone.current) {
          // Auth ya terminó — completar y redirigir
          setCompleted(prev => [...prev, startIdx + BOOT_STEPS.length - 1]);
          setActiveStep(-1);
          setBarWidth(100);
          animDone.current = true;
          tryRedirect();
        } else {
          // Auth aún no termina — reset visual y volver a empezar
          setCompleted([]);
          setActiveStep(-1);
          setBarWidth(0);
          setTimeout(() => runCycle(startIdx + BOOT_STEPS.length, []), 300);
        }
      }, cycleTime);
    };

    runCycle(0, []);
  }, [playStepTick, tryRedirect]);

  // ── Submit login ─────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');

    // 1. Fade out login
    setLoginOut(true);

    // 2. Sonido de arranque
    setTimeout(() => playBoot(), 200);

    // 3. Mostrar pantalla de carga
    setTimeout(() => {
      setPhase('booting');
      setTimeout(() => setBootIn(true), 30);
      runBootAnimation();
    }, 600);

    // 4. Auth en paralelo
    try {
      const { data, error: authError } = await signIn(email, password);
      if (authError) {
        // Si falla, volver al login
        setTimeout(() => {
          setPhase('login');
          setLoginOut(false);
          setBootIn(false);
          setActiveStep(-1);
          setCompleted([]);
          setBarWidth(0);
          authDone.current = false;
          animDone.current = false;
          setError(authError.message === 'Invalid login credentials'
            ? 'Email o contraseña incorrectos'
            : authError.message);
        }, 1200);
        return;
      }
      if (data?.session) {
        authDone.current = true;
        tryRedirect();
      }
    } catch (_) {
      setPhase('login');
      setLoginOut(false);
      setError('Error de conexión');
    }
  };

  // ─── PANTALLA DE CARGA ────────────────────────────────────────────────────
  if (phase === 'booting') {
    return (
      <div className="fixed inset-0 bg-[#070a0e] flex flex-col items-center justify-center overflow-hidden"
        style={{ opacity: bootIn ? 1 : 0, transition: 'opacity 0.5s ease' }}>

        {/* Grid overlay */}
        <div className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(0,229,160,.016) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,160,.016) 1px,transparent 1px)',
            backgroundSize: '48px 48px'
          }} />

        {/* Scan line */}
        <div className="fixed left-0 right-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg,transparent,rgba(0,229,160,.45),transparent)',
            animation: 'scanLine 2.5s linear infinite',
          }} />

        <div className="relative z-1 flex flex-col items-center w-full max-w-[460px] px-6">

          {/* Spinning rings + logo */}
          <div className="relative w-28 h-28 mb-10 flex-shrink-0">
            {/* Glow */}
            <div className="absolute inset-[-28px] rounded-full"
              style={{
                background: 'radial-gradient(circle,rgba(0,229,160,.12),transparent 70%)',
                animation: 'glowPulse 1.6s ease-in-out infinite',
              }} />
            {/* Outer slow ring */}
            <div className="absolute inset-[-22px] rounded-full border border-transparent"
              style={{ borderTopColor: 'rgba(167,139,250,.18)', animation: 'spin 3.5s linear infinite' }} />
            {/* Main fast ring */}
            <div className="absolute inset-[-8px] rounded-full"
              style={{
                border: '2px solid transparent',
                borderTopColor: '#00e5a0',
                borderRightColor: 'rgba(0,229,160,.25)',
                animation: 'spin 1.1s linear infinite',
              }} />
            {/* Inner reverse ring */}
            <div className="absolute inset-[8px] rounded-full"
              style={{
                border: '1px solid transparent',
                borderBottomColor: '#0ea5e9',
                borderLeftColor: 'rgba(14,165,233,.2)',
                animation: 'spin 1.9s linear infinite reverse',
              }} />
            {/* Logo center */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[#00e5a0] text-3xl font-black tracking-wider"
                style={{ textShadow: '0 0 40px rgba(0,229,160,.5)' }}>
                APEX
              </span>
            </div>
          </div>

          {/* Title */}
          <div className="font-mono text-[10px] tracking-[5px] text-[#3d5870] uppercase mb-8">
            Iniciando sistema
          </div>

          {/* Steps */}
          <div className="w-full flex flex-col gap-1.5 mb-6">
            {BOOT_STEPS.map((msg, i) => {
              const isActive = activeStep === i;
              const isDone   = completedSteps.includes(i);
              return (
                <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg border font-mono text-xs transition-all duration-300"
                  style={{
                    opacity:     isActive || isDone ? 1 : 0.15,
                    transform:   isActive || isDone ? 'translateX(0)' : 'translateX(-8px)',
                    borderColor: isActive ? 'rgba(0,229,160,.28)' : isDone ? 'rgba(14,165,233,.18)' : '#1e2d3d',
                    background:  isActive ? 'rgba(0,229,160,.05)' : 'transparent',
                    color:       isActive ? '#00e5a0' : isDone ? '#7a95aa' : '#3d5870',
                  }}>
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold transition-all"
                    style={{
                      background: isActive ? '#00e5a0' : isDone ? '#0ea5e9' : '#1e2d3d',
                      color:      isActive ? '#000' : isDone ? '#fff' : '#3d5870',
                      boxShadow:  isActive ? '0 0 0 3px rgba(0,229,160,.2)' : 'none',
                      animation:  isActive ? 'stepPulse 0.8s ease-in-out infinite' : 'none',
                    }}>
                    {isDone ? '✓' : isActive ? '●' : '—'}
                  </div>
                  {msg}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="w-full h-0.5 bg-[#1e2d3d] rounded overflow-hidden mb-3">
            <div className="h-full rounded transition-all duration-500 ease-out"
              style={{
                width: `${barWidth}%`,
                background: 'linear-gradient(90deg, #0ea5e9, #00e5a0)',
              }} />
          </div>

          <div className="font-mono text-[10px] text-[#3d5870] tracking-[2px]">
            APEX v3.0 · Módulos del sistema
          </div>
        </div>

        <style>{`
          @keyframes scanLine   { 0% { top: 0 } 100% { top: 100vh } }
          @keyframes spin       { to { transform: rotate(360deg) } }
          @keyframes glowPulse  { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.12)} }
          @keyframes stepPulse  { 0%,100%{box-shadow:0 0 0 0 rgba(0,229,160,.4)} 60%{box-shadow:0 0 0 6px rgba(0,229,160,0)} }
        `}</style>
      </div>
    );
  }

  // ─── PANTALLA DE LOGIN ────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#070a0e] flex items-center justify-center overflow-hidden"
      style={{ opacity: loginOut ? 0 : 1, filter: loginOut ? 'blur(14px)' : 'none', transition: 'opacity 0.55s ease, filter 0.55s ease' }}>

      {/* Grid */}
      <div className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,229,160,.016) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,160,.016) 1px,transparent 1px)',
          backgroundSize: '48px 48px'
        }} />

      {/* Ambient gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 70% 55% at 25% 25%, rgba(0,229,160,.09), transparent), radial-gradient(ellipse 60% 50% at 75% 75%, rgba(14,165,233,.07), transparent)',
            animation: 'ambientBg 9s ease-in-out infinite alternate',
          }} />
        <div className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 40% 30% at 60% 40%, rgba(167,139,250,.05), transparent)',
            animation: 'ambientBg 12s ease-in-out infinite alternate-reverse',
          }} />
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-[400px] px-6">
        <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl px-9 py-10"
          style={{
            boxShadow: '0 0 80px rgba(0,229,160,.06), 0 32px 64px rgba(0,0,0,.5)',
            animation: 'cardIn 0.9s cubic-bezier(.16,1,.3,1) forwards',
          }}>

          {/* Logo */}
          <div className="text-center mb-9">
            <div className="text-[52px] font-black text-[#00e5a0] tracking-[3px] leading-none"
              style={{ textShadow: '0 0 60px rgba(0,229,160,.25)' }}>
              APEX
            </div>
            <div className="font-mono text-[11px] tracking-[5px] text-[#3d5870] mt-1.5">
              PLATAFORMA DE INTELIGENCIA CLÍNICA
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block font-mono text-[11px] tracking-[1px] text-[#7a95aa] mb-1.5">
                USUARIO / CORREO
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="dr.juarez@clinica.mx" autoComplete="email"
                className="w-full px-3.5 py-[11px] bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-[15px] outline-none transition-all focus:border-[#00e5a0] focus:shadow-[0_0_0_3px_rgba(0,229,160,.1)] placeholder-[#3d5870]"
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] tracking-[1px] text-[#7a95aa] mb-1.5">
                CONTRASEÑA
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password"
                onKeyDown={e => { if (e.key === 'Enter') handleLogin(e as any); }}
                className="w-full px-3.5 py-[11px] bg-[#111820] border border-[#1e2d3d] rounded-lg text-[#dde6ef] text-[15px] outline-none transition-all focus:border-[#00e5a0] focus:shadow-[0_0_0_3px_rgba(0,229,160,.1)] placeholder-[#3d5870]"
              />
            </div>

            {error && (
              <div className="text-[#f43f5e] text-sm font-mono text-center bg-[rgba(244,63,94,.07)] border border-[rgba(244,63,94,.2)] rounded-lg py-2 px-3">
                {error}
              </div>
            )}

            <button type="submit"
              disabled={!email || !password}
              className="w-full py-[13px] mt-1 rounded-xl font-bold text-[15px] tracking-[0.5px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: '#00e5a0',
                color: '#000',
              }}
              onMouseEnter={e => {
                if (email && password) {
                  (e.target as HTMLButtonElement).style.background = '#00ffb0';
                  (e.target as HTMLButtonElement).style.boxShadow = '0 6px 28px rgba(0,229,160,.35)';
                  (e.target as HTMLButtonElement).style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.background = '#00e5a0';
                (e.target as HTMLButtonElement).style.boxShadow = 'none';
                (e.target as HTMLButtonElement).style.transform = 'none';
              }}>
              Iniciar sesión
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes cardIn    { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ambientBg { 0%{transform:scale(1)} 100%{transform:scale(1.12) translate(2%,2%)} }
      `}</style>
    </div>
  );
}
