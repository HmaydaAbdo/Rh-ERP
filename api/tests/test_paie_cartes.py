from decimal import Decimal
from types import SimpleNamespace
from typing import Any, cast

from conftest import ADMIN, Plateforme

from staport.domains.paie.analytique import Ligne
from staport.domains.paie.cartes import chantiers, periodes


def _ligne(mois: int, total: str, equipe: bool) -> Ligne:
    return cast(
        Ligne,
        (
            SimpleNamespace(
                periode=mois,
                salaire_total=Decimal(total),
                chantier_id=1,
                equipe_id=1 if equipe else None,
                observation=None,
            ),
            SimpleNamespace(id=1, nom_prenom="Amal", cin="AB123"),
            SimpleNamespace(id=2, libelle="Conductrice"),
            SimpleNamespace(id=1, code="C168", nom=None, designation="Nador"),
            SimpleNamespace(id=1, code="CH", libelle="Chauffeurs") if equipe else None,
        ),
    )


def test_cartes_conservent_les_sans_equipe_et_la_comparaison_contigue() -> None:
    lignes = [_ligne(202612, "100", False), _ligne(202701, "600", True), _ligne(202701, "0", False)]
    cartes = chantiers(202701, lignes)
    assert len(cartes) == 1
    assert cartes[0].effectif == 2
    assert cartes[0].mois_precedent is not None and cartes[0].mois_precedent.masse == 100
    assert cartes[0].sans_equipe_mois_precedent is not None
    assert cartes[0].sans_equipe_mois_precedent.effectif == 1
    assert len(cartes[0].equipes) == 1
    assert cartes[0].equipes[0].mois_precedent is None
    assert [mois.periode for mois in periodes(lignes)] == [202701, 202612]


def test_routes_cartes_et_catalogue_materiel(plateforme: Plateforme, connecter: Any) -> None:
    jeton = connecter(*ADMIN)["accessToken"]
    entetes = {"Authorization": f"Bearer {jeton}"}
    for methode, chemin, corps in (
        ("post", "/paie/periodes/search", {}),
        ("post", "/paie/chantiers/search", {"periode": "2999-12"}),
        ("get", "/paie/chantiers?periode=2999-12", None),
    ):
        reponse = plateforme.client.request(methode.upper(), chemin, headers=entetes, json=corps)
        assert reponse.status_code == 200, reponse.text
        assert isinstance(reponse.json(), list)
    materiel = plateforme.client.get("/paie/materiel", headers=entetes)
    assert materiel.status_code == 200
    assert materiel.json()[0]["titre"] == "CAMION"
    assert materiel.json()[1]["libelles"][-1] == "TRACTOPELLE"
