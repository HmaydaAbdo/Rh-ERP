# Site de documentation : build Docusaurus (Node) puis service statique par nginx sans privilèges.
# Image de production uniquement — buildée et poussée par la CI ; docker-compose.yml ne fait que la consommer via `image:`.
# Mêmes images de base épinglées par empreinte que frontend/Dockerfile (conventions/deployment.md).
FROM node:26.13-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS build
WORKDIR /site

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# nginx « unprivileged » : jamais root, donc écoute sur 8080.
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/build /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1
