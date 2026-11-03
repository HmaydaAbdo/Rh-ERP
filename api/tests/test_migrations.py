"""Base Alembic équivalente à Flyway V1-V44 sur un vrai PostgreSQL (KAN-212, ADR 0016 § 3).

Même image que les tests Java (`PostgresPartage`). Sans Docker, les tests sont ignorés avec la cause.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from testcontainers.community.postgres import PostgresContainer  # pyright: ignore[reportMissingTypeStubs]

RACINE = Path(__file__).resolve().parent.parent
SCRIPTS_V44 = list((RACINE / "src" / "staport" / "migrations" / "flyway_v44").glob("V*.sql"))
IMAGE = "pgvector/pgvector:0.8.7-pg18"
COMPTE_APP = "staport_app"
MOT_DE_PASSE_APP = "mdp-app-essai"
MOT_DE_PASSE_PROPRIETAIRE = "mdp-proprietaire"


def _config(url: str, compte: str | None = None) -> Config:
    config = Config(str(RACINE / "alembic.ini"))
    config.set_main_option("script_location", str(RACINE / "src" / "staport" / "migrations"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    if compte:
        config.set_main_option("compte_applicatif", compte)
        config.set_main_option("mot_de_passe_applicatif", MOT_DE_PASSE_APP)
    return config


@pytest.fixture(scope="module")
def postgres() -> Iterator[PostgresContainer]:
    try:
        conteneur = PostgresContainer(
            IMAGE, username="staport", password=MOT_DE_PASSE_PROPRIETAIRE, dbname="essai", driver="psycopg"
        )
        conteneur.start()
    except Exception as cause:  # Docker absent ou image indisponible
        pytest.skip(f"PostgreSQL de test indisponible : {type(cause).__name__}")
    try:
        yield conteneur
    finally:
        conteneur.stop()


def _url(postgres: PostgresContainer, base: str) -> str:
    return make_url(postgres.get_connection_url()).set(database=base).render_as_string(hide_password=False)


def _base_vierge(postgres: PostgresContainer, nom: str) -> str:
    admin = create_engine(_url(postgres, "essai"), isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{nom}"'))
    admin.dispose()
    return _url(postgres, nom)


def test_la_base_construit_le_schema_et_les_donnees_de_reference(postgres: PostgresContainer) -> None:
    url = _base_vierge(postgres, "neuve")
    command.upgrade(_config(url, COMPTE_APP), "head")
    moteur = create_engine(url)
    with moteur.connect() as c:
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0001_base_v44"
        tables = set(c.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'")).scalars())
        assert {"employe", "paie", "heures_supp", "audit_journal", "permission", "role"} <= tables
        assert c.execute(text("SELECT count(*) FROM permission")).scalar_one() > 0
        assert (
            c.execute(text("SELECT count(*) FROM pg_extension WHERE extname IN ('vector','pgcrypto')")).scalar_one()
            == 2
        )
    moteur.dispose()
    assert len(SCRIPTS_V44) == 44


def test_le_compte_applicatif_ne_peut_pas_reecrire_l_audit(postgres: PostgresContainer) -> None:
    url = _base_vierge(postgres, "droits")
    command.upgrade(_config(url, COMPTE_APP), "head")
    appli = make_url(url).set(username=COMPTE_APP, password=MOT_DE_PASSE_APP).render_as_string(hide_password=False)
    moteur = create_engine(appli)
    with moteur.connect() as c:
        assert c.execute(text("SELECT count(*) FROM permission")).scalar_one() > 0
        c.execute(text("DELETE FROM permission WHERE false"))  # table métier : DELETE permis
        with pytest.raises(Exception, match="permission denied"):
            c.execute(text("DELETE FROM audit_journal WHERE false"))
    moteur.dispose()


def test_une_base_flyway_existante_est_estampillee_sans_rejouer_le_schema(postgres: PostgresContainer) -> None:
    url = _base_vierge(postgres, "estampillee")
    moteur = create_engine(url)
    with moteur.begin() as c:
        c.execute(text("CREATE TABLE flyway_schema_history (installed_rank int)"))  # base déjà gérée par Flyway
        c.execute(text("CREATE TABLE employe (id int)"))  # schéma existant : un rejeu échouerait
    moteur.dispose()
    config = _config(url)
    command.stamp(config, "0001_base_v44")
    command.upgrade(config, "head")  # ne fait rien
    moteur = create_engine(url)
    with moteur.connect() as c:
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0001_base_v44"
        assert (
            c.execute(text("SELECT count(*) FROM information_schema.columns WHERE table_name='employe'")).scalar_one()
            == 1
        )
    moteur.dispose()
