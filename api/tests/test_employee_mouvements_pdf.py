"""PDF des mouvements du mois : gabarit HTML (chantiers, KPI, échappement, droits) et routes de téléchargement.

Le rendu WeasyPrint lui-même est remplacé par un double ; la page rendue se vérifie dans l'image Linux (Pango absent
sous Windows, voir `conventions/lecons.md`).
"""

from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from conftest import ADMIN, Plateforme
from test_employee_mouvements import Jeu, jeu  # noqa: F401  (fixture partagée)

from staport.domains.employee import mouvements_pdf
from staport.domains.employee.mouvements_pdf import Mouvements
from staport.domains.employee.schemas import (
    EmployeeEntrantReponse,
    EmployeeEntrantsMoisReponse,
    EmployeeMouvementsRecherche,
    EmployeeSortieReponse,
    EmployeeSortiesMoisReponse,
    TypeEntree,
)

MAINTENANT = datetime(2026, 4, 2, 9, 5)


def _sortie(nom: str, chantier: str | None, **champs: Any) -> EmployeeSortieReponse:
    base: dict[str, Any] = {
        "employe_id": 1,
        "nom_prenom": nom,
        "cin": "AB1",
        "periode": 202603,
        "motif": "STC",
        "date_embauche": date(2024, 1, 2),
        "anciennete_mois": 26,
        "fonction": "Maçon",
        "chantier": chantier,
        "chantier_designation": None if chantier is None else f"Désignation {chantier}",
        "derniere_paie": 202603,
        "jours_travailles": Decimal(26),
        "montant_dernier_bulletin": Decimal(3000),
    }
    return EmployeeSortieReponse.model_validate(base | champs)


def _entrant(nom: str, chantier: str, **champs: Any) -> EmployeeEntrantReponse:
    base: dict[str, Any] = {
        "employe_id": 2,
        "nom_prenom": nom,
        "cin": "CD2",
        "periode": 202603,
        "type": TypeEntree.RETOUR,
        "date_embauche": date(2020, 5, 1),
        "fonction_id": 1,
        "fonction": "Grutier",
        "chantier_id": 1,
        "chantier": chantier,
        "chantier_designation": f"Désignation {chantier}",
        "chantier_precedent": "C9",
        "jours_travailles": Decimal(20),
        "montant_bulletin": Decimal(2500),
    }
    return EmployeeEntrantReponse.model_validate(base | champs)


def _mouvements(avec_paie: bool = True, comparable: bool = True) -> Mouvements:
    sortants = [
        _sortie("<script>alert(1)</script>", "C108"),
        _sortie("Zoe Sans", None, motif="ABANDON", derniere_paie=None, montant_dernier_bulletin=None),
        _sortie("Adam C57", "C57"),
    ]
    entrants = [_entrant("Bravo", "C57"), _entrant("Charlie", "C205", type=TypeEntree.NOUVELLE_EMBAUCHE)]
    return Mouvements(
        periode=202603,
        sorties=EmployeeSortiesMoisReponse(
            periode=202603, nombre=3, par_motif={"ABANDON": 1, "STC": 2}, sorties=sortants
        ),
        entrants=EmployeeEntrantsMoisReponse(
            periode=202603,
            comparable=comparable,
            nombre=2 if comparable else 0,
            nouvelles_embauches=1 if comparable else 0,
            retours=1 if comparable else 0,
            entrants=entrants if comparable else [],
        ),
        effectif=120,
        filtres=[("Mois", "2026-03"), ("Nom", "a")],
        avec_paie=avec_paie,
    )


def test_le_pdf_regroupe_par_chantier_dans_l_ordre_naturel_avec_les_kpi_d_abord() -> None:
    html = mouvements_pdf.construire_html(_mouvements(), MAINTENANT)

    assert "Mouvements — mars 2026" in html and "Édité le 02/04/2026 à 09:05" in html
    assert html.index('class="kpis"') < html.index('class="chantier')
    ordre = [html.index(c) for c in ("C57 —", "C108 —", "C205 —", "Sans chantier")]
    assert ordre == sorted(ordre), "C57, C108, C205 puis « sans chantier »"
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html and "<script>" not in html
    solde = f"{mouvements_pdf.MOINS}1"  # 2 entrants moins 3 sortants
    assert f'<span class="lib">Solde net</span><span class="val">{solde}</span>' in html
    assert '<span class="lib">Effectif payé</span><span class="val">120</span>' in html
    assert "Masse entrante (DH)" in html and "Montant (DH)" in html
    assert "Total · 1 entrant" in html and "Nouvelle embauche" in html and "Venant de" in html
    assert html.count("Aucun entrant sur ce chantier.") == 2  # C108 et « sans chantier »
    assert html.count("Aucun sortant sur ce chantier.") == 1  # C205


def test_le_pdf_masque_les_montants_sans_droit_de_paie() -> None:
    html = mouvements_pdf.construire_html(_mouvements(avec_paie=False), MAINTENANT)

    for interdit in ("Montant (DH)", "Masse entrante", "Masse sortante", "Observation", "Jours"):
        assert interdit not in html, interdit


def test_le_pdf_explique_des_entrants_indisponibles_et_un_perimetre_vide() -> None:
    html = mouvements_pdf.construire_html(_mouvements(comparable=False), MAINTENANT)
    assert "Entrants indisponibles" in html
    assert '<span class="lib">Solde net</span><span class="val">—</span>' in html

    vide = Mouvements(
        periode=202603,
        sorties=None,
        entrants=EmployeeEntrantsMoisReponse(
            periode=202603, comparable=True, nombre=0, nouvelles_embauches=0, retours=0, entrants=[]
        ),
        effectif=None,
        filtres=[],
        avec_paie=True,
    )
    html = mouvements_pdf.construire_html(vide, MAINTENANT)
    assert "Entrants — mars 2026" in html and "Aucun mouvement pour ce périmètre." in html


def test_le_pdf_des_sortants_seuls_donne_stc_autres_motifs_et_anciennete() -> None:
    tout = _mouvements()
    html = mouvements_pdf.construire_html(
        Mouvements(tout.periode, tout.sorties, None, None, tout.filtres, True), MAINTENANT
    )

    assert "Sortants — mars 2026" in html
    assert '<span class="lib">STC</span><span class="val">2</span><span class="detail">67 % des départs</span>' in html
    assert "ABANDON : 1" in html and "2 ans 2 mois" in html


def test_les_filtres_du_bandeau_ne_reprennent_que_ceux_appliques() -> None:
    complets = EmployeeMouvementsRecherche.model_validate(
        {"periode": "2026-03", "nomPrenom": " ali ", "chantierIds": [1, 2], "equipeIds": [0]}
    )
    assert mouvements_pdf.filtres_appliques(complets, ["NON_PRECISE", "STC"], [TypeEntree.RETOUR]) == [
        ("Mois", "2026-03"),
        ("Nom", "ali"),
        ("Chantiers", "2 chantiers"),
        ("Équipes", "Sans équipe"),
        ("Motifs", "Non précisé, STC"),
        ("Types", "Retour"),
    ]
    simple = EmployeeMouvementsRecherche.model_validate({"periode": "2026-03"})
    assert mouvements_pdf.filtres_appliques(simple, None, None) == [("Mois", "2026-03")]


def test_l_anciennete_se_lit_en_annees_et_en_mois() -> None:
    assert [mouvements_pdf.anciennete(x) for x in (None, 0, 5, 12, 14, 878)] == [
        "—",
        "0 mois",
        "5 mois",
        "1 an",
        "1 an 2 mois",
        "73 ans 2 mois",
    ]


def _entetes(connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}


@pytest.mark.parametrize(
    ("chemin", "fichier", "titre"),
    [
        ("sorties-mois", "Sortants_2086-03.pdf", "Sortants — mars 2086"),
        ("entrants-mois", "Entrants_2086-03.pdf", "Entrants — mars 2086"),
        ("mouvements-mois", "Mouvements_2086-03.pdf", "Mouvements — mars 2086"),
    ],
)
def test_les_routes_pdf_telechargent_avec_les_filtres_de_l_ecran(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    jeu: Jeu,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
    chemin: str,
    fichier: str,
    titre: str,
) -> None:
    pages: list[str] = []

    async def faux_rendu(html: str, base: Path) -> bytes:
        pages.append(html)
        assert (base / "logo-staport.png").exists() and (base / "fonts" / "LiberationSerif-Regular.ttf").exists()
        return b"%PDF-1.7 essai"

    monkeypatch.setattr(mouvements_pdf, "rendre_pdf", faux_rendu)
    reponse = plateforme.client.post(
        f"/employees/{chemin}/pdf",
        headers=_entetes(connecter),
        json={"periode": "2086-03", "nomPrenom": jeu.marque, "chantierIds": [jeu.chantiers[1]]},
    )

    assert reponse.status_code == 200, reponse.text
    assert reponse.content == b"%PDF-1.7 essai" and reponse.headers["content-type"] == "application/pdf"
    assert reponse.headers["content-disposition"] == f"attachment; filename={fichier}"
    assert titre in pages[0] and '<span class="lib">Chantiers</span><span>1 chantier</span>' in pages[0]
    if chemin != "sorties-mois":
        assert f"MV{jeu.marque}1 — Chantier 1" in pages[0] and "Charlie" in pages[0]


def test_l_export_pdf_exige_le_droit_dedie_et_taise_la_paie_sans_paie_read(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
    jeu: Jeu,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pages: list[str] = []

    async def faux_rendu(html: str, base: Path) -> bytes:
        pages.append(html)
        return b"%PDF"

    monkeypatch.setattr(mouvements_pdf, "rendre_pdf", faux_rendu)
    corps = {"periode": "2086-03", "nomPrenom": jeu.marque}
    _id, mdp = creer_utilisateur(roles=("SYSTEM_ADMIN",), refusees=("EMPLOYEE_EXPORT",), username="sans-export-mv")
    refuse = {"Authorization": f"Bearer {connecter('sans-export-mv', mdp)['accessToken']}"}
    assert plateforme.client.post("/employees/mouvements-mois/pdf", headers=refuse, json=corps).status_code == 403

    _id, mdp = creer_utilisateur(roles=("SYSTEM_ADMIN",), refusees=("PAIE_READ",), username="sans-paie-export-mv")
    sans_paie = {"Authorization": f"Bearer {connecter('sans-paie-export-mv', mdp)['accessToken']}"}
    reponse = plateforme.client.post("/employees/mouvements-mois/pdf", headers=sans_paie, json=corps)
    assert reponse.status_code == 200, reponse.text
    assert "Charlie" in pages[0] and "Montant (DH)" not in pages[0]
