from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page

from . import repository
from .exceptions import PaieDejaExistante, PaieIntrouvable
from .models import Paie
from .schemas import (
    PaieAnalytiqueReponse,
    PaieChantierOption,
    PaieCreationRequete,
    PaieEquipeOption,
    PaieModificationRequete,
    PaieOptionsChantierRequete,
    PaieOptionsEquipeRequete,
    PaiePeriodeResume,
    PaieRecherche,
    PaieReponse,
)


def rep(x: Paie) -> PaieReponse:
    return PaieReponse.model_validate(x)


class ServicePaie:
    def __init__(self, auditeur: Auditeur):
        self._auditeur = auditeur

    async def rechercher(self, s: AsyncSession, c: PaieRecherche | None, p: Pagination) -> Page[PaieReponse]:
        async with s.begin():
            rows, total = await repository.rechercher(s, c or PaieRecherche(), p)
        return creer_page([rep(x) for x in rows], p.taille, p.page, total)

    async def lire(self, s: AsyncSession, i: int) -> PaieReponse:
        async with s.begin():
            return rep(await self._obtenir(s, i))

    async def creer(self, s: AsyncSession, r: PaieCreationRequete) -> PaieReponse:
        action = self._auditeur.auditer(s, "PAIE_CREATION", TypeOperation.CREATE, "Paie")
        async with s.begin(), action as cible:
            if await repository.existe(s, r.employee_id, r.periode):
                raise PaieDejaExistante(r.employee_id, r.periode)
            x = Paie(**r.model_dump())
            s.add(x)
            await s.flush()
            cible.identifiant = x.id
            return rep(x)

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
            return rep(x)

    async def supprimer(self, s: AsyncSession, i: int) -> None:
        action = self._auditeur.auditer(s, "PAIE_SUPPRESSION", TypeOperation.DELETE, "Paie", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            await s.delete(x)
            try:
                await s.flush()
            except IntegrityError as e:
                raise PaieIntrouvable(i) from e

    async def periodes(self, s: AsyncSession) -> list[PaiePeriodeResume]:
        async with s.begin():
            rows = await repository.periodes(s)
        return [
            PaiePeriodeResume(periode=p, nombre_bulletins=n, nombre_chantiers=c, masse=Decimal(str(m)))
            for p, n, c, m in rows
        ]

    async def analytique(self, s: AsyncSession, periode: int) -> PaieAnalytiqueReponse:
        async with s.begin():
            n, masse, moyenne, employes = await repository.analytique(s, periode)
        return PaieAnalytiqueReponse(
            periode=periode,
            nombre_bulletins=n,
            masse=Decimal(str(masse)),
            salaire_moyen=Decimal(str(moyenne)) if moyenne is not None else None,
            nombre_employes=employes,
        )

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

    @staticmethod
    async def _obtenir(s: AsyncSession, i: int) -> Paie:
        x = await repository.par_id(s, i)
        if x is None:
            raise PaieIntrouvable(i)
        return x
