"""Interopérabilité du serveur MCP Python avec des clients externes (KAN-50, épopée E2).

L'application complète écoute sur un port loopback éphémère (uvicorn, base PostgreSQL réelle) et deux clients MCP
officiels l'appellent avec un jeton agent RS256 émis par `POST /auth/jetons/agent` :

- le client TypeScript du SDK MCP (le même SDK que le runtime Node CopilotKit), `scripts/ia/mcp-compatibility` ;
- le client Python officiel du service IA, `ia/tests/integration/test_mcp_staport.py`.

Les deux sont ignorés si Node, npm ou uv sont absents ; la CI doit les fournir.
"""

import asyncio
import os
import shutil
import socket
import subprocess
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
import uvicorn
from conftest import Plateforme, construire_contexte
from sqlalchemy import text

from staport.main import creer_app

RACINE = Path(__file__).resolve().parents[2]
CLIENT_NODE = RACINE / "scripts" / "ia" / "mcp-compatibility"
SERVICE_IA = RACINE / "ia"


@pytest.fixture(scope="module")
def serveur_loopback(plateforme: Plateforme) -> Iterator[str]:
    """Une seconde instance de l'application sur un vrai port, partageant la base et les clés de `plateforme`."""
    with socket.socket() as ephemere:
        ephemere.bind(("127.0.0.1", 0))
        port = ephemere.getsockname()[1]
    contexte = construire_contexte(plateforme.configuration, plateforme.journal)
    app = creer_app(plateforme.configuration, contexte=contexte, planifier_synchronisation=False)
    serveur = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="on"))
    fil = threading.Thread(
        target=lambda: asyncio.run(serveur.serve(), loop_factory=asyncio.SelectorEventLoop),
        daemon=True,
    )
    fil.start()
    limite = time.monotonic() + 30
    while not serveur.started and time.monotonic() < limite:
        time.sleep(0.1)
    assert serveur.started, "le serveur loopback n'a pas démarré"
    yield f"http://127.0.0.1:{port}"
    serveur.should_exit = True
    fil.join(timeout=15)


@pytest.fixture
def environnement_mcp(
    plateforme: Plateforme,
    serveur_loopback: str,
    creer_utilisateur: Callable[..., tuple[int, str]],
    connecter: Callable[[str, str], dict[str, Any]],
) -> dict[str, str]:
    identifiant, mdp = creer_utilisateur("interop-admin", roles=("SYSTEM_ADMIN",))
    with plateforme.moteur.connect() as c:
        nom = c.execute(text("SELECT username FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()
    acces = connecter(nom, mdp)["accessToken"]
    reponse = plateforme.client.post("/auth/jetons/agent", headers={"Authorization": f"Bearer {acces}"})
    assert reponse.status_code == 200, reponse.text
    return {
        **os.environ,
        "MCP_STAPORT_URL": f"{serveur_loopback}/mcp",
        "MCP_STAPORT_JETON": reponse.json()["jeton"],
        "MCP_STAPORT_UTILISATEUR": nom,
    }


def _lancer(commande: list[str], dossier: Path, env: dict[str, str]) -> None:
    # Commandes fixes (node, npm, uv) lancées avec des arguments littéraux : aucune entrée non fiable.
    resultat = subprocess.run(  # noqa: S603
        commande, cwd=dossier, env=env, capture_output=True, text=True, timeout=240, check=False
    )
    assert resultat.returncode == 0, f"{resultat.stdout}\n{resultat.stderr}"


@pytest.mark.skipif(shutil.which("node") is None or shutil.which("npm") is None, reason="Node/npm absents")
def test_le_client_typescript_du_sdk_mcp_appelle_le_serveur_python_avec_le_jeton_rs256(
    environnement_mcp: dict[str, str],
) -> None:
    if not (CLIENT_NODE / "node_modules").exists():
        _lancer(["npm", "ci", "--ignore-scripts"], CLIENT_NODE, environnement_mcp)
    _lancer(["node", "--test", "src/interop.test.ts"], CLIENT_NODE, environnement_mcp)


@pytest.mark.skipif(shutil.which("uv") is None, reason="uv absent")
def test_le_client_python_officiel_du_service_ia_appelle_le_serveur_python_avec_le_jeton_rs256(
    environnement_mcp: dict[str, str],
) -> None:
    _lancer(
        ["uv", "run", "--locked", "pytest", "tests/integration/test_mcp_staport.py", "-q", "-p", "no:cacheprovider"],
        SERVICE_IA,
        environnement_mcp,
    )
