import pytest

from app.config import Settings


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.get_json() == {
        "status": "ok",
        "device": "cpu",
        "model": "bert-base-uncased-phishing",
    }


def test_predict_contrato(client):
    res = client.post("/predict", json={"subject": "Hola", "body": "phishing total"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["label"] == "PHISHING"
    assert 0 <= data["confidence"] <= 1
    assert data["probabilities"]["ham"] + data["probabilities"]["phishing"] == pytest.approx(
        1, abs=1e-4
    )
    assert data["model"] == "bert-base-uncased-phishing"
    assert data["truncated"] is False


def test_predict_subject_opcional(client, fake_classifier):
    res = client.post("/predict", json={"body": "hola"})
    assert res.status_code == 200
    assert fake_classifier.calls[0][0].subject == ""


def test_batch_mantiene_orden(client):
    emails = [{"body": "phish"}, {"body": "hola"}, {"body": "PHISH aquí"}]
    res = client.post("/predict/batch", json={"emails": emails})
    assert res.status_code == 200
    labels = [r["label"] for r in res.get_json()["results"]]
    assert labels == ["PHISHING", "HAM", "PHISHING"]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"body": ""},
        {"body": "   "},
        {"body": 123},
        {"body": "x" * 20_001},
        {"body": "ok", "subject": "s" * 1_001},
        {"body": "ok", "subject": 5},
        {"body": "ok", "extra": "no"},
        ["no", "es", "objeto"],
    ],
)
def test_predict_validacion(client, fake_classifier, payload):
    res = client.post("/predict", json=payload)
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] == "VALIDATION_ERROR"
    assert fake_classifier.calls == []


@pytest.mark.parametrize(
    "payload",
    [
        {"emails": []},
        {"emails": [{"body": "x"}] * 33},
        {"emails": "no-lista"},
        {"emails": [{"body": "ok"}, {"body": ""}]},
        {"emails": [{"body": "ok"}], "extra": 1},
    ],
)
def test_batch_validacion(client, fake_classifier, payload):
    res = client.post("/predict/batch", json=payload)
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] == "VALIDATION_ERROR"
    assert fake_classifier.calls == []


def test_json_invalido(client):
    res = client.post("/predict", data="{no json", content_type="application/json")
    assert res.status_code == 400


def test_error_interno_sin_trazas(client, fake_classifier):
    def boom(items):
        raise RuntimeError("detalle secreto /ruta/interna")

    fake_classifier.predict = boom
    res = client.post("/predict", json={"body": "hola"})
    assert res.status_code == 500
    body = res.get_data(as_text=True)
    assert res.get_json()["error"]["code"] == "INTERNAL_ERROR"
    assert "secreto" not in body and "Traceback" not in body and "/ruta" not in body


def test_ruta_inexistente(client):
    res = client.get("/nada")
    assert res.status_code == 404
    assert res.get_json()["error"]["code"] == "NOT_FOUND"


def test_host_por_defecto_es_local(monkeypatch):
    monkeypatch.delenv("ML_HOST", raising=False)
    monkeypatch.delenv("ML_DEVICE", raising=False)
    s = Settings.from_env()
    assert s.host == "127.0.0.1"
    assert s.device == "cpu"
