FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

COPY requirements.txt requirements-live.txt ./
RUN pip install -r requirements.txt -r requirements-live.txt

COPY app ./app
COPY scripts ./scripts

# Runtime state (SQLite by default; override COOLPATH_DATABASE_URL for PostGIS)
ENV COOLPATH_DATABASE_URL=sqlite:////srv/data/coolpath.db \
    COOLPATH_LIVE_REFRESH_ON_STARTUP=true
VOLUME ["/srv/data"]

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
