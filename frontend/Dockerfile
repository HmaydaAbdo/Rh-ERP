# Multi-stage : build Angular (Node) puis service statique par Nginx (nginx inner — voir
# frontend/nginx.conf). Image de production uniquement — buildée par la CI et poussée sur Docker
# Hub (voir .github/workflows/ci.yml) ; docker-compose.yml ne fait que la consommer via `image:`,
# jamais `build:`. Pour le développement actif, lancer `ng serve` en local (voir README.md racine
# et conventions/deployment.md) — ce Dockerfile n'a pas de variante développement (pas de bind
# mount, pas de node_modules en volume, conformément à l'architecture de production demandée).

# Images de base épinglées par empreinte (reproductibilité, conventions/deployment.md) ; Dependabot propose la mise à jour
# de la balise et de l'empreinte ensemble.
FROM node:26.12-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx ng build --configuration production

# nginx « unprivileged » : le processus ne tourne jamais en root, il écoute donc sur 8080 (un port < 1024 exigerait root).
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:378d0c32f6562f7fd9629170797f57d2b953aa09be983b3daaf4809bb039ca00
COPY nginx.conf /etc/nginx/nginx.conf
COPY proxy_params.conf /etc/nginx/proxy_params.conf
# Modèles traités au démarrage par l'image nginx (envsubst) : la clé ArcGIS de l'imagerie satellite, ARCGIS_API_KEY,
# fournie par docker-compose.yml (obligatoire).
COPY nginx-templates/ /etc/nginx/templates/
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1
