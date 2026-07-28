FROM node:24-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3

# --- Build ---
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx next build

# --- Runtime ---
FROM base AS runtime
WORKDIR /app

RUN addgroup -g 1001 -S bascaso && \
    adduser -S bascaso -u 1001 -G bascaso && \
    mkdir -p /app/data && chown bascaso:bascaso /app/data

COPY --from=build --chown=bascaso:bascaso /app/.next/standalone ./
COPY --from=build --chown=bascaso:bascaso /app/.next/static ./.next/static
COPY --from=build --chown=bascaso:bascaso /app/public ./public
COPY --from=build --chown=bascaso:bascaso /app/drizzle ./drizzle
COPY --chown=bascaso:bascaso docker-entrypoint.sh ./

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

VOLUME /app/data
EXPOSE 3000 3100

USER bascaso

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
