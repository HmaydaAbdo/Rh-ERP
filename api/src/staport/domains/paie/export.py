import re
from decimal import Decimal
from io import BytesIO
from typing import cast

from openpyxl import Workbook
from openpyxl.cell.cell import Cell
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .materiel import tableaux_materiel
from .models import Paie
from .schemas import PaieExportRequete


class ServiceExportPaie:
    async def exporter(self, session: AsyncSession, requete: PaieExportRequete) -> BytesIO:
        q = (
            select(Paie, Employee, Chantier, Equipe, Fonction)
            .join(Employee, Employee.id == Paie.employee_id)
            .join(Chantier, Chantier.id == Paie.chantier_id)
            .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
            .join(Fonction, Fonction.id == Paie.fonction_id)
            .where(Paie.periode == requete.periode)
            .order_by(Chantier.code, Employee.nom_prenom)
        )
        precedent = (
            select(Paie, Employee, Chantier, Equipe, Fonction)
            .join(Employee, Employee.id == Paie.employee_id)
            .join(Chantier, Chantier.id == Paie.chantier_id)
            .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
            .join(Fonction, Fonction.id == Paie.fonction_id)
            .where(Paie.periode == _mois_precedent(requete.periode))
        )
        async with session.begin():
            lignes = cast(
                list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
                list((await session.execute(q)).all()),
            )
            lignes_precedentes = cast(
                list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
                list((await session.execute(precedent)).all()),
            )
        groupes = _groupes(requete.regroupements_equipes)
        if requete.chantiers:
            codes = {code.strip().upper() for code in requete.chantiers}
            lignes = [x for x in lignes if x[2].code.strip().upper() in codes]
            lignes_precedentes = [x for x in lignes_precedentes if x[2].code.strip().upper() in codes]
        workbook = Workbook()
        actif = workbook.active
        if actif is not None:
            workbook.remove(actif)
        global_sheet = workbook.create_sheet("GLB")
        _ecrire(global_sheet, "GLOBAL", requete.periode, lignes, groupes, None, lignes_precedentes)
        for code in sorted({chantier.code for _, _, chantier, _, _ in lignes}):
            feuille = workbook.create_sheet(_nom_feuille_valide(code))
            chantier_lignes = [x for x in lignes if x[2].code == code]
            exclusions = set((requete.equipes_exclues_feuille_chantier or {}).get(code, []))
            _ecrire(
                feuille,
                _titre_chantier(code, chantier_lignes),
                requete.periode,
                [x for x in chantier_lignes if not x[3] or x[3].libelle not in exclusions],
                groupes,
                None,
                [x for x in lignes_precedentes if x[2].code == code and (not x[3] or x[3].libelle not in exclusions)],
            )
            equipes: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]] = {}
            for ligne in chantier_lignes:
                equipe = ligne[3].code if ligne[3] else "SANS_EQUIPE"
                equipes.setdefault(groupes.get(equipe, equipe), []).append(ligne)
            if requete.feuilles_equipe_mode == "AUCUNE":
                continue
            selection = None
            if requete.feuilles_equipe_mode == "PERSONNALISE":
                selection = set((requete.equipes_par_chantier or {}).get(code, []))
            for equipe, equipe_lignes in sorted(equipes.items()):
                if (
                    selection is not None
                    and equipe not in selection
                    and not any(ligne[3] and ligne[3].libelle in selection for ligne in equipe_lignes)
                ):
                    continue
                nom = _nom_feuille_valide(f"{code}_{equipe}")
                feuille_equipe = workbook.create_sheet(nom)
                tableau = next(
                    (t for t in tableaux_materiel() if t.chantier_code == code and t.equipe_code == equipe), None
                )
                _ecrire(
                    feuille_equipe,
                    f"{_titre_chantier(code, equipe_lignes)} - Equipe: {cast(Equipe, equipe_lignes[0][3]).libelle}",
                    requete.periode,
                    equipe_lignes,
                    groupes,
                    (tableau.titre, tableau.libelles, requete.materiel or {}) if tableau else None,
                    [
                        x
                        for x in lignes_precedentes
                        if x[2].code == code and x[3] and groupes.get(x[3].code, x[3].code) == equipe
                    ],
                )
        sortie = BytesIO()
        workbook.calculation.fullCalcOnLoad = True
        workbook.calculation.forceFullCalc = True
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


def _titre_chantier(code: str, lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]) -> str:
    nom = lignes[0][2].nom if lignes else None
    return f"{nom} ({code})" if nom and nom.strip() else code


def _nom_feuille_valide(nom: str) -> str:
    return re.sub(r"[\\/?*+\[\]]", "_", nom)[:31]


def _ecrire(
    feuille: Worksheet,
    titre_zone: str,
    periode: int,
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
    groupes: dict[str, str],
    materiel: tuple[str, list[str], dict[str, int]] | None,
    lignes_precedentes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> None:
    filet = Side(style="thin")
    bordure = Border(left=filet, right=filet, top=filet, bottom=filet)
    entete = PatternFill("solid", fgColor="D3D3D3")
    sous_entete = PatternFill("solid", fgColor="F0F0F0")
    feuille.merge_cells("A1:M1")
    feuille["A1"] = f"CHANTIER : {titre_zone}  -  PAIE MOIS {periode % 100:02d}-{periode // 100}"
    feuille["A1"].font = Font(bold=True, size=11)
    feuille["A1"].alignment = Alignment(horizontal="center", vertical="center")
    feuille.append([])
    feuille.append(
        ["NOM & PRENOM", "FONCTION", "CIN", "Nbre Jrs", "", "", "SALAIRE", "", "", "TOTAL", "OBS", "CHANTIER", "EQ"]
    )
    feuille.append(["", "", "", "P", "J.R.O", "J.R.D", "SALAIRE", "RO", "RD", "", "", "", ""])
    for plage in ("D3:F3", "G3:I3", "A3:A4", "B3:B4", "C3:C4", "J3:J4", "K3:K4", "L3:L4", "M3:M4"):
        feuille.merge_cells(plage)
    for ligne_entete, fond, police in ((3, entete, Font(bold=True)), (4, sous_entete, Font(italic=True))):
        for cellule in feuille[ligne_entete]:
            cellule.fill = fond
            cellule.font = police
            cellule.alignment = Alignment(horizontal="center", vertical="center")
    ordonnees = sorted(lignes, key=lambda x: (x[4].libelle.casefold(), x[1].nom_prenom.casefold()))
    for paie, employe, chantier, equipe, fonction in ordonnees:
        code_equipe = equipe.code if equipe else ""
        feuille.append(
            [
                employe.nom_prenom,
                fonction.libelle,
                employe.cin,
                float(paie.nombre_jours_travailles or 0),
                float(paie.jours_recuperation_ouvrable or 0),
                float(paie.jours_recuperation_dimanche or 0),
                float(paie.salaire_mensuel or 0),
                float(paie.prime_roulage_ordinaire or 0),
                float(paie.prime_roulage_dimanche or 0),
                float(paie.salaire_total),
                paie.observation or "",
                chantier.code,
                groupes.get(code_equipe, code_equipe),
            ]
        )
    for ligne in feuille.iter_rows(min_row=5, max_row=4 + len(ordonnees), max_col=13):
        for cellule in ligne:
            cellule.border = bordure
            alignement = (
                "left" if cellule.column in (1, 2) else "right" if cellule.column in (7, 8, 9, 10) else "center"
            )
            cellule.alignment = Alignment(horizontal=alignement, vertical="center")
            if cellule.column in (7, 8, 9, 10):
                cellule.number_format = "#,##0.00"
    total_ligne = 5 + len(ordonnees)
    precedent_ligne = total_ligne + 1
    for index, libelle in ((total_ligne, "TOTAL GENERAL"), (precedent_ligne, "TOTAL GENERAL MOIS PRECEDENT")):
        feuille.merge_cells(start_row=index, start_column=4, end_row=index, end_column=9)
        cellule = feuille.cell(index, 4, libelle)
        cellule.font = Font(bold=True)
        cellule.border = bordure
        cellule.alignment = Alignment(horizontal="center")
        valeur = feuille.cell(index, 10)
        valeur.font = Font(bold=True)
        valeur.border = bordure
        valeur.alignment = Alignment(horizontal="right")
        valeur.number_format = "#,##0.00"
    cast(Cell, feuille.cell(total_ligne, 10)).value = (
        f"=SUBTOTAL(9,J5:J{4 + len(ordonnees)})" if ordonnees else "=SUBTOTAL(9,J1:J1)-SUBTOTAL(9,J1:J1)"
    )
    cast(Cell, feuille.cell(precedent_ligne, 10)).value = (
        float(sum((x[0].salaire_total for x in lignes_precedentes), Decimal(0)))
        if lignes_precedentes
        else "INTROUVABLE"
    )
    depart_recap = total_ligne + 3
    for colonne, libelle in enumerate(("FONCTION", "BULLETINS DE PAIE", "STC"), start=1):
        cellule = feuille.cell(depart_recap, colonne, libelle)
        cellule.fill = entete
        cellule.font = Font(bold=True)
        cellule.alignment = Alignment(horizontal="center")
    fonctions: dict[str, tuple[int, int]] = {}
    for paie, _, _, _, fonction in lignes:
        compte, stc = fonctions.get(fonction.libelle, (0, 0))
        est_sortie = (paie.observation or "").strip().casefold() in {"stc", "sortie"}
        fonctions[fonction.libelle] = (compte + 1, stc + int(est_sortie))
    fonctions_triees = sorted(fonctions.items(), key=lambda item: item[0].casefold())
    for index, (fonction, (compte, stc)) in enumerate(fonctions_triees, start=depart_recap + 1):
        for colonne, valeur in enumerate((fonction, compte, stc), start=1):
            cellule = feuille.cell(index, colonne, valeur)
            cellule.border = bordure
            cellule.alignment = Alignment(horizontal="left" if colonne == 1 else "center")
    if materiel:
        titre, libelles, nombres = materiel
        for colonne, libelle in ((7, titre), (8, "Nbre")):
            cellule = feuille.cell(depart_recap, colonne, libelle)
            cellule.fill = entete
            cellule.font = Font(bold=True)
            cellule.alignment = Alignment(horizontal="center")
        for index, libelle in enumerate(libelles, start=depart_recap + 1):
            feuille.cell(index, 7, libelle).border = bordure
            cellule = feuille.cell(index, 8, nombres.get(libelle))
            cellule.border = bordure
            cellule.alignment = Alignment(horizontal="center")
    for index in range(1, 14):
        longueur = max(
            len(str(cellule.value or ""))
            for colonne in feuille.iter_cols(min_col=index, max_col=index)
            for cellule in colonne
        )
        feuille.column_dimensions[chr(64 + index)].width = max(12, longueur + 3)
