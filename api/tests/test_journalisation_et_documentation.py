"""Journaux JSON et archivage quotidien, documentation d'API éteinte par défaut (parité avec l'ancien backend)."""

import asyncio
import gzip
import json
import logging
import os
import tempfile
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from conftest import Plateforme, construire_configuration
from fastapi.testclient import TestClient

from staport.main import creer_app
from staport.platform.journalisation import JOURS_CONSERVES, NOM_FICHIER, configurer_journalisation
from staport.platform.requete import ContexteRequete, _contexte  # pyright: ignore[reportPrivateUsage]


@pytest.fixture
def dossier() -> Iterator[Path]:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as chemin:
        yield Path(chemin)


@pytest.fixture(autouse=True)
def racine_propre() -> Iterator[None]:
    yield
    configurer_journalisation("text")


def test_le_format_json_porte_le_niveau_le_message_et_le_request_id(dossier: Path) -> None:
    configurer_journalisation("json", str(dossier))
    jeton = _contexte.set(ContexteRequete(request_id="id-essai", adresse_ip=None, user_agent=None))
    try:
        logging.getLogger("staport.essai").warning("Bonjour")
    finally:
        _contexte.reset(jeton)
    logging.getLogger("staport.essai").info("Hors requête")
    for gestionnaire in logging.getLogger().handlers:
        gestionnaire.flush()
    lignes = [json.loads(ligne) for ligne in (dossier / NOM_FICHIER).read_text(encoding="utf-8").splitlines()]
    pris = {ligne["message"]: ligne for ligne in lignes}
    assert pris["Bonjour"]["level"] == "WARNING"
    assert pris["Bonjour"]["logger"] == "staport.essai"
    assert pris["Bonjour"]["requestId"] == "id-essai"
    assert pris["Hors requête"]["requestId"] is None


def test_la_reconfiguration_ne_duplique_pas_les_gestionnaires(dossier: Path) -> None:
    configurer_journalisation("json", str(dossier))
    configurer_journalisation("json", str(dossier))
    marques = [g for g in logging.getLogger().handlers if getattr(g, "_staport_journalisation", False)]
    assert len(marques) == 2  # console + fichier


def test_un_repertoire_inaccessible_n_empeche_pas_le_demarrage(dossier: Path) -> None:
    fichier = dossier / "pas-un-dossier"
    fichier.write_text("x", encoding="utf-8")
    configurer_journalisation("json", str(fichier / "logs"))  # ne lève pas


def test_la_rotation_archive_compresse_et_purge(dossier: Path) -> None:
    configurer_journalisation("json", str(dossier))
    ancienne = dossier / "archive" / "application.json.2000-01-01.gz"
    ancienne.write_bytes(gzip.compress(b"vieux"))
    vieux = time.time() - (JOURS_CONSERVES + 1) * 86_400
    os.utime(ancienne, (vieux, vieux))
    logging.getLogger("staport.essai").warning("Avant rotation")
    gestionnaire = next(
        g
        for g in logging.getLogger().handlers
        if hasattr(g, "doRollover") and getattr(g, "_staport_journalisation", False)
    )
    gestionnaire.doRollover()  # type: ignore[attr-defined]
    archives = sorted((dossier / "archive").glob("*.gz"))
    assert len(archives) == 1 and archives[0] != ancienne
    assert "Avant rotation" in gzip.decompress(archives[0].read_bytes()).decode("utf-8")


@pytest.mark.parametrize(
    ("remplacements", "docs", "openapi"),
    [
        ({}, 404, 404),
        ({"springdoc_api_docs_enabled": True}, 404, 200),
        ({"springdoc_api_docs_enabled": True, "springdoc_swagger_ui_enabled": True}, 200, 200),
    ],
)
def test_la_documentation_d_api_est_eteinte_par_defaut(
    plateforme: Plateforme, remplacements: dict[str, bool], docs: int, openapi: int
) -> None:
    configuration = construire_configuration(plateforme.url, plateforme.cle_b64, **remplacements)
    app = creer_app(configuration, planifier_synchronisation=False, amorcer_admin=False)
    with TestClient(app, backend_options={"loop_factory": asyncio.SelectorEventLoop}) as client:
        assert client.get("/docs").status_code == docs
        assert client.get("/openapi.json").status_code == openapi
