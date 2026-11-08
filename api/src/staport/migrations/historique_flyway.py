"""Contrôle de l'historique Flyway d'une base existante avant son passage à Alembic (KAN-237).

Flyway n'est plus exécuté : ni service, ni image. Ce module reprend ce que sa commande ``validate`` garantissait avant
l'estampillage : les 44 scripts V1 à V44 sont tous appliqués, avec succès, sous leur numéro et avec la somme de contrôle
des scripts fournis (``flyway_v44``). Une base partielle, étrangère ou dont un script a été modifié bloque la bascule
avant toute écriture.

La somme de contrôle est celle de Flyway : CRC32 des lignes du script (fins de ligne ignorées, BOM retiré), lu comme
entier signé 32 bits. Elle a été vérifiée contre les sommes réellement enregistrées par Flyway sur V1 à V15.
"""

import re
import zlib
from pathlib import Path

from sqlalchemy import Connection, text

DOSSIER = Path(__file__).resolve().parent / "flyway_v44"
NOMBRE_SCRIPTS = 44


def somme_de_controle(chemin: Path) -> int:
    """La somme de contrôle que Flyway enregistre pour ce script."""
    contenu = chemin.read_bytes().decode("utf-8").removeprefix("﻿")
    crc = 0
    for ligne in contenu.splitlines():
        crc = zlib.crc32(ligne.encode("utf-8"), crc)
    return crc - (1 << 32) if crc >= 1 << 31 else crc


def sommes_attendues() -> dict[int, int]:
    """Numéro de version → somme de contrôle des scripts V1 à V44 fournis."""
    sommes: dict[int, int] = {}
    for chemin in DOSSIER.glob("V*.sql"):
        correspondance = re.match(r"V(\d+)__", chemin.name)
        if correspondance is not None:
            sommes[int(correspondance[1])] = somme_de_controle(chemin)
    return sommes


def historique_complet(connexion: Connection) -> bool:
    """Vrai si l'historique est exactement V1 à V44, tous réussis, avec les sommes de contrôle des scripts fournis."""
    attendues = sommes_attendues()
    lignes = connexion.execute(
        text("SELECT version, type, success, checksum FROM flyway_schema_history ORDER BY installed_rank")
    ).all()
    return (
        len(attendues) == NOMBRE_SCRIPTS
        and len(lignes) == NOMBRE_SCRIPTS
        and all(
            ligne.version == str(numero)
            and ligne.type == "SQL"
            and ligne.success
            and ligne.checksum == attendues[numero]
            for numero, ligne in enumerate(lignes, start=1)
        )
    )
