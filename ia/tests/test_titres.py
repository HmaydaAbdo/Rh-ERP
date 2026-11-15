"""Titres des outils (KAN-87) : le navigateur lit le titre français et le domaine des outils de l'utilisateur."""

from collections.abc import Sequence
from typing import Any

from doubles import INDICATEURS, memoire_processus, modele, outil, store_avec_competences
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from test_agui import AccesSimule, _routage_paie, _settings  # pyright: ignore[reportPrivateUsage]

from staport_ia.agent import creer_agent
from staport_ia.app import creer_app
from staport_ia.titres import domaine_de


def _client(acces: AccesSimule, actif: bool = True) -> TestClient:
    def fabrique(outils: Sequence[BaseTool], checkpointer: BaseCheckpointSaver[Any] | None, utilisateur: str) -> Any:
        return creer_agent(  # pragma: no cover - jamais appelée par cette route
            modele(AIMessage(content="ok")),  # pyright: ignore[reportArgumentType]
            outils,
            checkpointer=checkpointer,
            utilisateur=utilisateur,
            store=store_avec_competences(),
        )

    return TestClient(
        creer_app(_settings(actif), fabrique=fabrique, acces=acces, routage=_routage_paie, memoire=memoire_processus)
    )


def test_les_titres_sont_ceux_des_outils_autorises_avec_leur_domaine() -> None:
    acces = AccesSimule([outil("paie_indicateurs", INDICATEURS), outil("employe_fiche", INDICATEURS)])
    with _client(acces) as client:
        reponse = client.get("/outils", headers={"Authorization": "Bearer c"})

    assert reponse.status_code == 200
    assert reponse.json() == [
        {"name": "employe_fiche", "title": "Titre de employe_fiche", "domain": "Employés"},
        {"name": "paie_indicateurs", "title": "Titre de paie_indicateurs", "domain": "Paie"},
    ]


def test_la_liste_exige_une_connexion_et_un_assistant_actif() -> None:
    with _client(AccesSimule([])) as client:
        assert client.get("/outils").status_code == 401
        assert client.get("/outils", headers={"Authorization": "Bearer "}).status_code == 401
    with _client(AccesSimule([]), actif=False) as client:
        assert client.get("/outils", headers={"Authorization": "Bearer c"}).status_code == 503


def test_le_domaine_vient_du_prefixe_du_nom() -> None:
    assert domaine_de("heures_supp_indicateurs") == "Heures supplémentaires"
    assert domaine_de("paie_export_preparer") == "Paie"
    assert domaine_de("roles_lister") == "Application"
