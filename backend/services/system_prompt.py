"""
Sistema de Prompts Clínicos para APEX
Cada campo viene etiquetado con su pregunta original del formulario,
para que la IA entienda exactamente qué significa cada respuesta.
"""

from datetime import date


def _edad(patient: dict) -> str:
    dob = patient.get("date_of_birth") or patient.get("birth_date") or patient.get("dob")
    if not dob:
        return patient.get("age", "N/D")
    try:
        nacimiento = date.fromisoformat(str(dob)[:10])
        años = (date.today() - nacimiento).days // 365
        return f"{años} años (nacido el {nacimiento.strftime('%d/%m/%Y')})"
    except Exception:
        return str(dob)


def _fmt_meds(meds) -> str:
    if not meds:
        return "No registra medicamentos actuales"
    if isinstance(meds, str):
        return meds
    lines = []
    for m in meds:
        if isinstance(m, dict):
            nombre = m.get("nombre", "?")
            dosis = m.get("dosis", "?")
            freq = m.get("frecuencia", "?")
            adherencia = m.get("adherencia", "?")
            desde = m.get("desde", "?")
            lines.append(
                f"  • {nombre} {dosis} — frecuencia real: {freq} — "
                f"adherencia declarada: {adherencia} — desde: {desde}"
            )
        else:
            lines.append(f"  • {m}")
    return "\n".join(lines)


def _fmt_familia(fam) -> str:
    if not fam:
        return "Sin datos registrados"
    if isinstance(fam, str):
        return fam

    # Puede llegar como dict {padre:{...}, madre:{...}, hermanos:{...}}
    # o como lista [{familiar:..., enfermedades:...}]
    lines = []
    if isinstance(fam, dict):
        for pariente, datos in fam.items():
            if not isinstance(datos, dict):
                continue
            enf = []
            for e in ["diabetes", "hipertension", "cancer", "cardiopatia"]:
                if datos.get(e):
                    enf.append(e.capitalize())
            if datos.get("otra"):
                enf.append(datos["otra"])
            estado = "Vive" if datos.get("vivo", True) else "Falleció"
            if not datos.get("vivo", True):
                causa = datos.get("causa_muerte", "")
                edad_m = datos.get("edad_muerte", "")
                estado += f" (causa: {causa}, a los {edad_m} años)" if causa else ""
            enf_str = ", ".join(enf) if enf else "Sin enfermedades registradas"
            lines.append(f"  • {pariente.capitalize()}: {enf_str} — {estado}")
    elif isinstance(fam, list):
        for item in fam:
            lines.append(f"  • {item}")
    return "\n".join(lines) if lines else "Sin datos registrados"


def _fmt_fuentes(patient: dict) -> str:
    fuentes = patient.get("sources_of_contact") or patient.get("source_of_contact") or []
    if isinstance(fuentes, list) and fuentes:
        return ", ".join(fuentes)
    return "No especificado"


def build_patient_context(patient: dict) -> str:
    """
    Construye el bloque de contexto completo del paciente (datos de registro)
    con etiquetas que explican qué pregunta se hizo para obtener cada dato.
    """
    sexo = patient.get("sexo_biologico") or patient.get("sex") or "No especificado"
    genero = patient.get("genero_identidad") or ""
    genero_str = f" / Género con que se identifica: {genero}" if genero else ""

    smoking = patient.get("smoking_status") or "No registrado"
    smoking_detail = ""
    if smoking in ("Fumador activo", "Exfumador"):
        count = patient.get("smoking_count", "?")
        since = patient.get("smoking_since", "?")
        until = patient.get("smoking_until", "")
        smoking_detail = f" — {count} cigarros/día, desde {since}"
        if until:
            smoking_detail += f", dejó en {until}"

    alcohol = patient.get("alcohol_status") or "No registrado"
    alcohol_detail = ""
    if alcohol and alcohol != "Nunca":
        tipo = patient.get("alcohol_type", "")
        cantidad = patient.get("alcohol_amount", "")
        if tipo or cantidad:
            alcohol_detail = f" — tipo: {tipo}, cantidad: {cantidad}"

    # Reproductiva
    repro_lines = []
    if sexo == "Femenino":
        repro_lines.append("  REPRODUCTIVA FEMENINA:")
        repro_lines.append(f"  • Edad de menarca (primera menstruación): {patient.get('menarca_age', 'N/D')}")
        repro_lines.append(f"  • Ciclos menstruales: {patient.get('ciclos_regulares', 'N/D')}")
        repro_lines.append(f"  • Número de embarazos: {patient.get('pregnancies', 'N/D')}")
        repro_lines.append(f"  • Partos / cesáreas: {patient.get('births', 'N/D')}")
        repro_lines.append(f"  • Abortos: {patient.get('miscarriages', 'N/D')}")
        meno_tipo = patient.get("menopausal_tipo") or ""
        meno_edad = patient.get("menopausal_age") or ""
        if meno_tipo:
            repro_lines.append(f"  • Menopausia: {meno_tipo}" + (f", a los {meno_edad} años" if meno_edad else ""))
        else:
            repro_lines.append("  • Menopausia: No aplica / aún activa")
        repro_lines.append(f"  • Método anticonceptivo actual: {patient.get('contraceptive', 'No especificado')}")
        repro_lines.append(f"  • Último Papanicolaou (año): {patient.get('pap_ultimo', 'N/D')}")
        repro_lines.append(f"  • Última mastografía (año): {patient.get('masto_ultima', 'N/D')}")
        repro_lines.append(f"  • Última colposcopía (año): {patient.get('colpo_ultima', 'N/D')}")
    elif sexo == "Masculino":
        repro_lines.append("  REPRODUCTIVA MASCULINA:")
        ed = patient.get("erectile_dysfunction") or "No preguntado"
        repro_lines.append(f"  • Disfunción eréctil (opciones: No refiere / Ocasional / Frecuente / Siempre): {ed}")
        test_uso = patient.get("testosterone_use") or "No"
        repro_lines.append(f"  • Uso de testosterona exógena (opciones: No / En el pasado / Actualmente): {test_uso}")
        if test_uso in ("En el pasado", "Actualmente"):
            repro_lines.append(f"    Detalle testosterona: {patient.get('testosterone_detalle', 'Sin detalle')}")
        repro_lines.append(f"  • Número de hijos: {patient.get('children', 'N/D')}")
        repro_lines.append(f"  • Último PSA (año): {patient.get('psa_ultimo', 'N/D')}")
        repro_lines.append(f"  • Resultado PSA (ng/mL): {patient.get('psa_valor', 'N/D')}")

    repro_str = "\n".join(repro_lines) if repro_lines else "  No aplica"

    libido_basal = patient.get("libido_basal", "N/D")
    libido_nota = "(escala 1–10, en condiciones normales — no el día de hoy)"

    return f"""
══════════════════════════════════════════════════
DATOS DEL PACIENTE — REGISTRO CLÍNICO INICIAL
══════════════════════════════════════════════════

IDENTIFICACIÓN:
  • Nombre completo: {patient.get('full_name') or f"{patient.get('first_name','')} {patient.get('last_name','')}".strip() or 'N/D'}
  • Fecha de nacimiento / Edad: {_edad(patient)}
  • Sexo biológico de nacimiento: {sexo}{genero_str}
  • Ocupación: {patient.get('occupation', 'No especificada')}
  • Ciudad / Estado: {patient.get('city', 'No especificada')}

ANTECEDENTES HEREDOFAMILIARES
(enfermedades conocidas en familia directa):
{_fmt_familia(patient.get('family_history_table') or patient.get('family_history'))}

ANTECEDENTES PERSONALES PATOLÓGICOS:
  • Enfermedades crónicas diagnosticadas: {patient.get('chronic_diseases', 'No refiere')}
  • Cirugías previas (nombre y año): {patient.get('surgeries', 'No refiere')}
  • Hospitalizaciones previas: {patient.get('hospitalizations', 'No refiere')}
  • Fracturas / traumatismos: {patient.get('fractures', 'No refiere')}
  • Transfusiones: {patient.get('transfusions', 'No refiere')}
  • Enfermedades relevantes de la infancia: {patient.get('childhood_diseases', 'No refiere')}

ALERGIAS CONOCIDAS:
  • Alergias a medicamentos: {patient.get('allergies_medications', 'No refiere')}
  • Alergias a alimentos: {patient.get('allergies_foods', 'No refiere')}
  • Alergias ambientales u otras: {patient.get('allergies_environmental', 'No refiere')}

MEDICAMENTOS ACTUALES
(los que el paciente realmente toma, con adherencia real):
{_fmt_meds(patient.get('medications'))}
  Observaciones adicionales (automedicación, remedios caseros, herbolaria):
  {patient.get('med_notas', 'Ninguna')}

HÁBITOS:
  • Tabaquismo (opciones: Nunca fumó / Exfumador / Fumador activo): {smoking}{smoking_detail}
  • Alcohol (opciones: Nunca / Ocasional / Frecuente / Diario): {alcohol}{alcohol_detail}
  • Sustancias recreativas o de uso regular (confidencial, solo médico):
    {patient.get('sust_recreativas', 'No refiere') or 'No refiere'}

HISTORIA REPRODUCTIVA Y SEXUAL:
{repro_str}
  • Libido en condiciones normales {libido_nota}: {libido_basal}/10
  • Notas de salud sexual (ETS previas, disfunciones, preocupaciones):
    {patient.get('salud_sexual_notas', 'Sin notas') or 'Sin notas'}

SALUD MENTAL (confidencial):
  • Diagnósticos psiquiátricos previos o actuales: {patient.get('dx_psiquiatrico', 'No refiere') or 'No refiere'}
  • Medicamentos psiquiátricos actuales o previos: {patient.get('med_psiquiatrica', 'No refiere') or 'No refiere'}
  • Eventos traumáticos relevantes (mencionados espontáneamente): {patient.get('trauma_relevante', 'No refiere') or 'No refiere'}
""".strip()


def build_visit_context(visit: dict) -> str:
    """
    Construye el bloque de contexto completo de la visita actual
    con etiquetas que explican qué se midió / preguntó.
    """
    # Presión arterial
    pad = f"{visit.get('pa_der_sistolica','?')}/{visit.get('pa_der_diastolica','?')}"
    pai = f"{visit.get('pa_izq_sistolica','?')}/{visit.get('pa_izq_diastolica','?')}"
    brazo = visit.get("pa_dominant_arm") or visit.get("pa_brazo_mayor") or "No especificado"

    # IMC calculado
    peso = visit.get("weight") or visit.get("peso")
    talla = visit.get("height") or visit.get("talla")
    imc_str = "N/D"
    if peso and talla:
        try:
            h = float(talla) / 100 if float(talla) > 10 else float(talla)
            imc_val = float(peso) / (h * h)
            imc_str = f"{imc_val:.1f}"
        except Exception:
            imc_str = "N/D"

    # Glucosa
    glucosa = visit.get("glucose") or visit.get("glucosa") or "N/D"
    glucosa_ayuno = visit.get("glucose_fasting_hours") or visit.get("glucosa_ayuno") or "N/D"
    glucosa_str = f"{glucosa} mg/dL"
    if glucosa_ayuno and glucosa_ayuno != "N/D":
        glucosa_str += f" (horas en ayuno al momento de la medición: {glucosa_ayuno}h)"

    # ECG
    ecg = visit.get("ecg_done") or visit.get("ecg_realizado")
    ecg_str = "No realizado"
    if ecg:
        interp = visit.get("ecg_interpretation") or visit.get("ecg_interpretacion") or "Sin interpretación registrada"
        ecg_str = f"Realizado — interpretación: {interp}"

    # Composición
    inbody_lines = []
    if visit.get("inbody_fat_pct") or visit.get("inbody_grasa"):
        inbody_lines.append(f"  • % grasa corporal (InBody): {visit.get('inbody_fat_pct') or visit.get('inbody_grasa')}%")
    if visit.get("inbody_muscle_kg") or visit.get("inbody_musculo"):
        inbody_lines.append(f"  • Masa muscular en kg (InBody): {visit.get('inbody_muscle_kg') or visit.get('inbody_musculo')} kg")
    if visit.get("inbody_water_pct") or visit.get("inbody_agua"):
        inbody_lines.append(f"  • % agua corporal (InBody): {visit.get('inbody_water_pct') or visit.get('inbody_agua')}%")
    if visit.get("inbody_visceral") or visit.get("inbody_visceral"):
        inbody_lines.append(f"  • Grasa visceral (InBody, escala 1-20): {visit.get('inbody_visceral')}")
    inbody_str = "\n".join(inbody_lines) if inbody_lines else "  No realizado / no disponible"

    # Actividad física
    act_tipo = visit.get("activity_type") or visit.get("actividad_tipo") or "No especificado"
    act_freq = visit.get("activity_frequency") or visit.get("actividad_frecuencia") or "No especificado"
    act_int = visit.get("activity_intensity") or visit.get("actividad_intensidad") or "No especificado"

    # Pruebas funcionales
    agarre_der = visit.get("grip_right") or visit.get("agarre_der") or "N/D"
    agarre_izq = visit.get("grip_left") or visit.get("agarre_izq") or "N/D"
    marcha = visit.get("walk_4m_seconds") or visit.get("marcha_seg") or "N/D"
    syl = visit.get("sit_stand_30s") or visit.get("syl_reps") or "N/D"
    equilibrio = visit.get("balance_seconds") or visit.get("equilibrio_seg") or "N/D"
    vo2max = visit.get("vo2max") or "N/D"

    # Subjetivo
    animo = visit.get("mood") or visit.get("animo") or []
    animo_str = ", ".join(animo) if isinstance(animo, list) else str(animo)
    digestion = visit.get("digestion") or []
    digestion_str = ", ".join(digestion) if isinstance(digestion, list) else str(digestion)

    orina = visit.get("urine_color") or visit.get("orina_color") or "No registrado"

    dolor = visit.get("pain_today") or visit.get("dolor_hoy") or False
    dolor_str = "No"
    if dolor:
        dolor_ubi = visit.get("pain_location") or visit.get("dolor_ubicacion") or "No especificado"
        dolor_int = visit.get("pain_intensity") or visit.get("dolor_intensidad") or "N/D"
        dolor_str = f"Sí — ubicación: {dolor_ubi}, intensidad declarada: {dolor_int}/10"

    # Cognitivo
    cog = visit.get("minicog_done") or visit.get("cognitivo_realizado") or False
    cog_str = "No realizado"
    if cog:
        palabras = visit.get("minicog_words") or visit.get("cognitivo_palabras") or "N/D"
        reloj = visit.get("minicog_clock") or visit.get("cognitivo_reloj") or "N/D"
        notas_cog = visit.get("minicog_notes") or visit.get("cognitivo_notas") or ""
        cog_str = f"Realizado — palabras recordadas (de 3): {palabras}, reloj: {reloj}"
        if notas_cog:
            cog_str += f", notas: {notas_cog}"

    # Motivo
    primera_vez = visit.get("first_time") or visit.get("motivo_primera_vez") or "N/D"
    # opciones: 'si' = primera vez, 'no' = ya había presentado esto, 'episodios' = recurrente
    primera_vez_label = {
        "si": "Sí, primera vez que presenta esto",
        "no": "No, ya lo había presentado antes",
        "episodios": "Problema recurrente / por episodios",
    }.get(str(primera_vez).lower(), primera_vez)

    return f"""
══════════════════════════════════════════════════
DATOS DE LA VISITA ACTUAL
══════════════════════════════════════════════════

── MOTIVO DE CONSULTA ──
  • Motivo principal de la visita (texto libre del médico): {visit.get('visit_reason') or visit.get('motivo_visita') or 'No especificado'}
  • Intensidad del malestar que trae hoy (escala 1–10, autoevaluado por el paciente): {visit.get('discomfort_intensity') or visit.get('motivo_intensidad') or 'N/D'}/10
  • ¿Desde cuándo tiene este problema / síntoma?: {visit.get('symptom_since') or visit.get('motivo_desde') or 'N/D'}
  • ¿Es la primera vez que presenta esto?: {primera_vez_label}
  • Cambios en medicamentos recientes (antes de esta visita): {visit.get('medication_changes') or visit.get('cambios_meds') or 'Ninguno'}
  • Metas u objetivos del paciente para esta consulta: {visit.get('patient_goals') or visit.get('metas_paciente') or 'No especificado'}

── SIGNOS VITALES ──
  • Presión arterial brazo DERECHO (sistólica/diastólica mmHg): {pad}
  • Presión arterial brazo IZQUIERDO (sistólica/diastólica mmHg): {pai}
  • Brazo con PA más alta (brazo dominante clínico): {brazo}
  • Frecuencia cardíaca (lpm): {visit.get('heart_rate') or visit.get('fc') or 'N/D'}
  • Temperatura corporal (°C): {visit.get('temperature') or visit.get('temperatura') or 'N/D'}
  • Saturación de oxígeno SpO2 (%): {visit.get('spo2') or 'N/D'}
  • Glucosa capilar: {glucosa_str}
  • ECG: {ecg_str}

── COMPOSICIÓN CORPORAL ──
  • Peso (kg): {peso or 'N/D'}
  • Talla (cm): {talla or 'N/D'}
  • IMC calculado: {imc_str} kg/m²
  • Circunferencia abdominal (cm): {visit.get('circ_abdominal') or 'N/D'}
  • Circunferencia de cintura (cm): {visit.get('circ_waist') or visit.get('circ_cintura') or 'N/D'}
  • Circunferencia de cadera (cm): {visit.get('circ_hip') or visit.get('circ_cadera') or 'N/D'}
  • Circunferencia de cuello (cm): {visit.get('circ_neck') or visit.get('circ_cuello') or 'N/D'}
  • Circunferencia de bíceps (cm): {visit.get('circ_biceps') or 'N/D'}
  • Circunferencia de muñeca (cm): {visit.get('circ_wrist') or visit.get('circ_muneca') or 'N/D'}
  Análisis de composición corporal (InBody o similar):
{inbody_str}
  Actividad física habitual del paciente:
  • Tipo de actividad: {act_tipo}
  • Frecuencia semanal: {act_freq}
  • Intensidad percibida: {act_int}

── PRUEBAS FUNCIONALES ──
  • Fuerza de agarre mano DERECHA (dinamometría, kg): {agarre_der}
  • Fuerza de agarre mano IZQUIERDA (dinamometría, kg): {agarre_izq}
  • Velocidad de marcha — test de 4 metros (segundos): {marcha}
    (referencia: <4 segundos = normal; 4–6.7 s = lento; >6.7 s = alerta sarcopenia)
  • Levantarse y sentarse en 30 segundos (repeticiones): {syl}
    (referencia hombres: >14 = normal; mujeres: >12 = normal, varía por edad)
  • Equilibrio en un pie con ojos abiertos (segundos): {equilibrio}
    (referencia: <10 segundos en menores de 60 años = alerta de riesgo de caída)
  • VO2max estimado (ml/kg/min): {vo2max}

── REPORTE SUBJETIVO (autoevaluado por el paciente) ──
  • Nivel de energía en la MAÑANA (escala 1–10): {visit.get('energy_morning') or visit.get('energia_manana') or 'N/D'}/10
  • Nivel de energía al MEDIODÍA (escala 1–10): {visit.get('energy_noon') or visit.get('energia_mediodia') or 'N/D'}/10
  • Nivel de energía en la TARDE (escala 1–10): {visit.get('energy_evening') or visit.get('energia_tarde') or 'N/D'}/10
  • Calidad del sueño (escala 1–10): {visit.get('sleep_quality') or visit.get('sueno_calidad') or 'N/D'}/10
  • Horas de sueño por noche: {visit.get('sleep_hours') or visit.get('sueno_horas') or 'N/D'} h
  • ¿Se despierta descansado? (opciones: Siempre / A veces / Rara vez / Nunca): {visit.get('wakes_rested') or visit.get('sueno_reparador') or 'N/D'}
  • Estado de ánimo actual (múltiple selección, opciones: Estable / Ansioso / Irritable / Triste / Sin motivación / Bien / Otro): {animo_str or 'No especificado'}
  • Libido HOY, en este momento (escala 1–10, diferente del basal en registro): {visit.get('libido') or visit.get('libido_hoy') or 'N/D'}/10
  • Digestión (múltiple selección, opciones: Sin problemas / Distensión / Estreñimiento / Diarrea / Reflujo / Náuseas / Otro): {digestion_str or 'No especificado'}
  • Color de orina (escala visual, del más pálido al más oscuro): {orina}
    (muy pálido = bien hidratado; naranja oscuro = deshidratación severa / revisar hematuria)
  • ¿Tiene dolor físico hoy?: {dolor_str}

── EXPLORACIÓN CLÍNICA (realizada por el médico) ──
  • Inspección general: {visit.get('general_inspection') or visit.get('exp_general') or 'No registrada'}
  • Hallazgos en piel: {visit.get('skin_findings') or visit.get('exp_piel') or 'Sin hallazgos'}
  • Hallazgos oculares: {visit.get('eye_findings') or visit.get('exp_ojos') or 'Sin hallazgos'}
  • Hallazgos en boca / orofaringe: {visit.get('mouth_findings') or visit.get('exp_boca') or 'Sin hallazgos'}
  • Hallazgos en tiroides: {visit.get('thyroid_findings') or visit.get('exp_tiroides') or 'Sin hallazgos'}
  • Hallazgos abdominales: {visit.get('abdomen_findings') or visit.get('exp_abdomen') or 'Sin hallazgos'}
  • Hallazgos neurológicos: {visit.get('neuro_findings') or visit.get('exp_neurologico') or 'Sin hallazgos'}
  • Otros hallazgos clínicos: {visit.get('other_findings') or visit.get('exp_otros') or 'Ninguno'}
  • Imagen (tipo de estudio): {visit.get('imaging_type') or visit.get('img_tipo') or 'No realizado'}
  • Interpretación de imagen: {visit.get('imaging_findings') or visit.get('img_interpretacion') or 'N/A'}
  • Mini-Cog (tamizaje cognitivo breve): {cog_str}

── LABORATORIOS ──
  • Notas / resultados clave de laboratorios: {visit.get('labs_notes') or visit.get('lab_notas') or 'No se ingresaron laboratorios en esta visita'}
  • URL de PDF de laboratorios: {visit.get('labs_pdf_url') or 'No adjuntado'}
""".strip()


# ─────────────────────────────────────────────────────────
# PROMPTS DE ANÁLISIS
# ─────────────────────────────────────────────────────────

STRUCTURED_HEADER_INSTRUCTIONS = """
ANTES de tu análisis clínico, escribe EXACTAMENTE esta línea JSON (una sola línea):
{"confidence": <número 0-100>}

Ya tuviste oportunidad de preguntar al médico antes de este análisis — NO hagas preguntas aquí,
entrega el análisis completo con la información disponible.

Después del JSON, continúa con el análisis clínico normal. Sé conciso — el médico tiene al paciente enfrente.
Usa términos médicos, no expliques lo obvio. Máximo 400 palabras por sección.
"""


def get_clarifying_questions_prompt(patient_data: dict, visit_data: dict, draft_diagnosis: str = "") -> str:
    """Genera hasta 3 preguntas de aclaración basadas en un borrador de diagnóstico YA generado."""
    patient_ctx = build_patient_context(patient_data)
    visit_ctx = build_visit_context(visit_data)

    draft_block = (
        f"""
BORRADOR DE DIAGNÓSTICO QUE YA GENERASTE PARA ESTE CASO (con la información disponible hasta ahora):
{draft_diagnosis}
"""
        if draft_diagnosis and draft_diagnosis.strip() else ""
    )

    return f"""Eres APEX, asistente médico. Ya analizaste este caso clínico y generaste un borrador de diagnóstico.
Ahora necesitas identificar si hay preguntas puntuales que, de contestarse, cambiarían o reforzarían ese borrador.

{patient_ctx}

{visit_ctx}
{draft_block}
TAREA: Basándote ESPECÍFICAMENTE en las partes menos ciertas o con menor evidencia de tu borrador de diagnóstico,
identifica hasta 3 preguntas que el médico pueda hacer AL PACIENTE AHORA MISMO, en el consultorio, que cambiarían
o confirmarían significativamente ese diagnóstico.

REGLAS ESTRICTAS:
- Las preguntas deben apuntar a lo que más incertidumbre le genera al borrador de diagnóstico, no preguntas genéricas
- Solo preguntas sobre síntomas, sensaciones o historia que el paciente puede responder verbalmente
- NO preguntes por laboratorios, estudios o pruebas
- Si el borrador ya tiene suficiente certeza, haz 0 preguntas
- Máximo 3 preguntas. Si son 1 ó 2, mejor.
- Preguntas cortas, directas, clínicamente relevantes para ESTE caso
- Cada pregunta debe cambiar materialmente el diagnóstico o su porcentaje de certeza si la respuesta es sí o no

Responde SOLO con este JSON (nada más, sin explicaciones):
{{"questions": ["¿Pregunta 1?", "¿Pregunta 2?"]}}

Si no necesitas preguntar nada:
{{"questions": []}}"""


def get_traditional_diagnosis_prompt(patient_data: dict, visit_data: dict = None, extra_context: str = "") -> str:
    patient_ctx = build_patient_context(patient_data)
    visit_ctx = build_visit_context(visit_data) if visit_data else "(Sin datos de visita actual)"
    extra = f"\n\n{extra_context}" if extra_context else ""

    return f"""Eres un médico internista senior. Analiza este caso clínico — el médico está leyendo esto con el paciente enfrente. Sé técnico, breve, directo. Máximo 3 líneas por sección.{extra}

{patient_ctx}

{visit_ctx}

{STRUCTURED_HEADER_INSTRUCTIONS}

TAREA: Lista los diagnósticos más probables para este caso, del más al menos probable, cada uno
con su porcentaje de certeza según LA INFORMACIÓN DISPONIBLE.

REGLAS:
- Máximo 4 diagnósticos. Si solo 2 o 3 son razonablemente probables, pon esos — no rellenes con opciones poco probables.
- El primero (más probable) siempre se incluye, aunque su certeza sea menor al 50%.
- A partir del segundo diagnóstico en adelante, NO lo incluyas si su certeza es menor al 50%.
- Cada diagnóstico debe incluir el estudio o estudios específicos que lo confirmarían — no hagas una lista de estudios aparte.

FORMATO DEL ANÁLISIS (después del JSON). Usa EXACTAMENTE estos delimitadores:
═══ DIAGNÓSTICOS POSIBLES ═══
1. [Diagnóstico + CIE-10] | [XX%]
[1-2 líneas con los datos concretos que lo justifican]
ESTUDIO PARA CONFIRMAR: [estudio(s) específico(s)]

2. [Diagnóstico + CIE-10] | [XX%]
[1-2 líneas]
ESTUDIO PARA CONFIRMAR: [estudio(s)]

═══ ALERTAS CLÍNICAS ═══
• [Hallazgo urgente o "Sin alertas inmediatas"]

IMPORTANTE: No uses markdown (**negrita**). Escribe en texto plano. Sin introducciones ni despedidas."""


def get_functional_medicine_prompt(patient_data: dict, traditional_diagnosis: str,
                                   visit_data: dict = None, extra_context: str = "") -> str:
    patient_ctx = build_patient_context(patient_data)
    visit_ctx = build_visit_context(visit_data) if visit_data else "(Sin datos de visita actual)"

    traditional_block = (
        f"DIAGNÓSTICO TRADICIONAL (confirmado por el médico tratante):\n{traditional_diagnosis}\n"
        if traditional_diagnosis and traditional_diagnosis.strip() else ""
    )

    return f"""Eres un médico de medicina funcional. Identifica la raíz del problema, no solo el síntoma. Sé conciso — el médico tiene al paciente enfrente.

{extra_context}

{patient_ctx}

{visit_ctx}

{traditional_block}
{STRUCTURED_HEADER_INSTRUCTIONS}

FORMATO (después del JSON). Usa EXACTAMENTE estos delimitadores. No uses markdown (**negrita**), solo texto plano:
═══ RAÍZ DEL PROBLEMA ═══
[causa raíz en 2 líneas con datos concretos del paciente]
ESTUDIO PARA CONFIRMAR: [estudio(s) específico(s) que confirmarían esta raíz del problema]

═══ CASCADA DE CAUSALIDAD ═══
[factor inicial] → [disfunción A] → [disfunción B] → [síntoma visible]

═══ SISTEMAS DESREGULADOS ═══
1. [Sistema] — [mecanismo en 1 línea] — Evidencia: [dato del paciente]
2. [Sistema] — [mecanismo] — Evidencia: [dato]

═══ FACTORES PERPETUANTES ═══
• [factor] — [cómo contribuye, en 1 línea]"""


def get_longevity_diagnosis_prompt(patient_data: dict, functional_diagnosis: str,
                                   visit_data: dict = None, extra_context: str = "") -> str:
    patient_ctx = build_patient_context(patient_data)
    visit_ctx = build_visit_context(visit_data) if visit_data else "(Sin datos de visita actual)"

    functional_block = (
        f"DIAGNÓSTICO FUNCIONAL (confirmado por el médico tratante):\n{functional_diagnosis}\n"
        if functional_diagnosis and functional_diagnosis.strip() else ""
    )

    return f"""Eres especialista en medicina de longevidad. Calcula edad biológica y proyecciones. Sé conciso — el médico tiene al paciente enfrente.

{extra_context}

{patient_ctx}

{visit_ctx}

{functional_block}
{STRUCTURED_HEADER_INSTRUCTIONS}

FORMATO (después del JSON). Usa EXACTAMENTE estos delimitadores. No uses markdown (**negrita**), solo texto plano:
═══ EDAD BIOLÓGICA ESTIMADA ═══
[X] años (cronológica: [Y] años = [+/-Z] años). Biomarcadores clave: [lista con valores del paciente]

═══ RIESGOS A 5-10 AÑOS ═══
• Cardiovascular: BAJO/MODERADO/ALTO — [1 línea]
• Metabólico: BAJO/MODERADO/ALTO — [1 línea]
• Neurodegenerativo: BAJO/MODERADO/ALTO — [1 línea]
• Musculoesquelético: BAJO/MODERADO/ALTO — [1 línea]

═══ ESTADO ACTUAL vs ÓPTIMO ═══
[Parámetro] | [Valor actual] | [Rango óptimo] | [Estado: OK/BAJO/ALTO/ALERTA]
[máximo 5 filas, los más relevantes para ESTE paciente]

═══ POTENCIAL DE MEJORA ═══
• Edad biológica: -[X] años estimado con protocolo
• [2 mejoras concretas y cuantificadas]"""


def get_protocol_prompt(patient_data: dict, diagnosis: str, diagnosis_type: str,
                        visit_data: dict = None) -> str:
    patient_ctx = build_patient_context(patient_data)

    alergias = patient_data.get("allergies_medications") or "No refiere"
    meds_actuales = _fmt_meds(patient_data.get("medications"))

    protocol_focus = {
        "traditional": "medicamentos convencionales (incluyendo off-label con justificación científica)",
        "functional":  "suplementos, nutracéuticos y modificaciones de estilo de vida",
        "longevity":   "intervenciones anti-envejecimiento: péptidos, NAD+, hormonas bioidénticas, optimización metabólica",
    }.get(diagnosis_type, "intervención terapéutica")

    nivel1_label = {"traditional": "MEDICAMENTOS", "functional": "SUPLEMENTOS CLAVE", "longevity": "PÉPTIDOS / HORMONAS / NAD+"}.get(diagnosis_type, "INTERVENCIÓN PRINCIPAL")
    nivel2_label = {"traditional": "SUPLEMENTOS COMPLEMENTARIOS", "functional": "ESTILO DE VIDA", "longevity": "NUTRACEUTICOS / ESTILO DE VIDA"}.get(diagnosis_type, "COMPLEMENTARIO")
    nivel3_label = {"traditional": "ESTUDIOS DE SEGUIMIENTO", "functional": "MONITOREO", "longevity": "INTERVENCIONES EXPERIMENTALES (solo informativo)"}.get(diagnosis_type, "MONITOREO")

    return f"""Eres un médico experto en diseño de protocolos terapéuticos personalizados.

DIAGNÓSTICO BASE:
{diagnosis}

CONTEXTO DEL PACIENTE:
{patient_ctx}

MEDICAMENTOS ACTUALES DEL PACIENTE (para evitar duplicaciones e interacciones):
{meds_actuales}

ALERGIAS A MEDICAMENTOS: {alergias}

TAREA:
Diseña un protocolo terapéutico completo de tipo: {protocol_focus}

Para CADA intervención proporciona:
- Nombre exacto (DCI + nombre comercial si aplica)
- Dosis específica (ej: 500 mg dos veces al día con alimentos)
- Duración (ej: 12 semanas, luego reevaluar)
- Indicación específica (qué síntoma o sistema trata en ESTE paciente)
- Justificación científica (mecanismo de acción relevante para el caso)
- Efectos secundarios esperados a vigilar
- Contraindicaciones específicas para ESTE paciente (considerando sus antecedentes y alergias)
- Interacciones con sus medicamentos actuales

FORMATO:
══ PROTOCOLO {diagnosis_type.upper()} ══

{nivel1_label}:
1. [Nombre]
   • Dosis:
   • Duración:
   • Indicación en este paciente:
   • Mecanismo:
   • Efectos secundarios:
   • Contraindicaciones específicas:
   • Interacciones:

{nivel2_label}:
[lista con mismos campos relevantes]

{nivel3_label}:
[estudios de control / monitoreo sugerido]

MONITOREO GENERAL:
• Próxima revisión en: [tiempo]
• Laboratorios de control: [lista]
• Criterios de éxito: [métricas concretas]
• Señales de alarma: [cuándo regresar antes]"""


def get_secondary_validation_prompt(diagnosis: str) -> str:
    return f"""Eres un validador médico especializado en control de calidad clínico.
Tu función: verificar que el diagnóstico propuesto está justificado por los datos clínicos
y no contiene afirmaciones sin evidencia ("alucinaciones clínicas").

DIAGNÓSTICO A VALIDAR:
{diagnosis}

TAREA:
1. Lee cada afirmación clínica del diagnóstico.
2. Clasifica cada una:
   ✓ VÁLIDO: conclusión directamente justificada por datos del paciente
   ⚠ POSIBLE: plausible pero requiere más evidencia para confirmar
   ✗ SIN SOPORTE: afirmación que no tiene respaldo en los datos disponibles

3. Proporciona el diagnóstico corregido eliminando o suavizando lo que no tiene soporte.

FORMATO:
VALIDACIÓN:
✓ [afirmación válida] — dato que la sustenta: [...]
⚠ [afirmación posible] → Se necesita: [qué dato confirmaría esto]
✗ [afirmación sin soporte] → Reformular como "posible" o eliminar

DIAGNÓSTICO VALIDADO:
[versión corregida y validada del diagnóstico original]

CALIDAD GENERAL: [ALTA / MEDIA / BAJA] — [razón en una línea]"""
