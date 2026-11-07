"""Catalogue matériel C168 partagé par les assistants de rapport et d'export."""

from .schemas import PaieMaterielTableau


def tableaux_materiel() -> list[PaieMaterielTableau]:
    return [
        PaieMaterielTableau(
            chantier_code="C168",
            equipe_code="CH",
            titre="CAMION",
            libelles=["CAMION CITERNE", "CAMION 8*4", "CAMION SR", "PORT CHAR", "PICK UP"],
        ),
        PaieMaterielTableau(
            chantier_code="C168",
            equipe_code="OP",
            titre="ENGINS",
            libelles=["PELLE PNEU", "PELLE CHENILLE", "NIVELEUSE", "COMPACTEURS", "CHARGEUR", "BULL", "TRACTOPELLE"],
        ),
    ]
