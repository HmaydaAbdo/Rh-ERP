"""Import de paie : départs (STC, sortie, absents) et retours, de bout en bout sur PostgreSQL réel.

Parité avec `PaieImportService.examiner` / `importer` : l'analyse propose, l'import n'enregistre que les départs
confirmés, repasse les inactifs présents en ACTIF, le tout dans une seule transaction.
"""

import json
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from io import BytesIO
from typing import Any

import pytest
from conftest import ADMIN, Plateforme
from openpyxl import Workbook
from sqlalchemy import text

TYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@dataclass
class Jeu:
    marque: str
    periode: str
    periode_numerique: int
    fonction: int
    chantier: int
    code_chantier: str
    libelle_fonction: str
    present: int
    stc: int
    absent: int
    retour: int
    employes: list[int]


def _employe(c: Any, marque: str, rang: str, fonction: int, chantier: int | None, statut: str) -> int:
    return c.execute(
        text(
            "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, statut, "
            "salaire, type_salaire) VALUES (:n, :cin, '1990-01-01', '2020-01-01', :f, :c, :s, 1000, 'MENSUEL') "
            "RETURNING id"
        ),
        {"n": f"Import {rang}", "cin": f"I{marque}{rang}", "f": fonction, "c": chantier, "s": statut},
    ).scalar_one()


@pytest.fixture
def jeu(plateforme: Plateforme) -> Iterator[Jeu]:
    marque = uuid.uuid4().hex[:6].upper()
    with plateforme.moteur.begin() as c:
        dernier = c.execute(text("SELECT max(periode) FROM paie")).scalar_one()
        numerique = (
            209901 if dernier is None else (dernier + 1 if dernier % 100 < 12 else (dernier // 100 + 1) * 100 + 1)
        )
        libelle = f"IMP {marque}"
        code = f"I{marque}"
        fonction = c.execute(
            text("INSERT INTO fonction (libelle) VALUES (:l) RETURNING id"), {"l": libelle}
        ).scalar_one()
        chantier = c.execute(
            text("INSERT INTO chantier (code, designation) VALUES (:c, 'Import') RETURNING id"), {"c": code}
        ).scalar_one()
        present = _employe(c, marque, "A", fonction, chantier, "ACTIF")
        stc = _employe(c, marque, "B", fonction, chantier, "ACTIF")
        absent = _employe(c, marque, "C", fonction, chantier, "ACTIF")
        retour = _employe(c, marque, "D", fonction, None, "INACTIF")
    jeu = Jeu(
        marque,
        f"{numerique // 100}-{numerique % 100:02d}",
        numerique,
        fonction,
        chantier,
        code,
        libelle,
        present,
        stc,
        absent,
        retour,
        [present, stc, absent, retour],
    )
    yield jeu
    with plateforme.moteur.begin() as c:
        c.execute(text("DELETE FROM paie WHERE employee_id = ANY(:e)"), {"e": jeu.employes})
        c.execute(text("DELETE FROM employe_sortie WHERE employee_id = ANY(:e)"), {"e": jeu.employes})
        c.execute(text("DELETE FROM employe WHERE id = ANY(:e)"), {"e": jeu.employes})
        c.execute(text("DELETE FROM chantier WHERE id = :c"), {"c": chantier})
        c.execute(text("DELETE FROM fonction WHERE id = :f"), {"f": fonction})


def _classeur(jeu: Jeu, *, avec_retour: bool = True) -> bytes:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    for _ in range(3):
        feuille.append([])
    lignes = [("A", None), ("B", "stc")]
    if avec_retour:
        lignes.append(("D", None))
    for rang, observation in lignes:
        feuille.append(
            [
                f"Import {rang}",
                jeu.libelle_fonction,
                f"I{jeu.marque}{rang}",
                26,
                None,
                None,
                1000,
                None,
                None,
                1000,
                observation,
                jeu.code_chantier,
                None,
            ]
        )
    sortie = BytesIO()
    classeur.save(sortie)
    return sortie.getvalue()


def _entetes(connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}


def _analyser(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu, contenu: bytes) -> Any:
    return plateforme.client.post(
        "/paie/import/analyse",
        headers=entetes,
        data={"periode": jeu.periode},
        files={"file": ("paie.xlsx", contenu, TYPE_XLSX)},
    )


def _importer(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu, contenu: bytes, departs: list[dict[str, Any]]):
    return plateforme.client.post(
        "/paie/import",
        headers=entetes,
        data={"periode": jeu.periode, "periode_confirmee": "true", "departs": json.dumps({"departs": departs})},
        files={"file": ("paie.xlsx", contenu, TYPE_XLSX)},
    )


def _statut(plateforme: Plateforme, employe: int) -> tuple[str, int | None]:
    with plateforme.moteur.connect() as c:
        ligne = c.execute(text("SELECT statut, chantier_id FROM employe WHERE id = :e"), {"e": employe}).one()
    return ligne[0], ligne[1]


def _bulletins(plateforme: Plateforme, jeu: Jeu) -> int:
    with plateforme.moteur.connect() as c:
        return c.execute(
            text("SELECT count(*) FROM paie WHERE employee_id = ANY(:e)"), {"e": jeu.employes}
        ).scalar_one()


def test_analyse_propose_les_departs_stc_et_absents_et_les_retours(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    reponse = _analyser(plateforme, _entetes(connecter), jeu, _classeur(jeu))

    assert reponse.status_code == 200, reponse.text
    analyse = reponse.json()
    ces_employes = [d for d in analyse["departs"] if d["employeId"] in jeu.employes]
    assert ces_employes == [
        {"employeId": jeu.stc, "cin": f"I{jeu.marque}B", "nomPrenom": "Import B", "motif": "STC"},
        {"employeId": jeu.absent, "cin": f"I{jeu.marque}C", "nomPrenom": "Import C", "motif": None},
    ]
    assert [r for r in analyse["retours"] if r["employeId"] in jeu.employes] == [
        {"employeId": jeu.retour, "cin": f"I{jeu.marque}D", "nomPrenom": "Import D"}
    ]


def test_import_enregistre_les_departs_confirmes_et_repasse_les_retours_actifs(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    departs = [{"employeId": jeu.stc, "motif": "STC"}, {"employeId": jeu.absent, "motif": " Démission "}]

    reponse = _importer(plateforme, _entetes(connecter), jeu, _classeur(jeu), departs)

    assert reponse.status_code == 200, reponse.text
    assert reponse.json() == {"periode": jeu.periode, "crees": 3, "departs": 2, "retours": 1}
    assert _bulletins(plateforme, jeu) == 3
    assert _statut(plateforme, jeu.stc) == ("INACTIF", None)
    assert _statut(plateforme, jeu.absent) == ("INACTIF", None)
    assert _statut(plateforme, jeu.retour)[0] == "ACTIF"
    assert _statut(plateforme, jeu.present)[0] == "ACTIF"
    with plateforme.moteur.connect() as c:
        motifs = dict(
            c.execute(
                text("SELECT employee_id, motif FROM employe_sortie WHERE employee_id = ANY(:e)"), {"e": jeu.employes}
            ).all()
        )
        journal = (
            c.execute(
                text(
                    "SELECT nombre_elements, perimetre FROM audit_journal WHERE action = 'PAIE_IMPORT' "
                    "ORDER BY id DESC LIMIT 1"
                )
            )
            .mappings()
            .one()
        )
    assert motifs == {jeu.stc: "STC", jeu.absent: "Démission"}
    assert journal["nombre_elements"] == 3
    assert journal["perimetre"]["departs"] == 2
    assert journal["perimetre"]["retours"] == 1


def test_import_sans_depart_confirme_laisse_les_employes_actifs(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    reponse = _importer(plateforme, _entetes(connecter), jeu, _classeur(jeu), [])

    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["departs"] == 0
    assert _statut(plateforme, jeu.stc)[0] == "ACTIF"
    assert _statut(plateforme, jeu.absent)[0] == "ACTIF"
    assert _bulletins(plateforme, jeu) == 3


def test_import_refuse_un_depart_que_l_analyse_n_a_pas_propose(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    reponse = _importer(
        plateforme, _entetes(connecter), jeu, _classeur(jeu), [{"employeId": jeu.present, "motif": "STC"}]
    )

    assert reponse.status_code == 400, reponse.text
    assert reponse.json()["message"] == (
        f"Ce départ n'a pas été proposé par l'analyse du fichier : employé {jeu.present}"
    )
    assert _bulletins(plateforme, jeu) == 0
    assert _statut(plateforme, jeu.retour)[0] == "INACTIF"


def test_import_refuse_un_motif_de_depart_vide_sans_rien_ecrire(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    reponse = _importer(plateforme, _entetes(connecter), jeu, _classeur(jeu), [{"employeId": jeu.stc, "motif": "   "}])

    assert reponse.status_code == 400, reponse.text
    assert "motif" in reponse.json()["message"]
    assert _bulletins(plateforme, jeu) == 0
    assert _statut(plateforme, jeu.retour)[0] == "INACTIF"
    assert _statut(plateforme, jeu.stc)[0] == "ACTIF"


def test_import_atomique_un_depart_deja_enregistre_annule_toute_l_importation(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    with plateforme.moteur.begin() as c:
        c.execute(
            text("INSERT INTO employe_sortie (employee_id, periode, motif) VALUES (:e, :p, 'Ancien')"),
            {"e": jeu.stc, "p": jeu.periode_numerique},
        )

    reponse = _importer(plateforme, _entetes(connecter), jeu, _classeur(jeu), [{"employeId": jeu.stc, "motif": "STC"}])

    assert reponse.status_code == 400, reponse.text
    assert "Un départ est déjà enregistré pour cet employé ce mois-ci" in reponse.json()["message"]
    assert _bulletins(plateforme, jeu) == 0, "rollback multi-lignes : aucun bulletin ne doit rester"
    assert _statut(plateforme, jeu.retour)[0] == "INACTIF"


def test_un_retour_sans_type_de_salaire_est_refuse_et_annule_l_import(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    with plateforme.moteur.begin() as c:
        c.execute(text("UPDATE employe SET type_salaire = NULL WHERE id = :e"), {"e": jeu.retour})

    reponse = _importer(plateforme, _entetes(connecter), jeu, _classeur(jeu), [])

    assert reponse.status_code == 400, reponse.text
    assert reponse.json()["message"] == "Le type de salaire de Import D doit être renseigné avant son retour"
    assert _bulletins(plateforme, jeu) == 0
    assert _statut(plateforme, jeu.retour)[0] == "INACTIF"


@pytest.fixture
def equipe_de_present(plateforme: Plateforme, jeu: Jeu) -> Iterator[int]:
    """Donne une équipe à l'employé présent dans le fichier ; le fichier la laisse vide."""
    with plateforme.moteur.begin() as c:
        equipe = c.execute(
            text("INSERT INTO equipe (code, libelle) VALUES (:c, 'Equipe import') RETURNING id"),
            {"c": f"E{jeu.marque}"},
        ).scalar_one()
        c.execute(text("UPDATE employe SET equipe_id = :q WHERE id = :e"), {"q": equipe, "e": jeu.present})
    yield equipe
    with plateforme.moteur.begin() as c:
        c.execute(text("UPDATE employe SET equipe_id = NULL WHERE id = :e"), {"e": jeu.present})
        c.execute(text("DELETE FROM equipe WHERE id = :q"), {"q": equipe})


def _equipe_de(plateforme: Plateforme, employe: int) -> int | None:
    with plateforme.moteur.connect() as c:
        return c.execute(text("SELECT equipe_id FROM employe WHERE id = :e"), {"e": employe}).scalar_one()


def _importer_avec_equipes(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu, decisions: list[dict[str, Any]]
) -> Any:
    return plateforme.client.post(
        "/paie/import",
        headers=entetes,
        data={"periode": jeu.periode, "periode_confirmee": "true", "equipes": json.dumps({"decisions": decisions})},
        files={"file": ("paie.xlsx", _classeur(jeu), TYPE_XLSX)},
    )


def test_equipe_vide_dans_le_fichier_est_un_avertissement_a_decider(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu, equipe_de_present: int
) -> None:
    entetes = _entetes(connecter)

    analyse = _analyser(plateforme, entetes, jeu, _classeur(jeu)).json()
    sans_decision = _importer(plateforme, entetes, jeu, _classeur(jeu), [])

    avertissements = [a for a in analyse["avertissements"] if a["employeId"] == jeu.present]
    assert [a["codeAvertissement"] for a in avertissements] == ["EQUIPE_VIDE"]
    assert sans_decision.status_code == 400, sans_decision.text
    assert _bulletins(plateforme, jeu) == 0
    assert _equipe_de(plateforme, jeu.present) == equipe_de_present


def test_decision_conserver_laisse_l_equipe_et_importe(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu, equipe_de_present: int
) -> None:
    reponse = _importer_avec_equipes(
        plateforme, _entetes(connecter), jeu, [{"employeId": jeu.present, "action": "CONSERVER"}]
    )

    assert reponse.status_code == 200, reponse.text
    assert _equipe_de(plateforme, jeu.present) == equipe_de_present


def test_decision_vider_retire_l_equipe_de_la_fiche(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu, equipe_de_present: int
) -> None:
    reponse = _importer_avec_equipes(
        plateforme, _entetes(connecter), jeu, [{"employeId": jeu.present, "action": "VIDER"}]
    )

    assert reponse.status_code == 200, reponse.text
    assert _equipe_de(plateforme, jeu.present) is None


def _motif_sortie(plateforme: Plateforme, employe: int, periode: int) -> str | None:
    with plateforme.moteur.connect() as c:
        return c.execute(
            text("SELECT motif FROM employe_sortie WHERE employee_id = :e AND periode = :p"),
            {"e": employe, "p": periode},
        ).scalar_one_or_none()


def test_un_depart_deduit_de_l_absence_peut_etre_confirme_sans_motif(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    departs = [{"employeId": jeu.stc, "motif": "STC"}, {"employeId": jeu.absent, "sansMotif": True}]

    reponse = _importer(plateforme, _entetes(connecter), jeu, _classeur(jeu), departs)

    assert reponse.status_code == 200, reponse.text
    assert _motif_sortie(plateforme, jeu.absent, jeu.periode_numerique) == "Absent du fichier"
    assert _statut(plateforme, jeu.absent)[0] == "INACTIF"


def test_un_depart_deduit_de_l_absence_garde_le_motif_saisi_meme_avec_sans_motif(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    departs = [{"employeId": jeu.absent, "motif": "Démission", "sansMotif": True}]

    reponse = _importer(plateforme, _entetes(connecter), jeu, _classeur(jeu), departs)

    assert reponse.status_code == 200, reponse.text
    assert _motif_sortie(plateforme, jeu.absent, jeu.periode_numerique) == "Démission"


def test_un_depart_deduit_de_l_absence_sans_motif_ni_confirmation_est_refuse(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    reponse = _importer(
        plateforme, _entetes(connecter), jeu, _classeur(jeu), [{"employeId": jeu.absent, "motif": "  "}]
    )

    assert reponse.status_code == 400, reponse.text
    assert "sans motif" in reponse.json()["message"]
    assert _bulletins(plateforme, jeu) == 0


def test_un_depart_stc_ou_sortie_du_fichier_exige_toujours_un_motif(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    reponse = _importer(
        plateforme, _entetes(connecter), jeu, _classeur(jeu), [{"employeId": jeu.stc, "sansMotif": True}]
    )

    assert reponse.status_code == 400, reponse.text
    assert "sans motif" not in reponse.json()["message"]
    assert _statut(plateforme, jeu.stc)[0] == "ACTIF"
