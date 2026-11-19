# The site: static app + server.js (test content, /media; /app-api and /staff-api go to the API).
# content/media is not in the image: the media service downloads it into a volume.
FROM node:20-alpine
ENV NODE_ENV=production CONTENT_LIVE=/app/content-live
WORKDIR /app
COPY server.js index.html ./
COPY server/src/check.js server/src/live.js ./server/src/
COPY assets ./assets
COPY css ./css
COPY js ./js
COPY scripts ./scripts
COPY content/index.json content/media.txt content/programmes.json ./content/
COPY content/tests ./content/tests
COPY content/transcripts ./content/transcripts
COPY content/models ./content/models
COPY content/keys ./content/keys
RUN mkdir -p content/media /app/content-live && chown node:node content/media /app/content-live
USER node
EXPOSE 5173
CMD ["node", "server.js"]
