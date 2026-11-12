#!/usr/bin/env bash
# Backup dos dois bancos e dos arquivos enviados. Uso: ./backup.sh [pasta-de-destino]
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml"
DEST="${1:-./backups}/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

$COMPOSE exec -T postgres pg_dump -U ignis -Fc ignis > "$DEST/postgres.dump"

$COMPOSE exec -T mongo sh -c \
  'mongodump --username ignis --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db ignis --archive --gzip' \
  > "$DEST/mongo.archive.gz"

docker run --rm -v ignis_uploads:/data:ro -v "$(cd "$DEST" && pwd)":/out alpine \
  tar czf /out/arquivos.tar.gz -C /data .

echo "Backup salvo em $DEST"
