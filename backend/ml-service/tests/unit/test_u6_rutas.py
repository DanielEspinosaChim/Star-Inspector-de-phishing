"""U6 — Rutas: /health, /predict y /predict/batch con clasificador falso.

Aisladas: sin modelo, sin red. Se afirma sobre estado HTTP y `error.code`,
no sobre el texto completo de los mensajes.
"""

import pytest

from app.classifier import MODEL_NAME

SINTETICO = "texto sintetico de prueba"


def _error(res) -> dict:
    cuerpo = res.get_json()
    assert set(cuerpo) == {"error"}
    assert set(cuerpo["error"]) == {"code", "message"}
    return cuerpo["error"]


@pytest.mark.caso("U6-01")
def test_health(client, registrar):
    res = client.get("/health")
    registrar("GET /health", res.get_json())
    assert res.status_code == 200
    assert res.get_json() == {"status": "ok", "device": "cpu", "model": MODEL_NAME}


@pytest.mark.caso("U6-02")
def test_predict_exito(client, fake_classifier, registrar):
    res = client.post("/predict", json={"subject": "asunto", "body": SINTETICO})
    registrar({"subject": "asunto", "body": SINTETICO}, res.get_json())
    assert res.status_code == 200
    data = res.get_json()
    assert data["label"] == "HAM"
    assert data["model"] == MODEL_NAME
    assert data["truncated"] is False
    assert set(data["probabilities"]) == {"ham", "phishing"}
    assert len(fake_classifier.calls) == 1
    assert fake_classifier.calls[0][0].subject == "asunto"


@pytest.mark.caso("U6-03")
def test_predict_phishing_sin_subject(client, registrar):
    res = client.post("/predict", json={"body": "this is phish synthetic"})
    registrar("body phish", res.get_json())
    assert res.status_code == 200
    assert res.get_json()["label"] == "PHISHING"


@pytest.mark.caso("U6-04")
def test_predict_subject_null_se_trata_como_vacio(client, fake_classifier):
    res = client.post("/predict", json={"subject": None, "body": SINTETICO})
    assert res.status_code == 200
    assert fake_classifier.calls[0][0].subject == ""


@pytest.mark.caso("U6-05")
@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"subject": "solo asunto"},
        {"body": ""},
        {"body": "   \n\t"},
        {"body": None},
        {"body": 123},
        {"body": ["lista"]},
        {"body": {"a": 1}},
        {"body": True},
    ],
    ids=["vacio", "sin-body", "body-vacio", "body-blancos", "body-null", "body-int",
         "body-lista", "body-objeto", "body-bool"],
)
def test_predict_body_invalido(client, fake_classifier, payload, registrar):
    res = client.post("/predict", json=payload)
    registrar(payload, res.get_json())
    assert res.status_code == 400
    assert _error(res)["code"] == "VALIDATION_ERROR"
    assert fake_classifier.calls == []


@pytest.mark.caso("U6-06")
@pytest.mark.parametrize(
    "payload",
    [
        {"body": SINTETICO, "extra": 1},
        {"body": SINTETICO, "label": "HAM"},
        {"body": SINTETICO, "Body": "x"},
    ],
    ids=["extra", "label", "mayuscula"],
)
def test_predict_campos_extra(client, payload):
    res = client.post("/predict", json=payload)
    assert res.status_code == 400
    assert _error(res)["code"] == "VALIDATION_ERROR"


@pytest.mark.caso("U6-07")
@pytest.mark.parametrize("subject", [5, 1.5, ["a"], {"a": 1}, False])
def test_predict_subject_tipo_invalido(client, subject):
    res = client.post("/predict", json={"subject": subject, "body": SINTETICO})
    assert res.status_code == 400
    assert _error(res)["code"] == "VALIDATION_ERROR"


@pytest.mark.caso("U6-08")
@pytest.mark.parametrize(
    "campo,delta,status",
    [
        ("body", 0, 200),
        ("body", 1, 400),
        ("subject", 0, 200),
        ("subject", 1, 400),
    ],
    ids=["body-limite", "body-excede", "subject-limite", "subject-excede"],
)
def test_predict_limites_de_longitud(client, settings, campo, delta, status, registrar):
    maximo = settings.max_body_chars if campo == "body" else settings.max_subject_chars
    payload = {"body": "a", "subject": ""}
    payload[campo] = "a" * (maximo + delta)
    res = client.post("/predict", json=payload)
    registrar(f"{campo} de {maximo + delta} chars", res.status_code)
    assert res.status_code == status


@pytest.mark.caso("U6-09")
@pytest.mark.parametrize(
    "datos,tipo",
    [
        ("{no es json", "application/json"),
        ("", "application/json"),
        ("[1, 2]", "application/json"),
        ('"texto"', "application/json"),
        ("null", "application/json"),
        ('{"body": "x"}', "text/plain"),
    ],
    ids=["malformado", "vacio", "lista", "string", "null", "content-type"],
)
def test_predict_json_invalido(client, datos, tipo):
    res = client.post("/predict", data=datos, content_type=tipo)
    assert res.status_code == 400
    assert _error(res)["code"] == "VALIDATION_ERROR"


@pytest.mark.caso("U6-10")
def test_predict_sin_content_type(client):
    res = client.post("/predict", data='{"body": "x"}')
    assert res.status_code == 400


@pytest.mark.caso("U6-11")
def test_batch_exito_conserva_orden(client, fake_classifier, registrar):
    emails = [{"body": "uno"}, {"body": "dos phish"}, {"subject": "s", "body": "tres"}]
    res = client.post("/predict/batch", json={"emails": emails})
    registrar(emails, res.get_json())
    assert res.status_code == 200
    labels = [r["label"] for r in res.get_json()["results"]]
    assert labels == ["HAM", "PHISHING", "HAM"]
    assert len(fake_classifier.calls) == 1 and len(fake_classifier.calls[0]) == 3


@pytest.mark.caso("U6-12")
def test_batch_limites_de_tamanio(client, settings):
    ok = client.post("/predict/batch", json={"emails": [{"body": "x"}] * settings.max_batch})
    assert ok.status_code == 200
    assert len(ok.get_json()["results"]) == settings.max_batch
    excede = client.post(
        "/predict/batch", json={"emails": [{"body": "x"}] * (settings.max_batch + 1)}
    )
    assert excede.status_code == 400
    assert _error(excede)["code"] == "VALIDATION_ERROR"


@pytest.mark.caso("U6-13")
@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"emails": []},
        {"emails": None},
        {"emails": "texto"},
        {"emails": {"body": "x"}},
        {"emails": [{"body": "x"}], "extra": 1},
        {"email": [{"body": "x"}]},
    ],
    ids=["vacio", "lista-vacia", "null", "string", "objeto", "campo-extra", "nombre-errado"],
)
def test_batch_estructura_invalida(client, fake_classifier, payload):
    res = client.post("/predict/batch", json=payload)
    assert res.status_code == 400
    assert _error(res)["code"] == "VALIDATION_ERROR"
    assert fake_classifier.calls == []


@pytest.mark.caso("U6-14")
@pytest.mark.parametrize(
    "emails,indice",
    [
        ([{"body": "ok"}, {"body": ""}], "emails[1]"),
        ([{"body": "ok"}, "texto"], "emails[1]"),
        ([{"body": "ok"}, None], "emails[1]"),
        ([{"body": "ok", "x": 1}], "emails[0]"),
        ([{"body": "ok"}, {"body": "ok", "subject": 3}], "emails[1]"),
    ],
    ids=["body-vacio", "string", "null", "campo-extra", "subject-tipo"],
)
def test_batch_elemento_invalido_indica_posicion(client, fake_classifier, emails, indice):
    res = client.post("/predict/batch", json={"emails": emails})
    assert res.status_code == 400
    assert indice in _error(res)["message"]
    # Un elemento inválido invalida todo el lote: el clasificador no se invoca
    assert fake_classifier.calls == []


@pytest.mark.caso("U6-15")
@pytest.mark.parametrize("datos", ["{roto", "[]", ""])
def test_batch_json_invalido(client, datos):
    res = client.post("/predict/batch", data=datos, content_type="application/json")
    assert res.status_code == 400


@pytest.mark.caso("U6-16")
@pytest.mark.parametrize(
    "metodo,ruta,status,code",
    [
        ("get", "/no-existe", 404, "NOT_FOUND"),
        ("get", "/predict", 405, "METHOD_NOT_ALLOWED"),
        ("get", "/predict/batch", 405, "METHOD_NOT_ALLOWED"),
        ("post", "/health", 405, "METHOD_NOT_ALLOWED"),
        ("delete", "/predict", 405, "METHOD_NOT_ALLOWED"),
        ("put", "/predict/batch", 405, "METHOD_NOT_ALLOWED"),
        ("get", "/predict/", 404, "NOT_FOUND"),
    ],
)
def test_rutas_inexistentes_y_metodos(client, metodo, ruta, status, code, registrar):
    res = getattr(client, metodo)(ruta)
    registrar(f"{metodo.upper()} {ruta}", res.get_json())
    assert res.status_code == status
    assert _error(res)["code"] == code


@pytest.mark.caso("U6-17")
def test_payload_mayor_al_limite_duro_responde_413(client):
    grande = '{"body": "' + "a" * (2 * 1024 * 1024 + 10) + '"}'
    res = client.post("/predict", data=grande, content_type="application/json")
    assert res.status_code == 413
    assert _error(res)["code"] == "PAYLOAD_TOO_LARGE"


@pytest.mark.caso("U6-18")
def test_respuesta_json_con_unicode(client):
    res = client.post("/predict", json={"body": "contraseña urgente ñandú"})
    assert res.status_code == 200
    assert res.content_type.startswith("application/json")
