from typing import Annotated

from pydantic import Field

from staport.domains.common.schemas import ModeleApi, NonVide, Page


class EquipeCreationRequete(ModeleApi):
    code: Annotated[NonVide, Field(max_length=50)]
    libelle: Annotated[NonVide, Field(max_length=100)]


class EquipeModificationRequete(EquipeCreationRequete):
    version: int


class EquipeRecherche(ModeleApi):
    code: Annotated[str | None, Field(max_length=50)] = None
    libelle: Annotated[str | None, Field(max_length=100)] = None
    recherche: Annotated[str | None, Field(max_length=100)] = None


class EquipeReponse(ModeleApi):
    id: int
    version: int
    code: str
    libelle: str


EquipesPage = Page[EquipeReponse]
