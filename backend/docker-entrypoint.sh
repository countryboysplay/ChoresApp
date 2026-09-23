#!/bin/sh
# Applies pending migrations, then starts the server.
#
# Safe to run on every container start: node-pg-migrate only runs what is not
# already recorded in the pgmigrations table, so a restart with nothing new is
# a no-op. This is the container's replacement for the manual
# `npm run db:migrate` step the Windows setup asks for by hand.
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Applying database migrations..."
  # Run from /app/backend (this image's WORKDIR): package.json lives here,
  # node_modules is hoisted to /app/node_modules by the npm workspaces
  # install, and npm's module resolution walks up to find it from here.
  npm run migrate
else
  echo "DATABASE_URL is not set - skipping migrations."
fi

exec "$@"
