"""Verrouillage optimiste applicatif (parité avec `VersionOptimiste` de Spring) : 409 si la version lue a changé."""

from staport.platform.erreurs import ConflitModification


def verifier_version(version_attendue: int | None, version_courante: int | None) -> None:
    if version_attendue != version_courante:
        raise ConflitModification
