FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PORT=8765

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY *.py ./

RUN pip install --no-cache-dir \
    "pipecat-ai[google,websocket,silero,runner]>=1.3.0" \
    "python-dotenv>=1.0.0" \
    "httpx>=0.27.0" \
    "loguru>=0.7.0" \
    "google-genai>=1.0.0"

EXPOSE 8765

CMD ["python", "bot.py", "--host", "0.0.0.0", "--port", "8765"]
