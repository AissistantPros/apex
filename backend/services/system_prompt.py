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
    pains = visit.get("pains") or []
    if dolor:
        if isinstance(pains, list) and len(pains) > 0:
            dolor_str = "Sí — " + "; ".join(
                f"{p.get('ubicacion', 'No especificado')} (intensidad {p.get('intensidad', 'N/D')}/10)"
                for p in pains
            )
        else:
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
  • Pregunta hecha al paciente: "En los últimos 5 días, ¿cómo calificarías tu energía AL DESPERTAR?" (escala 1–10)
    Respuesta: {visit.get('energy_morning') or visit.get('energia_manana') or 'N/D'}/10
  • Pregunta hecha al paciente: "En los últimos 5 días, ¿cómo calificarías tu energía A MEDIODÍA?" (escala 1–10)
    Respuesta: {visit.get('energy_noon') or visit.get('energia_mediodia') or 'N/D'}/10
  • Pregunta hecha al paciente: "En los últimos 5 días, ¿cómo calificarías tu energía AL FINAL DEL DÍA?" (escala 1–10)
    Respuesta: {visit.get('energy_evening') or visit.get('energia_tarde') or 'N/D'}/10
  • Pregunta hecha al paciente: "¿Cómo calificarías la calidad de tu sueño?" (escala 1–10)
    Respuesta: {visit.get('sleep_quality') or visit.get('sueno_calidad') or 'N/D'}/10
  • Pregunta hecha al paciente: "¿Cuántas horas duermes por noche?"
    Respuesta: {visit.get('sleep_hours') or visit.get('sueno_horas') or 'N/D'} h
  • Pregunta hecha al paciente: "¿Te despiertas descansado?" (opciones: Siempre / A veces / Rara vez / Nunca)
    Respuesta: {visit.get('wakes_rested') or visit.get('sueno_reparador') or 'N/D'}
  • Pregunta hecha al paciente: "¿Cómo describirías tu estado de ánimo esta semana?" (múltiple selección, opciones: Estable / Ansioso / Irritable / Triste / Sin motivación / Bien / Otro)
    Respuesta: {animo_str or 'No especificado'}
  • Pregunta hecha al paciente: "En los últimos días, ¿cómo calificarías tu libido?" (escala 1–10, distinto del basal registrado al ingreso del paciente)
    Respuesta: {visit.get('libido') or visit.get('libido_hoy') or 'N/D'}/10
  • Pregunta hecha al paciente: "¿Cómo ha estado tu digestión?" (múltiple selección, opciones: Sin problemas / Distensión / Estreñimiento / Diarrea / Reflujo / Náuseas / Otro)
    Respuesta: {digestion_str or 'No especificado'}
  • Pregunta hecha al paciente: "¿De qué color es tu orina?" (escala visual, del más pálido al más oscuro)
    Respuesta: {orina}
    (muy pálido = bien hidratado; naranja oscuro = deshidratación severa / revisar hematuria)
  • Pregunta hecha al paciente: "¿Tienes dolor físico hoy? ¿Dónde y con qué intensidad?"
    Respuesta: {dolor_str}

── SITUACIÓN ACTUAL (preguntas de medicina funcional, buscan causa raíz) ──
  Digestión:
  • Escala de Bristol (tipo de heces, 1-7): {visit.get('bristol_scale') or 'N/D'}
  • Deposiciones por día: {visit.get('bowel_movements_per_day') or 'N/D'}
  • Tiempo desde inicio de síntomas digestivos: {visit.get('digestion_onset') or 'N/D'}
  • Patrón (continuo/intermitente/postprandial): {visit.get('digestion_pattern') or 'N/D'}
  • Sangre o moco en heces: {visit.get('digestion_blood') or 'N/D'}
  • Antibióticos en el último año: {visit.get('recent_antibiotics') or 'N/D'}
  • Uso de probióticos: {visit.get('probiotics_use') or 'N/D'}
  Sueño:
  • Hora de acostarse / despertar: {visit.get('bedtime') or 'N/D'} / {visit.get('wake_time') or 'N/D'}
  • Despertares nocturnos: {visit.get('night_awakenings') or 'N/D'}
  • Ronca: {visit.get('snoring') or 'N/D'}{f" — intensidad (¿se escucha a través de la pared?): {visit.get('snoring_intensity')}" if visit.get('snoring_intensity') else ""}{f" — frecuencia: {visit.get('snoring_frequency')}" if visit.get('snoring_frequency') else ""}
  • Pausas de respiración al dormir (apnea observada): {visit.get('apnea_observed') or 'N/D'}{f" — frecuencia: {visit.get('apnea_frequency')}" if visit.get('apnea_frequency') else ""}{f" — duración de pausas: {visit.get('apnea_duration')}" if visit.get('apnea_duration') else ""}
  • Siesta durante el día: {visit.get('daytime_nap') or 'N/D'}
  Estrés (eje HPA):
  • Nivel de estrés percibido (1-10): {visit.get('stress_level') or 'N/D'}
  • Mente acelerada: {visit.get('racing_mind') or 'N/D'}
  • Ansiedad / pánico: {visit.get('anxiety_panic') or 'N/D'}
  • Cómo maneja el estrés: {visit.get('stress_coping') or 'N/D'}
  • ¿Puede relajarse?: {visit.get('can_relax') or 'N/D'}
  Sedentarismo:
  • Horas sentado al día: {visit.get('sitting_hours') or 'N/D'}
  • Tipo de actividad laboral: {visit.get('work_activity_level') or 'N/D'}
  Exposición ambiental actual:
  • Exposición reciente a químicos/pesticidas: {visit.get('recent_chemical_exposure') or 'N/D'}
  • Agua que consume: {visit.get('water_source') or 'N/D'}
  • Calienta comida en plástico en microondas: {visit.get('plastic_in_microwave') or 'N/D'}
  • Tatuajes / amalgamas recientes: {visit.get('recent_tattoo_amalgam') or 'N/D'}
  Alimentación:
  • Agua que bebe al día: {visit.get('water_intake_liters') or 'N/D'} L
  • Comidas al día: {visit.get('meals_per_day') or 'N/D'}
  • Aceite que usa para cocinar: {visit.get('cooking_oil') or 'N/D'}
  • Antojos frecuentes: {visit.get('food_cravings') or 'N/D'}
  • Come frente a pantallas: {visit.get('screen_eating') or 'N/D'}
  • Frecuencia de ultraprocesados: {visit.get('ultraprocessed_frequency') or 'N/D'}
  Piel, cabello y uñas (autorreporte del paciente, distinto del hallazgo clínico):
  • Piel seca o acné: {visit.get('self_skin_issues') or 'N/D'}
  • Caída de cabello: {visit.get('hair_loss') or 'N/D'}
  • Uñas frágiles: {visit.get('brittle_nails') or 'N/D'}
  Adherencia:
  • Adherencia a medicamentos/suplementos: {visit.get('medication_adherence') or 'N/D'}

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

── REGLAS DE INTERPRETACIÓN CLÍNICA Y CONFIABILIDAD DE LA INFORMACIÓN ──
  Todo valor de esta sección es UNA medición en UN punto en el tiempo, no una serie confirmada.
  Además, gran parte de este expediente (síntomas, hábitos, antecedentes "según refiere") es el
  RELATO VERBAL del paciente, sujeto a su memoria, percepción y honestidad — el paciente no siempre
  recuerda bien o dice todo con precisión. Trata ambos tipos de dato (medición puntual y relato
  verbal) como una referencia fuerte para razonar, NUNCA como un hecho ya verificado al 100%.
  Aplica este criterio antes de afirmar cualquier diagnóstico:
  • No diagnostiques una condición crónica (ej. "hipertensión arterial", "diabetes mellitus") a partir
    de una sola lectura o de un solo relato del paciente, salvo que el valor sea de gravedad real e
    inmediata (crisis hipertensiva >180/120 mmHg; glucosa <50 o >400 mg/dL; SpO2 <90%). Para todo lo
    demás, repórtalo como "hallazgo a confirmar / vigilar", nunca como diagnóstico cerrado — pero
    repórtalo siempre, no lo descartes ni lo omitas solo por ser un dato aislado.
  • Qué SÍ sube un hallazgo de "aislado" a "confirmado": que se repita de forma consistente en el
    HISTORIAL DE VISITAS ANTERIORES de este paciente (más abajo, si está disponible), o que el
    paciente traiga automonitoreo validado (registro casero sostenido, MAPA, glucómetro/CGM, estudio
    de laboratorio repetido). Eso sí es evidencia fuerte — trátalo con la certeza que amerita un
    patrón confirmado, no como si fuera la primera vez que se observa.
  • Qué NO sube la certeza: que el paciente insista en algo, que el hallazgo "encaje" con su edad,
    peso o factores de riesgo, o que sea un único dato de hoy — eso es motivo para preguntar, vigilar
    o pedir confirmación, no para cerrar un diagnóstico.
  • Presión arterial: una sola lectura elevada en consultorio (ej. 130/92) es "elevación aislada a
    confirmar" — el diagnóstico real de hipertensión requiere ≥2 lecturas elevadas en ≥2 ocasiones
    distintas (considera el efecto de bata blanca, propio del entorno clínico). Si el historial de
    visitas anteriores ya muestra lecturas elevadas, ya tienes esas ≥2 ocasiones — dilo explícitamente
    en vez de tratarlo otra vez como hallazgo nuevo. Si no hay historial que lo respalde, indica cómo
    se confirmaría (repetir en esta misma consulta, monitoreo en casa, MAPA) en vez de declarar
    hipertensión con un solo dato.
  • Glucosa: interpreta SIEMPRE contra las horas en ayuno reportadas. Una glucosa postprandial
    (poco tiempo desde la última comida) de 108-140 mg/dL es fisiológicamente normal, no es alerta.
    Solo es hallazgo metabólico real si es en ayuno ≥8h y supera los cortes diagnósticos (ayuno
    ≥100 mg/dL = prediabetes, ≥126 mg/dL = diabetes), o si es postprandial pero extrema (>200 mg/dL).
  • No uses factores de riesgo del paciente (edad, peso/IMC, comorbilidades) para inflar la certeza
    de un diagnóstico más allá de lo que sostiene la medición o el relato disponible — esos factores
    justifican dar seguimiento, no adelantar un diagnóstico que un solo dato no sostiene por sí solo.
""".strip()


MAX_VISITAS_HISTORIAL = 10


def _dias_desde(fecha_iso: str, hoy: date) -> str:
    """Convierte una fecha ISO en un texto relativo corto ('hace 14 días', 'hace ~3 meses')."""
    try:
        f = date.fromisoformat(str(fecha_iso)[:10])
        dias = (hoy - f).days
        if dias < 0:
            return ""
        if dias == 0:
            return "hoy mismo"
        if dias < 30:
            return f"hace {dias} día{'s' if dias != 1 else ''}"
        if dias < 365:
            meses = dias // 30
            return f"hace ~{meses} mes{'es' if meses != 1 else ''}"
        anios = dias // 365
        return f"hace ~{anios} año{'s' if anios != 1 else ''}"
    except Exception:
        return ""


def build_visit_history_context(visits: list, current_visit_id: str = "") -> str:
    """
    Construye un resumen compacto de las visitas ANTERIORES de este mismo paciente (peso, PA,
    glucosa, labs, motivo, y cuánto tiempo ha pasado) para que cada especialista pueda cruzar
    la visita de HOY contra el patrón histórico real, en vez de juzgar cada dato aislado.
    No repite el detalle completo de cada visita pasada — eso ya se cubre en build_visit_context()
    solo para la visita actual.
    """
    hoy = date.today()
    header = f"""
══════════════════════════════════════════════════
HISTORIAL DE VISITAS ANTERIORES DEL PACIENTE
══════════════════════════════════════════════════
HOY ES: {hoy.isoformat()}. Úsalo para calcular cuánto tiempo ha pasado entre visitas."""

    previas = [v for v in (visits or []) if v and v.get("id") != current_visit_id]
    if not previas:
        return header + "\n\nEsta es la PRIMERA visita registrada de este paciente en el sistema — no hay historial previo con el que comparar ni confirmar tendencias. Cualquier hallazgo de hoy es, por definición, un dato aislado."

    previas = sorted(previas, key=lambda v: v.get("created_at") or "", reverse=True)
    total_previas = len(previas)
    mostradas = previas[:MAX_VISITAS_HISTORIAL]

    lines = [
        header,
        "",
        f"{total_previas} visita(s) previa(s) registrada(s), de la más a la menos reciente — "
        "compara contra la visita de HOY para distinguir un hallazgo aislado de un patrón consistente:",
    ]
    for v in mostradas:
        fecha = str(v.get("created_at") or "")[:10] or "Fecha N/D"
        delta = _dias_desde(fecha, hoy)
        delta_str = f" ({delta})" if delta else ""

        peso = v.get("weight") or v.get("peso") or "N/D"
        pad_s = v.get("pa_der_sistolica")
        pad_d = v.get("pa_der_diastolica")
        pa_str = f"{pad_s}/{pad_d} mmHg" if pad_s and pad_d else "N/D"

        glucosa = v.get("glucose") or v.get("glucosa")
        glucosa_ayuno = v.get("glucose_fasting_hours") or v.get("glucosa_ayuno")
        if glucosa:
            glucosa_str = f"{glucosa} mg/dL" + (f" (ayuno: {glucosa_ayuno}h)" if glucosa_ayuno else " (ayuno: N/D)")
        else:
            glucosa_str = "N/D"

        motivo = v.get("visit_reason") or v.get("motivo_visita") or "No especificado"
        labs = v.get("labs_notes") or v.get("labs_notas")

        line = (
            f"  • {fecha}{delta_str} — Motivo: {motivo} — Peso: {peso} kg — "
            f"PA: {pa_str} — Glucosa: {glucosa_str}"
        )
        if labs:
            line += f" — Labs: {labs}"
        lines.append(line)

    if total_previas > len(mostradas):
        lines.append(f"  (+{total_previas - len(mostradas)} visita(s) más antigua(s) no mostradas por espacio)")

    return "\n".join(lines)


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
Ahora necesitas identificar si hay preguntas clínicas breves que el médico pueda hacerle al paciente en este momento para reducir la incertidumbre diagnóstica.

{patient_ctx}

{visit_ctx}
{draft_block}
TAREA: Basándote ESPECÍFICAMENTE en las partes menos ciertas de tu borrador de diagnóstico, genera hasta 3 preguntas
que el médico leerá en pantalla y le hará directamente al paciente, para aclarar síntomas, duración, patrón o contexto
que NO está capturado en el expediente y que cambiaría materialmente el diagnóstico.

FORMATO DE LAS PREGUNTAS — MUY IMPORTANTE:
- Las preguntas las lee el MÉDICO en pantalla y las hace AL PACIENTE. Redáctalas en tercera persona desde la perspectiva del médico.
- Correcto: "¿El paciente ha notado que los síntomas empeoran después de comer grasas?"
- Correcto: "¿El paciente tuvo fiebre o infección reciente antes de que empezaran los síntomas?"
- Incorrecto: "¿Has notado que tus síntomas empeoran?" (tú directo al paciente — PROHIBIDO)
- Incorrecto: "¿Recuerdas exactamente qué comiste?" (tú directo — PROHIBIDO)

REGLAS DE CONTENIDO:
- Solo preguntas sobre síntomas, sensaciones, historia o contexto que el paciente puede responder verbalmente ahora mismo
- NO preguntes por laboratorios, estudios previos, imágenes ni pruebas diagnósticas — eso va en estudios sugeridos
- NO preguntes nada que ya tenga un valor real (distinto de N/D) en el expediente — si ya está capturado, NO lo repitas
- Los antecedentes familiares YA están en el expediente — NO preguntes por enfermedades de familiares
- Las horas desde la última comida YA están en el formulario si se capturaron — NO las preguntes
- Los datos de ronquidos, pausas al respirar, digestión, sueño: si aparecen con valor real en el contexto, NO los vuelvas a preguntar
- Si el borrador ya tiene suficiente certeza, devuelve 0 preguntas
- Máximo 3 preguntas. Menos es mejor.
- Cada pregunta debe cambiar materialmente el diagnóstico si la respuesta es diferente a lo esperado

Responde SOLO con este JSON (nada más, sin explicaciones):
{{"questions": ["¿El paciente ha...?", "¿El paciente nota...?"]}}

Si no necesitas preguntar nada:
{{"questions": []}}"""


def get_functional_clarifying_questions_prompt(patient_data: dict, visit_data: dict, doctor_traditional: str) -> str:
    """
    Genera hasta 3 preguntas dirigidas a buscar la CAUSA RAÍZ del diagnóstico convencional
    ya confirmado por el médico. Se usan ANTES de generar el diagnóstico funcional.
    """
    patient_ctx = build_patient_context(patient_data)
    visit_ctx = build_visit_context(visit_data)

    return f"""Eres APEX, asistente de medicina funcional. El médico ya confirmó este diagnóstico convencional:

{doctor_traditional}

{patient_ctx}

{visit_ctx}

TAREA: La medicina funcional busca el ORIGEN de este diagnóstico, no solo nombrarlo — regresando lo más posible
hacia atrás en la causa (inflamación, eje HPA/estrés, metabolismo/insulina-glucosa, microbioma/digestión,
toxinas/desintoxicación, mitocondria/energía, sistema nervioso autónomo).

Con la información que YA tienes del paciente (historia, antecedentes, situación actual), identifica hasta 3
preguntas puntuales que, de contestarse, te ayuden a ubicar la causa raíz MÁS PROBABLE de este diagnóstico
específico en ESTE paciente. No preguntes nada que ya esté respondido en la información de arriba.

REGLAS ESTRICTAS:
- Las preguntas deben apuntar a posibles causas raíz del diagnóstico confirmado, no preguntas genéricas
- Solo preguntas sobre síntomas, sensaciones, hábitos o historia que el paciente puede responder verbalmente
- NO preguntes por laboratorios o estudios — eso se sugiere después, como estudios a solicitar
- Si la información ya es suficiente para apuntar a una causa raíz razonable, haz 0 preguntas
- Máximo 3 preguntas. Si son 1 ó 2, mejor.
- Preguntas cortas, directas, específicas para ESTE paciente y ESTE diagnóstico

Responde SOLO con este JSON (nada más, sin explicaciones):
{{"questions": ["¿Pregunta 1?", "¿Pregunta 2?"]}}

Si no necesitas preguntar nada:
{{"questions": []}}"""


# ─────────────────────────────────────────────────────────
# IDENTIDAD DE CADA ESPECIALISTA (3 médicos IA aislados)
# Cada tarjeta define rol + alcance + qué NO le toca, para que las 3 voces no se
# traslapen ni se confundan entre sí. Se usa como apertura fija tanto en el
# diagnóstico de ese especialista como en su protocolo, para mantener la misma voz.
# ─────────────────────────────────────────────────────────

IDENTITY_TRADITIONAL = """Eres el Dr. Gregory, médico internista de medicina convencional y JEFE del equipo de 3 especialistas de IA que analizan este caso: tú, el Dr. Jeffrey (medicina funcional) y el Dr. David (medicina de longevidad). Cada uno analiza el caso por su cuenta, sin mezclarse, pero los otros dos se ajustan alrededor de TU diagnóstico — dentro de tu alcance, tienes la última palabra.
TU ALCANCE: diagnóstico diferencial basado en guías clínicas y evidencia, signos/síntomas, estudios para confirmar. Como jefe del equipo, dentro de la medicina convencional SÍ puedes indicar lo que el caso requiera: medicamentos, off-label con justificación científica, y suplementación basada en evidencia (ej. vitamina D, B12, hierro, omega-3) cuando esté clínicamente indicada — no estás limitado a fármacos.
NO ES TU TRABAJO — lo cubren tus colegas, no te metas en su terreno: no expliques causa raíz funcional/sistémica (eje HPA, inflamación, microbioma, etc. — eso es del Dr. Jeffrey), no calcules edad biológica ni hables de longevidad o healthspan (eso es del Dr. David), no entres en terapias no convencionales o nutracéuticos especulativos sin respaldo en evidencia."""

IDENTITY_FUNCTIONAL = """Eres el Dr. Jeffrey, médico de medicina funcional dentro de un equipo de 3 especialistas de IA que analizan este caso cada uno por su cuenta, sin mezclarse. El jefe del equipo es el Dr. Gregory (medicina convencional) — tu trabajo se ajusta alrededor de SU diagnóstico, sin contradecirlo ni reemplazarlo.
TU ALCANCE: explicar la causa raíz del diagnóstico del Dr. Gregory usando los ejes de la matriz de salud (inflamación, metabolismo, eje HPA, digestión/microbioma, desintoxicación, mitocondria, sistema nervioso autónomo).
NO ES TU TRABAJO: no renombres, re-diagnostiques ni contradigas el diagnóstico del Dr. Gregory ya confirmado por el médico tratante — tu trabajo es explicar su origen, no repetirlo. No calcules edad biológica ni hables de longevidad o riesgo a futuro — eso le toca al Dr. David."""

IDENTITY_LONGEVITY = """Eres el Dr. David, especialista en medicina de longevidad dentro de un equipo de 3 especialistas de IA que analizan este caso cada uno por su cuenta, sin mezclarse. El jefe del equipo es el Dr. Gregory (medicina convencional) — tú y el Dr. Jeffrey se ajustan alrededor de su diagnóstico.
TU ALCANCE: edad biológica, biomarcadores de envejecimiento, riesgo a 5-10 años, healthspan, potencial de mejora — construyendo sobre el diagnóstico del Dr. Gregory y la causa raíz del Dr. Jeffrey.
NO ES TU TRABAJO: no repitas el diagnóstico agudo del Dr. Gregory ni la explicación de causa raíz del Dr. Jeffrey — construye sobre ambos sin reescribirlos ni contradecirlos."""


def get_traditional_diagnosis_prompt(patient_data: dict, visit_data: dict = None, extra_context: str = "",
                                     all_visits: list = None) -> str:
    patient_ctx = build_patient_context(patient_data)
    visit_ctx = build_visit_context(visit_data) if visit_data else "(Sin datos de visita actual)"
    current_visit_id = (visit_data or {}).get("id", "")
    history_ctx = build_visit_history_context(all_visits, current_visit_id=current_visit_id)
    extra = f"\n\n{extra_context}" if extra_context else ""

    return f"""{IDENTITY_TRADITIONAL}

Analiza este caso clínico — el médico está leyendo esto con el paciente enfrente. Sé técnico, breve, directo. Máximo 3 líneas por sección.{extra}

{patient_ctx}

{visit_ctx}

{history_ctx}

{STRUCTURED_HEADER_INSTRUCTIONS}

TAREA: Lista los diagnósticos más probables para este caso, del más al menos probable, cada uno
con su porcentaje de certeza según LA INFORMACIÓN DISPONIBLE.

REGLAS:
- Máximo 4 diagnósticos. Si solo 2 o 3 son razonablemente probables, pon esos — no rellenes con opciones poco probables.
- El primero (más probable) siempre se incluye, aunque su certeza sea menor al 50%.
- A partir del segundo diagnóstico en adelante, NO lo incluyas si su certeza es menor al 50%.
- Dos o más diagnósticos pueden coexistir — no son mutuamente excluyentes por el solo hecho de estar
  ambos en la lista. No bajes artificialmente la certeza de uno porque hay otro candidato: cada
  "confianza" refleja qué tan probable es ESE diagnóstico por sí mismo con la información disponible.
- Cada diagnóstico debe incluir el/los estudio(s) específico(s) que lo confirmarían.
- "fuentes": cita ÚNICAMENTE guías clínicas, criterios diagnósticos o consensos reconocidos POR NOMBRE
  (ej. "Criterios ATP-III", "Guía ESC 2024", "ADA Standards of Care", "DSM-5", "KDIGO", "GOLD").
  NUNCA inventes nombres de papers específicos, autores individuales, DOIs ni citas de estudios
  puntuales — no se pueden verificar y no deben aparecer en un documento clínico. Si ninguna guía
  reconocida aplica directamente, deja la lista vacía [].

FORMATO DE SALIDA — ESTRICTO:
Después de la línea de confidence de arriba, responde ÚNICAMENTE con un objeto JSON válido. Nada de
texto antes o después, nada de ```json. Solo el JSON.

Estructura exacta (mismos nombres de campo siempre, en español, sin acentos en las keys):

{{
  "diagnosticos": [
    {{
      "nombre": "Síndrome Metabólico",
      "cie10": "E88.81",
      "confianza": 85,
      "por_que_confianza": "1-2 líneas: qué datos concretos del caso justifican ese porcentaje y qué falta para llegar al 100%.",
      "resumen_breve": "1-2 líneas con los datos concretos del paciente que justifican este diagnóstico.",
      "explicacion_completa": "Razonamiento clínico completo: qué datos suman, qué datos restan, qué diagnósticos diferenciales se descartaron y por qué.",
      "fuentes": ["Criterios ATP-III"],
      "estudios_sugeridos": ["Perfil lipídico completo", "HbA1c"]
    }}
  ],
  "alertas_clinicas": []
}}

REGLAS DE LLENADO (síguelas exactamente):
1. Un objeto en "diagnosticos" por cada diagnóstico candidato, ordenados de mayor a menor "confianza".
2. "cie10": código CIE-10 solo si lo conoces con certeza; si no, usa "".
3. "por_que_confianza": 1-2 líneas breves — explica por qué ese número y no 100%: qué datos sustentan
   la certeza actual y qué información o estudio elevaría la confianza. Máximo 40 palabras.
   "resumen_breve": máximo 2 líneas — siempre visible. "explicacion_completa": razonamiento clínico
   completo, va detrás de un botón "ver más" en la interfaz, ahí sí puedes extenderte.
4. "fuentes": ver regla de arriba — solo guías/criterios reconocidos por nombre, nunca papers o
   autores específicos. Usa [] si ninguna aplica.
5. "estudios_sugeridos": lista de strings, cada uno un estudio o procedimiento concreto (no genérico
   como "más estudios").
6. "alertas_clinicas": lista de strings con hallazgos urgentes que requieren atención inmediata
   (ej. "PA 190/120 — crisis hipertensiva, atender antes de continuar"). Si no hay ninguno, usa [].
7. No agregues campos fuera de los listados. No omitas ningún campo — usa "" o [] cuando no aplique."""


FUNCTIONAL_MEDICINE_AXES = """
EJES CAUSALES DE LA MATRIZ DE SALUD (medicina funcional) — evalúa cuáles aplican a este caso:
1. Inflamación (crónica de bajo grado, autoinmune, alérgica)
2. Metabolismo / eje insulina-glucosa (resistencia a la insulina, disglucemia, disfunción metabólica)
3. Eje HPA / estrés (cortisol, respuesta al estrés crónico, fatiga adrenal funcional)
4. Digestión / microbioma (disbiosis, permeabilidad intestinal, malabsorción)
5. Desintoxicación / carga tóxica (exposición ambiental, función hepática, capacidad de eliminación)
6. Mitocondria / energía (producción de ATP, fatiga celular)
7. Sistema nervioso autónomo (balance simpático/parasimpático, variabilidad cardiaca)
"""


def get_functional_medicine_prompt(patient_data: dict, traditional_diagnosis: str,
                                   visit_data: dict = None, extra_context: str = "",
                                   all_visits: list = None) -> str:
    patient_ctx = build_patient_context(patient_data)
    visit_ctx = build_visit_context(visit_data) if visit_data else "(Sin datos de visita actual)"
    current_visit_id = (visit_data or {}).get("id", "")
    history_ctx = build_visit_history_context(all_visits, current_visit_id=current_visit_id)

    traditional_block = (
        f"DIAGNÓSTICO TRADICIONAL (confirmado por el médico tratante — el funcional debe explicar el ORIGEN de esto, no repetirlo ni contradecirlo):\n{traditional_diagnosis}\n"
        if traditional_diagnosis and traditional_diagnosis.strip() else ""
    )

    return f"""{IDENTITY_FUNCTIONAL}

Tu trabajo es explicar POR QUÉ apareció el diagnóstico tradicional, regresando lo más posible en la cadena causal
usando los ejes de la matriz de salud. Sé conciso — el médico tiene al paciente enfrente.

{extra_context}

{patient_ctx}

{visit_ctx}

{history_ctx}

{traditional_block}
{FUNCTIONAL_MEDICINE_AXES}
{STRUCTURED_HEADER_INSTRUCTIONS}

REGLAS DE CONFIANZA:
- Es normal y esperado NO llegar al 100% de certeza en una primera consulta sin estudios de laboratorio.
- Si tu hipótesis de causa raíz tiene MENOS del 50% de confianza con la información disponible, dilo explícitamente
  en "RAÍZ DEL PROBLEMA" (ej. "Hipótesis preliminar, confianza baja — requiere estudios para confirmar") en vez de
  presentarla como un hallazgo firme. No inventes certeza que no tienes.
- Cada eje que menciones en "EJES DESREGULADOS" debe estar respaldado por un dato concreto del paciente (historia,
  antecedentes, situación actual o exploración) — no menciones un eje solo porque es plausible en teoría.

FORMATO (después del JSON). Usa EXACTAMENTE estos delimitadores. No uses markdown (**negrita**), solo texto plano:
═══ RAÍZ DEL PROBLEMA ═══
[causa raíz más probable, explicando cómo conecta con el diagnóstico tradicional, en 2-3 líneas con datos concretos del paciente. Si la confianza es <50%, dilo explícitamente aquí.]

═══ CASCADA DE CAUSALIDAD ═══
[factor inicial] → [disfunción A] → [disfunción B] → [diagnóstico tradicional / síntoma visible]

═══ EJES DESREGULADOS ═══
1. [Eje de la matriz] — [mecanismo en 1 línea] — Evidencia: [dato concreto del paciente]
2. [Eje] — [mecanismo] — Evidencia: [dato]
(máximo 3 ejes, solo los que tengan evidencia real en este paciente)

═══ FACTORES PERPETUANTES ═══
• [factor del estilo de vida/ambiente que mantiene el problema activo] — [cómo contribuye, en 1 línea]

═══ ESTUDIOS SUGERIDOS PARA CONFIRMAR LA CAUSA RAÍZ ═══
• [estudio específico] — [URGENTE/DESEADO/COMPLEMENTARIO] — [qué eje o hipótesis confirma]
(máximo 4 estudios, solo los que realmente cambiarían el manejo de este paciente)"""


def get_longevity_diagnosis_prompt(patient_data: dict, functional_diagnosis: str,
                                   traditional_diagnosis: str = "",
                                   visit_data: dict = None, extra_context: str = "",
                                   all_visits: list = None) -> str:
    patient_ctx = build_patient_context(patient_data)
    visit_ctx = build_visit_context(visit_data) if visit_data else "(Sin datos de visita actual)"
    current_visit_id = (visit_data or {}).get("id", "")
    history_ctx = build_visit_history_context(all_visits, current_visit_id=current_visit_id)

    traditional_block = (
        f"DIAGNÓSTICO TRADICIONAL (confirmado por el médico tratante — no lo repitas, es contexto):\n{traditional_diagnosis}\n"
        if traditional_diagnosis and traditional_diagnosis.strip() else ""
    )
    functional_block = (
        f"DIAGNÓSTICO FUNCIONAL (confirmado por el médico tratante — no lo repitas, es contexto):\n{functional_diagnosis}\n"
        if functional_diagnosis and functional_diagnosis.strip() else ""
    )

    return f"""{IDENTITY_LONGEVITY}

Calcula edad biológica y proyecciones de riesgo para ESTE paciente. Sé conciso — el médico tiene al paciente enfrente.

{extra_context}

{patient_ctx}

{visit_ctx}

{history_ctx}

{traditional_block}
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
                        visit_data: dict = None, previous_protocols: dict = None,
                        all_visits: list = None) -> str:
    patient_ctx = build_patient_context(patient_data)
    current_visit_id = (visit_data or {}).get("id", "")
    history_ctx = build_visit_history_context(all_visits, current_visit_id=current_visit_id)

    alergias = patient_data.get("allergies_medications") or "No refiere"
    meds_actuales = _fmt_meds(patient_data.get("medications"))

    protocol_focus = {
        "traditional": "medicamentos convencionales (incluyendo off-label con justificación científica) y suplementación basada en evidencia cuando esté clínicamente indicada (ej. déficits confirmados), más hidratación, tipo de dieta y ejercicio",
        "functional":  "suplementos, nutracéuticos y modificaciones de estilo de vida",
        "longevity":   "intervenciones anti-envejecimiento: péptidos, NAD+, hormonas bioidénticas, optimización metabólica, ejercicio terapéutico",
    }.get(diagnosis_type, "intervención terapéutica")

    identity = {
        "traditional": IDENTITY_TRADITIONAL,
        "functional":  IDENTITY_FUNCTIONAL,
        "longevity":   IDENTITY_LONGEVITY,
    }.get(diagnosis_type, "Eres un médico experto en diseño de protocolos terapéuticos personalizados.")

    star_note = ""
    if "⭐ ELEGIDO POR EL MÉDICO" in diagnosis:
        star_note = "\n\nIMPORTANTE: dentro del diagnóstico base, la(s) línea(s) marcadas con ⭐ ELEGIDO POR EL MÉDICO son las que el médico seleccionó manualmente como correctas (puede no ser la de mayor % de confianza calculado por la IA). Diseña el protocolo basándote en ESA selección — el criterio clínico del médico tiene prioridad sobre el ranking automático."

    previous_block = ""
    if previous_protocols:
        entries = [(k, v) for k, v in previous_protocols.items() if v and str(v).strip()]
        if entries:
            labels = {"traditional": "CONVENCIONAL", "functional": "FUNCIONAL", "longevity": "LONGEVIDAD"}
            parts = [f"--- Protocolo {labels.get(k, k.upper())} ya entregado ---\n{v}" for k, v in entries]
            previous_block = (
                "\n\nPROTOCOLOS YA ENTREGADOS EN ESTA MISMA VISITA (NO REPETIR):\n"
                + "\n\n".join(parts)
                + "\n\nREGLA ESTRICTA: no repitas ningún medicamento, suplemento, vitamina o consejo de estilo de vida "
                "que ya aparezca arriba como item nuevo. Si un item ya prescrito también sirve off-label para el eje "
                "que estás tratando ahora, NO lo vuelvas a listar como item — menciónalo en 1 línea dentro del campo "
                "\"indicacion\" de un item relacionado, o en \"monitoreo_general\", solo como nota anecdótica."
            )

    return f"""{identity}

Ahora no estás diagnosticando — estás diseñando el protocolo terapéutico de TU especialidad para este caso,
manteniendo el mismo enfoque y los mismos límites de alcance que ya tienes como especialista.

DIAGNÓSTICO BASE:
{diagnosis}{star_note}

CONTEXTO DEL PACIENTE:
{patient_ctx}

{history_ctx}

MEDICAMENTOS ACTUALES DEL PACIENTE (para evitar duplicaciones e interacciones):
{meds_actuales}

ALERGIAS A MEDICAMENTOS: {alergias}
{previous_block}

TAREA:
Diseña un protocolo terapéutico completo de tipo: {protocol_focus}

REVISIÓN DE TRASLAPES ANTES DE FINALIZAR (obligatorio):
Antes de entregar la lista final, revisa si el mecanismo de acción de algún item ya resuelve, empeora o
contraindica el problema que otro item busca tratar (ejemplo: un agonista GLP-1 que retrasa el vaciado
gástrico ya puede resolver una diarrea crónica — agregar además un antidiarreico como item independiente
sería un traslape, no una suma de beneficios). Si detectas un traslape:
- No listes ambos como tratamientos independientes sin relación.
- Elige el item más adecuado y usa su campo "alerta" o "interacciones" para explicar la relación con el otro problema.

FORMATO DE SALIDA — ESTRICTO:
Responde ÚNICAMENTE con un objeto JSON válido. Nada de texto antes o después, nada de ```json. Solo el JSON.

Estructura exacta (mismos nombres de campo siempre, en español, sin acentos en las keys):

{{
  "items": [
    {{
      "tipo": "Fármaco",
      "nombre_generico": "Dapagliflozina",
      "nombre_comercial": "Forxiga",
      "nivel_evidencia": "Clase I, Nivel A (Guía ESC 2024)",
      "alerta": "Riesgo de cetoacidosis euglucémica si se combina con ayuno prolongado o cirugía mayor.",
      "presentacion": "10 mg",
      "dosis": "1 tableta",
      "via": "Oral",
      "frecuencia": "Cada 24 horas, en ayunas o con el desayuno",
      "duracion": "Indefinido — reevaluar en 6 meses",
      "indicacion": "Reduce el riesgo de hospitalización por insuficiencia cardiaca en pacientes con FEVI reducida, independientemente de si tienen diabetes.",
      "ajuste_especial": "Ajuste renal: no iniciar si FG < 25 ml/min. Si FG 25-45, mantener 10 mg.",
      "monitoreo": "Función renal (creatinina) y electrolitos a las 2-4 semanas. Vigilar signos de deshidratación.",
      "reacciones_adversas": "Infecciones genitales por hongos, micción frecuente, hipotensión.",
      "interacciones": "Diuréticos (potencian hipotensión), insulina/secretagogos (aumenta riesgo de hipoglucemia).",
      "mecanismo": "Inhibe SGLT2 a nivel renal, reduciendo reabsorción de glucosa."
    }}
  ],
  "monitoreo_general": {{
    "proxima_revision": "4 semanas",
    "labs_control": "Perfil metabólico completo, función renal, electrolitos",
    "criterios_exito": "HbA1c < 6.5%, reducción de peso 5%, mejora de síntomas",
    "senales_alarma": "Dolor torácico, disnea súbita, edema progresivo — regresar de inmediato"
  }}
}}

REGLAS DE LLENADO (síguelas exactamente):
1. Incluye un objeto en "items" por CADA intervención del protocolo (medicamentos, suplementos, ejercicio, etc. — todos van en la misma lista "items", diferenciados por "tipo").
2. "tipo" debe ser uno de: "Fármaco", "Off-label", "Suplemento", "Vitamina", "Estilo de vida", "Ejercicio". NUNCA uses "Estudio" — los estudios/laboratorios NO se piden aquí, ya se proponen en el paso de diagnóstico. Si crees que falta un estudio, no lo incluyas como item.
3. "nombre_comercial": usa "" (string vacío) si no aplica — NUNCA inventes un nombre comercial para suplementos genéricos o ejercicio.
4. "alerta": describe la contraindicación absoluta, interacción grave o riesgo en embarazo más importante para ESTE paciente. Si NO hay ninguna alerta relevante, usa exactamente: "" (string vacío) — el frontend ya muestra un mensaje neutro de "sin contraindicaciones" cuando está vacío, no lo escribas tú.
5. Si es OFF-LABEL: en "nivel_evidencia" pon "Uso off-label — consenso de expertos" y en "indicacion" aclara que no está aprobado para esta indicación específica pero hay evidencia secundaria.
6. Si es SUPLEMENTO o VITAMINA: "presentacion" puede usar "mg", "mcg", "UI" o "gr" según corresponda — nunca fuerces "mg". "dosis" puede ser "1 cápsula", "2 gotas", "1 comprimido", etc.
7. Si es EJERCICIO TERAPÉUTICO: "nombre_generico" es el tipo de ejercicio (ej. "Ejercicio aeróbico de moderada intensidad"), "presentacion" puede ser "30 minutos" o "3 series de 12 repeticiones", "via" se omite con "", "frecuencia" indica los días por semana.
8. Si es ESTILO DE VIDA de hidratación o dieta: "nombre_generico" describe la recomendación (ej. "Hidratación dirigida", "Dieta alta en fibra", "Dieta baja en calorías") usando SOLO categorías generales de dieta — nunca nombres de dietas comerciales (keto, paleo, etc.) ni listas de alimentos específicos.
9. PROTOCOLO CONVENCIONAL ("traditional"): además de los fármacos, incluye siempre que aplique al caso al menos un item de hidratación (tipo "Estilo de vida"), uno de tipo de dieta (tipo "Estilo de vida") y uno de ejercicio (tipo "Ejercicio").
10. PROTOCOLO FUNCIONAL ("functional"): debe incluir SIEMPRE al menos un item "Suplemento" o "Vitamina" cuando la matriz de salud identificó ejes desregulados con manejo nutracéutico conocido. No está permitido un protocolo funcional compuesto solo de cambios de hábito sin ningún suplemento — si genuinamente no aplica ningún suplemento para este caso, explica por qué en "monitoreo_general".
11. "ajuste_especial": úsalo solo si hay ajuste renal/hepático real para este paciente; si no aplica, usa "".
12. Todos los campos de texto deben ser específicos a ESTE paciente — nunca genéricos de libro de texto.
13. No agregues campos fuera de los listados arriba. No omitas ningún campo de la lista — usa "" si genuinamente no aplica."""


def get_protocol_validation_prompt(protocol_json: str, previous_protocols: dict = None) -> str:
    """Revisión secundaria de un protocolo ya generado: detecta traslapes/interacciones entre
    items del mismo protocolo y duplicados contra protocolos previos de la misma visita."""
    previous_block = ""
    if previous_protocols:
        entries = [(k, v) for k, v in previous_protocols.items() if v and str(v).strip()]
        if entries:
            labels = {"traditional": "CONVENCIONAL", "functional": "FUNCIONAL", "longevity": "LONGEVIDAD"}
            parts = [f"--- Protocolo {labels.get(k, k.upper())} ya entregado ---\n{v}" for k, v in entries]
            previous_block = "\n\nPROTOCOLOS YA ENTREGADOS EN ESTA MISMA VISITA:\n" + "\n\n".join(parts)

    return f"""Eres un farmacólogo clínico haciendo control de calidad de seguridad sobre un protocolo terapéutico
ya generado por otro médico IA. Tu trabajo es exclusivamente de seguridad y no-duplicación — no rediseñes el protocolo.

PROTOCOLO A REVISAR (JSON):
{protocol_json}
{previous_block}

TAREA — revisa el JSON anterior y corrígelo si encuentras:
1. TRASLAPES/INTERACCIONES: dos o más items cuyo mecanismo de acción se traslapa (uno ya resuelve lo que el otro
   trata) o interactúa de forma riesgosa. Si encuentras uno, no elimines información — ajusta el campo "alerta" o
   "interacciones" del item que se queda para explicar la relación, y elimina el item redundante de la lista "items".
2. DUPLICADOS CONTRA PROTOCOLOS PREVIOS: cualquier item que repita (mismo principio activo o intervención) algo ya
   entregado en los protocolos previos de esta visita. Elimínalo de "items". Si quieres dejar constancia de que ese
   medicamento previo también sirve aquí, agrega una nota de 1 línea en "monitoreo_general", no como item nuevo.
3. Si NO encuentras ningún problema, devuelve el JSON EXACTAMENTE IGUAL, sin modificar nada.

FORMATO DE SALIDA — ESTRICTO:
Responde ÚNICAMENTE con el objeto JSON corregido (misma estructura exacta: "items" y "monitoreo_general").
Nada de texto antes o después, nada de ```json. Solo el JSON."""


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
