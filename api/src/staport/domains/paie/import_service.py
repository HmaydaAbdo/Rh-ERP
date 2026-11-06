from decimal import Decimal
from io import BytesIO
from typing import Any, cast

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.employee.models import Employee, TypeSalaire
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .models import Paie
from .schemas import PaieImportAnalyse, PaieImportCorrection, PaieImportErreur


class ServiceImportPaie:
    def __init__(self, auditeur: Auditeur) -> None:
        self._auditeur = auditeur

    async def analyser(self, session: AsyncSession, contenu: bytes, periode: int) -> PaieImportAnalyse:
        feuille = load_workbook(BytesIO(contenu), read_only=True, data_only=True).active
        erreurs: list[PaieImportErreur] = []
        avertissements: list[PaieImportErreur] = []
        lignes = list(feuille.iter_rows(values_only=True)) if feuille else []
        async with session.begin():
            employees = {x.cin.strip().upper(): x for x in (await session.execute(select(Employee))).scalars()}
            fonctions = {x.libelle.strip().upper() for x in (await session.execute(select(Fonction))).scalars()}
            chantiers = {x.code.strip().upper() for x in (await session.execute(select(Chantier))).scalars()}
            equipes = {x.code.strip().upper() for x in (await session.execute(select(Equipe))).scalars()}
        for numero, ligne in enumerate(lignes[3:], start=4):
            cin = str(ligne[2]).strip() if len(ligne) > 2 and ligne[2] is not None else None
            nom = str(ligne[1]).strip() if len(ligne) > 1 and ligne[1] is not None else None
            fonction = str(ligne[3]).strip() if len(ligne) > 3 and ligne[3] is not None else None
            chantier = str(ligne[4]).strip() if len(ligne) > 4 and ligne[4] is not None else None
            equipe = str(ligne[5]).strip() if len(ligne) > 5 and ligne[5] is not None else None
            if cin is None or cin.upper() not in employees:
                erreurs.append(
                    PaieImportErreur(
                        numero_ligne=numero, cin=cin, nom_prenom=nom, champ="cin", valeur=cin, raison="CIN inconnu"
                    )
                )
            if fonction and fonction.upper() not in fonctions:
                erreurs.append(
                    PaieImportErreur(
                        numero_ligne=numero,
                        cin=cin,
                        nom_prenom=nom,
                        champ="fonction",
                        valeur=fonction,
                        raison="fonction introuvable",
                    )
                )
            if chantier and chantier.upper() not in chantiers:
                erreurs.append(
                    PaieImportErreur(
                        numero_ligne=numero,
                        cin=cin,
                        nom_prenom=nom,
                        champ="chantier",
                        valeur=chantier,
                        raison="chantier introuvable",
                    )
                )
            if equipe and equipe.upper() not in equipes:
                erreurs.append(
                    PaieImportErreur(
                        numero_ligne=numero,
                        cin=cin,
                        nom_prenom=nom,
                        champ="equipe",
                        valeur=equipe,
                        raison="équipe introuvable",
                    )
                )
            for index, champ in (
                (9, "salaireMensuel"),
                (10, "primeRoulageOrdinaire"),
                (11, "primeRoulageDimanche"),
                (12, "salaireTotal"),
            ):
                valeur = ligne[index] if len(ligne) > index else None
                if valeur is None:
                    continue
                try:
                    nombre = float(str(valeur))
                except TypeError, ValueError:
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur=str(valeur),
                            raison="valeur non numérique",
                        )
                    )
                    continue
                if nombre < 0 or nombre > 99_999_999.99 or round(nombre, 2) != nombre:
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur=str(valeur),
                            raison="valeur hors limites ou plus de deux décimales",
                        )
                    )
                elif champ == "salaireMensuel" and nombre == 0:
                    avertissements.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur="0",
                            raison="salaire nul : cliquer sur « Ignorer et conserver 0 »",
                            avertissement=True,
                        )
                    )
                elif champ == "salaireMensuel" and cin and cin.upper() in employees:
                    employe = employees[cin.upper()]
                    if employe.salaire is not None and employe.salaire != nombre:
                        avertissements.append(
                            PaieImportErreur(
                                numero_ligne=numero,
                                cin=cin,
                                nom_prenom=nom,
                                champ=champ,
                                valeur=str(valeur),
                                raison="salaire différent de la dernière paie : confirmation wizard requise",
                                avertissement=True,
                            )
                        )
        return PaieImportAnalyse(
            periode=periode,
            total_lignes=max(0, len(lignes) - 3),
            erreurs=erreurs,
            avertissements=avertissements,
            pret=not erreurs and not avertissements,
        )

    async def importer(self, session: AsyncSession, contenu: bytes, periode: int, ignorer_salaires_zero: bool) -> int:
        analyse = await self.analyser(session, contenu, periode)
        if analyse.erreurs or (analyse.avertissements and not ignorer_salaires_zero):
            raise ValueError("L'analyse n'est pas prête : corrigez les erreurs et confirmez les avertissements.")
        feuille = load_workbook(BytesIO(contenu), read_only=True, data_only=True).active
        lignes = cast(list[list[Any]], [list(x) for x in feuille.iter_rows(values_only=True)]) if feuille else []
        action = self._auditeur.auditer(session, "PAIE_IMPORT", TypeOperation.CREATE, "Paie")
        async with session.begin(), action:
            employees = {x.cin.strip().upper(): x for x in (await session.execute(select(Employee))).scalars()}
            fonctions = {x.libelle.strip().upper(): x.id for x in (await session.execute(select(Fonction))).scalars()}
            chantiers = {x.code.strip().upper(): x.id for x in (await session.execute(select(Chantier))).scalars()}
            equipes = {x.code.strip().upper(): x.id for x in (await session.execute(select(Equipe))).scalars()}
            for ligne in lignes[3:]:
                cin = str(ligne[2]).strip().upper()
                employe = employees[cin]
                existe = (
                    await session.execute(
                        select(Paie.id).where(Paie.employee_id == employe.id, Paie.periode == periode)
                    )
                ).scalar_one_or_none()
                if existe is not None:
                    raise ValueError(f"Bulletin déjà existant pour {cin} et {periode}")
                equipe = equipes.get(str(ligne[5]).strip().upper()) if len(ligne) > 5 and ligne[5] else None
                session.add(
                    Paie(
                        employee_id=employe.id,
                        periode=periode,
                        fonction_id=fonctions[str(ligne[3]).strip().upper()],
                        chantier_id=chantiers[str(ligne[4]).strip().upper()],
                        equipe_id=equipe,
                        nombre_jours_travailles=Decimal(str(ligne[6] or 0)),
                        jours_recuperation_ouvrable=Decimal(str(ligne[7]))
                        if len(ligne) > 7 and ligne[7] is not None
                        else None,
                        jours_recuperation_dimanche=Decimal(str(ligne[8]))
                        if len(ligne) > 8 and ligne[8] is not None
                        else None,
                        salaire_mensuel=Decimal(str(ligne[9] or 0)),
                        prime_roulage_ordinaire=Decimal(str(ligne[10]))
                        if len(ligne) > 10 and ligne[10] is not None
                        else None,
                        prime_roulage_dimanche=Decimal(str(ligne[11]))
                        if len(ligne) > 11 and ligne[11] is not None
                        else None,
                        salaire_total=Decimal(str(ligne[12] or 0)),
                        observation=str(ligne[13]) if len(ligne) > 13 and ligne[13] is not None else None,
                    )
                )
            await session.flush()
        return max(0, len(lignes) - 3)

    async def corriger(self, session: AsyncSession, corrections: list[PaieImportCorrection]) -> int:
        action = self._auditeur.auditer(session, "PAIE_IMPORT_CORRECTION", TypeOperation.UPDATE, "Employee")
        async with session.begin(), action:
            total = 0
            for correction in corrections:
                employe = await session.get(Employee, correction.employee_id)
                if employe is None:
                    raise ValueError(f"Employé introuvable : {correction.employee_id}")
                if correction.nom_prenom is not None:
                    employe.nom_prenom = correction.nom_prenom.strip()
                if correction.fonction_id is not None:
                    employe.fonction_id = correction.fonction_id
                if correction.chantier_id is not None:
                    employe.chantier_id = correction.chantier_id
                if correction.equipe_id is not None:
                    employe.equipe_id = correction.equipe_id
                if correction.salaire is not None:
                    employe.salaire = correction.salaire
                if correction.type_salaire is not None:
                    employe.type_salaire = TypeSalaire(correction.type_salaire)
                total += 1
            await session.flush()
        return total
