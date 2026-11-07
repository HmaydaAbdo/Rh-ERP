"""Import Excel des fonctions : une colonne, une ligne d'en-tête, atomique (parité `FunctionImportService`)."""

from io import BytesIO
from typing import cast

from openpyxl import Workbook, load_workbook
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.fichier import decrire_fichier, texte_cellule

from . import repository
from .exceptions import ErreurImportFonction
from .models import Fonction
from .schemas import FonctionImportReponse, FonctionLigneIgnoree

LIBELLE_MAX = 100


def generer_modele() -> BytesIO:
    """Classeur vierge : aucune ligne d'exemple, qu'on risquerait d'importer par oubli."""
    classeur = Workbook()
    feuille = cast(Worksheet, classeur.active)
    feuille.title = "Fonctions"
    feuille.append(["Fonction"])
    feuille.column_dimensions["A"].width = 6000 / 256
    sortie = BytesIO()
    classeur.save(sortie)
    sortie.seek(0)
    return sortie


def _libelles_du_fichier(contenu: bytes) -> list[tuple[int, str]]:
    try:
        classeur = load_workbook(BytesIO(contenu), read_only=True, data_only=True)
        try:
            lignes = [
                (numero, texte_cellule(cellules[0] if cellules else None).strip())
                for numero, cellules in enumerate(classeur.worksheets[0].iter_rows(values_only=True), start=1)
                if numero > 1
            ]
        finally:
            classeur.close()
    except Exception as erreur:
        raise ErreurImportFonction(f"Fichier Excel illisible : {erreur}") from erreur
    return [(numero, libelle) for numero, libelle in lignes if libelle]


async def importer(
    auditeur: Auditeur, session: AsyncSession, nom_fichier: str | None, contenu: bytes
) -> FonctionImportReponse:
    action = auditeur.auditer(session, "FONCTION_IMPORT", TypeOperation.CREATE, "Function")
    async with session.begin(), action as cible:
        cible.perimetre.update(decrire_fichier(nom_fichier, contenu))
        lignes = _libelles_du_fichier(contenu)
        ignorees: list[FonctionLigneIgnoree] = []
        a_creer: list[Fonction] = []
        traites: set[str] = set()
        for numero, libelle in lignes:
            if len(libelle) > LIBELLE_MAX:
                raison = f"Libellé trop long (max {LIBELLE_MAX} caractères)"
            elif libelle.upper() in traites or await repository.existe_par_libelle(session, libelle):
                raison = "Fonction déjà existante"
            else:
                traites.add(libelle.upper())
                a_creer.append(Fonction(libelle=libelle))
                continue
            ignorees.append(FonctionLigneIgnoree(numero_ligne=numero, libelle=libelle, raison=raison))
        cible.perimetre["totalLignes"] = len(lignes)
        if ignorees:
            cible.nombre_elements = 0
            cible.motif_rejet = f"{len(ignorees)} ligne(s) rejetée(s) sur {len(lignes)}"
            return FonctionImportReponse(
                total_lignes=len(lignes), crees=0, ignores=len(ignorees), lignes_ignorees=ignorees
            )
        session.add_all(a_creer)
        cible.nombre_elements = len(a_creer)
        return FonctionImportReponse(total_lignes=len(lignes), crees=len(a_creer), ignores=0, lignes_ignorees=[])
