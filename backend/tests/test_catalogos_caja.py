"""Catálogos de caja: comparación sin acentos, lugares y categoría inferida de los gastos
(sin tocar Supabase real). Ejecutar desde backend/:  venv/bin/python -m unittest tests.test_catalogos_caja"""
import os
import sys
import unittest

os.environ["SUPABASE_URL"] = "http://fake.invalid"
os.environ["SUPABASE_SERVICE_KEY"] = "fake-service-key"
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-fake"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import routes_clinic as rc  # noqa: E402


class CatalogosCajaTest(unittest.TestCase):
    def test_norm_ignora_mayusculas_y_acentos(self):
        self.assertEqual(rc._norm("  Clínica SAN José "), "clinica san jose")
        self.assertEqual(rc._norm(None), "")

    def test_catalog_add_no_duplica_con_otro_acento_o_mayusculas(self):
        cats = {"lugares": [{"id": "1", "nombre": "Hospital Playamed"}]}
        self.assertFalse(rc._catalog_add(cats, "lugares", "hospital playamed"))
        self.assertTrue(rc._catalog_add(cats, "lugares", "Hospital Joya Cancún"))
        self.assertFalse(rc._catalog_add(cats, "lugares", "HOSPITAL JOYA CANCUN"))
        self.assertEqual([x["nombre"] for x in cats["lugares"]], ["Hospital Playamed", "Hospital Joya Cancún"])
        self.assertFalse(rc._catalog_add(cats, "lugares", "   "))

    def test_catalog_add_crea_la_lista_si_no_existia(self):
        cats = {}
        self.assertTrue(rc._catalog_add(cats, "proveedores", "Farmacia del Ahorro", categoria="insumos"))
        self.assertEqual(cats["proveedores"][0]["categoria"], "insumos")
        self.assertTrue(cats["proveedores"][0]["id"])

    def test_lugares_es_un_catalogo_valido(self):
        self.assertIn("lugares", rc.CATALOG_KINDS)

    def test_categoria_del_gasto_se_infiere(self):
        self.assertEqual(rc._inferir_categoria("Renta consultorio"), "renta")
        self.assertEqual(rc._inferir_categoria("Anuncios", "Meta Ads"), "publicidad")
        self.assertEqual(rc._inferir_categoria("Recibo de luz", "CFE"), "internet")
        self.assertEqual(rc._inferir_categoria("Guantes", "Farmacia"), "insumos")
        self.assertEqual(rc._inferir_categoria("Cena de equipo"), "otros")
        self.assertEqual(rc._inferir_canal("Suscripción", "Doctoralia"), "Doctoralia")
        self.assertIsNone(rc._inferir_canal("Luz", "CFE"))


if __name__ == "__main__":
    unittest.main()
