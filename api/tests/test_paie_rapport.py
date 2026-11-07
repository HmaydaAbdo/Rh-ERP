import asyncio
from collections.abc import Callable
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

from conftest import ADMIN, Plateforme
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur
from staport.domains.employee.models import Employee, EmployeeStatut
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction
from staport.domains.paie import report
from staport.domains.paie.models import Paie
from staport.domains.paie.report import ServiceRapportPaie
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
    chantier = SimpleNamespace(id=1, code="CH01", nom="Chantier A")
    fonction = SimpleNamespace(libelle="Conducteur")
    lignes: list[tuple[Any, Any, Any, Any, Any]] = []
    for equipe_id, (nom, equipe) in enumerate((("Alice", "CH"), ("Bob", "OP"), ("Claire", "Autre")), start=1):
        paie = SimpleNamespace(
            chantier_id=1,
            equipe_id=equipe_id,
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
            (
                paie,
                SimpleNamespace(nom_prenom=nom, cin=nom),
                chantier,
                SimpleNamespace(id=equipe_id, code=equipe, libelle=equipe),
                fonction,
            )
        )
    requete = PaieRapportRequete(periode="2026-10", regroupements_equipes_par_chantier={"CH01": [["CH", "OP"]]})
    ligne_precedente = (
        SimpleNamespace(salaire_total=Decimal("500.00"), observation="STC", chantier_id=1),
        SimpleNamespace(),
        chantier,
        None,
        fonction,
    )
    service = ServiceRapportPaie(cast(Auditeur, object()))
    rendre = cast(Callable[..., str], service._html)  # pyright: ignore[reportPrivateUsage]
    html = rendre(requete, lignes, [ligne_precedente])
    assert '<div class="valeur">Octobre</div>' in html
    assert "ÉQUIPE : CH + OP" in html
    assert '<div class="graphique">' in html and "<svg" in html
    assert "Masse (DH)" in html
    assert "Bulletins" in html and "STC bul." in html and "STC (DH)" in html
    assert "Masse salariale par équipe (DH)" in html
    assert "1. Masse salariale et montants des STC (DH)" in html
    assert "2. Bulletins de paie et sorties du personnel (bulletins)" in html
    assert "3. Répartition par chantier" in html
    assert "4. Liste des employés" in html
    pages_rapport = html.split('<div class="page">')[1:]
    assert any('table class="recap fonction"' in page and "4. Liste des employés" in page for page in pages_rapport)
    assert "Écart : +2\u00a0500 DH (+500,0 %)" in html
    assert "Écart : +2" in html
    assert html.count('<td class="nom-prenom">') == 3
    assert '<td class="equipe">CH</td>' in html
    assert '<td class="equipe">OP</td>' in html
    assert "Page 1 / 6" in html and "Page 6 / 6" in html
    assert "II — CHANTIER : Chantier A (CH01)" in html
    assert "STC (PERS.)" in html
    html_equipe = rendre(
        PaieRapportRequete(periode="2026-10", equipes_par_chantier={"CH01": ["CH"]}),
        lignes,
        [],
        None,
        None,
        {(1, 1): [report.PointEvolution(202610, Decimal("1000"), 1, 0, Decimal(0))]},
    )
    assert "ÉQUIPE : CH" in html_equipe and "10/2026" in html_equipe
    assert "CHANTIER : Chantier A (CH01) · ÉQUIPE : CH" in html_equipe
    assert "Masse salariale par fonction (DH)" in html_equipe
    assert "STC (PERS.)" in html_equipe
    assert "3. Répartition par fonction" in html_equipe
    assert "4. Liste des employés" in html_equipe
    assert "Page 8 / 8" in html_equipe
    chantier_materiel = SimpleNamespace(id=1, code="C168", nom="Chantier C168")
    lignes_materiel = [
        (paie, employe, chantier_materiel, equipe, fonction) for paie, employe, _, equipe, fonction in lignes[:1]
    ]
    html_materiel = rendre(
        PaieRapportRequete(
            periode="2026-10",
            equipes_par_chantier={"C168": ["CH"]},
            materiel={"CAMION CITERNE": 4},
        ),
        lignes_materiel,
        [],
        None,
        {1: [report.PointEvolution(202610, Decimal("1000"), 1, 0, Decimal(0))]},
        {(1, 1): [report.PointEvolution(202610, Decimal("1000"), 1, 0, Decimal(0))]},
    )
    assert "4. Parc matériel — CAMION" in html_materiel
    assert "5. Liste des employés" in html_materiel
    pages_materiel = html_materiel.split('<div class="page">')[1:]
    assert any("3. Répartition par fonction" in page and "4. Parc matériel — CAMION" in page for page in pages_materiel)
    chantier_long = SimpleNamespace(id=1, code="CH01", nom="Chantier avec un libellé très long " * 5)
    lignes_longues = [
        (paie, employe, chantier_long, equipe, fonction) for paie, employe, _, equipe, fonction in lignes[:1]
    ]
    html_niveau_long = rendre(
        PaieRapportRequete(periode="2026-10", equipes_par_chantier={"CH01": ["CH"]}),
        lignes_longues,
    )
    assert 'bloc bloc-niveau lignes-2">CHANTIER :' in html_niveau_long
    filtre = PaieRapportRequete(periode="2026-10", nom_prenom="Ali%", sans_vue_ensemble=True)
    html_filtre = rendre(filtre, lignes)
    assert "Périmètre du rapport" in html_filtre
    assert "Nom &amp; prénom contient : Ali%" in html_filtre
    assert "I — Vue d'ensemble" not in html_filtre
    assert "I — CHANTIER : Chantier A (CH01)" in html_filtre
    assert "Page 1 / 4" in html_filtre and "Page 4 / 4" in html_filtre

    # Le contrat Spring découpe les critères longs avant de générer les pages physiques.
    rapport = cast(Any, report)
    original_filtres = rapport._filtres_actifs

    def filtres_longs(_requete: Any, _lignes: Any) -> list[str]:
        return ["Filtre : " + "mot " * 2500]

    rapport._filtres_actifs = filtres_longs
    try:
        html_perimetre_long = rendre(PaieRapportRequete(periode="2026-10"), lignes)
    finally:
        rapport._filtres_actifs = original_filtres
    assert "Périmètre du rapport (suite)" in html_perimetre_long
    assert "Page 2 /" in html_perimetre_long

    lignes_nombreuses: list[tuple[Any, Any, Any, Any, Any]] = [
        (paie, SimpleNamespace(nom_prenom=f"Employé {i}", cin=f"CIN{i}"), chantier, equipe, fonction)
        for i in range(65)
        for paie, _, chantier, equipe, fonction in lignes[:1]
    ]
    html_nombreux = rendre(PaieRapportRequete(periode="2026-10"), lignes_nombreuses)
    assert html_nombreux.count('<td class="nom-prenom">') == 65
    assert "Page 7 / 7" in html_nombreux
    assert html_nombreux.count("<thead><tr>") == 2
    assert html_nombreux.count('<table class="recap fonction">') == 1


def test_format_des_nombres_du_tableau_pdf_correspond_au_rapport_spring() -> None:
    rapport = cast(Any, report)
    assert rapport._montant(Decimal("1234567.80")) == "1\u00a0234\u00a0567,80"
    assert rapport._montant(None) == "-"
    assert rapport._quantite(Decimal("23.50")) == "23,5"
    assert rapport._quantite(Decimal("0.00")) == "0"
    assert rapport._quantite(None) == "-"


def test_comparaison_du_rapport_preserve_absence_et_base_nulle() -> None:
    rapport = cast(Any, report)
    assert rapport._periode_precedente("2026-01") == "2025-12"
    assert rapport._ecart_montant(Decimal("12.00"), None) == "Écart indisponible"
    assert rapport._ecart_montant(Decimal("12.00"), Decimal("0.00")) == "Écart : +12 DH (base à 0)"
    assert rapport._romain(1) == "I"
    assert rapport._romain(4) == "IV"
    assert rapport._romain(3999) == "MMMCMXCIX"


def test_evolution_garde_la_fenetre_et_les_mois_reellement_presents() -> None:
    rapport = cast(Any, report)
    assert rapport._periodes_recentes("2026-01", 3) == [202601, 202512, 202511]
    svg = rapport._graphique_evolution(
        [
            rapport.PointEvolution(202512, Decimal("1000"), 2, 1, Decimal("500")),
            rapport.PointEvolution(202602, Decimal("1500"), 3, 0, Decimal(0)),
        ]
    )
    assert "12/2025" in svg and "2/2026" in svg
    assert "1/2026" not in svg


def test_materiel_du_catalogue_apparait_seulement_avec_une_quantite_positive() -> None:
    rapport = cast(Any, report)
    assert rapport._graphique_materiel("C168", "CH", {"CAMION CITERNE": 0}) is None
    assert rapport._graphique_materiel("C168", "XX", {"CAMION CITERNE": 2}) is None
    graphique = rapport._graphique_materiel("C168", "CH", {"CAMION CITERNE": 2})
    assert graphique is not None and "Parc matériel — CAMION" in graphique
    assert "CAMION CITERNE" in graphique and "<svg" in graphique


def test_repartition_globale_classe_les_chantiers_par_masse_decroissante() -> None:
    rapport = cast(Any, report)
    faible = SimpleNamespace(salaire_total=Decimal("100"), observation=None, chantier_id=1)
    fort = SimpleNamespace(salaire_total=Decimal("900"), observation="STC", chantier_id=1)
    chantiers = {
        "PETIT": [(faible, None, SimpleNamespace(nom="Petit"), None, None)],
        "GRAND": [(fort, None, SimpleNamespace(nom="Grand"), None, None)],
    }
    svg = rapport._graphiques_repartition_chantiers(chantiers)[0]
    assert svg.index("Grand") < svg.index("Petit")
    assert [len(tranche) for tranche in rapport._repartir_graphiques(list(range(17)), maximum=16)] == [9, 8]
    assert [len(tranche) for tranche in rapport._repartir_graphiques(list(range(33)), maximum=16)] == [11, 11, 11]


def test_repartition_fonctions_repartit_equitablement_les_pages() -> None:
    chantier = SimpleNamespace(id=1, code="CH01", nom="Chantier A")
    lignes = [
        (
            SimpleNamespace(salaire_total=Decimal("100"), observation=None, chantier_id=1),
            SimpleNamespace(nom_prenom=f"Employé {index}"),
            chantier,
            None,
            SimpleNamespace(libelle=f"Fonction {index:02}"),
        )
        for index in range(16)
    ]
    graphiques = cast(Any, report)._graphiques_fonctions(lignes)
    assert len(graphiques) == 2
    assert all(sum(f"Fonction {index:02}" in graphique for index in range(16)) == 8 for graphique in graphiques)


def test_graphique_repartition_presente_les_quatre_mesures_spring() -> None:
    chantier = SimpleNamespace(id=1, code="CH01", nom="Chantier A")
    lignes = [
        (
            SimpleNamespace(salaire_total=Decimal("300"), observation=" STC ", chantier_id=1),
            SimpleNamespace(),
            chantier,
            None,
            SimpleNamespace(libelle="Conducteur"),
        ),
        (
            SimpleNamespace(salaire_total=Decimal("700"), observation=None, chantier_id=1),
            SimpleNamespace(),
            chantier,
            None,
            SimpleNamespace(libelle="Conducteur"),
        ),
    ]
    rapport = cast(Any, report)
    point = rapport._point_repartition("Chantier A", lignes)
    assert (point.masse, point.bulletins, point.stc, point.montant_stc) == (
        Decimal("1000"),
        2,
        1,
        Decimal("300"),
    )
    graphique = rapport._graphique_distribution([point], "Répartition", part_du_total=True)
    assert all(libelle in graphique for libelle in ("Masse (DH)", "Bulletins", "STC bul.", "STC (DH)"))


def test_cartes_kpi_augmentent_de_hauteur_si_un_texte_depasse() -> None:
    rapport = cast(Any, report)
    cartes = [("Indicateur", "1", "Écart indisponible " * 30, "compte")]
    assert rapport._hauteur_cartes_kpi(cartes) > 54


def test_recap_fonctions_decoupe_selon_la_hauteur_des_libelles() -> None:
    rapport = cast(Any, report)
    lignes = [
        (
            SimpleNamespace(salaire_total=Decimal("0"), observation=None, chantier_id=1),
            None,
            None,
            None,
            SimpleNamespace(libelle=f"Fonction métier spécialisée numéro {index:02} " * 2),
        )
        for index in range(45)
    ]
    pages = rapport._recaps_fonctions(lignes)
    assert len(pages) > 1
    assert sum(page[0].count("<tr>") - 1 for page in pages) == 45
    assert "Répartition par fonction (suite)" in pages[1][0]


def test_requete_evolution_agrege_sous_les_filtres_et_omet_les_mois_absents(
    plateforme: Plateforme, monkeypatch: Any
) -> None:
    suffixe = uuid4().hex[:10]
    fonction = Fonction(libelle=f"Rapport {suffixe}")
    chantier = Chantier(code=f"R{suffixe}", nom="Chantier rapport")
    equipe = Equipe(code=f"E{suffixe}", libelle=f"Équipe {suffixe}")
    employe = Employee(
        nom_prenom="Employé rapport",
        cin=f"Q{suffixe}",
        date_naissance=date(1990, 1, 1),
        date_embauche=date(2020, 1, 1),
        fonction_id=0,
        statut=EmployeeStatut.ACTIF,
    )
    ids: tuple[int, int, int, int] | None = None
    try:
        with Session(plateforme.moteur) as session, session.begin():
            session.add_all([fonction, chantier, equipe])
            session.flush()
            employe.fonction_id = fonction.id
            employe.chantier_id = chantier.id
            session.add(employe)
            session.flush()
            for periode, salaire, observation in (
                (202512, Decimal("100.00"), " STC\t"),
                (202602, Decimal("200.00"), " sortie\n"),
            ):
                session.add(
                    Paie(
                        employee_id=employe.id,
                        periode=periode,
                        fonction_id=fonction.id,
                        chantier_id=chantier.id,
                        equipe_id=equipe.id,
                        nombre_jours_travailles=Decimal("1"),
                        salaire_mensuel=salaire,
                        salaire_total=salaire,
                        observation=observation,
                    )
                )
            session.flush()
            ids = fonction.id, chantier.id, employe.id, equipe.id

        assert ids is not None
        htmls: list[str] = []

        async def capturer(html: str, _base: Path) -> bytes:
            htmls.append(html)
            return b"%PDF-1.7 synthetic"

        monkeypatch.setattr(report, "rendre_pdf", capturer)
        moteur_async = create_async_engine(plateforme.url)
        sessions_async = async_sessionmaker(moteur_async, expire_on_commit=False)

        async def generer() -> bytes:
            try:
                async with sessions_async() as session:
                    return (
                        await ServiceRapportPaie(cast(Auditeur, object())).generer(
                            session,
                            PaieRapportRequete(
                                periode="2026-02",
                                nom_prenom="Employé rapport",
                                cin=f"Q{suffixe}",
                                chantier_id=ids[1],
                                equipes_par_chantier={f"R{suffixe}": [f"Équipe {suffixe}"]},
                            ),
                        )
                    ).read()
            finally:
                await moteur_async.dispose()

        assert asyncio.run(generer(), loop_factory=asyncio.SelectorEventLoop) == b"%PDF-1.7 synthetic"
        assert len(htmls) == 1
        assert "12/2025" in htmls[0] and "2/2026" in htmls[0]
        assert htmls[0].count("12/2025") == 3
        assert "1/2026" not in htmls[0]
        assert "STC / sorties" in htmls[0] and "200" in htmls[0]
    finally:
        if ids is not None:
            with plateforme.moteur.begin() as connection:
                connection.execute(delete(Paie).where(Paie.employee_id == ids[2]))
                connection.execute(delete(Employee).where(Employee.id == ids[2]))
                connection.execute(delete(Equipe).where(Equipe.id == ids[3]))
                connection.execute(delete(Chantier).where(Chantier.id == ids[1]))
                connection.execute(delete(Fonction).where(Fonction.id == ids[0]))
