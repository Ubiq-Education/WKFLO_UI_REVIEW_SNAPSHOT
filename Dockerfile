# Stage 1: Build
FROM node:alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . ./
RUN npm run build

# Stage 2: Serve
FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /app/dist/public /usr/share/nginx/html
COPY default.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
USER root
RUN apk upgrade --no-cache \
    && apk del --no-cache curl libcurl \
    && sed -i 's/\r$//' /docker-entrypoint.sh \
    && chmod +x /docker-entrypoint.sh \
    && chmod 777 /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
