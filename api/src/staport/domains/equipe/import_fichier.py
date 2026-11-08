"""Import Excel des équipes : colonnes Code et Libellé, atomique (parité `EquipeImportService`)."""

from io import BytesIO
from typing import cast

from openpyxl import Workbook, load_workbook
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.fichier import decrire_fichier, texte_cellule

from .exceptions import ErreurImportEquipe
from .models import Equipe
from .schemas import EquipeImportReponse, EquipeLigneIgnoree

CODE_MAX = 50
LIBELLE_MAX = 100
FORMAT_INVALIDE = "Format invalide : les colonnes attendues sont « Code » et « Libellé », dans cet ordre."

type Cellules = tuple[object, ...]


def generer_modele() -> BytesIO:
    classeur = Workbook()
    feuille = cast(Worksheet, classeur.active)
    feuille.title = "Équipes"
    feuille.append(["Code", "Libellé"])
    feuille.column_dimensions["A"].width = 5000 / 256
    feuille.column_dimensions["B"].width = 9000 / 256
    sortie = BytesIO()
    classeur.save(sortie)
    sortie.seek(0)
    return sortie


def _normaliser(valeur: object) -> str:
    return texte_cellule(valeur).strip().upper()


def _cellule(cellules: Cellules, index: int) -> object:
    return cellules[index] if len(cellules) > index else None


def _vide_a_partir(cellules: Cellules, debut: int) -> bool:
    return all(not texte_cellule(valeur).strip() for valeur in cellules[debut:])


def _lire(contenu: bytes) -> list[tuple[int, Cellules]]:
    try:
        classeur = load_workbook(BytesIO(contenu), read_only=True, data_only=True)
    except Exception as erreur:
        raise ErreurImportEquipe(
            "Fichier Excel illisible : le fichier n'est pas un classeur Excel (.xlsx) valide."
        ) from erreur
    try:
        if not classeur.worksheets:
            raise ErreurImportEquipe("Le classeur ne contient aucune feuille.")
        try:
            lignes: list[tuple[int, Cellules]] = [
                (numero, tuple[object, ...](cellules))
                for numero, cellules in enumerate(classeur.worksheets[0].iter_rows(values_only=True), start=1)
            ]
        except Exception as erreur:
            raise ErreurImportEquipe(
                "Fichier Excel illisible : le fichier n'est pas un classeur Excel (.xlsx) valide."
            ) from erreur
    finally:
        classeur.close()
    entete: Cellules = lignes[0][1] if lignes else ()
    if (
        _normaliser(_cellule(entete, 0)) != "CODE"
        or _normaliser(_cellule(entete, 1)) != "LIBELLÉ"
        or not _vide_a_partir(entete, 2)
    ):
        raise ErreurImportEquipe(FORMAT_INVALIDE)
    return lignes[1:]


async def importer(
    auditeur: Auditeur, session: AsyncSession, nom_fichier: str | None, contenu: bytes
) -> EquipeImportReponse:
    action = auditeur.auditer(session, "EQUIPE_IMPORT", TypeOperation.CREATE, "Equipe")
    async with session.begin(), action as cible:
        cible.perimetre.update(decrire_fichier(nom_fichier, contenu))
        lignes = _lire(contenu)
        existantes = (await session.execute(select(Equipe.code, Equipe.libelle))).all()
        codes_existants = {_normaliser(code) for code, _ in existantes}
        libelles_existants = {_normaliser(libelle) for _, libelle in existantes}
        codes_fichier: set[str] = set()
        libelles_fichier: set[str] = set()
        ignorees: list[EquipeLigneIgnoree] = []
        a_creer: list[Equipe] = []
        total = 0
        for numero, cellules in lignes:
            code = texte_cellule(_cellule(cellules, 0)).strip()
            libelle = texte_cellule(_cellule(cellules, 1)).strip()
            if not code and not libelle and _vide_a_partir(cellules, 2):
                continue
            total += 1
            raison = _raison(
                code, libelle, cellules, (codes_fichier, libelles_fichier, codes_existants, libelles_existants)
            )
            if raison is not None:
                ignorees.append(EquipeLigneIgnoree(numero_ligne=numero, code=code, libelle=libelle, raison=raison))
                continue
            codes_fichier.add(_normaliser(code))
            libelles_fichier.add(_normaliser(libelle))
            a_creer.append(Equipe(code=code.upper(), libelle=libelle))
        cible.perimetre["totalLignes"] = total
        if ignorees:
            cible.nombre_elements = 0
            cible.motif_rejet = f"{len(ignorees)} ligne(s) rejetée(s) sur {total}"
            return EquipeImportReponse(total_lignes=total, crees=0, ignores=len(ignorees), lignes_ignorees=ignorees)
        session.add_all(a_creer)
        cible.nombre_elements = len(a_creer)
        return EquipeImportReponse(total_lignes=total, crees=len(a_creer), ignores=0, lignes_ignorees=[])


def _raison(
    code: str, libelle: str, cellules: Cellules, connus: tuple[set[str], set[str], set[str], set[str]]
) -> str | None:
    """Premier motif de rejet, dans l'ordre de `EquipeImportService`."""
    codes_fichier, libelles_fichier, codes_existants, libelles_existants = connus
    if not code:
        return "Code obligatoire"
    if not libelle:
        return "Libellé obligatoire"
    if len(code) > CODE_MAX:
        return "Code trop long (max 50 caractères)"
    if len(libelle) > LIBELLE_MAX:
        return "Libellé trop long (max 100 caractères)"
    if not _vide_a_partir(cellules, 2):
        return "Colonnes supplémentaires non prises en charge"
    if _normaliser(code) in codes_fichier:
        return "Code déjà présent dans le fichier"
    if _normaliser(libelle) in libelles_fichier:
        return "Libellé déjà présent dans le fichier"
    if _normaliser(code) in codes_existants:
        return "Code d'équipe déjà existant"
    if _normaliser(libelle) in libelles_existants:
        return "Libellé d'équipe déjà existant"
    return None
