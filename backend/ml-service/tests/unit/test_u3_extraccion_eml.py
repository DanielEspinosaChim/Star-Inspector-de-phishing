"""U3 — Extracción .eml: obtención del asunto y cuerpo (Plan §4.1).

PENDIENTE: el servicio aún no tiene parser .eml (spec 001 lo deja fuera de
alcance; la entrada actual es JSON con subject/body). Estos casos quedan
registrados como SKIPPED hasta que exista el módulo.
"""

import pytest

pytestmark = pytest.mark.skip(reason="Extracción .eml no implementada (fuera de alcance spec 001)")

CASOS = [
    ("U3-01", "texto plano: extrae Subject y cuerpo"),
    ("U3-02", "multipart/alternative: prefiere text/plain, cae a text/html"),
    ("U3-03", "Subject codificado RFC 2047 (=?UTF-8?B?...?=)"),
    ("U3-04", "cuerpo quoted-printable / base64"),
    ("U3-05", "archivo que no es .eml o está corrupto → error de validación"),
    ("U3-06", "adjuntos se ignoran"),
]


@pytest.mark.parametrize("caso,descripcion", CASOS, ids=[c[0] for c in CASOS])
def test_extraccion_eml(caso, descripcion):
    raise NotImplementedError
