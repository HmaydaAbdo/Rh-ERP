"""Mesure les lignes du gabarit PDF avec les polices embarquées.

Port de RapportMesureTexte.java : les largeurs servent au découpage physique
du rapport, avant le rendu WeasyPrint. Pillow mesure les mêmes fichiers TTF.
"""

import re
from collections.abc import Sequence
from functools import lru_cache
from pathlib import Path

from PIL import ImageFont

_DOSSIER_POLICES = Path(__file__).with_name("report") / "fonts"
_MARGE_LARGEUR = 1.03
_TAILLE_MESURE = 96
_ESPACES = re.compile(r"[ \t\n\r\f\v]+")


@lru_cache(maxsize=2)
def _police(gras: bool) -> ImageFont.FreeTypeFont:
    fichier = "LiberationSerif-Bold.ttf" if gras else "LiberationSerif-Regular.ttf"
    return ImageFont.truetype(_DOSSIER_POLICES / fichier, _TAILLE_MESURE)


def largeur(texte: str, taille_pt: float, gras: bool = False) -> float:
    """Largeur en points, majorée de 3 % comme le calcul Spring."""
    return _police(gras).getlength(texte) * taille_pt / _TAILLE_MESURE * _MARGE_LARGEUR


def decouper(texte: str | None, largeur_pt: float, taille_pt: float, gras: bool = False) -> list[str]:
    """Retour à la ligne aux espaces ordinaires ; un mot trop large est coupé par caractère."""
    if texte is None or not texte.strip():
        return [""]
    lignes: list[str] = []
    courante = ""
    largeur_courante = 0.0
    espace = largeur(" ", taille_pt, gras)
    for mot in _ESPACES.split(texte.strip()):
        largeur_mot = largeur(mot, taille_pt, gras)
        if largeur_mot > largeur_pt:
            if courante:
                lignes.append(courante)
                courante = ""
                largeur_courante = 0.0
            for caractere in mot:
                largeur_caractere = largeur(caractere, taille_pt, gras)
                if courante and largeur_courante + largeur_caractere > largeur_pt:
                    lignes.append(courante)
                    courante = ""
                    largeur_courante = 0.0
                courante += caractere
                largeur_courante += largeur_caractere
        elif not courante:
            courante = mot
            largeur_courante = largeur_mot
        elif largeur_courante + espace + largeur_mot <= largeur_pt:
            courante += " " + mot
            largeur_courante += espace + largeur_mot
        else:
            lignes.append(courante)
            courante = mot
            largeur_courante = largeur_mot
    lignes.append(courante)
    return lignes


def lignes(texte: str | None, largeur_pt: float, taille_pt: float, gras: bool = False) -> int:
    return len(decouper(texte, largeur_pt, taille_pt, gras))


def hauteur_ligne_employe(valeurs: Sequence[str], *, avec_equipe: bool) -> float:
    """Hauteur de la cellule la plus haute, suivant les colonnes du tableau Spring."""
    colonnes = (
        (120.0 if avec_equipe else 192.0, 10.5, 12.0, False),
        (100.0, 8.0, 9.5, False),
        (65.0, 10.5, 12.0, False),
        (35.0, 10.5, 12.0, False),
        (40.0, 10.5, 12.0, False),
        (40.0, 10.5, 12.0, False),
        (65.0, 10.5, 12.0, False),
        (55.0, 10.5, 12.0, False),
        (55.0, 10.5, 12.0, False),
        (65.0, 10.5, 12.0, True),
        (90.0, 10.5, 12.0, False),
    )
    if avec_equipe:
        colonnes += ((72.0, 9.0, 10.5, False),)
    if len(valeurs) != len(colonnes):
        raise ValueError("Le nombre de cellules ne correspond pas aux colonnes du rapport de paie")
    return max(
        16.0,
        *(
            lignes(valeur, largeur_colonne - 7, taille, gras) * interligne + 1
            for valeur, (largeur_colonne, taille, interligne, gras) in zip(valeurs, colonnes, strict=True)
        ),
    )


def decouper_lignes(hauteurs: Sequence[float], budget_initial: float, budget_suite: float) -> list[range]:
    """Répartit toutes les lignes dans les budgets physiques, sans en masquer une."""
    if not hauteurs:
        return []
    tranches: list[range] = []
    debut = 0
    while debut < len(hauteurs):
        budget = budget_initial if not tranches else budget_suite
        hauteur = 0.0
        fin = debut
        while fin < len(hauteurs) and hauteur + hauteurs[fin] <= budget:
            hauteur += hauteurs[fin]
            fin += 1
        if fin == debut:
            raise ValueError("Une ligne du rapport de paie dépasse la hauteur disponible d'une page")
        tranches.append(range(debut, fin))
        debut = fin
    return tranches
