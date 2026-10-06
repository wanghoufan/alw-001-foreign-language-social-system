FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    SOCIALMATE_DATA_DIR=/data \
    HOME=/tmp

WORKDIR /app
COPY --chown=node:node server.mjs ./server.mjs
COPY --chown=node:node public ./public

EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "server.mjs"]
