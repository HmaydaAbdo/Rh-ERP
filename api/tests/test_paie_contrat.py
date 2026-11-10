from decimal import Decimal
from types import SimpleNamespace
from typing import cast

from staport.domains.chantier.models import Chantier
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction
from staport.domains.paie.models import Paie
from staport.domains.paie.schemas import PaieModificationRequete
from staport.domains.paie.service import rep


def test_reponse_bulletin_respecte_le_contrat_de_la_page_paie() -> None:
    paie = cast(
        Paie,
        SimpleNamespace(
            id=41,
            version=2,
            periode=202611,
            nombre_jours_travailles=Decimal("26"),
            jours_recuperation_ouvrable=None,
            jours_recuperation_dimanche=None,
            salaire_mensuel=Decimal("4500.00"),
            prime_roulage_ordinaire=None,
            prime_roulage_dimanche=None,
            salaire_total=Decimal("4500.00"),
            observation=None,
        ),
    )
    employe = cast(Employee, SimpleNamespace(id=7, nom_prenom="Amal", cin="AB123"))
    fonction = cast(Fonction, SimpleNamespace(id=8, libelle="Conductrice"))
    chantier = cast(Chantier, SimpleNamespace(id=9, code="C01", designation="Nador"))
    equipe = cast(Equipe, SimpleNamespace(id=10, code="CH", libelle="Chauffeurs"))

    reponse = rep((paie, employe, fonction, chantier, equipe)).model_dump(mode="json", by_alias=True)

    assert reponse["periode"] == "2026-11"
    assert reponse["employee"] == {"id": 7, "nomPrenom": "Amal", "cin": "AB123"}
    assert reponse["fonction"] == {"id": 8, "libelle": "Conductrice"}
    assert reponse["chantier"] == {"id": 9, "code": "C01", "designation": "Nador"}
    assert reponse["equipe"] == {"id": 10, "code": "CH", "libelle": "Chauffeurs"}
    assert "employeeId" not in reponse


def test_modification_accepte_le_corps_envoye_par_l_interface_sans_employe_ni_periode() -> None:
    corps = PaieModificationRequete.model_validate(
        {
            "version": 2,
            "fonctionId": 8,
            "chantierId": 9,
            "equipeId": None,
            "nombreJoursTravailles": 25.5,
            "salaireMensuel": 0,
            "salaireTotal": 0,
        }
    )
    assert corps.version == 2
    assert corps.nombre_jours_travailles == 25
    assert corps.salaire_mensuel == 0
    assert "employee_id" not in corps.model_fields_set
    assert "periode" not in corps.model_fields_set
