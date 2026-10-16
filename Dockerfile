FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY packages ./packages
RUN npm ci && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/agent-network.db
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages ./packages
RUN npm ci --omit=dev && mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
CMD ["node", "packages/server/dist/bin.js"]
