"""Titres français des outils métier de l'utilisateur, pour l'affichage des consultations dans la discussion (KAN-87).

Le serveur MCP déclare un titre français par outil (source unique). Le navigateur ne parle pas au MCP : il lit ici la
liste des outils que l'utilisateur est autorisé à appeler (le catalogue MCP est filtré par ses droits), avec leur
titre et leur domaine. L'identité vient de l'échange de jeton, jamais d'un paramètre. Aucun outil n'est exécuté et
aucune description technique n'est rendue.
"""

from collections.abc import Callable

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from staport_ia.agui import AccesErp, _jeton  # pyright: ignore[reportPrivateUsage]

#: Domaine affiché d'un outil, d'après le préfixe de son nom (convention de nommage du serveur MCP).
DOMAINES_PAR_PREFIXE: tuple[tuple[str, str], ...] = (
    ("heures_supp", "Heures supplémentaires"),
    ("paie", "Paie"),
    ("employe", "Employés"),
    ("chantier", "Chantiers"),
    ("equipe", "Équipes"),
    ("fonction", "Fonctions"),
    ("audit", "Audit"),
    ("rapport", "Rapports"),
)
DOMAINE_PAR_DEFAUT = "Application"


class TitreOutil(BaseModel):
    name: str
    title: str
    domain: str


def domaine_de(nom: str) -> str:
    return next((domaine for prefixe, domaine in DOMAINES_PAR_PREFIXE if nom.startswith(prefixe)), DOMAINE_PAR_DEFAUT)


def routeur_titres(acces: Callable[[], AccesErp], actif: Callable[[], bool]) -> APIRouter:
    routeur = APIRouter()

    @routeur.get("/outils")
    async def lister(requete: Request) -> list[TitreOutil]:  # pyright: ignore[reportUnusedFunction]
        if not actif():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA désactivé.")
        autorisation = requete.headers.get("authorization", "")
        if not autorisation.lower().startswith("bearer ") or not autorisation[7:].strip():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
        jeton = await _jeton(acces(), autorisation[7:].strip())
        titres = await acces().titres(jeton)
        return [TitreOutil(name=nom, title=titre, domain=domaine_de(nom)) for nom, titre in sorted(titres)]

    return routeur
