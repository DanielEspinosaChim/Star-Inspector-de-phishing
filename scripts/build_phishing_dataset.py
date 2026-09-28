"""
build_phishing_dataset.py
=========================
Script para construcción del dataset consolidado de phishing en email.

Fuente:
    Champa et al. (2024). IEEE ICMI 2024.
    DOI: 10.5281/zenodo.8339691 — Licencia CC BY 4.0

Los CSVs se descargan AUTOMÁTICAMENTE desde Zenodo si no están presentes.
Coloca este script en una carpeta vacía y ejecuta: python build_phishing_dataset.py
"""

import os, sys, time, urllib.request
import pandas as pd
import numpy as np

# ─── PARÁMETROS ────────────────────────────────────────────────────────────
DATA_DIR     = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE  = os.path.join(DATA_DIR, "merged_phishing_full.csv")
SUMMARY_FILE = os.path.join(DATA_DIR, "pipeline_summary.csv")
MAX_REINTENTOS = 5      # veces que reintenta si la descarga falla
RANDOM_STATE   = 42
# ───────────────────────────────────────────────────────────────────────────

BASE_URL = "https://zenodo.org/api/records/8339691/files/{filename}/content"

TAMANOS_ESPERADOS = {
    "Enron.csv":       44837129,
    "Ling.csv":         9337509,
    "SpamAssasin.csv": 14879195,
    "CEAS_08.csv":     67902056,
    "TREC_07.csv":    100246925,
}

DATASETS = [
    ("Enron.csv",       "Enron",        "c"),
    ("Ling.csv",        "LingSpam",     "c"),
    ("SpamAssasin.csv", "SpamAssassin", "c"),
    ("CEAS_08.csv",     "CEAS_08",      "c"),
    ("TREC_07.csv",     "TREC_07",      "c"),
]

COLS_STD = ['source','sender','receiver','date','subject','body','urls','label']


def descargar_si_falta(filename):
    """Descarga con reintentos automaticos. Borra archivos incompletos."""
    local_path = os.path.join(DATA_DIR, filename)
    esperado   = TAMANOS_ESPERADOS.get(filename, 0)

    # Verificar si ya existe y está completo
    if os.path.exists(local_path):
        tamanio = os.path.getsize(local_path)
        if esperado == 0 or tamanio >= esperado * 0.99:
            print(f"  [OK] Ya existe: {filename} ({tamanio/1_048_576:.1f} MB)")
            return local_path
        else:
            print(f"  [INCOMPLETO] {filename} ({tamanio/1_048_576:.1f} MB de {esperado/1_048_576:.1f} MB) — reintentando...")
            os.remove(local_path)

    url = BASE_URL.format(filename=filename)

    for intento in range(1, MAX_REINTENTOS + 1):
        print(f"  [DESCARGA] {filename} — intento {intento}/{MAX_REINTENTOS}...", end="", flush=True)

        def progreso(count, block_size, total_size):
            if total_size > 0:
                pct = min(count * block_size * 100 // total_size, 100)
                mb  = count * block_size / 1_048_576
                print(f"\r  [DESCARGA] {filename} — {pct}% ({mb:.1f} MB)   ", end="", flush=True)

        try:
            urllib.request.urlretrieve(url, local_path, reporthook=progreso)
            tamanio = os.path.getsize(local_path)

            # Verificar que el archivo está completo
            if esperado > 0 and tamanio < esperado * 0.99:
                raise ValueError(f"Archivo incompleto: {tamanio} de {esperado} bytes")

            print(f"\r  [OK] {filename} ({tamanio/1_048_576:.1f} MB)                    ")
            return local_path

        except Exception as e:
            print(f"\r  [FALLO intento {intento}] {e}")
            if os.path.exists(local_path):
                os.remove(local_path)   # borrar archivo corrupto/incompleto
            if intento < MAX_REINTENTOS:
                espera = 3 * intento
                print(f"  Esperando {espera}s antes de reintentar...")
                time.sleep(espera)

    print(f"\n  [ERROR] No se pudo descargar {filename} tras {MAX_REINTENTOS} intentos.")
    print("  Descarga manual: https://zenodo.org/records/8339691")
    sys.exit(1)


def cargar_y_normalizar(filepath, source_name, engine="c"):
    """
    Carga CSV y normaliza al esquema estandar:
    - Convierte label a numerico, conserva solo 0/1
    - Agrega columnas faltantes como NaN
    - Agrega columna 'source' para trazabilidad
    - Si el engine rapido falla (comillas mal formadas, EOF), reintenta con engine python
    """
    try:
        df = pd.read_csv(filepath, engine="c", on_bad_lines="skip", low_memory=False)
    except Exception:
        df = pd.read_csv(filepath, engine="python", on_bad_lines="skip")
    df["label"] = pd.to_numeric(df["label"], errors="coerce")
    df = df[df["label"].isin([0, 1])].copy()
    df["label"] = df["label"].astype(int)
    for col in ["sender","receiver","date","subject","body","urls"]:
        if col not in df.columns:
            df[col] = np.nan
    df["source"] = source_name
    return df[COLS_STD]


# ─── PIPELINE ──────────────────────────────────────────────────────────────

print("=" * 60)
print("CONSTRUCCION DEL DATASET DE PHISHING")
print("=" * 60)

print("\n[1] Verificando / descargando archivos CSV...")
for fname, _, _ in DATASETS:
    descargar_si_falta(fname)

print("\n[2] Cargando y normalizando...")
frames, summary = [], []

for fname, src, eng in DATASETS:
    fpath = os.path.join(DATA_DIR, fname)
    print(f"\n  >> {fname}")
    df = cargar_y_normalizar(fpath, src, eng)
    n0, n1 = (df["label"]==0).sum(), (df["label"]==1).sum()
    print(f"     Filas validas: {len(df):,}  |  ham=0: {n0:,}  |  phishing=1: {n1:,}")
    if n0 == 0 or n1 == 0:
        print(f"     [EXCLUIDO] Clase unica — omitido.")
        continue
    summary.append({"Dataset":src, "Ham(0)":n0, "Phishing(1)":n1, "Total":len(df)})
    frames.append(df)

print("\n[3] Mergeando y deduplicando...")
merged = pd.concat(frames, ignore_index=True)
print(f"  Pre-dedup:  {len(merged):,}")
merged.drop_duplicates(subset=["subject","body"], keep="first", inplace=True)
merged.reset_index(drop=True, inplace=True)
n0t = (merged["label"]==0).sum()
n1t = (merged["label"]==1).sum()
print(f"  Post-dedup: {len(merged):,}  |  ham={n0t:,} ({n0t/len(merged)*100:.1f}%)  |  phishing={n1t:,} ({n1t/len(merged)*100:.1f}%)")

print(f"\n[4] Guardando...")
merged.to_csv(OUTPUT_FILE, index=False)
summary_df = pd.DataFrame(summary)
summary_df.loc[len(summary_df)] = ["TOTAL", n0t, n1t, len(merged)]
summary_df.to_csv(SUMMARY_FILE, index=False)

print("\n" + "=" * 60)
print("RESUMEN FINAL")
print("=" * 60)
print(summary_df.to_string(index=False))
print(f"\nArchivo generado: {OUTPUT_FILE}")
print("Pipeline completado.")