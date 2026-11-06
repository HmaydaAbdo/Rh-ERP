from datetime import date
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page

from . import repository
from .exceptions import EmployeeDejaExistant, EmployeeIntrouvable, EmployeeUtilise
from .models import Employee
from .schemas import (
    DimensionEmployes,
    EmployeeAnalytiqueReponse,
    EmployeeCreationRequete,
    EmployeeModificationRequete,
    EmployeeRecherche,
    EmployeeRegroupementReponse,
    EmployeeReponse,
    TrancheReponse,
)


def rep(x: Employee) -> EmployeeReponse:
    return EmployeeReponse.model_validate(x)


class ServiceEmployee:
    def __init__(self, auditeur: Auditeur):
        self._auditeur = auditeur

    async def rechercher(self, s: AsyncSession, c: EmployeeRecherche | None, p: Pagination) -> Page[EmployeeReponse]:
        async with s.begin():
            rows, total = await repository.rechercher(s, c or EmployeeRecherche(), p)
        return creer_page([rep(x) for x in rows], p.taille, p.page, total)

    async def lire(self, s: AsyncSession, i: int, voit_paie: bool) -> EmployeeReponse:
        async with s.begin():
            x = await self._obtenir(s, i)
            r = rep(x)
        if not voit_paie:
            r.salaire = None
            r.type_salaire = None
        return r

    async def creer(self, s: AsyncSession, r: EmployeeCreationRequete, voit_paie: bool) -> EmployeeReponse:
        action = self._auditeur.auditer(s, "EMPLOYE_CREATION", TypeOperation.CREATE, "Employee")
        async with s.begin(), action as cible:
            cin = r.cin.strip()
            if await repository.existe_cin(s, cin):
                raise EmployeeDejaExistant(cin)
            x = Employee(
                nom_prenom=r.nom_prenom.strip(),
                cin=cin,
                date_naissance=r.date_naissance,
                date_embauche=r.date_embauche,
                fonction_id=r.fonction_id,
                chantier_id=r.chantier_id,
                equipe_id=r.equipe_id,
                salaire=r.salaire if voit_paie else None,
                type_salaire=r.type_salaire if voit_paie else None,
            )
            s.add(x)
            await s.flush()
            cible.identifiant = x.id
            return rep(x)

    async def modifier(
        self, s: AsyncSession, i: int, r: EmployeeModificationRequete, voit_paie: bool
    ) -> EmployeeReponse:
        action = self._auditeur.auditer(s, "EMPLOYE_MODIFICATION", TypeOperation.UPDATE, "Employee", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            verifier_version(r.version, x.version)
            if await repository.existe_cin(s, r.cin.strip(), i):
                raise EmployeeDejaExistant(r.cin)
            x.nom_prenom, x.cin, x.date_naissance, x.date_embauche, x.fonction_id, x.statut = (
                r.nom_prenom.strip(),
                r.cin.strip(),
                r.date_naissance,
                r.date_embauche,
                r.fonction_id,
                r.statut,
            )
            x.chantier_id, x.equipe_id = (r.chantier_id, r.equipe_id) if r.statut.value == "ACTIF" else (None, None)
            if voit_paie:
                x.salaire, x.type_salaire = r.salaire, r.type_salaire
            await s.flush()
            return rep(x)

    async def supprimer(self, s: AsyncSession, i: int) -> None:
        action = self._auditeur.auditer(s, "EMPLOYE_SUPPRESSION", TypeOperation.DELETE, "Employee", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            await s.delete(x)
            try:
                await s.flush()
            except IntegrityError as e:
                raise EmployeeUtilise from e

    async def analytique(self, s: AsyncSession, c: EmployeeRecherche | None) -> EmployeeAnalytiqueReponse:
        async with s.begin():
            rows, _ = await repository.rechercher(s, c or EmployeeRecherche(), Pagination(0, 100000, (("id", True),)))
        today = date.today()
        ages = [
            max(
                0,
                today.year
                - x.date_naissance.year
                - ((today.month, today.day) < (x.date_naissance.month, x.date_naissance.day)),
            )
            for x in rows
        ]
        anciennetes = [
            max(
                0,
                today.year
                - x.date_embauche.year
                - ((today.month, today.day) < (x.date_embauche.month, x.date_embauche.day)),
            )
            for x in rows
        ]

        def tranches(valeurs: list[int], bornes: list[int]) -> list[TrancheReponse]:
            return [
                TrancheReponse(
                    min=b,
                    max=bornes[i + 1] if i + 1 < len(bornes) else None,
                    effectif=sum(v >= b and (i + 1 == len(bornes) or v < bornes[i + 1]) for v in valeurs),
                )
                for i, b in enumerate(bornes)
            ]

        n = len(rows)
        return EmployeeAnalytiqueReponse(
            effectif=n,
            actifs=sum(x.statut.value == "ACTIF" for x in rows),
            inactifs=sum(x.statut.value == "INACTIF" for x in rows),
            age_moyen=Decimal(str(round(sum(ages) / n, 1))) if n else None,
            anciennete_moyenne=Decimal(str(round(sum(anciennetes) / n, 1))) if n else None,
            embauches_douze_mois=sum(today.replace(year=today.year - 1) < x.date_embauche <= today for x in rows),
            par_age=tranches(ages, [0, 25, 35, 45, 55]),
            par_anciennete=tranches(anciennetes, [0, 1, 3, 5, 10]),
        )

    async def regrouper(
        self, s: AsyncSession, c: EmployeeRecherche | None, dimension: DimensionEmployes
    ) -> list[EmployeeRegroupementReponse]:
        async with s.begin():
            rows, _ = await repository.rechercher(s, c or EmployeeRecherche(), Pagination(0, 100000, (("id", True),)))
        champ = {
            DimensionEmployes.CHANTIER: "chantier_id",
            DimensionEmployes.EQUIPE: "equipe_id",
            DimensionEmployes.FONCTION: "fonction_id",
        }[dimension]
        groupes: dict[int, list[Employee]] = {}
        for row in rows:
            identifiant = getattr(row, champ) or 0
            groupes.setdefault(identifiant, []).append(row)
        return [
            EmployeeRegroupementReponse(
                id=i,
                code=None,
                libelle="Sans affectation" if i == 0 else str(i),
                effectif=len(v),
                actifs=sum(x.statut.value == "ACTIF" for x in v),
            )
            for i, v in sorted(groupes.items())
        ]

    async def _obtenir(self, s: AsyncSession, i: int) -> Employee:
        x = await repository.par_id(s, i)
        if x is None:
            raise EmployeeIntrouvable(i)
        return x
