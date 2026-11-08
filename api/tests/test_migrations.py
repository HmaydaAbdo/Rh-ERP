"""Base Alembic équivalente à Flyway V1-V44 sur un vrai PostgreSQL (KAN-212, ADR 0016 § 3).

Même image que les tests Java (`PostgresPartage`). Sans Docker, les tests sont ignorés avec la cause.
"""

from collections.abc import Callable
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import BigInteger, Column, MetaData, String, Table, create_engine, text
from sqlalchemy.engine import make_url

from staport.migrations.deploiement import migrer

RACINE = Path(__file__).resolve().parent.parent
SCRIPTS_V44 = list((RACINE / "src" / "staport" / "migrations" / "flyway_v44").glob("V*.sql"))
COMPTE_APP = "staport_app"
MOT_DE_PASSE_APP = "mdp-app-essai"


def _variables_migration(url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    adresse = make_url(url)
    for nom, valeur in {
        "DB_HOST": adresse.host,
        "DB_PORT": str(adresse.port),
        "DB_NAME": adresse.database,
        "DB_MIGRATION_USER": adresse.username,
        "DB_MIGRATION_PASSWORD": adresse.password,
        "DB_USER": "staport_env_test",
        "DB_PASSWORD": MOT_DE_PASSE_APP,
    }.items():
        assert valeur is not None
        monkeypatch.setenv(nom, valeur)


def _config(url: str, compte: str | None = None) -> Config:
    config = Config(str(RACINE / "alembic.ini"))
    config.set_main_option("script_location", str(RACINE / "src" / "staport" / "migrations"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    if compte:
        config.set_main_option("compte_applicatif", compte)
        config.set_main_option("mot_de_passe_applicatif", MOT_DE_PASSE_APP)
    return config


def test_la_base_construit_le_schema_et_les_donnees_de_reference(creer_base: Callable[[str], str]) -> None:
    url = creer_base("neuve")
    command.upgrade(_config(url, COMPTE_APP), "head")
    moteur = create_engine(url)
    with moteur.connect() as c:
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0002_paie_materiel"
        tables = set(c.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'")).scalars())
        assert {"employe", "paie", "heures_supp", "audit_journal", "permission", "role"} <= tables
        assert c.execute(text("SELECT count(*) FROM permission")).scalar_one() > 0
        assert (
            c.execute(text("SELECT count(*) FROM pg_extension WHERE extname IN ('vector','pgcrypto')")).scalar_one()
            == 2
        )
    moteur.dispose()
    assert len(SCRIPTS_V44) == 44


def test_le_compte_applicatif_ne_peut_pas_reecrire_l_audit(creer_base: Callable[[str], str]) -> None:
    url = creer_base("droits")
    command.upgrade(_config(url, COMPTE_APP), "head")
    appli = make_url(url).set(username=COMPTE_APP, password=MOT_DE_PASSE_APP).render_as_string(hide_password=False)
    moteur = create_engine(appli)
    with moteur.connect() as c:
        assert c.execute(text("SELECT count(*) FROM permission")).scalar_one() > 0
        c.execute(text("DELETE FROM permission WHERE false"))  # table métier : DELETE permis
        with pytest.raises(Exception, match="permission denied"):
            c.execute(text("DELETE FROM audit_journal WHERE false"))
    moteur.dispose()


def test_migration_par_environnement_applique_les_droits(
    creer_base: Callable[[str], str], monkeypatch: pytest.MonkeyPatch
) -> None:
    url = creer_base("droits_env")
    _variables_migration(url, monkeypatch)
    config = Config(str(RACINE / "alembic.ini"))
    config.set_main_option("script_location", str(RACINE / "src" / "staport" / "migrations"))
    command.upgrade(config, "head")
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        assert connexion.execute(
            text("SELECT has_table_privilege('staport_env_test', 'audit_journal', 'INSERT')")
        ).scalar_one()
        assert not connexion.execute(
            text("SELECT has_table_privilege('staport_env_test', 'audit_journal', 'DELETE')")
        ).scalar_one()
    moteur.dispose()


def test_deploiement_sur_base_neuve_et_relance_sont_idempotents(
    creer_base: Callable[[str], str], monkeypatch: pytest.MonkeyPatch
) -> None:
    url = creer_base("deploiement_neuf")
    _variables_migration(url, monkeypatch)
    migrer()
    migrer()
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        assert connexion.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0002_paie_materiel"
        assert connexion.execute(text("SELECT count(*) FROM role")).scalar_one() > 0
        assert connexion.execute(
            text("SELECT has_table_privilege('staport_env_test', 'audit_journal', 'INSERT')")
        ).scalar_one()
    moteur.dispose()


def test_deploiement_estampille_une_base_flyway_v44_sans_rejouer_les_donnees(
    creer_base: Callable[[str], str], monkeypatch: pytest.MonkeyPatch
) -> None:
    url = creer_base("deploiement_flyway")
    command.upgrade(_config(url), "0001_base_v44")  # l'état d'une base Flyway V44 : sans les révisions suivantes
    moteur = create_engine(url)
    with moteur.begin() as connexion:
        roles_avant = connexion.execute(text("SELECT count(*) FROM role")).scalar_one()
        connexion.execute(text("DROP TABLE alembic_version"))
        connexion.execute(
            text("CREATE TABLE flyway_schema_history (installed_rank int, version text, type text, success boolean)")
        )
        connexion.execute(
            text("INSERT INTO flyway_schema_history VALUES (:i, :v, 'SQL', true)"),
            [{"i": n, "v": str(n)} for n in range(1, 45)],
        )
    moteur.dispose()
    _variables_migration(url, monkeypatch)
    migrer()
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        assert connexion.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0002_paie_materiel"
        assert connexion.execute(text("SELECT count(*) FROM role")).scalar_one() == roles_avant
        assert not connexion.execute(
            text("SELECT has_table_privilege('staport_env_test', 'flyway_schema_history', 'INSERT')")
        ).scalar_one()
    moteur.dispose()


def test_deploiement_refuse_un_historique_flyway_partiel(
    creer_base: Callable[[str], str], monkeypatch: pytest.MonkeyPatch
) -> None:
    url = creer_base("deploiement_partiel")
    moteur = create_engine(url)
    with moteur.begin() as connexion:
        connexion.execute(
            text("CREATE TABLE flyway_schema_history (installed_rank int, version text, type text, success boolean)")
        )
        connexion.execute(
            text("INSERT INTO flyway_schema_history VALUES (:i, :v, 'SQL', true)"),
            [{"i": n, "v": str(n)} for n in range(1, 44)],
        )
    moteur.dispose()
    _variables_migration(url, monkeypatch)
    with pytest.raises(RuntimeError, match="stamp refusé"):
        migrer()
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        assert connexion.execute(text("SELECT to_regclass('public.alembic_version')")).scalar_one() is None
    moteur.dispose()


def test_une_base_flyway_existante_est_estampillee_sans_rejouer_le_schema(creer_base: Callable[[str], str]) -> None:
    url = creer_base("estampillee")
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
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0002_paie_materiel"
        assert (
            c.execute(text("SELECT count(*) FROM information_schema.columns WHERE table_name='employe'")).scalar_one()
            == 1
        )
    moteur.dispose()


def test_les_modeles_correspondent_exactement_a_la_base_alembic(creer_base: Callable[[str], str]) -> None:
    """Contrôle de dérive : l'autogénération ne doit proposer aucune différence (modèles migrés vs base réelle)."""
    from staport.migrations.derive import Base, inclure

    url = creer_base("derive")
    command.upgrade(_config(url), "head")
    moteur = create_engine(url)
    with moteur.connect() as c:
        contexte = MigrationContext.configure(c, opts={"include_object": inclure, "compare_type": True})
        differences = compare_metadata(contexte, Base.metadata)
        # Témoin : le contrôle détecte bien une dérive (colonne plus courte que dans la base).
        fausse = MetaData()
        Table("permission", fausse, Column("id", BigInteger, primary_key=True), Column("code", String(10)))
        temoin = compare_metadata(
            MigrationContext.configure(c, opts={"include_object": inclure, "compare_type": True}), fausse
        )
    moteur.dispose()
    assert differences == []
    assert temoin != []
