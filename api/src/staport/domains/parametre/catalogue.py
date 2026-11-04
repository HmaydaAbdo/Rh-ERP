"""Catalogue des paramètres administrables : pour chaque clé, ce qu'elle règle, son type et ses bornes.

Les VALEURS ne sont pas ici (une valeur métier n'est jamais codée) : elles vivent dans la table `parametre`, posées
par la migration puis modifiées depuis l'écran Paramètres. Ajouter un paramètre : une définition ici, une migration qui
insère sa ligne de départ, et son lecteur typé dans `ServiceParametre`.
"""

import re
from dataclasses import dataclass
from enum import StrEnum

from apscheduler.triggers.cron import CronTrigger  # pyright: ignore[reportMissingTypeStubs]

from staport.domains.parametre.exceptions import ParametreInvalide

_ENTIER = re.compile(r"[+-]?[0-9]+", re.ASCII)
_LONG_MAX = 2**63 - 1


class TypeParametre(StrEnum):
    ENTIER = "ENTIER"
    """Nombre entier, dans les bornes de la clé."""
    CRON = "CRON"
    """Expression cron à six champs (secondes comprises), par exemple `0 0 23 * * *`."""


@dataclass(frozen=True)
class DefinitionParametre:
    code: str
    libelle: str
    description: str
    type: TypeParametre
    unite: str | None
    minimum: int | None
    maximum: int | None

    def normaliser(self, saisie: str | None) -> str:
        """Valide la saisie selon le type et les bornes de la clé et renvoie la valeur à stocker.

        Les espaces extérieurs sont retirés et un entier prend sa forme canonique (` 012 ` devient `12`).
        """
        valeur = (saisie or "").strip()
        if self.type is TypeParametre.ENTIER:
            return self._normaliser_entier(valeur)
        return self._normaliser_cron(valeur)

    def _normaliser_entier(self, valeur: str) -> str:
        if _ENTIER.fullmatch(valeur) is None or abs(int(valeur)) > _LONG_MAX:
            raise ParametreInvalide(f"{self.libelle} : un nombre entier est attendu.")
        nombre = int(valeur)
        assert self.minimum is not None and self.maximum is not None  # noqa: S101  # un entier a toujours ses bornes
        if not self.minimum <= nombre <= self.maximum:
            raise ParametreInvalide(
                f"{self.libelle} : la valeur doit être comprise entre {self.minimum} et {self.maximum}."
            )
        return str(nombre)

    def _normaliser_cron(self, valeur: str) -> str:
        if not expression_cron_valide(valeur):
            raise ParametreInvalide(
                f"{self.libelle} : expression cron invalide (six champs attendus, par exemple « 0 0 23 * * * »)."
            )
        return valeur


def expression_cron_valide(valeur: str) -> bool:
    """Six champs dans l'ordre de Spring (secondes, minutes, heures, jour, mois, jour de semaine), vérifiés par
    APScheduler.

    Écart documenté avec Spring : APScheduler numérote les jours de semaine à partir du lundi (0 = lundi) alors que
    Spring et cron comptent 0 ou 7 pour le dimanche. Une valeur numérique serait lue différemment selon le moteur : le
    champ jour de semaine n'accepte donc que `*` et les noms `MON` à `SUN` (listes et plages comprises). Le caractère
    `?` de Spring n'est pas reconnu : écrire `*`.
    """
    champs = valeur.split()
    if len(champs) != 6:
        return False
    seconde, minute, heure, jour, mois, jour_semaine = champs
    if any(c.isdigit() for c in jour_semaine):
        return False
    try:
        CronTrigger(
            second=seconde,
            minute=minute,
            hour=heure,
            day=jour,
            month=mois,
            day_of_week=jour_semaine.lower(),
            timezone="UTC",
        )
    except ValueError:
        return False
    return True


JETON_ACCES = DefinitionParametre(
    "securite.jeton-acces.minutes",
    "Durée de l'Access Token",
    "Au-delà, l'interface renouvelle le jeton avec le jeton de session. Une durée courte limite l'effet d'un jeton "
    "volé ; un changement de permissions s'applique au prochain renouvellement.",
    TypeParametre.ENTIER,
    "minutes",
    1,
    1440,
)
JETON_SESSION = DefinitionParametre(
    "securite.jeton-session.heures",
    "Durée de la session",
    "Durée de vie du jeton de session (cookie) : passé ce délai sans reconnexion, l'utilisateur doit se reconnecter. "
    "Ne s'applique qu'aux sessions ouvertes après le changement.",
    TypeParametre.ENTIER,
    "heures",
    1,
    720,
)
LIEN_REINITIALISATION = DefinitionParametre(
    "securite.lien-reinitialisation.minutes",
    "Validité du lien de réinitialisation",
    "Durée pendant laquelle le lien reçu par courriel permet de choisir un nouveau mot de passe (usage unique).",
    TypeParametre.ENTIER,
    "minutes",
    5,
    1440,
)
LONGUEUR_MOT_DE_PASSE = DefinitionParametre(
    "securite.mot-de-passe.longueur-minimale",
    "Longueur minimale du mot de passe",
    "S'applique à la création d'un compte et aux réinitialisations ; les mots de passe existants ne changent pas. "
    "Le mot de passe ne peut pas être identique à l'identifiant.",
    TypeParametre.ENTIER,
    "caractères",
    8,
    100,
)
PAS_TRANCHE_ANALYTIQUE = DefinitionParametre(
    "paie.analytique.pas-tranche",
    "Pas des tranches de l'analytique de paie",
    "Largeur minimale et pas d'arrondi des tranches de la répartition des salaires : des bornes lisibles "
    "(500, 1 000, 1 500...).",
    TypeParametre.ENTIER,
    "DH",
    1,
    100000,
)
CRON_SYNCHRONISATION_CHANTIERS = DefinitionParametre(
    "chantier.synchronisation.cron",
    "Planification de la synchronisation des chantiers",
    "Expression cron à six champs (secondes, minutes, heures, jour, mois, jour de semaine) ; « 0 0 23 * * * » = chaque "
    "jour à 23 h. Le changement s'applique après la prochaine exécution.",
    TypeParametre.CRON,
    None,
    None,
    None,
)

CATALOGUE: tuple[DefinitionParametre, ...] = (
    JETON_ACCES,
    JETON_SESSION,
    LIEN_REINITIALISATION,
    LONGUEUR_MOT_DE_PASSE,
    PAS_TRANCHE_ANALYTIQUE,
    CRON_SYNCHRONISATION_CHANTIERS,
)


def depuis_code(code: str) -> DefinitionParametre | None:
    return next((d for d in CATALOGUE if d.code == code), None)
