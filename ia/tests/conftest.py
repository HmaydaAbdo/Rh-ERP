# testcontainers ne publie pas de stubs complets : seule cette règle est levée, pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Fixtures partagées : un PostgreSQL et un démon ClamAV jetables, démarrés par les tests eux-mêmes (Docker).

Aucun test n'est ignoré faute d'environnement : sans Docker les fixtures échouent avec la cause, jamais un faux succès.
``IA_TEST_DATABASE_URL`` et ``IA_TEST_CLAMD_HOTE`` (avec ``IA_TEST_CLAMD_PORT``) désignent un service déjà prêt et
dispensent de démarrer le conteneur. Le banc d'évaluation et les tests MCP complets ne sont collectés que lancés par les
lanceurs de ``api/tests`` (qui fournissent l'API, la base et la passerelle) : voir ``pytest_ignore_collect``.
"""

import asyncio
import os
import socket
import sys
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from testcontainers.community.postgres import PostgresContainer
from testcontainers.core.container import DockerContainer

IMAGE_POSTGRES = "pgvector/pgvector:0.8.7-pg18"
IMAGE_CLAMAV = "clamav/clamav:1.5.4"

# Fichiers qui exigent l'application complète : collectés seulement quand leur lanceur a fourni l'environnement.
SUR_LANCEUR = {
    "test_banc_evaluation.py": "EVAL_API_URL",
    "test_mcp_staport.py": "MCP_STAPORT_URL",
}


def pytest_ignore_collect(collection_path: Path, config: pytest.Config) -> bool | None:
    variable = SUR_LANCEUR.get(collection_path.name)
    if variable is not None and variable not in os.environ:
        return True
    return None


@pytest.fixture(scope="module")
def event_loop_policy() -> asyncio.AbstractEventLoopPolicy:
    # psycopg asynchrone refuse la boucle Proactor de Windows (le service tourne sous Linux, en conteneur).
    return asyncio.WindowsSelectorEventLoopPolicy() if sys.platform == "win32" else asyncio.DefaultEventLoopPolicy()


@pytest.fixture(scope="session")
def url_base() -> Iterator[str]:
    """Une base PostgreSQL jetable pour les tests de mémoire (checkpointer, Store, souvenirs)."""
    if url := os.environ.get("IA_TEST_DATABASE_URL"):
        yield url
        return
    with PostgresContainer(IMAGE_POSTGRES, username="essai", password="essai", dbname="ia_test", driver=None) as base:  # noqa: S106
        yield base.get_connection_url()


@pytest.fixture(scope="session")
def demon_clamd() -> Iterator[tuple[str, int]]:
    """Un vrai démon ClamAV, prêt (signatures chargées) quand la fixture rend la main."""
    if hote := os.environ.get("IA_TEST_CLAMD_HOTE"):
        yield hote, int(os.environ.get("IA_TEST_CLAMD_PORT", "3310"))
        return
    with DockerContainer(IMAGE_CLAMAV).with_exposed_ports(3310) as conteneur:
        hote = conteneur.get_container_host_ip()
        port = int(conteneur.get_exposed_port(3310))
        limite = time.monotonic() + 300
        while time.monotonic() < limite:
            try:
                with socket.create_connection((hote, port), timeout=3) as connexion:
                    connexion.sendall(b"zPING\0")
                    if connexion.recv(16).startswith(b"PONG"):
                        yield hote, port
                        return
            except OSError:
                pass
            time.sleep(3)
        pytest.fail("Le démon ClamAV n'est pas prêt après 300 s.")
