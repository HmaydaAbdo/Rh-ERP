"""Point d'entrée : `python -m staport_ia`."""

import uvicorn

from staport_ia.app import creer_app


def main() -> None:
    # Écoute sur toutes les interfaces du conteneur ; la publication vers l'hôte reste en loopback (Compose).
    uvicorn.run(creer_app(), host="0.0.0.0", port=8000, proxy_headers=False, access_log=False)  # noqa: S104


if __name__ == "__main__":
    main()
