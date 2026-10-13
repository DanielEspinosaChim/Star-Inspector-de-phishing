"""U2 — Tokenización: conversión del texto al formato del modelo (Plan §4.1).

Usa solo el tokenizer de models/bert_phishing (no carga los pesos de BERT).
Variable registrada: entrada, salida y longitud.
"""

import pytest

from app.config import Settings
from app.preprocessing import construir_texto

transformers = pytest.importorskip("transformers")

CLS, SEP, PAD = 101, 102, 0


@pytest.fixture(scope="module")
def tokenizer():
    model_dir = Settings.from_env().model_dir
    if not (model_dir / "tokenizer.json").is_file():
        pytest.skip(f"No hay tokenizer en {model_dir}")
    return transformers.AutoTokenizer.from_pretrained(model_dir, local_files_only=True)


@pytest.fixture(scope="module")
def max_len():
    return Settings.from_env().max_len


def _tok(tokenizer, textos, max_len):
    # Mismos parámetros que BertPhishingClassifier.predict
    return tokenizer(textos, max_length=max_len, truncation=True, padding=True)


@pytest.mark.caso("U2-01")
def test_secuencia_inicia_con_cls_y_termina_con_sep(tokenizer, max_len, registrar):
    ids = _tok(tokenizer, ["verify your account"], max_len)["input_ids"][0]
    registrar("verify your account", {"ids": ids, "longitud": len(ids)})
    assert ids[0] == CLS and ids[-1] == SEP


@pytest.mark.caso("U2-02")
def test_minusculas_igual_que_entrenamiento(tokenizer):
    # bert-base-uncased: do_lower_case=True
    assert tokenizer.tokenize("URGENT PayPal") == tokenizer.tokenize("urgent paypal")


@pytest.mark.caso("U2-03")
def test_trunca_a_max_len(tokenizer, max_len, registrar):
    texto, _ = construir_texto("", "palabra " * 400, 1000)
    ids = _tok(tokenizer, [texto], max_len)["input_ids"][0]
    sin_truncar = len(tokenizer(texto)["input_ids"])
    registrar("'palabra ' * 400", {"longitud": len(ids), "sin_truncar": sin_truncar})
    assert len(ids) == max_len
    assert ids[-1] == SEP
    assert sin_truncar > max_len  # así detecta predict() que hubo truncado


@pytest.mark.caso("U2-04")
def test_texto_corto_no_se_rellena_a_max_len(tokenizer, max_len, registrar):
    ids = _tok(tokenizer, ["hola"], max_len)["input_ids"][0]
    registrar("hola", {"longitud": len(ids)})
    assert len(ids) < max_len  # padding dinámico


@pytest.mark.caso("U2-05")
def test_batch_rellena_al_mas_largo_con_mascara(tokenizer, max_len, registrar):
    enc = _tok(tokenizer, ["uno dos tres cuatro", "uno"], max_len)
    ids, mask = enc["input_ids"], enc["attention_mask"]
    registrar(["uno dos tres cuatro", "uno"], {"ids": ids, "mask": mask})
    assert len(ids[0]) == len(ids[1])
    assert ids[1][-1] == PAD and mask[1][-1] == 0
    assert all(m == 1 for m in mask[0])


@pytest.mark.caso("U2-06")
def test_tokens_de_normalizacion(tokenizer, registrar):
    # [URL] y [EMAIL] no son tokens especiales del vocabulario: se parten en
    # sub-palabras, igual que ocurrió en el entrenamiento con el mismo tokenizer
    tokens = tokenizer.tokenize("[URL] [EMAIL]")
    registrar("[URL] [EMAIL]", tokens)
    assert tokens == ["[", "ur", "##l", "]", "[", "email", "]"]


@pytest.mark.caso("U2-07")
def test_tokenizacion_determinista(tokenizer, max_len):
    texto = "Click here to verify your PayPal account [URL]"
    assert _tok(tokenizer, [texto], max_len) == _tok(tokenizer, [texto], max_len)


@pytest.mark.caso("U2-08")
def test_texto_vacio_solo_cls_sep(tokenizer, max_len):
    texto, _ = construir_texto("", "   ", 1000)
    assert _tok(tokenizer, [texto], max_len)["input_ids"][0] == [CLS, SEP]
