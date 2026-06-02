# APEX — Setup Inicial

## Paso 1: Supabase (Base de datos + Auth)

1. Ve a https://supabase.com
2. Crea una cuenta (gratis)
3. Crea un nuevo proyecto
4. Una vez creado, ve a **Settings → API** y copia:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Anon Public Key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Service Role Key** → `SUPABASE_SERVICE_ROLE_KEY` (para backend)

5. Pega estas claves en:
   - `frontend/.env.local`
   - `backend/.env.local` (renombra `.env.example` a `.env.local`)

## Paso 2: Habilitar Auth en Supabase

1. En tu proyecto Supabase, ve a **Authentication**
2. Ve a **Providers**
3. Habilita **Email** (ya debe estar habilitado)
4. Ve a **Settings → Email Templates** y verifica que esté habilitado

## Paso 3: Crear tabla `users` en Supabase

1. Ve a **SQL Editor**
2. Corre este script:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT DEFAULT 'doctor',
  clinic_name TEXT,
  clinic_logo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: usuarios ven sus propios datos
CREATE POLICY "Users can view own data" 
  ON users FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id);
```

## Paso 4: Frontend - Instalar y correr

```bash
cd frontend
npm install
npm run dev
```

Abre http://localhost:3000

## Paso 5: Backend - Instalar y correr

```bash
cd backend
python -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

El backend estará en http://localhost:8000

## Paso 6: Crear un usuario de prueba en Supabase

1. Ve a **Authentication → Users**
2. Click **Add user**
3. Email: test@example.com
4. Password: password123
5. Click **Create user**

## Paso 7: Probar Login

1. Frontend está en http://localhost:3000
2. Login con: test@example.com / password123
3. Deberías ver la home con "Bienvenido Dr."

---

## Notas

- Las credenciales en `.env.local` son **locales solo**. No commitear a Git.
- Para production, usar variables de entorno en Vercel (frontend) y tu servidor (backend).
- Supabase Auth maneja el JWT automáticamente.
- El backend verifica tokens contra Supabase.
