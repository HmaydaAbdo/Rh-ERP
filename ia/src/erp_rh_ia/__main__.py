"""Point d'entrée : `python -m erp_rh_ia`."""

import uvicorn

from erp_rh_ia.app import creer_app


def main() -> None:
    # Écoute sur toutes les interfaces du conteneur ; la publication vers l'hôte reste en loopback (Compose).
    uvicorn.run(creer_app(), host="0.0.0.0", port=8000, proxy_headers=False, access_log=False)  # noqa: S104


if __name__ == "__main__":
    main()
