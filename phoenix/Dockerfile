# Image erp-rh-phoenix : traces OpenTelemetry et observabilité de l'IA (docs/ia.md, T18). Arize Phoenix officiel,
# épinglé par version et digest ; un seul conteneur (base SQLite dans le volume), choisi pour la mémoire disponible.
FROM arizephoenix/phoenix:version-20.26.1@sha256:623813cbf1bbd4811456bb4936f21666ae50a1fbf862cf59ea0e3ca824b6b114
# Aucune télémétrie vers Arize ; données dans le volume monté sur /data ; conservation 30 jours (loi 09-08 : minimisation).
ENV PHOENIX_TELEMETRY_ENABLED=false \
    PHOENIX_WORKING_DIR=/data \
    PHOENIX_DEFAULT_RETENTION_POLICY_DAYS=30 \
    PHOENIX_ENABLE_AUTH=true \
    PHOENIX_DISABLE_AGENT_ASSISTANT=true
