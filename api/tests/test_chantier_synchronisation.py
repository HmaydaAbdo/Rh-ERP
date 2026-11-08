"""Synchronisation des chantiers avec l'ERP (déclenchement manuel et planifié) et mesures Prometheus.

Couvre ce que garantissait l'ancien backend : ajout par code sans tenir compte de la casse, aucune modification d'un
chantier existant, lignes sans code ignorées, bilan audité (`CHANTIER_SYNCHRONISATION`), ERP indisponible refusé en
`503` et mesuré, planification lue dans le paramètre, exécutions du compte « Système » d'origine `TACHE_PLANIFIEE`.
"""

# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

import asyncio
import json
import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from conftest import Plateforme
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from staport.domains.chantier.planification import PlanificationSynchronisation
from staport.domains.parametre.catalogue import declencheur_cron, expression_cron_valide


@pytest.fixture
def admin(plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    acces = connecter("admin-essai", "mdp-admin-essai-123")["accessToken"]
    plateforme.client.cookies.clear()
    return {"Authorization": f"Bearer {acces}"}


@pytest.fixture
def erp(plateforme: Plateforme) -> Iterator[Callable[[httpx.Response | list[dict[str, Any]]], None]]:
    """Remplace l'ERP : le transport simulé répond la liste (ou la réponse) donnée."""
    service = plateforme.contexte.chantiers
    avant = service.transport_erp

    def repondre(contenu: httpx.Response | list[dict[str, Any]]) -> None:
        reponse = contenu if isinstance(contenu, httpx.Response) else httpx.Response(200, json=contenu)
        service.transport_erp = httpx.MockTransport(lambda _requete: reponse)

    yield repondre
    service.transport_erp = avant


def _code() -> str:
    return f"S{uuid.uuid4().hex[:8].upper()}"


def _lignes(p: Plateforme, sql: str, **parametres: Any) -> list[dict[str, Any]]:
    with p.moteur.connect() as c:
        return [dict(ligne) for ligne in c.execute(text(sql), parametres).mappings()]


def test_la_synchronisation_ajoute_les_absents_sans_toucher_aux_existants(
    plateforme: Plateforme, admin: dict[str, str], erp: Callable[[Any], None]
) -> None:
    existant, nouveau = _code(), _code()
    with plateforme.moteur.begin() as c:
        c.execute(
            text("INSERT INTO chantier (code, designation, actif) VALUES (:c, 'Désignation locale', false)"),
            {"c": existant},
        )
    erp(
        [
            {"id_chantier": 1, "code": existant.lower(), "designation": "Autre désignation ERP", "CodeErreur": 0},
            {"id_chantier": 2, "code": f"  {nouveau}  ", "designation": "Nouveau chantier", "CodeErreur": 0},
            {"id_chantier": 3, "code": "   ", "designation": "Sans code", "CodeErreur": 0},
            {"id_chantier": 4, "designation": "Code absent"},
        ]
    )
    succes = plateforme.contexte.chantiers.metriques.succes

    reponse = plateforme.client.post("/chantiers/sync", headers=admin)

    assert reponse.status_code == 200, reponse.text
    assert reponse.json() == {"totalRecus": 4, "crees": 1, "dejaPresents": 1, "ignores": 2}
    assert _lignes(plateforme, "SELECT designation, actif FROM chantier WHERE code = :c", c=existant) == [
        {"designation": "Désignation locale", "actif": False}
    ]
    cree = _lignes(plateforme, "SELECT designation, source_erp, actif FROM chantier WHERE code = :c", c=nouveau)
    assert cree == [{"designation": "Nouveau chantier", "source_erp": True, "actif": True}]
    assert plateforme.contexte.chantiers.metriques.succes == succes + 1


def test_le_bilan_est_audite_avec_son_perimetre(
    plateforme: Plateforme, admin: dict[str, str], erp: Callable[[Any], None]
) -> None:
    avant = _lignes(plateforme, "SELECT count(*) AS n FROM audit_journal WHERE action = 'CHANTIER_SYNCHRONISATION'")[0][
        "n"
    ]
    erp([{"code": _code(), "designation": "Audité"}, {"code": ""}])

    assert plateforme.client.post("/chantiers/sync", headers=admin).status_code == 200

    entrees = _lignes(
        plateforme,
        "SELECT origine, nombre_elements, perimetre, resultat FROM audit_journal "
        "WHERE action = 'CHANTIER_SYNCHRONISATION' ORDER BY id DESC",
    )
    assert len(entrees) == avant + 1
    derniere = entrees[0]
    assert derniere["origine"] == "API"
    assert derniere["nombre_elements"] == 1
    perimetre = derniere["perimetre"]
    perimetre = json.loads(perimetre) if isinstance(perimetre, str) else perimetre
    assert perimetre == {"recus": 2, "dejaPresents": 0, "ignores": 1}


@pytest.mark.parametrize(
    "reponse",
    [httpx.Response(503), httpx.Response(200, content=b"pas du json"), httpx.Response(200, json={"code": "X"})],
)
def test_un_erp_indisponible_ou_illisible_est_refuse_en_503_et_mesure(
    plateforme: Plateforme, admin: dict[str, str], erp: Callable[[Any], None], reponse: httpx.Response
) -> None:
    erp(reponse)
    echecs = plateforme.contexte.chantiers.metriques.echecs

    resultat = plateforme.client.post("/chantiers/sync", headers=admin)

    assert resultat.status_code == 503
    assert "ERP" in resultat.json()["message"]
    assert plateforme.contexte.chantiers.metriques.echecs == echecs + 1


def test_les_mesures_sont_exposees_au_format_prometheus(plateforme: Plateforme) -> None:
    reponse = plateforme.client.get("/metrics")
    assert reponse.status_code == 200
    corps = reponse.text
    for serie in (
        "rh_chantier_sync_success_total",
        "rh_chantier_sync_failure_total",
        "rh_chantier_sync_records_ignored_total",
        "rh_chantier_sync_duration_seconds_bucket",
        "rh_audit_integrite_compromise",
        "rh_audit_chaine_invalide",
        "rh_audit_evenement_securite_total",
    ):
        assert serie in corps, serie
    assert "chantiers.example" not in corps, "aucune donnée de configuration dans les mesures"


@pytest.mark.parametrize(
    ("expression", "valide"),
    [
        ("0 0 23 * * *", True),
        ("0 */5 * * * MON-FRI", True),
        ("0 0 23 * *", False),
        ("0 0 23 * * 1", False),
        ("x", False),
    ],
)
def test_expression_cron_a_six_champs(expression: str, valide: bool) -> None:
    assert expression_cron_valide(expression) is valide


def test_planification_calcule_la_prochaine_echeance_depuis_le_parametre(plateforme: Plateforme) -> None:
    async def attente(maintenant: datetime) -> float:
        moteur = create_async_engine(plateforme.url)
        try:
            planification = PlanificationSynchronisation(
                async_sessionmaker(moteur, expire_on_commit=False),
                plateforme.contexte.parametres,
                plateforme.contexte.chantiers,
                "http://chantiers.example/getChantiers",
                maintenant=lambda: maintenant,
            )
            return await planification.secondes_avant_prochaine_execution()
        finally:
            await moteur.dispose()

    defaut = asyncio.run(attente(datetime(2026, 11, 8, 22, 0, 0, tzinfo=UTC)), loop_factory=asyncio.SelectorEventLoop)
    assert defaut == 3600.0  # le paramètre vaut « 0 0 23 * * * » : 23 h UTC
    apres = asyncio.run(attente(datetime(2026, 11, 8, 23, 0, 1, tzinfo=UTC)), loop_factory=asyncio.SelectorEventLoop)
    assert apres == 24 * 3600 - 1
    assert declencheur_cron("0 0 23 * * *") is not None


def test_une_execution_planifiee_est_attribuee_au_systeme_avec_l_origine_tache_planifiee(
    plateforme: Plateforme, erp: Callable[[Any], None]
) -> None:
    code = _code()
    erp([{"code": code, "designation": "Planifié"}])

    async def executer() -> None:
        moteur = create_async_engine(plateforme.url)
        try:
            planification = PlanificationSynchronisation(
                async_sessionmaker(moteur, expire_on_commit=False),
                plateforme.contexte.parametres,
                plateforme.contexte.chantiers,
                "http://chantiers.example/getChantiers",
            )
            await planification.executer()
        finally:
            await moteur.dispose()

    asyncio.run(executer(), loop_factory=asyncio.SelectorEventLoop)

    assert _lignes(plateforme, "SELECT 1 FROM chantier WHERE code = :c", c=code)
    revision = _lignes(
        plateforme,
        "SELECT r.utilisateur_nom, r.origine FROM chantier_aud a JOIN audit_revision r ON r.id = a.rev "
        "WHERE a.code = :c",
        c=code,
    )
    assert revision == [{"utilisateur_nom": "Système", "origine": "TACHE_PLANIFIEE"}]
    journal = _lignes(
        plateforme,
        "SELECT utilisateur_nom, origine FROM audit_journal WHERE action = 'CHANTIER_SYNCHRONISATION' "
        "ORDER BY id DESC LIMIT 1",
    )
    assert journal == [{"utilisateur_nom": "Système", "origine": "TACHE_PLANIFIEE"}]


def test_une_execution_planifiee_en_echec_ne_leve_jamais(plateforme: Plateforme, erp: Callable[[Any], None]) -> None:
    erp(httpx.Response(500))
    echecs = plateforme.contexte.chantiers.metriques.echecs

    async def executer() -> None:
        moteur = create_async_engine(plateforme.url)
        try:
            await PlanificationSynchronisation(
                async_sessionmaker(moteur, expire_on_commit=False),
                plateforme.contexte.parametres,
                plateforme.contexte.chantiers,
                "http://chantiers.example/getChantiers",
            ).executer()
        finally:
            await moteur.dispose()

    asyncio.run(executer(), loop_factory=asyncio.SelectorEventLoop)

    assert plateforme.contexte.chantiers.metriques.echecs == echecs + 1
