"""Assistant d'import des heures supplémentaires sur PostgreSQL réel (parité `HeuresSuppImportService`)."""

# ruff: noqa: F811  (les fixtures `jeu` et `entetes` importées de test_heuresupp sont reprises par nom)

import json
from collections.abc import Sequence
from io import BytesIO
from typing import Any

from conftest import Plateforme
from openpyxl import Workbook
from sqlalchemy import text
from test_heuresupp import MOIS, Jeu, entetes, jeu  # noqa: F401  # pyright: ignore[reportUnusedImport]

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
BLOQUE = "L'import est bloqué : "


def _cins(p: Plateforme, jeu: Jeu) -> list[str]:
    with p.moteur.connect() as c:
        lignes = dict(c.execute(text("SELECT id, cin FROM employe WHERE id = ANY(:i)"), {"i": jeu.employes}).all())
    return [lignes[i] for i in jeu.employes]


def _classeur(lignes: Sequence[Sequence[Any]], entete: Sequence[str] | None = ("Nom et prénom", "CIN", "HS")) -> bytes:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    if entete is not None:
        feuille.append(list(entete))
    for ligne in lignes:
        feuille.append(list(ligne))
    sortie = BytesIO()
    classeur.save(sortie)
    return sortie.getvalue()


def _appel(
    p: Plateforme,
    entetes: dict[str, str],
    chemin: str,
    contenu: bytes,
    jeu: Jeu,
    *,
    nom: str = "heures.xlsx",
    mois: str = MOIS,
    chantier: int | None = None,
    **parties: Any,
) -> Any:
    donnees = {cle: json.dumps(valeur) for cle, valeur in parties.items()}
    return p.client.post(
        f"/heures-supp/import{chemin}",
        headers=entetes,
        params={"periode": mois, "chantierId": jeu.chantier if chantier is None else chantier},
        files={"file": (nom, contenu, XLSX)},
        data=donnees,
    )


def _fichier_standard(p: Plateforme, jeu: Jeu) -> bytes:
    cins = _cins(p, jeu)
    return _classeur([["Heures 0", cins[0], 2], ["Heures 1", cins[1], 1.5], ["Heures 2", cins[2], 3]])


def _lignes_en_base(p: Plateforme, jeu: Jeu) -> int:
    with p.moteur.connect() as c:
        return c.execute(
            text("SELECT count(*) FROM heures_supp WHERE employee_id = ANY(:e)"), {"e": jeu.employes}
        ).scalar_one()


def _journal(p: Plateforme, action: str, resultat: str = "SUCCES") -> Any:
    with p.moteur.connect() as c:
        return (
            c.execute(
                text(
                    "SELECT type_operation, entite_type, perimetre, nombre_elements FROM audit_journal "
                    "WHERE action = :a AND resultat = :r ORDER BY id DESC LIMIT 1"
                ),
                {"a": action, "r": resultat},
            )
            .mappings()
            .one()
        )


def test_prerequis_du_mois_et_du_chantier(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    def prerequis(mois: str, chantier: int) -> Any:
        return plateforme.client.get(
            "/heures-supp/import/prerequis", headers=entetes, params={"periode": mois, "chantierId": chantier}
        )

    pret = prerequis(MOIS, jeu.chantier)
    sans_paie = prerequis("2098-08", jeu.chantier)
    sans_chantier = prerequis(MOIS, 999999999)
    invalide = prerequis("juillet", jeu.chantier)

    assert (pret.status_code, pret.json()["pret"], pret.json()["bulletinsDisponibles"]) == (200, True, 3)
    assert pret.json()["periode"] == MOIS
    assert (sans_paie.json()["pret"], sans_paie.json()["bulletinsDisponibles"]) == (False, 0)
    assert sans_paie.json()["message"] == (
        "Aucune paie n'est disponible pour ce mois. Importez d'abord la paie de ce mois, puis recommencez."
    )
    assert (
        sans_chantier.json()["message"] == "Le chantier sélectionné n'existe plus. Actualisez la liste des chantiers."
    )
    assert invalide.status_code == 400
    assert invalide.json()["message"] == "Période invalide, format attendu aaaa-MM (ex. 2026-10) : juillet"


def test_l_analyse_calcule_sans_ecrire(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    reponse = _appel(plateforme, entetes, "/analyse", _fichier_standard(plateforme, jeu), jeu)

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert (corps["pret"], corps["erreurs"], corps["totalLignes"], corps["lignesZero"]) == (True, [], 3, 0)
    assert corps["periode"] == MOIS
    lignes = corps["lignes"]
    assert [(ligne["numeroLigne"], ligne["salaireHoraireDh"], ligne["montantDh"]) for ligne in lignes] == [
        (2, 10.0, 20.0),
        (3, 10.0, 15.0),
        (4, 38.0, 114.0),
    ]
    assert (lignes[2]["stcOuSortie"], lignes[2]["stcDh"], lignes[2]["netAPayerDh"]) == (True, 114.0, 0.0)
    assert (lignes[0]["nomPrenom"], lignes[0]["fonction"], lignes[0]["nomFichier"]) == (
        "Heures 0",
        lignes[0]["fonction"],
        "Heures 0",
    )
    assert (lignes[0]["identiteEcart"], lignes[0]["forfaitSeul"], lignes[0]["fonctionFichier"]) == (False, False, None)
    assert _lignes_en_base(plateforme, jeu) == 0


def test_l_analyse_signale_les_ecarts_les_inconnus_et_les_forfaits(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    cins = _cins(plateforme, jeu)
    contenu = _classeur([["Autre nom", cins[0], 1], ["Inconnu", "ZZ0000", 1], ["Heures 2", cins[2], 0]])
    forfaits = {"forfaits": [{"cin": cins[2], "montantDh": 50}, {"cin": cins[1].lower(), "montantDh": 70}]}

    corps = _appel(plateforme, entetes, "/analyse", contenu, jeu, forfaits=forfaits).json()

    assert (corps["pret"], corps["lignesZero"], corps["totalLignes"]) == (False, 1, 3)
    assert corps["erreurs"] == [
        f"CIN {cins[0]} : le nom du fichier diffère de la fiche ; confirmez l'alignement dans l'étape de correction.",
        "CIN ZZ0000 : aucune fiche employé ne correspond à ce CIN ; créez la fiche avant de relancer l'analyse.",
        f"CIN {cins[2]} : le forfait est interdit car la paie du même mois est marquée STC/sortie.",
    ]
    par_cin = {ligne["cin"]: ligne for ligne in corps["lignes"]}
    assert par_cin[cins[0]]["identiteEcart"] is True
    assert par_cin["ZZ0000"]["employeId"] is None
    seul = par_cin[cins[1].upper()]
    assert (seul["forfaitSeul"], seul["numeroLigne"], seul["forfaitDh"], seul["netAPayerDh"]) == (True, 0, 70.0, 70.0)
    assert (seul["montantDh"], seul["heuresSupplementaires"], seul["salaireHoraireDh"]) == (0.0, None, None)


def test_import_ecrit_atomiquement_audite_puis_se_bloque_sans_remplacement(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    cins = _cins(plateforme, jeu)
    contenu = _fichier_standard(plateforme, jeu)

    importe = _appel(plateforme, entetes, "", contenu, jeu, forfaits={"forfaits": [{"cin": cins[0], "montantDh": 30}]})
    doublon = _appel(plateforme, entetes, "", contenu, jeu)
    remplace = _appel(plateforme, entetes, "/remplacement", contenu, jeu)

    assert importe.status_code == 200, importe.text
    assert importe.json() == {
        "periode": MOIS,
        "chantierId": jeu.chantier,
        "lignesHeures": 3,
        "lignesZero": 0,
        "forfaitsSeuls": 0,
        "remplacements": 0,
        "heuresTotales": 6.5,
        "montantTotalDh": 149.0,
        "stcTotalDh": 114.0,
        "forfaitTotalDh": 30.0,
        "netTotalDh": 65.0,
    }
    assert _lignes_en_base(plateforme, jeu) == 3
    journal = _journal(plateforme, "HEURES_SUP_IMPORT")
    assert (journal["type_operation"], journal["entite_type"], journal["nombre_elements"]) == ("CREATE", "HeureSupp", 3)
    assert journal["perimetre"]["periode"] == MOIS
    assert (journal["perimetre"]["forfaits"], journal["perimetre"]["forfaitsSeuls"]) == (1, 0)
    assert len(journal["perimetre"]["fichierSha256"]) == 64
    assert doublon.status_code == 400
    assert doublon.json()["message"].startswith(BLOQUE)
    assert "une ligne existe déjà pour ce mois et ce chantier" in doublon.json()["message"]
    assert (remplace.status_code, remplace.json()["remplacements"]) == (200, 3)
    assert _lignes_en_base(plateforme, jeu) == 3
    assert _journal(plateforme, "HEURES_SUP_REMPLACEMENT")["type_operation"] == "UPDATE"


def test_un_forfait_seul_est_importe_et_une_analyse_bloquee_n_ecrit_rien(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    cins = _cins(plateforme, jeu)
    bloque = _appel(plateforme, entetes, "", _classeur([["Inconnu", "ZZ0000", 1]]), jeu)
    seul = _appel(
        plateforme,
        entetes,
        "",
        _classeur([["Heures 1", cins[1], 0]]),
        jeu,
        forfaits={"forfaits": [{"cin": cins[0], "montantDh": 400}]},
    )

    assert bloque.status_code == 400
    assert bloque.json()["message"] == (
        BLOQUE + "CIN ZZ0000 : aucune fiche employé ne correspond à ce CIN ; créez la fiche avant de relancer "
        "l'analyse. Corrigez les lignes puis relancez l'analyse."
    )
    assert seul.status_code == 200, seul.text
    assert (seul.json()["lignesHeures"], seul.json()["lignesZero"], seul.json()["forfaitsSeuls"]) == (1, 1, 1)
    assert (seul.json()["forfaitTotalDh"], seul.json()["netTotalDh"]) == (400.0, 400.0)
    assert _lignes_en_base(plateforme, jeu) == 2
    liste = plateforme.client.post("/heures-supp/search", headers=entetes, json={"periode": MOIS}).json()["content"]
    assert sorted(ligne["montantDh"] for ligne in liste) == [0.0, 0.0]


def test_les_fichiers_invalides_sont_refuses_avec_les_messages_de_spring(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    cin = _cins(plateforme, jeu)[0]
    cas: list[tuple[bytes, str, str]] = [
        (b"", "heures.xlsx", "Sélectionnez un fichier Excel contenant les CIN et les heures supplémentaires."),
        (b"x", "heures.csv", "Le fichier doit être au format Excel .xlsx."),
        (
            _classeur([["A", cin, 1]], entete=("Nom", "Matricule", "HS")),
            "heures.xlsx",
            "En-têtes introuvables : le fichier doit contenir Nom et prénom, CIN et HS.",
        ),
        (
            _classeur([["A", cin, 1, "x"]], entete=("Nom et prénom", "CIN", "HS", "Extra")),
            "heures.xlsx",
            "Le fichier doit contenir uniquement les trois colonnes Nom et prénom, CIN et HS.",
        ),
        (_classeur([]), "heures.xlsx", "Le fichier ne contient aucune ligne d'heures supplémentaires."),
        (_classeur([["A", cin, None]]), "heures.xlsx", "Ligne 2 : HS manquant."),
        (_classeur([["", cin, 1]]), "heures.xlsx", "Ligne 2 : Nom et prénom, CIN et HS sont requis."),
        (_classeur([["A", cin, "abc"]]), "heures.xlsx", "valeur P/H invalide en C2."),
        (
            _classeur([["A", cin, 1], ["B", cin.lower(), 2]]),
            "heures.xlsx",
            f"Ligne 3 : CIN dupliqué dans le fichier ({cin.lower()}). "
            "Corrigez ou regroupez les heures sur une seule ligne.",
        ),
        (
            _classeur([["A", cin, -1]]),
            "heures.xlsx",
            "Ligne 2 : HS doit être positif ou nul et comporter au plus une décimale.",
        ),
        (
            _classeur([["A", cin, 1.25]]),
            "heures.xlsx",
            "Ligne 2 : HS doit être positif ou nul et comporter au plus une décimale.",
        ),
    ]
    for contenu, nom, message in cas:
        reponse = _appel(plateforme, entetes, "/analyse", contenu, jeu, nom=nom)
        assert reponse.status_code == 400, (message, reponse.text)
        assert reponse.json()["message"] == message
    inconnu_en_texte = _appel(plateforme, entetes, "/analyse", _classeur([["Heures 0", cin, "1,5 "]]), jeu)
    assert inconnu_en_texte.status_code == 200, inconnu_en_texte.text
    assert inconnu_en_texte.json()["lignes"][0]["heuresSupplementaires"] == 1.5


def test_une_entete_variante_et_des_lignes_vides_sont_acceptees(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    cins = _cins(plateforme, jeu)
    contenu = _classeur(
        [["Heures 0", cins[0], 1], [None, None, None], ["Heures 1", cins[1], 2]],
        entete=("Nom prénom", "CIN", "Nbre heures supp"),
    )

    corps = _appel(plateforme, entetes, "/analyse", contenu, jeu).json()

    assert (corps["totalLignes"], [ligne["numeroLigne"] for ligne in corps["lignes"]]) == (2, [2, 4])


def test_deux_forfaits_pour_un_meme_cin_sont_refuses(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    cin = _cins(plateforme, jeu)[0]
    forfaits = {"forfaits": [{"cin": cin, "montantDh": 1}, {"cin": cin.lower(), "montantDh": 2}]}

    reponse = _appel(plateforme, entetes, "/analyse", _fichier_standard(plateforme, jeu), jeu, forfaits=forfaits)

    assert reponse.status_code == 400
    assert reponse.json()["message"] == f"Un seul forfait par CIN peut être saisi dans ce lot : {cin.lower()}"
    refuse = _appel(
        plateforme,
        entetes,
        "/analyse",
        _fichier_standard(plateforme, jeu),
        jeu,
        forfaits={"forfaits": [{"cin": cin, "montantDh": 1.5}]},
    )
    assert refuse.status_code == 200  # forfait 1,5 : arrondi automatiquement à 2 (règle commune des montants)


def test_les_corrections_alignent_un_nom_et_creent_une_fiche_manquante(
    plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu
) -> None:
    cins = _cins(plateforme, jeu)
    contenu = _classeur([["Nouveau nom", cins[0], 1], ["Personne Nouvelle", "ZZ9999", 2]])
    employe = jeu.employes[0]
    creation = {
        "numeroLigne": 3,
        "dateNaissance": "1995-05-05",
        "dateEmbauche": "2024-01-01",
        "fonctionId": jeu.fonction,
        "salaire": 3000,
        "typeSalaire": "MENSUEL",
    }
    try:
        inutile = _appel(
            plateforme, entetes, "/corrections", contenu, jeu, corrections={"aligner": [{"employeId": 999}]}
        )
        mauvaise_ligne = _appel(
            plateforme, entetes, "/corrections", contenu, jeu, corrections={"creer": [creation | {"numeroLigne": 2}]}
        )
        reponse = _appel(
            plateforme,
            entetes,
            "/corrections",
            contenu,
            jeu,
            corrections={"aligner": [{"employeId": employe}], "creer": [creation]},
        )

        assert inutile.json()["message"] == "L'employé 999 n'a pas d'écart à aligner dans le fichier."
        assert mauvaise_ligne.json()["message"] == (
            "La ligne 2 n'est pas un CIN inconnu du fichier. Réanalysez le classeur avant de corriger."
        )
        assert reponse.status_code == 200, reponse.text
        corps = reponse.json()
        assert corps["erreurs"] == [
            "CIN ZZ9999 : aucun bulletin de paie n'existe pour cet employé pendant le mois choisi."
        ]
        assert corps["lignes"][0]["identiteEcart"] is False
        with plateforme.moteur.connect() as c:
            nom = c.execute(text("SELECT nom_prenom FROM employe WHERE id = :i"), {"i": employe}).scalar_one()
            cree = c.execute(text("SELECT chantier_id, salaire, type_salaire FROM employe WHERE cin = 'ZZ9999'")).one()
        assert nom == "Nouveau nom"
        assert (cree[0], float(cree[1]), cree[2]) == (jeu.chantier, 3000.0, "MENSUEL")
        journal = _journal(plateforme, "HEURES_SUP_IMPORT_CORRECTION")
        assert (journal["type_operation"], journal["entite_type"], journal["nombre_elements"]) == (
            "CREATE",
            "Employee",
            1,
        )
        assert journal["perimetre"]["employesCrees"] == 1
    finally:
        with plateforme.moteur.begin() as c:
            c.execute(text("DELETE FROM employe WHERE cin = 'ZZ9999'"))


def test_le_modele_est_un_classeur_a_trois_colonnes(plateforme: Plateforme, entetes: dict[str, str]) -> None:
    reponse = plateforme.client.get("/heures-supp/import/modele", headers=entetes)

    assert reponse.status_code == 200
    assert reponse.headers["content-type"] == XLSX
    assert "Modele_Heures_Supplementaires.xlsx" in reponse.headers["content-disposition"]
    from openpyxl import load_workbook

    feuille = load_workbook(BytesIO(reponse.content)).worksheets[0]
    assert [cellule.value for cellule in feuille[1]] == ["Nom et prénom", "CIN", "HS"]
