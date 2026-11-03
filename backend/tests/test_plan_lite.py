"""Pruebas del plan Lite y de la marca por clínica (sin tocar Supabase real)."""
import os
import sys
import unittest

os.environ["SUPABASE_URL"] = "http://fake.invalid"
os.environ["SUPABASE_SERVICE_KEY"] = "fake-service-key"
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-fake"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import supabase as _sb  # noqa: E402

_sb.create_client = lambda *a, **k: object()   # db.py no necesita red para estas pruebas

from services import plans  # noqa: E402


class TestPlanLite(unittest.TestCase):
    def test_lite_solo_control(self):
        on = {k for k, v in plans.preset_features("apex_lite").items() if v}
        self.assertEqual(on, {"agenda", "pacientes", "consulta", "contabilidad", "documentos"})

    def test_lite_sin_ia_ni_marketing(self):
        feats = plans.preset_features("apex_lite")
        for f in plans.FEATURES:
            if f.startswith("ia_") or f in ("marketing", "biblioteca", "sala_espera", "chat_equipo"):
                self.assertFalse(feats[f], f)

    def test_lite_tiene_etiqueta_y_limites(self):
        self.assertIn("apex_lite", plans.PLAN_LABELS)
        self.assertEqual(plans.DEFAULT_LIMITS["apex_lite"], {"max_users": 3, "max_locations": 1})

    def test_entitlements_de_clinica_lite_sin_creditos(self):
        ent = plans.entitlements_for_clinic({"plan": "apex_lite", "features": {}, "ai_credits": 0})
        self.assertEqual(ent["plan"], "apex_lite")
        self.assertFalse(ent["features"]["ia_consulta"])
        self.assertTrue(ent["features"]["pacientes"])

    def test_otros_planes_no_cambian(self):
        self.assertTrue(plans.preset_features("apex")["ia_consulta"])
        self.assertTrue(plans.preset_features("apex_full")["ia_longevidad"])

    def test_ia_bloqueada_en_lite(self):
        from fastapi import HTTPException
        orig = plans.get_entitlements
        plans.get_entitlements = lambda cid: plans.entitlements_for_clinic(
            {"plan": "apex_lite", "features": {}, "ai_credits": 100000})
        try:
            with self.assertRaises(HTTPException) as cm:
                plans.require_ai("c1", "ia_consulta")
            self.assertEqual(cm.exception.status_code, 403)
        finally:
            plans.get_entitlements = orig


if __name__ == "__main__":
    unittest.main()
