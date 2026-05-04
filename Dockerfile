# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# Stage 3: Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
