#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ ! -f .env ]]; then
  echo "init-bucket: .env is missing" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${S3_BUCKET:?S3_BUCKET is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${PUBLIC_ORIGIN:?PUBLIC_ORIGIN is required}"

aws() {
  docker run --rm \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
    -e AWS_DEFAULT_REGION="${AWS_REGION}" \
    amazon/aws-cli:2.36.40 "$@"
}

echo "init-bucket: allowing browser uploads from ${PUBLIC_ORIGIN} to ${S3_BUCKET}"

# POST only. GET is deliberately absent: images render through <img src>, which
# is not a CORS request at all. AllowedHeaders stays empty because a FormData
# post is CORS-simple and is never preflighted.
aws s3api put-bucket-cors \
  --bucket "${S3_BUCKET}" \
  --cors-configuration "{\"CORSRules\":[{\"AllowedOrigins\":[\"${PUBLIC_ORIGIN}\"],\"AllowedMethods\":[\"POST\"],\"AllowedHeaders\":[],\"ExposeHeaders\":[],\"MaxAgeSeconds\":3000}]}"

echo "init-bucket: done"
aws s3api get-bucket-cors --bucket "${S3_BUCKET}"
