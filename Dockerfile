# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools needed for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Runtime deps for better-sqlite3
RUN apk add --no-cache libstdc++

# Copy compiled node_modules and source
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Persistent volume for SQLite database
VOLUME ["/app/data"]

# Redirect DB path to mounted volume via env var (read by server/db.js)
ENV DB_PATH=/app/data/aeternitas.db
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Graceful shutdown support
STOPSIGNAL SIGTERM

CMD ["node", "server.js"]
