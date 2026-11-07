"""Catalogue fixe des indicateurs de l'accueil (parité de `IndicateurAccueil`).

Chaque indicateur est protégé par la permission de lecture du domaine qui porte sa donnée : l'accueil ne donne jamais
accès à ce que l'utilisateur ne pourrait pas lire ailleurs. La valeur vient des API des domaines ; ce domaine ne garde
que le choix et l'ordre.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Indicateur:
    code: str
    libelle: str
    description: str
    permission: str


CATALOGUE: tuple[Indicateur, ...] = (
    Indicateur(
        "paie.masse",
        "Masse salariale",
        "Masse salariale du dernier mois de paie, avec sa variation sur le mois précédent",
        "PAIE_READ",
    ),
    Indicateur(
        "paie.effectif",
        "Bulletins de paie",
        "Nombre de bulletins de paie (un par employé payé) du dernier mois de paie",
        "PAIE_READ",
    ),
    Indicateur(
        "paie.cout-moyen",
        "Coût moyen par personne",
        "Masse salariale divisée par le nombre de bulletins du dernier mois",
        "PAIE_READ",
    ),
    Indicateur(
        "paie.stc",
        "Soldes de tout compte",
        "Nombre et montant des soldes de tout compte du dernier mois de paie",
        "PAIE_READ",
    ),
    Indicateur("employe.effectif", "Employés", "Effectif des fiches Employé", "EMPLOYEE_READ"),
    Indicateur("employe.en-poste", "Employés en poste", "Part des fiches Employé en poste", "EMPLOYEE_READ"),
    Indicateur("employe.age-moyen", "Âge moyen", "Âge moyen des employés en poste", "EMPLOYEE_READ"),
    Indicateur(
        "employe.anciennete-moyenne",
        "Ancienneté moyenne",
        "Ancienneté moyenne des employés en poste",
        "EMPLOYEE_READ",
    ),
    Indicateur(
        "employe.embauches",
        "Embauches sur 12 mois",
        "Employés embauchés au cours des douze derniers mois",
        "EMPLOYEE_READ",
    ),
)
