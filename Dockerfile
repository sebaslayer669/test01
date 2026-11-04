FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY agent ./agent
COPY modulo ./modulo
COPY src ./src
COPY web ./web
COPY fixtures ./fixtures
COPY demo.ts ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]
