"""Punto de entrada: precarga el modelo en CPU y sirve con waitress."""

import logging
import sys

from waitress import serve

from app import create_app
from app.classifier import ModelNotFoundError
from app.config import Settings


def main() -> None:
    settings = Settings.from_env()
    try:
        app = create_app(settings=settings)
    except ModelNotFoundError as exc:
        logging.getLogger("ml_service").critical(str(exc))
        sys.exit(1)

    logging.getLogger("ml_service").info(
        "modelo cargado en %s (%d hilos); escuchando en %s:%d",
        settings.device,
        settings.torch_num_threads,
        settings.host,
        settings.port,
    )
    serve(app, host=settings.host, port=settings.port, threads=settings.waitress_threads)


if __name__ == "__main__":
    main()
