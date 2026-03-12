FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
RUN python3 -m pip install --no-cache-dir pymupdf

COPY . .

RUN npm run build

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
