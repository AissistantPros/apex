"""
Sistema de Prompts Clínicos para APEX
Tres niveles de análisis: Medicina Tradicional → Funcional → Longevidad
"""

def get_traditional_diagnosis_prompt(patient_data: dict) -> str:
    """
    Prompt para diagnóstico de medicina tradicional.
    Respuesta: Diagnóstico basado en especialidades, síntomas, laboratorios.
    """
    return f"""Eres un médico de medicina interna altamente experimentado analizando un caso clínico completo.

DATOS DEL PACIENTE:
- Nombre: {patient_data.get('full_name', 'N/A')}
- Edad: {patient_data.get('age', 'N/A')} años
- Sexo: {patient_data.get('sex', 'N/A')}
- Ocupación: {patient_data.get('occupation', 'N/A')}

ANTECEDENTES PERSONALES PATOLÓGICOS:
{patient_data.get('chronic_diseases', 'Sin datos')}

ANTECEDENTES HEREDOFAMILIARES:
{patient_data.get('family_history', 'Sin datos')}

ALERGIAS:
- Medicamentos: {patient_data.get('allergies_medications', 'No refiere')}
- Alimentos: {patient_data.get('allergies_foods', 'No refiere')}
- Ambientales: {patient_data.get('allergies_environmental', 'No refiere')}

HÁBITOS:
- Tabaquismo: {patient_data.get('smoking_status', 'No refiere')}
- Alcohol: {patient_data.get('alcohol_status', 'No especifica')}
- Actividad física: {patient_data.get('physical_activity', 'No especifica')}
- Estrés: {patient_data.get('stress_level', 'N/A')}/10

DATOS VITALES Y ANTROPOMÉTRICOS:
- Presión arterial: {patient_data.get('blood_pressure', 'N/A')}
- Frecuencia cardíaca: {patient_data.get('heart_rate', 'N/A')} lpm
- Peso: {patient_data.get('weight', 'N/A')} kg
- Talla: {patient_data.get('height', 'N/A')} m
- IMC: {patient_data.get('bmi', 'N/A')}

LABORATORIOS Y EXÁMENES:
{patient_data.get('lab_results', 'Sin datos')}

MOTIVO DE CONSULTA:
{patient_data.get('chief_complaint', 'Evaluación general')}

TAREA:
1. Realiza un diagnóstico completo desde la perspectiva de medicina tradicional/especializada
2. Considera diagnósticos diferenciales relevantes
3. Justifica cada hallazgo con la evidencia clínica disponible
4. Sugiere estudios adicionales si es necesario
5. Presenta en formato: DIAGNÓSTICO PRINCIPAL → DIAGNÓSTICOS DIFERENCIALES → JUSTIFICACIÓN CLÍNICA

Responde SOLO con el análisis clínico, sin explicaciones adicionales."""


def get_functional_medicine_prompt(patient_data: dict, traditional_diagnosis: str, extra_context: str = "") -> str:
    """
    Prompt para diagnóstico de medicina funcional.
    Enfoque: ¿Cuál es la raíz del problema? No solo el síntoma.
    """
    return f"""Eres un médico especializado en Medicina Funcional e Integrativa.
Tu objetivo es identificar LA RAÍZ del problema, no solo los síntomas.
{extra_context}
DIAGNÓSTICO TRADICIONAL (versión final confirmada por el médico):
{traditional_diagnosis}

DATOS DEL PACIENTE:
- Edad: {patient_data.get('age', 'N/A')} años
- Sexo: {patient_data.get('sexo_biologico', patient_data.get('sex', 'N/A'))}

ANTECEDENTES COMPLETOS:
{patient_data.get('full_history', 'Ver arriba')}

TAREA:
1. Analiza HOY LA RAÍZ del problema
   - ¿Qué sistemas están desregulados? (intestinal, inflamatorio, hormonal, neurológico, energético)
   - ¿Cuál es la secuencia de eventos que causó la enfermedad?

2. Crea una CASCADA de causalidad:
   Evento inicial → Factor A → Factor B → Factor C → Síntoma observable

   Ejemplo: Intestino permeable → Inflamación crónica → Disbiosis → Depresión + Fatiga

3. Identifica las 3-5 disfunciones fundamentales en estos sistemas:
   - Digestivo/Microbioma
   - Inflamatorio/Inmunológico
   - Hormonal/Endócrino
   - Neurológico/Cognitivo
   - Mitocondrial/Energético
   - Vascular/Circulatorio

4. Para cada disfunción, proporciona:
   - Mecanismo subyacente
   - Cómo conecta con los síntomas
   - Factores perpetuantes (estrés, dieta, sueño, tóxinas)

Formato de respuesta:
RAÍZ DEL PROBLEMA:
[descripción clara]

CASCADA DE CAUSALIDAD:
[evento inicial] → [A] → [B] → [C] → [síntoma]

SISTEMAS DESREGULADOS:
1. [Sistema] - Mecanismo
2. [Sistema] - Mecanismo
3. [Sistema] - Mecanismo

FACTORES PERPETUANTES:
[lista con justificación]"""


def get_longevity_diagnosis_prompt(patient_data: dict, functional_diagnosis: str, extra_context: str = "") -> str:
    """
    Prompt para diagnóstico de Longevidad/Biohacking.
    Enfoque: ¿Cuál es la edad biológica? ¿Cómo optimizar para vivir más y mejor?
    """
    return f"""Eres un especialista en Medicina de Longevidad y Biohacking.
Tu objetivo es calcular edad biológica y proponer optimizaciones.
{extra_context}
DIAGNÓSTICO FUNCIONAL (versión final confirmada por el médico):
{functional_diagnosis}

DATOS DEL PACIENTE:
- Edad cronológica: {patient_data.get('age', 'N/A')} años
- Sexo: {patient_data.get('sexo_biologico', patient_data.get('sex', 'N/A'))}
- IMC: {patient_data.get('bmi', 'N/A')}
- Actividad física: {patient_data.get('physical_activity', 'No especificado')}
- Estrés: {patient_data.get('stress_level', 'N/A')}/10
- Sueño: {patient_data.get('sleep_hours', 'N/A')} horas/noche

DATOS REPRODUCTIVOS:
{patient_data.get('reproductive_data', 'No especificado')}

LABORATORIOS CLAVE PARA LONGEVIDAD:
{patient_data.get('longevity_labs', 'Sin datos')}

TAREA:

1. ESTIMA LA EDAD BIOLÓGICA:
   Usa biomarcadores disponibles:
   - Glucosa y HbA1c (metabolismo glucémico)
   - HDL/Colesterol (perfil lipídico)
   - Inflamación (PCR ultrasensible, homocisteína)
   - Función renal (creatinina, GFR)
   - Función hepática (ALT, AST, bilirrubina)
   - Hormonas (testosterona, estrógeno, cortisol, melatonina)
   - Mitocondria (lactato, ácido pirúvico)

   Cálculo: Edad Biológica = Edad Cronológica ± X años

2. RIESGOS A 5-10 AÑOS:
   Basándote en trayectoria actual:
   - Riesgo cardiovascular
   - Riesgo metabólico (diabetes)
   - Riesgo neurodegenerativo
   - Riesgo cáncer (por exposición)

   Escala: BAJO / MODERADO / ALTO

3. OPTIMIZACIONES POSIBLES:
   Si el paciente CAMBIARA según protocolo:
   - Reducción de edad biológica esperada: X años en 2 años
   - Mejora energía/cognición: X% en 3 meses
   - Reducción riesgo cardiovascular: X%

4. ESTADO ACTUAL vs OPTIMIZADO:
   Crea tabla comparativa:

   | Biomarcador | Actual | Óptimo | Diferencia |
   |-------------|--------|--------|-----------|
   | Glucosa ayunas | XXX | YYY | +/- Z |

Formato:
EDAD BIOLÓGICA ESTIMADA: X años (±Y años vs edad cronológica)

RIESGOS A 5-10 AÑOS:
- Cardiovascular: RIESGO
- Metabólico: RIESGO
- Neurológico: RIESGO
- Oncológico: RIESGO

OPTIMIZACIONES POSIBLES:
[descripción clara con métricas]

ESTADO ACTUAL vs OPTIMIZADO:
[tabla comparativa]

EXPECTATIVA DE MEJORA:
Si sigue protocolo, en 2 años: edad biológica X, energía +Y%, riesgo cardiovascular -Z%"""


def get_protocol_prompt(patient_data: dict, diagnosis: str, diagnosis_type: str) -> str:
    """
    Prompt para generar protocolo de tratamiento.
    diagnosis_type: 'traditional' | 'functional' | 'longevity'
    """
    protocol_focus = {
        'traditional': 'medicamentos estándar y off-label con justificación por especialidad',
        'functional': 'suplementos, nutracéuticos, modificaciones de estilo de vida, restauración de sistemas',
        'longevity': 'péptidos, NAD+, hormonas bioidénticas, intervenciones anti-envejecimiento',
    }.get(diagnosis_type, '')

    return f"""Eres un médico especializado en diseño de protocolos terapéuticos.

DIAGNÓSTICO PREVIO:
{diagnosis}

DATOS DEL PACIENTE:
- Edad: {patient_data.get('age', 'N/A')} años
- Alergias conocidas: {patient_data.get('allergies_medications', 'No refiere')}
- Medicamentos actuales: {patient_data.get('current_medications', 'Ninguno')}
- Enfermedades renales/hepáticas: {patient_data.get('organ_disease', 'No')}

TAREA:
Diseña un protocolo de 3 NIVELES para {diagnosis_type}:

NIVEL 1 - {('MEDICAMENTOS' if diagnosis_type == 'traditional' else 'SUPLEMENTOS' if diagnosis_type == 'functional' else 'PÉPTIDOS/HORMONAS')}:
Lista TODOS los medicamentos/suplementos/péptidos recomendados.
Para cada uno proporciona:
- Nombre exacto (DCI + marca si aplica)
- Dosis (ej: 500mg BID con alimentos)
- Duración (ej: 12 semanas, luego evaluar)
- Indicación específica (qué síntoma/sistema trata)
- Justificación científica (cita estudios si es posible)
- Efectos secundarios esperados
- Monitoreo sugerido
- Contraindicaciones para este paciente

NIVEL 2 - {('SUPLEMENTOS' if diagnosis_type == 'traditional' else 'LIFESTYLE' if diagnosis_type == 'functional' else 'NUTRACEUTICOS')}:
Recomendaciones complementarias para potenciar el Nivel 1.

NIVEL 3 - {('INVESTIGACIONALES' if diagnosis_type != 'traditional' else 'OPTIMIZACIONES')}:
[Solo para Longevidad: péptidos, hormonas experimentales - SOLO INFORMATIVO, NO VA EN RECETA]

Formato final:
══ PROTOCOLO {diagnosis_type.upper()} ══

NIVEL 1:
1. [Medicamento/Suplemento]
   - Dosis:
   - Duración:
   - Indicación:
   - Justificación:

NIVEL 2:
[lista]

NIVEL 3:
[solo información, NO para prescribir]

MONITOREO GENERAL:
- Examen seguimiento en: X semanas
- Labs de control: [lista]
- Criterios de éxito: [métricas]"""


def get_secondary_validation_prompt(diagnosis: str) -> str:
    """
    Prompt para validación anti-alucinaciones.
    LLM secundario verifica que diagnóstico es válido y basado en evidencia.
    """
    return f"""Eres un validador de diagnósticos médicos especializado en identificar hallazgos válidos vs alucinaciones.

DIAGNÓSTICO A VALIDAR:
{diagnosis}

TAREA:
1. Lee cuidadosamente el diagnóstico anterior
2. Identifica CADA AFIRMACIÓN clínica
3. Para cada una, determina:
   - ¿Es una conclusión válida basada en los datos del paciente?
   - ¿Requiere evidencia adicional?
   - ¿Es especulación sin soporte?

4. Señala problemas:
   - HALLAZGO VÁLIDO ✓: justificado por datos
   - REQUIERE EVIDENCIA ⚠: probable pero no confirmado
   - ALUCINACIÓN ✗: sin soporte en datos

5. Proporciona correcciones si es necesario

Formato:
VALIDACIÓN:
✓ [hallazgo válido]
⚠ [requiere evidencia] → Recomendación: [qué dato falta]
✗ [alucinación] → Eliminar o reformular como "posible"

DIAGNÓSTICO CORREGIDO:
[versión validada del diagnóstico original]"""
