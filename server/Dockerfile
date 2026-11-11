# The platform's API (see docker-compose.yaml in the repository root; built from the root
# so the image also holds the test bank it checks answers against).
FROM node:20-alpine
ENV NODE_ENV=production CONTENT_DIR=/app/content
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/src ./src
COPY content/index.json content/diagnostic.json ./content/
COPY content/tests ./content/tests
COPY content/keys ./content/keys
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
