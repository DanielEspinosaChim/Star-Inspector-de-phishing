"""Rutas del servicio ML: /health, /predict, /predict/batch."""

import logging
import re
import time
import uuid

from flask import Blueprint, current_app, jsonify, request

from .classifier import MODEL_NAME, EmailInput
from .errors import ValidationError

logger = logging.getLogger("ml_service")
bp = Blueprint("ml", __name__)

_ALLOWED_FIELDS = {"subject", "body"}
_REQUEST_ID = re.compile(r"^[\w-]{1,64}$")


def _json_object() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError("El cuerpo debe ser un objeto JSON")
    return data


def _parse_email(data: object, prefix: str = "") -> EmailInput:
    settings = current_app.config["SETTINGS"]
    if not isinstance(data, dict):
        raise ValidationError(f"{prefix}debe ser un objeto")
    extra = set(data) - _ALLOWED_FIELDS
    if extra:
        raise ValidationError(f"{prefix}campos no permitidos: {', '.join(sorted(extra))}")

    body = data.get("body")
    if not isinstance(body, str) or not body.strip():
        raise ValidationError(f"{prefix}body es requerido y debe ser texto no vacío")
    if len(body) > settings.max_body_chars:
        raise ValidationError(f"{prefix}body excede {settings.max_body_chars} caracteres")

    subject = data.get("subject", "")
    if subject is None:
        subject = ""
    if not isinstance(subject, str):
        raise ValidationError(f"{prefix}subject debe ser texto")
    if len(subject) > settings.max_subject_chars:
        raise ValidationError(f"{prefix}subject excede {settings.max_subject_chars} caracteres")

    return EmailInput(subject=subject, body=body)


def _request_id() -> str:
    rid = request.headers.get("x-request-id", "")
    return rid if _REQUEST_ID.match(rid) else uuid.uuid4().hex[:12]


def _log(ruta: str, items: list[EmailInput], labels: list[str], inicio: float) -> None:
    # Nunca se registra el contenido del email: solo longitudes y resultado
    logger.info(
        "req=%s ruta=%s n=%d chars=%s labels=%s latencia_ms=%.1f",
        _request_id(),
        ruta,
        len(items),
        [len(it.subject) + len(it.body) for it in items],
        labels,
        (time.perf_counter() - inicio) * 1000,
    )


@bp.get("/health")
def health():
    classifier = current_app.config["CLASSIFIER"]
    return jsonify({"status": "ok", "device": classifier.device, "model": MODEL_NAME})


@bp.post("/predict")
def predict():
    inicio = time.perf_counter()
    item = _parse_email(_json_object())
    [pred] = current_app.config["CLASSIFIER"].predict([item])
    _log("/predict", [item], [pred.label], inicio)
    return jsonify(pred.to_dict())


@bp.post("/predict/batch")
def predict_batch():
    inicio = time.perf_counter()
    settings = current_app.config["SETTINGS"]
    data = _json_object()
    if set(data) - {"emails"}:
        raise ValidationError("Solo se permite el campo 'emails'")
    emails = data.get("emails")
    if not isinstance(emails, list) or not 1 <= len(emails) <= settings.max_batch:
        raise ValidationError(f"emails debe ser una lista de 1 a {settings.max_batch} elementos")

    items = [_parse_email(e, prefix=f"emails[{i}]: ") for i, e in enumerate(emails)]
    preds = current_app.config["CLASSIFIER"].predict(items)
    _log("/predict/batch", items, [p.label for p in preds], inicio)
    return jsonify({"results": [p.to_dict() for p in preds]})
