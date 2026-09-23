#!/usr/bin/env bash
# A rolling deploy of images CI has already built and published. Nothing is
# compiled here: no install, no Turborepo, no Vite, no `docker build`. The
# instance has two vCPUs and they are serving traffic, and an image built here
# would be a different artifact from the one CI tested.
#
# The instance holds no checkout of this repository and no credentials for it.
# The deploy workflow checks the commit out on its own runner, copies this file
# and compose.prod.yaml over, and passes GIT_SHA; everything this script needs
# to name an artifact arrives in that variable. There is nothing here to fetch
# or check out, which is why an unset GIT_SHA is an error rather than something
# to infer from a working tree that does not exist.
#
# `docker compose up -d` is not a rolling deploy: Compose recreates services
# with no dependency edge between them in parallel, so a plain `up -d` takes
# api-1 and api-2 down together and the site is off while both start.
#
# This replaces one instance at a time and refuses to touch the second until the
# first is answering, which means a failed deploy leaves the sibling serving
# traffic rather than completing the outage.
#
# Not "no dropped requests". That is true of reads and of message sends, which
# carry a nonce the server deduplicates; it is not true of every other mutation,
# and claiming otherwise would be a promise this cannot keep.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

COMPOSE_FILE=compose.prod.yaml
READY_TIMEOUT=90

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

wait_until_ready() {
  local service="$1"
  local waited=0

  while (( waited < READY_TIMEOUT )); do
    if compose exec -T "${service}" node -e \
      "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      echo "deploy: ${service} is ready"
      return 0
    fi

    sleep 2
    waited=$(( waited + 2 ))
  done

  echo "deploy: ${service} did not become ready in ${READY_TIMEOUT}s; aborting" >&2
  echo "deploy: the other instance is still serving traffic" >&2
  return 1
}

if [[ ! -f .env ]]; then
  echo "deploy: .env is missing" >&2
  exit 1
fi

: "${GIT_SHA:?GIT_SHA is required}"
export GIT_SHA

if [[ -n "${GHCR_TOKEN:-}" ]]; then
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER:?GHCR_USER is required with GHCR_TOKEN}" --password-stdin
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
fi

echo "deploy: pulling ${GIT_SHA}"
compose pull --quiet

echo "deploy: migrating and provisioning"
compose run --rm bootstrap

for service in api-1 api-2; do
  echo "deploy: replacing ${service}"
  compose up -d --no-deps --force-recreate "${service}"
  wait_until_ready "${service}"
done

echo "deploy: replacing nginx"
compose up -d --no-deps --force-recreate nginx

echo "deploy: pruning images older than a week"
docker image prune -f --filter "until=168h"

echo "deploy: ${GIT_SHA} is live"
