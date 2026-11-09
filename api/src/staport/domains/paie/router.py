from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Authentifie, Contexte, exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.domains.common.schemas import Page
from staport.platform.base_de_donnees import session_requete

from .materiel import tableaux_materiel
from .periode import PeriodePaie, afficher_periode, lire_periode
from .repository import TRIS_PUBLICS
from .schemas import (
    PaieAnalytiqueReponse,
    PaieChantierOption,
    PaieChantierPeriode,
    PaieCreationRequete,
    PaieEffectifMois,
    PaieEquipeOption,
    PaieExportRequete,
    PaieImportAnalyse,
    PaieImportCorrections,
    PaieImportDecisionsEquipe,
    PaieImportDeparts,
    PaieImportResult,
    PaieMaterielTableau,
    PaieMaterielValeur,
    PaieModificationRequete,
    PaieOptionsChantierRequete,
    PaieOptionsEquipeRequete,
    PaieParcoursReponse,
    PaiePeriodeResume,
    PaieRapportRequete,
    PaieRecherche,
    PaieReponse,
    PaieRestauration,
    PaiesPage,
    PaieSuppression,
    PaieSuppressionGroupeRequete,
)

Session = Annotated[AsyncSession, Depends(session_requete)]
PagePaie = Annotated[Pagination, Depends(pagination("periode", TRIS_PUBLICS))]
PageChantiers = Annotated[
    Pagination, Depends(pagination("code", frozenset({"code"}), taille_defaut=30, tri_ignore_si_inconnu=True))
]
PageEquipes = Annotated[
    Pagination,
    Depends(pagination("libelle", frozenset({"libelle", "code"}), taille_defaut=30, tri_ignore_si_inconnu=True)),
]
_PERIODE = TypeAdapter(PeriodePaie)


def _periode_import(
    periode_url: Annotated[str | None, Query(alias="periode")] = None,
    periode_formulaire: Annotated[str | None, Form(alias="periode")] = None,
) -> PeriodePaie:
    """Mois d'un import, lu dans l'URL ou dans le formulaire comme `@RequestParam` de Spring."""
    brute = periode_url if periode_url is not None else periode_formulaire
    if brute is None:
        raise RequestValidationError(
            [{"type": "missing", "loc": ("query", "periode"), "msg": "Field required", "input": None}]
        )
    try:
        return _PERIODE.validate_python(brute)
    except ValidationError as erreur:
        erreurs = [{**detail, "loc": ("body", "periode")} for detail in erreur.errors()]
        raise RequestValidationError(erreurs) from erreur


PeriodeImport = Annotated[PeriodePaie, Depends(_periode_import)]
paies = APIRouter(prefix="/paie", tags=["Paie"])


@paies.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(exiger("PAIE_WRITE")), Depends(exiger("EMPLOYEE_WRITE"))],
)
async def creer(corps: PaieCreationRequete, session: Session, contexte: Contexte) -> PaieReponse:
    return await contexte.paies.creer(session, corps)


@paies.get("/periodes", dependencies=[Depends(exiger("PAIE_READ"))])
async def periodes(session: Session, contexte: Contexte) -> list[PaiePeriodeResume]:
    return await contexte.paies.periodes(session)


@paies.post("/periodes/search", dependencies=[Depends(exiger("PAIE_READ"))])
async def periodes_recherche(
    corps: PaieRecherche | None = None, *, session: Session, contexte: Contexte
) -> list[PaiePeriodeResume]:
    return await contexte.paies.periodes_recherche(session, corps or PaieRecherche())


@paies.post("/chantiers/search", dependencies=[Depends(exiger("PAIE_READ"))])
async def chantiers_recherche(corps: PaieRecherche, session: Session, contexte: Contexte) -> list[PaieChantierPeriode]:
    return await contexte.paies.chantiers_periode(session, corps)


@paies.get("/chantiers", dependencies=[Depends(exiger("PAIE_READ"))])
async def chantiers_periode(periode: PeriodePaie, session: Session, contexte: Contexte) -> list[PaieChantierPeriode]:
    return await contexte.paies.chantiers_periode(session, PaieRecherche(periode=periode))


@paies.get("/materiel", dependencies=[Depends(exiger("PAIE_READ"))])
async def materiel() -> list[PaieMaterielTableau]:
    return tableaux_materiel()


@paies.get("/materiel/valeurs", dependencies=[Depends(exiger("PAIE_EXPORT"))])
async def valeurs_materiel(periode: PeriodePaie, session: Session, contexte: Contexte) -> list[PaieMaterielValeur]:
    return await contexte.materiel_paie.valeurs(session, periode)


@paies.post("/analytique", dependencies=[Depends(exiger("PAIE_READ"))])
async def analytique(corps: PaieRecherche, session: Session, contexte: Contexte) -> PaieAnalytiqueReponse:
    return await contexte.paies.analytique(session, corps, contexte.parametres)


@paies.post("/options/chantiers", dependencies=[Depends(exiger("PAIE_READ"))])
async def options_chantiers(
    corps: PaieOptionsChantierRequete, page: PageChantiers, session: Session, contexte: Contexte
) -> Page[PaieChantierOption]:
    return await contexte.paies.options_chantiers(session, corps, page)


@paies.post("/options/equipes", dependencies=[Depends(exiger("PAIE_READ"))])
async def options_equipes(
    corps: PaieOptionsEquipeRequete, page: PageEquipes, session: Session, contexte: Contexte
) -> Page[PaieEquipeOption]:
    return await contexte.paies.options_equipes(session, corps, page)


@paies.post("/effectifs", dependencies=[Depends(exiger("PAIE_READ"))])
async def effectifs(session: Session, contexte: Contexte, corps: PaieRecherche | None = None) -> list[PaieEffectifMois]:
    return await contexte.paies.effectifs(session, corps or PaieRecherche())


@paies.get("/employes/{id}/parcours", dependencies=[Depends(exiger("PAIE_READ"))])
async def parcours(id: int, session: Session, contexte: Contexte) -> PaieParcoursReponse:
    return await contexte.paies.parcours(session, id)


@paies.post("/export", dependencies=[Depends(exiger("PAIE_EXPORT"))])
async def exporter(corps: PaieExportRequete, session: Session, contexte: Contexte) -> StreamingResponse:
    contenu = await contexte.export_paie.exporter(session, corps)
    await contexte.materiel_paie.memoriser(session, corps.periode, dict(corps.materiel or {}))
    return StreamingResponse(
        contenu,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=Paie_Export_{afficher_periode(corps.periode)}.xlsx"},
    )


@paies.post("/report/pdf", dependencies=[Depends(exiger("PAIE_EXPORT"))])
async def rapport_pdf(corps: PaieRapportRequete, session: Session, contexte: Contexte) -> Response:
    pdf = (await contexte.rapport_paie.generer(session, corps)).getvalue()
    await contexte.materiel_paie.memoriser(session, lire_periode(corps.periode), corps.materiel)
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Paie_Rapport_{corps.periode}.pdf"},
    )


@paies.get("/import/modele", dependencies=[Depends(exiger("PAIE_IMPORT"))])
async def modele_import(contexte: Contexte) -> StreamingResponse:
    return StreamingResponse(
        contexte.import_paie.generer_modele(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Modele_Import_Paie.xlsx"},
    )


def _droits_referentiels(acces: Authentifie) -> dict[str, bool]:
    """Rouvrir un chantier clôturé et créer une fonction inconnue demandent les droits d'écriture de leur domaine."""
    autorites = acces.permissions | acces.roles
    return {"rouvrir_chantiers": "CHANTIER_WRITE" in autorites, "creer_fonctions": "FUNCTION_WRITE" in autorites}


@paies.post("/import/analyse", dependencies=[Depends(exiger("PAIE_IMPORT")), Depends(exiger("PAIE_READ"))])
async def analyser_import(
    periode: PeriodeImport,
    session: Session,
    contexte: Contexte,
    acces: Authentifie,
    file: UploadFile = File(...),  # noqa: B008
) -> PaieImportAnalyse:
    return await contexte.import_paie.analyser(session, await file.read(), periode, **_droits_referentiels(acces))


@paies.post("/import", dependencies=[Depends(exiger("PAIE_IMPORT"))])
async def importer(
    periode: PeriodeImport,
    session: Session,
    contexte: Contexte,
    acces: Authentifie,
    ignorer_salaires_zero: Annotated[bool, Form()] = False,
    departs: Annotated[str | None, Form()] = None,
    equipes: Annotated[str | None, Form()] = None,
    periode_confirmee: Annotated[bool, Form()] = False,
    file: UploadFile = File(...),  # noqa: B008
) -> PaieImportResult:
    try:
        confirmes = PaieImportDeparts.model_validate_json(departs) if departs else PaieImportDeparts()
        decisions = PaieImportDecisionsEquipe.model_validate_json(equipes) if equipes else None
    except ValidationError as erreur:
        raise RequestValidationError(erreur.errors()) from erreur
    return await contexte.import_paie.importer(
        session,
        await file.read(),
        periode,
        ignorer_salaires_zero,
        confirmes,
        decisions,
        periode_confirmee,
        **_droits_referentiels(acces),
    )


@paies.post(
    "/import/corrections",
    dependencies=[Depends(exiger("PAIE_IMPORT")), Depends(exiger("PAIE_READ")), Depends(exiger("EMPLOYEE_WRITE"))],
)
async def corriger_import(
    periode: PeriodeImport,
    corrections: Annotated[str, Form()],
    session: Session,
    contexte: Contexte,
    acces: Authentifie,
    file: UploadFile = File(...),  # noqa: B008
) -> PaieImportAnalyse:
    try:
        corps = PaieImportCorrections.model_validate_json(corrections)
    except ValidationError as erreur:
        raise RequestValidationError(erreur.errors()) from erreur
    return await contexte.import_paie.corriger_et_reanalyser(
        session, await file.read(), periode, corps, **_droits_referentiels(acces)
    )


@paies.put("/{identifiant}", dependencies=[Depends(exiger("PAIE_WRITE")), Depends(exiger("EMPLOYEE_WRITE"))])
async def modifier(
    identifiant: int, corps: PaieModificationRequete, session: Session, contexte: Contexte
) -> PaieReponse:
    return await contexte.paies.modifier(session, identifiant, corps)


@paies.get("/{identifiant}", dependencies=[Depends(exiger("PAIE_READ"))])
async def lire(identifiant: int, session: Session, contexte: Contexte) -> PaieReponse:
    return await contexte.paies.lire(session, identifiant)


@paies.post("/search", dependencies=[Depends(exiger("PAIE_READ"))], response_model=PaiesPage)
async def rechercher(
    page: PagePaie, session: Session, contexte: Contexte, corps: PaieRecherche | None = None
) -> PaiesPage:
    return await contexte.paies.rechercher(session, corps, page)


@paies.post("/suppression", dependencies=[Depends(exiger("PAIE_PURGE"))])
async def supprimer_groupe(
    corps: PaieSuppressionGroupeRequete, session: Session, contexte: Contexte
) -> PaieSuppression:
    return PaieSuppression(
        supprimes=await contexte.paies.supprimer_groupe(session, corps.criteres, corps.nombre_attendu)
    )


@paies.post(
    "/restauration/{identifiant_entree}",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(exiger("PAIE_RESTORE"))],
)
async def restaurer_groupe(identifiant_entree: int, session: Session, contexte: Contexte) -> PaieRestauration:
    return PaieRestauration(restaures=await contexte.paies.restaurer_groupe(session, identifiant_entree))


@paies.delete(
    "/{identifiant}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(exiger("PAIE_DELETE"))],
)
async def supprimer(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.paies.supprimer(session, identifiant)
