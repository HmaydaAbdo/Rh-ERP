from decimal import Decimal
from itertools import pairwise

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction
from staport.domains.parametre.service import ServiceParametre

from . import repository
from .analytique import construire_analytique
from .cartes import chantiers as construire_chantiers
from .cartes import periodes as construire_periodes
from .exceptions import PaieDejaExistante, PaieGroupeModifie, PaieIntrouvable, PeriodeObligatoire
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
    PaieParcoursEvenement,
    PaieParcoursMois,
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
            if await repository.existe(s, r.employee_id, r.periode):
                raise PaieDejaExistante(r.employee_id, r.periode)
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
            for k, v in r.model_dump(exclude={"version", "employee_id", "periode"}).items():
                setattr(x, k, v)
            await s.flush()
            return rep((await repository.fiches(s, [x]))[0])

    async def supprimer(self, s: AsyncSession, i: int) -> None:
        action = self._auditeur.auditer(s, "PAIE_SUPPRESSION", TypeOperation.DELETE, "Paie", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            await s.delete(x)
            try:
                await s.flush()
            except IntegrityError as e:
                raise PaieIntrouvable(i) from e

    async def supprimer_groupe(self, s: AsyncSession, criteres: PaieRecherche, nombre_attendu: int) -> int:
        action = self._auditeur.auditer(s, "PAIE_SUPPRESSION_GROUPE", TypeOperation.DELETE, "Paie")
        async with s.begin(), action as cible:
            cible.perimetre = perimetre_groupe(criteres, nombre_attendu)
            if criteres.periode is None:
                raise PeriodeObligatoire
            groupe = await repository.groupe(s, criteres)
            if len(groupe) != nombre_attendu:
                raise PaieGroupeModifie(len(groupe), nombre_attendu)
            for bulletin in groupe:
                await s.delete(bulletin)
            await s.flush()
            cible.nombre_elements = len(groupe)
            return len(groupe)

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
            raise ValueError("La période est obligatoire pour les chantiers de paie")
        async with s.begin():
            lignes = await repository.lignes_analytiques(s, criteres)
        return construire_chantiers(criteres.periode, lignes)

    async def analytique(
        self, s: AsyncSession, criteres: PaieRecherche, parametres: ServiceParametre
    ) -> PaieAnalytiqueReponse:
        if criteres.periode is None:
            raise ValueError("La période est obligatoire pour l'analyse de la paie")
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
            lignes = await repository.effectifs(s, c)
        par_periode = {periode: effectif for periode, effectif in lignes}
        return [
            PaieEffectifMois(
                periode=periode,
                effectif=effectif,
                effectif_mois_precedent=par_periode.get(periode - 1),
                variation=(effectif - par_periode[periode - 1]) if periode - 1 in par_periode else None,
                entrees=0,
                plus_payes=None,
                sorties=0,
                mutations=None,
            )
            for periode, effectif in lignes
        ]

    async def parcours(self, s: AsyncSession, employee_id: int) -> PaieParcoursReponse:
        async with s.begin():
            bulletins = await repository.parcours(s, employee_id)
        mois = [
            PaieParcoursMois(
                bulletin_id=x.id,
                periode=x.periode,
                fonction_id=x.fonction_id,
                chantier_id=x.chantier_id,
                equipe_id=x.equipe_id,
                nombre_jours_travailles=x.nombre_jours_travailles,
                salaire_mensuel=x.salaire_mensuel,
                salaire_total=x.salaire_total,
                observation=x.observation,
            )
            for x in reversed(bulletins)
        ]
        evenements: list[PaieParcoursEvenement] = []
        for precedent, courant in pairwise(bulletins):
            for _champ, avant, apres, type_ in (
                ("chantier_id", precedent.chantier_id, courant.chantier_id, "CHANGEMENT_CHANTIER"),
                ("fonction_id", precedent.fonction_id, courant.fonction_id, "CHANGEMENT_FONCTION"),
                ("equipe_id", precedent.equipe_id, courant.equipe_id, "CHANGEMENT_EQUIPE"),
                ("salaire_mensuel", precedent.salaire_mensuel, courant.salaire_mensuel, "CHANGEMENT_SALAIRE"),
            ):
                if avant != apres:
                    evenements.append(
                        PaieParcoursEvenement(
                            periode=courant.periode, type=type_, avant=str(avant), apres=str(apres), motif=None
                        )
                    )
        if bulletins:
            evenements.append(
                PaieParcoursEvenement(periode=bulletins[0].periode, type="ENTREE", avant=None, apres=None, motif=None)
            )
        return PaieParcoursReponse(
            employe_id=employee_id,
            mois_payes=len(bulletins),
            total_percu=sum((x.salaire_total for x in bulletins), Decimal(0)),
            jours_travailles=sum((x.nombre_jours_travailles for x in bulletins), Decimal(0)),
            premier_mois=bulletins[0].periode if bulletins else None,
            dernier_mois=bulletins[-1].periode if bulletins else None,
            mois=mois,
            evenements=sorted(evenements, key=lambda x: (x.periode, x.type), reverse=True),
        )

    @staticmethod
    async def _obtenir(s: AsyncSession, i: int) -> Paie:
        x = await repository.par_id(s, i)
        if x is None:
            raise PaieIntrouvable(i)
        return x
