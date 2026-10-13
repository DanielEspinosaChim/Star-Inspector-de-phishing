"""U7 — Errores y logging: manejadores globales, request id y ausencia de PII."""

import logging
import re

import pytest

from app import create_app
from app.errors import ValidationError, error_response

MARCADOR = "MARCADOR_SENTINELA_u7c41"


def _cliente_con_rutas_de_error(fake_classifier, settings):
    app = create_app(classifier=fake_classifier, settings=settings)

    @app.get("/_explota")
    def _explota():
        raise RuntimeError(f"fallo con {MARCADOR} en C:\\secreto\\ruta.py")

    @app.get("/_valida")
    def _valida():
        raise ValidationError("mensaje controlado")

    return app.test_client()


@pytest.mark.caso("U7-01")
def test_error_response_formato(app_ctx):
    res, status = error_response(418, "CODIGO", "mensaje")
    assert status == 418
    assert res.get_json() == {"error": {"code": "CODIGO", "message": "mensaje"}}


@pytest.mark.caso("U7-02")
def test_validation_error_handler(fake_classifier, settings):
    res = _cliente_con_rutas_de_error(fake_classifier, settings).get("/_valida")
    assert res.status_code == 400
    assert res.get_json() == {
        "error": {"code": "VALIDATION_ERROR", "message": "mensaje controlado"}
    }


@pytest.mark.caso("U7-03")
def test_error_inesperado_es_500_generico(fake_classifier, settings, registrar):
    res = _cliente_con_rutas_de_error(fake_classifier, settings).get("/_explota")
    texto = res.get_data(as_text=True)
    registrar("RuntimeError", res.get_json())
    assert res.status_code == 500
    assert res.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert MARCADOR not in texto
    assert "Traceback" not in texto
    assert "secreto" not in texto and ".py" not in texto


@pytest.mark.caso("U7-04")
def test_fallo_del_clasificador_es_500_sin_detalles(client, fake_classifier):
    def boom(items):
        raise RuntimeError(MARCADOR)

    fake_classifier.predict = boom
    res = client.post("/predict", json={"body": MARCADOR})
    assert res.status_code == 500
    assert MARCADOR not in res.get_data(as_text=True)
    assert set(res.get_json()["error"]) == {"code", "message"}

    res = client.post("/predict/batch", json={"emails": [{"body": MARCADOR}]})
    assert res.status_code == 500
    assert res.get_json()["error"]["code"] == "INTERNAL_ERROR"


@pytest.mark.caso("U7-05")
def test_log_de_error_interno_solo_tiene_el_tipo(fake_classifier, settings, caplog):
    cli = _cliente_con_rutas_de_error(fake_classifier, settings)
    with caplog.at_level(logging.DEBUG):
        cli.get("/_explota")
    registros = [r for r in caplog.records if r.name == "ml_service"]
    assert registros and "RuntimeError" in registros[0].getMessage()
    assert MARCADOR not in caplog.text
    # Sin traza adjunta (exc_info) que pudiera filtrar el mensaje
    assert all(r.exc_info is None for r in registros)


@pytest.mark.caso("U7-06")
@pytest.mark.parametrize(
    "metodo,ruta,code",
    [("get", "/zzz", "NOT_FOUND"), ("post", "/health", "METHOD_NOT_ALLOWED")],
)
def test_errores_http_sin_trazas_ni_rutas(client, metodo, ruta, code):
    res = getattr(client, metodo)(ruta)
    texto = res.get_data(as_text=True)
    assert res.get_json()["error"]["code"] == code
    assert "Traceback" not in texto and "app\\" not in texto and "app/" not in texto


@pytest.mark.caso("U7-07")
def test_codigo_http_desconocido_usa_http_error(fake_classifier, settings):
    from werkzeug.exceptions import ImATeapot

    app = create_app(classifier=fake_classifier, settings=settings)

    @app.get("/_teapot")
    def _t():
        raise ImATeapot()

    res = app.test_client().get("/_teapot")
    assert res.status_code == 418
    assert res.get_json()["error"]["code"] == "HTTP_ERROR"


@pytest.mark.caso("U7-08")
def test_validacion_no_refleja_el_valor(client):
    res = client.post("/predict", json={"body": 42, "subject": MARCADOR})
    assert MARCADOR not in res.get_data(as_text=True)
    res = client.post("/predict", json={"body": MARCADOR, "subject": 7})
    assert MARCADOR not in res.get_data(as_text=True)


@pytest.mark.caso("U7-09")
def test_logs_de_exito_sin_contenido(client, caplog):
    with caplog.at_level(logging.DEBUG):
        client.post("/predict", json={"subject": MARCADOR, "body": f"hola {MARCADOR}"})
        client.post("/predict/batch", json={"emails": [{"subject": MARCADOR, "body": MARCADOR}]})
    registros = [r.getMessage() for r in caplog.records if r.name == "ml_service"]
    assert len(registros) == 2
    assert MARCADOR not in caplog.text
    assert "ruta=/predict " in registros[0] and "labels=['HAM']" in registros[0]
    assert "ruta=/predict/batch" in registros[1]
    assert re.search(r"latencia_ms=\d+\.\d", registros[0])


@pytest.mark.caso("U7-10")
def test_log_solo_longitudes(client, caplog):
    with caplog.at_level(logging.INFO):
        client.post("/predict", json={"subject": "abc", "body": "12345"})
    assert "chars=[8]" in caplog.text


@pytest.mark.caso("U7-11")
def test_requests_invalidos_no_loguean_contenido(client, caplog):
    with caplog.at_level(logging.DEBUG):
        client.post("/predict", data="{" + MARCADOR, content_type="application/json")
        client.post("/predict/batch", json={"emails": [{"body": MARCADOR, "x": 1}]})
    assert MARCADOR not in caplog.text


@pytest.mark.caso("U7-12")
@pytest.mark.parametrize(
    "header,se_conserva",
    [
        ("req-123_ABC", True),
        ("a" * 64, True),
        ("a" * 65, False),
        ("con espacio", False),
        ("punto.y;coma", False),
        ("<script>", False),
        ("", False),
    ],
    ids=["valido", "64", "65", "espacio", "simbolos", "html", "vacio"],
)
def test_request_id_en_log(client, caplog, header, se_conserva):
    with caplog.at_level(logging.INFO):
        client.post("/predict", json={"body": "x"}, headers={"x-request-id": header})
    msg = next(r.getMessage() for r in caplog.records if r.name == "ml_service")
    assert (f"req={header} " in msg) is se_conserva
    if not se_conserva:
        assert re.search(r"req=[0-9a-f]{12} ", msg)


@pytest.mark.caso("U7-13")
def test_request_id_ausente_genera_uno(client, caplog):
    with caplog.at_level(logging.INFO):
        client.post("/predict", json={"body": "x"})
    msg = next(r.getMessage() for r in caplog.records if r.name == "ml_service")
    assert re.search(r"req=[0-9a-f]{12} ", msg)
