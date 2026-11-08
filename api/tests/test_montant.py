"""Règle commune des montants : entiers de dirham, arrondi automatique (demi supérieur) dans tous les domaines."""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from staport.domains.employee.models import TypeSalaire
from staport.domains.employee.schemas import EmployeeCreationRequete
from staport.domains.heuresupp.schemas import ImportCreation
from staport.domains.paie.schemas import PaieCreationRequete


def _bulletin(**montants: object) -> PaieCreationRequete:
    return PaieCreationRequete.model_validate(
        {
            "employeeId": 1,
            "periode": "2026-10",
            "fonctionId": 1,
            "chantierId": 1,
            "nombreJoursTravailles": 26,
            "salaireMensuel": 1000,
            "salaireTotal": 1000,
            **montants,
        }
    )


def test_un_bulletin_saisi_arrondit_salaire_primes_et_total() -> None:
    bulletin = _bulletin(
        salaireMensuel=769.230769, primeRoulageOrdinaire="12.5", primeRoulageDimanche=0.004, salaireTotal=1000.999
    )
    assert bulletin.salaire_mensuel == Decimal("769")
    assert bulletin.prime_roulage_ordinaire == Decimal("13")
    assert bulletin.prime_roulage_dimanche == Decimal("0")
    assert bulletin.salaire_total == Decimal("1001")


def test_un_montant_negatif_ou_hors_capacite_reste_refuse() -> None:
    with pytest.raises(ValidationError):
        _bulletin(salaireMensuel=-1)
    with pytest.raises(ValidationError):
        _bulletin(salaireTotal=10000000000)


def test_le_salaire_d_une_fiche_employe_est_arrondi() -> None:
    employe = EmployeeCreationRequete.model_validate(
        {
            "nomPrenom": "Alice",
            "cin": "AA1",
            "dateNaissance": "1990-01-01",
            "dateEmbauche": "2020-01-01",
            "fonctionId": 1,
            "chantierId": 1,
            "salaire": 4500.555,
            "typeSalaire": "MENSUEL",
        }
    )
    assert employe.salaire == Decimal("4501")


def test_le_salaire_d_un_employe_cree_depuis_les_heures_supplementaires_est_arrondi() -> None:
    creation = ImportCreation(
        numero_ligne=4,
        date_naissance=date(1990, 1, 1),
        date_embauche=date(2020, 1, 1),
        fonction_id=1,
        salaire=Decimal("3000.126"),
        type_salaire=TypeSalaire.MENSUEL,
    )
    assert creation.salaire == Decimal("3000")
