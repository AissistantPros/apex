"""
Pruebas de aislamiento entre clínicas. NO tocan Supabase real: se reemplaza el cliente por
una base en memoria ANTES de importar la app.

Ejecutar (desde backend/):
    venv/bin/python -m unittest discover -s tests -v
"""
import os
import sys
import unittest

# Variables falsas: ganan sobre cualquier .env.local (load_dotenv no sobrescribe).
os.environ["SUPABASE_URL"] = "http://fake.invalid"
os.environ["SUPABASE_SERVICE_KEY"] = "fake-service-key"
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-fake"
os.environ.pop("APEX_DEV_AUTH_FALLBACK", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── Base de datos falsa en memoria ───────────────────────────────────────────────
class _Res:
    def __init__(self, data, count=None):
        self.data, self.count = data, count


class _Query:
    def __init__(self, store, name):
        self.store, self.name = store, name
        self.op, self.payload, self.filters, self._limit, self._count = "select", None, [], None, False

    def select(self, *a, count=None, **k):
        self.op, self._count = "select", bool(count)
        return self

    def insert(self, row, **k):
        self.op, self.payload = "insert", row
        return self

    def upsert(self, row, **k):
        self.op, self.payload = "upsert", row
        return self

    def update(self, d, **k):
        self.op, self.payload = "update", d
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, c, v):
        self.filters.append(lambda r: r.get(c) == v)
        return self

    def neq(self, c, v):
        self.filters.append(lambda r: r.get(c) != v)
        return self

    def in_(self, c, vals):
        self.filters.append(lambda r: r.get(c) in vals)
        return self

    def ilike(self, c, pat):
        sub = pat.strip("%").lower()
        self.filters.append(lambda r: sub in str(r.get(c) or "").lower())
        return self

    def is_(self, c, v):
        self.filters.append(lambda r: (r.get(c) is None) == (str(v).lower() == "null"))
        return self

    def gte(self, c, v):
        self.filters.append(lambda r: str(r.get(c) or "") >= str(v))
        return self

    def lte(self, c, v):
        self.filters.append(lambda r: str(r.get(c) or "") <= str(v))
        return self

    def or_(self, expr):
        conds = []
        for part in expr.split(","):
            col, op, val = part.split(".", 2)
            conds.append((col, op, val))

        def ok(r):
            for col, op, val in conds:
                if op == "eq" and str(r.get(col)) == val:
                    return True
                if op == "is" and val == "null" and r.get(col) is None:
                    return True
            return False
        self.filters.append(ok)
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        rows = self.store.setdefault(self.name, [])
        match = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == "insert":
            new = dict(self.payload)
            rows.append(new)
            return _Res([dict(new)])
        if self.op == "upsert":
            new = dict(self.payload)
            old = next((r for r in rows if r.get("id") == new.get("id")), None)
            if old is not None:
                old.update(new)
                return _Res([dict(old)])
            rows.append(new)
            return _Res([dict(new)])
        if self.op == "update":
            for r in match:
                r.update(self.payload)
            return _Res([dict(r) for r in match])
        if self.op == "delete":
            for r in match:
                rows.remove(r)
            return _Res([dict(r) for r in match])
        out = [dict(r) for r in match]
        if self._limit is not None:
            out = out[: self._limit]
        return _Res(out, count=len(match) if self._count else None)


class FakeSupabase:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return _Query(self.store, name)

    def rpc(self, *a, **k):
        return _Query(self.store, "_rpc")

    def __getattr__(self, _):          # storage, auth, etc.: no-ops
        return lambda *a, **k: self


FAKE = FakeSupabase()
import supabase as _supabase_pkg  # noqa: E402
_supabase_pkg.create_client = lambda *a, **k: FAKE   # db.py lo usará al importarse

import asyncio  # noqa: E402

import httpx  # noqa: E402


class TestClient:
    """Cliente síncrono mínimo sobre httpx.ASGITransport (el TestClient de esta versión de
    Starlette no es compatible con el httpx instalado)."""

    def __init__(self, app, raise_server_exceptions=False):
        self.app = app

    def request(self, method, url, **kw):
        async def go():
            transport = httpx.ASGITransport(app=self.app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
                return await c.request(method.upper(), url, **kw)
        return asyncio.run(go())

    def get(self, url, **kw): return self.request("GET", url, **kw)
    def post(self, url, **kw): return self.request("POST", url, **kw)
    def put(self, url, **kw): return self.request("PUT", url, **kw)
    def delete(self, url, **kw): return self.request("DELETE", url, **kw)


import auth  # noqa: E402
import tenant  # noqa: E402
from main import app  # noqa: E402

TOKENS = {"tokA": "docA", "tokB": "docB", "tokAdmin": "provider"}
auth._verify_token = lambda t: {"sub": TOKENS[t]} if t in TOKENS else None


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"} if tok else {}


def seed():
    s = FAKE.store
    s.clear()
    s["doctor_profiles"] = [
        {"id": "docA", "role": "doctor", "clinic_id": "A", "username": "a"},
        {"id": "docB", "role": "doctor", "clinic_id": "B", "username": "b"},
        {"id": "provider", "role": "admin", "clinic_id": None, "username": "p"},
    ]
    s["clinics"] = [{"id": "A", "plan": "apex"}, {"id": "B", "plan": "apex"}]
    s["patients"] = [
        {"id": "pA", "full_name": "Ana Prueba", "first_name": "Ana", "last_name": "Prueba",
         "date_of_birth": "1980-01-01", "clinic_id": "A", "doctor_id": "docA"},
        {"id": "pB", "full_name": "Ana Prueba", "first_name": "Ana", "last_name": "Prueba",
         "date_of_birth": "1980-01-01", "clinic_id": "B", "doctor_id": "docB"},
        {"id": "pLegacy", "full_name": "Luis Viejo", "clinic_id": None, "doctor_id": "docA"},
        {"id": "pOrphan", "full_name": "Sin Ancla", "clinic_id": None, "doctor_id": None},
    ]
    s["visits"] = [
        {"id": "vA", "patient_id": "pA", "doctor_id": "docA"},
        {"id": "vB", "patient_id": "pB", "doctor_id": "docB"},
    ]
    s["patient_notes"] = [
        {"id": "nA", "patient_id": "pA", "content": "nota A"},
        {"id": "nB", "patient_id": "pB", "content": "nota secreta B"},
    ]
    s["analyses"] = [{"visit_id": "vB", "patient_id": "pB"}, {"visit_id": "vA", "patient_id": "pA"}]


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = TestClient(app, raise_server_exceptions=False)

    def setUp(self):
        seed()


class TestSinSesion(Base):
    """Antes estas rutas respondían sin validar el token."""
    RUTAS = [
        ("get", "/patients/check-duplicate?first_name=Ana&last_name=Prueba&date_of_birth=1980-01-01"),
        ("get", "/patients/pA/visits"), ("get", "/patients/pA/notes"),
        ("post", "/patients/pA/notes"), ("delete", "/patients/pA/notes/nA"),
        ("get", "/visits/pA"), ("put", "/visits/vA"), ("get", "/visits/vA/detail"),
        ("get", "/analyze/vA"), ("get", "/analyze/vA/logs"),
        ("get", "/patients/pA"), ("put", "/patients/pA"),
    ]

    def test_sin_token_da_401(self):
        for metodo, ruta in self.RUTAS:
            kw = {"json": {"content": "x"}} if metodo in ("post", "put") else {}
            r = getattr(self.c, metodo)(ruta, **kw)
            self.assertEqual(r.status_code, 401, f"{metodo.upper()} {ruta} → {r.status_code}")

    def test_token_invalido_da_401(self):
        r = self.c.get("/patients/pA/notes", headers=hdr("falso"))
        self.assertEqual(r.status_code, 401)


class TestEntreClinicas(Base):
    """La clínica A no puede leer ni tocar nada de la clínica B (y recibe 404, no 403)."""

    def test_lecturas_ajenas_dan_404(self):
        rutas = ["/patients/pB", "/patients/pB/visits", "/patients/pB/notes",
                 "/patients/pB/last-prescription", "/visits/pB", "/visits/vB/detail",
                 "/analyze/vB", "/analyze/vB/logs", "/deletions/for-patient/pB",
                 "/appointments/patient-brief/pB"]
        for ruta in rutas:
            r = self.c.get(ruta, headers=hdr("tokA"))
            self.assertEqual(r.status_code, 404, f"GET {ruta} → {r.status_code}: {r.text[:120]}")

    def test_escrituras_ajenas_dan_404(self):
        casos = [("put", "/patients/pB", {"phone": "1"}), ("put", "/visits/vB", {"motivo": "x"}),
                 ("post", "/patients/pB/notes", {"content": "x"}),
                 ("delete", "/patients/pB/notes/nB", None),
                 ("post", "/patients/pB/send-prescription", None),
                 ("post", "/visits/pB", {"motivo": "x"})]
        for metodo, ruta, body in casos:
            kw = {"json": body} if body is not None else {}
            r = getattr(self.c, metodo)(ruta, headers=hdr("tokA"), **kw)
            self.assertEqual(r.status_code, 404, f"{metodo.upper()} {ruta} → {r.status_code}")
        self.assertEqual(len([n for n in FAKE.store["patient_notes"] if n["id"] == "nB"]), 1)

    def test_ids_en_el_cuerpo_se_validan(self):
        r = self.c.post("/visits/", headers=hdr("tokA"), json={"patient_id": "pB", "motivo": "x"})
        self.assertEqual(r.status_code, 404)
        r = self.c.post("/clinic/sales", headers=hdr("tokA"),
                        json={"patient_id": "pB", "items": [{"concepto": "c", "cantidad": 1, "precio": 10}]})
        self.assertEqual(r.status_code, 404, r.text[:200])
        r = self.c.post("/appointments", headers=hdr("tokA"),
                        json={"starts_at": "2030-01-01T10:00:00Z", "ends_at": "2030-01-01T10:30:00Z",
                              "location_id": "loc", "patient_id": "pB"})
        self.assertEqual(r.status_code, 404, r.text[:200])
        self.assertFalse([v for v in FAKE.store["visits"] if v.get("motivo") == "x"])

    def test_lo_propio_si_funciona(self):
        for ruta in ["/patients/pA", "/patients/pA/notes", "/patients/pA/visits",
                     "/visits/pA", "/visits/vA/detail", "/patients/pLegacy"]:
            r = self.c.get(ruta, headers=hdr("tokA"))
            self.assertEqual(r.status_code, 200, f"GET {ruta} → {r.status_code}: {r.text[:120]}")
        self.assertEqual(self.c.get("/patients/pA/notes", headers=hdr("tokA")).json()["notes"][0]["id"], "nA")

    def test_paciente_antiguo_sin_clinic_id(self):
        # clinic_id vacío pero anclado a docA: solo la clínica de docA lo ve.
        self.assertEqual(self.c.get("/patients/pLegacy", headers=hdr("tokA")).status_code, 200)
        self.assertEqual(self.c.get("/patients/pLegacy", headers=hdr("tokB")).status_code, 404)

    def test_paciente_sin_ancla_no_lo_ve_nadie(self):
        for tok in ("tokA", "tokB"):
            self.assertEqual(self.c.get("/patients/pOrphan", headers=hdr(tok)).status_code, 404)

    def test_admin_proveedor_no_ve_pacientes(self):
        self.assertEqual(self.c.get("/patients/pA", headers=hdr("tokAdmin")).status_code, 404)

    def test_check_duplicate_solo_de_mi_clinica(self):
        q = "/patients/check-duplicate?first_name=Ana&last_name=Prueba&date_of_birth=1980-01-01"
        j = self.c.get(q, headers=hdr("tokA")).json()
        self.assertEqual([d["id"] for d in j["duplicates"]], ["pA"])
        self.assertNotIn("clinic_id", j["duplicates"][0])
        self.assertNotIn("doctor_id", j["duplicates"][0])
        j = self.c.get(q, headers=hdr("tokB")).json()
        self.assertEqual([d["id"] for d in j["duplicates"]], ["pB"])


class TestAnclasProtegidas(Base):
    """Un cliente no puede reasignar un registro a otra clínica o paciente."""

    def test_put_paciente_no_cambia_ancla(self):
        r = self.c.put("/patients/pA", headers=hdr("tokA"),
                       json={"phone": "999", "clinic_id": "B", "doctor_id": "docB", "id": "otro"})
        self.assertEqual(r.status_code, 200, r.text[:200])
        p = next(p for p in FAKE.store["patients"] if p["id"] == "pA")
        self.assertEqual((p["clinic_id"], p["doctor_id"], p["phone"]), ("A", "docA", "999"))

    def test_visita_nueva_no_cambia_paciente(self):
        r = self.c.post("/visits/pA", headers=hdr("tokA"),
                        json={"patient_id": "pB", "doctor_id": "docB", "motivo": "dolor"})
        self.assertEqual(r.status_code, 200, r.text[:200])
        nueva = next(v for v in FAKE.store["visits"] if v.get("motivo") == "dolor")
        self.assertEqual((nueva["patient_id"], nueva["doctor_id"]), ("pA", "docA"))

    def test_put_visita_no_cambia_paciente(self):
        r = self.c.put("/visits/vA", headers=hdr("tokA"), json={"patient_id": "pB", "motivo": "m"})
        self.assertEqual(r.status_code, 200, r.text[:200])
        v = next(v for v in FAKE.store["visits"] if v["id"] == "vA")
        self.assertEqual((v["patient_id"], v.get("motivo")), ("pA", "m"))

    def test_nota_ajena_no_se_borra_bajo_paciente_propio(self):
        self.c.delete("/patients/pA/notes/nB", headers=hdr("tokA"))
        self.assertTrue([n for n in FAKE.store["patient_notes"] if n["id"] == "nB"])


class TestFuncionPertenencia(unittest.TestCase):
    def test_reglas(self):
        a = {"role": "doctor", "clinic_id": "A", "doctor_id": "docA"}
        self.assertTrue(tenant.patient_belongs(a, {"clinic_id": "A", "doctor_id": "x"}))
        self.assertFalse(tenant.patient_belongs(a, {"clinic_id": "B", "doctor_id": "docA"}))
        self.assertTrue(tenant.patient_belongs(a, {"clinic_id": None, "doctor_id": "docA"}))
        self.assertFalse(tenant.patient_belongs(a, {"clinic_id": None, "doctor_id": "docB"}))
        self.assertFalse(tenant.patient_belongs(a, {"clinic_id": None, "doctor_id": None}))
        self.assertFalse(tenant.patient_belongs(a, None))
        self.assertFalse(tenant.patient_belongs({"role": "admin", "clinic_id": "A", "doctor_id": "docA"},
                                                {"clinic_id": "A", "doctor_id": "docA"}))
        solo = {"role": "doctor", "clinic_id": None, "doctor_id": "docA"}   # cuenta sin clínica
        self.assertTrue(tenant.patient_belongs(solo, {"clinic_id": "A", "doctor_id": "docA"}))
        self.assertFalse(tenant.patient_belongs(solo, {"clinic_id": "A", "doctor_id": "docB"}))


if __name__ == "__main__":
    unittest.main()
