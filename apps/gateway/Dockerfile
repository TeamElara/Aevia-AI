FROM node:24-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci
RUN mkdir -p .cache && chown node:node .cache
USER node
EXPOSE 8080
CMD ["npm", "start"]
