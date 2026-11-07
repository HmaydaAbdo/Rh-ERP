from decimal import Decimal
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.audit.api import instantanes_suppression
from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page
from staport.domains.employee.exceptions import EmployeeIntrouvable
from staport.domains.employee.models import Employee, EmployeeStatut
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction
from staport.domains.heuresupp import ecouteur as ecouteur_heures_supp
from staport.domains.parametre.service import ServiceParametre

from . import historique, repository
from .analytique import construire_analytique
from .cartes import chantiers as construire_chantiers
from .cartes import periodes as construire_periodes
from .exceptions import (
    PaieDejaExistante,
    PaieGroupeModifie,
    PaieGroupeRestaurationConflit,
    PaieIntrouvable,
    PaieLiee,
    PeriodeInvalide,
    PeriodeObligatoire,
    ReferenceInvalide,
)
from .models import Paie
from .periode import afficher_periode
from .schemas import (
    PaieAnalytiqueReponse,
    PaieChantierOption,
    PaieChantierPeriode,
    PaieChantierResume,
    PaieCreationRequete,
    PaieEffectifMois,
    PaieEmployeeResume,
    PaieEquipeOption,
    PaieEquipeResume,
    PaieFonctionResume,
    PaieModificationRequete,
    PaieOptionsChantierRequete,
    PaieOptionsEquipeRequete,
    PaieParcoursIndicateurs,
    PaieParcoursReponse,
    PaiePeriodeResume,
    PaieRecherche,
    PaieReponse,
)


def rep(ligne: tuple[Paie, Employee, Fonction, Chantier, Equipe | None]) -> PaieReponse:
    paie, employe, fonction, chantier, equipe = ligne
    return PaieReponse(
        id=paie.id,
        version=paie.version,
        employee=PaieEmployeeResume.model_validate(employe),
        periode=paie.periode,
        fonction=PaieFonctionResume.model_validate(fonction),
        chantier=PaieChantierResume.model_validate(chantier),
        equipe=PaieEquipeResume.model_validate(equipe) if equipe is not None else None,
        nombre_jours_travailles=paie.nombre_jours_travailles,
        jours_recuperation_ouvrable=paie.jours_recuperation_ouvrable,
        jours_recuperation_dimanche=paie.jours_recuperation_dimanche,
        salaire_mensuel=paie.salaire_mensuel,
        prime_roulage_ordinaire=paie.prime_roulage_ordinaire,
        prime_roulage_dimanche=paie.prime_roulage_dimanche,
        salaire_total=paie.salaire_total,
        observation=paie.observation,
    )


CHAMPS_RESTAURES = (
    "employee_id",
    "periode",
    "fonction_id",
    "chantier_id",
    "equipe_id",
    "nombre_jours_travailles",
    "jours_recuperation_ouvrable",
    "jours_recuperation_dimanche",
    "salaire_mensuel",
    "prime_roulage_ordinaire",
    "prime_roulage_dimanche",
    "salaire_total",
    "observation",
)


def perimetre_groupe(criteres: PaieRecherche, nombre_confirme: int) -> dict[str, object]:
    """Périmètre audité d'une suppression de groupe (clés de `PerimetreSuppressionGroupePaie`)."""
    perimetre: dict[str, object] = {
        "periode": afficher_periode(criteres.periode) if criteres.periode is not None else None
    }
    for cle, valeur in (
        ("chantierIds", criteres.chantier_ids),
        ("equipeIds", criteres.equipe_ids),
        ("fonctionIds", criteres.fonction_ids),
        ("nomPrenom", criteres.nom_prenom),
        ("cin", criteres.cin),
    ):
        if valeur is not None and valeur != [] and not (isinstance(valeur, str) and not valeur.strip()):
            perimetre[cle] = valeur
    perimetre["nombreConfirme"] = nombre_confirme
    return perimetre


class ServicePaie:
    def __init__(self, auditeur: Auditeur):
        self._auditeur = auditeur

    async def rechercher(self, s: AsyncSession, c: PaieRecherche | None, p: Pagination) -> Page[PaieReponse]:
        async with s.begin():
            rows, total = await repository.rechercher(s, c or PaieRecherche(), p)
            fiches = await repository.fiches(s, rows)
        par_id = {ligne[0].id: rep(ligne) for ligne in fiches}
        return creer_page([par_id[x.id] for x in rows], p.taille, p.page, total)

    async def lire(self, s: AsyncSession, i: int) -> PaieReponse:
        async with s.begin():
            paie = await self._obtenir(s, i)
            return rep((await repository.fiches(s, [paie]))[0])

    async def creer(self, s: AsyncSession, r: PaieCreationRequete) -> PaieReponse:
        action = self._auditeur.auditer(s, "PAIE_CREATION", TypeOperation.CREATE, "Paie")
        async with s.begin(), action as cible:
            employe = await s.get(Employee, r.employee_id)
            if employe is None:
                raise ReferenceInvalide(f"Employé introuvable avec l'id : {r.employee_id}")
            if await repository.existe(s, r.employee_id, r.periode):
                raise PaieDejaExistante(r.employee_id, r.periode)
            await self._verifier_references(s, r.equipe_id, r.fonction_id, r.chantier_id)
            self._synchroniser_equipe(employe, r.equipe_id)
            x = Paie(**r.model_dump())
            s.add(x)
            await s.flush()
            cible.identifiant = x.id
            return rep((await repository.fiches(s, [x]))[0])

    async def modifier(self, s: AsyncSession, i: int, r: PaieModificationRequete) -> PaieReponse:
        action = self._auditeur.auditer(s, "PAIE_MODIFICATION", TypeOperation.UPDATE, "Paie", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            verifier_version(r.version, x.version)
            if await repository.existe(s, x.employee_id, x.periode, i):
                raise PaieDejaExistante(x.employee_id, x.periode)
            await self._verifier_references(s, r.equipe_id, r.fonction_id, r.chantier_id)
            employe = await s.get(Employee, x.employee_id)
            if employe is not None:
                self._synchroniser_equipe(employe, r.equipe_id)
            for k, v in r.model_dump(exclude={"version", "employee_id", "periode"}).items():
                setattr(x, k, v)
            await s.flush()
            await ecouteur_heures_supp.paie_modifiee(s, x.id, x.observation)
            return rep((await repository.fiches(s, [x]))[0])

    async def _verifier_references(
        self, s: AsyncSession, equipe_id: int | None, fonction_id: int, chantier_id: int
    ) -> None:
        """Contrôles et messages de `resolve*Reference` de Spring (400 ; ordre équipe, fonction, chantier)."""
        if equipe_id is not None and not await repository.ids_existants(s, Equipe, {equipe_id}):
            raise ReferenceInvalide(f"Équipe introuvable avec l'id : {equipe_id}")
        if not await repository.ids_existants(s, Fonction, {fonction_id}):
            raise ReferenceInvalide(f"Fonction introuvable avec l'id : {fonction_id}")
        if not await repository.ids_existants(s, Chantier, {chantier_id}):
            raise ReferenceInvalide(f"Chantier introuvable avec l'id : {chantier_id}")

    @staticmethod
    def _synchroniser_equipe(employe: Employee, equipe_id: int | None) -> None:
        """L'équipe saisie sur le bulletin devient l'affectation courante de l'employé (sauf s'il est inactif)."""
        if employe.statut != EmployeeStatut.INACTIF and employe.equipe_id != equipe_id:
            employe.equipe_id = equipe_id

    async def supprimer(self, s: AsyncSession, i: int) -> None:
        action = self._auditeur.auditer(s, "PAIE_SUPPRESSION", TypeOperation.DELETE, "Paie", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            await ecouteur_heures_supp.suppression_demandee(s, [x.id])
            await s.delete(x)
            try:
                await s.flush()
            except IntegrityError as e:
                raise PaieLiee("Une contrainte d'intégrité empêche cette opération.") from e

    async def supprimer_groupe(self, s: AsyncSession, criteres: PaieRecherche, nombre_attendu: int) -> int:
        action = self._auditeur.auditer(s, "PAIE_SUPPRESSION_GROUPE", TypeOperation.DELETE, "Paie")
        async with s.begin(), action as cible:
            cible.perimetre = perimetre_groupe(criteres, nombre_attendu)
            if criteres.periode is None:
                raise PeriodeObligatoire
            groupe = await repository.groupe(s, criteres)
            if len(groupe) != nombre_attendu:
                raise PaieGroupeModifie(len(groupe), nombre_attendu)
            await ecouteur_heures_supp.suppression_demandee(s, [bulletin.id for bulletin in groupe])
            for bulletin in groupe:
                await s.delete(bulletin)
            await s.flush()
            cible.nombre_elements = len(groupe)
            return len(groupe)

    async def restaurer_groupe(self, s: AsyncSession, identifiant_entree: int) -> int:
        action = self._auditeur.auditer(s, "PAIE_RESTAURATION_GROUPE", TypeOperation.CREATE, "Paie")
        async with s.begin(), action as cible:
            cible.perimetre = {"entreeAuditSourceId": identifiant_entree}
            instantanes = await instantanes_suppression(s, identifiant_entree, "PAIE_SUPPRESSION_GROUPE", "Paie")
            conflits = await self._conflits_restauration(s, instantanes)
            if conflits:
                raise PaieGroupeRestaurationConflit(conflits)
            bulletins = [Paie(**{champ: x[champ] for champ in CHAMPS_RESTAURES}) for x in instantanes]
            s.add_all(bulletins)
            try:
                await s.flush()
            except IntegrityError as e:
                raise PaieGroupeRestaurationConflit(1) from e
            cible.nombre_elements = len(bulletins)
            return len(bulletins)

    async def _conflits_restauration(self, s: AsyncSession, instantanes: list[dict[str, Any]]) -> int:
        couples = [(x["employee_id"], x["periode"]) for x in instantanes]
        conflits = await repository.couples_existants(s, set(couples)) + (len(couples) - len(set(couples)))
        employes = await repository.ids_existants(s, Employee, {x["employee_id"] for x in instantanes})
        fonctions = await repository.ids_existants(s, Fonction, {x["fonction_id"] for x in instantanes})
        chantiers = await repository.ids_existants(s, Chantier, {x["chantier_id"] for x in instantanes})
        equipes = await repository.ids_existants(
            s, Equipe, {x["equipe_id"] for x in instantanes if x["equipe_id"] is not None}
        )
        for x in instantanes:
            if (
                x["employee_id"] not in employes
                or x["fonction_id"] not in fonctions
                or x["chantier_id"] not in chantiers
                or (x["equipe_id"] is not None and x["equipe_id"] not in equipes)
            ):
                conflits += 1
        return conflits

    async def periodes(self, s: AsyncSession) -> list[PaiePeriodeResume]:
        async with s.begin():
            rows = await repository.periodes(s)
        return [
            PaiePeriodeResume(
                periode=p,
                nombre_bulletins=n,
                nombre_chantiers=c,
                masse=Decimal(str(m)),
                stc=stc,
                stc_montant=Decimal(str(stc_montant)),
            )
            for p, n, c, m, stc, stc_montant in rows
        ]

    async def periodes_recherche(self, s: AsyncSession, criteres: PaieRecherche) -> list[PaiePeriodeResume]:
        async with s.begin():
            lignes = await repository.lignes_analytiques(s, criteres)
        return construire_periodes(lignes)

    async def chantiers_periode(self, s: AsyncSession, criteres: PaieRecherche) -> list[PaieChantierPeriode]:
        if criteres.periode is None:
            raise PeriodeInvalide("La période est obligatoire (format aaaa-MM, ex. 2026-08)")
        async with s.begin():
            lignes = await repository.lignes_analytiques(s, criteres)
        return construire_chantiers(criteres.periode, lignes)

    async def analytique(
        self, s: AsyncSession, criteres: PaieRecherche, parametres: ServiceParametre
    ) -> PaieAnalytiqueReponse:
        if criteres.periode is None:
            raise PeriodeInvalide("La période est obligatoire (format aaaa-MM, ex. 2026-08)")
        async with s.begin():
            pas = await parametres.pas_tranche_analytique(s)
            lignes = await repository.lignes_analytiques(s, criteres)
        return construire_analytique(criteres.periode, lignes, pas)

    async def options_chantiers(
        self, s: AsyncSession, r: PaieOptionsChantierRequete, p: Pagination
    ) -> Page[PaieChantierOption]:
        async with s.begin():
            rows, total = await repository.options_chantiers(s, r.periode, r.recherche, p)
        return creer_page([PaieChantierOption.model_validate(x) for x in rows], p.taille, p.page, total)

    async def options_equipes(
        self, s: AsyncSession, r: PaieOptionsEquipeRequete, p: Pagination
    ) -> Page[PaieEquipeOption]:
        async with s.begin():
            rows, total = await repository.options_equipes(s, r.periode, r.chantier_ids, r.recherche, p)
        return creer_page([PaieEquipeOption.model_validate(x) for x in rows], p.taille, p.page, total)

    async def effectifs(self, s: AsyncSession, c: PaieRecherche) -> list[PaieEffectifMois]:
        async with s.begin():
            lignes = await historique.lignes_effectifs(s, c)
            departs = await historique.tous_les_departs(s)
        return historique.tendances_effectifs(lignes, departs)

    async def parcours(self, s: AsyncSession, employee_id: int) -> PaieParcoursReponse:
        async with s.begin():
            if not await historique.employe_existe(s, employee_id):
                raise EmployeeIntrouvable(employee_id)
            bulletins = await historique.bulletins_de(s, employee_id)
            departs = await historique.departs_de(s, employee_id)
        paies = [b.paie for b in bulletins]
        return PaieParcoursReponse(
            employe_id=employee_id,
            indicateurs=PaieParcoursIndicateurs(
                mois_payes=len(paies),
                total_percu=sum((x.salaire_total for x in paies), Decimal(0)),
                jours_travailles=sum((x.nombre_jours_travailles for x in paies), Decimal(0)),
                premier_mois=paies[0].periode if paies else None,
                dernier_mois=paies[-1].periode if paies else None,
            ),
            mois=historique.mois_du_parcours(bulletins),
            evenements=historique.evenements_du_parcours(bulletins, departs),
        )

    @staticmethod
    async def _obtenir(s: AsyncSession, i: int) -> Paie:
        x = await repository.par_id(s, i)
        if x is None:
            raise PaieIntrouvable(i)
        return x
