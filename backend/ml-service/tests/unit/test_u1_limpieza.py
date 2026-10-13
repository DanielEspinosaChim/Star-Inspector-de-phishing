"""U1 — Limpieza: procesamiento y normalización del texto (Plan §4.1).

Variable registrada: entrada y salida de la función.
"""

import pytest

from app.preprocessing import construir_texto, limpiar_para_bert

CASOS = [
    ("U1-01", "<b>Hola</b> mundo", "Hola mundo"),
    # entidades se decodifican y luego se quitan los tags que formaban
    ("U1-02", "&amp; &lt;b&gt;x&lt;/b&gt;", "& x"),
    ("U1-03", "Visita HTTPS://Bank.com/login?x=1 ya", "Visita [URL] ya"),
    ("U1-04", "entra a www.banco-falso.mx hoy", "entra a [URL] hoy"),
    ("U1-05", "escribe a soporte@paypal.com.mx", "escribe a [EMAIL]"),
    ("U1-06", "http://user@sitio.com/login", "[URL]"),  # URL tiene prioridad sobre email
    ("U1-07", "  uno\t\tdos\n\n tres  ", "uno dos tres"),
    # conserva mayúsculas, números y puntuación
    ("U1-08", "URGENTE: Pague $500 hoy!!", "URGENTE: Pague $500 hoy!!"),
    ("U1-09", "ñandú café 🎣", "ñandú café 🎣"),
    ("U1-10", "", ""),
]


@pytest.mark.parametrize("caso,entrada,esperado", CASOS, ids=[c[0] for c in CASOS])
def test_limpieza(caso, entrada, esperado, registrar):
    salida = limpiar_para_bert(entrada)
    registrar(entrada, salida)
    assert salida == esperado


@pytest.mark.caso("U1-11")
@pytest.mark.parametrize("valor", [None, 123, 4.5, ["x"], {"a": 1}])
def test_entrada_no_texto_devuelve_vacio(valor, registrar):
    salida = limpiar_para_bert(valor)
    registrar(valor, salida)
    assert salida == ""


@pytest.mark.caso("U1-12")
@pytest.mark.parametrize("entrada", [c[1] for c in CASOS])
def test_limpieza_es_idempotente(entrada):
    una = limpiar_para_bert(entrada)
    assert limpiar_para_bert(una) == una


@pytest.mark.caso("U1-13")
def test_construir_texto_une_subject_y_body(registrar):
    salida = construir_texto("<b>Aviso</b>", "Su   cuenta http://x.io", 1000)
    registrar(("<b>Aviso</b>", "Su   cuenta http://x.io"), salida)
    assert salida == ("Aviso Su cuenta [URL]", False)


@pytest.mark.caso("U1-14")
def test_construir_texto_sin_subject_igual_que_entrenamiento():
    # El notebook hace subject + ' ' + body aun con subject vacío
    assert construir_texto("", "hola", 1000) == (" hola", False)


@pytest.mark.caso("U1-15")
@pytest.mark.parametrize(
    "largo,truncado",
    [(999, False), (1000, False), (1001, True)],
    ids=["999", "1000-limite", "1001"],
)
def test_construir_texto_limite_max_chars(largo, truncado, registrar):
    # subject vacío aporta 1 carácter (el espacio)
    texto, trunc = construir_texto("", "a" * (largo - 1), 1000)
    registrar(f"{largo} chars", (len(texto), trunc))
    assert len(texto) == min(largo, 1000)
    assert trunc is truncado


@pytest.mark.caso("U1-16")
def test_construir_texto_trunca_despues_de_limpiar():
    # 600 tags HTML no cuentan para el límite: se eliminan antes
    texto, trunc = construir_texto("", "<p>" * 600 + "hola", 1000)
    assert texto == " hola"
    assert trunc is False
