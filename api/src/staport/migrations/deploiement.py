"""Bascule Flyway V44 vers Alembic (KAN-219, KAN-237).

Flyway n'est plus exécuté. Ce garde vérifie lui-même l'historique Flyway (versions, types, succès et sommes de
contrôle des scripts V1 à V44, voir ``historique_flyway``) et refuse un ``stamp`` sur une base partielle, étrangère ou
modifiée ; Alembic exécute ensuite les migrations et recalcule les droits avec le compte propriétaire du schéma.
"""

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

from staport.migrations.historique_flyway import historique_complet
from staport.platform.configuration import ConfigurationMigration


def _preparer(config: Config, parametres: ConfigurationMigration) -> str:
    moteur = create_engine(parametres.url_migration())
    try:
        with moteur.connect() as connexion:
            alembic = connexion.execute(text("SELECT to_regclass('public.alembic_version')")).scalar_one() is not None
            flyway = (
                connexion.execute(text("SELECT to_regclass('public.flyway_schema_history')")).scalar_one() is not None
            )
            if alembic:
                revision = MigrationContext.configure(connexion).get_current_revision()
                if revision is None:
                    raise RuntimeError("Historique Alembic vide : restauration requise avant la bascule")
                return f"Alembic déjà initialisé : {revision}"
            if flyway:
                if not historique_complet(connexion):
                    raise RuntimeError("Historique Flyway incomplet, inattendu ou modifié : stamp refusé")
            else:
                tables = connexion.execute(
                    text("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
                ).scalar_one()
                if tables:
                    raise RuntimeError("Schéma non vide sans historique de migration : restauration requise")
                return "Base neuve : Alembic construit le schéma"
    finally:
        moteur.dispose()
    command.stamp(config, "0001_base_v44")
    return "Flyway V1-V44 validé : estampillage Alembic 0001_base_v44"


def migrer() -> None:
    parametres = ConfigurationMigration()  # pyright: ignore[reportCallIssue]
    config = Config()
    config.set_main_option("script_location", "staport:migrations")
    print(_preparer(config, parametres), flush=True)
    command.upgrade(config, "head")
    moteur = create_engine(parametres.url_migration())
    try:
        with moteur.connect() as connexion:
            actuel = MigrationContext.configure(connexion).get_current_revision()
            attendu = ScriptDirectory.from_config(config).get_current_head()
            if actuel != attendu:
                raise RuntimeError(f"Révision Alembic inattendue : {actuel} ; attendu : {attendu}")
            print(f"Alembic : {actuel} ; droits applicatifs recalculés", flush=True)
    finally:
        moteur.dispose()


if __name__ == "__main__":
    migrer()
