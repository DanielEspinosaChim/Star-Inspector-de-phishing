"""Configuración del servicio ML leída de variables de entorno."""

import os
from dataclasses import dataclass
from pathlib import Path

# backend/ml-service/ — base para resolver rutas relativas de MODEL_DIR
SERVICE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_DIR = SERVICE_DIR.parents[1] / "models" / "bert_phishing"


def _int(name: str, default: int, minimo: int = 1, maximo: int | None = None) -> int:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    try:
        number = int(value)
    except ValueError as exc:
        raise ValueError(f"La variable {name} debe ser un entero") from exc
    if number < minimo or (maximo is not None and number > maximo):
        rango = f">= {minimo}" if maximo is None else f"entre {minimo} y {maximo}"
        raise ValueError(f"La variable {name} debe ser {rango}")
    return number


def _model_dir() -> Path:
    raw = os.environ.get("MODEL_DIR")
    if not raw:
        return DEFAULT_MODEL_DIR
    path = Path(raw)
    return path if path.is_absolute() else (SERVICE_DIR / path).resolve()


@dataclass(frozen=True)
class Settings:
    model_dir: Path
    host: str
    port: int
    device: str
    torch_num_threads: int
    waitress_threads: int
    max_len: int
    max_chars: int
    max_batch: int
    max_body_chars: int
    max_subject_chars: int
    log_level: str

    @classmethod
    def from_env(cls) -> "Settings":
        device = os.environ.get("ML_DEVICE", "cpu").lower()
        if device not in {"cpu", "cuda"}:
            raise ValueError("ML_DEVICE debe ser 'cpu' o 'cuda'")
        return cls(
            model_dir=_model_dir(),
            host=os.environ.get("ML_HOST", "127.0.0.1"),
            port=_int("ML_PORT", 5000, 1, 65535),
            device=device,
            torch_num_threads=_int("TORCH_NUM_THREADS", 2),
            waitress_threads=_int("WAITRESS_THREADS", 2),
            # MAX_LEN y MAX_CHARS deben coincidir con el entrenamiento (notebook 04)
            max_len=_int("MAX_LEN", 128),
            max_chars=_int("MAX_CHARS", 1000),
            max_batch=_int("MAX_BATCH", 32),
            max_body_chars=_int("MAX_BODY_CHARS", 20_000),
            max_subject_chars=_int("MAX_SUBJECT_CHARS", 1_000),
            log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        )
