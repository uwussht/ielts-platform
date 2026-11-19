# The platform's API (see docker-compose.yaml in the repository root; built from the root
# so the image also holds the test bank it checks answers against).
FROM node:20-alpine
ENV NODE_ENV=production CONTENT_DIR=/app/content CONTENT_LIVE=/app/content-live
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/src ./src
COPY content/index.json content/diagnostic.json content/programmes.json ./content/
COPY content/tests ./content/tests
COPY content/keys ./content/keys
# the admin export this copy was built from: the sync (src/sync.js) fetches only what changed since
COPY content/source/list.json ./content/source/list.json
# volumes: what the sync brings (shared with the site) and the media files
RUN mkdir -p /app/content-live /app/content/media && chown node:node /app/content-live /app/content/media
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
