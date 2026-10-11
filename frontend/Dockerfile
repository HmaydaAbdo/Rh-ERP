# Multi-stage : build Angular (Node) puis service statique par Nginx (nginx inner — voir
# frontend/nginx.conf). Image de production uniquement — buildée par la CI et poussée sur Docker
# Hub (voir .github/workflows/ci.yml) ; docker-compose.yml ne fait que la consommer via `image:`,
# jamais `build:`. Pour le développement actif, lancer `ng serve` en local (voir README.md racine
# et conventions/deployment.md) — ce Dockerfile n'a pas de variante développement (pas de bind
# mount, pas de node_modules en volume, conformément à l'architecture de production demandée).

# Images de base épinglées par empreinte (reproductibilité, conventions/deployment.md) ; Dependabot propose la mise à jour
# de la balise et de l'empreinte ensemble.
FROM node:26.10-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx ng build --configuration production

# nginx « unprivileged » : le processus ne tourne jamais en root, il écoute donc sur 8080 (un port < 1024 exigerait root).
FROM nginxinc/nginx-unprivileged:1.30-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
COPY nginx.conf /etc/nginx/nginx.conf
COPY proxy_params.conf /etc/nginx/proxy_params.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1
