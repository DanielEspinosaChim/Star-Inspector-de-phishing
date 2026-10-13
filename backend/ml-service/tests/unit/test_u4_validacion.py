"""U4 — Validación: entradas vacías, incorrectas o incompletas (Plan §4.1).

Prueba _parse_email y _json_object de app.routes de forma aislada.
Variable registrada: tipo de entrada y respuesta.
"""

import pytest

from app.classifier import EmailInput
from app.errors import ValidationError
from app.routes import _parse_email, _request_id

MARCADOR = "VALOR_PRIVADO_91x"

VALIDOS = [
    ("U4-01", {"subject": "Hola", "body": "texto"}, EmailInput("Hola", "texto")),
    ("U4-02", {"body": "texto"}, EmailInput("", "texto")),
    ("U4-03", {"subject": None, "body": "texto"}, EmailInput("", "texto")),
    ("U4-04", {"body": "x" * 20_000}, EmailInput("", "x" * 20_000)),  # límite exacto
    ("U4-05", {"subject": "s" * 1_000, "body": "ok"}, EmailInput("s" * 1_000, "ok")),
    ("U4-06", {"subject": "¿Ñandú?", "body": "café 🎣"}, EmailInput("¿Ñandú?", "café 🎣")),
]

INVALIDOS = [
    ("U4-07", {}, "body es requerido"),
    ("U4-08", {"body": ""}, "body es requerido"),
    ("U4-09", {"body": " \n\t "}, "body es requerido"),
    ("U4-10", {"body": 123}, "body es requerido"),
    ("U4-11", {"body": None}, "body es requerido"),
    ("U4-12", {"body": ["a"]}, "body es requerido"),
    ("U4-13", {"body": "x" * 20_001}, "body excede 20000"),
    ("U4-14", {"body": "ok", "subject": "s" * 1_001}, "subject excede 1000"),
    ("U4-15", {"body": "ok", "subject": 5}, "subject debe ser texto"),
    ("U4-16", {"body": "ok", "extra": 1, "otro": 2}, "campos no permitidos: extra, otro"),
    ("U4-17", ["no", "es", "objeto"], "debe ser un objeto"),
    ("U4-18", "texto suelto", "debe ser un objeto"),
]


def _tipo(data) -> str:
    if not isinstance(data, dict):
        return type(data).__name__
    return {k: type(v).__name__ for k, v in data.items()} or "objeto vacío"


@pytest.mark.parametrize("caso,data,esperado", VALIDOS, ids=[c[0] for c in VALIDOS])
def test_entrada_valida(app_ctx, caso, data, esperado, registrar):
    salida = _parse_email(data)
    registrar(_tipo(data), salida if len(repr(salida)) < 200 else "EmailInput(ok)")
    assert salida == esperado


@pytest.mark.parametrize("caso,data,mensaje", INVALIDOS, ids=[c[0] for c in INVALIDOS])
def test_entrada_invalida(app_ctx, caso, data, mensaje, registrar):
    with pytest.raises(ValidationError) as exc:
        _parse_email(data)
    registrar(_tipo(data), exc.value.message)
    assert mensaje in exc.value.message


@pytest.mark.caso("U4-19")
def test_prefijo_indica_el_email_del_batch(app_ctx):
    with pytest.raises(ValidationError) as exc:
        _parse_email({"body": ""}, prefix="emails[3]: ")
    assert exc.value.message.startswith("emails[3]: ")


@pytest.mark.caso("U4-20")
@pytest.mark.parametrize(
    "data",
    [{"body": 1, "subject": MARCADOR}, {"body": "ok", "subject": MARCADOR * 200}],
    ids=["body-invalido", "subject-largo"],
)
def test_mensaje_de_error_no_refleja_el_contenido(app_ctx, data):
    with pytest.raises(ValidationError) as exc:
        _parse_email(data)
    assert MARCADOR not in exc.value.message


@pytest.mark.caso("U4-21")
@pytest.mark.parametrize(
    "payload,valido",
    [({"a": 1}, True), ([1, 2], False), ("x", False), (None, False)],
    ids=["objeto", "lista", "string", "null"],
)
def test_json_object(payload, valido, fake_classifier):
    from app import create_app
    from app.config import Settings
    from app.routes import _json_object

    app = create_app(classifier=fake_classifier, settings=Settings.from_env())
    with app.test_request_context(json=payload):
        if valido:
            assert _json_object() == payload
        else:
            with pytest.raises(ValidationError, match="objeto JSON"):
                _json_object()


@pytest.mark.caso("U4-22")
@pytest.mark.parametrize(
    "header,se_conserva",
    [
        ("prueba-001", True),
        ("a" * 64, True),
        ("a" * 65, False),
        ("x y", False),
        ("<script>", False),
    ],
    ids=["normal", "64-chars", "65-chars", "espacio", "inyeccion"],
)
def test_request_id(header, se_conserva, fake_classifier):
    from app import create_app
    from app.config import Settings

    app = create_app(classifier=fake_classifier, settings=Settings.from_env())
    with app.test_request_context(headers={"x-request-id": header}):
        rid = _request_id()
    if se_conserva:
        assert rid == header
    else:
        assert rid != header and len(rid) == 12
