"""Pruebas del módulo de gestión de equipo (staff):
- Alta de colaborador con display_name o nombre
- Devolución segura de credenciales (usuario y contraseña)
- Actualización de perfil y permisos (PUT /staff/{uid})
- Regeneración de contraseñas
"""
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_aislamiento_clinicas import FAKE, TestClient, TOKENS, app, hdr, seed  # noqa: E402


class FakeAuthAdmin:
    def __init__(self):
        self._counter = 100

    def create_user(self, payload):
        self._counter += 1
        uid = f"user-{self._counter}"
        return {"id": uid, "email": payload.get("email")}

    def update_user_by_id(self, uid, payload):
        return {"id": uid, **payload}

    def delete_user(self, uid):
        return {"id": uid}


class FakeAuth:
    def __init__(self):
        self.admin = FakeAuthAdmin()


FAKE.auth = FakeAuth()


class TestStaffFlow(unittest.TestCase):
    def setUp(self):
        seed()
        self.c = TestClient(app)

    def test_crear_colaborador_con_display_name_devuelve_credenciales(self):
        body = {
            "display_name": "Ana Patricia Morales",
            "email": "ana.morales@miclinica.com",
            "phone": "+529981234567",
            "birthday": "1994-08-15",
            "role": "receptionist",
            "permissions": {"pacientes": "edit", "cobros": "edit", "gastos": "edit"},
            "location_ids": ["locA"],
        }
        res = self.c.post("/staff", json=body, headers=hdr("tokA"))
        self.assertEqual(res.status_code, 200, f"Error: {res.text}")
        data = res.json()
        self.assertTrue(data.get("ok"))
        self.assertIn("usuario", data)
        self.assertIn("password", data)
        self.assertIn("id", data)
        self.assertEqual(data.get("nombre"), "Ana Patricia Morales")
        self.assertTrue(len(data["password"]) >= 10)

        # Verificar que se guardó en doctor_profiles
        perfil = next((p for p in FAKE.store.get("doctor_profiles", []) if p["id"] == data["id"]), None)
        self.assertIsNotNone(perfil)
        self.assertEqual(perfil["display_name"], "Ana Patricia Morales")
        self.assertEqual(perfil["role"], "receptionist")
        self.assertEqual(perfil["parent_doctor_id"], "docA")

    def test_crear_colaborador_con_nombre_tambien_funciona(self):
        body = {
            "nombre": "Carlos Mendoza",
            "role": "nurse",
        }
        res = self.c.post("/staff", json=body, headers=hdr("tokA"))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("nombre"), "Carlos Mendoza")

    def test_actualizar_colaborador_put_staff_uid(self):
        # Crear primero
        res = self.c.post("/staff", json={"display_name": "Laura enfermera", "role": "nurse"}, headers=hdr("tokA"))
        self.assertEqual(res.status_code, 200)
        uid = res.json()["id"]

        # Actualizar vía PUT /staff/{uid}
        patch = {
            "display_name": "Laura Elena Gómez",
            "phone": "+529989998877",
            "permissions": {"enfermeria": "edit", "pacientes": "view"},
        }
        put_res = self.c.put(f"/staff/{uid}", json=patch, headers=hdr("tokA"))
        self.assertEqual(put_res.status_code, 200, f"Error en PUT /staff/{uid}: {put_res.text}")
        p_data = put_res.json()
        self.assertTrue(p_data.get("ok"))

        # Comprobar en doctor_profiles
        perfil = next(p for p in FAKE.store.get("doctor_profiles", []) if p["id"] == uid)
        self.assertEqual(perfil["display_name"], "Laura Elena Gómez")
        self.assertEqual(perfil["phone"], "+529989998877")


if __name__ == "__main__":
    unittest.main()
