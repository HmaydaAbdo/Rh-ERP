# Image erp-rh-copilot-runtime : runtime CopilotKit officiel entre Angular et le service IA (docs/ia.md, T16).
# Base épinglée par version et digest ; dépendances installées depuis le lockfile, sans scripts d'installation.
FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Les scripts d'installation sont refusés, sauf celui de better-sqlite3 (module natif du runner SQLite officiel).
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm rebuild better-sqlite3

FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94
WORKDIR /app
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --chown=root:root package.json ./
COPY --chown=root:root src ./src
# Aucune télémétrie vers CopilotKit ni vers ses dépendances.
ENV NODE_ENV=production PORT=4100 COPILOTKIT_TELEMETRY_DISABLED=true DO_NOT_TRACK=1 SCARF_ANALYTICS=false
# Historique des conversations du runner SQLite officiel : volume Compose, seul endroit inscriptible.
ENV THREADS_DB_PATH=/data/threads.db
# Le dossier doit exister dans l'image, propriété de `node` : Docker en recopie le propriétaire dans un volume nommé neuf
# (sinon il appartient à root, le runner SQLite ne peut pas créer sa base et le conteneur redémarre en boucle).
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# hook.mjs : chargeur ESM officiel d'OpenTelemetry (sans lui, `node:http` n'est pas instrumenté dans un serveur en modules ES).
ENTRYPOINT ["node", "--import", "./src/hook.mjs", "--import", "./src/traces.mjs", "src/serveur.mjs"]
