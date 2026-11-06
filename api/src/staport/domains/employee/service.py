from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page

from . import repository
from .exceptions import EmployeeDejaExistant, EmployeeIntrouvable, EmployeeUtilise
from .models import Employee
from .schemas import EmployeeCreationRequete, EmployeeModificationRequete, EmployeeRecherche, EmployeeReponse


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

    async def _obtenir(self, s: AsyncSession, i: int) -> Employee:
        x = await repository.par_id(s, i)
        if x is None:
            raise EmployeeIntrouvable(i)
        return x
