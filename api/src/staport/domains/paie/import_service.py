from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any, cast

from openpyxl import Workbook, load_workbook
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.employee.models import Employee, TypeSalaire
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .models import Paie
from .periode import afficher_periode, mois_suivant
from .schemas import (
    PaieImportAnalyse,
    PaieImportChamp,
    PaieImportChantierCloture,
    PaieImportCinInconnu,
    PaieImportCorrections,
    PaieImportEcart,
    PaieImportErreur,
)


def lire_lignes_paie(contenu: bytes) -> list[tuple[int, list[Any]]]:
    classeur = load_workbook(BytesIO(contenu), read_only=True, data_only=True)
    try:
        if not classeur.worksheets:
            return []
        feuille = classeur.worksheets[0]
        lignes: list[tuple[int, list[Any]]] = []
        for numero, cellules in enumerate(feuille.iter_rows(min_row=4, values_only=True), start=4):
            ligne = cast(list[Any], list(cellules))
            if any(valeur is not None and str(valeur).strip() for valeur in ligne):
                lignes.append((numero, ligne))
        return lignes
    finally:
        classeur.close()


class ServiceImportPaie:
    def __init__(self, auditeur: Auditeur) -> None:
        self._auditeur = auditeur

    def generer_modele(self) -> BytesIO:
        classeur = Workbook()
        feuille = classeur.active
        if feuille is None:
            raise RuntimeError("Feuille du modèle de paie indisponible")
        feuille.title = "Paie"
        feuille.append([])
        feuille.append([])
        feuille.append(
            [
                "Nom & prénom",
                "Fonction",
                "CIN",
                "Nbre Jrs",
                "J.R.O",
                "J.R.D",
                "Salaire",
                "Prime RO",
                "Prime RD",
                "Total",
                "Observation",
                "Chantier",
                "Équipe",
            ]
        )
        for index in range(13):
            feuille.column_dimensions[chr(65 + index)].width = 4500 / 256
        sortie = BytesIO()
        classeur.save(sortie)
        sortie.seek(0)
        return sortie

    async def analyser(self, session: AsyncSession, contenu: bytes, periode: int) -> PaieImportAnalyse:
        erreurs: list[PaieImportErreur] = []
        avertissements: list[PaieImportErreur] = []
        lignes = lire_lignes_paie(contenu)
        cins_vus: set[str] = set()
        clotures: dict[int, PaieImportChantierCloture] = {}
        cin_inconnus: list[PaieImportCinInconnu] = []
        ecarts: list[PaieImportEcart] = []
        async with session.begin():
            employees = {x.cin.strip().upper(): x for x in (await session.execute(select(Employee))).scalars()}
            fonctions_lues = list((await session.execute(select(Fonction))).scalars())
            fonctions = {x.libelle.strip().upper() for x in fonctions_lues}
            chantiers_lus = list((await session.execute(select(Chantier))).scalars())
            chantiers = {x.code.strip().upper(): x for x in chantiers_lus}
            equipes_lues = list((await session.execute(select(Equipe))).scalars())
            equipes = {x.code.strip().upper() for x in equipes_lues}
            employes_avec_bulletin = set(
                (await session.execute(select(Paie.employee_id).where(Paie.periode == periode))).scalars()
            )
            dernier_mois = (await session.execute(select(func.max(Paie.periode)))).scalar_one_or_none()
            fonctions_par_id = {x.id: x.libelle for x in fonctions_lues}
            chantiers_par_id = {x.id: x for x in chantiers_lus}
            equipes_par_id = {x.id: x.code for x in equipes_lues}
        periode_invalide = dernier_mois is not None and periode != mois_suivant(dernier_mois)
        for numero, ligne in lignes:
            nom = str(ligne[0]).strip() if len(ligne) > 0 and ligne[0] is not None else None
            fonction = str(ligne[1]).strip() if len(ligne) > 1 and ligne[1] is not None else None
            cin = str(ligne[2]).strip() if len(ligne) > 2 and ligne[2] is not None else None
            chantier = str(ligne[11]).strip() if len(ligne) > 11 and ligne[11] is not None else None
            equipe = str(ligne[12]).strip() if len(ligne) > 12 and ligne[12] is not None else None
            observation = str(ligne[10]) if len(ligne) > 10 and ligne[10] is not None else None
            for champ, valeur, limite in (("nomPrenom", nom, 150), ("cin", cin, 30), ("observation", observation, 255)):
                if valeur is not None and len(valeur) > limite:
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur=valeur,
                            raison=f"longueur maximale de {limite} caractères dépassée",
                        )
                    )
            if cin is None or cin.upper() not in employees:
                erreurs.append(
                    PaieImportErreur(
                        numero_ligne=numero, cin=cin, nom_prenom=nom, champ="cin", valeur=cin, raison="CIN inconnu"
                    )
                )
                if cin:
                    salaire_brut = ligne[6] if len(ligne) > 6 else None
                    try:
                        salaire_inconnu = Decimal(str(salaire_brut)) if salaire_brut is not None else None
                    except InvalidOperation:
                        salaire_inconnu = None
                    cin_inconnus.append(
                        PaieImportCinInconnu(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            fonction=fonction,
                            chantier=chantier,
                            equipe=equipe,
                            salaire=salaire_inconnu,
                        )
                    )
            if cin:
                cle_cin = cin.upper()
                if cle_cin in cins_vus:
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ="cin",
                            valeur=cin,
                            raison="CIN en doublon dans le fichier",
                        )
                    )
                cins_vus.add(cle_cin)
            if cin and cin.upper() in employees and employees[cin.upper()].id in employes_avec_bulletin:
                erreurs.append(
                    PaieImportErreur(
                        numero_ligne=numero,
                        cin=cin,
                        nom_prenom=nom,
                        champ="bulletin",
                        valeur=str(periode),
                        raison=(
                            "bulletin déjà existant pour cet employé et cette période : écrasement automatique refusé"
                        ),
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
            elif chantier and not chantiers[chantier.upper()].actif:
                chantier_entite = chantiers[chantier.upper()]
                if chantier_entite.id not in clotures:
                    clotures[chantier_entite.id] = PaieImportChantierCloture(
                        chantier_id=chantier_entite.id,
                        code=chantier_entite.code,
                        designation=chantier_entite.designation,
                        lignes=[],
                    )
                clotures[chantier_entite.id].lignes.append(numero)
                erreurs.append(
                    PaieImportErreur(
                        numero_ligne=numero,
                        cin=cin,
                        nom_prenom=nom,
                        champ="chantier",
                        valeur=chantier,
                        raison="chantier clôturé : rouvrir le chantier avant l'import",
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
            if cin and cin.upper() in employees:
                employe = employees[cin.upper()]
                champs: list[PaieImportChamp] = []
                if nom and employe.nom_prenom != nom:
                    champs.append(PaieImportChamp(champ="nomPrenom", base=employe.nom_prenom, fichier=nom))
                fonction_id = next(
                    (
                        ident
                        for ident, libelle in fonctions_par_id.items()
                        if libelle.strip().upper() == (fonction or "").upper()
                    ),
                    None,
                )
                if fonction_id is not None and fonction_id != employe.fonction_id:
                    champs.append(
                        PaieImportChamp(
                            champ="fonction", base=fonctions_par_id.get(employe.fonction_id), fichier=fonction
                        )
                    )
                chantier_id = next(
                    (
                        ident
                        for ident, entite in chantiers_par_id.items()
                        if entite.code.strip().upper() == (chantier or "").upper()
                    ),
                    None,
                )
                if chantier_id is not None and chantier_id != employe.chantier_id:
                    chantier_actuel = (
                        chantiers_par_id.get(employe.chantier_id) if employe.chantier_id is not None else None
                    )
                    champs.append(
                        PaieImportChamp(
                            champ="chantier",
                            base=chantier_actuel.code if chantier_actuel else None,
                            fichier=chantier,
                        )
                    )
                equipe_id = (
                    next(
                        (
                            ident
                            for ident, code in equipes_par_id.items()
                            if code.strip().upper() == (equipe or "").upper()
                        ),
                        None,
                    )
                    if equipe
                    else None
                )
                if equipe_id is not None and equipe_id != employe.equipe_id:
                    equipe_actuelle = equipes_par_id.get(employe.equipe_id) if employe.equipe_id is not None else None
                    champs.append(PaieImportChamp(champ="equipe", base=equipe_actuelle, fichier=equipe))
                try:
                    salaire_fichier = Decimal(str(ligne[6])) if len(ligne) > 6 and ligne[6] is not None else None
                except InvalidOperation:
                    salaire_fichier = None
                if salaire_fichier is not None and employe.salaire != salaire_fichier:
                    champs.append(
                        PaieImportChamp(champ="salaire", base=str(employe.salaire), fichier=str(salaire_fichier))
                    )
                if champs:
                    ecarts.append(
                        PaieImportEcart(
                            employe_id=employe.id,
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom or employe.nom_prenom,
                            champs=champs,
                            type_salaire=TypeSalaire(employe.type_salaire).value if employe.type_salaire else None,
                        )
                    )
            for index, champ in (
                (1, "fonction"),
                (3, "nombreJoursTravailles"),
                (6, "salaireMensuel"),
                (9, "salaireTotal"),
                (11, "chantier"),
            ):
                valeur_obligatoire = ligne[index] if len(ligne) > index else None
                if valeur_obligatoire is None or not str(valeur_obligatoire).strip():
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur=None,
                            raison="champ obligatoire absent",
                        )
                    )
            for index, champ in (
                (3, "nombreJoursTravailles"),
                (4, "joursRecuperationOuvrable"),
                (5, "joursRecuperationDimanche"),
            ):
                valeur = ligne[index] if len(ligne) > index else None
                if valeur is None:
                    continue
                try:
                    nombre = Decimal(str(valeur).strip())
                except InvalidOperation, ValueError:
                    nombre = None
                exposant = nombre.as_tuple().exponent if nombre is not None else None
                if (
                    nombre is None
                    or not nombre.is_finite()
                    or nombre < 0
                    or nombre > Decimal("999.99")
                    or (isinstance(exposant, int) and exposant < -2)
                ):
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur=str(valeur),
                            raison="jours attendus entre 0 et 999,99 avec deux décimales au plus",
                        )
                    )
            for index, champ in (
                (6, "salaireMensuel"),
                (7, "primeRoulageOrdinaire"),
                (8, "primeRoulageDimanche"),
                (9, "salaireTotal"),
            ):
                valeur = ligne[index] if len(ligne) > index else None
                if valeur is None:
                    continue
                try:
                    nombre = Decimal(str(valeur).strip())
                except InvalidOperation, ValueError:
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
                exposant = nombre.as_tuple().exponent
                hors_limites = (
                    not nombre.is_finite()
                    or nombre < 0
                    or nombre > Decimal("99999999.99")
                    or (isinstance(exposant, int) and exposant < -2)
                )
                if hors_limites:
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur=str(valeur),
                            raison="montant attendu entre 0 et 99 999 999,99 avec deux décimales au plus",
                        )
                    )
                    continue
                if champ == "salaireMensuel" and nombre == 0:
                    avertissements.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur="0",
                            raison="salaire nul : cliquer sur « Ignorer et conserver 0 »",
                            avertissement=True,
                            code_avertissement="SALAIRE_ZERO",
                            type_salaire_propose="JOURNALIER",
                        )
                    )
                if champ == "salaireMensuel" and cin and cin.upper() in employees:
                    employe = employees[cin.upper()]
                    if employe.salaire != nombre:
                        avertissements.append(
                            PaieImportErreur(
                                numero_ligne=numero,
                                cin=cin,
                                nom_prenom=nom,
                                champ=champ,
                                valeur=str(valeur),
                                raison="salaire différent de la dernière paie : confirmation wizard requise",
                                avertissement=True,
                                code_avertissement="SALAIRE_DIFFERENT",
                                type_salaire_propose="JOURNALIER" if nombre <= 500 else "MENSUEL",
                            )
                        )
        if periode_invalide and dernier_mois is not None and not any(erreur.champ == "bulletin" for erreur in erreurs):
            raise ValueError(
                f"Seul le mois {afficher_periode(mois_suivant(dernier_mois))} peut être importé : "
                f"le dernier mois de paie est {afficher_periode(dernier_mois)}."
            )
        return PaieImportAnalyse(
            periode=periode,
            total_lignes=len(lignes),
            erreurs=erreurs,
            avertissements=avertissements,
            chantiers_clotures=list(clotures.values()),
            cin_inconnus=cin_inconnus,
            ecarts=ecarts,
            departs=[],
            retours=[],
            pret=not erreurs and not avertissements and not ecarts,
        )

    async def importer(self, session: AsyncSession, contenu: bytes, periode: int, ignorer_salaires_zero: bool) -> int:
        analyse = await self.analyser(session, contenu, periode)
        avertissements_non_confirmes = [
            avertissement
            for avertissement in analyse.avertissements
            if avertissement.code_avertissement != "SALAIRE_ZERO" or not ignorer_salaires_zero
        ]
        if (
            analyse.erreurs
            or analyse.ecarts
            or analyse.cin_inconnus
            or analyse.chantiers_clotures
            or avertissements_non_confirmes
        ):
            raise ValueError("L'analyse n'est pas prête : corrigez les erreurs et confirmez les avertissements.")
        lignes = lire_lignes_paie(contenu)
        action = self._auditeur.auditer(session, "PAIE_IMPORT", TypeOperation.CREATE, "Paie")
        async with session.begin(), action as audit_import:
            employees = {x.cin.strip().upper(): x for x in (await session.execute(select(Employee))).scalars()}
            fonctions = {x.libelle.strip().upper(): x.id for x in (await session.execute(select(Fonction))).scalars()}
            chantiers = {x.code.strip().upper(): x.id for x in (await session.execute(select(Chantier))).scalars()}
            equipes = {x.code.strip().upper(): x.id for x in (await session.execute(select(Equipe))).scalars()}
            employes_mis_a_jour = 0
            for _, ligne in lignes:
                cin = str(ligne[2]).strip().upper()
                employe = employees[cin]
                existe = (
                    await session.execute(
                        select(Paie.id).where(Paie.employee_id == employe.id, Paie.periode == periode)
                    )
                ).scalar_one_or_none()
                if existe is not None:
                    raise ValueError(f"Bulletin déjà existant pour {cin} et {periode}")
                equipe = equipes.get(str(ligne[12]).strip().upper()) if len(ligne) > 12 and ligne[12] else None
                fonction_id = fonctions[str(ligne[1]).strip().upper()]
                chantier_id = chantiers[str(ligne[11]).strip().upper()]
                nom = str(ligne[0]).strip() if ligne[0] is not None else ""
                changement = False
                if nom and employe.nom_prenom != nom:
                    employe.nom_prenom = nom
                    changement = True
                if employe.fonction_id != fonction_id:
                    employe.fonction_id = fonction_id
                    changement = True
                if employe.chantier_id != chantier_id:
                    employe.chantier_id = chantier_id
                    changement = True
                if equipe is not None and employe.equipe_id != equipe:
                    employe.equipe_id = equipe
                    changement = True
                if changement:
                    employes_mis_a_jour += 1
                session.add(
                    Paie(
                        employee_id=employe.id,
                        periode=periode,
                        fonction_id=fonction_id,
                        chantier_id=chantier_id,
                        equipe_id=equipe,
                        nombre_jours_travailles=Decimal(str(ligne[3] or 0)),
                        jours_recuperation_ouvrable=Decimal(str(ligne[4]))
                        if len(ligne) > 4 and ligne[4] is not None
                        else None,
                        jours_recuperation_dimanche=Decimal(str(ligne[5]))
                        if len(ligne) > 5 and ligne[5] is not None
                        else None,
                        salaire_mensuel=Decimal(str(ligne[6] or 0)),
                        prime_roulage_ordinaire=Decimal(str(ligne[7]))
                        if len(ligne) > 7 and ligne[7] is not None
                        else None,
                        prime_roulage_dimanche=Decimal(str(ligne[8]))
                        if len(ligne) > 8 and ligne[8] is not None
                        else None,
                        salaire_total=Decimal(str(ligne[9] or 0)),
                        observation=str(ligne[10]) if len(ligne) > 10 and ligne[10] is not None else None,
                    )
                )
            audit_import.nombre_elements = len(lignes)
            audit_import.perimetre["employes_mis_a_jour"] = employes_mis_a_jour
            await session.flush()
        return len(lignes)

    async def corriger_et_reanalyser(
        self, session: AsyncSession, contenu: bytes, periode: int, corrections: PaieImportCorrections
    ) -> PaieImportAnalyse:
        """Aligne les fiches citées par le fichier joint, puis recalcule l'analyse."""
        analyse = await self.analyser(session, contenu, periode)
        lignes = lire_lignes_paie(contenu)
        par_cin = {
            str(ligne[2]).strip().upper(): ligne
            for _, ligne in lignes
            if len(ligne) > 2 and ligne[2] is not None and str(ligne[2]).strip()
        }
        ids = [correction.employe_id for correction in corrections.aligner]
        lignes_ecarts = {ecart.employe_id: ecart.numero_ligne for ecart in analyse.ecarts}
        employes_proposes = set(lignes_ecarts)
        lignes_proposees = {inconnu.numero_ligne for inconnu in analyse.cin_inconnus}
        lignes_creees = {correction.numero_ligne for correction in corrections.creer}
        lignes_alignees = {lignes_ecarts[identifiant] for identifiant in ids if identifiant in lignes_ecarts}
        for numero in lignes_alignees | lignes_creees:
            autres_erreurs = [
                erreur
                for erreur in analyse.erreurs
                if erreur.numero_ligne == numero and not (erreur.champ == "cin" and erreur.raison == "CIN inconnu")
            ]
            if autres_erreurs:
                raise ValueError(f"La ligne Excel {numero} contient des erreurs à corriger avant le wizard.")
        async with session.begin():
            employees = {x.cin.strip().upper(): x for x in (await session.execute(select(Employee))).scalars()}
            fonctions = {x.libelle.strip().upper(): x.id for x in (await session.execute(select(Fonction))).scalars()}
            chantiers = {x.code.strip().upper(): x.id for x in (await session.execute(select(Chantier))).scalars()}
            equipes = {x.code.strip().upper(): x.id for x in (await session.execute(select(Equipe))).scalars()}
            par_id = {employe.id: (cin, ligne) for cin, ligne in par_cin.items() if (employe := employees.get(cin))}
            if len(ids) != len(set(ids)) or any(
                identifiant not in par_id or identifiant not in employes_proposes for identifiant in ids
            ):
                raise ValueError("Chaque correction doit viser une fiche proposée par l'analyse du fichier joint.")
            par_numero = {numero: ligne for numero, ligne in lignes}
            numeros_crees = [correction.numero_ligne for correction in corrections.creer]
            if len(numeros_crees) != len(set(numeros_crees)):
                raise ValueError("Une seule création est permise par ligne proposée par l'analyse.")
            if any(numero not in lignes_proposees for numero in numeros_crees):
                raise ValueError("Chaque création doit viser un CIN inconnu proposé par l'analyse du fichier joint.")
            if corrections.aligner:
                action = self._auditeur.auditer(session, "PAIE_IMPORT_CORRECTION", TypeOperation.UPDATE, "Employee")
                async with action as journal:
                    for correction in corrections.aligner:
                        cin, ligne = par_id[correction.employe_id]
                        employe = employees[cin]
                        fonction = fonctions.get(str(ligne[1]).strip().upper()) if ligne[1] else None
                        chantier = (
                            chantiers.get(str(ligne[11]).strip().upper()) if len(ligne) > 11 and ligne[11] else None
                        )
                        equipe = equipes.get(str(ligne[12]).strip().upper()) if len(ligne) > 12 and ligne[12] else None
                        if fonction is None or chantier is None or (len(ligne) > 12 and ligne[12] and equipe is None):
                            raise ValueError("La correction référence une Fonction, un Chantier ou une Équipe absente.")
                        employe.nom_prenom = str(ligne[0]).strip()
                        employe.fonction_id = fonction
                        employe.chantier_id = chantier
                        if equipe is not None:
                            employe.equipe_id = equipe
                        salaire = Decimal(str(ligne[6]))
                        if employe.salaire != salaire:
                            if correction.type_salaire is None:
                                raise ValueError("Le salaire différent exige le choix explicite d'un type de salaire.")
                            employe.salaire = salaire
                            employe.type_salaire = TypeSalaire(correction.type_salaire)
                    journal.nombre_elements = len(corrections.aligner)
            if corrections.creer:
                action = self._auditeur.auditer(
                    session, "PAIE_IMPORT_CREATION_EMPLOYE", TypeOperation.CREATE, "Employee"
                )
                async with action as journal:
                    for correction in corrections.creer:
                        ligne = par_numero.get(correction.numero_ligne)
                        if ligne is None or len(ligne) <= 12:
                            raise ValueError(
                                "La création doit viser une ligne proposée par l'analyse du fichier joint."
                            )
                        cin = str(ligne[2]).strip()
                        if cin.upper() in employees:
                            raise ValueError("Le CIN de cette ligne n'est plus inconnu.")
                        fonction = fonctions.get(str(ligne[1]).strip().upper()) if ligne[1] else None
                        chantier = chantiers.get(str(ligne[11]).strip().upper()) if ligne[11] else None
                        equipe = equipes.get(str(ligne[12]).strip().upper()) if ligne[12] else None
                        if fonction is None or chantier is None or (ligne[12] and equipe is None):
                            raise ValueError("La création référence une Fonction, un Chantier ou une Équipe absente.")
                        employe = Employee(
                            nom_prenom=str(ligne[0]).strip(),
                            cin=cin,
                            date_naissance=correction.date_naissance,
                            date_embauche=correction.date_embauche,
                            fonction_id=fonction,
                            chantier_id=chantier,
                            equipe_id=equipe,
                            salaire=Decimal(str(ligne[6])),
                            type_salaire=TypeSalaire(correction.type_salaire),
                        )
                        session.add(employe)
                        employees[cin.upper()] = employe
                    journal.nombre_elements = len(corrections.creer)
            await session.flush()
        return await self.analyser(session, contenu, periode)
