"""
Servicio de Análisis Clínico usando Claude API
Orquestación de diagnósticos cascada y protocolos
"""

import os
from anthropic import Anthropic
from typing import Optional, Dict, Any
from .system_prompt import (
    get_traditional_diagnosis_prompt,
    get_functional_medicine_prompt,
    get_longevity_diagnosis_prompt,
    get_protocol_prompt,
    get_secondary_validation_prompt,
)

# Initialize Anthropic client
client = Anthropic()

class ClinicalAnalysisOrchestrator:
    """
    Orquestador de análisis clínicos en cascada.
    Ejecuta: Diagnóstico Tradicional → Funcional → Longevidad
    Cada uno genera un protocolo de 3 niveles.
    """

    def __init__(self, patient_data: Dict[str, Any]):
        self.patient_data = patient_data
        self.conversation_history = []
        self.analysis_results = {
            'traditional': {},
            'functional': {},
            'longevity': {},
        }

    def analyze_traditional_diagnosis(self) -> Dict[str, str]:
        """
        PASO 1: Diagnóstico de medicina tradicional
        """
        prompt = get_traditional_diagnosis_prompt(self.patient_data)

        response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        diagnosis = response.content[0].text

        # Validación anti-alucinaciones
        validation_prompt = get_secondary_validation_prompt(diagnosis)
        validation_response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=1500,
            messages=[{
                "role": "user",
                "content": validation_prompt
            }]
        )

        validation = validation_response.content[0].text

        self.analysis_results['traditional'] = {
            'diagnosis': diagnosis,
            'validation': validation,
            'status': 'pending_doctor_review',  # Doctor debe aceptar/editar/escribir
        }

        return self.analysis_results['traditional']

    def analyze_functional_diagnosis(self) -> Dict[str, str]:
        """
        PASO 2: Diagnóstico de medicina funcional
        Usa el diagnóstico tradicional como entrada
        """
        traditional_diagnosis = self.analysis_results['traditional'].get('diagnosis', '')

        prompt = get_functional_medicine_prompt(
            self.patient_data,
            traditional_diagnosis
        )

        response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        diagnosis = response.content[0].text

        # Validación
        validation_prompt = get_secondary_validation_prompt(diagnosis)
        validation_response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=1500,
            messages=[{
                "role": "user",
                "content": validation_prompt
            }]
        )

        validation = validation_response.content[0].text

        self.analysis_results['functional'] = {
            'diagnosis': diagnosis,
            'validation': validation,
            'status': 'pending_doctor_review',
        }

        return self.analysis_results['functional']

    def analyze_longevity_diagnosis(self) -> Dict[str, str]:
        """
        PASO 3: Diagnóstico de longevidad
        Calcula edad biológica, riesgos 5-10 años, optimizaciones
        """
        functional_diagnosis = self.analysis_results['functional'].get('diagnosis', '')

        prompt = get_longevity_diagnosis_prompt(
            self.patient_data,
            functional_diagnosis
        )

        response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        diagnosis = response.content[0].text

        # Validación
        validation_prompt = get_secondary_validation_prompt(diagnosis)
        validation_response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=1500,
            messages=[{
                "role": "user",
                "content": validation_prompt
            }]
        )

        validation = validation_response.content[0].text

        self.analysis_results['longevity'] = {
            'diagnosis': diagnosis,
            'validation': validation,
            'status': 'pending_doctor_review',
        }

        return self.analysis_results['longevity']

    def generate_protocol(self, diagnosis_type: str) -> Dict[str, str]:
        """
        PASOS 4-6: Generar protocolo para diagnóstico
        diagnosis_type: 'traditional' | 'functional' | 'longevity'
        """
        diagnosis = self.analysis_results.get(diagnosis_type, {}).get('diagnosis', '')

        if not diagnosis:
            return {'error': f'No diagnosis found for {diagnosis_type}'}

        prompt = get_protocol_prompt(
            self.patient_data,
            diagnosis,
            diagnosis_type
        )

        response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=2500,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        protocol = response.content[0].text

        # Guardar protocolo
        if 'protocol' not in self.analysis_results[diagnosis_type]:
            self.analysis_results[diagnosis_type]['protocol'] = {}

        self.analysis_results[diagnosis_type]['protocol'] = {
            'content': protocol,
            'status': 'pending_doctor_review',
            'doctor_edits': None,
        }

        return self.analysis_results[diagnosis_type]['protocol']

    def chat_with_diagnosis(self, diagnosis_type: str, question: str) -> str:
        """
        Chat doctor-IA para discutir diagnóstico
        diagnosis_type: 'traditional' | 'functional' | 'longevity'
        """
        diagnosis = self.analysis_results.get(diagnosis_type, {}).get('diagnosis', '')

        if not diagnosis:
            return "No diagnosis available for chat"

        # Construir contexto para el chat
        system_message = f"""Eres un médico IA asistente.
El doctor está revisando el siguiente {diagnosis_type} diagnosis:

{diagnosis}

El doctor tiene una pregunta o comentario. Responde claramente, citando partes relevantes del diagnosis."""

        # Agregar pregunta a historial de conversación
        self.conversation_history.append({
            "role": "user",
            "content": question
        })

        # Llamar a Claude
        response = client.messages.create(
            model="claude-opus-4-1-20250805",
            max_tokens=1000,
            system=system_message,
            messages=self.conversation_history
        )

        assistant_response = response.content[0].text

        # Agregar respuesta a historial
        self.conversation_history.append({
            "role": "assistant",
            "content": assistant_response
        })

        return assistant_response

    def doctor_accepts_diagnosis(self, diagnosis_type: str) -> Dict[str, str]:
        """Doctor acepta el diagnóstico tal cual"""
        self.analysis_results[diagnosis_type]['status'] = 'accepted'
        return {'status': 'accepted'}

    def doctor_edits_diagnosis(self, diagnosis_type: str, edited_text: str) -> Dict[str, str]:
        """Doctor edita el diagnóstico"""
        self.analysis_results[diagnosis_type]['doctor_edits'] = edited_text
        self.analysis_results[diagnosis_type]['status'] = 'edited'
        return {'status': 'edited', 'edited_diagnosis': edited_text}

    def get_all_results(self) -> Dict[str, Any]:
        """Retorna todos los resultados del análisis"""
        return self.analysis_results


async def run_complete_analysis(patient_id: str, visit_id: str, patient_data: dict) -> Dict[str, Any]:
    """
    Ejecuta análisis completo:
    1. Diagnóstico tradicional
    2. Diagnóstico funcional
    3. Diagnóstico longevidad
    4-6. Protocolos para cada uno
    """
    orchestrator = ClinicalAnalysisOrchestrator(patient_data)

    # Paso 1-3: Diagnósticos
    traditional = orchestrator.analyze_traditional_diagnosis()
    functional = orchestrator.analyze_functional_diagnosis()
    longevity = orchestrator.analyze_longevity_diagnosis()

    # Paso 4-6: Protocolos
    protocol_traditional = orchestrator.generate_protocol('traditional')
    protocol_functional = orchestrator.generate_protocol('functional')
    protocol_longevity = orchestrator.generate_protocol('longevity')

    return {
        'patient_id': patient_id,
        'visit_id': visit_id,
        'step_1_traditional_diagnosis': traditional,
        'step_2_functional_diagnosis': functional,
        'step_3_longevity_diagnosis': longevity,
        'step_4_traditional_protocol': protocol_traditional,
        'step_5_functional_protocol': protocol_functional,
        'step_6_longevity_protocol': protocol_longevity,
        'conversation_history': orchestrator.conversation_history,
    }
