"""Servicio interno de inferencia BERT (Flask)."""

import logging

from flask import Flask

from .classifier import BertPhishingClassifier, Classifier
from .config import Settings
from .errors import register_error_handlers
from .routes import bp


def build_classifier(settings: Settings) -> BertPhishingClassifier:
    classifier = BertPhishingClassifier(
        model_dir=settings.model_dir,
        device=settings.device,
        num_threads=settings.torch_num_threads,
        max_len=settings.max_len,
        max_chars=settings.max_chars,
    )
    classifier.warmup()
    return classifier


def create_app(classifier: Classifier | None = None, settings: Settings | None = None) -> Flask:
    """App factory. En tests se inyecta un clasificador falso."""
    settings = settings or Settings.from_env()
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )

    app = Flask(__name__)
    app.config["SETTINGS"] = settings
    app.config["CLASSIFIER"] = classifier or build_classifier(settings)
    # Límite duro del request: 32 emails de 21k caracteres caben de sobra
    app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024
    app.json.ensure_ascii = False

    register_error_handlers(app)
    app.register_blueprint(bp)
    return app
