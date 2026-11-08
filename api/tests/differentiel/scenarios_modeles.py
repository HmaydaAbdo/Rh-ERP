# pyright: basic
"""Modèles Excel téléchargeables : comparaison cellule par cellule."""

from .harnais import Etape

MODELES = {
    "paie": "/paie/import/modele",
    "employes": "/employees/import/modele",
    "equipes": "/equipes/import/modele",
    "fonctions": "/functions/import/modele",
    "heures-supp": "/heures-supp/import/modele",
}


def etapes() -> list[Etape]:
    return [Etape("modeles", f"modele-{nom}", "GET", chemin) for nom, chemin in MODELES.items()]
