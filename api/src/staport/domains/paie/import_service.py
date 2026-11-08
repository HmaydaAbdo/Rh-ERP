import asyncio
from collections.abc import Callable
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any, cast

from openpyxl import Workbook, load_workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.montant import arrondir_montant
from staport.domains.employee.models import Employee, EmployeeSortie, EmployeeStatut, TypeSalaire
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .exceptions import ErreurImportPaie
from .models import Paie
from .observation import est_stc_ou_sortie
from .periode import afficher_periode
from .schemas import (
    PaieImportAnalyse,
    PaieImportChamp,
    PaieImportChantierCloture,
    PaieImportCinInconnu,
    PaieImportControlePeriode,
    PaieImportCorrections,
    PaieImportDecisionsEquipe,
    PaieImportDepart,
    PaieImportDeparts,
    PaieImportEcart,
    PaieImportErreur,
    PaieImportResult,
    PaieImportRetour,
)


def lire_lignes_paie(contenu: bytes) -> list[tuple[int, list[Any]]]:
    try:
        classeur = load_workbook(BytesIO(contenu), read_only=True, data_only=True)
    except Exception as erreur:  # openpyxl lève des types variés (BadZipFile, InvalidFileException…)
        raise ErreurImportPaie(
            "Fichier Excel illisible : le fichier n'est pas un classeur Excel (.xlsx) valide."
        ) from erreur
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


MOTIF_ABSENT_DU_FICHIER = "Absent du fichier"
SEUIL_CONTENU_IDENTIQUE = 0.9
PERIODES_COMPAREES = 3


def montant_ligne(ligne: list[Any], index: int) -> Decimal | None:
    """Montant d'une cellule, arrondi à l'entier (règle commune des montants) ; `None` si vide ou illisible."""
    valeur = ligne[index] if len(ligne) > index else None
    if valeur is None:
        return None
    try:
        nombre = Decimal(str(valeur).strip())
    except InvalidOperation, ValueError:
        return None
    return arrondir_montant(nombre) if nombre.is_finite() else None


def _nombre_ligne(ligne: list[Any], index: int) -> Decimal | None:
    valeur = ligne[index] if len(ligne) > index else None
    if valeur is None:
        return None
    try:
        nombre = Decimal(str(valeur).strip())
    except InvalidOperation, ValueError:
        return None
    return nombre.normalize() if nombre.is_finite() else None


def signature_ligne(ligne: list[Any]) -> tuple[Any, ...]:
    """Ce qui fait la paie d'un employé : jours, récupérations, salaire, primes, total et observation."""
    observation = str(ligne[10]).strip().lower() if len(ligne) > 10 and ligne[10] is not None else ""
    return (
        _nombre_ligne(ligne, 3),
        _nombre_ligne(ligne, 4),
        _nombre_ligne(ligne, 5),
        montant_ligne(ligne, 6),
        montant_ligne(ligne, 7),
        montant_ligne(ligne, 8),
        montant_ligne(ligne, 9),
        observation,
    )


def departs_et_retours(
    lignes: list[tuple[int, list[Any]]], employees: dict[str, Employee], numeros_en_erreur: set[int]
) -> tuple[list[PaieImportDepart], list[PaieImportRetour]]:
    """STC et sorties du fichier, retours des inactifs présents, puis actifs absents du fichier (parité `examiner`)."""
    departs: list[PaieImportDepart] = []
    retours: list[PaieImportRetour] = []
    cins_du_fichier = {str(ligne[2]).strip().upper() for _, ligne in lignes if len(ligne) > 2 and ligne[2] is not None}
    for numero, ligne in lignes:
        cin = str(ligne[2]).strip().upper() if len(ligne) > 2 and ligne[2] is not None else None
        employe = employees.get(cin) if cin is not None and numero not in numeros_en_erreur else None
        if employe is None:
            continue
        observation = str(ligne[10]) if len(ligne) > 10 and ligne[10] is not None else None
        if est_stc_ou_sortie(observation):
            motif = "STC" if cast(str, observation).strip().lower() == "stc" else "Sortie"
            departs.append(
                PaieImportDepart(employe_id=employe.id, cin=employe.cin, nom_prenom=employe.nom_prenom, motif=motif)
            )
        elif employe.statut == EmployeeStatut.INACTIF:
            retours.append(PaieImportRetour(employe_id=employe.id, cin=employe.cin, nom_prenom=employe.nom_prenom))
    absents = sorted(
        (
            e
            for e in employees.values()
            if e.statut == EmployeeStatut.ACTIF and e.cin.strip().upper() not in cins_du_fichier
        ),
        key=lambda e: e.nom_prenom.lower(),
    )
    departs.extend(PaieImportDepart(employe_id=e.id, cin=e.cin, nom_prenom=e.nom_prenom, motif=None) for e in absents)
    return departs, retours


class ServiceImportPaie:
    def __init__(self, auditeur: Auditeur, aujourd_hui: Callable[[], date] = date.today) -> None:
        self._auditeur = auditeur
        self._aujourd_hui = aujourd_hui

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

    def _controle_calendrier(self, periode: int) -> PaieImportControlePeriode | None:
        """Une paie n'existe qu'à la fin de son mois : la période courante ou future demande confirmation."""
        aujourd_hui = self._aujourd_hui()
        courant = aujourd_hui.year * 100 + aujourd_hui.month
        if periode < courant:
            return None
        return PaieImportControlePeriode(
            code="PERIODE_COURANTE_OU_FUTURE",
            message=(
                f"La période {afficher_periode(periode)} est le mois en cours ou un mois à venir : la paie d'un mois "
                "n'existe qu'à sa fin (en novembre, on importe la paie d'octobre). Confirmez si ce choix est voulu."
            ),
            periode_reference=None,
        )

    @staticmethod
    def _controle_doublon(
        lignes: list[tuple[int, list[Any]]],
        employees: dict[str, Employee],
        bulletins_voisins: dict[int, dict[int, tuple[Any, ...]]],
    ) -> PaieImportControlePeriode | None:
        """Le fichier reprend (presque) à l'identique les bulletins d'un autre mois : même fichier importé deux fois."""
        if not lignes:
            return None
        for autre in sorted(bulletins_voisins, reverse=True):
            bulletins = bulletins_voisins[autre]
            identiques = 0
            for _, ligne in lignes:
                cin = str(ligne[2]).strip().upper() if len(ligne) > 2 and ligne[2] is not None else None
                employe = employees.get(cin) if cin else None
                if employe is not None and bulletins.get(employe.id) == signature_ligne(ligne):
                    identiques += 1
            if identiques / len(lignes) >= SEUIL_CONTENU_IDENTIQUE:
                return PaieImportControlePeriode(
                    code="CONTENU_DEJA_IMPORTE",
                    message=(
                        f"{identiques} bulletin(s) sur {len(lignes)} sont identiques à ceux de "
                        f"{afficher_periode(autre)} "
                        "(jours, salaires, primes, total, observation) : ce fichier semble déjà importé. Confirmez "
                        "seulement s'il s'agit bien d'un autre mois."
                    ),
                    periode_reference=autre,
                )
        return None

    async def analyser(self, session: AsyncSession, contenu: bytes, periode: int) -> PaieImportAnalyse:
        erreurs: list[PaieImportErreur] = []
        avertissements: list[PaieImportErreur] = []
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
            autres_periodes = list(
                (
                    await session.execute(
                        select(Paie.periode)
                        .where(Paie.periode != periode)
                        .distinct()
                        .order_by(Paie.periode.desc())
                        .limit(PERIODES_COMPAREES)
                    )
                ).scalars()
            )
            bulletins_voisins: dict[int, dict[int, tuple[Any, ...]]] = {}
            if autres_periodes:
                for b in (
                    await session.execute(
                        select(
                            Paie.periode,
                            Paie.employee_id,
                            Paie.nombre_jours_travailles,
                            Paie.jours_recuperation_ouvrable,
                            Paie.jours_recuperation_dimanche,
                            Paie.salaire_mensuel,
                            Paie.prime_roulage_ordinaire,
                            Paie.prime_roulage_dimanche,
                            Paie.salaire_total,
                            Paie.observation,
                        ).where(Paie.periode.in_(autres_periodes))
                    )
                ).all():
                    bulletins_voisins.setdefault(b[0], {})[b[1]] = signature_ligne([None, None, None, *b[2:]])
            fonctions_par_id = {x.id: x.libelle for x in fonctions_lues}
            chantiers_par_id = {x.id: x for x in chantiers_lus}
            equipes_par_id = {x.id: x.code for x in equipes_lues}
        # La lecture du classeur occupe le processeur : dans un fil, la boucle d'événements reste libre (KAN-233).
        lignes = await asyncio.to_thread(lire_lignes_paie, contenu)
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
                if (
                    not cin
                ):  # un CIN renseigné mais inconnu n'est pas une erreur : il rejoint `cinInconnus` (comme Spring)
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero, cin=cin, nom_prenom=nom, champ="cin", valeur=cin, raison="CIN inconnu"
                        )
                    )
                if cin:
                    salaire_inconnu = montant_ligne(ligne, 6)
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
                actif = employe.statut != EmployeeStatut.INACTIF  # un retour est réactivé par l'import
                if actif and chantier_id is not None and chantier_id != employe.chantier_id:
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
                if actif and equipe_id is not None and equipe_id != employe.equipe_id:
                    equipe_actuelle = equipes_par_id.get(employe.equipe_id) if employe.equipe_id is not None else None
                    champs.append(PaieImportChamp(champ="equipe", base=equipe_actuelle, fichier=equipe))
                if actif and not equipe and employe.equipe_id is not None:
                    avertissements.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ="equipe",
                            valeur=None,
                            raison=(
                                f"équipe vide dans le fichier alors que la fiche porte "
                                f"« {equipes_par_id.get(employe.equipe_id)} » : conserver ou vider ?"
                            ),
                            avertissement=True,
                            code_avertissement="EQUIPE_VIDE",
                            employe_id=employe.id,
                        )
                    )
                salaire_fichier = montant_ligne(ligne, 6)
                if salaire_fichier is not None and employe.salaire != salaire_fichier:
                    champs.append(
                        PaieImportChamp(
                            champ="salaire", base=str(employe.salaire), fichier=str(float(salaire_fichier))
                        )  # Spring : Double.toString
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
                hors_limites = not nombre.is_finite() or nombre < 0 or nombre >= Decimal("99999999.995")
                if hors_limites:
                    erreurs.append(
                        PaieImportErreur(
                            numero_ligne=numero,
                            cin=cin,
                            nom_prenom=nom,
                            champ=champ,
                            valeur=str(valeur),
                            raison="montant attendu entre 0 et 9 999 999 999",
                        )
                    )
                    continue
                nombre = arrondir_montant(nombre)  # règle commune : entier de dirham, arrondi automatique
                connu = employees.get(cin.upper()) if cin else None
                if champ == "salaireMensuel" and nombre == 0 and not (connu and connu.salaire != 0):
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
                                raison=(
                                    f"salaire différent de la dernière paie (ancien salaire : {employe.salaire}) : "
                                    "confirmation wizard requise"
                                ),
                                avertissement=True,
                                code_avertissement="SALAIRE_DIFFERENT",
                                employe_id=employe.id,
                                salaire_actuel=str(employe.salaire),
                                type_salaire_propose="JOURNALIER" if nombre <= 500 else "MENSUEL",
                            )
                        )
        departs, retours = departs_et_retours(lignes, employees, {erreur.numero_ligne for erreur in erreurs})
        controles_periode: list[PaieImportControlePeriode] = []
        controle_calendrier = self._controle_calendrier(periode)
        if controle_calendrier is not None:
            controles_periode.append(controle_calendrier)
        controle_doublon = self._controle_doublon(lignes, employees, bulletins_voisins)
        if controle_doublon is not None:
            controles_periode.append(controle_doublon)
        return PaieImportAnalyse(
            periode=periode,
            total_lignes=len(lignes),
            erreurs=erreurs,
            avertissements=avertissements,
            chantiers_clotures=list(clotures.values()),
            cin_inconnus=cin_inconnus,
            ecarts=ecarts,
            departs=departs,
            retours=retours,
            controles_periode=controles_periode,
            pret=not erreurs and not avertissements and not ecarts and not controles_periode,
        )

    async def importer(
        self,
        session: AsyncSession,
        contenu: bytes,
        periode: int,
        ignorer_salaires_zero: bool,
        departs_confirmes: PaieImportDeparts,
        decisions_equipe: PaieImportDecisionsEquipe | None = None,
        periode_confirmee: bool = False,
    ) -> PaieImportResult:
        analyse = await self.analyser(session, contenu, periode)
        decisions = {d.employe_id: d.action for d in (decisions_equipe or PaieImportDecisionsEquipe()).decisions}
        avertissements_non_confirmes = [
            avertissement
            for avertissement in analyse.avertissements
            if not (
                (avertissement.code_avertissement == "SALAIRE_ZERO" and ignorer_salaires_zero)
                or (avertissement.code_avertissement == "EQUIPE_VIDE" and avertissement.employe_id in decisions)
            )
        ]
        if analyse.erreurs or analyse.ecarts or analyse.cin_inconnus or analyse.chantiers_clotures:
            raise ErreurImportPaie(
                f"Le fichier n'est pas prêt : {len(analyse.erreurs)} erreur(s), {len(analyse.chantiers_clotures)} "
                f"chantier(s) clôturé(s), {len(analyse.cin_inconnus)} CIN inconnu(s), {len(analyse.ecarts)} "
                "écart(s) avec les fiches. Réanalysez-le."
            )
        if avertissements_non_confirmes:
            raise ErreurImportPaie("L'analyse n'est pas prête : confirmez les avertissements.")
        if analyse.controles_periode and not periode_confirmee:
            raise ErreurImportPaie(
                "La période demande confirmation : " + " ".join(c.message for c in analyse.controles_periode)
            )
        proposes = {depart.employe_id: depart for depart in analyse.departs}
        motifs: dict[int, str] = {}
        for depart in departs_confirmes.departs:
            propose = proposes.get(depart.employe_id)
            if propose is None:
                raise ErreurImportPaie(
                    f"Ce départ n'a pas été proposé par l'analyse du fichier : employé {depart.employe_id}"
                )
            saisi = depart.motif.strip()
            if saisi:
                motifs[depart.employe_id] = saisi
            elif propose.motif is None and depart.sans_motif:
                motifs[depart.employe_id] = MOTIF_ABSENT_DU_FICHIER
            else:
                raise ErreurImportPaie(
                    f"Le départ de l'employé {depart.employe_id} demande un motif"
                    + (" ou la confirmation explicite « sans motif »." if propose.motif is None else ".")
                )
        # La lecture du classeur occupe le processeur : dans un fil, la boucle d'événements reste libre (KAN-233).
        lignes = await asyncio.to_thread(lire_lignes_paie, contenu)
        action = self._auditeur.auditer(session, "PAIE_IMPORT", TypeOperation.CREATE, "Paie")
        async with session.begin(), action as audit_import:
            employees = {x.cin.strip().upper(): x for x in (await session.execute(select(Employee))).scalars()}
            fonctions = {x.libelle.strip().upper(): x.id for x in (await session.execute(select(Fonction))).scalars()}
            chantiers = {x.code.strip().upper(): x.id for x in (await session.execute(select(Chantier))).scalars()}
            equipes = {x.code.strip().upper(): x.id for x in (await session.execute(select(Equipe))).scalars()}
            employes_mis_a_jour = 0
            retours_cins = {retour.cin.strip().upper() for retour in analyse.retours}
            for _, ligne in lignes:
                cin = str(ligne[2]).strip().upper()
                employe = employees[cin]
                existe = (
                    await session.execute(
                        select(Paie.id).where(Paie.employee_id == employe.id, Paie.periode == periode)
                    )
                ).scalar_one_or_none()
                if existe is not None:
                    raise ErreurImportPaie(f"Bulletin déjà existant pour {cin} et {periode}")
                equipe = equipes.get(str(ligne[12]).strip().upper()) if len(ligne) > 12 and ligne[12] else None
                fonction_id = fonctions[str(ligne[1]).strip().upper()]
                chantier_id = chantiers[str(ligne[11]).strip().upper()]
                nom = str(ligne[0]).strip() if ligne[0] is not None else ""
                changement = False
                if cin in retours_cins:  # statut et affectations changent sans requête intercalée (contrainte V33)
                    if employe.type_salaire is None:
                        raise ErreurImportPaie(
                            f"Le type de salaire de {employe.nom_prenom} doit être renseigné avant son retour"
                        )
                    employe.salaire = montant_ligne(ligne, 6) or Decimal(0)
                    employe.statut = EmployeeStatut.ACTIF
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
                elif equipe is None and decisions.get(employe.id) == "VIDER" and employe.equipe_id is not None:
                    employe.equipe_id = None
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
                        salaire_mensuel=montant_ligne(ligne, 6) or Decimal(0),
                        prime_roulage_ordinaire=montant_ligne(ligne, 7),
                        prime_roulage_dimanche=montant_ligne(ligne, 8),
                        salaire_total=montant_ligne(ligne, 9) or Decimal(0),
                        observation=str(ligne[10]) if len(ligne) > 10 and ligne[10] is not None else None,
                    )
                )
            par_id = {x.id: x for x in employees.values()}
            for depart in departs_confirmes.departs:
                employe = par_id[depart.employe_id]
                existe = (
                    await session.execute(
                        select(EmployeeSortie.id).where(
                            EmployeeSortie.employee_id == employe.id, EmployeeSortie.periode == periode
                        )
                    )
                ).scalar_one_or_none()
                if existe is not None:
                    raise ErreurImportPaie(
                        f"Un départ est déjà enregistré pour cet employé ce mois-ci : {afficher_periode(periode)}"
                    )
                session.add(EmployeeSortie(employee_id=employe.id, periode=periode, motif=motifs[depart.employe_id]))
                employe.statut = EmployeeStatut.INACTIF
                employe.chantier_id = None
                employe.equipe_id = None
            audit_import.nombre_elements = len(lignes)
            audit_import.perimetre["employes_mis_a_jour"] = employes_mis_a_jour
            audit_import.perimetre["departs"] = len(departs_confirmes.departs)
            audit_import.perimetre["retours"] = len(analyse.retours)
            await session.flush()
        return PaieImportResult(
            periode=afficher_periode(periode),
            crees=len(lignes),
            departs=len(departs_confirmes.departs),
            retours=len(analyse.retours),
        )

    async def corriger_et_reanalyser(
        self, session: AsyncSession, contenu: bytes, periode: int, corrections: PaieImportCorrections
    ) -> PaieImportAnalyse:
        """Aligne les fiches citées par le fichier joint, puis recalcule l'analyse."""
        analyse = await self.analyser(session, contenu, periode)
        # La lecture du classeur occupe le processeur : dans un fil, la boucle d'événements reste libre (KAN-233).
        lignes = await asyncio.to_thread(lire_lignes_paie, contenu)
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
                raise ErreurImportPaie(f"La ligne Excel {numero} contient des erreurs à corriger avant le wizard.")
        async with session.begin():
            employees = {x.cin.strip().upper(): x for x in (await session.execute(select(Employee))).scalars()}
            fonctions = {x.libelle.strip().upper(): x.id for x in (await session.execute(select(Fonction))).scalars()}
            chantiers = {x.code.strip().upper(): x.id for x in (await session.execute(select(Chantier))).scalars()}
            equipes = {x.code.strip().upper(): x.id for x in (await session.execute(select(Equipe))).scalars()}
            par_id = {employe.id: (cin, ligne) for cin, ligne in par_cin.items() if (employe := employees.get(cin))}
            if len(ids) != len(set(ids)) or any(
                identifiant not in par_id or identifiant not in employes_proposes for identifiant in ids
            ):
                raise ErreurImportPaie(
                    "Chaque correction doit viser une fiche proposée par l'analyse du fichier joint."
                )
            par_numero = {numero: ligne for numero, ligne in lignes}
            numeros_crees = [correction.numero_ligne for correction in corrections.creer]
            if len(numeros_crees) != len(set(numeros_crees)):
                raise ErreurImportPaie("Une seule création est permise par ligne proposée par l'analyse.")
            if any(numero not in lignes_proposees for numero in numeros_crees):
                raise ErreurImportPaie(
                    "Chaque création doit viser un CIN inconnu proposé par l'analyse du fichier joint."
                )
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
                            raise ErreurImportPaie(
                                "La correction référence une Fonction, un Chantier ou une Équipe absente."
                            )
                        employe.nom_prenom = str(ligne[0]).strip()
                        employe.fonction_id = fonction
                        employe.chantier_id = chantier
                        if equipe is not None:
                            employe.equipe_id = equipe
                        salaire = montant_ligne(ligne, 6) or Decimal(0)
                        if employe.salaire != salaire:
                            if correction.type_salaire is None:
                                raise ErreurImportPaie(
                                    "Le salaire différent exige le choix explicite d'un type de salaire."
                                )
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
                            raise ErreurImportPaie(
                                "La création doit viser une ligne proposée par l'analyse du fichier joint."
                            )
                        cin = str(ligne[2]).strip()
                        if cin.upper() in employees:
                            raise ErreurImportPaie("Le CIN de cette ligne n'est plus inconnu.")
                        fonction = fonctions.get(str(ligne[1]).strip().upper()) if ligne[1] else None
                        chantier = chantiers.get(str(ligne[11]).strip().upper()) if ligne[11] else None
                        equipe = equipes.get(str(ligne[12]).strip().upper()) if ligne[12] else None
                        if fonction is None or chantier is None or (ligne[12] and equipe is None):
                            raise ErreurImportPaie(
                                "La création référence une Fonction, un Chantier ou une Équipe absente."
                            )
                        employe = Employee(
                            nom_prenom=str(ligne[0]).strip(),
                            cin=cin,
                            date_naissance=correction.date_naissance,
                            date_embauche=correction.date_embauche,
                            fonction_id=fonction,
                            chantier_id=chantier,
                            equipe_id=equipe,
                            salaire=montant_ligne(ligne, 6) or Decimal(0),
                            type_salaire=TypeSalaire(correction.type_salaire),
                        )
                        session.add(employe)
                        employees[cin.upper()] = employe
                    journal.nombre_elements = len(corrections.creer)
            await session.flush()
        return await self.analyser(session, contenu, periode)
