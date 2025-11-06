# Multi-stage Dockerfile for Formula OCR Web
# Build frontend and run backend in production

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine

WORKDIR /app

# Install production dependencies for backend
COPY server/package*.json ./
RUN npm ci --only=production

# Copy built backend
COPY --from=backend-builder /app/server/dist ./dist

# Copy built frontend (backend will serve it if needed, or use nginx)
COPY --from=frontend-builder /app/web/dist ./public

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server
CMD ["node", "dist/index.js"]

