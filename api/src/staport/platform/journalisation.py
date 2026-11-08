"""Journaux applicatifs (parité avec `logback-spring.xml` de l'ancien backend, `LOGGING_FORMAT` et `LOGGING_FILE_PATH`).

- `text` (défaut) : le format lisible de Python, rien n'est modifié.
- `json` : une ligne JSON par événement sur la console, avec `requestId` pour seule clé de contexte
  (`conventions/logging.md` : jamais de secret, d'identité ni de contenu métier).
- `LOGGING_FILE_PATH` : en plus, un fichier `application.json` archivé chaque jour à minuit UTC, compressé et gardé
  30 jours. Un répertoire inaccessible n'empêche pas le démarrage : la console reste la sortie de référence.
"""

import gzip
import logging
import shutil
import time
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

from pythonjsonlogger.json import JsonFormatter

from staport.platform.requete import request_id_courant

NOM_FICHIER = "application.json"
JOURS_CONSERVES = 30
_MARQUE = "_staport_journalisation"

journal = logging.getLogger(__name__)


class FiltreRequete(logging.Filter):
    """Pose `requestId` sur chaque enregistrement ; absent hors requête."""

    def filter(self, record: logging.LogRecord) -> bool:
        identifiant = request_id_courant()
        if identifiant is not None:
            record.requestId = identifiant
        return True


def _formateur() -> JsonFormatter:
    return JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s %(requestId)s",
        rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
        timestamp=False,
    )


def _compresser(source: str, destination: str) -> None:
    with open(source, "rb") as entree, gzip.open(destination, "wb") as sortie:
        shutil.copyfileobj(entree, sortie)
    Path(source).unlink()
    limite = time.time() - JOURS_CONSERVES * 86_400
    for archive in Path(destination).parent.glob("*.gz"):
        if archive.stat().st_mtime < limite:
            archive.unlink()


def _fichier(repertoire: str) -> TimedRotatingFileHandler:
    dossier = Path(repertoire)
    (dossier / "archive").mkdir(parents=True, exist_ok=True)
    gestionnaire = TimedRotatingFileHandler(
        dossier / NOM_FICHIER, when="midnight", utc=True, backupCount=JOURS_CONSERVES, encoding="utf-8"
    )
    gestionnaire.namer = lambda nom: str(dossier / "archive" / f"{Path(nom).name}.gz")
    gestionnaire.rotator = _compresser
    return gestionnaire


def configurer_journalisation(format_: str, repertoire: str = "") -> None:
    """Idempotent : les gestionnaires posés par un appel précédent sont remplacés."""
    racine = logging.getLogger()
    for gestionnaire in [g for g in racine.handlers if getattr(g, _MARQUE, False)]:
        racine.removeHandler(gestionnaire)
        gestionnaire.close()
    if format_ != "json" and not repertoire:
        return
    gestionnaires: list[logging.Handler] = []
    if format_ == "json":
        gestionnaires.append(logging.StreamHandler())
    if repertoire:
        try:
            gestionnaires.append(_fichier(repertoire))
        except OSError:
            journal.warning("Répertoire des journaux inaccessible : archivage désactivé")
    for gestionnaire in gestionnaires:
        gestionnaire.setFormatter(_formateur())
        gestionnaire.addFilter(FiltreRequete())
        setattr(gestionnaire, _MARQUE, True)
        racine.addHandler(gestionnaire)
    racine.setLevel(logging.INFO)
