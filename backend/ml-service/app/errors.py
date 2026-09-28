"""Errores JSON uniformes, sin trazas ni detalles internos."""

import logging

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

logger = logging.getLogger("ml_service")

_CODES = {
    400: "VALIDATION_ERROR",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
}


class ValidationError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def error_response(status: int, code: str, message: str):
    return jsonify({"error": {"code": code, "message": message}}), status


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ValidationError)
    def _validation(exc: ValidationError):
        return error_response(400, "VALIDATION_ERROR", exc.message)

    @app.errorhandler(HTTPException)
    def _http(exc: HTTPException):
        status = exc.code or 500
        return error_response(status, _CODES.get(status, "HTTP_ERROR"), exc.name)

    @app.errorhandler(Exception)
    def _unexpected(exc: Exception):
        # Solo el tipo de excepción: el mensaje podría contener el texto del email
        logger.error("error interno: %s", type(exc).__name__)
        return error_response(500, "INTERNAL_ERROR", "Error interno del servicio")
