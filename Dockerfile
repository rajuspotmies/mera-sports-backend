FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY drizzle.config.ts ./
COPY src/db/schema ./src/db/schema

# Create upload dirs (Railway volume takes precedence when mounted)
RUN mkdir -p /data/uploads/avatars /data/uploads/scripts /data/uploads/submissions /data/uploads/logos

EXPOSE 3000
CMD ["pnpm", "start"]
