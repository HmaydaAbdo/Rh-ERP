"""Base Alembic (scripts SQL V1-V44 puis révisions) sur un vrai PostgreSQL (KAN-212).

Même image PostgreSQL que les autres tests (`conftest.py`). Sans Docker, les tests sont ignorés avec la cause.
"""

from collections.abc import Callable
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import BigInteger, Column, Connection, MetaData, String, Table, create_engine, text
from sqlalchemy.engine import make_url

from staport.migrations.deploiement import migrer

RACINE = Path(__file__).resolve().parent.parent
SCRIPTS_V44 = list((RACINE / "src" / "staport" / "migrations" / "base_v44").glob("V*.sql"))

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
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0006_retrait_table_suivi"
        tables = set(c.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'")).scalars())
        assert {"employe", "paie", "heures_supp", "audit_journal", "permission", "role"} <= tables
        titulaires = c.execute(
            text(
                "SELECT r.nom FROM role r JOIN role_permission rp ON rp.role_id = r.id "
                "JOIN permission p ON p.id = rp.permission_id WHERE p.code = 'EMPLOYEE_EXPORT' ORDER BY r.nom"
            )
        ).scalars()
        assert list(titulaires) == ["PAIE_MANAGER", "SYSTEM_ADMIN"]
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
        assert (
            connexion.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            == "0006_retrait_table_suivi"
        )
        assert connexion.execute(text("SELECT count(*) FROM role")).scalar_one() > 0
        assert connexion.execute(
            text("SELECT has_table_privilege('staport_env_test', 'audit_journal', 'INSERT')")
        ).scalar_one()
    moteur.dispose()


COLONNES_MONTANTS = {
    "employe": ["salaire"],
    "paie": ["salaire_mensuel", "prime_roulage_ordinaire", "prime_roulage_dimanche", "salaire_total"],
    "heures_supp": ["salaire_reference", "s_h", "montant", "stc_dh", "forfait", "net_a_payer"],
}


def _echelles(connexion: Connection) -> set[tuple[str, str, int]]:
    lignes = connexion.execute(
        text(
            "SELECT table_name, column_name, numeric_scale FROM information_schema.columns "
            "WHERE table_name IN ('employe', 'employe_aud', 'paie', 'paie_aud', 'heures_supp', 'heures_supp_aud') "
            "AND numeric_scale IS NOT NULL AND column_name NOT IN ('latitude', 'longitude')"
        )
    )
    return {(table, colonne, echelle) for table, colonne, echelle in lignes}


def test_tous_les_montants_sont_des_entiers_de_dirham_et_le_retour_arriere_rend_les_centimes(
    creer_base: Callable[[str], str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Salaire, bulletin, heures supplémentaires et leurs tables d'audit : plus aucune colonne de montant à centimes."""
    url = creer_base("montants_entiers")
    _variables_migration(url, monkeypatch)
    migrer()
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        echelles = _echelles(connexion)
        for table, colonnes in COLONNES_MONTANTS.items():
            for colonne in colonnes:
                assert (table, colonne, 0) in echelles, (table, colonne)
        for table, colonne in (
            ("paie", "nombre_jours_travailles"),
            ("paie", "jours_recuperation_ouvrable"),
            ("paie", "jours_recuperation_dimanche"),
            ("heures_supp", "p_h"),
        ):
            assert (table, colonne, 0) in echelles, (table, colonne)
        # Les anciennes traces restent append-only et conservent leur échelle historique.
        assert ("paie_aud", "nombre_jours_travailles", 2) in echelles
        assert ("paie_aud", "jours_recuperation_ouvrable", 2) in echelles
        assert ("paie_aud", "jours_recuperation_dimanche", 2) in echelles
        assert ("heures_supp_aud", "p_h", 1) in echelles
        # Expression de conversion de la révision : 0,5 descend, 0,51 monte (HALF_DOWN, comme `arrondir_montant`).
        assert connexion.execute(text("SELECT CEIL(4500.5 - 0.5), CEIL(4500.51 - 0.5), CEIL(0.4 - 0.5)")).one() == (
            4500,
            4501,
            0,
        )
    moteur.dispose()
    config = _config(url)
    command.downgrade(config, "0002_paie_materiel")
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        assert ("employe", "salaire", 2) in _echelles(connexion)
    moteur.dispose()


def test_une_base_de_production_restauree_monte_a_la_derniere_revision_et_perd_l_historique_de_l_ancien_outil(
    creer_base: Callable[[str], str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Base de production restaurée : révision 0004 et table de suivi obsolète encore présente."""
    url = creer_base("deploiement_restaure")
    command.upgrade(_config(url), "0004_nombres_metier_entiers")
    moteur = create_engine(url)
    with moteur.begin() as connexion:
        connexion.execute(text("CREATE TABLE flyway_schema_history (installed_rank int)"))
        roles_avant = connexion.execute(text("SELECT count(*) FROM role")).scalar_one()
    moteur.dispose()
    _variables_migration(url, monkeypatch)
    migrer()
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        assert (
            connexion.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            == "0006_retrait_table_suivi"
        )
        assert connexion.execute(text("SELECT to_regclass('public.flyway_schema_history')")).scalar_one() is None
        assert connexion.execute(text("SELECT count(*) FROM role")).scalar_one() == roles_avant
    moteur.dispose()


def test_deploiement_refuse_un_schema_non_vide_sans_historique_alembic(
    creer_base: Callable[[str], str], monkeypatch: pytest.MonkeyPatch
) -> None:
    url = creer_base("deploiement_sans_historique")
    moteur = create_engine(url)
    with moteur.begin() as connexion:
        connexion.execute(text("CREATE TABLE employe (id int)"))
    moteur.dispose()
    _variables_migration(url, monkeypatch)
    with pytest.raises(RuntimeError, match="restauration requise"):
        migrer()
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        assert connexion.execute(text("SELECT to_regclass('public.alembic_version')")).scalar_one() is None
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
