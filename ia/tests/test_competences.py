# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Outils par compétence (Deep Agents 0.7.32, T32/T33) : exposition, garde d'exécution, repli et routage."""

import json
import tempfile
from pathlib import Path
from typing import Any

import pytest
from deepagents.backends import FilesystemBackend
from deepagents.middleware import FilesystemMiddleware
from doubles import INDICATEURS, appel, modele, outil
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import StructuredTool

from erp_rh_ia import agent as module_agent
from erp_rh_ia.agent import PERMISSIONS_FICHIERS, creer_agent
from erp_rh_ia.competences import OUTILS_MAX_PAR_COMPETENCE, OUTILS_PERMANENTS, charger, competence_de
from erp_rh_ia.routage import DOMAINES_MAX, Routeur

EVALUATION = Path(__file__).resolve().parents[1] / "evaluation"
#: Seuil décidé le 2026-11-03 (decisions.md, Q25) : part des demandes dont toutes les compétences nécessaires sont
#: épinglées hors modèle ; les autres restent atteignables par lecture du SKILL.md.
SEUIL_COUVERTURE = 0.95
#: Outils du harnais que le modèle doit garder : la lecture des SKILL.md et le plan.
OUTILS_HARNAIS = {"read_file", "write_todos"}
#: Outils du harnais Deep Agents qui ne doivent jamais être liés au modèle de l'ERP.
OUTILS_INTERDITS = {"write_file", "edit_file", "delete", "ls", "glob", "grep", "execute", "task"}


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _catalogue() -> list[dict[str, str]]:
    return json.loads((EVALUATION / "catalogue_mcp.json").read_text(encoding="utf-8"))


def test_chaque_outil_du_catalogue_a_une_et_une_seule_competence() -> None:
    noms = [t["name"] for t in _catalogue()]
    exposes = [o for c in charger().values() for o in c.outils]

    assert len(exposes) == len(set(exposes)), "un outil dans deux compétences"
    assert set(noms) - OUTILS_PERMANENTS == set(exposes)


def test_une_competence_expose_sept_outils_au_plus_et_porte_le_nom_de_son_dossier() -> None:
    for nom, competence in charger().items():
        assert 0 < len(competence.outils) <= OUTILS_MAX_PAR_COMPETENCE, nom
        assert competence.nom == nom
        assert competence.description.strip()


def test_le_domaine_d_un_outil_est_celui_de_sa_competence() -> None:
    assert competence_de("paie_indicateurs") == "paie"
    assert competence_de("chantier_fiche") == "referentiels"
    assert competence_de("systeme_identite") is None


def _agent(faux: Any, *noms: str, appels: list[str] | None = None) -> Any:
    outils = [outil(nom, INDICATEURS, appels) for nom in noms]
    return creer_agent(faux, outils)


@pytest.mark.anyio
async def test_un_outil_metier_non_epingle_echoue_sans_s_executer() -> None:
    appels: list[str] = []
    faux = modele(appel("paie_indicateurs", periode="2026-09"), AIMessage(content="Je ne peux pas."))

    etat = await _agent(faux, "paie_indicateurs", appels=appels).ainvoke(
        {"messages": [HumanMessage(content="Masse ?")]}
    )

    retour = next(m for m in etat["messages"] if isinstance(m, ToolMessage))
    assert appels == []
    assert "not a valid tool" in retour.text
    assert "paie_indicateurs" not in {n for lies in faux.outils_lies for n in lies}


@pytest.mark.anyio
async def test_une_competence_epinglee_expose_ses_outils_et_le_harnais_reste_minimal() -> None:
    faux = modele(AIMessage(content="Bonjour."))

    await _agent(faux, "paie_indicateurs", "audit_historique").ainvoke(
        {"messages": [HumanMessage(content="Masse ?")], "pinned_skills": ["paie"]}
    )

    lies = set(faux.outils_lies[0])
    assert "paie_indicateurs" in lies
    assert "audit_historique" not in lies  # autre domaine, non épinglé
    assert OUTILS_HARNAIS <= lies
    assert not lies & OUTILS_INTERDITS


@pytest.mark.anyio
async def test_deux_domaines_epingles_exposent_les_outils_des_deux() -> None:
    faux = modele(AIMessage(content="Bonjour."))

    await _agent(faux, "paie_indicateurs", "chantier_rechercher", "audit_historique").ainvoke(
        {"messages": [HumanMessage(content="Masse du chantier Atlas ?")], "pinned_skills": ["paie", "referentiels"]}
    )

    assert {"paie_indicateurs", "chantier_rechercher"} <= set(faux.outils_lies[0])
    assert "audit_historique" not in faux.outils_lies[0]


@pytest.mark.anyio
async def test_le_repli_par_lecture_du_skill_expose_le_domaine_manque() -> None:
    appels: list[str] = []
    faux = modele(
        appel("read_file", file_path="/paie/SKILL.md"),
        appel("paie_indicateurs", identifiant="b2", periode="2026-09"),
        AIMessage(content="Masse : 1 250 000,50 MAD."),
    )

    etat = await _agent(faux, "paie_indicateurs", appels=appels).ainvoke(
        {"messages": [HumanMessage(content="Masse ?")]}
    )

    assert appels == ["paie_indicateurs"]
    assert "paie_indicateurs" not in faux.outils_lies[0]
    assert "paie_indicateurs" in faux.outils_lies[1]
    assert etat["messages"][-1].content == "Masse : 1 250 000,50 MAD."


@pytest.mark.anyio
async def test_un_domaine_epingle_sans_outil_autorise_n_expose_rien() -> None:
    """Le catalogue MCP est déjà limité aux droits de l'utilisateur : épingler un domaine interdit n'ajoute rien."""
    appels: list[str] = []
    faux = modele(appel("audit_rechercher", q="x"), AIMessage(content="Accès refusé."))

    etat = await _agent(faux, "paie_indicateurs", appels=appels).ainvoke(
        {"messages": [HumanMessage(content="Qui a modifié ?")], "pinned_skills": ["administration"]}
    )

    assert appels == []
    assert "audit_rechercher" not in faux.outils_lies[0]
    assert any("not a valid tool" in m.text for m in etat["messages"] if isinstance(m, ToolMessage))


@pytest.mark.anyio
async def test_l_outil_d_interface_et_l_identite_restent_exposes_a_chaque_tour() -> None:
    faux = modele(AIMessage(content="Bonjour."))

    await creer_agent(
        faux,
        [outil("systeme_identite", {"autorites": []}), outil("generate_a2ui", {"a2ui_operations": []})],
    ).ainvoke({"messages": [HumanMessage(content="Bonjour")]})

    assert {"systeme_identite", "generate_a2ui"} <= set(faux.outils_lies[0])


def _vide(**_: Any) -> str:
    return ""


def _outils_du_catalogue() -> list[StructuredTool]:
    return [
        StructuredTool(
            name=t["name"],
            description=t["description"],
            args_schema={"type": "object", "properties": {}},
            func=_vide,
        )
        for t in _catalogue()
    ]


def test_le_routage_couvre_les_demandes_du_jeu_d_evaluation() -> None:
    """Modèle d'embeddings réel (MiniLM, téléchargé une fois puis lu du cache) : aucun appel de modèle de langage."""
    cas: list[dict[str, Any]] = json.loads((EVALUATION / "routage.json").read_text(encoding="utf-8"))["cas"]
    outils = _outils_du_catalogue()
    routeur = Routeur()

    manques = [
        (c["question"], c["domaines"], epinglees)
        for c in cas
        if not set(c["domaines"]) <= set(epinglees := routeur.domaines(c["question"], outils))
    ]

    assert 1 - len(manques) / len(cas) >= SEUIL_COUVERTURE, manques
    # Les demandes à un seul domaine sont toutes couvertes ; seules des dépendances implicites (un nom de chantier
    # à résoudre) peuvent être rattrapées par la lecture du SKILL.md.
    assert all(c["type"] == "multi-domaine" for c in cas if any(q == c["question"] for q, _, _ in manques))


def test_le_routage_n_epingle_pas_plus_de_trois_domaines_et_ignore_une_question_vide() -> None:
    outils = _outils_du_catalogue()
    routeur = Routeur()

    assert (
        len(routeur.domaines("masse salariale par chantier et heures supplémentaires des employés", outils))
        <= DOMAINES_MAX
    )
    assert routeur.domaines("   ", outils) == []
    assert routeur.domaines("Bonjour", []) == []


def test_aucun_outil_metier_n_est_passe_directement_a_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un outil de ``tools=`` reste exécutable même s'il n'est pas exposé : seuls les outils permanents y passent."""
    captures: list[dict[str, Any]] = []
    reel: Any = vars(module_agent)["create_deep_agent"]

    def espion(**kwargs: Any) -> Any:
        captures.append(kwargs)
        return reel(**kwargs)

    monkeypatch.setattr(module_agent, "create_deep_agent", espion)
    outils = [*_outils_du_catalogue(), outil("generate_a2ui", {"a2ui_operations": []})]

    creer_agent(modele(AIMessage(content="Bonjour.")), outils)

    lies = {o.name for o in captures[0]["tools"]}
    assert lies <= OUTILS_PERMANENTS
    assert lies == {"systeme_identite", "generate_a2ui"}
    assert captures[0]["permissions"] == PERMISSIONS_FICHIERS


@pytest.mark.anyio
async def test_l_ecriture_est_refusee_meme_si_un_outil_d_ecriture_etait_lie() -> None:
    """Avec ``write_file`` lié par erreur, les permissions refusent et le fichier reste intact."""
    with tempfile.TemporaryDirectory() as dossier:
        racine = Path(dossier)
        (racine / "paie").mkdir()
        cible = racine / "paie" / "SKILL.md"
        cible.write_text("original", encoding="utf-8")
        backend = FilesystemBackend(root_dir=racine, virtual_mode=True)
        faux = modele(
            appel("write_file", file_path="/paie/SKILL.md", content="piraté"),
            appel("write_file", identifiant="b2", file_path="/nouveau.md", content="piraté"),
            AIMessage(content="Refusé."),
        )
        creer: Any = vars(module_agent)["create_deep_agent"]
        agent: Any = creer(
            model=faux,
            backend=backend,
            permissions=PERMISSIONS_FICHIERS,
            middleware=[
                FilesystemMiddleware(
                    backend=backend, tools=["read_file", "write_file"], permissions=PERMISSIONS_FICHIERS
                )
            ],
        )

        etat: dict[str, Any] = await agent.ainvoke({"messages": [HumanMessage(content="Écris.")]})

        retours = [m.text.lower() for m in etat["messages"] if isinstance(m, ToolMessage)]
        assert len(retours) == 2
        assert all("permission" in r or "denied" in r for r in retours), retours
        assert cible.read_text(encoding="utf-8") == "original"
        assert not (racine / "nouveau.md").exists()
