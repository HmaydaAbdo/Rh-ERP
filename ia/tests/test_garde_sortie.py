# LangChain ne publie pas de stubs complets pour les middlewares : règles levées pour ce fichier seulement.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportArgumentType=false
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from staport_ia.garde_sortie import REPONSE_FILTRE_NON_REGLE, REPONSE_REMPLACEMENT, garde_sortie, motifs


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


def _tour(question: str, reponse: str, *outils: tuple[str, str]) -> dict[str, Any] | None:
    """Un tour complet : la question, les résultats d'outils (nom, statut) puis la réponse finale."""
    messages: list[Any] = [HumanMessage(content=question)]
    for i, (nom, statut) in enumerate(outils):
        messages.append(ToolMessage(content="ok", name=nom, tool_call_id=f"t{i}", status=statut))  # pyright: ignore[reportArgumentType]
    messages.append(AIMessage(content=reponse, id="fin"))
    garde = garde_sortie(["paie_indicateurs"])
    return garde.after_agent(_etat(*messages), None)  # pyright: ignore[reportAttributeAccessIssue]


def test_dire_que_la_page_est_filtree_sans_outil_de_page_est_remplace() -> None:
    """KAN-305 : « La paie est filtrée » alors qu'aucun outil de page n'a réglé quoi que ce soit."""
    maj = _tour(
        "Sur la page, filtre la paie sur la période octobre 2026 et le chantier NADOR.",
        "La paie est filtrée sur octobre 2026 et le chantier NADOR (C168).",
        ("paie_indicateurs", "success"),
    )
    assert maj is not None
    assert maj["messages"][0].content == REPONSE_FILTRE_NON_REGLE
    assert maj["messages"][0].id == "fin"


def test_dire_que_la_page_est_filtree_apres_l_echec_de_l_outil_de_page_est_remplace() -> None:
    maj = _tour(
        "Filtre la paie sur octobre 2026.",
        "J'ai filtré la page sur octobre 2026.",
        ("paie_regler_filtres", "error"),
    )
    assert maj is not None
    assert maj["messages"][0].content == REPONSE_FILTRE_NON_REGLE


def test_la_reponse_est_gardee_quand_l_outil_de_page_a_reussi() -> None:
    assert (
        _tour(
            "Filtre la paie sur octobre 2026.",
            "La paie est filtrée sur octobre 2026.",
            ("paie_regler_filtres", "success"),
        )
        is None
    )


def test_une_reponse_qui_decrit_des_donnees_filtrees_sans_demande_de_filtre_est_gardee() -> None:
    assert (
        _tour(
            "Quelle est la masse salariale de NADOR en octobre ?",
            "Les chiffres sont filtrés sur le chantier NADOR : 725 158 MAD.",
            ("paie_indicateurs", "success"),
        )
        is None
    )


def test_un_refus_honnete_n_est_pas_remplace() -> None:
    assert (
        _tour(
            "Filtre la paie sur octobre 2026.",
            "Je ne peux pas régler les filtres de la page depuis cet espace.",
        )
        is None
    )


def test_un_tour_avec_appel_d_outil_n_est_pas_controle() -> None:
    avec_appel = AIMessage(
        content="paie_indicateurs",
        id="b",
        tool_calls=[{"id": "c1", "name": "paie_indicateurs", "args": {}}],
    )
    assert _appliquer(avec_appel) is None
