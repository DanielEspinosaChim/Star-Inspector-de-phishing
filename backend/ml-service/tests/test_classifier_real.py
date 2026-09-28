"""Tests con el modelo BERT real en CPU (marcados slow)."""

import os
import statistics
import time
from pathlib import Path

import pytest

from app import create_app
from app.classifier import BertPhishingClassifier, EmailInput, ModelNotFoundError

from .conftest import EJEMPLOS_NOTEBOOK

pytestmark = pytest.mark.slow


@pytest.mark.parametrize("texto,esperado", EJEMPLOS_NOTEBOOK)
def test_paridad_de_clase_con_notebook(real_classifier, texto, esperado):
    # En el notebook el texto de ejemplo se pasó como un único campo
    [pred] = real_classifier.predict([EmailInput(subject="", body=texto)])
    assert pred.label == esperado
    assert pred.prob_ham + pred.prob_phishing == pytest.approx(1, abs=1e-4)


def test_corre_en_cpu(real_classifier):
    assert real_classifier.device == "cpu"
    assert next(real_classifier.model.parameters()).device.type == "cpu"


def test_batch_igual_que_individual(real_classifier):
    items = [EmailInput(subject="", body=t) for t, _ in EJEMPLOS_NOTEBOOK]
    batch = real_classifier.predict(items)
    individuales = [real_classifier.predict([it])[0] for it in items]
    for b, i in zip(batch, individuales, strict=True):
        assert b.label == i.label
        assert b.prob_phishing == pytest.approx(i.prob_phishing, abs=1e-4)


def test_texto_largo_marca_truncado(real_classifier):
    [pred] = real_classifier.predict([EmailInput(subject="", body="palabra " * 400)])
    assert pred.truncated is True


def test_falla_si_no_existe_el_modelo(tmp_path: Path):
    with pytest.raises(ModelNotFoundError):
        BertPhishingClassifier(model_dir=tmp_path / "no-existe")


# Benchmark dependiente del hardware (en batería la laptop limita la CPU):
# se corre explícitamente con RUN_PERF=1 — criterio 12
@pytest.mark.skipif(os.environ.get("RUN_PERF") != "1", reason="usar RUN_PERF=1")
def test_latencia_p95_cpu(real_classifier, settings):
    app = create_app(classifier=real_classifier, settings=settings)
    client = app.test_client()
    body = {"subject": "Account notice", "body": EJEMPLOS_NOTEBOOK[0][0] * 5}
    for _ in range(3):  # calentamiento
        client.post("/predict", json=body)

    tiempos = []
    for _ in range(50):
        t0 = time.perf_counter()
        res = client.post("/predict", json=body)
        tiempos.append((time.perf_counter() - t0) * 1000)
        assert res.status_code == 200

    p95 = statistics.quantiles(tiempos, n=20)[-1]
    print(f"latencia CPU p50={statistics.median(tiempos):.0f}ms p95={p95:.0f}ms")
    assert p95 < 300
