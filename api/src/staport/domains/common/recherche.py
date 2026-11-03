"""Motif d'une recherche « contient, sans tenir compte de la casse » (parité avec `MotifRecherche` de Spring).

Ce que tape l'utilisateur est du *texte*, jamais un motif : les jokers `%` et `_` et le caractère d'échappement
sont échappés. Toute requête `LIKE` construite sur une saisie passe par ici et déclare `ECHAPPEMENT`
(`column.ilike(motif, escape=ECHAPPEMENT)`).
"""

ECHAPPEMENT = "\\"


def motif_contient(texte: str) -> str:
    """`%texte%` en minuscules, jokers échappés. Le texte est renseigné (les filtres vides sont ignorés en amont)."""
    echappe = texte.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{echappe}%"
