#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

COMPOSE_FILE=compose.prod.yaml
EXTRA_DIR=infra/nginx/extra
TLS_CONF="${EXTRA_DIR}/20-https.local.conf"

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

require() {
  if [[ -z "${!1:-}" ]]; then
    echo "provision: ${1} is required" >&2
    exit 1
  fi
}

if [[ ! -f .env ]]; then
  echo "provision: .env is missing; copy .env.example and fill it in" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

require DOMAIN
require ACME_EMAIL
require PUBLIC_ORIGIN
require STORAGE_PUBLIC_ORIGIN

: "${GIT_SHA:?GIT_SHA is required}"
export GIT_SHA

echo "provision: deploying ${GIT_SHA}"

# Before any compose command. This directory is a bind-mount source in
# compose.prod.yaml, so Docker creates it root-owned if it is missing when the
# first container starts -- and the TLS block below is then written by this
# script, as a non-root user, into a directory it cannot write to. That failure
# lands after the certificate has already been issued, and each retry spends
# another one against Let's Encrypt's duplicate-certificate limit.
mkdir -p "${EXTRA_DIR}"

if [[ -f "${TLS_CONF}" ]]; then
  echo "provision: TLS block already in place, skipping issuance"
else
  echo "provision: starting NGINX on HTTP to answer the challenge"
  compose up -d --wait nginx

  echo "provision: requesting a certificate for ${DOMAIN}"
  compose run --rm certbot certonly \
    --webroot --webroot-path /var/www/certbot \
    --email "${ACME_EMAIL}" \
    --agree-tos --no-eff-email --non-interactive \
    -d "${DOMAIN}"

  echo "provision: installing the TLS server block"
  DOMAIN="${DOMAIN}" envsubst '${DOMAIN}' \
    < infra/nginx/tls/20-https.conf > "${TLS_CONF}"

  compose exec nginx nginx -t
  compose exec nginx nginx -s reload
fi

echo "provision: bringing the stack up"
compose up -d --wait

echo "provision: installing the renewal timer"
sudo tee /etc/cron.daily/opencord-certbot >/dev/null <<EOF
#!/bin/sh
cd "$(pwd)" || exit 0
docker compose -f ${COMPOSE_FILE} run --rm certbot renew \\
  --webroot --webroot-path /var/www/certbot --quiet
docker compose -f ${COMPOSE_FILE} exec nginx nginx -s reload
EOF
sudo chmod +x /etc/cron.daily/opencord-certbot

if [[ -n "${BACKUP_BUCKET:-}" ]]; then
  echo "provision: installing the nightly backup timer"
  sudo tee /etc/cron.daily/opencord-backup >/dev/null <<EOF
#!/bin/sh
cd "$(pwd)" || exit 0
./scripts/backup-db.sh
EOF
  sudo chmod +x /etc/cron.daily/opencord-backup
else
  echo "provision: BACKUP_BUCKET is unset, so no backup timer was installed"
fi

echo "provision: done"
