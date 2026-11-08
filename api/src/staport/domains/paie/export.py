import asyncio
import re
from copy import copy
from decimal import Decimal
from io import BytesIO
from typing import cast

from openpyxl import Workbook
from openpyxl.cell.cell import Cell
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.styles.cell_style import StyleArray
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


def _police(**options: bool) -> Font:
    """Calibri 11 comme les polices créées par POI : une police sans nom n'est pas celle du classeur de référence."""
    return Font(name="Calibri", size=11, **options)  # pyright: ignore


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
        # Construire un classeur de plusieurs milliers de lignes occupe le processeur : dans un fil, pour que la boucle
        # d'événements continue de servir les autres requêtes (profil de performance, KAN-233).
        return await asyncio.to_thread(_construire_classeur, requete, lignes, lignes_precedentes)


def _construire_classeur(
    requete: PaieExportRequete,
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
    lignes_precedentes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> BytesIO:
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
            if ligne[3] is None:  # Spring : pas de feuille pour les bulletins sans équipe
                continue
            equipes.setdefault(groupes.get(ligne[3].code, ligne[3].code), []).append(ligne)
        if requete.feuilles_equipe_mode == "AUCUNE":
            continue
        selection = None
        if requete.feuilles_equipe_mode == "PERSONNALISE":
            selection = set((requete.equipes_par_chantier or {}).get(code, []))
        for equipe, equipe_lignes in sorted(equipes.items()):
            if selection is not None and not any(ligne[3] and ligne[3].libelle in selection for ligne in equipe_lignes):
                continue  # PERSONNALISE : la requête cite des libellés d'équipe, jamais des codes
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
    feuille["A1"].font = _police(bold=True)
    feuille["A1"].alignment = Alignment(horizontal="center", vertical="center")
    feuille.append([])
    feuille.append(
        ["NOM & PRENOM", "FONCTION", "CIN", "Nbre Jrs", "", "", "SALAIRE", "", "", "TOTAL", "OBS", "CHANTIER", "EQ"]
    )
    feuille.append(["", "", "", "P", "J.R.O", "J.R.D", "SALAIRE", "RO", "RD", "", "", "", ""])
    for plage in ("D3:F3", "G3:I3", "A3:A4", "B3:B4", "C3:C4", "J3:J4", "K3:K4", "L3:L4", "M3:M4"):
        feuille.merge_cells(plage)
    for ligne_entete, fond, police in ((3, entete, _police(bold=True)), (4, sous_entete, _police(italic=True))):
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
    # Le style d'une colonne est calculé une fois puis recopié : l'affecter cellule par cellule (bordure, alignement,
    # format) fait dédoublonner chaque style par openpyxl et dominait le temps d'un export (profil de performance).
    modeles: dict[int, StyleArray] = {}
    for ligne in feuille.iter_rows(min_row=5, max_row=4 + len(ordonnees), max_col=13):
        for cellule in ligne:
            modele = modeles.get(cellule.column)  # pyright: ignore
            if modele is not None:
                cellule._style = copy(modele)  # pyright: ignore[reportPrivateUsage]
                continue
            cellule.border = bordure
            alignement = (
                "left" if cellule.column in (1, 2) else "right" if cellule.column in (7, 8, 9, 10) else "center"
            )
            cellule.alignment = Alignment(horizontal=alignement, vertical="center")
            if cellule.column in (7, 8, 9, 10):
                cellule.number_format = "#,##0.00"
            modeles[cellule.column or 0] = copy(cellule._style)  # pyright: ignore[reportPrivateUsage]
    total_ligne = 5 + len(ordonnees)
    precedent_ligne = total_ligne + 1
    for index, libelle in ((total_ligne, "TOTAL GENERAL"), (precedent_ligne, "TOTAL GENERAL MOIS PRECEDENT")):
        feuille.merge_cells(start_row=index, start_column=4, end_row=index, end_column=9)
        cellule = feuille.cell(index, 4, libelle)
        cellule.font = _police(bold=True)
        cellule.border = bordure
        cellule.alignment = Alignment(horizontal="center", vertical="center")
        valeur = feuille.cell(index, 10)
        valeur.font = _police(bold=True)
        valeur.border = bordure
        valeur.alignment = Alignment(horizontal="right", vertical="center")
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
        cellule.font = _police(bold=True)
        cellule.alignment = Alignment(horizontal="center", vertical="center")
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
            cellule.alignment = Alignment(horizontal="left" if colonne == 1 else "center", vertical="center")
    if materiel:
        titre, libelles, nombres = materiel
        for colonne, libelle in ((7, titre), (8, "Nbre")):
            cellule = feuille.cell(depart_recap, colonne, libelle)
            cellule.fill = entete
            cellule.font = _police(bold=True)
            cellule.alignment = Alignment(horizontal="center", vertical="center")
        for index, libelle in enumerate(libelles, start=depart_recap + 1):
            etiquette = feuille.cell(index, 7, libelle)
            etiquette.border = bordure
            etiquette.alignment = Alignment(horizontal="left", vertical="center")
            cellule = feuille.cell(index, 8, nombres.get(libelle))
            cellule.border = bordure
            cellule.alignment = Alignment(horizontal="center", vertical="center")
    _ajuster_largeurs(feuille)


def _largeur_texte(valeur: object, format_nombre: str) -> float:
    if isinstance(valeur, float) and format_nombre == "#,##0.00":
        valeur = f"{valeur:,.2f}"
    elif isinstance(valeur, float):
        valeur = f"{valeur:g}"
    # Calibri 11 : majuscule ≈ 1,1 chiffre, minuscule ≈ 0,9, espace ≈ 0,5 (approximation des métriques de POI)
    return sum(
        1.1 if caractere.isupper() else 0.5 if caractere == " " else 0.9 if caractere.isalpha() else 1.0
        for caractere in str(valeur or "")
    )


def _ajuster_largeurs(feuille: Worksheet) -> None:
    """`autoSizeColumn` de POI ignore les cellules fusionnées ; la feuille ajoute 3 caractères (minimum 3000/256)."""
    fusionnees = {cellule for plage in feuille.merged_cells.ranges for cellule in plage.cells}
    for index in range(1, 14):
        longueur = max(
            (
                _largeur_texte(cellule.value, cellule.number_format)
                for colonne in feuille.iter_cols(min_col=index, max_col=index)
                for cellule in colonne
                if (cellule.row, cellule.column) not in fusionnees and not str(cellule.value or "").startswith("=")
            ),
            default=0.0,
        )
        feuille.column_dimensions[chr(64 + index)].width = max(3000 / 256, longueur + 3)
