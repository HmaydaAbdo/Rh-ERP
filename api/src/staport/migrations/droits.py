"""Droits du compte applicatif, recalculés après CHAQUE migration (équivalent de `afterMigrate.sql`, KAN-212).

Le propriétaire du schéma exécute les migrations ; l'application se connecte avec un compte distinct qui a :
- SELECT, INSERT, UPDATE, DELETE sur les tables métier ;
- SELECT, INSERT seulement sur les tables d'audit (`audit_*` et `*_aud`) : ni réécriture ni effacement de l'historique ;
- aucun droit d'écriture sur l'historique des migrations.
Quand le compte applicatif EST le propriétaire (développement, CI), il n'y a rien à restreindre.

Les noms et le mot de passe sont composés avec `psycopg.sql` (identifiants et littéraux échappés) : aucun secret
n'est inséré par concaténation de texte, contrairement au substitut de variables de Flyway.
"""

from psycopg import sql
from sqlalchemy import Connection, text

TABLES_HISTORIQUE = ("alembic_version", "flyway_schema_history")


def _executer(connexion: Connection, requete: sql.Composable) -> None:
    brut = connexion.connection.dbapi_connection  # pyright: ignore[reportUnknownMemberType,reportUnknownVariableType]
    brut.execute(requete)  # pyright: ignore[reportUnknownMemberType,reportAttributeAccessIssue,reportOptionalMemberAccess]


def recalculer_droits(connexion: Connection, compte: str, mot_de_passe: str) -> bool:
    """Retourne False si le compte applicatif est le propriétaire (rien à restreindre)."""
    courant = connexion.execute(text("SELECT current_user")).scalar_one()
    if compte == courant:
        return False
    base = connexion.execute(text("SELECT current_database()")).scalar_one()
    existe = connexion.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :n"), {"n": compte}).first()
    ident = sql.Identifier(compte)
    if existe is None:
        _executer(connexion, sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(ident, sql.Literal(mot_de_passe)))
    _executer(connexion, sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(sql.Identifier(base), ident))
    _executer(connexion, sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(ident))
    _executer(
        connexion, sql.SQL("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {}").format(ident)
    )
    _executer(connexion, sql.SQL("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {}").format(ident))
    tables = connexion.execute(
        text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
            "AND (tablename LIKE 'audit\\_%' OR tablename LIKE '%\\_aud')"
        )
    ).scalars()
    for table in tables:
        _executer(
            connexion,
            sql.SQL("REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON {} FROM {}").format(
                sql.Identifier(table), ident
            ),
        )
    for table in TABLES_HISTORIQUE:
        present = connexion.execute(text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}).scalar_one()
        if present is not None:
            _executer(
                connexion,
                sql.SQL("REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON {} FROM {}").format(
                    sql.Identifier(table), ident
                ),
            )
    return True
