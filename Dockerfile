# Build stage
FROM node:20-slim AS build
WORKDIR /app
ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/package*.json ./
RUN npm install --production
RUN npm install -g tsx
EXPOSE 3000
CMD ["npm", "start"]
