import logging

MARCADOR = "MARCADOR_UNICO_7f3a9"


def test_logs_no_contienen_el_email(client, fake_classifier, caplog):
    caplog.set_level(logging.DEBUG)
    client.post("/predict", json={"subject": MARCADOR, "body": f"hola {MARCADOR}"})
    client.post("/predict/batch", json={"emails": [{"body": MARCADOR}]})

    def boom(items):
        raise RuntimeError(MARCADOR)

    fake_classifier.predict = boom
    client.post("/predict", json={"body": MARCADOR})

    assert caplog.records, "se esperaba al menos un log"
    assert MARCADOR not in caplog.text


def test_error_de_validacion_no_refleja_valor(client):
    res = client.post("/predict", json={"body": 42, "subject": MARCADOR})
    assert MARCADOR not in res.get_data(as_text=True)
