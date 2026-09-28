# Instalar PyTorch con CUDA para RTX 5060

## Contexto del sistema
- OS: Windows 11 Pro
- GPU: NVIDIA GeForce RTX 5060 (Laptop), 8GB VRAM
- CUDA: 12.8
- Driver: 573.22
- Python: 3.12.10 en `C:\Users\danye\AppData\Local\Programs\Python\Python312\`
- pip: 25.0.1

## Lo que ya está instalado
- pandas, numpy, scikit-learn, xgboost, lightgbm, seaborn, tqdm, matplotlib, joblib
- transformers, accelerate (instalados pero sin torch aún no funcionan)

## Lo que falta instalar
Solo falta **torch** (PyTorch con CUDA 12.8). Es un archivo de **2.8GB** que pip no logra descargar completo por cortes de conexión.

## Tarea
Instalar PyTorch correctamente para que use la GPU (CUDA 12.8) con este Python:
```
C:\Users\danye\AppData\Local\Programs\Python\Python312\python.exe
```

El comando correcto es:
```bash
pip install --timeout 600 torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

Versión exacta del wheel que se necesita:
```
torch-2.11.0+cu128-cp312-cp312-win_amd64.whl  (2753 MB)
torchvision-0.26.0+cu128-cp312-cp312-win_amd64.whl
torchaudio-2.11.0+cu128-cp312-cp312-win_amd64.whl
```

## Problema que ocurre
pip descarga ~0.8GB de los 2.8GB y luego la conexión se cae. El wheel queda corrupto y pip dice `Wheel 'torch' is invalid`.

## Verificación de éxito
Cuando torch esté instalado, esto debe imprimir la GPU:
```bash
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
```
Resultado esperado:
```
2.11.0+cu128
True
NVIDIA GeForce RTX 5060 Laptop GPU
```

## Después de instalar torch
Verificar que transformers también funciona con GPU:
```bash
python -c "from transformers import BertTokenizer; t = BertTokenizer.from_pretrained('bert-base-uncased'); print('OK')"
```
