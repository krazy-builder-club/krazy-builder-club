# One non-root backend image; Cloud Run selects the entrypoint per service:
#   bob-api     node dist/api/main.js      (default CMD)
#   bob-worker  node dist/worker/main.js
#   migrate job node dist/migrate.js
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/backend/package.json apps/backend/
COPY packages/contracts/package.json packages/contracts/
COPY packages/storage/package.json packages/storage/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/backend apps/backend
RUN pnpm build && pnpm --filter @bob/backend deploy --prod --legacy /out

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/api/main.js"]
