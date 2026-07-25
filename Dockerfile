FROM node:22-alpine AS base
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache python3 make g++

ENV NODE_ENV=production
ENV HOME=/root

COPY --from=base /app/public ./public
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static

RUN mkdir -p /app/data /app/public/uploads /root/.hermes/mcp-tokens && chmod -R 777 /app/data

EXPOSE 3000
CMD ["node", "server.js"]
