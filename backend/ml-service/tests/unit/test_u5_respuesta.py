"""U5 — Respuesta: construcción de la respuesta de la API (Plan §4.1).

Prueba Prediction.to_dict, la lógica de BertPhishingClassifier.predict con un
modelo simulado (logits fijos, sin cargar pesos) y el formato de errores.
Variable registrada: etiqueta y valores devueltos.
"""

import math
from types import SimpleNamespace

import pytest

from app.classifier import LABELS, MODEL_NAME, BertPhishingClassifier, EmailInput, Prediction
from app.config import Settings

torch = pytest.importorskip("torch")
transformers = pytest.importorskip("transformers")


class ModeloFalso:
    """Devuelve logits predefinidos y guarda lo que recibió."""

    def __init__(self, logits: list[list[float]]) -> None:
        self.logits = torch.tensor(logits)
        self.recibido = None

    def __call__(self, **encoding):
        self.recibido = encoding
        return SimpleNamespace(logits=self.logits)


@pytest.fixture(scope="module")
def tokenizer():
    model_dir = Settings.from_env().model_dir
    if not (model_dir / "tokenizer.json").is_file():
        pytest.skip(f"No hay tokenizer en {model_dir}")
    return transformers.AutoTokenizer.from_pretrained(model_dir, local_files_only=True)


@pytest.fixture
def clasificador(tokenizer):
    """BertPhishingClassifier sin __init__: tokenizer real, modelo falso."""

    def _crear(logits):
        c = object.__new__(BertPhishingClassifier)
        c._torch, c.device, c.max_len, c.max_chars = torch, "cpu", 128, 1000
        c.tokenizer, c.model = tokenizer, ModeloFalso(logits)
        return c

    return _crear


def _softmax(a: float, b: float) -> tuple[float, float]:
    ea, eb = math.exp(a), math.exp(b)
    return ea / (ea + eb), eb / (ea + eb)


@pytest.mark.parametrize(
    "caso,logits,etiqueta",
    [
        ("U5-01", [3.0, -2.0], "HAM"),
        ("U5-02", [-2.0, 3.0], "PHISHING"),
        ("U5-03", [0.0, 0.0], "HAM"),  # empate exacto → HAM (solo PHISHING si p_phish > p_ham)
        ("U5-04", [0.0, 0.01], "PHISHING"),
    ],
    ids=["ham", "phishing", "empate", "margen-minimo"],
)
def test_etiqueta_y_probabilidades(clasificador, caso, logits, etiqueta, registrar):
    [pred] = clasificador([logits]).predict([EmailInput("", "hola")])
    p_ham, p_phish = _softmax(*logits)
    registrar(logits, pred.to_dict())
    assert pred.label == etiqueta
    assert pred.prob_ham == pytest.approx(p_ham, abs=1e-6)
    assert pred.prob_phishing == pytest.approx(p_phish, abs=1e-6)
    assert pred.prob_ham + pred.prob_phishing == pytest.approx(1, abs=1e-6)
    assert pred.confidence == max(pred.prob_ham, pred.prob_phishing)
    assert 0.5 <= pred.confidence <= 1


@pytest.mark.caso("U5-05")
def test_batch_conserva_orden(clasificador, registrar):
    logits = [[-3.0, 3.0], [3.0, -3.0], [-1.0, 1.0]]
    items = [EmailInput("", t) for t in ("a", "b", "c")]
    preds = clasificador(logits).predict(items)
    registrar(logits, [p.label for p in preds])
    assert [p.label for p in preds] == ["PHISHING", "HAM", "PHISHING"]


@pytest.mark.caso("U5-06")
@pytest.mark.parametrize(
    "body,truncado",
    [("hola mundo", False), ("palabra " * 400, True), ("a" * 1500, True)],
    ids=["corto", "mas-de-128-tokens", "mas-de-1000-chars"],
)
def test_bandera_truncated(clasificador, body, truncado, registrar):
    [pred] = clasificador([[1.0, 0.0]]).predict([EmailInput("", body)])
    registrar(f"{len(body)} chars", pred.truncated)
    assert pred.truncated is truncado


@pytest.mark.caso("U5-07")
def test_modelo_recibe_maximo_max_len_tokens(clasificador):
    c = clasificador([[1.0, 0.0]])
    c.predict([EmailInput("", "palabra " * 400)])
    assert c.model.recibido["input_ids"].shape[-1] == 128
    assert "attention_mask" in c.model.recibido


@pytest.mark.caso("U5-08")
def test_to_dict_contrato(registrar):
    pred = Prediction("PHISHING", 0.9, 0.1, 0.9, False)
    salida = pred.to_dict()
    registrar(pred, salida)
    assert salida == {
        "label": "PHISHING",
        "confidence": 0.9,
        "probabilities": {"ham": 0.1, "phishing": 0.9},
        "model": MODEL_NAME,
        "truncated": False,
    }
    assert salida["label"] in LABELS


@pytest.mark.caso("U5-09")
def test_formato_de_error(fake_classifier):
    from app import create_app
    from app.errors import error_response

    app = create_app(classifier=fake_classifier, settings=Settings.from_env())
    with app.app_context():
        resp, status = error_response(400, "VALIDATION_ERROR", "body es requerido")
    assert status == 400
    assert resp.get_json() == {
        "error": {"code": "VALIDATION_ERROR", "message": "body es requerido"}
    }
