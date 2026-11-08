"""Aides communes aux imports Excel de référentiels (parité `DescriptionFichier` et `DataFormatter`)."""

import hashlib
from typing import Any

NOM_LONGUEUR_MAX = 100


def decrire_fichier(nom: str | None, contenu: bytes) -> dict[str, Any]:
    """Ce que le journal d'audit retient d'un import : jamais le contenu, seulement son empreinte."""
    return {
        "fichierNom": nom if nom is None or len(nom) <= NOM_LONGUEUR_MAX else nom[:NOM_LONGUEUR_MAX],
        "fichierTaille": len(contenu),
        "fichierSha256": hashlib.sha256(contenu).hexdigest(),
    }


def texte_cellule(valeur: object) -> str:
    """Valeur d'une cellule telle qu'affichée : un nombre entier n'a pas de partie décimale."""
    if valeur is None:
        return ""
    if isinstance(valeur, float) and valeur.is_integer():
        return str(int(valeur))
    return str(valeur)
