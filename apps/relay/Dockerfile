FROM oven/bun:1.4.5 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/relay/package.json apps/relay/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production --filter @sp/relay --ignore-scripts

FROM oven/bun:1.4.5
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Bun's isolated linker puts symlinked node_modules in each workspace package,
# so take the whole installed tree, then add sources on top.
COPY --from=deps /app ./
COPY packages/db/src packages/db/src
COPY packages/db/migrations packages/db/migrations
COPY packages/shared/src packages/shared/src
COPY apps/relay/src apps/relay/src
WORKDIR /app/apps/relay
ENV NODE_ENV=production
USER bun
CMD ["bun", "src/index.ts"]
