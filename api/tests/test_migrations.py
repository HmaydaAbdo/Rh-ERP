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
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0010_role_charge_rh"
        tables = set(c.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'")).scalars())
        assert {"employe", "paie", "heures_supp", "audit_journal", "permission", "role"} <= tables
        titulaires = c.execute(
            text(
                "SELECT r.nom FROM role r JOIN role_permission rp ON rp.role_id = r.id "
                "JOIN permission p ON p.id = rp.permission_id WHERE p.code = 'EMPLOYEE_EXPORT' ORDER BY r.nom"
            )
        ).scalars()
        assert list(titulaires) == ["CHARGE_RH", "PAIE_MANAGER", "SYSTEM_ADMIN"]
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
        assert connexion.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0010_role_charge_rh"
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
        assert connexion.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0010_role_charge_rh"
        assert connexion.execute(text("SELECT to_regclass('public.flyway_schema_history')")).scalar_one() is None
        # Les rôles existants sont conservés ; seul CHARGE_RH (révision 0010) s'ajoute.
        assert connexion.execute(text("SELECT count(*) FROM role")).scalar_one() == roles_avant + 1
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


def test_la_revision_0009_corrige_les_types_de_salaire_et_recalcule_les_heures_supp(
    creer_base: Callable[[str], str],
) -> None:
    """5 500 DH « journalier » (S/H 550) et 150 DH « mensuel » reprennent le type du montant ; un type juste reste."""
    url = creer_base("type_salaire_deduit")
    command.upgrade(_config(url), "0008_retrait_vues_libres")
    moteur = create_engine(url)
    with moteur.begin() as c:
        fonction = c.execute(text("INSERT INTO fonction (libelle) VALUES ('Pneumaticien') RETURNING id")).scalar_one()
        chantier = c.execute(text("INSERT INTO chantier (code) VALUES ('C168') RETURNING id")).scalar_one()
        identifiants: dict[str, int] = {}
        for cin, salaire, type_salaire in (
            ("ERR1", 5500, "JOURNALIER"),
            ("ERR2", 150, "MENSUEL"),
            ("OK1", 3000, "MENSUEL"),
        ):
            employe = c.execute(
                text(
                    "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, "
                    "statut, salaire, type_salaire) VALUES (:n, :cin, '1990-01-01', '2020-01-01', :f, :c, 'ACTIF', "
                    ":s, :t) RETURNING id"
                ),
                {"n": cin, "cin": cin, "f": fonction, "c": chantier, "s": salaire, "t": type_salaire},
            ).scalar_one()
            identifiants[cin] = employe
            paie = c.execute(
                text(
                    "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, nombre_jours_travailles, "
                    "salaire_mensuel, salaire_total) VALUES (:e, 202610, :f, :c, 26, :s, :s) RETURNING id"
                ),
                {"e": employe, "f": fonction, "c": chantier, "s": salaire},
            ).scalar_one()
            taux = salaire // 10 if type_salaire == "JOURNALIER" else round(salaire / 260)
            c.execute(
                text(
                    "INSERT INTO heures_supp (employee_id, paie_id, fonction_id, chantier_id, periode, "
                    "salaire_reference, type_salaire_reference, s_h, p_h, montant, est_stc_ou_sortie, stc_dh, "
                    "forfait, net_a_payer) VALUES (:e, :p, :f, :c, 202610, :s, :t, :sh, 15, :m, false, 0, NULL, :m)"
                ),
                {
                    "e": employe,
                    "p": paie,
                    "f": fonction,
                    "c": chantier,
                    "s": salaire,
                    "t": type_salaire,
                    "sh": taux,
                    "m": taux * 15,
                },
            )
    moteur.dispose()

    command.upgrade(_config(url), "head")

    moteur = create_engine(url)
    with moteur.connect() as c:
        types = dict(c.execute(text("SELECT cin, type_salaire FROM employe")).all())
        assert types == {"ERR1": "MENSUEL", "ERR2": "JOURNALIER", "OK1": "MENSUEL"}
        lignes = {
            cin: ligne
            for cin, *ligne in c.execute(
                text(
                    "SELECT e.cin, h.type_salaire_reference, h.s_h, h.montant, h.net_a_payer, h.version "
                    "FROM heures_supp h JOIN employe e ON e.id = h.employee_id"
                )
            )
        }
        assert lignes["ERR1"] == ["MENSUEL", 21, 315, 315, 1]  # 5 500 / 260 = 21,15 : le cas du CIN Q100000
        assert lignes["ERR2"] == ["JOURNALIER", 15, 225, 225, 1]
        assert lignes["OK1"] == ["MENSUEL", 12, 180, 180, 0]  # intacte
        revision = c.execute(
            text("SELECT count(*) FROM audit_revision WHERE origine = 'MIGRATION' AND utilisateur_nom = 'Système'")
        ).scalar_one()
        assert revision >= 1
        assert c.execute(text("SELECT count(*) FROM employe_aud WHERE revtype = 1")).scalar_one() == 2
        assert c.execute(text("SELECT count(*) FROM heures_supp_aud WHERE revtype = 1")).scalar_one() == 2
        assert (
            c.execute(
                text(
                    "SELECT sum(nombre_elements) FROM audit_journal "
                    "WHERE perimetre ->> 'migration' = '0009_type_salaire_deduit'"
                )
            ).scalar_one()
            == 4
        )
    moteur.dispose()


PERMISSIONS_CHARGE_RH = {
    "ACCUEIL_READ",
    "ACCUEIL_WRITE",
    "CHANTIER_READ",
    "EMPLOYEE_EXPORT",
    "EMPLOYEE_READ",
    "EQUIPE_READ",
    "FUNCTION_READ",
    "HEURES_SUP_READ",
    "IA_UTILISER",
    "PAIE_EXPORT",
    "PAIE_READ",
}


def test_la_revision_0010_cree_le_role_charge_rh_et_le_compte_de_rania_atik(creer_base: Callable[[str], str]) -> None:
    """Rôle en consultation seule, compte sans mot de passe utilisable relié à sa fiche, le tout journalisé."""
    from pwdlib import PasswordHash
    from pwdlib.hashers.argon2 import Argon2Hasher

    url = creer_base("role_charge_rh")
    command.upgrade(_config(url), "0009_type_salaire_deduit")
    moteur = create_engine(url)
    with moteur.begin() as c:
        fonction = c.execute(text("INSERT INTO fonction (libelle) VALUES ('Chargée RH') RETURNING id")).scalar_one()
        chantier = c.execute(text("INSERT INTO chantier (code) VALUES ('SIEGE') RETURNING id")).scalar_one()
        fiche = c.execute(
            text(
                "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, "
                "statut) VALUES ('ATIK RANIA', 'RA1', '1995-01-01', '2024-01-01', :f, :c, 'ACTIF') RETURNING id"
            ),
            {"f": fonction, "c": chantier},
        ).scalar_one()
    moteur.dispose()

    command.upgrade(_config(url), "head")

    moteur = create_engine(url)
    with moteur.connect() as c:
        permissions = set(
            c.execute(
                text(
                    "SELECT p.code FROM role r JOIN role_permission rp ON rp.role_id = r.id "
                    "JOIN permission p ON p.id = rp.permission_id WHERE r.nom = 'CHARGE_RH'"
                )
            ).scalars()
        )
        assert permissions == PERMISSIONS_CHARGE_RH
        compte = c.execute(
            text(
                "SELECT u.id, u.email, u.actif, u.employee_id, u.mot_de_passe_hash, r.nom FROM utilisateur u "
                "JOIN utilisateur_role ur ON ur.utilisateur_id = u.id JOIN role r ON r.id = ur.role_id "
                "WHERE u.username = 'rania.atik'"
            )
        ).one()
        assert (compte.email, compte.actif, compte.employee_id, compte.nom) == (
            "rania.atik@staport-sa.ma",
            True,
            fiche,
            "CHARGE_RH",
        )
        # Empreinte Argon2 valide (la connexion ne plante pas) mais d'un secret que personne ne connaît.
        assert compte.mot_de_passe_hash.startswith("$argon2")
        assert not PasswordHash((Argon2Hasher(),)).verify("", compte.mot_de_passe_hash)
        assert c.execute(
            text("SELECT revtype FROM utilisateur_aud WHERE id = :id"), {"id": compte.id}
        ).scalars().all() == [0]
        assert c.execute(
            text(
                "SELECT count(*) FROM role_permission_aud rpa JOIN role r ON r.id = rpa.role_id "
                "WHERE r.nom = 'CHARGE_RH'"
            )
        ).scalar_one() == len(PERMISSIONS_CHARGE_RH)
        actions = set(
            c.execute(
                text("SELECT action FROM audit_journal WHERE perimetre ->> 'migration' = '0010_role_charge_rh'")
            ).scalars()
        )
        assert actions == {"ROLE_CREATION", "UTILISATEUR_CREATION"}
    moteur.dispose()


def test_la_revision_0010_reprend_un_role_et_un_compte_deja_crees(creer_base: Callable[[str], str]) -> None:
    """Créés à la main avant la migration : rien n'est dupliqué, il ne manque que les permissions et le rôle."""
    url = creer_base("role_charge_rh_existant")
    command.upgrade(_config(url), "0009_type_salaire_deduit")
    moteur = create_engine(url)
    with moteur.begin() as c:
        role = c.execute(
            text("INSERT INTO role (nom, description) VALUES ('Charge_RH', 'créé à la main') RETURNING id")
        ).scalar_one()
        c.execute(
            text(
                "INSERT INTO role_permission (role_id, permission_id) "
                "SELECT :r, id FROM permission WHERE code = 'EMPLOYEE_READ'"
            ),
            {"r": role},
        )
        c.execute(
            text(
                "INSERT INTO utilisateur (username, email, mot_de_passe_hash) "
                "VALUES ('ratik', 'Rania.Atik@staport-sa.ma', 'x')"
            )
        )
    moteur.dispose()

    command.upgrade(_config(url), "head")

    moteur = create_engine(url)
    with moteur.connect() as c:
        assert c.execute(text("SELECT count(*) FROM role WHERE UPPER(nom) = 'CHARGE_RH'")).scalar_one() == 1
        assert c.execute(text("SELECT count(*) FROM utilisateur")).scalar_one() == 1
        assert (
            c.execute(
                text(
                    "SELECT r.nom FROM utilisateur u JOIN utilisateur_role ur ON ur.utilisateur_id = u.id "
                    "JOIN role r ON r.id = ur.role_id WHERE u.username = 'ratik'"
                )
            ).scalar_one()
            == "Charge_RH"
        )
        assert c.execute(
            text("SELECT count(*) FROM role_permission WHERE role_id = :r"), {"r": role}
        ).scalar_one() == len(PERMISSIONS_CHARGE_RH)
        assert (
            c.execute(text("SELECT count(*) FROM role_permission_aud WHERE role_id = :r"), {"r": role}).scalar_one()
            == len(PERMISSIONS_CHARGE_RH) - 1
        )
    moteur.dispose()
