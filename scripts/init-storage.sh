#!/bin/sh
set -eu

ENDPOINT="http://rustfs:9000"

aws --endpoint-url "$ENDPOINT" s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null ||
  aws --endpoint-url "$ENDPOINT" s3api create-bucket --bucket "$S3_BUCKET"

aws --endpoint-url "$ENDPOINT" s3api put-bucket-cors \
  --bucket "$S3_BUCKET" \
  --cors-configuration file:///scripts/dev-cors.json
