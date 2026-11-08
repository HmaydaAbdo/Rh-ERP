"""Heures supplémentaires et forfaits mensuels (parité de `HeuresSuppService` et `HeuresSuppAnalytiqueService`)."""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page
from staport.domains.employee.exceptions import EmployeeIntrouvable
from staport.domains.employee.models import Employee, TypeSalaire
from staport.domains.paie.observation import est_stc_ou_sortie
from staport.domains.paie.periode import afficher_periode

from . import calcul, repository
from .exceptions import HeuresSuppGroupeModifie, HeuresSuppInvalide, LigneIntrouvable
from .models import HeureSupp
from .repository import Fiche, FicheEquipe
from .schemas import (
    Definitions,
    Groupe,
    HeuresSuppAnalytique,
    HeuresSuppCreationRequete,
    HeuresSuppModificationRequete,
    HeuresSuppRecherche,
    HeureSuppReponse,
    Indicateurs,
)

ENTITE = "HeureSupp"
DEFINITIONS = Definitions(
    heures="Somme des P/H du mois, en heures décimales.",
    montant_dh="Somme de S/H × P/H, chaque ligne arrondie à deux décimales.",  # noqa: RUF001
    stc_dh="Somme du Montant pour les bulletins du même mois marqués exactement STC ou sortie.",
    forfait_dh="Somme des forfaits saisis séparément des heures ; interdit pour un employé STC/sortie.",
    net_a_payer_dh="Somme de Montant − STC (DH) + Forfait.",  # noqa: RUF001
)


def rep(fiche: Fiche) -> HeureSuppReponse:
    ligne, employe, fonction, chantier = fiche
    return HeureSuppReponse(
        id=ligne.id,
        version=ligne.version,
        employee_id=employe.id,
        nom_prenom=employe.nom_prenom,
        cin=employe.cin,
        fonction_id=fonction.id,
        fonction=fonction.libelle,
        chantier_id=chantier.id,
        code_chantier=chantier.code,
        chantier=chantier.nom,
        periode=ligne.periode,
        salaire_reference_dh=ligne.salaire_reference,
        type_salaire_reference=None
        if ligne.type_salaire_reference is None
        else TypeSalaire(ligne.type_salaire_reference),
        salaire_horaire_dh=ligne.salaire_horaire,
        heures_supplementaires=ligne.heures,
        montant_dh=ligne.montant,
        stc_ou_sortie=ligne.est_stc_ou_sortie,
        stc_dh=ligne.stc_dh,
        forfait_dh=ligne.forfait,
        net_a_payer_dh=ligne.net_a_payer,
    )


class _Cumul:
    def __init__(self, identifiant: int, code: str | None, libelle: str | None) -> None:
        self.identifiant, self.code = identifiant, code
        self.libelle = code if libelle is None else libelle
        self.lignes_heures = 0
        self.heures = self.montant = self.stc = self.forfait = self.net = calcul.ZERO
        self.employes: set[int] = set()

    def ajouter(self, ligne: HeureSupp) -> None:
        self.employes.add(ligne.employee_id)
        if ligne.heures is not None:
            self.lignes_heures += 1
            self.heures += ligne.heures
        self.montant += ligne.montant
        self.stc += ligne.stc_dh
        if ligne.forfait is not None:
            self.forfait += ligne.forfait
        self.net += ligne.net_a_payer

    def groupe(self) -> Groupe:
        return Groupe(
            id=self.identifiant,
            code=self.code,
            libelle=self.libelle,
            lignes_heures=self.lignes_heures,
            effectif=len(self.employes),
            heures=self.heures,
            montant_dh=self.montant,
            stc_dh=self.stc,
            forfait_dh=self.forfait,
            net_a_payer_dh=self.net,
        )


def _groupes(lignes: list[FicheEquipe], cle: str) -> list[Groupe]:
    cumuls: dict[int, _Cumul] = {}
    for ligne, _, fonction, chantier, equipe in lignes:
        if cle == "chantier":
            identifiant, code, libelle = chantier.id, chantier.code, chantier.nom or chantier.designation
        elif cle == "fonction":
            identifiant, code, libelle = fonction.id, fonction.libelle, fonction.libelle
        else:
            identifiant = 0 if equipe is None else equipe.id
            code = None if equipe is None else equipe.code
            libelle = "Sans équipe" if equipe is None else equipe.libelle
        cumuls.setdefault(identifiant, _Cumul(identifiant, code, libelle)).ajouter(ligne)
    return sorted((c.groupe() for c in cumuls.values()), key=lambda g: g.net_a_payer_dh, reverse=True)


def _somme(valeurs: list[Decimal | None]) -> Decimal:
    return sum((v for v in valeurs if v is not None), calcul.ZERO)


class ServiceHeuresSupp:
    def __init__(self, auditeur: Auditeur) -> None:
        self._auditeur = auditeur

    async def rechercher(self, s: AsyncSession, c: HeuresSuppRecherche | None, p: Pagination) -> Page[HeureSuppReponse]:
        async with s.begin():
            lignes, total = await repository.rechercher(s, c or HeuresSuppRecherche(), p)
        return creer_page([rep(ligne) for ligne in lignes], p.taille, p.page, total)

    async def lire(self, s: AsyncSession, identifiant: int) -> HeureSuppReponse:
        async with s.begin():
            fiche = await repository.fiche(s, identifiant)
            if fiche is None:
                raise LigneIntrouvable
            return rep(fiche)

    async def periodes(self, s: AsyncSession) -> list[int]:
        async with s.begin():
            return await repository.periodes(s)

    async def analyser(self, s: AsyncSession, c: HeuresSuppRecherche | None) -> HeuresSuppAnalytique:
        criteres = c or HeuresSuppRecherche()
        async with s.begin():
            lignes = await repository.lignes_analytiques(s, criteres)
        entites = [ligne[0] for ligne in lignes]
        indicateurs = Indicateurs(
            employes=len({ligne.employee_id for ligne in entites}),
            lignes_heures=sum(1 for ligne in entites if ligne.heures is not None),
            heures=_somme([ligne.heures for ligne in entites]),
            montant_dh=_somme([ligne.montant for ligne in entites]),
            stc_dh=_somme([ligne.stc_dh for ligne in entites]),
            forfait_dh=_somme([ligne.forfait for ligne in entites]),
            net_a_payer_dh=_somme([ligne.net_a_payer for ligne in entites]),
        )
        return HeuresSuppAnalytique(
            periode=criteres.periode,
            indicateurs=indicateurs,
            par_chantier=_groupes(lignes, "chantier"),
            par_fonction=_groupes(lignes, "fonction"),
            par_equipe=_groupes(lignes, "equipe"),
            definitions=DEFINITIONS,
        )

    async def creer(self, s: AsyncSession, r: HeuresSuppCreationRequete) -> HeureSuppReponse:
        action = self._auditeur.auditer(s, "HEURES_SUP_CREATION_UNITAIRE", TypeOperation.CREATE, ENTITE)
        async with s.begin(), action as cible:
            if r.heures_supplementaires is None and r.forfait_dh is None:
                raise HeuresSuppInvalide("Saisissez des heures supplémentaires ou un forfait.")
            employe = await s.get(Employee, r.employee_id)
            if employe is None:
                raise EmployeeIntrouvable(r.employee_id)
            bulletin = await repository.paie_du_mois(s, r.employee_id, r.periode)
            if bulletin is None:
                raise HeuresSuppInvalide("Aucune paie n'existe pour cet employé pendant ce mois.")
            if await s.get(Chantier, r.chantier_id) is None:
                raise HeuresSuppInvalide("Le chantier sélectionné n'existe plus.")
            if await repository.existe(s, r.employee_id, r.periode, r.chantier_id):
                raise HeuresSuppInvalide("Une ligne existe déjà pour cet employé, ce mois et ce chantier.")
            stc = est_stc_ou_sortie(bulletin.observation)
            if stc and r.forfait_dh is not None:
                raise HeuresSuppInvalide("Le forfait est interdit car la paie est marquée STC/sortie.")
            if stc and await repository.forfait_sur_autre_chantier(s, r.employee_id, r.periode, r.chantier_id):
                raise HeuresSuppInvalide(
                    "Un forfait existe déjà pour cet employé sur un autre chantier pendant ce mois marqué STC/sortie."
                )
            avec_heures = r.heures_supplementaires is not None
            taux: Decimal | None = None
            if avec_heures:
                if employe.salaire is None or employe.type_salaire is None:
                    raise HeuresSuppInvalide("Le salaire et son type sont nécessaires au calcul de S/H.")
                taux = calcul.salaire_horaire(employe.salaire, TypeSalaire(employe.type_salaire))
            montant = calcul.montant(taux, r.heures_supplementaires)
            stc_dh = calcul.stc_dh(montant, stc)
            ligne = HeureSupp(
                employee_id=employe.id,
                paie_id=bulletin.id,
                fonction_id=bulletin.fonction_id,
                chantier_id=r.chantier_id,
                periode=r.periode,
                heures=r.heures_supplementaires,
                salaire_reference=employe.salaire if avec_heures else None,
                type_salaire_reference=employe.type_salaire if avec_heures else None,
                salaire_horaire=taux,
                montant=montant,
                est_stc_ou_sortie=stc,
                stc_dh=stc_dh,
                forfait=r.forfait_dh,
                net_a_payer=calcul.net_a_payer(montant, stc_dh, r.forfait_dh),
            )
            s.add(ligne)
            await s.flush()
            cible.identifiant = ligne.id
            fiche = await repository.fiche(s, ligne.id)
            if fiche is None:
                raise LigneIntrouvable
            return rep(fiche)

    async def modifier(self, s: AsyncSession, identifiant: int, r: HeuresSuppModificationRequete) -> HeureSuppReponse:
        action = self._auditeur.auditer(s, "HEURES_SUP_MODIFICATION", TypeOperation.UPDATE, ENTITE, identifiant)
        async with s.begin(), action:
            ligne = await repository.par_id(s, identifiant)
            if ligne is None:
                raise LigneIntrouvable
            if ligne.version != r.version:
                raise HeuresSuppInvalide("Cette ligne a été modifiée entre-temps. Actualisez-la avant de réessayer.")
            if r.heures_supplementaires is None and r.forfait_dh is None:
                raise HeuresSuppInvalide("Saisissez des heures supplémentaires ou un forfait.")
            if ligne.est_stc_ou_sortie and r.forfait_dh is not None:
                raise HeuresSuppInvalide("Le forfait est interdit car la paie du mois est marquée STC/sortie.")
            taux = ligne.salaire_horaire
            if r.heures_supplementaires is not None and taux is None:
                raise HeuresSuppInvalide("Aucun taux horaire n'est enregistré pour cette ligne.")
            montant = calcul.montant(taux, r.heures_supplementaires)
            stc_dh = calcul.stc_dh(montant, ligne.est_stc_ou_sortie)
            ligne.heures = r.heures_supplementaires
            if r.heures_supplementaires is None:
                ligne.salaire_reference = None
                ligne.type_salaire_reference = None
                ligne.salaire_horaire = None
            ligne.montant = montant
            ligne.stc_dh = stc_dh
            ligne.forfait = r.forfait_dh
            ligne.net_a_payer = calcul.net_a_payer(montant, stc_dh, r.forfait_dh)
            await s.flush()
            fiche = await repository.fiche(s, identifiant)
            if fiche is None:
                raise LigneIntrouvable
            return rep(fiche)

    async def supprimer(self, s: AsyncSession, identifiant: int) -> None:
        action = self._auditeur.auditer(s, "HEURES_SUP_SUPPRESSION", TypeOperation.DELETE, ENTITE, identifiant)
        async with s.begin(), action:
            ligne = await repository.par_id(s, identifiant)
            if ligne is None:
                raise LigneIntrouvable
            await s.delete(ligne)
            await s.flush()

    async def supprimer_mois(self, s: AsyncSession, periode: int, nombre_attendu: int) -> int:
        action = self._auditeur.auditer(s, "HEURES_SUP_SUPPRESSION_MOIS", TypeOperation.DELETE, ENTITE)
        async with s.begin(), action as cible:
            cible.perimetre = {"periode": afficher_periode(periode)}
            lignes = await repository.du_mois(s, periode)
            if len(lignes) != nombre_attendu:
                raise HeuresSuppGroupeModifie(len(lignes), nombre_attendu)
            for ligne in lignes:
                await s.delete(ligne)
            await s.flush()
            cible.nombre_elements = len(lignes)
            return len(lignes)
