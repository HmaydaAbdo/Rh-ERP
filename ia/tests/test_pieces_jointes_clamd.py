"""Preuve contre un vrai démon ClamAV (KAN-93) : les deux premiers tests sont ignorés sans ``IA_TEST_CLAMD_HOTE``.

Lancer par exemple ``docker run -d -p 13310:3310 clamav/clamav:1.5.4`` puis, une fois les signatures chargées,
``IA_TEST_CLAMD_HOTE=127.0.0.1 IA_TEST_CLAMD_PORT=13310 pytest tests/test_pieces_jointes_clamd.py``.
"""

import os

import pytest

from staport_ia.pieces_jointes import AnalyseurClamd, PieceRefusee

HOTE = os.environ.get("IA_TEST_CLAMD_HOTE")
demon_requis = pytest.mark.skipif(HOTE is None, reason="IA_TEST_CLAMD_HOTE absent : pas de démon ClamAV")

# Fichier de test standard EICAR (inoffensif, reconnu par tous les antivirus), écrit en deux morceaux.
EICAR = ("X5O!P%@AP[4" + chr(92) + "PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*").encode()


def _analyseur() -> AnalyseurClamd:
    return AnalyseurClamd(HOTE or "", int(os.environ.get("IA_TEST_CLAMD_PORT", "3310")), delai=30.0)


@demon_requis
async def test_un_fichier_sain_passe() -> None:
    await _analyseur().verifier(b"Periode;Masse\n2026-08;4800\n")


@demon_requis
async def test_le_fichier_de_test_eicar_est_bloque() -> None:
    with pytest.raises(PieceRefusee) as erreur:
        await _analyseur().verifier(EICAR)

    assert not erreur.value.indisponible
    assert "antivirus" in erreur.value.motif


async def test_un_demon_injoignable_donne_un_refus_indisponible() -> None:
    with pytest.raises(PieceRefusee) as erreur:
        await AnalyseurClamd("127.0.0.1", 9, delai=2.0).verifier(b"x")

    assert erreur.value.indisponible
