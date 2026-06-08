import { Session, User } from '@supabase/supabase-js';

// Mock Auth para MVP (sin Supabase)
const MOCK_USERS: Record<string, any> = {};

export async function signUp(email: string, password: string, fullName: string) {
  if (!email || !password) {
    return { data: null, error: { message: 'Email y contraseña requeridos' } };
  }

  MOCK_USERS[email] = { email, password, fullName };
  const mockUser = {
    id: 'user-' + Math.random().toString(36).substr(2, 9),
    email,
    user_metadata: { full_name: fullName },
  };

  const mockSession = {
    access_token: 'mock-token-' + Math.random().toString(36).substr(2, 9),
    user: mockUser,
  };

  localStorage.setItem('mock_session', JSON.stringify(mockSession));
  return { data: { user: mockUser, session: mockSession }, error: null };
}

export async function signIn(email: string, password: string) {
  if (!email || !password) {
    return { data: null, error: { message: 'Email y contraseña requeridos' } };
  }

  // Aceptar cualquier email/password para MVP
  const mockUser = {
    id: 'user-' + Math.random().toString(36).substr(2, 9),
    email,
    user_metadata: { full_name: email.split('@')[0] },
  };

  const mockSession = {
    access_token: 'mock-token-' + Math.random().toString(36).substr(2, 9),
    user: mockUser,
  };

  localStorage.setItem('mock_session', JSON.stringify(mockSession));
  return { data: { user: mockUser, session: mockSession }, error: null };
}

export async function signOut() {
  localStorage.removeItem('mock_session');
  return { error: null };
}

export async function getSession(): Promise<Session | null> {
  const session = localStorage.getItem('mock_session');
  return session ? JSON.parse(session) : null;
}

export async function getUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user || null;
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  // Para MVP, solo revisar localStorage
  const session = localStorage.getItem('mock_session');
  callback(session ? JSON.parse(session) : null);
  return { data: { subscription: { unsubscribe: () => {} } } };
}
