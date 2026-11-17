# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Sous-agents par domaine à sortie structurée (KAN-261) : la variante mesurée au banc, désactivée par défaut."""

import json
from pathlib import Path
from typing import Any

from doubles import appel, modele, outil

from staport_ia.agent import ResultatDomaine, creer_agent, sous_agents_par_domaine
from staport_ia.bureautique import OUTILS_BUREAUTIQUE
from staport_ia.competences import charger
from staport_ia.config import Settings

CATALOGUE = Path(__file__).resolve().parents[1] / "evaluation" / "catalogue_mcp.json"


def _outils() -> list[Any]:
    return [outil(t["name"], {}) for t in json.loads(CATALOGUE.read_text(encoding="utf-8"))]


def test_chaque_domaine_a_son_sous_agent_avec_ses_seuls_outils_et_une_sortie_structuree() -> None:
    sous_agents: list[Any] = list(sous_agents_par_domaine(_outils()))

    # Les domaines de documents n'ont pas d'outil dans le catalogue de l'ERP : pas de sous-agent sans outils.
    assert {s["name"] for s in sous_agents} == {
        n for n, c in charger().items() if not set(c.outils) <= OUTILS_BUREAUTIQUE
    }
    for sous_agent in sous_agents:
        assert {o.name for o in sous_agent["tools"]} == set(charger()[sous_agent["name"]].outils)
        assert sous_agent["response_format"] is ResultatDomaine
        assert sous_agent["description"] == charger()[sous_agent["name"]].description


def test_aucun_outil_n_est_partage_entre_deux_sous_agents() -> None:
    sous_agents: list[Any] = list(sous_agents_par_domaine(_outils()))
    noms: list[str] = [o.name for s in sous_agents for o in s["tools"]]

    assert len(noms) == len(set(noms))


def test_un_domaine_sans_outil_pour_cet_utilisateur_n_a_pas_de_sous_agent() -> None:
    seul = [outil("paie_indicateurs", {})]

    assert [s["name"] for s in sous_agents_par_domaine(seul)] == ["paie"]


def test_la_variante_est_desactivee_par_defaut() -> None:
    assert Settings.model_fields["sous_agents"].default is False


def test_l_agent_se_construit_avec_les_sous_agents() -> None:
    agent = creer_agent(modele(appel("paie_indicateurs")), _outils(), sous_agents=True)  # pyright: ignore[reportArgumentType]

    assert agent is not None
