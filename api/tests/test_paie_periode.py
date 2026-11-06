from pydantic import ValidationError

from staport.domains.paie.periode import afficher_periode, lire_periode
from staport.domains.paie.schemas import PaieExportRequete, PaieOptionsChantierRequete, PaieRecherche


def test_mois_du_frontend_converti_pour_la_base_et_restitue_en_json() -> None:
    export = PaieExportRequete.model_validate({"periode": "2026-11"})
    assert export.periode == 202611
    assert export.model_dump()["periode"] == 202611
    assert export.model_dump(mode="json")["periode"] == "2026-11"
    assert PaieOptionsChantierRequete.model_validate({"periode": "2026-11"}).periode == 202611
    assert PaieRecherche.model_validate({"periode": "2026-11"}).periode == 202611
    assert afficher_periode(lire_periode("2026-01")) == "2026-01"


def test_mois_invalide_refuse() -> None:
    for invalide in ("2026-00", "2026-13", "2026-1", "26-01", 202613, 202600, True):
        try:
            PaieExportRequete.model_validate({"periode": invalide})
        except ValidationError:
            continue
        raise AssertionError(f"Période acceptée : {invalide!r}")
