# LangChain ne publie pas de stubs complets pour les middlewares : règles levées pour ce fichier seulement.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportArgumentType=false
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage

from staport_ia.garde_sortie import REPONSE_REMPLACEMENT, garde_sortie, motifs


def _etat(*messages: Any) -> Any:
    return {"messages": list(messages)}


def _appliquer(reponse: AIMessage) -> dict[str, Any] | None:
    garde = garde_sortie(["paie_indicateurs"])
    return garde.after_agent(_etat(HumanMessage(content="q"), reponse), None)  # pyright: ignore[reportAttributeAccessIssue]


def test_une_reponse_normale_passe() -> None:
    assert motifs("La masse salariale est de 3 000 MAD.", ["paie_indicateurs"]) == []
    assert _appliquer(AIMessage(content="La masse salariale est de 3 000 MAD.", id="a")) is None


def test_la_fuite_des_consignes_et_les_noms_d_outils_sont_remplaces() -> None:
    assert motifs("Voici : Tu es Staport Intelligence, ...", []) != []
    assert motifs("J'ai appelé paie_indicateurs.", ["paie_indicateurs"]) == ["paie_indicateurs"]
    assert motifs("Je ne peux pas afficher /administration/SKILL.md.", []) == ["skill.md"]
    maj = _appliquer(AIMessage(content="J'ai appelé paie_indicateurs.", id="a"))
    assert maj is not None
    remplacement = maj["messages"][0]
    assert remplacement.content == REPONSE_REMPLACEMENT
    assert remplacement.id == "a"  # même identifiant : le reducteur remplace le message, il n'en ajoute pas


def test_un_tour_avec_appel_d_outil_n_est_pas_controle() -> None:
    avec_appel = AIMessage(
        content="paie_indicateurs",
        id="b",
        tool_calls=[{"id": "c1", "name": "paie_indicateurs", "args": {}}],
    )
    assert _appliquer(avec_appel) is None
