# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Surfaces déterministes des résultats d'outils (docs/ia.md, T16 : interface composée).

Un tableau de 50 lignes recopié par le modèle coûte des milliers de jetons, des dizaines de secondes et un risque
d'erreur de recopie. Ici, c'est le code qui présente : quand un outil MCP de l'ERP rend une liste d'au moins
``SEUIL_LIGNES`` objets, son résultat porte aussi des opérations A2UI (motif officiel de CopilotKit,
``copilotkit.a2ui.render``) : un ``DataTable`` des lignes, précédé d'un ``Chart`` pour une série mensuelle. Le runtime
CopilotKit détecte ces opérations dans le résultat d'outil et affiche la surface ; le modèle, lui, ne voit que le
résultat d'origine (middleware ``PresentationResultats``) et se contente de commenter.
"""

import json
import re
import uuid
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, cast

from copilotkit import a2ui
from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import AnyMessage, ToolMessage
from langchain_core.tools import BaseTool, StructuredTool

#: Identifiant du catalogue de l'ERP (catalogue de base A2UI + composants ERP), le même que côté Angular.
CATALOGUE_ERP = "erp-rh://a2ui/catalogue-erp"
SEUIL_LIGNES = 4

#: Titres des outils (champ ``title`` MCP, que l'adaptateur LangChain ne conserve pas).
TITRES: dict[str, str] = {
    "employes_rechercher": "Employés trouvés",
    "employes_regrouper": "Effectif par regroupement",
    "employes_sorties": "Départs du mois",
    "employe_parcours": "Parcours de l'employé",
    "paie_indicateurs": "Principaux chantiers",
    "paie_periodes": "Mois de paie importés",
    "paie_regrouper": "Masse salariale par regroupement",
    "paie_evolution": "Évolution de la paie",
    "paie_mouvements": "Mouvements d'effectif",
    "audit_rechercher": "Journal d'audit",
    "audit_historique": "Historique de l'enregistrement",
    "roles_lister": "Rôles",
    "parametres_lire": "Paramètres",
}

#: Libellés des clés connues ; les autres sont dérivées de la clé (``masseSalariale`` → « Masse salariale »).
LIBELLES: dict[str, str] = {
    "cin": "CIN",
    "nomPrenom": "Nom et prénom",
    "libelle": "Libellé",
    "enPoste": "En poste",
    "masse": "Masse salariale",
    "stc": "STC",
    "stcMontant": "Montant des STC",
    "periode": "Période",
    "entrees": "Entrées",
    "effectifMoisPrecedent": "Effectif du mois précédent",
    "plusPayes": "Plus payés",
    "dateEmbauche": "Date d'embauche",
}

_MONTANT = re.compile(r"masse|montant|salaire|net|brut|cout|coût", re.IGNORECASE)
_MASQUEES = {"id", "vue"}


def avec_surfaces(outils: Sequence[BaseTool]) -> list[BaseTool]:
    """Les mêmes outils ; ceux de l'adaptateur MCP (``StructuredTool`` à coroutine) présentent leurs listes."""
    return [_presentant(outil) if isinstance(outil, StructuredTool) and outil.coroutine else outil for outil in outils]


def _presentant(outil: StructuredTool) -> StructuredTool:
    appeler = cast(Callable[..., Awaitable[tuple[Any, Any]]], outil.coroutine)

    async def appeler_et_presenter(**arguments: Any) -> tuple[Any, Any]:
        contenu, artefact = await appeler(**arguments)
        donnees = (artefact or {}).get("structured_content") if isinstance(artefact, dict) else None
        operations = operations_pour(outil.name, donnees)
        if not operations:
            return contenu, artefact
        resultat = _texte(contenu)
        return json.dumps({a2ui.A2UI_OPERATIONS_KEY: operations, "resultat": resultat}, ensure_ascii=False), artefact

    return outil.model_copy(update={"coroutine": appeler_et_presenter})


def operations_pour(nom_outil: str, donnees: Any) -> list[dict[str, Any]] | None:
    """Les opérations A2UI d'un résultat d'outil, ou ``None`` s'il n'a pas de liste assez longue à présenter."""
    if not isinstance(donnees, dict):
        return None
    cle, lignes = _liste_principale(cast(dict[str, Any], donnees))
    if not lignes:
        return None
    lignes = [_aplatir(ligne) for ligne in lignes]
    colonnes = _colonnes(lignes)
    if not colonnes:
        return None
    surface = f"resultat-{nom_outil.replace('_', '-')}-{uuid.uuid4().hex[:8]}"
    periode = donnees.get("periode")
    tableau: dict[str, Any] = {
        "id": "tableau",
        "component": "DataTable",
        "title": TITRES.get(nom_outil, _libelle(cle)),
        "columns": colonnes,
        "rows": {"path": "/lignes"},
    }
    if isinstance(periode, str):
        tableau["caption"] = f"Période {periode}"
    composants: list[dict[str, Any]] = [tableau]
    graphique = _graphique(lignes, colonnes)
    if graphique is not None:
        composants = [{"id": "root", "component": "Column", "children": ["graphique", "tableau"]}, graphique, tableau]
    else:
        tableau["id"] = "root"
    return [
        a2ui.create_surface(surface, catalog_id=CATALOGUE_ERP),
        a2ui.update_components(surface, composants),
        a2ui.update_data_model(surface, {"lignes": lignes}),
    ]


class PresentationResultats(AgentMiddleware[Any, Any]):
    """Le modèle voit le résultat d'origine d'un outil, pas les opérations A2UI que le code a ajoutées pour l'écran."""

    async def awrap_model_call(
        self,
        request: ModelRequest[Any],
        handler: Callable[[ModelRequest[Any]], Awaitable[ModelResponse[Any]]],
    ) -> ModelResponse[Any]:
        messages = [_sans_surface(message) for message in request.messages]
        return await handler(request.override(messages=messages))


def resultat_sans_surface(contenu: Any) -> Any:
    """Le résultat d'origine d'un contenu d'outil présenté ; tout autre contenu est rendu tel quel."""
    if not isinstance(contenu, str) or not contenu.startswith('{"' + a2ui.A2UI_OPERATIONS_KEY):
        return contenu
    try:
        enveloppe = json.loads(contenu)
    except ValueError:
        return contenu
    return enveloppe.get("resultat", contenu) if isinstance(enveloppe, dict) else contenu


def _sans_surface(message: AnyMessage) -> AnyMessage:
    if not isinstance(message, ToolMessage):
        return message
    resultat = resultat_sans_surface(message.content)
    if resultat is message.content:
        return message
    return message.model_copy(update={"content": resultat})


def _liste_principale(donnees: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """La plus longue liste d'objets du résultat, si elle atteint le seuil."""
    meilleure: tuple[str, list[dict[str, Any]]] = ("", [])
    for cle, valeur in donnees.items():
        elements = cast(list[Any], valeur) if isinstance(valeur, list) else []
        if len(elements) >= max(SEUIL_LIGNES, len(meilleure[1]) + 1) and all(isinstance(v, dict) for v in elements):
            meilleure = (cle, cast(list[dict[str, Any]], elements))
    return meilleure


def _aplatir(ligne: dict[str, Any]) -> dict[str, Any]:
    """Une ligne à un niveau : un objet imbriqué (``chantier``) donne ses valeurs simples (``chantier.libelle``)."""
    plate: dict[str, Any] = {}
    for cle, valeur in ligne.items():
        if isinstance(valeur, dict):
            for sous_cle, sous_valeur in cast(dict[str, Any], valeur).items():
                if _simple(sous_valeur) and sous_cle not in _MASQUEES:
                    plate[f"{cle}.{sous_cle}"] = sous_valeur
        elif _simple(valeur):
            plate[cle] = valeur
    return plate


def _colonnes(lignes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cles: list[str] = []
    for ligne in lignes:
        cles.extend(cle for cle in ligne if cle not in cles and cle.split(".")[-1] not in _MASQUEES)
    colonnes: list[dict[str, Any]] = []
    for cle in cles:
        valeurs = [ligne.get(cle) for ligne in lignes if ligne.get(cle) is not None]
        if not valeurs:
            continue
        nombres = all(isinstance(v, int | float) and not isinstance(v, bool) for v in valeurs)
        if cle.split(".")[-1] == "periode":
            format_ = "periode"
        elif nombres and _MONTANT.search(cle):
            format_ = "montant"
        elif nombres:
            format_ = "nombre"
        else:
            format_ = "texte"
        colonne: dict[str, Any] = {"key": cle, "label": _libelle(cle), "format": format_}
        if nombres and len(lignes) >= SEUIL_LIGNES and all(cast(float, v) >= 0 for v in valeurs):
            colonne["bar"] = True
        colonnes.append(colonne)
    return colonnes


def _graphique(lignes: list[dict[str, Any]], colonnes: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Une série mensuelle (colonne ``periode`` et au moins trois mois) se lit d'abord en courbe."""
    if len(lignes) < 3 or not any(c["key"] == "periode" for c in colonnes):
        return None
    series: list[dict[str, Any]] = [
        {"name": c["label"], "values": [ligne.get(c["key"]) or 0 for ligne in lignes], "format": c["format"]}
        for c in colonnes
        if c["format"] in ("nombre", "montant")
    ]
    if not series:
        return None
    # Les outils rendent le mois le plus récent d'abord ; la courbe se lit de gauche à droite dans le temps.
    labels = [str(ligne.get("periode")) for ligne in lignes]
    if labels != sorted(labels):
        labels.reverse()
        for serie in series:
            cast(list[Any], serie["values"]).reverse()
    return {"id": "graphique", "component": "Chart", "type": "line", "labels": labels, "series": series}


def _libelle(cle: str) -> str:
    morceaux = [LIBELLES.get(partie) or _humain(partie) for partie in cle.split(".")]
    return " — ".join(morceaux)


def _humain(cle: str) -> str:
    mots = re.sub(r"(?<!^)(?=[A-Z])", " ", cle).lower()
    return mots[:1].upper() + mots[1:]


def _simple(valeur: Any) -> bool:
    return valeur is None or isinstance(valeur, str | int | float | bool)


def _texte(contenu: Any) -> str:
    if isinstance(contenu, str):
        return contenu
    if isinstance(contenu, list):
        blocs = cast(list[Any], contenu)
        return "".join(str(cast(dict[str, Any], b).get("text", "")) if isinstance(b, dict) else str(b) for b in blocs)
    return json.dumps(contenu, ensure_ascii=False)
