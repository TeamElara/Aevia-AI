FROM node:24-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci
USER node
EXPOSE 8080
CMD ["npm", "start"]
