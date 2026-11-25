"""Forme canonique des identifiants métier : une seule règle pour l'API, les imports Excel et la base (KAN-319).

Un identifiant (CIN, code de chantier ou d'équipe, libellé de fonction ou d'équipe) ne doit jamais exister deux fois
sous deux écritures : « XY 100200 » et « XY100200 » sont le même CIN, « OP.  COMPACTEUR » et « OP. COMPACTEUR » la même
fonction. Toute valeur est ramenée à sa forme canonique **avant** d'être comparée ou enregistrée ; les contraintes
CHECK de la base (révision `0011_identifiants_canoniques`) refusent toute autre écriture.

- CIN : majuscules, sans aucun espace, lettres et chiffres seulement (une valeur Excel en notation scientifique comme
  `9.00000E+11` est refusée, jamais enregistrée).
- Codes et libellés : espaces de début et de fin retirés, suites d'espaces réduites à une seule ; la casse saisie est
  conservée, la comparaison l'ignore (`cle`).
"""

import re
from typing import Annotated, Any

from pydantic import AfterValidator, BeforeValidator
from pydantic_core import PydanticCustomError

_ESPACES = re.compile(r"\s+")
CIN_MOTIF = re.compile(r"^[A-Z0-9]+$")
CIN_REGLE = "Le CIN ne contient que des lettres et des chiffres (ex. AB123456)."


def _texte(valeur: Any) -> str:
    if valeur is None:
        return ""
    if isinstance(valeur, float) and valeur.is_integer():
        return str(int(valeur))  # une cellule Excel numérique (CIN étranger) n'est pas lue « 900000000001.0 »
    return str(valeur)


def cin_canonique(valeur: Any) -> str:
    """CIN en majuscules, sans aucun espace (y compris insécable) ; chaîne vide si rien n'est saisi."""
    return _ESPACES.sub("", _texte(valeur)).upper()


def cin_valide(cin: str) -> bool:
    """`cin` déjà canonique : lettres et chiffres seulement."""
    return bool(CIN_MOTIF.match(cin))


def texte_canonique(valeur: Any) -> str:
    """Code ou libellé sans espaces aux extrémités, chaque suite d'espaces réduite à une seule."""
    return _ESPACES.sub(" ", _texte(valeur)).strip()


def cle(valeur: Any) -> str:
    """Clé de comparaison d'un code ou d'un libellé : forme canonique sans tenir compte de la casse."""
    return texte_canonique(valeur).upper()


def _cin_schema(valeur: Any) -> Any:
    return cin_canonique(valeur) if isinstance(valeur, str | int | float) else valeur


def _non_vide(valeur: str) -> str:
    if not valeur:
        raise PydanticCustomError("non_vide", "Ce champ ne doit pas être vide.")
    return valeur


def _cin_controle(valeur: str) -> str:
    if not cin_valide(valeur):
        raise PydanticCustomError("cin_invalide", CIN_REGLE)
    return valeur


def _texte_schema(valeur: Any) -> Any:
    return texte_canonique(valeur) if isinstance(valeur, str) else valeur


Cin = Annotated[str, BeforeValidator(_cin_schema), AfterValidator(_non_vide), AfterValidator(_cin_controle)]
"""CIN saisi par l'API : mis sous forme canonique, non vide, lettres et chiffres seulement."""

TexteCanonique = Annotated[str, BeforeValidator(_texte_schema), AfterValidator(_non_vide)]
"""Code ou libellé saisi par l'API : espaces superflus retirés, non vide."""
