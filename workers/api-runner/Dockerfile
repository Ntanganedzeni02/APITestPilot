FROM node:24.21.0-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@12.9.1
COPY . .
# Runner closure excludes the web-only Supabase patch; normal installation remains strict.
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @testpilot/api-runner... build \
 && pnpm --filter @testpilot/api-runner deploy --prod --legacy --config.allowUnusedPatches=true /runner
FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /runner
COPY --from=build --chown=node:node /runner/ ./
USER node
STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]
