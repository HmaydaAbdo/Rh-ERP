"""Import des déclarations CNSS (KAN-320) : matricule et date de déclaration de chaque employé, retrouvé par son CIN.

Le fichier est la première feuille d'un classeur .xlsx dont l'en-tête contient au moins « CIN », « Matricule CNSS » et
« Date de déclaration », dans n'importe quel ordre et parmi d'autres colonnes (N°, nom...). Une ligne sans matricule
ni date est un employé non déclaré : elle est comptée et ne change rien. L'import est atomique : une ligne rejetée
(CIN inconnu ou invalide, matricule invalide, date manquante, doublon) refuse tout le fichier. Une fiche dont le
matricule et la date sont déjà ceux du fichier n'est pas réécrite.
"""

import unicodedata
from datetime import date
from io import BytesIO
from typing import Any

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.cles import CIN_REGLE, cin_canonique, cin_valide
from staport.domains.common.fichier import decrire_fichier

from .exceptions import ErreurImportEmployee
from .models import Employee
from .schemas import CNSS_REGLE, MATRICULE_MAX, CnssImportReponse, EmployeeLigneIgnoree, matricule_cnss_canonique
from .service import date_cellule, texte_affiche

ENTETES_CNSS = ("CIN", "Matricule CNSS", "Date de déclaration")


def _cle_entete(valeur: Any) -> str:
    texte = unicodedata.normalize("NFKD", str(valeur or ""))
    return " ".join("".join(c for c in texte if not unicodedata.combining(c)).lower().split())


def _lire(contenu: bytes) -> list[tuple[Any, ...]]:
    try:
        classeur = load_workbook(BytesIO(contenu), read_only=True, data_only=True)
        try:
            return list(classeur.worksheets[0].iter_rows(values_only=True))
        finally:
            classeur.close()
    except Exception as erreur:
        raise ErreurImportEmployee(
            "Fichier Excel illisible : le fichier n'est pas un classeur Excel (.xlsx) valide."
        ) from erreur


def _colonnes(entete: tuple[Any, ...]) -> tuple[int, int, int]:
    positions = {_cle_entete(v): i for i, v in enumerate(entete)}
    manquantes = [nom for nom in ENTETES_CNSS if _cle_entete(nom) not in positions]
    if manquantes:
        raise ErreurImportEmployee(
            "En-têtes introuvables : le fichier doit contenir les colonnes " + ", ".join(ENTETES_CNSS) + "."
        )
    cin, matricule, declaration = (positions[_cle_entete(nom)] for nom in ENTETES_CNSS)
    return cin, matricule, declaration


def _cellule(ligne: tuple[Any, ...], i: int) -> Any:
    return ligne[i] if i < len(ligne) else None


async def importer_cnss(
    auditeur: Auditeur, s: AsyncSession, nom_fichier: str | None, contenu: bytes
) -> CnssImportReponse:
    lignes = _lire(contenu)
    if not lignes:
        raise ErreurImportEmployee("Fichier vide.")
    col_cin, col_matricule, col_date = _colonnes(lignes[0])
    action = auditeur.auditer(s, "EMPLOYE_IMPORT_CNSS", TypeOperation.UPDATE, "Employee")
    async with s.begin(), action as cible:
        cible.perimetre.update(decrire_fichier(nom_fichier, contenu))
        employes = {x.cin: x for x in (await s.execute(select(Employee))).scalars()}
        porteurs = {x.matricule_cnss: x.cin for x in employes.values() if x.matricule_cnss}
        erreurs: list[EmployeeLigneIgnoree] = []
        a_ecrire: list[tuple[Employee, str, date]] = []
        vus_cin: set[str] = set()
        vus_matricule: dict[str, str] = {}
        total = sans_declaration = inchanges = 0
        for numero, ligne in enumerate(lignes[1:], 2):
            if all(texte_affiche(v) is None for v in ligne):
                continue
            total += 1
            cin = cin_canonique(_cellule(ligne, col_cin)) or None
            matricule = matricule_cnss_canonique(_cellule(ligne, col_matricule)) or None
            declaration = date_cellule(_cellule(ligne, col_date))
            if matricule is None and texte_affiche(_cellule(ligne, col_date)) is None:
                sans_declaration += 1
                continue
            raison: str | None = None
            if cin is None:
                raison = "CIN manquant"
            elif not cin_valide(cin):
                raison = CIN_REGLE
            elif cin not in employes:
                raison = "Aucun employé avec ce CIN"
            elif cin in vus_cin:
                raison = "CIN en doublon dans le fichier"
            elif matricule is None:
                raison = "Matricule CNSS manquant"
            elif not (matricule.isascii() and matricule.isdigit() and len(matricule) <= MATRICULE_MAX):
                raison = CNSS_REGLE
            elif declaration is None:
                raison = "Date de déclaration manquante ou invalide"
            elif declaration > date.today():
                raison = "La date de déclaration ne peut pas être future"
            elif matricule in vus_matricule:
                raison = f"Matricule CNSS en doublon dans le fichier (CIN {vus_matricule[matricule]})"
            elif porteurs.get(matricule, cin) != cin:
                raison = f"Matricule CNSS déjà porté par l'employé de CIN {porteurs[matricule]}"
            nom = texte_affiche(employes[cin].nom_prenom) if cin in employes else None
            if raison is not None or cin is None or matricule is None or declaration is None:
                motif = raison or "Ligne invalide"
                erreurs.append(EmployeeLigneIgnoree(numero_ligne=numero, cin=cin, nom_prenom=nom, raison=motif))
                continue
            vus_cin.add(cin)
            vus_matricule[matricule] = cin
            fiche = employes[cin]
            if (fiche.matricule_cnss, fiche.date_declaration_cnss) == (matricule, declaration):
                inchanges += 1
            else:
                a_ecrire.append((fiche, matricule, declaration))
        cible.perimetre["totalLignes"] = total
        if erreurs:
            cible.nombre_elements = 0
            cible.motif_rejet = f"{len(erreurs)} ligne(s) rejetée(s) sur {total}"
            return CnssImportReponse(
                total_lignes=total,
                mis_a_jour=0,
                inchanges=0,
                sans_declaration=sans_declaration,
                ignores=len(erreurs),
                lignes_ignorees=erreurs,
            )
        # Un matricule déjà porté par une autre fiche est refusé plus haut : l'unicité tient à chaque écriture.
        for fiche, matricule, declaration in a_ecrire:
            fiche.matricule_cnss, fiche.date_declaration_cnss = matricule, declaration
        await s.flush()
        cible.nombre_elements = len(a_ecrire)
        return CnssImportReponse(
            total_lignes=total,
            mis_a_jour=len(a_ecrire),
            inchanges=inchanges,
            sans_declaration=sans_declaration,
            ignores=0,
            lignes_ignorees=[],
        )
