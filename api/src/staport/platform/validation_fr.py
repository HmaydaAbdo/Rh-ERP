"""Messages de validation en français (parité de langue avec les contraintes Jakarta de Spring, ADR 0016 § 6).

Pydantic ne fournit que des messages anglais : chaque type d'erreur documenté (`ErrorDetails["type"]`) est traduit
ici, avec ses paramètres (`ctx`). Un type inconnu retombe sur le message de Pydantic plutôt que de le masquer ; le test
des types fréquents empêche une régression silencieuse.
"""

from collections.abc import Mapping
from typing import Any

_MODELES: Mapping[str, str] = {
    "missing": "Ce champ est obligatoire.",
    "none_required": "Ce champ doit être vide.",
    "string_type": "Une chaîne de caractères est attendue.",
    "string_too_short": "Doit contenir au moins {min_length} caractère(s).",
    "string_too_long": "Doit contenir au plus {max_length} caractère(s).",
    "string_pattern_mismatch": "Le format est invalide.",
    "int_type": "Un nombre entier est attendu.",
    "int_parsing": "Un nombre entier est attendu.",
    "int_from_float": "Un nombre entier est attendu.",
    "float_type": "Un nombre est attendu.",
    "float_parsing": "Un nombre est attendu.",
    "decimal_type": "Un nombre décimal est attendu.",
    "decimal_parsing": "Un nombre décimal est attendu.",
    "decimal_max_digits": "Doit contenir au plus {max_digits} chiffres.",
    "decimal_max_places": "Doit contenir au plus {decimal_places} décimale(s).",
    "bool_type": "Une valeur booléenne est attendue.",
    "bool_parsing": "Une valeur booléenne est attendue.",
    "greater_than": "Doit être strictement supérieur à {gt}.",
    "greater_than_equal": "Doit être supérieur ou égal à {ge}.",
    "less_than": "Doit être strictement inférieur à {lt}.",
    "less_than_equal": "Doit être inférieur ou égal à {le}.",
    "multiple_of": "Doit être un multiple de {multiple_of}.",
    "too_short": "Doit contenir au moins {min_length} élément(s).",
    "too_long": "Doit contenir au plus {max_length} élément(s).",
    "list_type": "Une liste est attendue.",
    "dict_type": "Un objet est attendu.",
    "date_type": "Une date est attendue.",
    "date_parsing": "Une date au format AAAA-MM-JJ est attendue.",
    "date_from_datetime_parsing": "Une date au format AAAA-MM-JJ est attendue.",
    "datetime_type": "Une date et une heure sont attendues.",
    "datetime_parsing": "Une date et une heure valides sont attendues.",
    "time_parsing": "Une heure valide est attendue.",
    "uuid_parsing": "Un identifiant valide est attendu.",
    "url_parsing": "Une adresse valide est attendue.",
    "literal_error": "Valeur non autorisée ; valeurs possibles : {expected}.",
    "enum": "Valeur non autorisée ; valeurs possibles : {expected}.",
    "extra_forbidden": "Ce champ n'est pas autorisé.",
    "json_invalid": "Corps de la requête illisible.",
    "non_vide": "Ce champ ne doit pas être vide.",
    "courriel_invalide": "Doit être une adresse électronique valide.",
}


class _Absent(dict[str, Any]):
    def __missing__(self, cle: str) -> str:
        return f"{{{cle}}}"


def message_fr(detail: Mapping[str, Any]) -> str:
    """Message français d'une erreur de validation Pydantic (`msg` d'origine si le type n'est pas traduit)."""
    modele = _MODELES.get(str(detail.get("type")))
    if modele is None:
        return str(detail.get("msg", "Valeur invalide."))
    return modele.format_map(_Absent(detail.get("ctx") or {}))


def types_traduits() -> frozenset[str]:
    return frozenset(_MODELES)
