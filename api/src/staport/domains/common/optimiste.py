"""Verrouillage optimiste applicatif (parité avec `VersionOptimiste` de Spring) : 409 si la version lue a changé."""

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm.attributes import flag_modified

from staport.platform.erreurs import ConflitModification


def verifier_version(version_attendue: int | None, version_courante: int | None) -> None:
    if version_attendue != version_courante:
        raise ConflitModification


def incrementer_version(entite: object) -> None:
    """Force l'incrément de version quand seule une collection (liaison N-N) change.

    Hibernate incrémente la version d'une entité propriétaire quand sa collection change ; SQLAlchemy ne le fait pas :
    sans cet appel, deux administrateurs modifiant les seules permissions d'un rôle ne se verraient pas en conflit.
    L'UPDATE est provoqué en marquant une colonne ordinaire comme modifiée (la colonne de version ne peut pas l'être).
    """
    etat = sa_inspect(entite)
    assert etat is not None  # noqa: S101  # une entité mappée a toujours un état
    mapper = etat.mapper
    exclues = {c.key for c in mapper.primary_key} | {
        mapper.version_id_col.key if mapper.version_id_col is not None else ""
    }
    colonne = next(a.key for a in mapper.column_attrs if a.key not in exclues)
    flag_modified(entite, colonne)
