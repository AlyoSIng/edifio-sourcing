# syntax=docker/dockerfile:1.7
# ------------------------------------------------------------
# edifio Sourcing — Worker Playwright (Fly.io EU)
# Image officielle Playwright (navigateurs préinstallés) sur Ubuntu Jammy.
# Build context attendu : `infra/playwright/`.
# ------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

ENV NODE_ENV=production \
    PORT=8080 \
    PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH

WORKDIR /app

# Active corepack pour pnpm (aligne avec la convention machine dev AlyoS).
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Étape dépendances (cache friendly).
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod=false --frozen-lockfile=false

# Étape code source.
COPY tsconfig.json ./
COPY src ./src

# Fly.io enverra du trafic HTTP sur ce port.
EXPOSE 8080

# Healthcheck Fly utilise /healthz (déclaré dans fly.toml).
# tsx exécute le TS directement (pas de build step pour ce squelette).
CMD ["pnpm", "exec", "tsx", "src/worker.ts"]
