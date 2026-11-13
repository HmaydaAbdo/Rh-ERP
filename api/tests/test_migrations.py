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
from sqlalchemy import BigInteger, Column, Connection, MetaData, String, Table, create_engine, text
from sqlalchemy.engine import make_url

from staport.migrations.deploiement import migrer
from staport.migrations.historique_flyway import sommes_attendues

RACINE = Path(__file__).resolve().parent.parent
SCRIPTS_V44 = list((RACINE / "src" / "staport" / "migrations" / "flyway_v44").glob("V*.sql"))
# Sommes de contrôle enregistrées par Flyway sur la base d'origine (flyway_schema_history, V1 à V3).
# Sommes de contrôle enregistrées par Flyway sur la base d'origine (V1 à V44) : un script figé modifié, même d'un
# commentaire, change sa somme et fait refuser l'estampillage (KAN-240 : V20 modifié par un renommage en bloc).
SOMMES_FLYWAY_REELLES = [
    -238928879,
    1637160539,
    164349915,
    678096492,
    -1103216252,
    553115352,
    -1537015298,
    -445241616,
    -1558136517,
    267216204,
    1662625209,
    -830745142,
    127936828,
    674522724,
    -780372567,
    -2133275086,
    -1290831328,
    980775875,
    -1515690794,
    166664622,
    -1405659830,
    -1383921563,
    -1813513043,
    -1218458979,
    584603305,
    -1514755796,
    -258836298,
    -1911377105,
    -876943342,
    928037331,
    -1715496099,
    1958199860,
    -312618611,
    -1263165067,
    1102136949,
    673368266,
    -404778051,
    -939074117,
    1740814084,
    65875110,
    202456886,
    668838032,
    853069696,
    1351203021,
]
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
        assert (
            c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0005_permission_employee_export"
        )
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
            == "0005_permission_employee_export"
        )
        assert connexion.execute(text("SELECT count(*) FROM role")).scalar_one() > 0
        assert connexion.execute(
            text("SELECT has_table_privilege('staport_env_test', 'audit_journal', 'INSERT')")
        ).scalar_one()
    moteur.dispose()


def _historique_flyway(connexion: Connection, nombre: int, *, altere: int | None = None) -> None:
    """Crée un historique Flyway aux sommes de contrôle réelles des scripts fournis (``altere`` : une somme faussée)."""
    sommes = sommes_attendues()
    connexion.execute(
        text(
            "CREATE TABLE flyway_schema_history "
            "(installed_rank int, version text, type text, success boolean, checksum int)"
        )
    )
    connexion.execute(
        text("INSERT INTO flyway_schema_history VALUES (:i, :v, 'SQL', true, :c)"),
        [{"i": n, "v": str(n), "c": sommes[n] + (1 if n == altere else 0)} for n in range(1, nombre + 1)],
    )


def test_deploiement_estampille_une_base_flyway_v44_sans_rejouer_les_donnees(
    creer_base: Callable[[str], str], monkeypatch: pytest.MonkeyPatch
) -> None:
    url = creer_base("deploiement_flyway")
    command.upgrade(_config(url), "0001_base_v44")  # l'état d'une base Flyway V44 : sans les révisions suivantes
    moteur = create_engine(url)
    with moteur.begin() as connexion:
        roles_avant = connexion.execute(text("SELECT count(*) FROM role")).scalar_one()
        connexion.execute(text("DROP TABLE alembic_version"))
        _historique_flyway(connexion, 44)
    moteur.dispose()
    _variables_migration(url, monkeypatch)
    migrer()
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        assert (
            connexion.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            == "0005_permission_employee_export"
        )
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
        _historique_flyway(connexion, 43)
    moteur.dispose()
    _variables_migration(url, monkeypatch)
    with pytest.raises(RuntimeError, match="stamp refusé"):
        migrer()
    moteur = create_engine(url)
    with moteur.connect() as connexion:
        assert connexion.execute(text("SELECT to_regclass('public.alembic_version')")).scalar_one() is None
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


def test_deploiement_refuse_un_script_flyway_modifie(
    creer_base: Callable[[str], str], monkeypatch: pytest.MonkeyPatch
) -> None:
    url = creer_base("deploiement_modifie")
    moteur = create_engine(url)
    with moteur.begin() as connexion:
        _historique_flyway(connexion, 44, altere=17)
    moteur.dispose()
    _variables_migration(url, monkeypatch)
    with pytest.raises(RuntimeError, match="stamp refusé"):
        migrer()


def test_les_sommes_de_controle_reprennent_l_algorithme_de_flyway() -> None:
    """Sommes réellement enregistrées par Flyway sur la base d'origine (V1 à V44) : scripts figés et algorithme."""
    sommes = sommes_attendues()
    assert len(sommes) == 44
    assert [sommes[n] for n in range(1, 45)] == SOMMES_FLYWAY_REELLES


def test_une_base_flyway_existante_est_estampillee_sans_rejouer_le_schema(creer_base: Callable[[str], str]) -> None:
    url = creer_base("estampillee")
    moteur = create_engine(url)
    with moteur.begin() as c:
        c.execute(text("CREATE TABLE flyway_schema_history (installed_rank int)"))  # base déjà gérée par Flyway
        c.execute(text("CREATE TABLE employe (id int)"))  # schéma existant : un rejeu échouerait
    moteur.dispose()
    config = _config(url)
    command.stamp(config, "0001_base_v44")
    command.upgrade(config, "0001_base_v44")  # ne fait rien : la base est déjà estampillée
    moteur = create_engine(url)
    with moteur.connect() as c:
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0001_base_v44"
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
