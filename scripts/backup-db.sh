#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

COMPOSE_FILE=compose.prod.yaml

if [[ ! -f .env ]]; then
  echo "backup: .env is missing" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEY="backups/opencord-${STAMP}.sql.gz"

# The credentials are read inside the container, from the environment Compose
# already gave it. Expanding $POSTGRES_USER in the host shell instead would
# substitute whatever the host happens to have -- usually nothing, silently
# producing `pg_dump -U ''`.
#
# `set -o pipefail` above is what makes a failing pg_dump fail the whole
# pipeline rather than uploading a truncated object with a zero exit status.
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=plain --no-owner' \
  | gzip -9 \
  | aws s3 cp - "s3://${BACKUP_BUCKET}/${KEY}" \
      --storage-class STANDARD_IA \
      --expected-size 1073741824

echo "backup: wrote s3://${BACKUP_BUCKET}/${KEY}"
