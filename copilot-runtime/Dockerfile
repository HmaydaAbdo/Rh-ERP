# Image erp-rh-copilot-runtime : runtime CopilotKit officiel entre Angular et le service IA (docs/ia.md, T16).
# Base épinglée par version et digest ; dépendances installées depuis le lockfile, sans scripts d'installation.
FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
WORKDIR /app
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --chown=root:root package.json ./
COPY --chown=root:root src ./src
# Aucune télémétrie vers CopilotKit ni vers ses dépendances.
ENV NODE_ENV=production PORT=4100 COPILOTKIT_TELEMETRY_DISABLED=true DO_NOT_TRACK=1 SCARF_ANALYTICS=false
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["node", "src/serveur.mjs"]
