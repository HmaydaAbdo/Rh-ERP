from io import BytesIO

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .schemas import PaieImportAnalyse, PaieImportErreur


class ServiceImportPaie:
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
