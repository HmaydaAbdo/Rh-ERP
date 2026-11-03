"""DTO du domaine audit : mêmes champs et noms JSON que les `record` Java (contrat du frontend)."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any

from pydantic import Field

from staport.domains.common.audit_contexte import Origine
from staport.domains.common.schemas import ModeleApi


class CategorieAudit(StrEnum):
    OPERATION = "OPERATION"
    SECURITE = "SECURITE"
    ACCES = "ACCES"
    """Lue dans l'historique écrit par Spring ; le code Python n'en écrit plus (aucune lecture n'est auditée)."""


class ResultatAudit(StrEnum):
    SUCCES = "SUCCES"
    ECHEC = "ECHEC"


Texte100 = Annotated[str, Field(max_length=100)]
Texte100Rempli = Annotated[str, Field(min_length=1, max_length=100, pattern=r"\S")]


class RechercheJournal(ModeleApi):
    """Filtres du journal ; un champ absent ou vide est ignoré. Les champs pluriels filtrent par inclusion."""

    date_debut: datetime | None = None
    date_fin: datetime | None = None
    utilisateur: Texte100 | None = None
    categorie: CategorieAudit | None = None
    action: Texte100 | None = None
    resultat: ResultatAudit | None = None
    entite_type: Texte100 | None = None
    entite_id: int | None = None
    request_id: Texte100 | None = None
    categories: Annotated[list[CategorieAudit], Field(max_length=500)] | None = None
    actions: Annotated[list[Texte100Rempli], Field(max_length=500)] | None = None
    entite_types: Annotated[list[Texte100Rempli], Field(max_length=500)] | None = None


class LigneJournal(ModeleApi):
    id: int
    horodatage: datetime
    categorie: CategorieAudit
    action: str
    type_operation: str | None
    resultat: ResultatAudit
    utilisateur_id: int | None
    utilisateur_nom: str
    origine: Origine
    entite_type: str | None
    entite_id: int | None
    nombre_elements: int | None
    motif: str | None


class EntreeJournalReponse(LigneJournal):
    request_id: str | None
    adresse_ip: str | None
    user_agent: str | None
    perimetre: dict[str, Any] | None
    revision_id: int | None


class ChampAudit(ModeleApi):
    champ: str
    avant: str | None = None
    apres: str | None = None
    ajoutes: list[str] | None = None
    retires: list[str] | None = None


class Changement(ModeleApi):
    entite_type: str
    entite_id: int
    libelle: str | None
    operation: str
    champs: list[ChampAudit]


class Version(ModeleApi):
    revision: int
    horodatage: datetime
    utilisateur_id: int | None
    utilisateur_nom: str
    origine: Origine
    request_id: str | None
    operation: str
    champs: list[ChampAudit]
