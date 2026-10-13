"""U9 — Clasificador con tokenizer y modelo falsos (sin cargar BERT ni archivos).

Cubre softmax, etiquetado, `truncated`, batching, el constructor, la fábrica
`build_classifier`, `warmup` y el arranque de `wsgi.main`.
"""

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

import app as paquete_app
from app import create_app
from app.classifier import BertPhishingClassifier, EmailInput, ModelNotFoundError
from app.config import Settings

torch = pytest.importorskip("torch")


class EncodingFalso(dict):
    """Imita BatchEncoding: dict con .to(device)."""

    def to(self, device):
        return self


class TokenizerFalso:
    """1 token por palabra; registra las llamadas para inspeccionarlas."""

    def __init__(self) -> None:
        self.llamadas: list[dict] = []

    def __call__(self, textos, **kw):
        self.llamadas.append({"textos": list(textos), **kw})
        largos = [len(t.split()) for t in textos]
        if "return_tensors" not in kw:
            return {"input_ids": [list(range(n)) for n in largos]}
        n = min(max(largos), kw.get("max_length", 10**9))
        return EncodingFalso(input_ids=torch.zeros(len(textos), n, dtype=torch.long))


class ModeloFalso:
    def __init__(self, logits) -> None:
        self.logits = torch.tensor(logits)
        self.recibido = None

    def __call__(self, **enc):
        self.recibido = enc
        return SimpleNamespace(logits=self.logits)


def _clasificador(logits, max_len=128, max_chars=1000, device="cpu"):
    c = object.__new__(BertPhishingClassifier)
    c._torch, c.device, c.max_len, c.max_chars = torch, device, max_len, max_chars
    c.tokenizer, c.model = TokenizerFalso(), ModeloFalso(logits)
    return c


@pytest.mark.caso("U9-01")
@pytest.mark.parametrize(
    "logits,label",
    [([2.0, -1.0], "HAM"), ([-1.0, 2.0], "PHISHING"), ([0.5, 0.5], "HAM")],
    ids=["ham", "phishing", "empate"],
)
def test_softmax_y_etiqueta(logits, label, registrar):
    [p] = _clasificador([logits]).predict([EmailInput("", "hola mundo")])
    registrar(logits, p.to_dict())
    assert p.label == label
    assert p.prob_ham + p.prob_phishing == pytest.approx(1.0, abs=1e-6)
    assert p.confidence == max(p.prob_ham, p.prob_phishing)


@pytest.mark.caso("U9-02")
def test_logits_extremos_no_producen_nan():
    [p] = _clasificador([[1000.0, -1000.0]]).predict([EmailInput("", "x")])
    assert p.prob_ham == pytest.approx(1.0) and p.prob_phishing == pytest.approx(0.0)
    assert p.label == "HAM"


@pytest.mark.caso("U9-03")
def test_batch_un_solo_pase_y_orden():
    c = _clasificador([[3, -3], [-3, 3], [3, -3]])
    items = [EmailInput("", "a"), EmailInput("", "b"), EmailInput("", "c")]
    preds = c.predict(items)
    assert [p.label for p in preds] == ["HAM", "PHISHING", "HAM"]
    # Una llamada de conteo y una de inferencia, ambas con el lote completo
    assert len(c.tokenizer.llamadas) == 2
    assert all(len(ll["textos"]) == 3 for ll in c.tokenizer.llamadas)


@pytest.mark.caso("U9-04")
def test_parametros_del_tokenizer():
    c = _clasificador([[0, 1]], max_len=64)
    c.predict([EmailInput("", "hola")])
    kw = c.tokenizer.llamadas[-1]
    assert kw["max_length"] == 64 and kw["truncation"] is True
    assert kw["padding"] is True and kw["return_tensors"] == "pt"
    assert "input_ids" in c.model.recibido


@pytest.mark.caso("U9-05")
def test_texto_es_subject_espacio_body_con_limpieza():
    c = _clasificador([[0, 1]])
    c.predict([EmailInput("Asunto <b>X</b>", "ver http://ejemplo.invalid ya")])
    assert c.tokenizer.llamadas[-1]["textos"] == ["Asunto X ver [URL] ya"]


@pytest.mark.caso("U9-06")
@pytest.mark.parametrize(
    "body,max_chars,max_len,truncado",
    [
        ("palabra " * 10, 1000, 128, False),
        ("a" * 2000, 1000, 128, True),  # corte por caracteres
        ("palabra " * 20, 1000, 8, True),  # corte por tokens
        ("a" * 998, 1000, 128, False),  # 998 + espacio = 999 < 1000
    ],
    ids=["corto", "por-chars", "por-tokens", "limite"],
)
def test_bandera_truncated(body, max_chars, max_len, truncado):
    [p] = _clasificador([[0, 1]], max_len=max_len, max_chars=max_chars).predict(
        [EmailInput("", body)]
    )
    assert p.truncated is truncado


@pytest.mark.caso("U9-07")
def test_truncated_por_item_en_el_lote():
    c = _clasificador([[0, 1], [0, 1]])
    cortos, largo = EmailInput("", "hola"), EmailInput("", "a" * 5000)
    assert [p.truncated for p in c.predict([cortos, largo])] == [False, True]


@pytest.mark.caso("U9-08")
def test_lista_vacia_falla_de_forma_controlada():
    # zip(*[]) no puede desempaquetarse en 2: documenta el comportamiento actual
    with pytest.raises(ValueError):
        _clasificador([[0, 1]]).predict([])


@pytest.mark.caso("U9-09")
def test_logits_de_distinto_tamano_que_items_falla():
    c = _clasificador([[0, 1]])
    with pytest.raises(ValueError):
        c.predict([EmailInput("", "a"), EmailInput("", "b")])


@pytest.mark.caso("U9-10")
def test_warmup_predice_una_vez():
    c = _clasificador([[0, 1]])
    c.warmup()
    assert len(c.tokenizer.llamadas) == 2


@pytest.mark.caso("U9-11")
def test_constructor_sin_config_json_lanza_model_not_found(tmp_path):
    with pytest.raises(ModelNotFoundError):
        BertPhishingClassifier(model_dir=tmp_path)


@pytest.mark.caso("U9-12")
def test_constructor_cuda_sin_cuda(tmp_path, monkeypatch):
    (tmp_path / "config.json").write_text("{}")
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    with pytest.raises(RuntimeError, match="CUDA"):
        BertPhishingClassifier(model_dir=tmp_path, device="cuda")


@pytest.mark.caso("U9-13")
def test_constructor_carga_local_en_cpu_con_hilos(tmp_path, monkeypatch):
    transformers = pytest.importorskip("transformers")
    (tmp_path / "config.json").write_text("{}")
    capturado = {}

    class ModeloStub:
        def to(self, device):
            capturado["device"] = device
            return self

        def eval(self):
            capturado["eval"] = True
            return self

    def tok(path, **kw):
        capturado["tok"] = kw
        return "tokenizer"

    def mod(path, **kw):
        capturado["mod"] = kw
        return ModeloStub()

    monkeypatch.setattr(transformers.AutoTokenizer, "from_pretrained", tok)
    monkeypatch.setattr(transformers.BertForSequenceClassification, "from_pretrained", mod)
    hilos = []
    monkeypatch.setattr(torch, "set_num_threads", hilos.append)

    c = BertPhishingClassifier(model_dir=tmp_path, device="cpu", num_threads=3, max_len=64)
    assert hilos == [3]
    assert capturado["tok"] == {"local_files_only": True}  # sin internet
    assert capturado["mod"] == {"local_files_only": True, "use_safetensors": True}
    assert capturado["device"] == "cpu" and capturado["eval"] is True
    assert c.max_len == 64 and c.device == "cpu"


@pytest.mark.caso("U9-14")
def test_build_classifier_pasa_settings_y_hace_warmup(monkeypatch):
    class Falso:
        device = "cpu"

        def __init__(self, **kw):
            self.kw, self.warm = kw, False

        def warmup(self):
            self.warm = True

    monkeypatch.setattr(paquete_app, "BertPhishingClassifier", Falso)
    s = Settings.from_env()
    c = paquete_app.build_classifier(s)
    assert c.warm is True
    assert c.kw == {
        "model_dir": s.model_dir,
        "device": s.device,
        "num_threads": s.torch_num_threads,
        "max_len": s.max_len,
        "max_chars": s.max_chars,
    }


@pytest.mark.caso("U9-15")
def test_create_app_sin_clasificador_lo_construye(monkeypatch, fake_classifier, settings):
    monkeypatch.setattr(paquete_app, "build_classifier", lambda s: fake_classifier)
    app = create_app(settings=settings)
    assert app.config["CLASSIFIER"] is fake_classifier
    assert app.config["SETTINGS"] is settings
    assert app.config["MAX_CONTENT_LENGTH"] == 2 * 1024 * 1024


def _importar_wsgi(monkeypatch):
    pytest.importorskip("waitress")
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[2]))
    monkeypatch.delitem(sys.modules, "wsgi", raising=False)
    import wsgi

    return wsgi


@pytest.mark.caso("U9-16")
def test_wsgi_main_sirve_con_settings(monkeypatch, fake_classifier):
    wsgi = _importar_wsgi(monkeypatch)
    llamado = {}
    monkeypatch.setattr(wsgi, "create_app", lambda settings: fake_classifier)
    monkeypatch.setattr(wsgi, "serve", lambda app, **kw: llamado.update(app=app, **kw))
    wsgi.main()
    s = Settings.from_env()
    assert llamado["host"] == s.host and llamado["port"] == s.port
    assert llamado["threads"] == s.waitress_threads


@pytest.mark.caso("U9-17")
def test_wsgi_sale_con_codigo_1_si_falta_el_modelo(monkeypatch):
    wsgi = _importar_wsgi(monkeypatch)

    def falla(settings):
        raise ModelNotFoundError("falta el modelo")

    monkeypatch.setattr(wsgi, "create_app", falla)
    with pytest.raises(SystemExit) as exc:
        wsgi.main()
    assert exc.value.code == 1
