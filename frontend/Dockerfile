# syntax=docker/dockerfile:1

FROM node:18 AS build
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
# SPA fallback nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist/ /usr/share/nginx/html/

# Permissions (évite 403)
RUN chmod -R a+rX /usr/share/nginx/html \
 && find /usr/share/nginx/html -type f -exec chmod 644 {} \; \
 && find /usr/share/nginx/html -type d -exec chmod 755 {} \;

EXPOSE 80
CMD ["nginx","-g","daemon off;"]
