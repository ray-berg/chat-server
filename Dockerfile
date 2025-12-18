FROM node:18-alpine AS deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev

FROM node:18-alpine AS app
ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/ .
COPY client/ ../client
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "index.js"]

