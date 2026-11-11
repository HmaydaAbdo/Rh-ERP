import asyncio
from collections.abc import Callable
from datetime import date
from io import BytesIO

import pytest
from alembic import command
from conftest import configuration_alembic
from openpyxl import Workbook
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from staport.domains.audit.ecouteur import installer_ecouteurs
from staport.domains.common.audit_contexte import AuditeurJournal
from staport.domains.employee import audit as _historique_employee  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.paie import audit as _historique_paie  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.paie.exceptions import ErreurImportPaie
from staport.domains.paie.import_service import ServiceImportPaie
from staport.domains.paie.schemas import PaieImportDeparts


def _fichier(fonction: str, chantier: str, equipe: str) -> bytes:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    feuille.append([])
    feuille.append([])
    feuille.append([])
    feuille.append(["Nom corrigé", fonction, "CIN-REF", 25, None, None, 1000, None, None, 1000, None, chantier, equipe])
    sortie = BytesIO()
    classeur.save(sortie)
    return sortie.getvalue()


def test_import_refuse_les_referentiels_absents_et_met_a_jour_les_affectations_existantes(
    creer_base: Callable[[str], str],
) -> None:
    url = creer_base("paie_import_referentiels")
    command.upgrade(configuration_alembic(url), "head")
    installer_ecouteurs()
    asyncio.run(_verifier_referentiels(url), loop_factory=asyncio.SelectorEventLoop)


async def _verifier_referentiels(url: str) -> None:
    moteur = create_async_engine(url)
    sessions = async_sessionmaker(moteur, expire_on_commit=False)
    service = ServiceImportPaie(AuditeurJournal(), aujourd_hui=lambda: date(2026, 12, 1))
    try:
        async with sessions() as session, session.begin():
            ancienne_fonction = (
                await session.execute(text("INSERT INTO fonction (libelle) VALUES ('Ancienne') RETURNING id"))
            ).scalar_one()
            fonction = (
                await session.execute(text("INSERT INTO fonction (libelle) VALUES ('Nouvelle') RETURNING id"))
            ).scalar_one()
            ancien_chantier = (
                await session.execute(text("INSERT INTO chantier (code, actif) VALUES ('ANCIEN', true) RETURNING id"))
            ).scalar_one()
            chantier = (
                await session.execute(text("INSERT INTO chantier (code, actif) VALUES ('NOUVEAU', true) RETURNING id"))
            ).scalar_one()
            ancienne_equipe = (
                await session.execute(
                    text("INSERT INTO equipe (code, libelle) VALUES ('OLD', 'Ancienne') RETURNING id")
                )
            ).scalar_one()
            equipe = (
                await session.execute(
                    text("INSERT INTO equipe (code, libelle) VALUES ('NEW', 'Nouvelle') RETURNING id")
                )
            ).scalar_one()
            employe = (
                await session.execute(
                    text(
                        "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, "
                        "fonction_id, chantier_id, equipe_id, salaire, type_salaire, statut) "
                        "VALUES ('Nom initial', 'CIN-REF', CAST(:naissance AS date), CAST(:embauche AS date), "
                        ":fonction, :chantier, :equipe, "
                        "1000, 'MENSUEL', 'ACTIF') RETURNING id"
                    ),
                    {
                        "naissance": date(1990, 1, 1),
                        "embauche": date(2020, 1, 1),
                        "fonction": ancienne_fonction,
                        "chantier": ancien_chantier,
                        "equipe": ancienne_equipe,
                    },
                )
            ).scalar_one()

        async with sessions() as session:
            invalide = await service.analyser(session, _fichier("ABSENTE", "INCONNU", "XYZ"), 202611)
            assert {(erreur.champ, erreur.raison) for erreur in invalide.erreurs} == {
                ("fonction", "fonction introuvable"),
                ("chantier", "chantier introuvable"),
                ("equipe", "équipe introuvable"),
            }
            with pytest.raises(ErreurImportPaie, match="Le fichier n'est pas prêt"):
                await service.importer(
                    session, _fichier("ABSENTE", "INCONNU", "XYZ"), 202611, False, PaieImportDeparts()
                )

            valide = _fichier("Nouvelle", "NOUVEAU", "NEW")
            initiale = await service.analyser(session, valide, 202611)
            # nom, fonction, chantier et équipe du fichier s'appliquent seuls : aucun écart à confirmer
            assert initiale.ecarts == []
            assert initiale.pret
            assert (await service.importer(session, valide, 202611, False, PaieImportDeparts())).crees == 1
            with pytest.raises(
                ErreurImportPaie, match="La période demande confirmation : La paie de 2026-11 existe déjà"
            ):
                await service.importer(session, valide, 202611, False, PaieImportDeparts())
            # confirmé, le même fichier met à jour le bulletin existant au lieu d'en créer un second
            rejeu = await service.importer(session, valide, 202611, False, PaieImportDeparts(), periode_confirmee=True)
            assert (rejeu.crees, rejeu.mis_a_jour) == (0, 1)

        async with sessions() as session:
            etat = (
                await session.execute(
                    text("SELECT nom_prenom, fonction_id, chantier_id, equipe_id FROM employe WHERE id = :id"),
                    {"id": employe},
                )
            ).one()
            bulletin = (
                await session.execute(
                    text(
                        "SELECT fonction_id, chantier_id, equipe_id, salaire_mensuel "
                        "FROM paie WHERE employee_id = :id AND periode = 202611"
                    ),
                    {"id": employe},
                )
            ).one()
            assert tuple(etat) == ("Nom corrigé", fonction, chantier, equipe)
            assert tuple(bulletin[:3]) == (fonction, chantier, equipe)
            assert bulletin.salaire_mensuel == 1000
            assert (
                await session.execute(
                    text("SELECT count(*) FROM employe_aud WHERE id = :id AND revtype = 1"), {"id": employe}
                )
            ).scalar_one() == 1
            assert (
                await session.execute(
                    text(
                        "SELECT count(*) FROM paie_aud WHERE id IN "
                        "(SELECT id FROM paie WHERE employee_id = :id AND periode = 202611) AND revtype = 0"
                    ),
                    {"id": employe},
                )
            ).scalar_one() == 1
            fonction_absente = await session.execute(text("SELECT count(*) FROM fonction WHERE libelle = 'ABSENTE'"))
            chantier_absent = await session.execute(text("SELECT count(*) FROM chantier WHERE code = 'INCONNU'"))
            equipe_absente = await session.execute(text("SELECT count(*) FROM equipe WHERE code = 'XYZ'"))
            assert fonction_absente.scalar_one() == 0
            assert chantier_absent.scalar_one() == 0
            assert equipe_absente.scalar_one() == 0
    finally:
        await moteur.dispose()


def test_import_cree_les_fonctions_et_rouvre_les_chantiers_avec_les_droits(creer_base: Callable[[str], str]) -> None:
    url = creer_base("paie_import_automatique")
    command.upgrade(configuration_alembic(url), "head")
    installer_ecouteurs()
    asyncio.run(_verifier_automatique(url), loop_factory=asyncio.SelectorEventLoop)


async def _verifier_automatique(url: str) -> None:
    moteur = create_async_engine(url)
    sessions = async_sessionmaker(moteur, expire_on_commit=False)
    service = ServiceImportPaie(AuditeurJournal(), aujourd_hui=lambda: date(2026, 12, 1))
    try:
        async with sessions() as session, session.begin():
            fonction = (
                await session.execute(text("INSERT INTO fonction (libelle) VALUES ('Ancienne') RETURNING id"))
            ).scalar_one()
            chantier = (
                await session.execute(text("INSERT INTO chantier (code, actif) VALUES ('FERME', false) RETURNING id"))
            ).scalar_one()
            await session.execute(
                text(
                    "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, "
                    "salaire, type_salaire, statut) VALUES ('Nom corrigé', 'CIN-REF', "
                    "CAST(:n AS date), CAST(:e AS date), "
                    ":f, :c, 1000, 'MENSUEL', 'ACTIF')"
                ),
                {"n": date(1990, 1, 1), "e": date(2020, 1, 1), "f": fonction, "c": chantier},
            )
        fichier = _fichier("Nouvelle fonction", "FERME", "")

        async with sessions() as session:
            sans_droit = await service.analyser(session, fichier, 202611)
            assert {(e.champ, e.raison.split(" :")[0]) for e in sans_droit.erreurs} == {
                ("fonction", "fonction introuvable"),
                ("chantier", "chantier clôturé"),
            }
            assert [c.code for c in sans_droit.chantiers_clotures] == ["FERME"]
            assert not sans_droit.fonctions_a_creer
            assert not sans_droit.chantiers_a_rouvrir
            with pytest.raises(ErreurImportPaie, match="Le fichier n'est pas prêt"):
                await service.importer(session, fichier, 202611, False, PaieImportDeparts())

        async with sessions() as session:
            avec_droits = await service.analyser(session, fichier, 202611, rouvrir_chantiers=True, creer_fonctions=True)
            assert avec_droits.erreurs == []
            assert [f.libelle for f in avec_droits.fonctions_a_creer] == ["Nouvelle fonction"]
            assert [c.code for c in avec_droits.chantiers_a_rouvrir] == ["FERME"]
            assert not avec_droits.chantiers_clotures
            nombre = (await session.execute(text("SELECT count(*) FROM fonction"))).scalar_one()
            assert nombre == 1, "l'analyse n'écrit rien"

        async with sessions() as session:
            bilan = await service.importer(
                session, fichier, 202611, False, PaieImportDeparts(), rouvrir_chantiers=True, creer_fonctions=True
            )
            assert (bilan.crees, bilan.fonctions_creees, bilan.chantiers_rouverts) == (1, 1, 1)

        async with sessions() as session:
            assert (await session.execute(text("SELECT actif FROM chantier WHERE code = 'FERME'"))).scalar_one() is True
            creee = (
                await session.execute(text("SELECT id FROM fonction WHERE libelle = 'Nouvelle fonction'"))
            ).scalar_one()
            assert (
                await session.execute(text("SELECT fonction_id FROM paie WHERE periode = 202611"))
            ).scalar_one() == creee
    finally:
        await moteur.dispose()
