# syntax=docker/dockerfile:1
ARG NODE_VERSION=24-alpine
# Never `nginx:alpine`. The `resolve` parameter this config depends on is
# open-source only since 1.27.3, and a floating tag can move the NGINX version
# underneath the config between one deploy and the next.
ARG NGINX_VERSION=1.31-alpine

FROM node:${NODE_VERSION} AS prune
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    corepack pnpm install --frozen-lockfile --ignore-scripts --filter=opencord \
 && corepack pnpm exec turbo prune @opencord/web --docker

FROM node:${NODE_VERSION} AS build
RUN corepack enable
WORKDIR /repo
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store corepack pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN corepack pnpm exec turbo run build typecheck --filter=@opencord/web

FROM nginx:${NGINX_VERSION} AS runtime
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY infra/nginx/conf.d/proxy_params /etc/nginx/conf.d/proxy_params
COPY infra/nginx/templates/ /etc/nginx/templates/

ENV STORAGE_PUBLIC_ORIGIN=http://localhost:9000
