# The site: static app + server.js (test content, /media; /app-api and /staff-api go to the API).
# content/media is not in the image: the media service downloads it into a volume.
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server.js index.html ./
COPY server/src/check.js ./server/src/check.js
COPY assets ./assets
COPY css ./css
COPY js ./js
COPY scripts ./scripts
COPY content/index.json content/media.txt content/programmes.json ./content/
COPY content/tests ./content/tests
COPY content/transcripts ./content/transcripts
COPY content/models ./content/models
COPY content/keys ./content/keys
RUN mkdir -p content/media && chown node:node content/media
USER node
EXPOSE 5173
CMD ["node", "server.js"]
