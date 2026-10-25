"""Domaines du catalogue MCP : le modèle ne reçoit que les outils des domaines utiles à la question.

Le catalogue complet coûte environ 5 000 tokens par appel ; les paliers gratuits limités en tokens par minute (Groq :
8 000) ne tiennent pas un tour d'outils avec lui. Tout outil appartient à un domaine, aucun n'est transmis d'office :
un outil dont le préfixe n'est pas déclaré forme son propre domaine, décrit par ses outils, et suit le même ciblage.
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
        "chantiers, équipes et fonctions (codes, libellés, statut, rattachements) ; à ajouter dès que la question "
        "cite un chantier, une équipe ou une fonction par son nom ou son code",
        ("chantier_", "equipe_", "fonction_"),
    ),
    Domaine(
        "administration",
        "rôles et permissions, paramètres de l'application, journal d'audit",
        ("audit_", "parametres_", "roles_"),
    ),
    Domaine(
        "systeme",
        "l'utilisateur connecté : son identité, ses rôles et ses droits dans l'assistant",
        ("systeme_",),
    ),
)

_TAILLE_DESCRIPTION = 300


def domaine_de(outil: str) -> str:
    """Domaine déclaré, ou à défaut le préfixe de l'outil (``achats_commandes`` → ``achats``)."""
    return next((d.nom for d in DOMAINES if outil.startswith(d.prefixes)), outil.split("_", 1)[0])


def domaines_du_catalogue(catalogue: list[OutilDecrit]) -> list[Domaine]:
    """Les domaines présents dans le catalogue, déclarés d'abord, puis ceux déduits des préfixes inconnus."""
    presents = {domaine_de(o.nom) for o in catalogue}
    declares = [d for d in DOMAINES if d.nom in presents]
    connus = {d.nom for d in declares}
    deduits: dict[str, list[str]] = {}
    for outil in catalogue:
        nom = domaine_de(outil.nom)
        if nom not in connus:
            deduits.setdefault(nom, []).append(outil.description or outil.nom)
    return declares + [
        Domaine(nom, " ; ".join(descriptions)[:_TAILLE_DESCRIPTION], (f"{nom}_",))
        for nom, descriptions in deduits.items()
    ]


def restreindre(catalogue: list[OutilDecrit], domaines: list[str]) -> list[OutilDecrit]:
    retenus = set(domaines)
    return [o for o in catalogue if domaine_de(o.nom) in retenus]
