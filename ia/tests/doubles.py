"""Doubles partagés des tests de l'agent et d'AG-UI : outils et modèle scriptés, sans réseau."""

from typing import Any

from erp_rh_ia.modele import AppelOutil, Brouillon, Choix
from erp_rh_ia.outils import OutilDecrit, ResultatOutil


class OutilsSimules:
    def __init__(self, reponses: dict[str, ResultatOutil]) -> None:
        self.reponses = reponses
        self.appels: list[str] = []

    async def lister(self) -> list[OutilDecrit]:
        return [OutilDecrit(nom, "outil de test", {"type": "object"}) for nom in self.reponses]

    async def appeler(self, nom: str, arguments: dict[str, Any]) -> ResultatOutil:
        self.appels.append(nom)
        return self.reponses[nom]


class ModeleScripte:
    """Rejoue des choix d'outils puis des brouillons, dans l'ordre ; enregistre ce qu'il a reçu."""

    def __init__(self, choix: list[Choix], brouillons: list[Brouillon], domaines: list[str] | None = None) -> None:
        self.choix = list(choix)
        self.brouillons = list(brouillons)
        self.domaines = domaines
        self.messages_redaction: list[list[dict[str, Any]]] = []
        self.outils_vus: list[list[str]] = []
        self.domaines_proposes: list[list[str]] = []

    async def cibler(self, messages: list[dict[str, Any]], domaines: list[str]) -> list[str] | None:
        self.domaines_proposes.append(domaines)
        return self.domaines

    async def choisir(self, messages: list[dict[str, Any]], outils: list[OutilDecrit]) -> Choix:
        self.outils_vus.append([o.nom for o in outils])
        return self.choix.pop(0) if self.choix else Choix([], "")

    async def rediger(self, messages: list[dict[str, Any]]) -> Brouillon:
        self.messages_redaction.append(messages)
        return self.brouillons.pop(0)


def appel(nom: str, identifiant: str = "a1", **arguments: Any) -> Choix:
    return Choix([AppelOutil(identifiant, nom, arguments)], "")


def ok(nom: str, donnees: dict[str, Any]) -> ResultatOutil:
    return ResultatOutil(nom, {}, False, "ok", donnees)
