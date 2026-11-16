"""Preuve contre un vrai démon ClamAV (KAN-93) : la fixture ``demon_clamd`` (``conftest.py``) démarre l'image officielle
et attend ses signatures ; ``IA_TEST_CLAMD_HOTE`` et ``IA_TEST_CLAMD_PORT`` désignent un démon déjà prêt."""

import pytest

from staport_ia.pieces_jointes import AnalyseurClamd, PieceRefusee

# Fichier de test standard EICAR (inoffensif, reconnu par tous les antivirus), écrit en deux morceaux.
EICAR = ("X5O!P%@AP[4" + chr(92) + "PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*").encode()


def _analyseur(demon: tuple[str, int]) -> AnalyseurClamd:
    return AnalyseurClamd(demon[0], demon[1], delai=30.0)


async def test_un_fichier_sain_passe(demon_clamd: tuple[str, int]) -> None:
    await _analyseur(demon_clamd).verifier(b"Periode;Masse\n2026-08;4800\n")


async def test_le_fichier_de_test_eicar_est_bloque(demon_clamd: tuple[str, int]) -> None:
    with pytest.raises(PieceRefusee) as erreur:
        await _analyseur(demon_clamd).verifier(EICAR)

    assert not erreur.value.indisponible
    assert "antivirus" in erreur.value.motif


async def test_un_demon_injoignable_donne_un_refus_indisponible() -> None:
    with pytest.raises(PieceRefusee) as erreur:
        await AnalyseurClamd("127.0.0.1", 9, delai=2.0).verifier(b"x")

    assert erreur.value.indisponible
