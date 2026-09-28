import json
import os
import sys
from pathlib import Path

import pytest

SERVICE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = SERVICE_DIR.parents[1]
sys.path.insert(0, str(SERVICE_DIR))

from app import create_app  # noqa: E402
from app.classifier import EmailInput, Prediction  # noqa: E402
from app.config import Settings  # noqa: E402

NOTEBOOK_04 = REPO_DIR / "notebooks" / "04_bert_finetuning.ipynb"

# Ejemplos de la celda "Inferencia" del notebook 04 y la clase que obtuvo allí
EJEMPLOS_NOTEBOOK = [
    (
        "Click here to verify your PayPal account immediately or it will be suspended. "
        "Login: http://paypal-verify.suspicious.com",
        "PHISHING",
    ),
    (
        "Hi team, please review the Q3 budget report attached and let me know your "
        "thoughts before Friday's meeting.",
        "HAM",
    ),
    (
        "Congratulations! You have been selected to receive a $500 Amazon gift card. "
        "Claim now before it expires!",
        "PHISHING",
    ),
    ("Can we reschedule the 3pm call to 4pm? I have a conflict with the client meeting.", "HAM"),
]


class FakeClassifier:
    """Clasificador falso: PHISHING si el body contiene 'phish'."""

    device = "cpu"

    def __init__(self) -> None:
        self.calls: list[list[EmailInput]] = []

    def predict(self, items: list[EmailInput]) -> list[Prediction]:
        self.calls.append(items)
        out = []
        for it in items:
            p = 0.9 if "phish" in it.body.lower() else 0.2
            out.append(
                Prediction(
                    label="PHISHING" if p > 0.5 else "HAM",
                    confidence=max(p, 1 - p),
                    prob_ham=1 - p,
                    prob_phishing=p,
                    truncated=False,
                )
            )
        return out


@pytest.fixture
def settings() -> Settings:
    return Settings.from_env()


@pytest.fixture
def fake_classifier() -> FakeClassifier:
    return FakeClassifier()


@pytest.fixture
def client(fake_classifier, settings):
    app = create_app(classifier=fake_classifier, settings=settings)
    app.config["TESTING"] = True
    return app.test_client()


@pytest.fixture(scope="session")
def real_classifier():
    from app.classifier import BertPhishingClassifier

    return BertPhishingClassifier(
        model_dir=Settings.from_env().model_dir,
        device="cpu",
        num_threads=int(os.environ.get("TORCH_NUM_THREADS", "2")),
    )


@pytest.fixture(scope="session")
def notebook_limpiar():
    """Ejecuta la definición de limpiar_para_bert tal como está en el notebook 04."""
    nb = json.loads(NOTEBOOK_04.read_text(encoding="utf-8"))
    for cell in nb["cells"]:
        src = "".join(cell["source"])
        if cell["cell_type"] == "code" and "def limpiar_para_bert" in src:
            # Solo imports + la función, sin la parte que carga el CSV
            definicion = src.split("# Cargar datos")[0]
            namespace: dict = {}
            exec(definicion, namespace)  # noqa: S102 — código propio del repo
            return namespace["limpiar_para_bert"]
    raise AssertionError("No se encontró limpiar_para_bert en el notebook 04")
