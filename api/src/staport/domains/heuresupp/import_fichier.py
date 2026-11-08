"""Lecture du classeur Heures supplémentaires (parité de `LecteurFichierHeuresSupp`) : aucune règle métier ici."""

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any, cast

from openpyxl import Workbook, load_workbook
from openpyxl.worksheet.worksheet import Worksheet

from staport.domains.common.fichier import texte_cellule

from .exceptions import HeuresSuppInvalide

TAILLE_MAX = 20 * 1024 * 1024
_NOMBRE = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")
_ENTETE_NOM = re.compile(r"nom et prenom|nom prenom|nomprenom")
_ENTETE_HEURES = re.compile(r"hs|p ?/ ?h|p h|heures? supplementaires?|nbre heures? supp")
_LIGNES_ENTETE = 10
_ESPACES = re.compile(r"[\s" + chr(0xA0) + chr(0x202F) + "]")


@dataclass(frozen=True)
class LigneFichier:
    numero_ligne: int
    nom_prenom: str
    cin: str
    heures: Decimal


@dataclass(frozen=True)
class Fichier:
    lignes: list[LigneFichier]
    lignes_zero: int
    total_lignes: int


def generer_modele() -> BytesIO:
    classeur = Workbook()
    feuille = cast(Worksheet, classeur.active)
    feuille.title = "Heures supplémentaires"
    feuille.append(["Nom et prénom", "CIN", "HS"])
    for colonne, largeur in (("A", 8000), ("B", 3600), ("C", 2600)):
        feuille.column_dimensions[colonne].width = largeur / 256
    sortie = BytesIO()
    classeur.save(sortie)
    sortie.seek(0)
    return sortie


def _normaliser(valeur: object) -> str:
    texte = unicodedata.normalize("NFD", "" if valeur is None else str(valeur))
    texte = "".join(c for c in texte if not unicodedata.combining(c)).lower()
    return re.sub(" +", " ", re.sub(r"[^a-z0-9/ ]", "", texte).strip())


def _texte(valeur: object) -> str:
    return texte_cellule(valeur).strip()


def _nombre(valeur: object, adresse: str) -> Decimal | None:
    if valeur is None:
        return None
    try:
        if isinstance(valeur, bool):
            raise ValueError
        if isinstance(valeur, int | float):
            nombre = Decimal(repr(valeur))
        else:
            brut = _ESPACES.sub("", str(valeur)).replace(",", ".")
            if not brut:
                return None
            if _NOMBRE.fullmatch(brut) is None:
                raise ValueError
            nombre = Decimal(brut)
        if not nombre.is_finite():
            raise ValueError
    except (ValueError, InvalidOperation) as erreur:
        raise HeuresSuppInvalide(f"valeur P/H invalide en {adresse}.") from erreur
    return nombre.normalize() if nombre != 0 else Decimal(0)


def lire(nom: str | None, contenu: bytes) -> Fichier:
    if not contenu:
        raise HeuresSuppInvalide("Sélectionnez un fichier Excel contenant les CIN et les heures supplémentaires.")
    if len(contenu) > TAILLE_MAX:
        raise HeuresSuppInvalide("Le fichier dépasse la taille maximale de 20 Mo.")
    if nom is None or not nom.lower().endswith(".xlsx"):
        raise HeuresSuppInvalide("Le fichier doit être au format Excel .xlsx.")
    try:
        classeur = load_workbook(BytesIO(contenu), data_only=True)
    except Exception as erreur:
        raise HeuresSuppInvalide(
            "Fichier Excel illisible : le fichier n'est pas un classeur Excel (.xlsx) valide."
        ) from erreur
    try:
        if not classeur.worksheets:
            raise HeuresSuppInvalide("Le classeur ne contient aucune feuille.")
        return _lire_feuille(classeur.worksheets[0])
    finally:
        classeur.close()


def _ligne(feuille: Worksheet, numero: int) -> list[Any]:
    return [feuille.cell(row=numero, column=colonne).value for colonne in range(1, feuille.max_column + 1)]


def _lire_feuille(feuille: Worksheet) -> Fichier:
    entete = -1
    nom_c = cin_c = heures_c = -1
    for numero in range(1, min(feuille.max_row, _LIGNES_ENTETE) + 1):
        cellules = _ligne(feuille, numero)
        non_vides = 0
        for colonne, valeur in enumerate(cellules):
            normalisee = _normaliser(_texte(valeur))
            if normalisee.strip():
                non_vides += 1
            if _ENTETE_NOM.fullmatch(normalisee):
                nom_c = colonne
            if normalisee == "cin":
                cin_c = colonne
            if _ENTETE_HEURES.fullmatch(normalisee):
                heures_c = colonne
        if nom_c >= 0 and cin_c >= 0 and heures_c >= 0:
            if non_vides != 3:
                raise HeuresSuppInvalide(
                    "Le fichier doit contenir uniquement les trois colonnes Nom et prénom, CIN et HS."
                )
            entete = numero
            break
    if entete < 0:
        raise HeuresSuppInvalide("En-têtes introuvables : le fichier doit contenir Nom et prénom, CIN et HS.")
    lignes: list[LigneFichier] = []
    cins: set[str] = set()
    total = zeros = 0
    for numero in range(entete + 1, feuille.max_row + 1):
        cellules = _ligne(feuille, numero)
        if all(not _texte(valeur) for valeur in cellules):
            continue
        total += 1
        heures = _nombre(cellules[heures_c], f"{feuille.cell(row=numero, column=heures_c + 1).coordinate}")
        if heures is not None and heures == 0:
            zeros += 1
        nom_prenom, cin = _texte(cellules[nom_c]), _texte(cellules[cin_c])
        if not nom_prenom or not cin:
            raise HeuresSuppInvalide(f"Ligne {numero} : Nom et prénom, CIN et HS sont requis.")
        if heures is None:
            raise HeuresSuppInvalide(f"Ligne {numero} : HS manquant.")
        if cin.upper() in cins:
            raise HeuresSuppInvalide(
                f"Ligne {numero} : CIN dupliqué dans le fichier ({cin}). "
                "Corrigez ou regroupez les heures sur une seule ligne."
            )
        cins.add(cin.upper())
        exposant = cast(int, heures.as_tuple().exponent)
        chiffres = len(heures.as_tuple().digits)
        if heures < 0 or -exposant > 1 or chiffres + exposant > 7:
            raise HeuresSuppInvalide(f"Ligne {numero} : HS doit être positif ou nul et comporter au plus une décimale.")
        lignes.append(LigneFichier(numero, nom_prenom, cin, heures))
    if not lignes:
        raise HeuresSuppInvalide("Le fichier ne contient aucune ligne d'heures supplémentaires.")
    return Fichier(lignes, zeros, total)
