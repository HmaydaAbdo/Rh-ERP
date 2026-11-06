from decimal import Decimal
from io import BytesIO
from typing import cast

from openpyxl import Workbook
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe

from .models import Paie
from .schemas import PaieExportRequete


class ServiceExportPaie:
    async def exporter(self, session: AsyncSession, requete: PaieExportRequete) -> BytesIO:
        q = (
            select(Paie, Employee, Chantier, Equipe)
            .join(Employee, Employee.id == Paie.employee_id)
            .join(Chantier, Chantier.id == Paie.chantier_id)
            .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
            .where(Paie.periode == requete.periode)
            .order_by(Chantier.code, Employee.nom_prenom)
        )
        precedent = (
            select(Paie, Employee, Chantier, Equipe)
            .join(Employee, Employee.id == Paie.employee_id)
            .join(Chantier, Chantier.id == Paie.chantier_id)
            .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
            .where(Paie.periode == _mois_precedent(requete.periode))
        )
        async with session.begin():
            lignes = cast(list[tuple[Paie, Employee, Chantier, Equipe | None]], list((await session.execute(q)).all()))
            lignes_precedentes = cast(
                list[tuple[Paie, Employee, Chantier, Equipe | None]], list((await session.execute(precedent)).all())
            )
        groupes = _groupes(requete.regroupements_equipes)
        if requete.chantiers:
            codes = {code.strip().upper() for code in requete.chantiers}
            lignes = [x for x in lignes if x[2].code.strip().upper() in codes]
            lignes_precedentes = [x for x in lignes_precedentes if x[2].code.strip().upper() in codes]
        materiel = requete.materiel or {}
        workbook = Workbook()
        actif = workbook.active
        if actif is not None:
            workbook.remove(actif)
        global_sheet = workbook.create_sheet("GLB")
        _ecrire(global_sheet, lignes, groupes, materiel, lignes_precedentes)
        for code in sorted({chantier.code for _, _, chantier, _ in lignes}):
            feuille = workbook.create_sheet(code[:31])
            chantier_lignes = [x for x in lignes if x[2].code == code]
            exclusions = {
                code.strip().upper() for code in (requete.equipes_exclues_feuille_chantier or {}).get(code, [])
            }
            _ecrire(
                feuille,
                [x for x in chantier_lignes if not x[3] or x[3].code.strip().upper() not in exclusions],
                groupes,
                materiel,
                [x for x in lignes_precedentes if x[2].code == code],
            )
            equipes: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None]]] = {}
            for ligne in chantier_lignes:
                equipe = ligne[3].code if ligne[3] else "SANS_EQUIPE"
                equipes.setdefault(groupes.get(equipe, equipe), []).append(ligne)
            if requete.feuilles_equipe_mode == "AUCUNE":
                continue
            selection = None
            if requete.feuilles_equipe_mode == "PERSONNALISE":
                selection = {code.strip().upper() for code in (requete.equipes_par_chantier or {}).get(code, [])}
            for equipe, equipe_lignes in sorted(equipes.items()):
                if selection is not None and equipe.upper() not in selection:
                    continue
                nom = f"{code}_{equipe}"[:31]
                feuille_equipe = workbook.create_sheet(nom)
                _ecrire(feuille_equipe, equipe_lignes, groupes, materiel, lignes_precedentes)
        sortie = BytesIO()
        workbook.save(sortie)
        sortie.seek(0)
        return sortie


def _groupes(configuration: dict[str, list[str]]) -> dict[str, str]:
    resultat: dict[str, str] = {}
    for libelle, codes in configuration.items():
        for code in codes:
            resultat[code] = libelle
    return resultat


def _mois_precedent(periode: int) -> int:
    annee, mois = divmod(periode, 100)
    return (annee - 1) * 100 + 12 if mois == 1 else annee * 100 + mois - 1


def _ecrire(
    feuille: Worksheet,
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None]],
    groupes: dict[str, str],
    materiel: dict[str, int],
    lignes_precedentes: list[tuple[Paie, Employee, Chantier, Equipe | None]],
) -> None:
    feuille.append(["PAIE"])
    feuille.append(["PÉRIODE", str(lignes[0][0].periode) if lignes else ""])
    feuille.append(["PÉRIMÈTRE", "Toutes les lignes sélectionnées"])
    feuille.append([])
    feuille.append(["Employé", "CIN", "Chantier", "Équipe", "Fonction", "Période", "Salaire", "Total"])
    lignes.sort(key=lambda x: (x[0].fonction_id, x[1].nom_prenom.casefold()))
    for paie, employe, chantier, equipe in lignes:
        equipe_code = equipe.code if equipe else ""
        feuille.append(
            [
                employe.nom_prenom,
                employe.cin,
                chantier.code,
                groupes.get(equipe_code, equipe_code),
                paie.fonction_id,
                paie.periode,
                paie.salaire_mensuel,
                paie.salaire_total,
            ]
        )
    feuille.append([])
    feuille.append(["TOTAL GENERAL", "", "", "", "", "", "", sum((x[0].salaire_total for x in lignes), Decimal(0))])
    precedent = sum((x[0].salaire_total for x in lignes_precedentes), Decimal(0))
    feuille.append(
        ["TOTAL GENERAL MOIS PRECEDENT", "", "", "", "", "", "", precedent if lignes_precedentes else "INTROUVABLE"]
    )
    feuille.append([])
    feuille.append(["FONCTION", "BULLETINS DE PAIE", "STC"])
    fonctions: dict[int, tuple[int, int]] = {}
    for paie, *_ in lignes:
        compte, stc = fonctions.get(paie.fonction_id, (0, 0))
        fonctions[paie.fonction_id] = (
            compte + 1,
            stc + int((paie.observation or "").strip().lower() in {"stc", "sortie"}),
        )
    for fonction, (compte, stc) in sorted(fonctions.items()):
        feuille.append([str(fonction), compte, stc])
    if materiel:
        feuille.append([])
        feuille.append(["MATÉRIEL", "QUANTITÉ"])
        for libelle, quantite in sorted(materiel.items()):
            feuille.append([libelle, quantite])
