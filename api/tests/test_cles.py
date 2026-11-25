"""Forme canonique des identifiants (KAN-319) : une seule règle pour l'API, les imports et la base."""

import pytest
from pydantic import ValidationError

from staport.domains.common.cles import cin_canonique, cin_valide, cle, texte_canonique
from staport.domains.employee.schemas import EmployeeCreationRequete
from staport.domains.function.schemas import FonctionCreationRequete


@pytest.mark.parametrize(
    ("brut", "attendu"),
    [
        ("XY 100200", "XY100200"),
        (" xy100200 ", "XY100200"),
        ("ZT" + chr(0xA0) + "40500", "ZT40500"),
        (900000000001, "900000000001"),
        (900000000001.0, "900000000001"),
        (None, ""),
    ],
)
def test_le_cin_canonique_est_en_majuscules_sans_espaces(brut: object, attendu: str) -> None:
    assert cin_canonique(brut) == attendu


def test_un_cin_abime_par_excel_n_est_pas_valide() -> None:
    assert cin_valide("900000000001") and cin_valide("AB123")
    assert not cin_valide(cin_canonique("9.00000E+11")) and not cin_valide("AB-123")


def test_les_libelles_gardent_leur_casse_et_perdent_les_espaces_superflus() -> None:
    assert texte_canonique("  OP.  COMPACTEUR \t") == "OP. COMPACTEUR"
    assert cle("op.   compacteur") == cle("OP. COMPACTEUR") == "OP. COMPACTEUR"


def test_l_api_enregistre_la_forme_canonique_et_refuse_un_cin_abime() -> None:
    base = {
        "nomPrenom": "X",
        "dateNaissance": "1990-01-01",
        "dateEmbauche": "2020-01-01",
        "fonctionId": 1,
        "chantierId": 1,
    }
    assert EmployeeCreationRequete.model_validate({**base, "cin": " xy 100200"}).cin == "XY100200"
    with pytest.raises(ValidationError, match="lettres et des chiffres"):
        EmployeeCreationRequete.model_validate({**base, "cin": "9.00000E+11"})
    assert FonctionCreationRequete(libelle=" OP.  COMPACTEUR ").libelle == "OP. COMPACTEUR"
