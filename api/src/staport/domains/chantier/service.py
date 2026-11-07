from collections.abc import Sequence
from decimal import Decimal, InvalidOperation
from urllib.parse import parse_qs, unquote, urlparse

from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page

from . import repository
from .exceptions import ChantierDejaExistant, ChantierIntrouvable, ChantierLocalisationInvalide, ChantierUtilise
from .models import Chantier
from .schemas import (
    ChantierCarteReponse,
    ChantierCreationRequete,
    ChantierModificationRequete,
    ChantierRecherche,
    ChantierReponse,
    ChantierStatutRequete,
    SynchronisationReponse,
)


def _rep(x: Chantier) -> ChantierReponse:
    return ChantierReponse.model_validate(x)


_LIEN_INVALIDE = (
    "La localisation doit être un lien Google Maps contenant les coordonnées, par exemple "
    "https://www.google.com/maps?q=31.7243258,-8.1033938. Les liens courts et les adresses seules ne sont pas acceptés."
)
_COORDONNEES_DIFFERENTES = "La latitude et la longitude saisies ne correspondent pas au lien de localisation."
_COORDONNEES_PAIRE = "Renseignez ensemble la latitude et la longitude."
_COORDONNEES_BORNES = "Latitude : de -90 à 90 ; longitude : de -180 à 180."
_COORDONNEES_DECIMALES = "La latitude et la longitude acceptent au maximum 8 décimales."
_CARTE_INCOMPLETE = (
    "Pour afficher le chantier sur la carte, renseignez sa nature et sa localisation : un lien Google Maps "
    "contenant les coordonnées, ou sa latitude et sa longitude."
)


def _coord(req: ChantierCreationRequete) -> tuple[str | None, Decimal | None, Decimal | None]:
    """Règles de `LocalisationChantierService` (Spring), mêmes messages et même ordre de vérification."""
    loc = req.localisation.strip() if req.localisation and req.localisation.strip() else None
    lat, lon = req.latitude, req.longitude
    if loc:
        raw = urlparse(loc if "://" in loc else "https://" + loc)
        if (
            raw.scheme.lower() != "https"
            or raw.hostname not in ("google.com", "www.google.com")
            or raw.path not in ("/maps", "/maps/", "/maps/search/")
            or raw.username
            or raw.port
            or raw.fragment
        ):
            raise ChantierLocalisationInvalide(_LIEN_INVALIDE)
        params = parse_qs(raw.query)
        if "q" in params and "query" in params:
            raise ChantierLocalisationInvalide(_LIEN_INVALIDE)
        valeurs = params.get("q") or params.get("query")
        if not valeurs or len(valeurs) != 1:
            raise ChantierLocalisationInvalide(_LIEN_INVALIDE)
        point = unquote(valeurs[0]).split(",")
        if len(point) != 2:
            raise ChantierLocalisationInvalide(_LIEN_INVALIDE)
        try:
            lat_l, lon_l = (Decimal(v.strip()) for v in point)
        except InvalidOperation as exc:
            raise ChantierLocalisationInvalide(_LIEN_INVALIDE) from exc
        if (lat is not None and lat != lat_l) or (lon is not None and lon != lon_l):
            raise ChantierLocalisationInvalide(_COORDONNEES_DIFFERENTES)
        lat, lon = lat_l, lon_l
    if (lat is None) != (lon is None):
        raise ChantierLocalisationInvalide(_COORDONNEES_PAIRE)
    if lat is not None and lon is not None:
        if abs(lat) > 90 or abs(lon) > 180:
            raise ChantierLocalisationInvalide(_COORDONNEES_BORNES)
        if lat.as_tuple().exponent < -8 or lon.as_tuple().exponent < -8:  # type: ignore[operator]
            raise ChantierLocalisationInvalide(_COORDONNEES_DECIMALES)
        loc = f"https://www.google.com/maps/search/?api=1&query={lat.normalize():f},{lon.normalize():f}"
    if req.afficher_sur_carte and (req.nature is None or loc is None or lat is None):
        raise ChantierLocalisationInvalide(_CARTE_INCOMPLETE)
    return loc, lat, lon


class ServiceChantier:
    def __init__(self, auditeur: Auditeur):
        self._auditeur = auditeur

    async def rechercher(self, s: AsyncSession, c: ChantierRecherche | None, p: Pagination) -> Page[ChantierReponse]:
        async with s.begin():
            rows, total = await repository.rechercher(s, c or ChantierRecherche(), p)
        return creer_page([_rep(x) for x in rows], p.taille, p.page, total)

    async def lire(self, s: AsyncSession, i: int) -> ChantierReponse:
        async with s.begin():
            return _rep(await self._obtenir(s, i))

    async def creer(self, s: AsyncSession, r: ChantierCreationRequete) -> ChantierReponse:
        action = self._auditeur.auditer(s, "CHANTIER_CREATION", TypeOperation.CREATE, "Chantier")
        async with s.begin(), action as cible:
            code = r.code.strip()
            if await repository.existe_code(s, code):
                raise ChantierDejaExistant(code)
            loc, lat, lon = _coord(r)
            x = Chantier(
                code=code,
                designation=r.designation.strip(),
                nom=r.nom.strip() if r.nom else None,
                nature=r.nature,
                localisation=loc,
                latitude=lat,
                longitude=lon,
                afficher_sur_carte=r.afficher_sur_carte,
            )
            s.add(x)
            await s.flush()
            cible.identifiant = x.id
            return _rep(x)

    async def modifier(self, s: AsyncSession, i: int, r: ChantierModificationRequete) -> ChantierReponse:
        action = self._auditeur.auditer(s, "CHANTIER_MODIFICATION", TypeOperation.UPDATE, "Chantier", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            verifier_version(r.version, x.version)
            code = r.code.strip()
            if await repository.existe_code(s, code, i):
                raise ChantierDejaExistant(code)
            loc, lat, lon = _coord(r)
            (
                x.code,
                x.designation,
                x.nom,
                x.nature,
                x.localisation,
                x.latitude,
                x.longitude,
                x.afficher_sur_carte,
                x.actif,
            ) = (
                code,
                r.designation.strip(),
                r.nom.strip() if r.nom else None,
                r.nature,
                loc,
                lat,
                lon,
                r.afficher_sur_carte,
                r.actif,
            )
            await s.flush()
            return _rep(x)

    async def statut(self, s: AsyncSession, i: int, r: ChantierStatutRequete) -> ChantierReponse:
        action = self._auditeur.auditer(s, "CHANTIER_MODIFICATION", TypeOperation.UPDATE, "Chantier", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            verifier_version(r.version, x.version)
            x.actif = r.actif
            await s.flush()
            return _rep(x)

    async def carte(self, s: AsyncSession) -> Sequence[ChantierCarteReponse]:
        async with s.begin():
            rows = await repository.carte(s)
        return [ChantierCarteReponse.model_validate(x) for x in rows]

    async def supprimer(self, s: AsyncSession, i: int) -> None:
        action = self._auditeur.auditer(s, "CHANTIER_SUPPRESSION", TypeOperation.DELETE, "Chantier", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            await s.delete(x)
            try:
                await s.flush()
            except IntegrityError as exc:
                raise ChantierUtilise from exc

    async def synchroniser(self, s: AsyncSession, base_url: str) -> SynchronisationReponse:
        async with AsyncClient(base_url=base_url, timeout=30) as client:
            data = (await client.get("/getChantiers")).json()
        created = present = ignored = 0
        for row in data:
            code = (row.get("code") or "").strip()
            if not code:
                ignored += 1
                continue
            async with s.begin():
                if await repository.existe_code(s, code):
                    present += 1
                else:
                    s.add(Chantier(code=code, designation=row.get("designation"), source_erp=True))
                    created += 1
        return SynchronisationReponse(total_recus=len(data), crees=created, deja_presents=present, ignores=ignored)

    async def _obtenir(self, s: AsyncSession, i: int) -> Chantier:
        x = await repository.par_id(s, i)
        if x is None:
            raise ChantierIntrouvable(i)
        return x
