# Image erp-rh-litellm : passerelle de modèles d'ERP-RH. Version ET digest épinglés : un tag repoussé
# ne peut pas changer ce qui tourne. Le routage de litellm_config.yaml a été vérifié pour cette version ;
# relancer test_providers.py (--providers, suite complète, --production-key) avant toute mise à jour.
FROM ghcr.io/berriai/litellm:v1.104.2@sha256:3d88bd757134a00e8c00237b85a021ab1f6d54abb9c1df750f411dbe7256a500

# Configuration intégrée à l'image (aucun secret : uniquement des références os.environ/…).
COPY --chmod=0444 litellm_config.yaml /app/config.yaml
COPY --chmod=0555 entrypoint.sh /usr/local/bin/erp-rh-litellm-entrypoint
COPY --chmod=0444 filtrer_config.py /usr/local/bin/erp-rh-filtrer-config

EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=8s --start-period=90s --retries=8 \
  CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4000/health/readiness', timeout=5)"]
ENTRYPOINT ["/usr/local/bin/erp-rh-litellm-entrypoint"]
# Un seul worker : l'état du routeur (cooldowns, limites) reste cohérent en mémoire, sans Redis.
CMD ["--config", "/tmp/config.yaml", "--port", "4000", "--num_workers", "1"]
