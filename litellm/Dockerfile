# Image staport-intelligence-litellm : passerelle de modèles de Staport Intelligence. Version ET digest épinglés : un tag repoussé
# ne peut pas changer ce qui tourne. Le routage de litellm_config.yaml a été vérifié pour cette version ;
# relancer test_providers.py (--providers, suite complète, --production-key) avant toute mise à jour.
FROM ghcr.io/berriai/litellm:v1.109.1@sha256:11175975a3093e05e92faee2fe2fe3412a3ae2fcaa849eb0fe25d5f0d8bcb2e9

# Configuration intégrée à l'image (aucun secret : uniquement des références os.environ/…).
COPY --chmod=0444 litellm_config.yaml /app/config.yaml
COPY --chmod=0555 entrypoint.sh /usr/local/bin/staport-intelligence-litellm-entrypoint
# Lancé par le service Compose litellm-cles : enregistre les clés virtuelles du .env (idempotent).
COPY --chmod=0444 enregistrer_cles.py /usr/local/bin/staport-intelligence-enregistrer-cles

EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=8s --start-period=5m --retries=8 \
  CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4000/health/readiness', timeout=5)"]
ENTRYPOINT ["/usr/local/bin/staport-intelligence-litellm-entrypoint"]
# Un seul worker : l'état du routeur (cooldowns, limites) reste cohérent en mémoire, sans Redis.
CMD ["--config", "/app/config.yaml", "--port", "4000", "--num_workers", "1"]
