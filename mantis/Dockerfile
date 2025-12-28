FROM node:20-alpine AS base

# Deps
FROM base AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Build
FROM base AS builder

WORKDIR /app

COPY . .
COPY --from=deps /app/node_modules ./node_modules

ARG NEXT_PUBLIC_API_BASE_URL

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN npm run build

# Run
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Backend URL for proxying API requests (set at runtime)
ENV BACKEND_URL=http://backend:8000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
