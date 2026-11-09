# Stage 1: install dependencies
FROM node:22.23.4-alpine3.24 AS deps
WORKDIR /app
# Copy only the dependency files first, so Docker can cache this layer
COPY package.json package-lock.json ./
# The npm cache stays in this stage. Only node_modules goes to the final image.
# mkdir makes sure node_modules exists, even when there are no packages yet.
RUN npm ci --omit=dev && mkdir -p node_modules

# Stage 2: small runtime image
FROM node:22.23.4-alpine3.24
ENV NODE_ENV=production
WORKDIR /app
# Create a non-root user and group (ID 10001)
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json server.js ./
USER app
EXPOSE 3000
CMD ["node", "server.js"]
