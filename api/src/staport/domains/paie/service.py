from collections.abc import Callable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, cast

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.audit.api import instantanes_suppression
from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.montant import arrondir_montant
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
from .analytique import Ligne, construire_analytique
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
from .periode import afficher_periode, mois_precedent
from .schemas import (
    DimensionPaie,
    PaieAnalytiqueReponse,
    PaieChantierMasse,
    PaieChantierOption,
    PaieChantierPeriode,
    PaieChantierResume,
    PaieComparaisonGroupe,
    PaieComparaisonReponse,
    PaieComparaisonTotal,
    PaieCreationRequete,
    PaieEffectifMois,
    PaieEmployeeResume,
    PaieEquipeMasse,
    PaieEquipeOption,
    PaieEquipeResume,
    PaieEvolution,
    PaieFonctionPrincipale,
    PaieFonctionResume,
    PaieKpi,
    PaieModificationRequete,
    PaieOptionsChantierRequete,
    PaieOptionsEquipeRequete,
    PaieParcoursIndicateurs,
    PaieParcoursReponse,
    PaiePeriodeResume,
    PaieRecherche,
    PaieRepartitionGroupe,
    PaieRepartitionReponse,
    PaieReponse,
    TriComparaison,
    TriRepartition,
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


DEFINITIONS_COMPARAISON = {
    "masse": "Masse salariale du mois récent, en dirhams",
    "masseReference": "Masse salariale du mois de comparaison ; absente si le groupe n'a pas de paie ce mois-là",
    "variationMasse": "Masse du mois récent moins masse du mois de comparaison, en dirhams (négative = baisse) ; "
    "absente si un mois manque",
    "variationPourcentage": "Variation de masse divisée par la masse du mois de comparaison, en pourcentage à une "
    "décimale ; absente si la masse de référence est nulle",
    "effectif": "Employés payés dans le mois récent (un bulletin par employé)",
    "variationEffectif": "Effectif du mois récent moins effectif du mois de comparaison ; absent si un mois manque",
    "coutMoyen": "Masse divisée par l'effectif du mois récent, en dirhams ; absent sans bulletin",
    "fonctionPrincipale": "Fonction qui compte le plus d'employés payés dans le groupe au mois récent ; à égalité, le "
    "libellé alphabétique vient en premier",
    "statut": "COMPARABLE (paie aux deux mois), NOUVEAU (paie seulement au mois récent) ou DISPARU (paie seulement au "
    "mois de comparaison)",
    "plusForteHausse": "Groupe comparable dont la masse a le plus augmenté parmi les groupes rendus ; nul si aucun "
    "n'augmente",
    "plusForteHausseDuPerimetre": "Groupe comparable dont la masse a le plus augmenté sur tout le périmètre, même s'il "
    "n'est pas dans la liste rendue",
    "plusForteBaisse": "Groupe comparable dont la masse a le plus baissé parmi les groupes rendus ; nul si aucun ne "
    "baisse",
    "plusForteBaisseDuPerimetre": "Groupe comparable dont la masse a le plus baissé sur tout le périmètre, même s'il "
    "n'est pas dans la liste rendue",
}
CENT = Decimal(100)


def _groupes_repartition(resultat: PaieAnalytiqueReponse, dimension: DimensionPaie) -> list[PaieRepartitionGroupe]:
    """Les groupes d'une dimension de l'analyse, dans l'ordre de l'analyse (masse décroissante) ; sans code pour une
    fonction."""
    if dimension is DimensionPaie.CHANTIER:
        sources: list[PaieChantierMasse | PaieEquipeMasse] = [*resultat.par_chantier]
    elif dimension is DimensionPaie.EQUIPE:
        sources = [*resultat.par_equipe]
    else:
        return [
            PaieRepartitionGroupe(
                id=f.id,
                code=None,
                libelle=f.libelle,
                masse=f.masse,
                effectif=f.effectif,
                stc=f.stc,
                stc_montant=f.stc_montant,
            )
            for f in resultat.par_fonction
        ]
    return [
        PaieRepartitionGroupe(
            id=g.id,
            code=g.code,
            libelle=g.libelle,
            masse=g.masse,
            effectif=g.effectif,
            stc=g.stc,
            stc_montant=g.stc_montant,
        )
        for g in sources
    ]


def _cout_moyen(masse: Decimal, effectif: int) -> Decimal | None:
    return None if effectif == 0 else arrondir_montant(masse / effectif)


def _pourcentage(variation: Decimal, reference: Decimal) -> Decimal:
    return (variation * CENT / reference).quantize(Decimal("0.1"), ROUND_HALF_UP)


@dataclass(frozen=True)
class _Comparaison:
    """Un groupe aux deux mois : `source` au mois récent, `reference` au mois de comparaison (l'un peut manquer)."""

    source: PaieRepartitionGroupe | None
    reference: PaieRepartitionGroupe | None

    @property
    def groupe(self) -> PaieRepartitionGroupe:
        return cast(PaieRepartitionGroupe, self.source or self.reference)

    @property
    def libelle(self) -> str:
        return self.groupe.libelle or ""

    @property
    def variation_masse(self) -> Decimal | None:
        if self.source is None or self.reference is None:
            return None
        return self.source.masse - self.reference.masse

    @property
    def variation_pourcentage(self) -> Decimal | None:
        variation = self.variation_masse
        if variation is None or self.reference is None or self.reference.masse == 0:
            return None
        return _pourcentage(variation, self.reference.masse)

    @property
    def variation_effectif(self) -> int | None:
        if self.source is None or self.reference is None:
            return None
        return self.source.effectif - self.reference.effectif

    def valeur(self, tri: TriComparaison) -> Decimal | None:
        if tri is TriComparaison.MASSE:
            return None if self.source is None else self.source.masse
        if tri is TriComparaison.VARIATION_MASSE:
            return self.variation_masse
        if tri is TriComparaison.VARIATION_POURCENTAGE:
            return self.variation_pourcentage
        if tri is TriComparaison.EFFECTIF:
            return None if self.source is None else Decimal(self.source.effectif)
        if tri is TriComparaison.VARIATION_EFFECTIF:
            variation = self.variation_effectif
            return None if variation is None else Decimal(variation)
        return None

    def groupe_dto(self, fonction: PaieFonctionPrincipale | None) -> PaieComparaisonGroupe:
        source, reference = self.source, self.reference
        statut = "DISPARU" if source is None else "NOUVEAU" if reference is None else "COMPARABLE"
        return PaieComparaisonGroupe(
            id=self.groupe.id,
            code=self.groupe.code,
            libelle=self.groupe.libelle,
            statut=statut,
            masse=None if source is None else source.masse,
            masse_reference=None if reference is None else reference.masse,
            variation_masse=self.variation_masse,
            variation_pourcentage=self.variation_pourcentage,
            effectif=None if source is None else source.effectif,
            effectif_reference=None if reference is None else reference.effectif,
            variation_effectif=self.variation_effectif,
            cout_moyen=None if source is None else _cout_moyen(source.masse, source.effectif),
            cout_moyen_reference=None if reference is None else _cout_moyen(reference.masse, reference.effectif),
            fonction_principale=fonction,
        )


def _fonction_principale(
    comparaison: _Comparaison, dimension: DimensionPaie, courant: list[Ligne], periode: int, pas: Decimal
) -> PaieFonctionPrincipale | None:
    """La fonction qui compte le plus de bulletins du groupe au mois récent ; à égalité, le premier libellé."""
    if dimension is DimensionPaie.FONCTION or comparaison.source is None:
        return None
    identifiant = comparaison.groupe.id
    if dimension is DimensionPaie.CHANTIER:
        membres = [ligne for ligne in courant if ligne[3].id == identifiant]
    else:
        membres = [ligne for ligne in courant if (ligne[4].id if ligne[4] is not None else None) == identifiant]
    fonctions = construire_analytique(periode, membres, pas).par_fonction
    if not fonctions:
        return None
    meilleure = min(fonctions, key=lambda f: (-f.effectif, f.libelle))
    return PaieFonctionPrincipale(libelle=meilleure.libelle, effectif=meilleure.effectif)


def _extreme(comparaisons: list[_Comparaison], *, hausse: bool) -> PaieComparaisonGroupe | None:
    """Le groupe comparable de plus forte hausse (ou baisse) de masse ; le premier rencontré à égalité."""
    retenu: _Comparaison | None = None
    for c in comparaisons:
        variation = c.variation_masse
        if variation is None or (variation <= 0 if hausse else variation >= 0):
            continue
        meilleure = cast(Decimal, retenu.variation_masse) if retenu is not None else None
        if meilleure is None or (variation > meilleure if hausse else variation < meilleure):
            retenu = c
    return None if retenu is None else retenu.groupe_dto(None)


def _total(actuel: PaieKpi, ancien: PaieKpi) -> PaieComparaisonTotal:
    comparable = ancien.effectif > 0
    variation = actuel.masse - ancien.masse if comparable else None
    return PaieComparaisonTotal(
        masse=actuel.masse,
        masse_reference=ancien.masse if comparable else None,
        variation_masse=variation,
        variation_pourcentage=_pourcentage(variation, ancien.masse)
        if variation is not None and ancien.masse != 0
        else None,
        effectif=actuel.effectif,
        effectif_reference=ancien.effectif if comparable else None,
        variation_effectif=actuel.effectif - ancien.effectif if comparable else None,
        cout_moyen=_cout_moyen(actuel.masse, actuel.effectif),
        cout_moyen_reference=_cout_moyen(ancien.masse, ancien.effectif) if comparable else None,
    )


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

    async def derniere_periode(self, s: AsyncSession) -> int | None:
        """Le dernier mois de paie importé, tous périmètres confondus (`findPeriodes(null)`) ; `None` sans paie."""
        async with s.begin():
            return await repository.derniere_periode(s)

    async def rechercher_bulletins(
        self, s: AsyncSession, c: PaieRecherche, page: int, taille: int, tri: str, croissant: bool
    ) -> Page[PaieReponse]:
        """Recherche des bulletins triée sur `tri` (colonne du bulletin, ou `nom_prenom` de l'employé), départagée par
        le nom puis l'identifiant pour un ordre stable d'une page à l'autre (`SensTri.sur` de Spring)."""
        async with s.begin():
            rows, total = await repository.rechercher_tries(s, c, page, taille, tri, croissant)
            fiches = await repository.fiches(s, rows)
        par_id = {ligne[0].id: rep(ligne) for ligne in fiches}
        return creer_page([par_id[x.id] for x in rows], taille, page, total)

    async def evolution_jusqua(
        self, s: AsyncSession, criteres: PaieRecherche, parametres: ServiceParametre
    ) -> list[PaieEvolution]:
        """Série mensuelle du périmètre, bornée au mois demandé (`evolutionJusqua`)."""
        resultat = await self.analytique(s, criteres, parametres)
        return [e for e in resultat.evolution if criteres.periode is None or e.periode <= criteres.periode]

    async def repartir(
        self,
        s: AsyncSession,
        criteres: PaieRecherche,
        parametres: ServiceParametre,
        dimension: DimensionPaie,
        tri: TriRepartition | None,
        croissant: bool | None,
    ) -> PaieRepartitionReponse:
        """Paie du mois par chantier, équipe ou fonction, triée (`PaieAnalytiqueService.repartir`)."""
        resultat = await self.analytique(s, criteres, parametres)
        groupes = _groupes_repartition(resultat, dimension)
        critere = tri or TriRepartition.MASSE
        texte = critere in (TriRepartition.LIBELLE, TriRepartition.CODE)
        cles: dict[TriRepartition, Callable[[PaieRepartitionGroupe], Any]] = {
            TriRepartition.MASSE: lambda g: g.masse,
            TriRepartition.EFFECTIF: lambda g: g.effectif,
            TriRepartition.STC: lambda g: g.stc,
            TriRepartition.STC_MONTANT: lambda g: g.stc_montant,
            TriRepartition.LIBELLE: lambda g: (g.libelle or "").lower(),
            TriRepartition.CODE: lambda g: (g.code or "").lower(),
        }
        cle = cles[critere]
        tries = sorted(groupes, key=cle, reverse=not (croissant if croissant is not None else texte))
        return PaieRepartitionReponse(
            periode=resultat.periode, dimension=dimension, nombre_groupes=len(tries), groupes=tries
        )

    async def comparer(
        self,
        s: AsyncSession,
        recent: PaieRecherche,
        reference: int | None,
        parametres: ServiceParametre,
        dimension: DimensionPaie,
        tri: TriComparaison,
        croissant: bool,
    ) -> PaieComparaisonReponse:
        """Comparaison de deux mois, groupe par groupe (`PaieAnalytiqueService.comparer`). Les deux mois partagent le
        périmètre : les bulletins sont lus une seule fois, puis analysés pour chaque mois."""
        if recent.periode is None:
            raise PeriodeInvalide("La période est obligatoire (format aaaa-MM, ex. 2026-08)")
        mois_reference = reference if reference is not None else mois_precedent(recent.periode)
        async with s.begin():
            pas = await parametres.pas_tranche_analytique(s)
            lignes = await repository.lignes_analytiques(s, recent)
        actuel = construire_analytique(recent.periode, lignes, pas)
        ancien = construire_analytique(mois_reference, lignes, pas)
        anciens = {g.id: g for g in _groupes_repartition(ancien, dimension)}
        toutes: list[_Comparaison] = []
        for groupe in _groupes_repartition(actuel, dimension):
            toutes.append(_Comparaison(groupe, anciens.pop(groupe.id, None)))
        toutes.extend(_Comparaison(None, g) for g in anciens.values())

        if tri is TriComparaison.LIBELLE:
            classees = sorted(toutes, key=lambda c: c.libelle.lower(), reverse=not croissant)
        else:
            valeurs = [c for c in toutes if c.valeur(tri) is not None]
            absentes = [c for c in toutes if c.valeur(tri) is None]
            classees = sorted(valeurs, key=lambda c: cast(Decimal, c.valeur(tri)), reverse=not croissant) + absentes
        courant = [ligne for ligne in lignes if ligne[0].periode == recent.periode]
        groupes = [c.groupe_dto(_fonction_principale(c, dimension, courant, recent.periode, pas)) for c in classees]
        hausse, baisse = _extreme(toutes, hausse=True), _extreme(toutes, hausse=False)
        return PaieComparaisonReponse(
            periode=actuel.periode,
            periode_reference=ancien.periode,
            dimension=dimension,
            nombre_groupes=len(toutes),
            total=_total(actuel.kpis, ancien.kpis),
            plus_forte_hausse=hausse,
            plus_forte_baisse=baisse,
            plus_forte_hausse_du_perimetre=hausse,
            plus_forte_baisse_du_perimetre=baisse,
            groupes=groupes,
            definitions=DEFINITIONS_COMPARAISON,
        )

    async def effectifs(self, s: AsyncSession, c: PaieRecherche) -> list[PaieEffectifMois]:
        async with s.begin():
            lignes = await historique.lignes_effectifs(s, c)
            departs = await historique.tous_les_departs(s)
        return historique.tendances_effectifs(lignes, departs)

    async def parcours(self, s: AsyncSession, employee_id: int) -> PaieParcoursReponse:
        """Parcours d'un employé tel que ses bulletins et ses départs le racontent (`PaieParcoursService`)."""
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
