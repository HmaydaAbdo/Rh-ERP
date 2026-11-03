"""Environnement Alembic (KAN-212, ADR 0016 § 3).

Les migrations s'exécutent avec le compte PROPRIÉTAIRE du schéma, dans une étape de déploiement dédiée, jamais
dans le `lifespan` de l'application. Après chaque montée de version, les droits du compte applicatif sont
recalculés (équivalent du rappel Flyway `afterMigrate.sql`).

`target_metadata` sert au contrôle de dérive (`alembic check`, test `test_migrations`) : les modèles de chaque domaine
migré sont comparés à la base construite par les migrations. Les tables encore gérées par Flyway seulement
(domaines non migrés) et les index d'expression de V27 sont ignorés par `include_object`.
"""

from alembic import context
from sqlalchemy import create_engine

from staport.migrations.derive import Base, inclure
from staport.migrations.droits import recalculer_droits
from staport.platform.configuration import configuration

config = context.config


def _url() -> str:
    url = config.get_main_option("sqlalchemy.url")
    return url if url else configuration().url_migration()


def executer() -> None:
    moteur = create_engine(_url())
    with moteur.connect() as connexion:
        context.configure(
            connection=connexion,
            target_metadata=Base.metadata,
            include_object=inclure,
            transactional_ddl=True,
        )
        with context.begin_transaction():
            context.run_migrations()
        if not context.is_offline_mode():
            compte = config.get_main_option("compte_applicatif")
            mot_de_passe = config.get_main_option("mot_de_passe_applicatif")
            if compte and mot_de_passe:
                recalculer_droits(connexion, compte, mot_de_passe)
                connexion.commit()
    moteur.dispose()


executer()
