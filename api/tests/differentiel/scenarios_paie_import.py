# pyright: basic
"""Import de paie (étape 1) : analyse, import, corrections, erreurs de fichier et de mois, atomicité.

Les fichiers sont fabriqués ici et envoyés à l'identique aux deux backends. Format Spring (`LecteurFichierPaie`) : trois
lignes d'en-tête, puis Nom, Fonction, CIN, Nbre Jrs, J.R.O, J.R.D, Salaire, Prime RO, Prime RD, Total, Observation,
Chantier, Équipe ; le mois est un paramètre du fichier entier.
"""

from io import BytesIO
from typing import Any

from openpyxl import Workbook

from .harnais import Etape

M = "paie-import"
MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def classeur(lignes: list[list[Any]], entetes: int = 3) -> bytes:
    wb = Workbook()
    feuille = wb.active
    assert feuille is not None
    for _ in range(entetes):
        feuille.append([])
    for ligne in lignes:
        feuille.append(ligne)
    sortie = BytesIO()
    wb.save(sortie)
    return sortie.getvalue()


def _fichier(contenu: bytes, nom: str = "paie.xlsx", mime: str = MIME) -> dict[str, tuple[str, bytes, str]]:
    return {"file": (nom, contenu, mime)}


def ligne(nom: str, fonction: str, cin: str | None, jours: Any = 26, salaire: Any = 4500, **plus: Any) -> list[Any]:
    """Une ligne à 13 colonnes ; `plus` surcharge jro, jrd, pro, prd, total, obs, chantier, equipe."""
    v = {"jro": 0, "jrd": 0, "pro": 0, "prd": 0, "total": salaire, "obs": None, "chantier": "CH-A", "equipe": None}
    v.update(plus)
    return [
        nom, fonction, cin, jours, v["jro"], v["jrd"], salaire, v["pro"], v["prd"], v["total"],
        v["obs"], v["chantier"], v["equipe"],
    ]  # fmt: skip


def _post(nom: str, chemin: str, **kw: Any) -> Etape:
    return Etape(M, nom, "POST", chemin, **kw)


def _amorce() -> list[Etape]:
    e: list[Etape] = []
    for cle, lib in (("f_m", "Maçon"), ("f_c", "Chef d'équipe")):
        e.append(_post(f"amorce-fonction-{cle}", "/functions", json={"libelle": lib}, capture={cle: "id"}))
    base = {"nature": "DEPOT", "afficherSurCarte": False}
    for cle, code in (("c_a", "CH-A"), ("c_b", "CH-B"), ("c_x", "CH-X")):
        corps = {**base, "code": code, "designation": f"Chantier {code}"}
        e.append(_post(f"amorce-chantier-{cle}", "/chantiers", json=corps, capture={cle: "id"}))
    e.append(_post("amorce-equipe", "/equipes", json={"code": "EQ-1", "libelle": "Équipe 1"}, capture={"e_1": "id"}))

    def emp(nom: str, cin: str, f: str, c: str, eq: str | None, **plus: Any) -> dict[str, Any]:
        corps = {
            "nomPrenom": nom, "cin": cin, "dateNaissance": "1985-03-02", "dateEmbauche": "2019-04-01",
            "fonctionId": "{" + f + "}", "chantierId": "{" + c + "}", "equipeId": "{" + eq + "}" if eq else None,
        }  # fmt: skip
        return {**corps, **plus}

    employes = [
        ("emp1", emp("Amal Benali", "AB1001", "f_m", "c_a", "e_1", salaire=4500, typeSalaire="MENSUEL")),
        ("emp2", emp("Omar Jour", "CD1002", "f_c", "c_b", None, salaire=250.5, typeSalaire="JOURNALIER")),
        ("emp3", emp("Éléonore Müller", "EF1003", "f_m", "c_a", None, salaire=3800, typeSalaire="MENSUEL")),
        ("emp4", emp("Retour Revenu", "GH1004", "f_m", "c_a", None, salaire=3000, typeSalaire="MENSUEL")),
        ("emp5", emp("Absent Mois Deux", "IJ1005", "f_m", "c_a", None, salaire=3100, typeSalaire="MENSUEL")),
        ("emp6", emp("Stc Mois Deux", "KL1006", "f_c", "c_b", None, salaire=3200, typeSalaire="MENSUEL")),
    ]
    for cle, corps in employes:
        e.append(_post(f"amorce-employe-{cle}", "/employees", json=corps, capture={cle: "id"}))
    inactif = {**emp("Retour Revenu", "GH1004", "f_m", "c_a", None, salaire=3000, typeSalaire="MENSUEL")}
    inactif.update({"version": 0, "statut": "INACTIF", "chantierId": None})
    e.append(Etape(M, "amorce-employe-emp4-inactif", "PUT", "/employees/{emp4}", json=inactif))
    e.append(Etape(M, "amorce-chantier-clos", "PUT", "/chantiers/{c_x}/statut", json={"version": 0, "actif": False}))
    return e


def _fichier_mois_1() -> bytes:
    return classeur(
        [
            ligne("Amal Benali", "Maçon", "AB1001", 26, 4500, equipe="EQ-1"),
            ligne("Omar Jour", "Chef d'équipe", "CD1002", 24, 250.5, chantier="CH-B", total=6012),
            ligne("Éléonore Müller", "Maçon", "EF1003", 26, 3800),
            ligne("Absent Mois Deux", "Maçon", "IJ1005", 20, 3100),
            ligne("Stc Mois Deux", "Chef d'équipe", "KL1006", 26, 3200, chantier="CH-B"),
        ]
    )


def _analyses() -> list[Etape]:
    f1 = _fichier_mois_1()
    a = "/paie/import/analyse"
    mauvais = classeur(
        [
            ligne("Inconnu Total", "Maçon", "ZZ9999"),
            ligne("", "Maçon", "AB1001"),
            ligne("Sans Cin", "Maçon", None),
            ligne("Jours Texte", "Maçon", "CD1002", "abc"),
            ligne("Jours Mille", "Maçon", "EF1003", 1000),
            ligne("Jours Négatif", "Maçon", "IJ1005", -1),
            ligne("Jours Décimal", "Maçon", "KL1006", 26.5),
            ligne("Salaire Texte Virgule", "Maçon", "AB1001", 26, "4 500,50"),
            ligne("Salaire Texte Point", "Maçon", "CD1002", 26, "4500.5"),
            ligne("Salaire Trois Décimales", "Maçon", "EF1003", 26, 123.456),
            ligne("Fonction Inconnue", "Inexistante", "IJ1005"),
            ligne("Chantier Inconnu", "Maçon", "KL1006", chantier="NOPE"),
            ligne("Equipe Inconnue", "Maçon", "AB1001", equipe="NOPE"),
            ligne("Chantier Clos", "Maçon", "CD1002", chantier="CH-X"),
            ligne("Doublon", "Maçon", "EF1003"),
            ligne("Doublon", "Maçon", "ef1003"),
            ligne(" Amal  Benali ", " maçon ", " ab1001 ", chantier=" ch-a "),
            ligne("Salaire Zéro", "Maçon", "IJ1005", 26, 0),
            ligne("Retour Revenu", "Maçon", "GH1004"),
            ligne("Sortie Fichier", "Maçon", "KL1006", obs="Sortie"),
            ligne("Stc Fichier", "Maçon", "CD1002", obs="STC"),
        ]
    )
    avec_vides = classeur(
        [
            ligne("Amal Benali", "Maçon", "AB1001"),
            [],
            [None] * 13,
            [" "] * 13,
            ligne("Omar Jour", "Chef d'équipe", "CD1002"),
        ]
    )
    cinq_colonnes = classeur([["Amal Benali", "Maçon", "AB1001", 26, 0]])
    quinze_colonnes = classeur([[*ligne("Amal Benali", "Maçon", "AB1001"), "extra", "extra2"]])
    sans_entete = classeur([ligne("Amal Benali", "Maçon", "AB1001")], entetes=0)
    p = {"periode": "2026-01"}
    return [
        _post("analyse-valide", a, fichiers=_fichier(f1), donnees=p),
        _post("analyse-mauvaises-lignes", a, fichiers=_fichier(mauvais), donnees=p, trier_listes=True),
        _post("analyse-lignes-vides", a, fichiers=_fichier(avec_vides), donnees=p),
        _post("analyse-cinq-colonnes", a, fichiers=_fichier(cinq_colonnes), donnees=p),
        _post("analyse-quinze-colonnes", a, fichiers=_fichier(quinze_colonnes), donnees=p),
        _post("analyse-sans-entete", a, fichiers=_fichier(sans_entete), donnees=p),
        _post("analyse-fichier-vide", a, fichiers=_fichier(classeur([])), donnees=p),
        _post("analyse-octets-illisibles", a, fichiers=_fichier(b"pas un classeur"), donnees=p),
        _post("analyse-zero-octet", a, fichiers=_fichier(b""), donnees=p),
        _post("analyse-nom-xls", a, fichiers=_fichier(f1, "paie.xls", "application/vnd.ms-excel"), donnees=p),
        _post("analyse-type-mime-texte", a, fichiers=_fichier(f1, "paie.txt", "text/plain"), donnees=p),
        _post("analyse-periode-invalide-13", a, fichiers=_fichier(f1), donnees={"periode": "2026-13"}),
        _post("analyse-periode-un-chiffre", a, fichiers=_fichier(f1), donnees={"periode": "2026-1"}),
        _post("analyse-periode-texte", a, fichiers=_fichier(f1), donnees={"periode": "abc"}),
        _post("analyse-periode-vide", a, fichiers=_fichier(f1), donnees={"periode": ""}),
        _post("analyse-periode-absente", a, fichiers=_fichier(f1)),
        _post("analyse-periode-en-query", a, fichiers=_fichier(f1), params={"periode": "2026-01"}),
        _post("analyse-periode-an-9999", a, fichiers=_fichier(f1), donnees={"periode": "9999-12"}),
        _post("analyse-periode-annee-passee", a, fichiers=_fichier(f1), donnees={"periode": "1999-01"}),
        _post("analyse-sans-fichier", a, donnees=p),
        Etape(M, "analyse-sans-authentification", "POST", a, fichiers=_fichier(f1), donnees=p, jeton=False),
    ]


def _imports() -> list[Etape]:
    f1 = _fichier_mois_1()
    i = "/paie/import"
    p1 = {"periode": "2026-01"}
    mois2 = classeur(
        [
            ligne("Amal Benali", "Maçon", "AB1001", 26, 4500, equipe="EQ-1"),
            ligne("Omar Jour", "Chef d'équipe", "CD1002", 25, 250.5, chantier="CH-B", total=6262.5),
            ligne("Éléonore Müller", "Maçon", "EF1003", 26, 3800),
            ligne("Retour Revenu", "Maçon", "GH1004", 26, 3000),
            ligne("Stc Mois Deux", "Chef d'équipe", "KL1006", 10, 3200, chantier="CH-B", obs="STC"),
        ]
    )
    p2 = {"periode": "2026-02"}
    a = "/paie/import/analyse"
    return [
        _post(
            "import-fichier-avec-erreurs", i, fichiers=_fichier(classeur([ligne("X", "Maçon", "ZZ9999")])), donnees=p1
        ),
        Etape(M, "import-sans-droit-authentification", "POST", i, fichiers=_fichier(f1), donnees=p1, jeton=False),
        _post("import-mois-1", i, fichiers=_fichier(f1), donnees=p1),
        _post("import-mois-1-doublon", i, fichiers=_fichier(f1), donnees=p1),
        _post("import-mois-saute-2026-03", i, fichiers=_fichier(f1), donnees={"periode": "2026-03"}),
        _post("import-mois-avant-dernier", i, fichiers=_fichier(f1), donnees={"periode": "2025-12"}),
        _post("analyse-mois-2", a, fichiers=_fichier(mois2), donnees=p2),
        _post(
            "import-mois-2-depart-non-propose",
            i,
            fichiers=_fichier(mois2),
            donnees=p2,
            parties_json={"departs": {"departs": [{"employeId": "{emp1}", "motif": "Abandon"}]}},
        ),
        _post(
            "import-mois-2-motif-vide",
            i,
            fichiers=_fichier(mois2),
            donnees=p2,
            parties_json={"departs": {"departs": [{"employeId": "{emp5}", "motif": "  "}]}},
        ),
        _post(
            "import-mois-2-employe-id-absent",
            i,
            fichiers=_fichier(mois2),
            donnees=p2,
            parties_json={"departs": {"departs": [{"motif": "x"}]}},
        ),
        _post(
            "import-mois-2",
            i,
            fichiers=_fichier(mois2),
            donnees=p2,
            parties_json={
                "departs": {
                    "departs": [
                        {"employeId": "{emp5}", "motif": "Abandon de poste"},
                        {"employeId": "{emp6}", "motif": "STC"},
                    ]
                }
            },
        ),
        _post("analyse-mois-3-apres-depart", a, fichiers=_fichier(f1), donnees={"periode": "2026-03"}),
    ]


def _corrections() -> list[Etape]:
    c = "/paie/import/corrections"
    fichier = classeur(
        [
            ligne("Amal Benali", "Maçon", "AB1001", 26, 4800, equipe="EQ-1"),
            ligne("Nouvel Employé", "Maçon", "NN2001", 26, 4100),
            ligne("Omar Jour", "Chef d'équipe", "CD1002", 25, 250.5, chantier="CH-B"),
        ]
    )
    p = {"periode": "2026-03"}
    return [
        _post("corrections-vides", c, fichiers=_fichier(fichier), donnees=p, parties_json={"corrections": {}}),
        _post("corrections-sans-partie", c, fichiers=_fichier(fichier), donnees=p),
        _post(
            "corrections-aligner-et-creer",
            c,
            fichiers=_fichier(fichier),
            donnees=p,
            parties_json={
                "corrections": {
                    "aligner": [{"employeId": "{emp1}", "typeSalaire": "MENSUEL"}],
                    "creer": [
                        {
                            "numeroLigne": 5,
                            "dateNaissance": "1992-01-01",
                            "dateEmbauche": "2026-01-01",
                            "typeSalaire": "MENSUEL",
                        }
                    ],
                }
            },
        ),
        _post(
            "corrections-ligne-qui-n-est-pas-inconnue",
            c,
            fichiers=_fichier(fichier),
            donnees=p,
            parties_json={
                "corrections": {
                    "creer": [
                        {
                            "numeroLigne": 4,
                            "dateNaissance": "1992-01-01",
                            "dateEmbauche": "2026-01-01",
                            "typeSalaire": "MENSUEL",
                        }
                    ]
                }
            },
        ),
        _post(
            "corrections-employe-inconnu",
            c,
            fichiers=_fichier(fichier),
            donnees=p,
            parties_json={"corrections": {"aligner": [{"employeId": 999999}]}},
        ),
    ]


REFONTE = "Assistant d'import refondu (avertissements, EQUIPE_VIDE, erreurs par champ) : site/docs/migration/paie.md"
DECIDES = {
    "analyse-sans-fichier": "Décidé : fichier absent = 400 (Spring 500, défaut de Spring).",
    "corrections-sans-partie": "Décidé : partie absente = 400 (Spring 500, défaut de Spring).",
    "analyse-valide": REFONTE,
    "analyse-mois-2": REFONTE,
    "analyse-lignes-vides": REFONTE,
    "analyse-cinq-colonnes": REFONTE,
    "analyse-quinze-colonnes": REFONTE,
    "import-fichier-avec-erreurs": REFONTE,
    "corrections-ligne-qui-n-est-pas-inconnue": REFONTE,
    "analyse-sans-entete": REFONTE,
    "analyse-mois-3-apres-depart": REFONTE,
    "corrections-vides": REFONTE,
    "corrections-aligner-et-creer": REFONTE,
    "analyse-fichier-vide": REFONTE,
    "analyse-periode-en-query": REFONTE,
    "analyse-nom-xls": REFONTE,
    "analyse-type-mime-texte": REFONTE,
    "analyse-periode-annee-passee": REFONTE,
    "analyse-octets-illisibles": "Même message, détail du lecteur Excel propre à la bibliothèque (POI / openpyxl)",
    "analyse-zero-octet": "Même message, détail du lecteur Excel propre à la bibliothèque (POI / openpyxl)",
    "analyse-mauvaises-lignes": "Spring rejette tout le fichier si une cellule numérique contient du texte ; "
    "Python signale ligne par ligne (décision du propriétaire).",
    "analyse-periode-an-9999": "Spring accepte toute année ; Python borne à 1900-2999 (décision du propriétaire).",
    "corrections-employe-inconnu": "Spring ignore une correction visant une fiche non proposée (200) ; Python 400 "
    "(décision du propriétaire).",
    "analyse-periode-vide": "FastAPI traite un champ de formulaire vide comme absent (400 dans les deux cas)",
}


def etapes() -> list[Etape]:
    toutes = _amorce() + _analyses() + _imports() + _corrections()
    for e in toutes:
        e.decide = DECIDES.get(e.nom)
    return toutes
