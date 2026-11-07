"""Sorties de la paie : export Excel multi-feuilles comparé cellule par cellule, avec ses cas d'erreur."""

from typing import Any

from .harnais import Etape
from .scenarios_paie_import import _amorce, _fichier, _post, classeur, ligne

M = "paie-sorties"
EXPORT = "/paie/export"


def _amorce_c168() -> list[Etape]:
    """Le chantier C168 porte le parc matériel (équipes CH = camions, OP = engins) : cas métier de l'export."""
    e = [
        _post(
            "amorce-chantier-c168",
            "/chantiers",
            json={"code": "C168", "designation": "Chantier C168", "nature": "DEPOT", "afficherSurCarte": False},
            capture={"c_168": "id"},
        ),
        # CH et OP existent déjà dans le schéma (données de base Flyway V1-V44) : on lit leurs ids
        _post(
            "amorce-equipes-ch-op",
            "/equipes/search",
            json={},
            params={"sort": "id,asc", "size": "2"},
            capture={"e_ch": "content.0.id", "e_op": "content.1.id"},
        ),
    ]
    for cle, nom, cin, equipe in (("emp7", "Chauffeur Un", "MN1007", "e_ch"), ("emp8", "Pelle Deux", "OP1008", "e_op")):
        corps: dict[str, Any] = {
            "nomPrenom": nom, "cin": cin, "dateNaissance": "1987-05-06", "dateEmbauche": "2020-02-03",
            "fonctionId": "{f_m}", "chantierId": "{c_168}", "equipeId": "{" + equipe + "}",
            "salaire": 3500, "typeSalaire": "MENSUEL",
        }  # fmt: skip
        e.append(_post(f"amorce-employe-{cle}", "/employees", json=corps, capture={cle: "id"}))
    return e


def _import_mois(periode: str, lignes: list[list[Any]], departs: list[dict[str, Any]] | None = None) -> Etape:
    kw: dict[str, Any] = {"fichiers": _fichier(classeur(lignes)), "donnees": {"periode": periode}}
    if departs:
        kw["parties_json"] = {"departs": {"departs": departs}}
    return _post(f"amorce-import-{periode}", "/paie/import", **kw)


def _donnees() -> list[Etape]:
    base = [
        ligne("Amal Benali", "Maçon", "AB1001", 26, 4500, equipe="EQ-1"),
        ligne("Omar Jour", "Chef d'équipe", "CD1002", 24, 250.5, chantier="CH-B", total=6012),
        ligne("Éléonore Müller", "Maçon", "EF1003", 26, 3800),
        ligne("Absent Mois Deux", "Maçon", "IJ1005", 20, 3100),
        ligne("Stc Mois Deux", "Chef d'équipe", "KL1006", 26, 3200, chantier="CH-B"),
        ligne("Chauffeur Un", "Maçon", "MN1007", 22, 3500, chantier="C168", equipe="CH"),
        ligne("Pelle Deux", "Maçon", "OP1008", 21, 3500, chantier="C168", equipe="OP"),
    ]
    mois2 = [
        ligne("Amal Benali", "Maçon", "AB1001", 26, 4500, equipe="EQ-1", pro=150, jro=1),
        ligne("Omar Jour", "Chef d'équipe", "CD1002", 25, 250.5, chantier="CH-B", total=6262.5),
        ligne("Éléonore Müller", "Maçon", "EF1003", 26, 3800),
        ligne("Retour Revenu", "Maçon", "GH1004", 26, 3000),
        ligne("Stc Mois Deux", "Chef d'équipe", "KL1006", 10, 3200, chantier="CH-B", obs="STC"),
        ligne("Chauffeur Un", "Maçon", "MN1007", 22, 3500, chantier="C168", equipe="CH"),
        ligne("Pelle Deux", "Maçon", "OP1008", 21, 3500, chantier="C168", equipe="OP"),
    ]
    return [
        *_amorce(),
        *_amorce_c168(),
        _import_mois("2026-01", base),
        _import_mois("2026-02", mois2, [{"employeId": "{emp5}", "motif": "Abandon de poste"}]),
    ]


def _exports() -> list[Etape]:
    def exp(nom: str, corps: dict[str, Any], **kw: Any) -> Etape:
        return _post(nom, EXPORT, json=corps, **kw)

    p = "2026-01"
    return [
        exp("export-global-sans-equipe", {"periode": p, "feuillesEquipeMode": "AUCUNE"}),
        exp("export-mode-absent", {"periode": p}),
        exp("export-toutes-les-equipes", {"periode": p, "feuillesEquipeMode": "TOUTES"}),
        exp(
            "export-equipes-personnalisees",
            {"periode": p, "feuillesEquipeMode": "PERSONNALISE", "equipesParChantier": {"CH-A": ["Équipe 1"]}},
        ),
        exp(
            "export-equipes-personnalisees-par-code",
            {"periode": p, "feuillesEquipeMode": "PERSONNALISE", "equipesParChantier": {"CH-A": ["EQ-1"]}},
        ),
        exp("export-personnalise-sans-selection", {"periode": p, "feuillesEquipeMode": "PERSONNALISE"}),
        exp(
            "export-equipes-excluees-feuille-chantier",
            {"periode": p, "feuillesEquipeMode": "TOUTES", "equipesExcluesFeuilleChantier": {"CH-A": ["EQ-1"]}},
        ),
        exp("export-chantiers-restreints", {"periode": p, "chantiers": ["CH-B"]}),
        exp("export-chantier-inconnu", {"periode": p, "chantiers": ["NOPE"]}),
        exp("export-chantiers-vides", {"periode": p, "chantiers": []}),
        exp(
            "export-materiel",
            {
                "periode": p,
                "feuillesEquipeMode": "TOUTES",
                "chantiers": ["C168"],
                "materiel": {"CAMION CITERNE": 3, "PICK UP": 2, "PELLE PNEU": 4, "BULL": 1},
            },
        ),
        exp("export-materiel-hors-borne", {"periode": p, "materiel": {"PICK UP": 1000}}),
        exp("export-materiel-negatif", {"periode": p, "materiel": {"PICK UP": -1}}),
        exp("export-mois-2-avec-depart", {"periode": "2026-02", "feuillesEquipeMode": "TOUTES"}),
        exp("export-mois-sans-paie", {"periode": "2026-05"}),
        exp("export-periode-absente", {"feuillesEquipeMode": "AUCUNE"}),
        exp("export-periode-invalide", {"periode": "2026-13"}),
        exp("export-periode-texte", {"periode": "abc"}),
        exp("export-mode-inconnu", {"periode": p, "feuillesEquipeMode": "TOUT"}),
        exp("export-corps-vide", {}),
        _post("export-sans-corps", EXPORT),
        exp("export-sans-authentification", {"periode": p}, jeton=False),
    ]


def etapes() -> list[Etape]:
    toutes = _donnees() + _exports()
    for e in toutes:
        e.module = M
    return toutes
