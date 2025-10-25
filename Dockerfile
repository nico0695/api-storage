# build stage
FROM node:22-alpine AS build
WORKDIR /app

# Install build dependencies for native modules (sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# production stage
FROM node:22-alpine
WORKDIR /app

# Install runtime dependencies for native modules (sqlite3)
RUN apk add --no-cache python3 make g++

COPY --from=build /app/package*.json ./
RUN npm install --production

# Copy built application
COPY --from=build /app/dist ./dist

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R node:node /app/data

# Switch to non-root user
USER node

EXPOSE 4000
CMD [ "npm", "start" ]
