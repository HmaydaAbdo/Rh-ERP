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
SOMMES_FLYWAY_REELLES = [-238928879, 1637160539, 164349915]
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
            c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0003_heures_supp_deux_decimales"
        )
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
        assert (
            connexion.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            == "0003_heures_supp_deux_decimales"
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
            == "0003_heures_supp_deux_decimales"
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
    """Sommes réellement enregistrées par Flyway sur la base d'origine (V1 à V3) : l'algorithme est celui de Flyway."""
    sommes = sommes_attendues()
    assert len(sommes) == 44
    assert [sommes[n] for n in range(1, 4)] == SOMMES_FLYWAY_REELLES[:3]


def test_une_base_flyway_existante_est_estampillee_sans_rejouer_le_schema(creer_base: Callable[[str], str]) -> None:
    url = creer_base("estampillee")
    moteur = create_engine(url)
    with moteur.begin() as c:
        c.execute(text("CREATE TABLE flyway_schema_history (installed_rank int)"))  # base déjà gérée par Flyway
        c.execute(text("CREATE TABLE employe (id int)"))  # schéma existant : un rejeu échouerait
    moteur.dispose()
    config = _config(url)
    command.stamp(config, "0001_base_v44")
    command.upgrade(config, "0001_base_v44")  # ne fait rien : la base est déjà à cette révision
    moteur = create_engine(url)
    with moteur.connect() as c:
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0001_base_v44"
        assert (
            c.execute(text("SELECT count(*) FROM information_schema.columns WHERE table_name='employe'")).scalar_one()
            == 1
        )
    moteur.dispose()


def test_les_heures_supp_existantes_sont_recalculees_a_deux_decimales(creer_base: Callable[[str], str]) -> None:
    url = creer_base("heures_supp_decimales")
    config = _config(url)
    command.upgrade(config, "0002_paie_materiel")
    moteur = create_engine(url)
    with moteur.begin() as c:
        fonction = c.execute(text("INSERT INTO fonction (libelle) VALUES ('F') RETURNING id")).scalar_one()
        chantier = c.execute(
            text("INSERT INTO chantier (code, designation) VALUES ('C', 'C') RETURNING id")
        ).scalar_one()
        lignes = [  # (CIN, type, salaire, P/H, STC ?, forfait, montant entier V44)
            ("H1", "MENSUEL", 4500, "7.5", False, None, 130),
            ("H2", "JOURNALIER", "250.50", "1.5", True, None, 38),
            ("H3", "MENSUEL", 4500, "2", False, 40, 35),
        ]
        for cin, type_salaire, salaire, heures, stc, forfait, entier in lignes:
            employe = c.execute(
                text(
                    "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, "
                    "statut, "
                    "salaire, type_salaire) VALUES (:c, :c, '1990-01-01', '2020-01-01', :f, :ch, 'ACTIF', :s, :t) "
                    "RETURNING id"
                ),
                {"c": cin, "f": fonction, "ch": chantier, "s": salaire, "t": type_salaire},
            ).scalar_one()
            paie = c.execute(
                text(
                    "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, nombre_jours_travailles, "
                    "salaire_mensuel, salaire_total) VALUES (:e, 202501, :f, :c, 26, :s, :s) RETURNING id"
                ),
                {"e": employe, "f": fonction, "c": chantier, "s": salaire},
            ).scalar_one()
            c.execute(
                text(
                    "INSERT INTO heures_supp (employee_id, paie_id, fonction_id, chantier_id, periode, "
                    "salaire_reference, type_salaire_reference, s_h, p_h, montant, est_stc_ou_sortie, stc_dh, forfait, "
                    "net_a_payer) VALUES (:e, :p, :f, :c, 202501, :s, :t, 17, :h, :m, :stc, :sd, :fo, :n)"
                ),
                {
                    "e": employe, "p": paie, "f": fonction, "c": chantier, "s": salaire, "t": type_salaire,
                    "h": heures, "m": entier, "stc": stc, "sd": entier if stc else 0, "fo": forfait,
                    "n": entier - (entier if stc else 0) + (forfait or 0),
                },
            )  # fmt: skip
    moteur.dispose()
    command.upgrade(config, "head")
    moteur = create_engine(url)
    with moteur.connect() as c:
        lues = c.execute(
            text(
                "SELECT e.cin, h.s_h, h.montant, h.stc_dh, h.forfait, h.net_a_payer FROM heures_supp h "
                "JOIN employe e ON e.id = h.employee_id ORDER BY e.cin"
            )
        ).all()
    moteur.dispose()
    assert [tuple(map(str, ligne)) for ligne in lues] == [
        ("H1", "17.31", "129.83", "0.00", "None", "129.83"),  # 4500 / 260 = 17,3077 ; 17,31 x 7,5 = 129,825
        ("H2", "25.05", "37.58", "37.58", "None", "0.00"),  # 250,50 / 10 ; 25,05 x 1,5 = 37,575 ; STC = montant
        ("H3", "17.31", "34.62", "0.00", "40.00", "74.62"),  # le forfait saisi n'est pas recalculé
    ]


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
