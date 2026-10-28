# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Évaluation de l'agent sur le jeu de référence (docs/ia.md, § 4 et T12) : ``python -m erp_rh_ia.evaluation``.

Pour chaque cas, la vérité est lue en appelant directement l'outil MCP attendu avec l'identité de l'utilisateur ;
le vrai agent (``create_agent`` sur la passerelle LiteLLM) répond ensuite à la question. Un cas réussit si l'agent
répond sans s'abstenir et cite chaque valeur attendue — ou s'abstient (ou signale le refus) quand le cas l'exige. La
trajectoire d'outils est comparée par ``agentevals`` (l'outil attendu doit figurer parmi les appels) et rapportée.

Variables : ``EVAL_API_URL`` (racine de l'API ERP-RH), ``EVAL_JETON_COMPLET`` et ``EVAL_JETON_RESTREINT`` (jetons de
connexion REST, échangés contre un jeton agent à chaque question), ``EVAL_DONNEES`` (JSON des marqueurs),
``IA_LITELLM_BASE_URL`` et ``IA_LITELLM_API_KEY``. Le rapport JSON n'écrit ni jeton ni clé. L'évaluation hors ligne,
sans réseau, est dans ``tests/test_passerelle_simulee.py`` (CopilotKit ``aimock``).
"""

import argparse
import asyncio
import io
import json
import math
import os
import re
import statistics
import sys
import time
import traceback
import unicodedata
from dataclasses import asdict, dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, cast

import httpx
from agentevals.trajectory.match import create_async_trajectory_match_evaluator
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.tools import BaseTool

from erp_rh_ia.app import fabrique_reelle
from erp_rh_ia.config import Settings
from erp_rh_ia.outils import jeton_agent, outils_erp

JEU = Path(__file__).resolve().parents[2] / "evaluation" / "jeu_reference.json"
_MARQUEUR = re.compile(r"\{(\w+)\}")
# Formulations d'une abstention écrite par le modèle.
_ABSTENTION = (
    "ne peux pas",
    "pas de donnee",
    "aucune donnee",
    "ne dispose",
    "pas d'information",
    "impossible",
    "pas disponible",
    "n'ai pas",
    "ne trouve pas",
    "fiable",
    "ne peux donc pas",
    "ne fournit pas de fonctionnalite",
    "ne permettent pas d'acceder",
    "ne fournit pas cette information",
    "ne fournit pas de prevision",
    "ne pouvons donc pas",
)
_TRAJECTOIRE = create_async_trajectory_match_evaluator(trajectory_match_mode="superset", tool_args_match_mode="ignore")


@dataclass
class ResultatCas:
    id: str
    type: str
    succes: bool
    raison: str
    latence_secondes: float
    outils: list[str] = field(default_factory=lambda: [])
    abstention: bool = False
    reponse: str = ""


@dataclass(frozen=True)
class Reponse:
    texte: str
    abstention: bool
    outils: list[str]
    outil_attendu_appele: bool


def remplir(valeur: Any, donnees: dict[str, Any]) -> Any:
    """Remplace les {marqueurs} ; un marqueur seul garde le type de la donnée (identifiant entier)."""
    if isinstance(valeur, str):
        seul = _MARQUEUR.fullmatch(valeur)
        if seul:
            return donnees[seul.group(1)]
        return _MARQUEUR.sub(lambda m: str(donnees[m.group(1)]), valeur)
    if isinstance(valeur, list):
        return [remplir(v, donnees) for v in cast(list[Any], valeur)]
    if isinstance(valeur, dict):
        return {k: remplir(v, donnees) for k, v in cast(dict[str, Any], valeur).items()}
    return valeur


def extraire(objet: Any, chemin: str) -> Any:
    """Valeur au chemin pointé ``a.0.b`` ; ``None`` si absente."""
    courant = objet
    for partie in chemin.split("."):
        if isinstance(courant, list) and partie.isdigit():
            liste = cast(list[Any], courant)
            courant = liste[int(partie)] if int(partie) < len(liste) else None
        elif isinstance(courant, dict):
            courant = cast(dict[str, Any], courant).get(partie)
        else:
            return None
    return courant


# Nombre « à la française » ou « à l'anglaise » : 3 000,50 · 3000.50 · 3000 · 12,5 (séparateurs de milliers : espaces).
_NOMBRE = re.compile(r"\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?")
_NOMBRES_EN_LETTRES = {
    "zero": Decimal(0),
    "deux": Decimal(2),
    "trois": Decimal(3),
    "quatre": Decimal(4),
    "cinq": Decimal(5),
    "six": Decimal(6),
    "sept": Decimal(7),
    "huit": Decimal(8),
    "neuf": Decimal(9),
    "dix": Decimal(10),
    "onze": Decimal(11),
    "douze": Decimal(12),
    "treize": Decimal(13),
    "quatorze": Decimal(14),
    "quinze": Decimal(15),
    "seize": Decimal(16),
    "vingt": Decimal(20),
}


def extraire_nombres(texte: str) -> list[Decimal]:
    """Les nombres d'un texte, normalisés (3 000,0 et 3000 sont la même valeur)."""
    nombres: list[Decimal] = []
    for brut in _NOMBRE.findall(texte):
        net = re.sub(r"[ \u00a0\u202f]", "", brut).replace(",", ".")
        try:
            valeur = Decimal(net)
        except InvalidOperation:
            continue
        nombres.append(valeur.normalize() if valeur != 0 else Decimal(0))
    normalise = _sans_accents(texte)
    nombres.extend(
        valeur for mot, valeur in _NOMBRES_EN_LETTRES.items() if re.search(rf"\b{mot}\b", normalise)
    )
    return nombres


def cite(type_attendu: str, attendu: Any, texte: str) -> bool:
    """La réponse cite-t-elle la valeur attendue ? Nombres normalisés, textes sans casse ni accents."""
    if attendu is None:
        return False
    if type_attendu == "nombre":
        valeur = Decimal(str(attendu)).normalize()
        if valeur == 0 and re.search(r"\baucun", _sans_accents(texte)):
            return True
        return valeur in {n.normalize() for n in extraire_nombres(texte)}
    if type_attendu == "date":
        annee, mois, jour = (int(x) for x in str(attendu).split("-"))
        nombres = set(extraire_nombres(texte))
        jour_et_annee = {Decimal(annee), Decimal(jour)} <= nombres
        mois_cite = Decimal(mois) in nombres or _MOIS[mois - 1] in _sans_accents(texte)
        return str(attendu) in texte or (jour_et_annee and mois_cite)
    if type_attendu == "statut":
        attendu_texte = "en cours" if attendu == "EN_COURS" else "clotur"
        return attendu_texte in _sans_accents(texte).replace("_", " ")
    return _sans_accents(str(attendu)) in _sans_accents(texte)


_MOIS = [
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre",
]


def _sans_accents(texte: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texte.lower()) if unicodedata.category(c) != "Mn")


async def verite(outils: list[BaseTool], nom: str, arguments: dict[str, Any]) -> dict[str, Any] | str:
    """Résultat structuré de l'outil attendu, ou le texte de son erreur."""
    outil = next(o for o in outils if o.name == nom)
    message = await outil.ainvoke({"type": "tool_call", "id": "verite", "name": nom, "args": arguments})
    if not isinstance(message, ToolMessage) or message.status == "error":
        return str(getattr(message, "content", message))
    artefact = cast(dict[str, Any], message.artifact or {})
    structure = artefact.get("structured_content")
    return cast(dict[str, Any], structure) if structure else cast(dict[str, Any], json.loads(message.text))


async def repondre(config: Settings, outils: list[BaseTool], question: str, outil_attendu: Any) -> Reponse:
    # Mesurer le même agent que le service : modèle principal, sélecteur de tools et résumeur officiels.
    agent = fabrique_reelle(config)(outils, None)
    etat = await agent.ainvoke({"messages": [HumanMessage(content=question)]}, {"recursion_limit": 200})
    messages: list[BaseMessage] = list(etat["messages"])
    texte = messages[-1].text if messages else ""
    appeles = [a["name"] for m in messages if isinstance(m, AIMessage) for a in m.tool_calls]
    abstention = any(m in _sans_accents(texte) for m in _ABSTENTION)
    attendu = False
    if outil_attendu:
        reference = [AIMessage(content="", tool_calls=[{"id": "attendu", "name": str(outil_attendu), "args": {}}])]
        evaluation = await _TRAJECTOIRE(outputs=messages, reference_outputs=reference)
        attendu = bool(cast(dict[str, Any], evaluation).get("score"))
    return Reponse(texte, abstention, appeles, attendu)


async def evaluer_cas(
    cas: dict[str, Any],
    config: Settings,
    client: httpx.AsyncClient,
    api: str,
    jetons: dict[str, str],
    donnees: dict[str, Any],
) -> ResultatCas:
    type_cas = str(cas.get("type", "reponse"))
    question = str(remplir(cas["question"], donnees))
    jeton = await jeton_agent(client, api, jetons[str(cas.get("jeton", "complet"))])
    outils = await outils_erp(f"{api}/mcp", jeton)
    attendus: list[tuple[str, Any]] = []
    if type_cas == "reponse":
        resultat = await verite(outils, str(cas["outil"]), cast(dict[str, Any], remplir(cas["arguments"], donnees)))
        if isinstance(resultat, str):
            return ResultatCas(cas["id"], type_cas, False, f"vérité indisponible : {resultat}", 0)
        attendus = [(a["type"], extraire(resultat, a["chemin"])) for a in cas["attendus"]]
    debut = time.monotonic()
    reponse = await repondre(config, outils, question, cas.get("outil"))
    latence = time.monotonic() - debut
    succes, raison = juger(type_cas, cas.get("outil"), attendus, reponse)
    return ResultatCas(
        cas["id"], type_cas, succes, raison, round(latence, 2), reponse.outils, reponse.abstention, reponse.texte
    )


def juger(type_cas: str, outil: Any, attendus: list[tuple[str, Any]], reponse: Reponse) -> tuple[bool, str]:
    if type_cas == "abstention":
        return (reponse.abstention, "abstention" if reponse.abstention else "a répondu au lieu de s'abstenir")
    if type_cas == "refus":
        signale = reponse.abstention or any(m in _sans_accents(reponse.texte) for m in ("droit", "refus", "autoris"))
        return (signale, "refus signalé" if signale else "refus non signalé")
    if any(valeur is None for _, valeur in attendus):
        # L'outil attendu n'a pas la valeur : défaut des données synthétiques, pas de l'agent.
        return False, "vérité absente des données synthétiques"
    manquants = [str(valeur) for type_attendu, valeur in attendus if not cite(type_attendu, valeur, reponse.texte)]
    appeles = ", ".join(reponse.outils) or "aucun"
    if manquants:
        motif = "abstention" if reponse.abstention else "valeur(s) absente(s)"
        return False, f"{motif} : {', '.join(manquants)} (outils : {appeles})"
    # Les valeurs citées sont celles de l'outil attendu : la réponse est juste, même trouvée par un autre chemin.
    return True, "conforme" if reponse.outil_attendu_appele else f"conforme, sans {outil} (outils : {appeles})"


def cause(panne: BaseException) -> str:
    """L'exception d'origine, sous les groupes d'exceptions des tâches asynchrones (anyio)."""
    origine: BaseException = panne
    sous: list[BaseException] = list(getattr(origine, "exceptions", ()))
    while sous:
        origine = sous[0]
        sous = list(getattr(origine, "exceptions", ()))
    # Trace sans variables locales ni contenu des requêtes : localise le composant en panne.
    traceback.print_tb(origine.__traceback__)
    return f"{type(origine).__name__}: {str(origine)[:300]}"


def synthese(resultats: list[ResultatCas]) -> dict[str, Any]:
    latences = [r.latence_secondes for r in resultats if r.latence_secondes > 0]
    reussis = sum(r.succes for r in resultats)
    return {
        "cas": len(resultats),
        "reussis": reussis,
        "exactitude": round(reussis / len(resultats), 3) if resultats else 0,
        "latence_p50": round(statistics.median(latences), 2) if latences else None,
        # Rang le plus proche : la valeur de rang ceil(0,95 * n) parmi les latences triées.
        "latence_p95": round(sorted(latences)[math.ceil(0.95 * len(latences)) - 1], 2) if latences else None,
        "par_type": {
            t: f"{sum(r.succes for r in resultats if r.type == t)}/{sum(r.type == t for r in resultats)}"
            for t in sorted({r.type for r in resultats})
        },
    }


async def principal(filtre: set[str] | None = None) -> dict[str, Any]:
    api = os.environ["EVAL_API_URL"].rstrip("/")
    jetons = {"complet": os.environ["EVAL_JETON_COMPLET"], "restreint": os.environ["EVAL_JETON_RESTREINT"]}
    donnees = cast(dict[str, Any], json.loads(os.environ["EVAL_DONNEES"]))
    config = Settings(
        enabled=True,
        litellm_base_url=os.environ["IA_LITELLM_BASE_URL"],  # pyright: ignore[reportArgumentType]
        litellm_api_key=os.environ["IA_LITELLM_API_KEY"],  # pyright: ignore[reportArgumentType]
        litellm_model=os.environ.get("IA_LITELLM_MODEL", "ai-gateway"),
        llm_timeout_seconds=180,
        erp_api_url=api,  # pyright: ignore[reportArgumentType]
    )
    jeu = json.loads(JEU.read_text(encoding="utf-8"))
    resultats: list[ResultatCas] = []
    async with httpx.AsyncClient(timeout=30) as client:
        for cas in [c for c in jeu["cas"] if not filtre or c["id"] in filtre]:
            debut_cas = time.monotonic()
            try:
                resultat = await evaluer_cas(cas, config, client, api, jetons, donnees)
            except Exception as panne:  # un cas en panne est un échec mesuré, pas un arrêt
                resultat = ResultatCas(cas["id"], str(cas.get("type", "reponse")), False,
                                      f"panne : {cause(panne)}", round(time.monotonic() - debut_cas, 2))
            resultats.append(resultat)
            print(
                f"[{'OK' if resultat.succes else 'KO'}] {resultat.id:28s} {resultat.latence_secondes:6.1f}s  "
                f"{resultat.raison}",
                flush=True,
            )
    return {"jeu": jeu["version"], "synthese": synthese(resultats), "resultats": [asdict(r) for r in resultats]}


def main() -> None:
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # pyright: ignore[reportUnknownMemberType]
    parser = argparse.ArgumentParser(description="Évalue l'agent ERP-RH sur le jeu de référence")
    parser.add_argument("--rapport", type=Path, default=Path("evaluation-ia.json"))
    parser.add_argument("--cas", help="identifiants de cas séparés par des virgules (défaut : tout le jeu)")
    arguments = parser.parse_args()
    rapport: Path = arguments.rapport
    bilan = asyncio.run(principal(set(arguments.cas.split(",")) if arguments.cas else None))
    rapport.parent.mkdir(parents=True, exist_ok=True)
    rapport.write_text(json.dumps(bilan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(bilan["synthese"], ensure_ascii=False))


if __name__ == "__main__":
    main()
