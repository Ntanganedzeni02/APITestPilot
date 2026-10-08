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
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:9090/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
