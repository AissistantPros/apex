# ⚡ APEX QUICKSTART — 5 MINUTOS

## 🎯 Objetivo
Obtener Claude API key y hacer tu primer análisis clínico IA

---

## ⏱️ PASO 1: Obtener API Key (2 min)

### 1.1 Ir a Anthropic Console
```
https://console.anthropic.com
```

### 1.2 Registrarse o Iniciar sesión
- Email: usa cualquier email tuyo
- Password: crea una contraseña
- Click en "Sign Up" o "Log In"

### 1.3 Ir a API Keys
```
Console > API Keys (en menú izquierdo)
```

### 1.4 Crear nueva clave
```
Click en "Create Key" o "New API Key"
```

### 1.5 Copiar la clave
```
Verás algo como: sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
👉 CÓPIALA (es la única vez que la ves)
```

**⏱️ Tiempo: ~2 minutos**

---

## ⏱️ PASO 2: Activar en APEX (2 min)

### OPCIÓN A: Script automático (RECOMENDADO)

```bash
# En terminal:
cd /Users/esteban/Desktop/Apex/App

# Ejecuta el script:
bash setup_api_key.sh

# Pega tu API key cuando pida
```

**✅ El script:**
- Guarda tu API key
- Reinicia el backend
- Verifica que funciona

**⏱️ Tiempo: ~1 minuto**

---

### OPCIÓN B: Manual

Si el script no funciona:

```bash
# 1. Matar backend anterior
pkill -f "python.*main.py"

# 2. Crear archivo .env.local
cat > /Users/esteban/Desktop/Apex/App/backend/.env.local << 'EOF'
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
EOF

# 3. Exportar variable
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx"

# 4. Iniciar backend
cd /Users/esteban/Desktop/Apex/App/backend
/Users/esteban/Desktop/Apex/App/backend/venv/bin/python main.py
```

**⏱️ Tiempo: ~2 minutos**

---

## ⏱️ PASO 3: Verificar que funciona (30 seg)

```bash
# En otra terminal:
curl http://localhost:8000/health
```

**Debería responder:**
```json
{
  "status": "ok",
  "message": "APEX Backend is running"
}
```

✅ **Backend listo con API activada**

---

## ⏱️ PASO 4: Primer análisis (2 min)

### 4.1 Abre http://localhost:3000

```
Navegador → http://localhost:3000
```

### 4.2 Login
```
Email: cualquier email (ej: test@test.com)
Password: cualquier password (ej: test123)
Click Login
```

### 4.3 Nuevo Paciente
```
Dashboard → "Nuevo Paciente"
Button: "Registro Completo de Paciente"
```

### 4.4 FASE 1: Recepcionista
```
Llena los campos básicos:
- Nombre: Juan Pérez
- Fecha nac: 1980-05-15
- Sexo: Masculino
- Email: juan@test.com
- Teléfono: 555-1234
- Emergencia: María (555-5678)

Click "Siguiente →"
```

### 4.5 FASE 2: Enfermera
```
Antecedentes:
- Familia: Padre diabético
- Personales: Presión alta desde 2018
- Alergias: Penicilina

Click "Siguiente →"
```

### 4.6 FASE 3: Doctor
```
Hábitos:
- Tabaco: Nunca fumó
- Alcohol: Ocasional
- Actividad: Gym 3x/semana
- Estrés: 6/10

Reproductiva (Masculino):
- ED: No refiere
- Testosterona: Nunca

Click "Guardar Paciente Completo"
```

### 4.7 Nueva Visita
```
Ficha del paciente → "Nueva Visita"

Completa rápidamente:
- Motivo: Check-up general
- PA: 130/80
- FC: 72
- Peso: 80 kg
- Altura: 1.75 m
- (Puedes dejar el resto vacío)

Click "Guardar Visita"
```

### 4.8 Análisis
```
Se abre automáticamente: /analysis/

Click botón: "Iniciar Análisis"

⏳ Espera 30-60 segundos...
```

### 4.9 Ver Resultados
```
Aparecerá diagnóstico generado por Claude

Opciones:
- ✓ Aceptar (siguiente paso)
- ✏️ Editar (modifica y continúa)
- ✍️ Escribir propio (tu diagnóstico)
- 💬 Chat (pregunta a la IA)

Elige "Aceptar" para ver los siguientes diagnósticos
```

---

## ✨ ¿QUÉ VAS A VER?

### Paso 1: Diagnóstico Tradicional
```
Ejemplo de salida:
"Paciente de 45 años presenta hipertensión stage 1, 
probablemente relacionada con estrés ocupacional y 
sedentarismo. Se sugieren estudios de función renal..."
```

### Paso 2: Diagnóstico Funcional
```
Ejemplo de salida:
"La raíz del problema es la disfunción endotelial
secundaria a síndrome metabólico.

Cascada:
Sedentarismo → Insulinorresistencia → Inflamación 
→ Disfunción endotelial → Hipertensión"
```

### Paso 3: Diagnóstico Longevidad
```
Ejemplo de salida:
"Edad biológica estimada: 52 años (7 años mayor que
la cronológica)

Riesgos a 5-10 años:
- Cardiovascular: ALTO
- Metabólico: MODERADO
- Neurológico: BAJO

Si sigue protocolo: -5 años de edad biológica en 2 años"
```

---

## 🎛️ CONTROLES

### Chat con IA

```
Pregunta: "¿Por qué dice que la presión es por estrés?"

IA Responde: "Porque has mencionado estrés 6/10 y 
antecedentes de presión alta desde 2018, que coincide 
con cambio laboral. Además, actividad física es 
regular pero no intensa..."
```

### Editar Diagnóstico

```
Click "✏️ Editar"
→ Abre textarea para editar
→ Modifica lo que quieras
→ Click "Guardar Edición"
```

### Escribir Propio

```
Click "✍️ Escribir Propio"
→ Escribe tu diagnóstico completo
→ Click "Guardar"
```

---

## 💰 COSTOS

```
Análisis típico = ~9,000 tokens (3 diagnósticos)
Costo = ~$0.05-0.10 por análisis

Anthropic te da: $5 USD de crédito GRATIS
Eso son: ~50-100 análisis sin pagar

Ve a: https://console.anthropic.com/usage
Para ver cuánto has consumido
```

---

## ❓ SI ALGO FALLA

### Error: "Connection refused"
```bash
# Backend no está corriendo
pkill -f "python.*main.py"

# Reinicia con:
export ANTHROPIC_API_KEY="sk-ant-..."
cd /Users/esteban/Desktop/Apex/App/backend
/Users/esteban/Desktop/Apex/App/backend/venv/bin/python main.py
```

### Error: "API key invalid"
```bash
# La API key es incorrecta
# Ve a console.anthropic.com y genera una nueva
# O ejecuta: bash setup_api_key.sh
```

### Error: "Analysis failed"
```bash
# Mira el log del backend:
tail -20 /tmp/apex_backend.log

# Si ves "401 Unauthorized" = API key problem
# Si ves "429 Too Many Requests" = límite de uso
```

### Frontend no se actualiza
```bash
# Limpia cache:
rm -rf /Users/esteban/Desktop/Apex/App/frontend/.next

# Reinicia frontend:
npm run dev
```

---

## 📊 RESUMEN

```
┌────────────────────────────────────────┐
│  ✅ ANTES DE EMPEZAR                   │
├────────────────────────────────────────┤
│ • Backend corriendo: localhost:8000    │
│ • Frontend corriendo: localhost:3000   │
│ • API Key de Anthropic (sk-ant-...)   │
│ • Script setup_api_key.sh listo        │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  🚀 FLUJO RÁPIDO (5 MIN)               │
├────────────────────────────────────────┤
│ 1. Obtén API Key (2 min)               │
│ 2. Ejecuta: bash setup_api_key.sh      │
│ 3. Abre: http://localhost:3000         │
│ 4. Nuevo Paciente (3 fases, 2 min)     │
│ 5. Nueva Visita (1 min)                │
│ 6. Click "Iniciar Análisis" (30 seg)   │
│ 7. VER DIAGNÓSTICOS ✨                 │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  ✨ RESULTADO FINAL                    │
├────────────────────────────────────────┤
│ Sistema completo de análisis clínico   │
│ generado por Claude IA en tiempo real  │
│                                        │
│ Diagnóstico Tradicional ✓              │
│ Diagnóstico Funcional ✓                │
│ Diagnóstico Longevidad ✓               │
│ Con chat doctor-IA ✓                   │
│ Opciones aceptar/editar ✓              │
└────────────────────────────────────────┘
```

---

## 🎉 ¡LISTO!

```bash
bash setup_api_key.sh
# Pega tu API Key
# Espera 30 seg
# Backend iniciado ✅

# En navegador:
http://localhost:3000
# Sigue los pasos 4.2-4.9
```

**Si algo no funciona → Lee la sección "SI ALGO FALLA"**

**¿Preguntas? Revisa ARCHITECTURE_ANALYSIS.md o STATUS.md**

🚀 **¡Ahora sí, a probar APEX!**
