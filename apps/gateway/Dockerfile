FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY apps/gateway/package.json ./apps/gateway/package.json
RUN npm ci
COPY tsconfig.json types.ts ./
COPY apps/gateway ./apps/gateway
USER node
EXPOSE 3001
CMD ["npm", "start"]
