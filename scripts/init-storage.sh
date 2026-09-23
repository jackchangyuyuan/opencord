#!/bin/sh
set -eu

ENDPOINT="http://rustfs:9000"

# The rule production uses, with this stack's origins substituted. POST only:
# GET is deliberately absent because an <img> is not a CORS request, and an
# empty AllowedHeaders is enough because a FormData post is CORS-simple and is
# never preflighted.
origins=$(printf '%s' "${STORAGE_CORS_ORIGINS:?}" |
  awk -F, '{for (i = 1; i <= NF; i++) printf "%s\"%s\"", (i > 1 ? "," : ""), $i}')

aws --endpoint-url "$ENDPOINT" s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null ||
  aws --endpoint-url "$ENDPOINT" s3api create-bucket --bucket "$S3_BUCKET"

aws --endpoint-url "$ENDPOINT" s3api put-bucket-cors \
  --bucket "$S3_BUCKET" \
  --cors-configuration "{\"CORSRules\":[{\"AllowedOrigins\":[${origins}],\"AllowedMethods\":[\"POST\"],\"AllowedHeaders\":[],\"ExposeHeaders\":[],\"MaxAgeSeconds\":3000}]}"
