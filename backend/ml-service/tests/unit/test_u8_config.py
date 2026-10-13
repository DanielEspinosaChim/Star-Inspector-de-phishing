"""U8 — Configuración: variables de entorno, valores por defecto e inválidos."""

from pathlib import Path

import pytest

from app import config
from app.config import DEFAULT_MODEL_DIR, SERVICE_DIR, Settings

VARIABLES = [
    "MODEL_DIR", "ML_HOST", "ML_PORT", "ML_DEVICE", "TORCH_NUM_THREADS", "WAITRESS_THREADS",
    "MAX_LEN", "MAX_CHARS", "MAX_BATCH", "MAX_BODY_CHARS", "MAX_SUBJECT_CHARS", "LOG_LEVEL",
]


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    for v in VARIABLES:
        monkeypatch.delenv(v, raising=False)


@pytest.mark.caso("U8-01")
def test_valores_por_defecto(registrar):
    s = Settings.from_env()
    registrar("sin variables", s)
    assert s.host == "127.0.0.1"  # nunca público por defecto
    assert s.port == 5000
    assert s.device == "cpu"
    assert s.torch_num_threads == 2 and s.waitress_threads == 2
    assert (s.max_len, s.max_chars) == (128, 1000)  # paridad con el entrenamiento
    assert (s.max_batch, s.max_body_chars, s.max_subject_chars) == (32, 20_000, 1_000)
    assert s.log_level == "INFO"
    assert s.model_dir == DEFAULT_MODEL_DIR


@pytest.mark.caso("U8-02")
def test_variables_de_entorno(monkeypatch):
    for k, v in {
        "ML_HOST": "0.0.0.0", "ML_PORT": "6001", "TORCH_NUM_THREADS": "4",
        "WAITRESS_THREADS": "8", "MAX_LEN": "64", "MAX_CHARS": "500", "MAX_BATCH": "5",
        "MAX_BODY_CHARS": "100", "MAX_SUBJECT_CHARS": "10", "LOG_LEVEL": "debug",
    }.items():
        monkeypatch.setenv(k, v)
    s = Settings.from_env()
    assert (s.host, s.port) == ("0.0.0.0", 6001)
    assert (s.torch_num_threads, s.waitress_threads) == (4, 8)
    assert (s.max_len, s.max_chars, s.max_batch) == (64, 500, 5)
    assert (s.max_body_chars, s.max_subject_chars) == (100, 10)
    assert s.log_level == "DEBUG"


@pytest.mark.caso("U8-03")
@pytest.mark.parametrize(
    "valor,esperado", [("cpu", "cpu"), ("CPU", "cpu"), ("cuda", "cuda"), ("CUDA", "cuda")]
)
def test_device_valido(monkeypatch, valor, esperado):
    monkeypatch.setenv("ML_DEVICE", valor)
    assert Settings.from_env().device == esperado


@pytest.mark.caso("U8-04")
@pytest.mark.parametrize("valor", ["gpu", "mps", "cpu ", " cpu", "cuda:0"])
def test_device_invalido(monkeypatch, valor):
    monkeypatch.setenv("ML_DEVICE", valor)
    with pytest.raises(ValueError, match="ML_DEVICE"):
        Settings.from_env()


@pytest.mark.caso("U8-05")
@pytest.mark.parametrize("valor", ["abc", "1.5", "5 0", "1e3"])
@pytest.mark.parametrize("nombre", ["ML_PORT", "MAX_BATCH", "TORCH_NUM_THREADS", "MAX_LEN"])
def test_entero_invalido(monkeypatch, nombre, valor):
    monkeypatch.setenv(nombre, valor)
    with pytest.raises(ValueError, match=nombre):
        Settings.from_env()


@pytest.mark.caso("U8-06")
def test_entero_vacio_usa_default(monkeypatch):
    monkeypatch.setenv("ML_PORT", "")
    assert Settings.from_env().port == 5000


@pytest.mark.caso("U8-07")
def test_entero_con_espacios_se_acepta(monkeypatch):
    # int() tolera espacios alrededor del número
    monkeypatch.setenv("ML_PORT", " 7000 ")
    assert Settings.from_env().port == 7000


@pytest.mark.caso("U8-07b")
@pytest.mark.parametrize(
    ("nombre", "valor"),
    [("MAX_BATCH", "-1"), ("MAX_BATCH", "0"), ("MAX_LEN", "0"), ("ML_PORT", "0"),
     ("ML_PORT", "65536"), ("TORCH_NUM_THREADS", "-2")],
)
def test_entero_fuera_de_rango_se_rechaza(monkeypatch, nombre, valor):
    monkeypatch.setenv(nombre, valor)
    with pytest.raises(ValueError, match=nombre):
        Settings.from_env()


@pytest.mark.caso("U8-07c")
def test_puerto_limites_validos(monkeypatch):
    for valor in ("1", "65535"):
        monkeypatch.setenv("ML_PORT", valor)
        assert Settings.from_env().port == int(valor)


@pytest.mark.caso("U8-08")
def test_model_dir_absoluto(monkeypatch, tmp_path):
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    assert Settings.from_env().model_dir == tmp_path


@pytest.mark.caso("U8-09")
def test_model_dir_relativo_se_resuelve_desde_el_servicio(monkeypatch):
    monkeypatch.setenv("MODEL_DIR", "../../models/bert_phishing")
    d = Settings.from_env().model_dir
    assert d.is_absolute()
    assert d == (SERVICE_DIR / "../../models/bert_phishing").resolve()


@pytest.mark.caso("U8-10")
def test_model_dir_vacio_usa_default(monkeypatch):
    monkeypatch.setenv("MODEL_DIR", "")
    assert Settings.from_env().model_dir == DEFAULT_MODEL_DIR


@pytest.mark.caso("U8-11")
def test_default_apunta_a_models_bert_phishing():
    assert DEFAULT_MODEL_DIR.parts[-2:] == ("models", "bert_phishing")
    assert SERVICE_DIR == Path(config.__file__).resolve().parents[1]


@pytest.mark.caso("U8-12")
def test_settings_es_inmutable():
    s = Settings.from_env()
    with pytest.raises(AttributeError):
        s.port = 1  # type: ignore[misc]
