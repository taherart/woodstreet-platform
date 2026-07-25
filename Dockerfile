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
COPY --from=base /app/data ./data

# Copy Magnific MCP OAuth tokens (must exist on host at build time or mounted)
# For production, mount: -v ~/.hermes/mcp-tokens:/root/.hermes/mcp-tokens

RUN mkdir -p /app/data /root/.hermes/mcp-tokens && chmod -R 777 /app/data

EXPOSE 3000
CMD ["node", "server.js"]
