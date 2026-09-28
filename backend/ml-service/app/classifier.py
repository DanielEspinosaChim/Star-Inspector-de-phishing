"""Clasificador BERT de phishing para inferencia en CPU."""

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Protocol

from .preprocessing import construir_texto

MODEL_NAME = "bert-base-uncased-phishing"
LABELS = ("HAM", "PHISHING")  # índice 0 = HAM, 1 = PHISHING (como en el entrenamiento)


@dataclass(frozen=True)
class EmailInput:
    subject: str
    body: str


@dataclass(frozen=True)
class Prediction:
    label: str
    confidence: float
    prob_ham: float
    prob_phishing: float
    truncated: bool

    def to_dict(self) -> dict:
        data = asdict(self)
        return {
            "label": data["label"],
            "confidence": data["confidence"],
            "probabilities": {"ham": data["prob_ham"], "phishing": data["prob_phishing"]},
            "model": MODEL_NAME,
            "truncated": data["truncated"],
        }


class Classifier(Protocol):
    device: str

    def predict(self, items: list[EmailInput]) -> list[Prediction]: ...


class ModelNotFoundError(RuntimeError):
    pass


class BertPhishingClassifier:
    """Carga el modelo una sola vez y clasifica en batch."""

    def __init__(
        self,
        model_dir: Path,
        device: str = "cpu",
        num_threads: int = 2,
        max_len: int = 128,
        max_chars: int = 1000,
    ) -> None:
        # Imports pesados aquí para que los tests con clasificador falso no carguen torch
        import torch
        from transformers import AutoTokenizer, BertForSequenceClassification

        if not (model_dir / "config.json").is_file():
            raise ModelNotFoundError(f"No se encontró el modelo en {model_dir}")
        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("ML_DEVICE=cuda pero CUDA no está disponible")

        self._torch = torch
        torch.set_num_threads(num_threads)
        self.device = device
        self.max_len = max_len
        self.max_chars = max_chars
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
        self.model = BertForSequenceClassification.from_pretrained(
            model_dir, local_files_only=True, use_safetensors=True
        )
        self.model.to(device).eval()

    def warmup(self) -> None:
        self.predict([EmailInput(subject="warmup", body="warmup")])

    def predict(self, items: list[EmailInput]) -> list[Prediction]:
        torch = self._torch
        textos, truncados = zip(
            *(construir_texto(it.subject, it.body, self.max_chars) for it in items),
            strict=True,
        )
        textos = list(textos)

        # Longitud sin truncar, solo para informar si BERT cortó el texto
        n_tokens = [len(ids) for ids in self.tokenizer(textos)["input_ids"]]
        # Padding dinámico: con attention mask el resultado equivale al
        # padding a max_length del notebook, pero es más rápido en CPU
        encoding = self.tokenizer(
            textos,
            max_length=self.max_len,
            truncation=True,
            padding=True,
            return_tensors="pt",
        ).to(self.device)

        with torch.inference_mode():
            logits = self.model(**encoding).logits
        probs = torch.softmax(logits.float(), dim=-1).cpu().tolist()

        resultados = []
        for (p_ham, p_phish), trunc_chars, n in zip(probs, truncados, n_tokens, strict=True):
            idx = 1 if p_phish > p_ham else 0
            resultados.append(
                Prediction(
                    label=LABELS[idx],
                    confidence=max(p_ham, p_phish),
                    prob_ham=p_ham,
                    prob_phishing=p_phish,
                    truncated=trunc_chars or n > self.max_len,
                )
            )
        return resultados
