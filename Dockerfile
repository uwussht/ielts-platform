# The site: static app + server.js (proxies ai-tutor routes and /staff-api).
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server.js index.html ./
COPY assets ./assets
COPY css ./css
COPY js ./js
USER node
EXPOSE 5173
CMD ["node", "server.js"]
