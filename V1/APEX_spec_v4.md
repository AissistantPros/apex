# APEX — Especificación del Producto v4.0
# Mayo 2026 | Para uso con Claude Code

---

## 1. QUÉ ES APEX

SaaS B2B para médicos. NO es un chatbot. Es:
- CRM médico + expediente clínico + motor de diagnóstico IA + sistema de protocolos
- Medicina tradicional + medicina funcional + medicina de longevidad
- El médico es más completo sin cambiar su forma de trabajar
- APEX es invisible para el paciente. El crédito es del médico.

---

## 2. STACK TÉCNICO

- Frontend: Next.js + Vercel
- Backend: FastAPI (Python) — API keys SOLO aquí, nunca en cliente
- DB: Supabase (PostgreSQL + RLS + Auth + Storage)
- RAG: Google Vertex AI RAG Engine (Serverless Mode + Cross Corpus Retrieval)
- LLM: Anthropic Claude (via Vertex AI)
- Deep research: Perplexity API o Exa.ai
- Audio transcripción: Whisper API
- Pagos: Stripe

---

## 3. ROLES Y ACCESOS

### ROL: recepcionista
Acceso:
- Buscar pacientes
- Ver/editar: nombre, foto, correo, teléfonos, contacto emergencia
- Dar de alta nuevo paciente (solo bloque identificación + cómo llegó)
- Enviar por correo receta/reporte/estudios SIN ver contenido
NO puede ver: signos vitales, labs, diagnósticos, historial médico, notas, nada clínico

### ROL: enfermera
Acceso: todo lo de recepcionista +
- Capturar signos vitales: presión (ambos brazos), FC, temperatura, saturación, glucosa (+ horas ayuno)
- Mediciones: peso, talla, circunferencias (abdominal, cintura, cadera, cuello, bíceps, muñeca)
- InBody/bioimpedancia si hay
- Pruebas funcionales: fuerza de agarre, velocidad marcha, sentarse/levantarse, equilibrio monopodal
- Registrar que se realizó ECG (el médico hace la interpretación)
NO puede ver: historial, diagnósticos, notas médicas, labs anteriores, análisis APEX

### ROL: médico
Acceso: todo. Incluyendo:
- Parte 2 del interrogatorio (preguntas privadas)
- Historial completo, diagnósticos, análisis APEX, notas, labs, chat
- Configurar categorías de protocolo
- Ver estadísticas completas

### Toggle desktop/tablet
- Mismo sistema, mismo URL
- Botón toggle igual al de dark/light mode
- Modo tablet: botones grandes, touch friendly, flujo lineal
- Aplica principalmente a vista de enfermera

---

## 4. SEGURIDAD

### Capas de protección
1. JWT firmado con doctor_id/user_id + rol en cada petición
2. Backend extrae el rol del token antes de cualquier operación. Nunca confía en params del frontend
3. RLS en Supabase: WHERE tenant_id = jwt.tenant AND role_access >= required_level
4. Sin token válido: 0 filas devueltas, petición rechazada

### Separación de datos
- DB privada del médico: pacientes, historial, todo. APEX no puede verla. Solo el médico.
- DB de APEX: eventos anónimos (doctor_id + acción). Sin datos de pacientes. Separada desde el origen.

### Recuperación de contraseña
- Link único al correo registrado. Expira en 15-30 min.
- Nadie de APEX puede cambiar contraseñas ni ver datos.
- Pérdida de correo: verificación por videollamada, solo se cambia el correo registrado.

---

## 5. POLÍTICA DE CUENTAS

- Deja de pagar: cuenta congelada, datos intactos
- Días 1-30: puede reactivar pagando, todo sigue igual
- Día 30: aviso final "en 48h se eliminan tus datos"
- Día 32: eliminación permanente, sin recuperación
- Exportación de DB: disponible siempre con costo de servicio (aunque esté al corriente)
- Formato exportación: fichas básicas (nombre, fechas visitas, medicamentos, diagnósticos)
- Responsabilidad de resguardo: del médico (NOM-004-SSA3-2012 exige 5 años mínimo)

---

## 6. MENÚ PRINCIPAL (rol médico)

Header: "Bienvenido Dr. [Nombre]" + foto del médico + logo de su clínica (NO logo APEX)
Subtítulo: "¿En qué vamos a trabajar hoy?"

Elementos:
- Barra de búsqueda de paciente (nombre, apellido o ID)
- Botón: Nuevo Paciente
- Botón: Estadísticas
- Botón: Ayuda (?)
- Chat flotante APEX: esquina inferior derecha, SOLO en pantalla principal

### Chat flotante
- Solo en pantalla principal, NO en resto del sistema
- Sin memoria: cada sesión se borra al cerrar
- Indicador visible: "SIN MEMORIA"
- Acepta: texto, imágenes, PDF
- NO asociado a ningún paciente

---

## 7. FICHA DEL PACIENTE

### Vista rápida (siempre visible, máx 4-6 líneas)
- Resumen IA generado automáticamente
- Se regenera con cada cambio (nueva visita, nota nueva, edición)
- NO se regenera al abrir la pantalla, solo cuando hay cambio real

### Reporte completo (bajo demanda)
- Botón "Ver reporte completo"
- Gráficas de tendencia, biomarcadores, composición corporal, evolución

### Acciones disponibles
1. Nueva visita
2. Notas del paciente (SEPARADO del chat)
   - Input: texto, PDF, foto, audio (con transcripción automática a texto)
   - Sin respuesta del sistema, solo guardar
   - Actualiza resumen IA al guardar
3. APEX Chat (CON memoria, CON historial)
   - Cargado con todo el historial + notas recientes
   - Al cerrar sesión: IA genera resumen que se guarda en DB
   - Sistema trabaja con resúmenes acumulados, NO transcripciones completas
   - DIFERENTE visualmente del chat flotante de pantalla principal
4. Editar registro / eliminar

### Flujo tiempo real entre roles
Enfermera captura datos → guarda → médico recibe notificación → abre ficha con todo listo → recibe al paciente por nombre con contexto completo

---

## 8. REGISTRO NUEVO PACIENTE

### PARTE 1 — Recepción/Enfermería (puede llenar staff)

BLOQUE 1: Identificación y contacto
- Nombre completo, fecha nacimiento, sexo biológico, género (opcional), ocupación
- Foto del paciente (opcional)
- Correo electrónico, celular
- Persona de contacto emergencia: nombre, celular, correo
- ID único generado automáticamente

BLOQUE 2: Cómo llegó
- ¿Cómo nos conoció?: recomendación de paciente / recomendación de médico / redes sociales / búsqueda internet / página web / Google Maps / publicidad pagada / otro
- Si fue recomendación: ¿quién lo recomendó?
- Antes de venir revisó: redes sociales / página web / Google Maps (sí/no cada uno)

BLOQUE 3: Antecedentes heredofamiliares
- Padre, madre, abuelos paternos/maternos, hermanos
- Por familiar: diabetes, hipertensión, cáncer, cardiopatía, demencia, autoinmune, depresión, obesidad
- Causa de muerte si aplica

BLOQUE 4: Antecedentes personales patológicos
- Enfermedades crónicas + año diagnóstico
- Hospitalizaciones con motivo
- Cirugías con año aproximado
- Fracturas y traumatismos relevantes
- Transfusiones
- Alergias: medicamentos, alimentos, ambientales
- Enfermedades relevantes de infancia

BLOQUE 5: Medicamentos actuales reales
- Los que REALMENTE toma (no los que debería)
- Con frecuencia real y desde cuándo
- Búsqueda por nombre + campo libre

### PARTE 2 — Solo médico en consulta privada

BLOQUE 6: Hábitos privados
- Tabaquismo: nunca / exfumador desde cuándo / activo cuántos/día
- Alcohol: nunca / ocasional / frecuente / diario. Qué tipo.
- Sustancias recreativas: campo abierto (sin juzgar)
- Actividad física: tipo, frecuencia, intensidad
- Horas de sueño habituales
- Nivel de estrés percibido (1-10)

BLOQUE 7: Historia reproductiva (condicional por sexo)
- Mujeres: menarca, ciclos regulares, embarazos, partos, abortos, menopausia, anticonceptivo actual
- Hombres: disfunción eréctil conocida, uso previo testosterona exógena

---

## 9. DATOS POR VISITA

### BLOQUE A: Motivo de visita
- Qué lo trae hoy (campo libre)
- Intensidad del malestar 1-10
- Desde cuándo. ¿Primera vez?

### BLOQUE B: Signos vitales (enfermera o médico)
- Presión arterial: brazo derecho e izquierdo
- Frecuencia cardíaca
- Temperatura (Celsius)
- Saturación O2 (SpO2)
- Glucosa capilar + horas desde última comida (obligatorio)
- ECG: campo texto libre con interpretación del médico. Sistema compara con ECG anterior si existe.

### BLOQUE C: Composición corporal (enfermera o médico)
- Peso (kg), talla (primera visita, actualizar si cambia)
- IMC calculado automáticamente
- Circunferencias: abdominal, cintura, cadera, cuello, bíceps (brazo dominante), muñeca
- InBody/bioimpedancia si hay: % grasa, masa muscular, agua corporal, grasa visceral

### BLOQUE D: Pruebas funcionales (enfermera o médico)
- Fuerza de agarre: dinamómetro ambas manos (kg). Predictor mortalidad.
- Velocidad de marcha: segundos para 4 metros. Predictor mortalidad.
- Test sentarse/levantarse: veces en 30s sin apoyo. Predictor sarcopenia.
- Equilibrio monopodal: segundos en un pie ojos cerrados. <10s en <60 años = alerta.
- VO2 max estimado: opcional, Test Cooper o wearable.
- Test cognitivo Mini-Cog: solo cuando médico lo considere relevante.
- Si no se puede hacer alguna: sistema usa datos anteriores y lo indica.

### BLOQUE E: Reporte subjetivo del paciente (médico)
- Energía al despertar/mediodía/fin del día (1-10 cada uno)
- Calidad sueño (1-10), horas dormidas, ¿se despierta descansado? (sí/no)
- Estado de ánimo: estable/ansioso/irritable/triste/sin motivación/bien
- Libido (1-10)
- Digestión: sin problemas/distensión/estreñimiento/diarrea/reflujo
- Color orina mañana: escala visual de colores
- Dolor hoy: dónde, intensidad 1-10
- Metas: qué le gustaría mejorar

### BLOQUE F: Observaciones clínicas del médico
- No obligatorio campo por campo
- Inspección general (campo libre)
- Piel y mucosas: coloración, ictericia, palidez, acné, rosácea, manchas, turgencia
- Ojos: ictericia escleral, xantelasmas, exoftalmos
- Boca: estado dental, lengua, faringe
- Tiroides, abdomen, neurológico
- Campo libre adicional

### BLOQUE G: Laboratorios con semáforo tricolor
- Acepta: PDF o foto. Extrae valores automáticamente.
- ROJO: fuera de rango de referencia del laboratorio. Requiere atención.
- AMARILLO: dentro de rango del lab, pero subóptimo para optimización.
- VERDE: rango de optimización según RAG (Attia, IFM, Gottfried, Lyon). Ajustado por sexo y edad.
- Rango del lab = define rojo y amarillo. Libros del RAG = definen verde.
- Ejemplo testosterona hombre 50 años: rojo <300, amarillo 300-599, verde 600-900 ng/dL

---

## 10. MOTOR DE ANÁLISIS

### Principio fundamental
Si no hay suficientes datos para un diagnóstico, el sistema NO diagnostica. Lo dice y explica qué datos necesita.

### Proceso interno (en paralelo)
1. Normalización de datos
2. Análisis de correlaciones
3. RAG (Vertex AI) + Deep Research (Perplexity/Exa) EN PARALELO
4. Fusión de resultados
5. Filtro anti-alucinaciones (segunda IA): cada afirmación debe tener respaldo bibliográfico
   - Para categorías sin RAG (herbolaria): filtro flexible + disclaimer
6. Entrega al médico

### Flujo de presentación: PRIMERO diagnóstico, LUEGO protocolo

PASO 1: Diagnóstico medicina tradicional
- Lo que un subespecialista diría
- Estudios sugeridos nivel urgente para confirmar/descartar
- Médico: acepta / pregunta / corrige / override

PASO 2: Diagnóstico medicina funcional
- La raíz del problema
- Cascada visual: diagrama de flujo con flechas, cada nodo expandible
- Referencias integradas en el razonamiento, no al final
- Estudios sugeridos nivel deseado

PASO 3: Diagnóstico medicina de longevidad
- Edad biológica estimada + justificación
- Visión a 5, 10 y 20 años sin intervención
- Estudios sugeridos nivel complementario
- Médico: acepta todos / pregunta / corrige / override
- Si cambia algo: sistema ajusta pasos siguientes si es necesario

PASO 4: Protocolo medicina tradicional + offlabel
PASO 5: Protocolo funcional + longevidad + suplementos + herbolaria (según filtros del médico)
PASO 6: Protocolo experimental (solo informativo, NUNCA se imprime)
PASO 7: Recomendaciones generales (dieta, hidratación con dosis, tipo ejercicio, sueño)
- Médico: acepta / pregunta / modifica / override por sección
- Todo queda registrado: propuesta del sistema + decisión del médico

### Tono del sistema
- Primera persona: "encontré", "me di cuenta que", "hice una búsqueda"
- Conciso y profesional. Sin relleno.
- Bibliografía integrada en el razonamiento, no al final como lista
- Cuando no sabe: "Esta categoría no está en mi base. Voy a usar deep research. Verifique antes de aplicar."
- Override: sistema acepta con respeto, puede señalar discrepancias con datos pero nunca es condescendiente

### Estudios sugeridos: 3 niveles
- URGENTE: necesario para confirmar/descartar algo específico que los síntomas ya sugieren
- DESEADO: no urgente, panorama más completo, ideal para próxima visita
- COMPLEMENTARIO: para ir a fondo en optimización, no necesario en mayoría de casos

### 4 capas de protocolo
1. Protocolos internacionales + offlabel con respaldo
   - Offlabel con evidencia va AQUÍ, no en experimental
   - Estilo de vida básico (sueño, agua, ejercicio, alimentación) va siempre aquí, es no negociable
2. Suplementos y nutracéuticos
   - Criterio: dosis controlable y estandarizable (cápsula, extracto estandarizado)
3. Herbolaria
   - Criterio: preparaciones sin control de concentración (infusiones, ramas, hojas)
   - Deep research + filtro flexible + disclaimer
4. Experimental
   - Solo informativo. NUNCA se imprime para el paciente.
   - Por item: nombre + para qué ayudaría + estrellas seguridad (1-5) + estrellas evidencia (1-5)
   - Items con muertes o accidentes graves: NO SE MENCIONAN
   - Marco legal México: COFEPRIS no ha aprobado para uso general

### Regla crítica: cada item aparece UNA SOLA VEZ
- En la capa que corresponde a su nivel de evidencia principal
- Si tiene múltiples indicaciones, se explican todas en esa misma entrada
- Ejemplo: metformina va en Capa 1 con: indicación principal (prediabetes ADA 2023) + offlabel longevidad (TAME)

### Niveles de evidencia por item
- FUERTE: meta-análisis, RCTs multicéntricos, guidelines internacionales
- MODERADA: estudios observacionales calidad, RCTs pequeños, consenso publicado
- LIMITADA: series de casos, estudios piloto
- USO EXTENDIDO: práctica clínica amplia sin RCTs formales
- EXPERIMENTAL: solo preclínico o estudios muy limitados en humanos

---

## 11. GUARDADO Y DOCUMENTOS

### Qué se guarda al cerrar visita
- Diagnóstico sugerido por APEX
- Decisión del médico: aceptó o corrigió (si corrigió, ambos se guardan para comparación)
- Protocolo sugerido por APEX
- Decisión del médico: aceptó / modificó (qué cambió exactamente) / override total
- Magnitud del cambio registrada (ajuste de dosis vs. cambio completo)
- Estudios solicitados con nivel de urgencia
- Notas del médico
- Resumen de sesión APEX Chat generado por IA
- Fecha próxima visita sugerida

### 3 documentos imprimibles
1. Receta médica formal
   - Cumple NOM-168-SSA1-1998
   - Datos del médico, cédula, consultorio, fecha, paciente, medicamentos con dosis/frecuencia/duración
   - SIN experimentales JAMÁS
   - Solo identidad del médico/clínica, NO de APEX

2. Reporte del paciente
   - Para ser leído, no archivado. Marketing sin serlo.
   - Números clave, edad biológica, medidas, diagnóstico en lenguaje accesible
   - Protocolo con horarios, recomendaciones alimentación/hidratación/ejercicio
   - Notas del médico
   - SIN experimentales JAMÁS
   - Con o sin protocolo de optimización (el médico elige)

3. Solicitud de estudios
   - Solo nombre del estudio, sin justificar para qué
   - El médico decide qué platica con su paciente
   - Estudios sensibles (VIH, ETS, cáncer): NUNCA se justifican por escrito

### Opciones de entrega
- Imprimir cualquiera de los 3 documentos
- Enviar por correo al paciente (la recepcionista puede hacer esto sin ver el contenido)

### Fase futura: página web personalizada por paciente
- Generada por visita con medicamentos/horarios, dieta, ejercicio con imágenes, reporte completo
- Se actualiza con cada visita
- Acceso exclusivo del paciente con link único

---

## 12. ESTADÍSTICAS

Módulo accesible desde menú principal.
Default: reporte estándar armado por APEX.
Opcional: médico personaliza qué ver.

### Inteligencia Clínica
- Diagnósticos más frecuentes
- Síntomas más reportados
- Medicamentos más recetados con dosis promedio
- Tratamientos con mayor impacto en biomarcadores
- Qué no ha funcionado
- Distribución por sexo y rango de edad
- Biomarcadores fuera de rango más comunes

### Inteligencia de Negocio
- Pacientes nuevos vs. continuidad por período
- Tasa de retención: cuántos regresaron, cuántos no
- Cómo llegaron los pacientes (por fuente)
- Si revisaron redes/web antes de venir
- Quién ha referido más pacientes
- Volumen de consultas por período

---

## 13. ANALYTICS DE APEX (panel interno)

Solo visible para APEX. Datos completamente anónimos.
Separados desde el origen: solo doctor_id + evento. Sin datos de pacientes.

Métricas clave:
- Tasa de aceptación de diagnósticos (qué tan bien diagnostica el sistema)
- Magnitud de overrides (ajuste de dosis vs. cambio completo)
- Preguntas al LLM por sesión (¿aprende o solo copia?)
- Funciones más usadas / nunca usadas
- Puntos de abandono en el flujo (dónde se atoran)
- Frecuencia de sesiones por médico (riesgo de churn)
- Categorías de protocolo más solicitadas

---

## 14. RAG — BASE DE CONOCIMIENTO

### Corpus (Vertex AI Cross Corpus Retrieval)
- corpus_medicina_tradicional: Harrison, Cecil, Robbins, Schwartz. Guías OMS/ACC/AHA/ESC/ADA/JNC
- corpus_especialidades: Cardiología, endocrinología, nefrología, gastro, neurología, oncología, reumatología
- corpus_farmacologia: medicamentos aprobados + offlabel con evidencia
- corpus_funcional: Hyman, Bland, Bredesen, Lipman. IFM Textbook of Functional Medicine
- corpus_longevidad: Attia (Outlive), Sinclair, Longo, Gottfried (Younger), Lyon. IFM Lab Interpretations
- corpus_herbolaria: NO disponible. Se cubre con deep research + filtro flexible + disclaimer
- corpus_literatura: via deep research en tiempo real (PubMed, Cochrane, NEJM, Lancet, JAMA)

### Rangos de optimización (verde del semáforo)
- Fuente: libros del RAG (Attia, IFM, Gottfried, Lyon)
- Ajustados por sexo y grupo de edad
- Rango del laboratorio = rojo y amarillo
- Libros del RAG = verde
- Las dos fuentes nunca se mezclan

---

## 15. SOPORTE

### Página de ayuda
- Videos tutoriales
- Agente IA con RAG de la plataforma. Objetivo: resolver 80% sin humano.
- Tutoriales paso a paso con capturas de pantalla

### Contacto humano
- WhatsApp / llamada / correo
- Al escalar: ticket automático con contexto de la conversación
- Agente humano retoma sin que el médico repita nada

---

## 16. MODELO DE PRECIOS

| Plan | Médicos | Pacientes | Funciones | USD/mes |
|------|---------|-----------|-----------|---------|
| Starter | 1 | 50 activos | Capas 1-2, sin deep research | $149 |
| Professional | 1 | Ilimitados | Todas las capas + deep research | $299 |
| Clinic | 5 | Ilimitados | Todo + dashboard clínica | $699 |
| Enterprise | Ilimitados | Ilimitados | Todo + integración personalizada | A medida |

Servicio adicional: exportación de DB con costo (siempre, independiente del plan)

---

## 17. ROADMAP

### Cuentas necesarias para empezar
- GitHub: github.com (gratis)
- Vercel: vercel.com (gratis para MVP)
- Supabase: supabase.com (plan gratis suficiente para MVP)
- Google Cloud: cloud.google.com (créditos de inicio)
- Anthropic: console.anthropic.com (pago por uso)
- Stripe: stripe.com (% por transacción)
- OpenAI Whisper: platform.openai.com (centavos por minuto)
- Perplexity API o Exa.ai (Fase 2)

### Fase 0 — Antes de código
1. System Prompt principal del modelo clínico (activo más valioso de APEX)
2. Rangos de optimización por biomarcador/sexo/edad con médico experto
3. Primeros libros del RAG cargados en Vertex AI
4. 3-5 médicos piloto conseguidos
5. Términos de servicio con abogado (cláusula responsabilidad médico sobre expedientes)

### Fase 1 — MVP (8-12 semanas)
- Auth con roles (médico, enfermera, recepcionista)
- Registro nuevo paciente parte 1 y parte 2
- Datos por visita bloques A-G con semáforo
- Motor de análisis: RAG + Claude, diagnóstico 3 capas
- Protocolo capas 1 y 2
- Guardado con registro aceptación/override
- Ficha del paciente con vista rápida IA
- 3 documentos imprimibles
- Panel admin APEX con analytics básicos

### Fase 2 — Producto completo
- Deep research en tiempo real
- Chat flotante pantalla principal
- APEX Chat en expediente con resúmenes de sesión
- Estadísticas completas
- Soporte con agente IA
- Capas 3 y 4 del protocolo
- Reporte completo con gráficas bajo demanda

### Fase 3 — Escala
- Página web personalizada por paciente
- PWA (instalable en celular sin App Store)
- Integración con laboratorios
- Integración con wearables (Apple Watch, Oura, Garmin)
- Vista multi-médico para clínicas y hospitales
- Expediente compartido entre médicos del mismo tenant con consentimiento

---

## 18. LEGAL

- LFPDPPP (México)
- NOM-004-SSA3-2012 (expediente clínico)
- NOM-168-SSA1-1998 (receta médica)
- Cifrado: AES-256 en reposo, TLS 1.3 en tránsito
- El médico es el controlador de datos. APEX es el procesador.
- APEX JAMÁS ve los datos de los pacientes, ni el dueño de la empresa
- Experimentales: COFEPRIS no aprueba para uso general. APEX informa, no prescribe, nunca por escrito.
- Responsabilidad de resguardo: del médico (NOM exige mínimo 5 años)

