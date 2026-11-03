# fastembed et numpy ne publient pas de stubs complets : seules ces règles sont levées, et seulement ici.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Routage hors modèle : quelles compétences épingler pour une question (docs/ia.md, T32).

Seule pièce maison de la sélection d'outils : un classement par similarité entre la question et la description de chaque
outil du catalogue de l'utilisateur, avec un modèle d'embeddings gratuit exécuté en local (fastembed, MiniLM
multilingue, Apache-2.0). Mesuré le 2026-11-03 sur les 31 outils : le vecteur seul égale l'hybride avec le plein texte
(0,944 en r@7) ; le lexical est donc écarté (``decisions.md``, Q25). Aucun appel de modèle de langage, aucune base.

Ce n'est jamais une limite de capacité : un domaine manqué reste atteignable, le modèle lit le ``SKILL.md`` du bon
domaine (``competences.py``), et la sécurité reste celle du serveur MCP.
"""

import asyncio
import threading
from collections.abc import Sequence

import numpy as np
from fastembed import TextEmbedding
from langchain_core.tools import BaseTool

from erp_rh_ia.competences import OUTILS_PERMANENTS, competence_de

MODELE_EMBEDDINGS = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
#: Outils les mieux classés dont on épingle le domaine ; c'est un seuil de classement, pas une limite d'accès.
MEILLEURS_OUTILS = 7


class Routeur:
    """Classe les outils d'un catalogue par similarité avec la question ; les embeddings sont mis en cache."""

    def __init__(self, nom_modele: str = MODELE_EMBEDDINGS) -> None:
        self._nom = nom_modele
        self._modele: TextEmbedding | None = None
        self._verrou = threading.Lock()
        self._cache: dict[str, np.ndarray] = {}

    def _vecteurs(self, textes: Sequence[str]) -> np.ndarray:
        with self._verrou:
            if self._modele is None:
                self._modele = TextEmbedding(self._nom)
            manquants = [t for t in dict.fromkeys(textes) if t not in self._cache]
            if manquants:
                for texte, vecteur in zip(manquants, self._modele.embed(manquants), strict=True):
                    self._cache[texte] = vecteur / np.linalg.norm(vecteur)
            return np.stack([self._cache[t] for t in textes])

    def classer(self, question: str, outils: Sequence[BaseTool]) -> list[str]:
        """Les noms d'outils du catalogue, du plus proche de la question au plus éloigné."""
        candidats = [o for o in outils if o.name not in OUTILS_PERMANENTS]
        if not candidats or not question.strip():
            return []
        documents = [f"{o.name.replace('_', ' ')} {o.description or ''}".strip() for o in candidats]
        scores = self._vecteurs(documents) @ self._vecteurs([question])[0]
        return [candidats[i].name for i in np.argsort(-scores)]

    def domaines(self, question: str, outils: Sequence[BaseTool]) -> list[str]:
        """Les compétences à épingler : les domaines des meilleurs outils, dans l'ordre de pertinence."""
        retenus: list[str] = []
        for nom in self.classer(question, outils)[:MEILLEURS_OUTILS]:
            domaine = competence_de(nom)
            if domaine and domaine not in retenus:
                retenus.append(domaine)
        return retenus

    async def adomaines(self, question: str, outils: Sequence[BaseTool]) -> list[str]:
        """Version asynchrone : le calcul d'embeddings ne bloque pas la boucle d'événements."""
        return await asyncio.to_thread(self.domaines, question, outils)
