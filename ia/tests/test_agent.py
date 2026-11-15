# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Agent ``create_deep_agent`` et faux modèle de LangChain : forme de réponse, outils, plan, surface et consignes."""

from typing import Any

import httpx
from doubles import INDICATEURS, appel, modele, outil
from langchain_core.messages import AIMessage, HumanMessage

from staport_ia.agent import SYSTEME, _parametres_a2ui, creer_agent  # pyright: ignore[reportPrivateUsage]
from staport_ia.surfaces import OUTIL_A2UI


async def _repondre(
    agent_modele: object, question: str, appels: list[str] | None = None, surface: dict[str, Any] | None = None
) -> dict[str, Any]:
    outils = [outil("paie_indicateurs", INDICATEURS, appels)]
    if surface is not None:
        # L'outil d'interface composée, tel que CopilotKitMiddleware l'injecte : il rend une enveloppe A2UI.
        outils.append(outil(OUTIL_A2UI, surface))
    agent = creer_agent(agent_modele, outils)  # pyright: ignore[reportArgumentType]
    return await agent.ainvoke({"messages": [HumanMessage(content=question)], "pinned_skills": ["paie"]})


def _surface(masse: float) -> dict[str, Any]:
    """Une enveloppe A2UI v0.9 : une étiquette liée à la masse du modèle de données."""
    return {
        "a2ui_operations": [
            {"version": "v0.9", "createSurface": {"surfaceId": "s1", "catalogId": "basic"}},
            {
                "version": "v0.9",
                "updateComponents": {
                    "surfaceId": "s1",
                    "components": [{"id": "t1", "component": "Text", "text": {"path": "/masse"}}],
                },
            },
            {"version": "v0.9", "updateDataModel": {"surfaceId": "s1", "path": "/", "value": {"masse": masse}}},
        ]
    }


async def test_un_message_simple_recoit_une_reponse_directe_sans_outil() -> None:
    appels: list[str] = []
    faux = modele(AIMessage(content="Bonjour ! Je réponds à vos questions RH."))

    etat = await _repondre(faux, "Bonjour", appels)

    assert etat["messages"][-1].content == "Bonjour ! Je réponds à vos questions RH."  # pyright: ignore[reportIndexIssue,reportAttributeAccessIssue]
    assert appels == [] and len(faux.vus) == 1  # un seul appel de modèle


async def test_une_question_de_donnees_appelle_l_outil_puis_reprend_ses_valeurs() -> None:
    appels: list[str] = []
    faux = modele(
        appel("paie_indicateurs", periode="2026-09"), AIMessage(content="En 2026-09 : masse 1 250 000,50 MAD.")
    )

    etat = await _repondre(faux, "Masse salariale de 2026-09 ?", appels)

    assert appels == ["paie_indicateurs"]
    assert etat["messages"][-1].content == "En 2026-09 : masse 1 250 000,50 MAD."  # pyright: ignore[reportIndexIssue,reportAttributeAccessIssue]


async def test_le_plan_et_les_outils_metier_sont_proposes_au_modele() -> None:
    faux = modele(AIMessage(content="Bonjour."))

    await _repondre(faux, "Bonjour")

    assert {"write_todos", "paie_indicateurs"} <= set(faux.outils_lies[-1])


async def test_les_outils_exposes_au_modele_sont_exactement_ceux_du_harnais_retenu_et_de_la_competence() -> None:
    """KAN-31 (a) : liste mesurée des outils liés au modèle. Le harnais n'ajoute que le plan (``write_todos``) et la
    lecture des compétences (``read_file``) ; ni écriture, ni recherche, ni commande, ni sous-agent (``task``)."""
    faux = modele(AIMessage(content="Bonjour."))

    await _repondre(faux, "Bonjour")

    assert set(faux.outils_lies[-1]) == {"write_todos", "read_file", "paie_indicateurs"}
    interdits = {"write_file", "edit_file", "ls", "glob", "grep", "execute", "task"}
    assert interdits.isdisjoint(faux.outils_lies[-1])


async def test_la_surface_a2ui_composee_par_le_modele_ne_change_pas_la_reponse() -> None:
    faux = modele(appel("paie_indicateurs"), appel(OUTIL_A2UI), AIMessage(content="Voici la masse de 2026-09."))

    etat = await _repondre(faux, "Montre la masse", surface=_surface(1250000.5))

    assert etat["messages"][-1].content == "Voici la masse de 2026-09."  # pyright: ignore[reportIndexIssue,reportAttributeAccessIssue]


async def test_aucune_verification_apres_coup_la_reponse_du_modele_est_rendue_telle_quelle() -> None:
    """Décision du 2026-10-27 : plus de vérificateur ; une réponse n'est ni retirée, ni réécrite, ni remplacée."""
    faux = modele(appel("paie_indicateurs"), AIMessage(content="Masse : 1 250 000,50 MAD, soit 12,5 % de plus."))

    etat = await _repondre(faux, "Évolution de la masse ?")

    assert etat["messages"][-1].content == "Masse : 1 250 000,50 MAD, soit 12,5 % de plus."  # pyright: ignore[reportIndexIssue,reportAttributeAccessIssue]
    assert len(faux.vus) == 2  # l'outil puis une seule réponse, sans réécriture
    assert "verification" not in etat


def test_les_consignes_envoient_les_comparaisons_vers_l_outil_et_admettent_la_conversation() -> None:
    assert "Staport Intelligence" in SYSTEME
    assert "catalogue de capacités" in SYSTEME
    assert "Ne calcule rien" in SYSTEME
    assert "Une conversation se poursuit" in SYSTEME


async def test_une_coupure_transitoire_d_un_outil_est_rejouee_puis_la_reponse_arrive() -> None:
    essais: list[int] = []

    def indicateurs(**_: Any) -> dict[str, Any]:
        essais.append(1)
        if len(essais) < 3:
            raise httpx.ConnectError("réseau coupé")
        return INDICATEURS

    agent = creer_agent(
        modele(appel("paie_indicateurs", periode="2026-09"), AIMessage(content="Masse : 1 250 000,50 MAD.")),
        [outil("paie_indicateurs", indicateurs)],  # pyright: ignore[reportArgumentType]
    )
    resultat = await agent.ainvoke(
        {"messages": [HumanMessage(content="Masse de septembre ?")], "pinned_skills": ["paie"]}
    )

    assert len(essais) == 3  # un appel, puis deux reprises (ToolRetryMiddleware)
    assert resultat["messages"][-1].content == "Masse : 1 250 000,50 MAD."


async def test_un_refus_n_est_pas_rejoue_et_le_modele_voit_une_erreur_sans_le_message_brut() -> None:
    essais: list[int] = []

    def indicateurs(**_: Any) -> dict[str, Any]:
        essais.append(1)
        raise PermissionError("403 secret-interne")

    faux = modele(appel("paie_indicateurs", periode="2026-09"), AIMessage(content="Je n'ai pas pu consulter la paie."))
    agent = creer_agent(faux, [outil("paie_indicateurs", indicateurs)])  # pyright: ignore[reportArgumentType]
    resultat = await agent.ainvoke(
        {"messages": [HumanMessage(content="Masse de septembre ?")], "pinned_skills": ["paie"]}
    )

    assert len(essais) == 1  # pas de reprise : ce n'est pas une panne transitoire
    retour = next(m for m in resultat["messages"] if m.type == "tool")
    assert retour.status == "error"
    assert "PermissionError" in retour.content
    assert "secret-interne" not in retour.content
    assert resultat["messages"][-1].content == "Je n'ai pas pu consulter la paie."


async def test_le_budget_total_de_reprises_est_borne_sans_cascade() -> None:
    """KAN-33 : une seule politique de reprise. Le client du modèle ne rejoue pas (``max_retries=0``, testé dans
    test_service) et LiteLLM non plus (``num_retries: 0``, bascule seulement) ; il reste les 2 reprises de l'outil,
    sous la limite d'appels d'outils du run : au plus ``appels_outils`` x 3 exécutions, même si le modèle insiste."""
    essais: list[int] = []

    def indicateurs(**_: Any) -> dict[str, Any]:
        essais.append(1)
        raise httpx.ConnectError("réseau coupé")

    insistance = [appel("paie_indicateurs", f"a{i}", periode="2026-09") for i in range(10)]
    faux = modele(*insistance, AIMessage(content="Information indisponible."))
    agent = creer_agent(
        faux,
        [outil("paie_indicateurs", indicateurs)],  # pyright: ignore[reportArgumentType]
        appels_modele=20,
        appels_outils=3,
    )
    await agent.ainvoke({"messages": [HumanMessage(content="Masse de septembre ?")], "pinned_skills": ["paie"]})

    assert len(essais) == 3 * 3  # 3 appels d'outil autorisés, chacun avec ses 2 reprises, puis plus rien


def _statut(code: int) -> httpx.HTTPStatusError:
    requete = httpx.Request("GET", "http://erp/api/paie")
    return httpx.HTTPStatusError("secret-interne", request=requete, response=httpx.Response(code, request=requete))


#: Matrice des erreurs d'outil (site/docs/ia/registre-code-maison-et-middlewares.md) : erreur levée par l'outil,
#: nombre d'exécutions attendu (1 + reprises) et nom du type d'erreur que voit le modèle.
MATRICE_ERREURS: list[tuple[str, Exception, int, str]] = [
    ("erreur métier (400)", ValueError("secret-interne"), 1, "ValueError"),
    ("refus (403)", _statut(403), 1, "HTTPStatusError"),
    ("panne serveur (500)", _statut(500), 1, "HTTPStatusError"),
    ("délai dépassé", TimeoutError("secret-interne"), 3, "TimeoutError"),
    ("réseau coupé", httpx.ConnectError("secret-interne"), 3, "ConnectError"),
]


async def test_la_matrice_des_erreurs_d_outil_est_appliquee_et_le_run_continue() -> None:
    """KAN-32 : seule une coupure transitoire est rejouée (deux reprises) ; dans tous les cas le modèle voit le type de
    l'erreur sans son message, et le run se poursuit jusqu'à la réponse du modèle."""
    for cas, erreur, executions, type_vu in MATRICE_ERREURS:
        essais: list[int] = []

        def indicateurs(erreur: Exception = erreur, essais: list[int] = essais, **_: Any) -> dict[str, Any]:
            essais.append(1)
            raise erreur

        faux = modele(appel("paie_indicateurs", periode="2026-09"), AIMessage(content="Information indisponible."))
        agent = creer_agent(faux, [outil("paie_indicateurs", indicateurs)])  # pyright: ignore[reportArgumentType]
        resultat = await agent.ainvoke(
            {"messages": [HumanMessage(content="Masse de septembre ?")], "pinned_skills": ["paie"]}
        )

        retour = next(m for m in resultat["messages"] if m.type == "tool")
        assert len(essais) == executions, cas
        assert retour.status == "error", cas
        assert type_vu in retour.content, cas
        assert "secret-interne" not in retour.content, cas
        assert resultat["messages"][-1].content == "Information indisponible.", cas


def test_le_guide_du_sous_agent_donne_les_valeurs_admises_des_proprietes_imbriquees() -> None:
    """Le validateur officiel ne contrôle pas les valeurs : sans elles dans le guide, le sous-agent écrit `number`
    au lieu de `nombre` et le rendu refuse le graphique."""
    guide: str = _parametres_a2ui()["guidelines"]["composition_guide"]
    assert "format=texte|nombre|montant|periode" in guide


def test_le_guide_du_sous_agent_propose_la_frise_chronologique() -> None:
    guide: str = _parametres_a2ui()["guidelines"]["composition_guide"]
    assert "- Timeline" in guide
