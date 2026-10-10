# Multi-stage : build Angular (Node) puis service statique par Nginx (nginx inner — voir
# frontend/nginx.conf). Image de production uniquement — buildée par la CI et poussée sur Docker
# Hub (voir .github/workflows/ci.yml) ; docker-compose.yml ne fait que la consommer via `image:`,
# jamais `build:`. Pour le développement actif, lancer `ng serve` en local (voir README.md racine
# et conventions/deployment.md) — ce Dockerfile n'a pas de variante développement (pas de bind
# mount, pas de node_modules en volume, conformément à l'architecture de production demandée).

FROM node:24.15-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx ng build --configuration production

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY proxy_params.conf /etc/nginx/proxy_params.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1
