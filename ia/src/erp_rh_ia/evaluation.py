"""Évaluation de l'agent sur le jeu de référence (docs/ia.md, § 4) : ``python -m erp_rh_ia.evaluation``.

Pour chaque cas, la vérité est lue en appelant directement l'outil attendu avec l'identité de l'utilisateur ; l'agent
répond ensuite à la question, avec le modèle de la passerelle LiteLLM. Un cas réussit si l'agent
répond sans abstention et cite chaque valeur attendue (le rapport signale s'il a pris un autre outil que celui
attendu) — ou s'abstient (ou signale le refus) quand le cas l'exige.

Variables : ``EVAL_API_URL`` (racine de l'API ERP-RH), ``EVAL_JETON_COMPLET`` et ``EVAL_JETON_RESTREINT`` (jetons de
connexion REST, échangés contre un jeton agent à chaque question), ``EVAL_DONNEES`` (JSON des marqueurs),
``IA_LITELLM_BASE_URL`` et ``IA_LITELLM_API_KEY``. Le rapport JSON n'écrit ni jeton ni clé.
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
import unicodedata
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, cast

import httpx
from openai import AsyncOpenAI

from erp_rh_ia.agent import Agent, ReponseAgent
from erp_rh_ia.modele import ModeleLiteLLM
from erp_rh_ia.outils import jeton_agent, ouvrir_outils
from erp_rh_ia.verification import extraire_nombres

JEU = Path(__file__).resolve().parents[2] / "evaluation" / "jeu_reference.json"
_MARQUEUR = re.compile(r"\{(\w+)\}")


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


async def evaluer_cas(
    cas: dict[str, Any],
    agent: Agent,
    client: httpx.AsyncClient,
    api: str,
    jetons: dict[str, str],
    donnees: dict[str, Any],
) -> ResultatCas:
    type_cas = str(cas.get("type", "reponse"))
    question = str(remplir(cas["question"], donnees))
    jeton = await jeton_agent(client, api, jetons[str(cas.get("jeton", "complet"))])
    attendus: list[tuple[str, Any]] = []
    async with ouvrir_outils(f"{api}/mcp", jeton) as outils:
        if type_cas == "reponse":
            verite = await outils.appeler(str(cas["outil"]), cast(dict[str, Any], remplir(cas["arguments"], donnees)))
            if verite.est_erreur:
                return ResultatCas(cas["id"], type_cas, False, f"vérité indisponible : {verite.texte}", 0)
            attendus = [(a["type"], extraire(verite.donnees, a["chemin"])) for a in cas["attendus"]]
        debut = time.monotonic()
        reponse = await agent.repondre(question, outils)
        latence = time.monotonic() - debut
    succes, raison = juger(type_cas, cas.get("outil"), attendus, reponse)
    return ResultatCas(
        cas["id"], type_cas, succes, raison, round(latence, 2), reponse.outils, reponse.abstention, reponse.texte
    )


def juger(type_cas: str, outil: Any, attendus: list[tuple[str, Any]], reponse: ReponseAgent) -> tuple[bool, str]:
    if type_cas == "abstention":
        return (reponse.abstention, "abstention" if reponse.abstention else "a répondu au lieu de s'abstenir")
    if type_cas == "refus":
        signale = reponse.abstention or any(m in _sans_accents(reponse.texte) for m in ("droit", "refus", "autoris"))
        return (signale, "refus signalé" if signale else "refus non signalé")
    if any(valeur is None for _, valeur in attendus):
        # L'outil attendu n'a pas la valeur : défaut des données synthétiques, pas de l'agent.
        return False, "vérité absente des données synthétiques"
    if reponse.abstention:
        return False, f"abstention ({reponse.motif})"
    manquants = [str(valeur) for type_attendu, valeur in attendus if not cite(type_attendu, valeur, reponse.texte)]
    appeles = ", ".join(reponse.outils) or "aucun"
    if manquants:
        return False, f"valeur(s) absente(s) : {', '.join(manquants)} (outils : {appeles})"
    # Les valeurs citées sont celles de l'outil attendu : la réponse est juste, même trouvée par un autre chemin.
    return True, "conforme" if outil in reponse.outils else f"conforme, sans {outil} (outils : {appeles})"


def cause(panne: BaseException) -> str:
    """L'exception d'origine, sous les groupes d'exceptions des tâches asynchrones (anyio)."""
    origine: BaseException = panne
    sous: list[BaseException] = list(getattr(origine, "exceptions", ()))
    while sous:
        origine = sous[0]
        sous = list(getattr(origine, "exceptions", ()))
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
    client_llm = AsyncOpenAI(
        base_url=os.environ["IA_LITELLM_BASE_URL"], api_key=os.environ["IA_LITELLM_API_KEY"], timeout=180, max_retries=0
    )
    agent = Agent(ModeleLiteLLM(client_llm, os.environ.get("IA_LITELLM_MODEL", "ai-gateway")))
    jeu = json.loads(JEU.read_text(encoding="utf-8"))
    resultats: list[ResultatCas] = []
    async with httpx.AsyncClient(timeout=30) as client:
        for cas in [c for c in jeu["cas"] if not filtre or c["id"] in filtre]:
            try:
                resultat = await evaluer_cas(cas, agent, client, api, jetons, donnees)
            except Exception as panne:  # un cas en panne est un échec mesuré, pas un arrêt
                resultat = ResultatCas(cas["id"], str(cas.get("type", "reponse")), False, f"panne : {cause(panne)}", 0)
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
