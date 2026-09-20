# syntax=docker/dockerfile:1
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS prune
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    corepack pnpm install --frozen-lockfile --ignore-scripts --filter=opencord \
 && corepack pnpm exec turbo prune @opencord/api --docker

FROM node:${NODE_VERSION} AS build
RUN corepack enable
WORKDIR /repo
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store corepack pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN corepack pnpm exec turbo run build --filter=@opencord/api
# `--legacy` is required while injectWorkspacePackages is false; without it pnpm
# refuses with ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE. The alternative replaces
# the apps/api -> packages/shared symlink with a hard-linked copy and breaks the
# development loop, so this is the right wart to accept.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    corepack pnpm --filter=@opencord/api --prod --legacy deploy /prod

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /prod ./
USER node
CMD ["node", "dist/index.js"]
