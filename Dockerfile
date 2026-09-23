# Builds the backend (Fastify API) and the frontend (static PWA it serves from
# the same origin), then ships both in a slim runtime image.
#
# This mirrors what `npm run serve` does on the Windows laptop, minus the
# Windows-only pieces (Scheduled Task startup, the acme-client TLS routes, the
# tailnet-published admin dashboard) - a container's restart policy and a
# reverse proxy in front of it cover those instead.

# ---- deps: every workspace's dependencies, dev included -------------------
# node-pg-migrate lives in backend's devDependencies but is run at container
# start (see docker-entrypoint.sh), so dev deps are kept all the way through
# rather than pruned - this app is small enough that image size isn't worth
# the extra stage.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN npm ci

# ---- build: compile shared + backend, build the frontend bundle -----------
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
# postgresql-client provides pg_dump/pg_restore, which backend/src/backup
# shells out to for nightly backups and restores.
# tzdata lets HOUSEHOLD_TZ resolve to a real IANA zone inside Alpine.
RUN apk add --no-cache postgresql-client tzdata
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/package.json ./backend/package.json
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/migrations ./backend/migrations
COPY backend/.node-pg-migraterc.json ./backend/.node-pg-migraterc.json
COPY backend/docker-entrypoint.sh ./backend/docker-entrypoint.sh
# The compiled dist/server.js is what actually runs, but the household's CLI
# tools (npm run user/vapid/restore/reset-activity/cert) execute their
# TypeScript source directly via tsx, exactly like they do on the Windows
# laptop - so the source has to be in the image too, not just the build.
COPY backend/src ./backend/src
COPY --from=build /app/frontend/dist ./frontend/dist

RUN chmod +x ./backend/docker-entrypoint.sh

WORKDIR /app/backend
EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
