# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
import json
import re
from typing import Any, cast

import pytest

from erp_rh_ia.evaluation import JEU, Reponse, cite, extraire, juger, remplir, synthese


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


MARQUEURS = {
    "periode_a", "periode_b", "chantier_a_id", "chantier_a_code", "equipe_a_id", "equipe_a_code", "employe_a_id",
    "employe_a_nom", "employe_a_cin", "chantier_b_id", "chantier_b_code", "equipe_b_id", "equipe_b_code",
    "employe_b_id", "employe_b_nom", "employe_b_cin",
}  # fmt: skip
TYPES = {"reponse", "ouvert", "abstention", "absence", "refus", "securite", "capacites", "simple"}


def test_le_jeu_de_reference_est_complet_et_coherent() -> None:
    texte = JEU.read_text(encoding="utf-8")
    jeu = json.loads(texte)
    ids = [cas["id"] for cas in jeu["cas"]]
    assert len(ids) == len(set(ids)) >= 55
    types = {cas.get("type", "reponse") for cas in jeu["cas"]}
    assert types == TYPES
    for cas in jeu["cas"]:
        type_cas = cas.get("type", "reponse")
        if type_cas in ("reponse", "ouvert"):
            lectures = cas.get("verites") or [cas]
            assert lectures and all(lec.get("outil") and lec.get("attendus") for lec in lectures), cas["id"]
        if "tours" in cas:
            assert type_cas == "reponse" and cas["tours"], cas["id"]
        if type_cas == "refus" and cas.get("jeton") == "restreint":
            assert cas.get("interdits"), cas["id"]
    # Tout marqueur utilisé est fourni par EvaluationAgentIaTest.
    assert set(re.findall(r"\{(\w+)\}", json.dumps(jeu["cas"]))) <= MARQUEURS
    # Multi-tours, multi-domaines, adverses : les familles qui rendent l'évaluation exigeante existent.
    assert sum("tours" in cas for cas in jeu["cas"]) >= 3
    assert (
        sum(
            len(cas.get("verites", [])) > 1 or len(cas.get("verites", [{}])[0].get("attendus", [])) > 1
            for cas in jeu["cas"]
        )
        >= 5
    )
    assert sum(cas.get("type") == "securite" for cas in jeu["cas"]) >= 4


def test_un_marqueur_seul_garde_le_type_de_la_donnee() -> None:
    donnees = {"chantier_id": 12, "code": "CH-1"}
    assert remplir({"ids": ["{chantier_id}"], "q": "Chantier {code} ?"}, donnees) == {
        "ids": [12],
        "q": "Chantier CH-1 ?",
    }


def test_extraire_suit_les_listes_et_les_objets() -> None:
    assert extraire({"a": [{"b": 3}]}, "a.0.b") == 3
    assert extraire({"a": []}, "a.0.b") is None


def test_une_valeur_est_citee_quel_que_soit_son_format() -> None:
    assert cite("nombre", 3000.0, "La masse est de 3 000,00 MAD.")
    assert not cite("nombre", 3000.0, "La masse est de 3 100 MAD.")
    assert cite("texte", "Électricien", "Il est electricien.")
    assert cite("texte", "F-c1c5dc45", "La fonction est F\u2011c1c5dc45.")
    assert cite("date", "2020-01-01", "Embauché le 1er janvier 2020.")
    assert cite("statut", "CLOTURE", "Le chantier est clôturé.")
    assert cite("statut", "EN_COURS", "Le chantier est EN_COURS.")
    assert cite("nombre", 0, "La paie ne constate aucune entrée.")
    assert cite("nombre", 2, "Deux mois de paie ont été importés.")
    assert not cite("nombre", 2, "La paie ne constate aucune entrée.")


def test_le_jugement_distingue_reponse_abstention_et_refus() -> None:
    reponse = Reponse("Masse : 3 000 MAD.", abstention=False, outils=["paie_indicateurs"], outil_attendu_appele=True)
    assert juger("reponse", "paie_indicateurs", [("nombre", 3000)], reponse) == (True, "conforme")
    # Le chemin est libre : une valeur juste trouvée avec un autre outil réussit.
    autre = Reponse("Masse : 3 000 MAD.", abstention=False, outils=["paie_repartition"], outil_attendu_appele=False)
    assert juger("reponse", ["paie_indicateurs"], [("nombre", 3000)], autre) == (True, "conforme")
    # Une valeur citée sans avoir consulté aucun outil n'est pas fondée sur les données.
    sans_outil = Reponse("Masse : 3 000 MAD.", abstention=False, outils=[], outil_attendu_appele=False)
    assert juger("reponse", ["paie_indicateurs"], [("nombre", 3000)], sans_outil) == (
        False,
        "réponse sans avoir consulté aucun outil",
    )
    alternatif = Reponse(
        "Masse : 3 000 MAD.",
        abstention=False,
        outils=["equipe_rechercher", "paie_repartition"],
        outil_attendu_appele=True,
    )
    assert juger("reponse", ["paie_indicateurs", "paie_repartition"], [("nombre", 3000)], alternatif) == (
        True,
        "conforme",
    )
    assert not juger("reponse", "paie_indicateurs", [("nombre", 3100)], reponse)[0]
    assert not juger("abstention", None, [], reponse)[0]
    # Valeur absente de l'outil attendu : le jeu de données est en cause, signalé comme tel.
    assert juger("reponse", ["paie_indicateurs"], [("nombre", None)], reponse) == (
        False,
        "vérité absente des données synthétiques",
    )
    refus = Reponse(
        "Vous n'avez pas le droit de voir la paie.",
        abstention=False,
        outils=["paie_indicateurs"],
        outil_attendu_appele=True,
    )
    assert juger("refus", None, [], refus)[0]


def test_une_limite_expliquee_est_reconnue_comme_abstention() -> None:
    from erp_rh_ia.evaluation import _ABSTENTION, _sans_accents  # pyright: ignore[reportPrivateUsage]

    reponses = (
        "Je ne peux donc pas vous donner cette valeur.",
        "L'ERP ne fournit pas de fonctionnalité de prévision.",
        "Les outils ne permettent pas d'accéder à cette donnée.",
        "L'ERP ne fournit pas de prévision; nous ne pouvons donc pas donner cette information.",
    )
    assert all(any(motif in _sans_accents(texte) for motif in _ABSTENTION) for texte in reponses)


def test_la_synthese_calcule_exactitude_et_latences() -> None:
    from erp_rh_ia.evaluation import ResultatCas

    bilan = synthese([ResultatCas("a", "reponse", True, "ok", 2.0), ResultatCas("b", "reponse", False, "ko", 4.0)])
    assert bilan["exactitude"] == 0.5
    assert bilan["latence_p50"] == 3.0
    assert bilan["latence_p95"] == 4.0
    assert bilan["par_type"] == {"reponse": "1/2"}


@pytest.mark.anyio
async def test_repondre_reutilise_la_fabrique_de_production(monkeypatch: Any) -> None:
    from langchain_core.messages import AIMessage

    from erp_rh_ia import evaluation
    from erp_rh_ia.config import Settings

    config = Settings(
        enabled=True,
        litellm_base_url="http://litellm:4000/v1",  # pyright: ignore[reportArgumentType]
        litellm_api_key="sk-test-cle",  # pyright: ignore[reportArgumentType]
        erp_api_url="http://backend:8080",  # pyright: ignore[reportArgumentType]
    )
    construit: list[tuple[object, object, object]] = []

    class AgentFactice:
        async def ainvoke(self, entree: object, options: object) -> dict[str, list[AIMessage]]:
            return {"messages": [AIMessage(content="Réponse de test.")]}

    def fabrique_factice(settings: Settings) -> Any:
        assert settings is config

        def construire(outils: object, checkpointer: object, utilisateur: object) -> AgentFactice:
            construit.append((settings, outils, checkpointer))
            return AgentFactice()

        return construire

    monkeypatch.setattr(evaluation, "fabrique_reelle", fabrique_factice)

    reponse = await evaluation.repondre(config, [], "Question de test", None)

    assert reponse.texte == "Réponse de test."
    assert construit == [(config, [], None)]


def test_la_trajectoire_attendue_est_controlee_par_agentevals() -> None:
    import asyncio

    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

    from erp_rh_ia.evaluation import _TRAJECTOIRE  # pyright: ignore[reportPrivateUsage]

    messages = [
        HumanMessage(content="Masse ?"),
        AIMessage(content="", tool_calls=[{"id": "a1", "name": "paie_indicateurs", "args": {"periode": "2026-09"}}]),
        ToolMessage(content="{}", tool_call_id="a1"),
        AIMessage(content="Masse : 3 000 MAD."),
    ]
    attendu = [AIMessage(content="", tool_calls=[{"id": "r", "name": "paie_indicateurs", "args": {}}])]
    autre = [AIMessage(content="", tool_calls=[{"id": "r", "name": "employes_compter", "args": {}}])]

    def score(reference: list[AIMessage]) -> bool:
        resultat = asyncio.run(_TRAJECTOIRE(outputs=messages, reference_outputs=reference))
        return bool(cast(dict[str, Any], resultat)["score"])

    assert score(attendu)
    assert not score(autre)
