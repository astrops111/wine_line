FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the Vite application
RUN npm run build

# Use Nginx to serve the static files
FROM nginx:alpine

# Copy the build output to the Nginx html folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Replace the default Nginx configuration with our custom config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port (Cloud Run expects apps to listen on 8080 by default, but Nginx default is 80.
# We will configure nginx.conf to listen on 8080)
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
