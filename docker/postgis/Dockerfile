# Официальный PostgreSQL доступен для amd64 и arm64.
FROM postgres:17-bookworm

# Ставим готовые пакеты PostGIS 3.6 для архитектуры текущей машины.
# Само расширение в базе включит backend командой CREATE EXTENSION.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       'postgresql-17-postgis-3=3.6.*' \
       'postgresql-17-postgis-3-scripts=3.6.*' \
    && rm -rf /var/lib/apt/lists/*
