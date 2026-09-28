import pytest

from app.preprocessing import construir_texto, limpiar_para_bert

CASOS = [
    "<b>CLICK HERE</b> to claim your FREE prize!! Visit http://win.scam.com/prize",
    "Hi John,\n\nplease send me the report by 05/15/2024.   Thanks, sam@corp.com",
    "&amp; &lt;div&gt; entidades &quot;HTML&quot; &#39;x&#39;",
    "Go to WWW.Example.org/login or HTTPS://bank.com/verify?id=1 now",
    "   espacios\t\tmúltiples \n\n y saltos   ",
    "<html><body><p>Hola</p><a href='http://x.io'>link</a></body></html>",
    "",
    "ñandú café — acentos y emoji 🎣 phishing",
]


@pytest.mark.parametrize("texto", CASOS)
def test_paridad_con_notebook(texto, notebook_limpiar):
    assert limpiar_para_bert(texto) == notebook_limpiar(texto)


@pytest.mark.parametrize("valor", [None, 123, 4.5, ["x"]])
def test_no_string_devuelve_vacio(valor, notebook_limpiar):
    assert limpiar_para_bert(valor) == "" == notebook_limpiar(valor)


def test_tokens_especiales():
    assert limpiar_para_bert("mira http://a.com y b@c.com") == "mira [URL] y [EMAIL]"


def test_construir_texto_concatena_subject_y_body():
    texto, truncado = construir_texto("<b>Asunto</b>", "Cuerpo  del   email", 1000)
    assert texto == "Asunto Cuerpo del email"
    assert truncado is False


def test_construir_texto_trunca_a_max_chars():
    texto, truncado = construir_texto("", "a" * 1500, 1000)
    assert len(texto) == 1000
    assert truncado is True
