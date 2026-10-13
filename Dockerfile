FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev
COPY . .
RUN node tools/build.js && node tools/prepare-dist.cjs

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
ENV PAYOUTS_ENABLED=false
ENV SCORE_VERIFIER_READY=false
ENV MAINNET_PAYMENTS_ENABLED=false
CMD ["node", "server/index.mjs"]
