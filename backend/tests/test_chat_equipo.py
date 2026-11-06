"""Chat del equipo: los mensajes que se listan son los ÚLTIMOS (en orden cronológico) y la lista de
chats trae el último mensaje de cada canal visible (sin tocar Supabase real).
Ejecutar desde backend/:  venv/bin/python -m unittest tests.test_chat_equipo"""
import os
import sys
import unittest

os.environ["SUPABASE_URL"] = "http://fake.invalid"
os.environ["SUPABASE_SERVICE_KEY"] = "fake-service-key"
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-fake"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import routes_messages as rm  # noqa: E402


class FakeQuery:
    """Imita el encadenado de supabase-py sobre una lista de filas en memoria."""

    def __init__(self, rows):
        self.rows = list(rows)
        self._desc = False
        self._limit = None

    def select(self, *_a, **_k): return self
    def eq(self, col, val):
        self.rows = [r for r in self.rows if r.get(col) == val]
        return self
    def gt(self, col, val):
        self.rows = [r for r in self.rows if r.get(col) > val]
        return self
    def order(self, col, desc=False):
        self.rows.sort(key=lambda r: r[col], reverse=desc)
        return self
    def limit(self, n):
        self._limit = n
        return self
    def execute(self):
        data = self.rows[: self._limit] if self._limit is not None else self.rows
        return type("R", (), {"data": data})()


class FakeSupabase:
    def __init__(self, rows): self.rows = rows
    def table(self, _name): return FakeQuery(self.rows)


ACTOR = {"role": "doctor", "doctor_id": "clinica-1", "user_id": "u1"}


def _msgs(n, canal="general"):
    return [
        {"id": f"m{i:03d}", "clinic_id": "clinica-1", "canal": canal, "author_id": "u2",
         "content": f"mensaje {i}", "created_at": f"2026-11-06T10:{i // 60:02d}:{i % 60:02d}+00:00"}
        for i in range(n)
    ]


class ChatEquipoTest(unittest.TestCase):
    def setUp(self):
        self._get_actor, self._supabase = rm.get_actor, rm.supabase
        rm.get_actor = lambda _auth: ACTOR

    def tearDown(self):
        rm.get_actor, rm.supabase = self._get_actor, self._supabase

    def test_lista_los_ultimos_mensajes_en_orden_cronologico(self):
        rm.supabase = FakeSupabase(_msgs(150))
        out = rm.list_messages(canal="general", limit=100, authorization="x")["messages"]
        self.assertEqual(len(out), 100)
        self.assertEqual(out[0]["id"], "m050")    # los más viejos (0-49) ya no entran
        self.assertEqual(out[-1]["id"], "m149")   # el más nuevo SÍ aparece
        self.assertEqual([m["id"] for m in out], sorted(m["id"] for m in out))

    def test_con_after_trae_solo_lo_nuevo_en_orden(self):
        rm.supabase = FakeSupabase(_msgs(10))
        out = rm.list_messages(canal="general", after="2026-11-06T10:00:06+00:00", authorization="x")["messages"]
        self.assertEqual([m["id"] for m in out], ["m007", "m008", "m009"])

    def test_previews_trae_el_ultimo_de_cada_canal_visible(self):
        rows = _msgs(5, "general") + _msgs(3, "recepcion") + _msgs(2, "medico")
        rm.supabase = FakeSupabase(rows)
        out = rm.previews(authorization="x")["previews"]
        self.assertEqual(out["general"]["content"], "mensaje 4")
        self.assertEqual(out["recepcion"]["content"], "mensaje 2")
        self.assertNotIn("medico", out)        # el médico no ve su propio canal
        self.assertNotIn("enfermeria", out)    # sin mensajes, no hay vista previa


if __name__ == "__main__":
    unittest.main()
