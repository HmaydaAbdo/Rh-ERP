from collections.abc import Callable
from decimal import Decimal
from types import SimpleNamespace
from typing import Any, cast

from conftest import ADMIN, Plateforme

from staport.domains.common.audit_contexte import Auditeur
from staport.domains.paie.report import ServiceRapportPaie, _montant, _quantite  # pyright: ignore[reportPrivateUsage]
from staport.domains.paie.schemas import PaieRapportRequete


def test_rapport_incomplet_ne_peut_pas_etre_telecharge(plateforme: Plateforme, connecter: Any) -> None:
    jeton = connecter(*ADMIN)["accessToken"]
    reponse = plateforme.client.post(
        "/paie/report/pdf", headers={"Authorization": f"Bearer {jeton}"}, json={"periode": "2026-10"}
    )
    assert reponse.status_code == 503
    assert reponse.headers["content-type"].startswith("application/json")
    assert "temporairement indisponible" in reponse.json()["message"]


def test_gabarit_pdf_et_regroupement_des_equipes() -> None:
    chantier = SimpleNamespace(code="CH01", nom="Chantier A")
    fonction = SimpleNamespace(libelle="Conducteur")
    lignes: list[tuple[Any, Any, Any, Any, Any]] = []
    for nom, equipe in (("Alice", "CH"), ("Bob", "OP"), ("Claire", "Autre")):
        paie = SimpleNamespace(
            chantier_id=1,
            salaire_total=Decimal("1000.00"),
            salaire_mensuel=Decimal("1000.00"),
            observation=None,
            nombre_jours_travailles=Decimal("20"),
            jours_recuperation_ouvrable=None,
            jours_recuperation_dimanche=None,
            prime_roulage_ordinaire=None,
            prime_roulage_dimanche=None,
        )
        lignes.append(
            (paie, SimpleNamespace(nom_prenom=nom, cin=nom), chantier, SimpleNamespace(libelle=equipe), fonction)
        )
    requete = PaieRapportRequete(periode="2026-10", regroupements_equipes_par_chantier={"CH01": [["CH", "OP"]]})
    service = ServiceRapportPaie(cast(Auditeur, object()))
    rendre = cast(Callable[..., str], service._html)  # pyright: ignore[reportPrivateUsage]
    html = rendre(requete, lignes)
    assert '<div class="valeur">Octobre</div>' in html
    assert "ÉQUIPE : CH + OP" in html
    assert html.count('<td class="nom-prenom">') == 3
    assert '<td class="equipe">CH</td>' in html
    assert '<td class="equipe">OP</td>' in html
    assert "Page 1 / 3" in html and "Page 3 / 3" in html
    filtre = PaieRapportRequete(periode="2026-10", nom_prenom="Ali%", sans_vue_ensemble=True)
    html_filtre = rendre(filtre, lignes)
    assert "Périmètre du rapport" in html_filtre
    assert "Nom &amp; prénom contient : Ali%" in html_filtre
    assert "Synthèse de la paie" not in html_filtre
    assert "Page 1 / 2" in html_filtre and "Page 2 / 2" in html_filtre

    lignes_nombreuses: list[tuple[Any, Any, Any, Any, Any]] = [
        (paie, SimpleNamespace(nom_prenom=f"Employé {i}", cin=f"CIN{i}"), chantier, equipe, fonction)
        for i in range(65)
        for paie, _, chantier, equipe, fonction in lignes[:1]
    ]
    html_nombreux = rendre(PaieRapportRequete(periode="2026-10"), lignes_nombreuses)
    assert html_nombreux.count('<td class="nom-prenom">') == 65
    assert "Page 4 / 4" in html_nombreux
    assert html_nombreux.count("<thead><tr>") == 1


def test_format_des_nombres_du_tableau_pdf_correspond_au_rapport_spring() -> None:
    assert _montant(Decimal("1234567.80")) == "1\u00a0234\u00a0567,80"
    assert _montant(None) == "-"
    assert _quantite(Decimal("23.50")) == "23,5"
    assert _quantite(Decimal("0.00")) == "0"
    assert _quantite(None) == "-"
