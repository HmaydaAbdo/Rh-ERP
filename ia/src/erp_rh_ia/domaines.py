"""Domaines du catalogue MCP : le modèle ne reçoit que les outils des domaines utiles à la question.

Le catalogue complet coûte environ 5 000 tokens par appel ; les paliers gratuits limités en tokens par minute (Groq :
8 000) ne tiennent pas un tour d'outils avec lui. Un outil dont le préfixe n'est rattaché à aucun domaine reste
toujours visible : un nouvel outil n'est jamais masqué par oubli.
"""

from dataclasses import dataclass

from erp_rh_ia.outils import OutilDecrit


@dataclass(frozen=True)
class Domaine:
    nom: str
    description: str
    prefixes: tuple[str, ...]


DOMAINES = (
    Domaine(
        "paie",
        "bulletins de paie, masse salariale, net et brut, effectif payé, répartition par chantier ou équipe, "
        "évolution, entrées et sorties du mois, STC, qualité des données de paie, périodes de paie",
        ("paie_",),
    ),
    Domaine(
        "employes",
        "dossiers des employés : recherche, fiche (CIN, date de naissance, embauche, fonction, salaire), parcours, "
        "comptage, regroupements, employés en poste ou sortis",
        ("employe_", "employes_"),
    ),
    Domaine(
        "referentiels",
        "fiches des chantiers, des équipes et des fonctions (codes, libellés, rattachements)",
        ("chantier_", "equipe_", "fonction_"),
    ),
    Domaine(
        "administration",
        "rôles et permissions, paramètres de l'application, journal d'audit",
        ("audit_", "parametres_", "roles_"),
    ),
)


def domaine_de(outil: str) -> str | None:
    return next((d.nom for d in DOMAINES if outil.startswith(d.prefixes)), None)


def toujours_visible(outil: str) -> bool:
    """Identité et recherches de référentiel : nécessaires pour résoudre un chantier ou une équipe cité par son nom."""
    domaine = domaine_de(outil)
    return domaine is None or (domaine == "referentiels" and outil.endswith("_rechercher"))


def restreindre(catalogue: list[OutilDecrit], domaines: list[str]) -> list[OutilDecrit]:
    retenus = set(domaines)
    return [o for o in catalogue if toujours_visible(o.nom) or domaine_de(o.nom) in retenus]
