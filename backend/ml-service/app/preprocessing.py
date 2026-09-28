"""Preprocesamiento de texto para BERT.

`limpiar_para_bert` es copia literal de la celda de carga de datos de
`notebooks/04_bert_finetuning.ipynb`. Si cambia allá, debe cambiar aquí:
`tests/test_preprocessing.py` compara ambas versiones.
"""

import html
import re


def limpiar_para_bert(text: str) -> str:
    """
    Limpieza suave para BERT:
    - Removemos HTML (no tiene significado lingüístico)
    - Normalizamos URLs y emails a tokens especiales
    - Mantenemos: mayúsculas/minúsculas, puntuación, stopwords, números
      (BERT los usa para entender contexto)
    """
    if not isinstance(text, str):
        return ''
    # Decodificar entidades HTML
    text = html.unescape(text)
    # Remover tags HTML
    text = re.sub(r'<[^>]+>', ' ', text)
    # Normalizar URLs a token especial
    text = re.sub(r'https?://\S+|www\.\S+', '[URL]', text, flags=re.IGNORECASE)
    # Normalizar emails a token especial
    text = re.sub(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[EMAIL]', text)
    # Normalizar espacios múltiples
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def construir_texto(subject: str, body: str, max_chars: int) -> tuple[str, bool]:
    """Arma el texto de entrada igual que en el entrenamiento.

    Devuelve (texto, truncado) donde `truncado` indica si se cortó por
    exceder `max_chars`.
    """
    texto = limpiar_para_bert(subject) + ' ' + limpiar_para_bert(body)
    return texto[:max_chars], len(texto) > max_chars
