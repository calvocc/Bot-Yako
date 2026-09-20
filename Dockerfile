# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# tsx (devDependency) es necesario para `pnpm db:migrate` al arrancar.
RUN pnpm install --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY src/db/migrate.ts ./src/db/migrate.ts
EXPOSE 3000
# Migra antes de arrancar: si falla, el contenedor no levanta.
CMD ["sh", "-c", "pnpm db:migrate && node dist/main"]
