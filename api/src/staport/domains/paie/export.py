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
        async with session.begin():
            lignes = cast(list[tuple[Paie, Employee, Chantier, Equipe | None]], list((await session.execute(q)).all()))
        groupes = _groupes(requete.regroupements_equipes)
        workbook = Workbook()
        actif = workbook.active
        if actif is not None:
            workbook.remove(actif)
        global_sheet = workbook.create_sheet("GLB")
        _ecrire(global_sheet, lignes, groupes)
        for code in sorted({chantier.code for _, _, chantier, _ in lignes}):
            feuille = workbook.create_sheet(code[:31])
            chantier_lignes = [x for x in lignes if x[2].code == code]
            _ecrire(feuille, chantier_lignes, groupes)
            equipes: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None]]] = {}
            for ligne in chantier_lignes:
                equipe = ligne[3].code if ligne[3] else "SANS_EQUIPE"
                equipes.setdefault(groupes.get(equipe, equipe), []).append(ligne)
            for equipe, equipe_lignes in sorted(equipes.items()):
                nom = f"{code}_{equipe}"[:31]
                feuille_equipe = workbook.create_sheet(nom)
                _ecrire(feuille_equipe, equipe_lignes, groupes)
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


def _ecrire(
    feuille: Worksheet, lignes: list[tuple[Paie, Employee, Chantier, Equipe | None]], groupes: dict[str, str]
) -> None:
    feuille.append(["Employé", "CIN", "Chantier", "Équipe", "Fonction", "Période", "Salaire", "Total"])
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
    feuille.append(["TOTAL", "", "", "", "", "", "", sum((x[0].salaire_total for x in lignes), Decimal(0))])
