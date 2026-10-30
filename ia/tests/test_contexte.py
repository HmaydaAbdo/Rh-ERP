# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Contexte métier : la date, le dernier mois de paie et les capacités autorisées arrivent à l'agent."""

from datetime import date
from typing import Any

import pytest
from doubles import modele, outil
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from erp_rh_ia.agent import creer_agent
from erp_rh_ia.contexte import ContexteErp


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


pytestmark = pytest.mark.anyio

PERIODES = {"nombreMois": 2, "periodes": [{"periode": "2026-09"}, {"periode": "2026-08"}]}


async def _systeme(autorites: list[str], periodes: dict[str, Any] | None = PERIODES) -> str:
    """Le message système vu par le modèle, avec un catalogue d'outils correspondant aux droits."""
    outils = [outil("systeme_identite", {"utilisateur": "rh", "autorites": autorites})]
    if "PAIE_READ" in autorites and periodes is not None:
        outils.append(outil("paie_periodes", periodes))
    faux = modele(AIMessage(content="Bonjour."))
    agent = creer_agent(faux, outils)  # pyright: ignore[reportArgumentType]
    await agent.ainvoke({"messages": [HumanMessage(content="Bonjour")]})
    systeme = next(m for m in faux.vus[0] if isinstance(m, SystemMessage))
    return systeme.text


async def test_le_contexte_donne_le_dernier_mois_et_le_catalogue_autorise() -> None:
    systeme = await _systeme(["PAIE_READ", "EMPLOYEE_READ", "IA_UTILISER"])

    assert "Dernier mois de paie importé : 2026-09" in systeme
    assert "Outil de test paie_periodes" in systeme
    assert "Outil de test systeme_identite" not in systeme
    assert "PAIE_READ" not in systeme
    assert "IA_UTILISER" not in systeme
    assert f"Date du jour : {date.today().isoformat()}" in systeme


async def test_sans_droit_de_paie_le_mois_n_est_pas_demande() -> None:
    systeme = await _systeme(["EMPLOYEE_READ"])

    assert "Dernier mois de paie" not in systeme
    assert "Outil de test paie_periodes" not in systeme


async def test_un_outil_absent_ou_en_panne_laisse_un_contexte_plus_court() -> None:
    systeme = await _systeme(["PAIE_READ"], periodes=None)

    assert "Dernier mois de paie" not in systeme


def test_la_date_du_jour_est_injectable() -> None:
    middleware = ContexteErp([], aujourdhui=lambda: date(2026, 10, 26))

    assert middleware._aujourdhui().isoformat() == "2026-10-26"  # pyright: ignore[reportPrivateUsage]
