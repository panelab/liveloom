FROM oven/bun:1.4.5 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/relay/package.json apps/relay/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --filter @sp/web --ignore-scripts
COPY packages ./packages
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN NITRO_PRESET=bun bun run build

FROM oven/bun:1.4.5-slim
WORKDIR /app
COPY --from=build /app/apps/web/.output ./.output
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER bun
CMD ["bun", ".output/server/index.mjs"]
