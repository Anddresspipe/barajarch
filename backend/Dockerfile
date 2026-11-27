FROM node:20-alpine AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 FRONTEND_DIR=/app/frontend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/db ./backend/db
COPY frontend ./frontend
USER node
EXPOSE 3000
CMD ["node", "backend/dist/app/main.js"]
