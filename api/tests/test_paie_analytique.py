from decimal import Decimal
from types import SimpleNamespace
from typing import Any, cast

from conftest import ADMIN, Plateforme
from sqlalchemy import text

from staport.domains.paie.analytique import Ligne, construire_analytique


def _ligne(
    periode: int, total: str, *, equipe: bool = True, observation: str | None = None, chantier: int = 1
) -> Ligne:
    return cast(
        Ligne,
        (
            SimpleNamespace(
                periode=periode,
                salaire_total=Decimal(total),
                chantier_id=chantier,
                equipe_id=1 if equipe else None,
                observation=observation,
            ),
            SimpleNamespace(id=1, nom_prenom="Amal", cin="AB123"),
            SimpleNamespace(id=2, libelle="Conductrice"),
            SimpleNamespace(id=chantier, code=f"C{chantier}", nom=None, designation="Nador"),
            SimpleNamespace(id=1, code="CH", libelle="Chauffeurs") if equipe else None,
        ),
    )


def test_analyse_courant_precedent_groupes_qualite_et_historique() -> None:
    lignes = [
        _ligne(202612, "100.00"),
        _ligne(202701, "600.00", observation="STC"),
        _ligne(202701, "0.00", equipe=False, chantier=2),
        _ligne(202702, "900.00"),
    ]
    resultat = construire_analytique(202701, lignes, Decimal("100"))
    json = resultat.model_dump(mode="json", by_alias=True)

    assert json["periode"] == "2027-01"
    assert json["kpis"]["masse"] == "600.00"
    assert json["kpis"]["effectif"] == 2
    assert json["kpis"]["stc"] == 1
    assert json["kpis"]["stcMontant"] == "600.00"
    assert json["moisPrecedent"]["masse"] == "100.00"
    assert [x["periode"] for x in json["evolution"]] == ["2026-12", "2027-01", "2027-02"]
    assert len(json["parChantier"]) == 2
    assert len(json["parEquipe"]) == 2
    assert json["qualite"] == {"sansEquipe": 1, "sansObservation": 1}
    assert sum(tranche["effectif"] for tranche in json["tranches"]) == 2


def test_absence_du_mois_precedent_ne_devient_pas_un_zero() -> None:
    resultat = construire_analytique(202701, [_ligne(202701, "0.00")], Decimal("100"))
    assert resultat.mois_precedent is None
    assert resultat.kpis.cout_moyen == Decimal("0.00")
    assert resultat.tranches[-1].max is None


def test_route_analytique_accepte_le_corps_du_frontend(plateforme: Plateforme, connecter: Any) -> None:
    jeton = connecter(*ADMIN)["accessToken"]
    reponse = plateforme.client.post(
        "/paie/analytique",
        headers={"Authorization": f"Bearer {jeton}"},
        json={"periode": "2999-12"},
    )
    assert reponse.status_code == 200, reponse.text
    contenu = reponse.json()
    assert contenu["periode"] == "2999-12"
    assert contenu["kpis"]["effectif"] == 0
    assert contenu["moisPrecedent"] is None
    assert contenu["tranches"] == []


def test_route_analytique_agrege_les_bulletins_du_mois(plateforme: Plateforme, connecter: Any) -> None:
    with plateforme.moteur.begin() as connexion:
        fonction = connexion.execute(
            text("INSERT INTO fonction (libelle) VALUES ('TEST ANALYTIQUE') RETURNING id")
        ).scalar_one()
        chantier = connexion.execute(
            text("INSERT INTO chantier (code, designation) VALUES ('TEST-ANA', 'Essai') RETURNING id")
        ).scalar_one()
        employe = connexion.execute(
            text(
                "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, "
                "fonction_id, chantier_id, statut) "
                "VALUES ('Essai Paie', 'TEST-ANA-1', '1990-01-01', '2020-01-01', :f, :c, 'ACTIF') RETURNING id"
            ),
            {"f": fonction, "c": chantier},
        ).scalar_one()
        bulletin = connexion.execute(
            text(
                "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, nombre_jours_travailles, "
                "salaire_mensuel, salaire_total, observation) "
                "VALUES (:e, 209911, :f, :c, 26, 500, 600, ' STC ') RETURNING id"
            ),
            {"e": employe, "f": fonction, "c": chantier},
        ).scalar_one()
    try:
        jeton = connecter(*ADMIN)["accessToken"]
        reponse = plateforme.client.post(
            "/paie/analytique",
            headers={"Authorization": f"Bearer {jeton}"},
            json={"periode": "2099-11", "chantierIds": [chantier]},
        )
        assert reponse.status_code == 200, reponse.text
        contenu = reponse.json()
        assert contenu["kpis"]["effectif"] == 1
        assert contenu["kpis"]["stc"] == 1
        assert contenu["kpis"]["masse"] == "600.00"
        assert contenu["parChantier"][0]["code"] == "TEST-ANA"
    finally:
        with plateforme.moteur.begin() as connexion:
            connexion.execute(text("DELETE FROM paie WHERE id = :id"), {"id": bulletin})
            connexion.execute(text("DELETE FROM employe WHERE id = :id"), {"id": employe})
            connexion.execute(text("DELETE FROM chantier WHERE id = :id"), {"id": chantier})
            connexion.execute(text("DELETE FROM fonction WHERE id = :id"), {"id": fonction})
