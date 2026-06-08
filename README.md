# 🏥 APEX — Medical AI Analysis System

```
    █████╗ ██████╗ ███████╗██╗  ██╗
   ██╔══██╗██╔══██╗██╔════╝╚██╗██╔╝
   ███████║██████╔╝█████╗   ╚███╔╝ 
   ██╔══██║██╔═══╝ ██╔══╝   ██╔██╗ 
   ██║  ██║██║     ███████╗██╔╝ ██╗
   ╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝
   
   Cascading AI Diagnosis System
   Medical Analysis with Claude
```

## ⚡ EMPEZAR EN 5 MINUTOS

```bash
# 1. Obtén API Key en https://console.anthropic.com
# 2. Ejecuta:
cd /Users/esteban/Desktop/Apex/App
bash setup_api_key.sh
# 3. Pega tu API Key (sk-ant-...)
# 4. Abre http://localhost:3000
# 5. Ve a QUICKSTART.md para pasos detallados
```

---

## 📚 DOCUMENTACIÓN (en orden)

1. **QUICKSTART.md** ← EMPIEZA AQUÍ (paso a paso visual)
2. **STATUS.md** (estado actual del sistema)
3. **ARCHITECTURE_ANALYSIS.md** (arquitectura técnica)
4. **IMPLEMENTATION_SUMMARY.md** (lo que se implementó)

---

## 🎯 ¿QUÉ ES APEX?

Sistema completo de análisis clínico con IA Claude:

✅ **Registro paciente** en 3 fases  
✅ **Captura de visita** con 7 bloques de datos  
✅ **Diagnósticos cascada** (Tradicional → Funcional → Longevidad)  
✅ **Chat doctor-IA** integrado  
✅ **Protocolos automáticos** (3 niveles)  
✅ **Documentos PDF** (receta, estudios, reporte)

---

## 🚀 FLUJO RÁPIDO

```
Login → Nuevo Paciente (3 fases) → Nueva Visita → 
Se abre automáticamente ANÁLISIS → 
Click "Iniciar Análisis" → 
VER DIAGNÓSTICOS ✨ (30-60 seg)
```

---

## 🔑 API KEY

### Paso 1: Obtener (gratis)
```
https://console.anthropic.com → API Keys → Create Key
Copiar: sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
Crédito gratis: $5 USD (~50-100 análisis)
```

### Paso 2: Activar
```bash
bash setup_api_key.sh
# Pega tu API Key
# El script configura todo automáticamente
```

### Paso 3: Verificar
```bash
curl http://localhost:8000/health
# Debería responder: {"status":"ok"...}
```

---

## 📖 EJEMPLO DE SALIDA

**Diagnóstico Tradicional:**
```
Paciente 45 años con hipertensión estadío 1
Recomendación: Amlodipino 5mg diarios + estudios de glucosa
```

**Diagnóstico Funcional:**
```
Raíz: Síndrome metabólico por sedentarismo
Cascada: Inactividad → Insulinorresistencia → Inflamación → Hipertensión
```

**Diagnóstico Longevidad:**
```
Edad biológica: 51 años (6 años mayor)
Riesgo cardiovascular: ALTO
Con protocolo: -5 años en 2 años
```

---

## 💻 REQUISITOS

- macOS/Linux
- Node.js + npm (frontend)
- Python 3.13 (backend)
- Anthropic API Key ($5 gratis)

---

## 📊 STATUS ACTUAL

```
✅ Código: 100% completo
✅ Backend: Funcionando
✅ Frontend: Funcionando
⏳ Testing: Pendiente
⏳ PDFs: Estructura lista
⏳ BD: In-memory (pronto Supabase)
```

---

## 🆘 PROBLEMAS?

1. **Lee QUICKSTART.md** → Sección "SI ALGO FALLA"
2. **Verifica logs**: `tail -50 /tmp/apex_backend.log`
3. **Reinicia**: `bash setup_api_key.sh`

---

## 🎉 PRÓXIMOS PASOS

1. `bash setup_api_key.sh`
2. Abre http://localhost:3000
3. Lee QUICKSTART.md
4. Prueba con un paciente de ejemplo
5. Ve diagnósticos generados por Claude ✨

**¡Que disfrutes APEX!** 🚀

---

v0.1.0 | MVP | Ready for Testing
