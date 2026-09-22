# Image de développement : sert l'application via le serveur de dev Angular (rechargement à chaud).
# docker-compose monte le code source en volume — ce Dockerfile ne fait qu'installer les
# dépendances une fois ; les modifications de fichiers sont reprises automatiquement par `ng serve`.
# Pas d'équivalent "production" pour l'instant (aucun besoin identifié — conventions/architecture.md).

FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 4200
CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--port", "4200", "--poll", "1000"]
