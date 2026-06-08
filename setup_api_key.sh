#!/bin/bash

echo "╔════════════════════════════════════════════════════════╗"
echo "║     APEX — Configuración de Claude API Key             ║"
echo "╚════════════════════════════════════════════════════════╝"

echo ""
echo "1️⃣  ANTES DE CONTINUAR:"
echo "   • Ve a https://console.anthropic.com"
echo "   • Obtén tu API Key (sk-ant-...)"
echo "   • Tenla lista para pegar"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "2️⃣  PEGA TU API KEY:"
read -p "API Key: " API_KEY

# Validar formato
if [[ ! $API_KEY =~ ^sk-ant- ]]; then
    echo "❌ ERROR: La clave debe empezar con 'sk-ant-'"
    exit 1
fi

echo ""
echo "3️⃣  Configurando..."

# Opción A: Guardar en .env.local
echo "ANTHROPIC_API_KEY=$API_KEY" > /Users/esteban/Desktop/Apex/App/backend/.env.local

echo "✅ API Key guardada en /backend/.env.local"

# Opción B: Exportar variable de entorno para esta sesión
export ANTHROPIC_API_KEY="$API_KEY"

echo ""
echo "4️⃣  Iniciando Backend..."

# Matar proceso anterior
pkill -f "python.*main.py" 2>/dev/null

sleep 1

# Iniciar backend con API key
cd /Users/esteban/Desktop/Apex/App/backend
/Users/esteban/Desktop/Apex/App/backend/venv/bin/python main.py &

BACKEND_PID=$!

echo "   PID: $BACKEND_PID"

sleep 3

# Verificar que inició
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Backend corriendo en http://localhost:8000"
else
    echo "❌ Error iniciando backend"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo ""
echo "5️⃣  LISTO!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 PRÓXIMOS PASOS:"
echo ""
echo "   1. Abre http://localhost:3000 en el navegador"
echo "   2. Login (cualquier email/password)"
echo "   3. Nuevo Paciente → Completa 3 fases"
echo "   4. Nueva Visita → Completa 7 bloques"
echo "   5. Se abre análisis → Click 'Iniciar Análisis'"
echo ""
echo "   El sistema generará diagnósticos con Claude API ✨"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   • API Key guardada en: /backend/.env.local"
echo "   • Es privada - NO la compartas"
echo "   • Costo: ~$0.05-0.10 por análisis"
echo "   • Tienes $5 USD de crédito gratis"
echo ""
