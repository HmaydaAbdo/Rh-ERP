"""Rapport PDF des heures supplémentaires : gabarit et route, le rendu WeasyPrint étant prouvé dans l'image Linux."""

# ruff: noqa: F811  (les fixtures `jeu` et `entetes` importées de test_heuresupp sont reprises par nom)

from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pytest
from conftest import Plateforme
from test_heuresupp import Jeu, _creer, entetes, jeu  # noqa: F401  # pyright: ignore[reportUnusedImport, reportPrivateUsage]

from staport.domains.heuresupp import export_pdf
from staport.domains.heuresupp.exceptions import HeuresSuppInvalide
from staport.domains.heuresupp.schemas import HeuresSuppExportRequete, HeureSuppReponse

MOIS = "2098-07"


def _ligne(**champs: object) -> HeureSuppReponse:
    base: dict[str, object] = {
        "id": 1,
        "version": 1,
        "employee_id": 1,
        "nom_prenom": "Amal Idrissi",
        "cin": "AB123",
        "fonction_id": 1,
        "fonction": "Conductrice",
        "chantier_id": 1,
        "code_chantier": "C1",
        "chantier": "Nador",
        "periode": 202610,
        "salaire_reference_dh": Decimal("2600.00"),
        "type_salaire_reference": "MENSUEL",
        "salaire_horaire_dh": Decimal(10),
        "heures_supplementaires": Decimal("7.5"),
        "montant_dh": Decimal(75),
        "stc_ou_sortie": False,
        "stc_dh": Decimal(0),
        "forfait_dh": None,
        "net_a_payer_dh": Decimal(75),
    }
    return HeureSuppReponse.model_validate(base | champs)


def test_le_tri_accepte_seulement_les_colonnes_de_la_vue_tabulaire() -> None:
    assert export_pdf.trier(None) == (("employee.nomPrenom", True),)
    assert export_pdf.trier(" ") == (("employee.nomPrenom", True),)
    assert export_pdf.trier("montant,desc") == (("montant", False),)
    assert export_pdf.trier("employee.nomPrenom") == (("employee.nomPrenom", True),)
    for tri in ("nimporte,asc", "montant,sideways", "montant,asc,x"):
        with pytest.raises(HeuresSuppInvalide, match="Tri non pris en charge pour l'export"):
            export_pdf.trier(tri)


def test_formats_francais_et_mois_en_toutes_lettres() -> None:
    assert export_pdf.nombre(Decimal("1234567.5"), 1) == "1 234 567,5"
    assert export_pdf.nombre(Decimal("2600"), 2) == "2 600,00"
    assert export_pdf.nombre(Decimal(0), 0) == "0"
    assert export_pdf.nombre(None, 0) == "—"
    assert export_pdf.mois_en_toutes_lettres(202602) == "février 2026"


def test_le_gabarit_echappe_les_donnees_et_totalise_le_perimetre() -> None:
    requete = HeuresSuppExportRequete.model_validate(
        {"periode": "2026-10", "chantierIds": [1], "nomPrenom": " Amal ", "tri": "montant,desc"}
    )
    lignes = [
        _ligne(nom_prenom="<script>alert(1)</script>"),
        _ligne(
            employee_id=2,
            heures_supplementaires=None,
            salaire_horaire_dh=None,
            forfait_dh=Decimal(400),
            net_a_payer_dh=Decimal(475),
        ),
    ]

    html = export_pdf.construire_html(requete, lignes, datetime(2026, 11, 5, 14, 7))

    assert "<script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "Heures supplémentaires — octobre 2026" in html
    assert "2 lignes · 2 employés · classées par montant décroissant" in html
    assert '<span class="lib">Nom</span><span>Amal</span>' in html
    assert '<span class="lib">Mois</span><span>2026-10</span>' in html
    assert '<span class="lib">Chantier</span><span>C1 · Nador</span>' in html
    assert "<th>Mois</th>" not in html
    assert "<th>Chantier</th>" not in html
    assert "Édité le 05/11/2026 à 14:07" in html
    assert "Total · 2 lignes" in html
    assert "<td>—</td>" not in html  # les cellules vides portent la classe « num »
    assert '<td class="num">—</td>' in html
    assert '<td class="num">150</td>' in html  # montant total
    assert '<td class="num">550</td>' in html  # net total
    assert '<th class="emargement signature">Signature</th>' in html
    assert '<td colspan="3">Total · 2 lignes</td>' in html


def test_le_mode_signature_et_empreinte_elargit_l_emargement() -> None:
    requete = HeuresSuppExportRequete.model_validate(
        {"periode": "2026-10", "chantierIds": [1], "mode": "signature_empreinte"}
    )

    html = export_pdf.construire_html(requete, [_ligne()], datetime(2026, 11, 5, 14, 7))

    assert '<th class="emargement signature_empreinte">Signature et empreinte</th>' in html
    assert '<td class="emargement signature_empreinte"></td>' in html
    assert "Salaire réf." not in html
    assert requete.criteres().model_dump().get("mode") is None


def test_un_perimetre_vide_et_un_seul_mois() -> None:
    requete = HeuresSuppExportRequete.model_validate({"periode": "2026-10"})

    html = export_pdf.construire_html(requete, [], datetime(2026, 11, 5, 9, 0))

    assert "Aucune ligne pour ce périmètre." in html
    assert "Total · 0 ligne" in html
    assert export_pdf.nom_fichier(requete) == "Heures_supplementaires_2026-10.pdf"
    assert export_pdf.nom_fichier(HeuresSuppExportRequete()) == "Heures_supplementaires_tous-les-mois.pdf"
    plusieurs = HeuresSuppExportRequete.model_validate({"periodes": ["2026-09", "2026-10"]})
    assert export_pdf.nom_fichier(plusieurs) == "Heures_supplementaires_plusieurs-mois.pdf"


def test_la_route_filtre_trie_et_telecharge(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu, monkeypatch: pytest.MonkeyPatch
) -> None:
    pages: list[str] = []

    async def faux_rendu(html: str, base: Path) -> bytes:
        pages.append(html)
        assert (base / "logo-staport.png").exists()
        assert (base / "fonts" / "LiberationSerif-Regular.ttf").exists()
        return b"%PDF-1.7 essai"

    monkeypatch.setattr(export_pdf, "rendre_pdf", faux_rendu)
    _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1")
    _creer(plateforme, entetes, jeu, 1, heuresSupplementaires="5")

    reponse = plateforme.client.post(
        "/heures-supp/export/pdf",
        headers=entetes,
        json={"periode": MOIS, "chantierIds": [jeu.chantier], "tri": "montant,desc"},
    )
    refus = plateforme.client.post(
        "/heures-supp/export/pdf", headers=entetes, json={"periode": MOIS, "chantierIds": [jeu.chantier], "tri": "x"}
    )

    assert reponse.status_code == 200, reponse.text
    assert reponse.headers["content-type"] == "application/pdf"
    assert reponse.headers["content-disposition"] == f"attachment; filename=Heures_supplementaires_{MOIS}.pdf"
    assert reponse.content == b"%PDF-1.7 essai"
    assert pages[0].index("Heures 1") < pages[0].index("Heures 0")  # montant décroissant
    assert (refus.status_code, refus.json()["message"]) == (400, "Tri non pris en charge pour l'export : x")


def test_l_export_refuse_un_perimetre_trop_grand(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(export_pdf, "LIGNES_MAX", 1)
    _creer(plateforme, entetes, jeu, 0, heuresSupplementaires="1")
    _creer(plateforme, entetes, jeu, 1, heuresSupplementaires="5")

    reponse = plateforme.client.post(
        "/heures-supp/export/pdf", headers=entetes, json={"periode": MOIS, "chantierIds": [jeu.chantier]}
    )

    assert reponse.status_code == 400
    assert reponse.json()["message"] == (
        "L'export dépasse 1 lignes. Affinez les filtres (mois, chantier, employé) avant d'exporter."
    )


def test_l_export_exige_un_seul_mois_et_un_seul_chantier(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    attendu = "L'export PDF porte sur un seul mois et un seul chantier : filtrez-les avant d'exporter."
    sans_chantier = plateforme.client.post("/heures-supp/export/pdf", headers=entetes, json={"periode": MOIS})
    sans_mois = plateforme.client.post("/heures-supp/export/pdf", headers=entetes, json={"chantierIds": [jeu.chantier]})
    deux_chantiers = plateforme.client.post(
        "/heures-supp/export/pdf",
        headers=entetes,
        json={"periode": MOIS, "chantierIds": [jeu.chantier, jeu.autre_chantier]},
    )

    for reponse in (sans_chantier, sans_mois, deux_chantiers):
        assert (reponse.status_code, reponse.json()["message"]) == (400, attendu)
