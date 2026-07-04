# Hugging Face Docker Space (free CPU Basic). Listens on 7860 (see README app_port).
FROM python:3.11-slim

WORKDIR /app
ENV HF_HOME=/tmp/hf \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1

# CPU-only torch keeps the image small (no CUDA payload)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# app code + weights (icd_coder_out/, faithfulness_out/, data/) uploaded from Colab
COPY . .

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
