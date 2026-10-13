"""Fixtures de las pruebas unitarias (Plan de pruebas §4.1).

Registro: si se define la variable REGISTRO_PRUEBAS=<ruta.csv>, al terminar
la sesión se escribe una fila por caso con el formato del Plan §8
(ID, Fecha, Prueba, Entrada, Resultado obtenido, Estado, Observaciones, Entorno).
"""

import csv
import os
import platform
from datetime import datetime
from pathlib import Path

import pytest

from app import create_app
from app.config import Settings

_FILAS: list[dict] = []


@pytest.fixture
def registrar(record_property):
    """Guarda entrada y salida del caso para el registro del plan."""

    def _registrar(entrada, salida) -> None:
        record_property("entrada", repr(entrada)[:300])
        record_property("salida", repr(salida)[:300])

    return _registrar


@pytest.fixture
def app_ctx(fake_classifier):
    """Contexto de request de Flask para probar funciones de routes aisladas."""
    app = create_app(classifier=fake_classifier, settings=Settings.from_env())
    with app.test_request_context():
        yield app


def _entorno() -> str:
    try:
        import torch
        import transformers

        libs = f"torch {torch.__version__}; transformers {transformers.__version__}"
    except ImportError:
        libs = "sin torch"
    s = Settings.from_env()
    return (
        f"python {platform.python_version()}; {libs}; "
        f"MAX_LEN={s.max_len}; MAX_CHARS={s.max_chars}; MAX_BATCH={s.max_batch}"
    )


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    if rep.when == "call" or (rep.when == "setup" and rep.skipped):
        props = dict(item.user_properties)
        caso = item.get_closest_marker("caso")
        param = item.callspec.id if hasattr(item, "callspec") else ""
        if caso:
            id_caso = f"{caso.args[0]}[{param}]" if param else caso.args[0]
        else:
            id_caso = param or item.name
        _FILAS.append(
            {
                "ID": id_caso,
                "Fecha": datetime.now().isoformat(timespec="seconds"),
                "Prueba": item.nodeid.split("::", 1)[-1],
                "Entrada": props.get("entrada", ""),
                "Resultado obtenido": props.get("salida", ""),
                "Estado": rep.outcome.upper(),
                "Observaciones": str(rep.longrepr)[:300] if rep.failed or rep.skipped else "",
            }
        )


def pytest_sessionfinish(session, exitstatus):
    ruta = os.environ.get("REGISTRO_PRUEBAS")
    if not ruta or not _FILAS:
        return
    path = Path(ruta)
    path.parent.mkdir(parents=True, exist_ok=True)
    entorno = _entorno()
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=[*_FILAS[0].keys(), "Entorno"])
        w.writeheader()
        for fila in _FILAS:
            w.writerow({**fila, "Entorno": entorno})
