"""Registre des entités auditées (remplace `@Audited` / `@NotAudited` d'Envers).

Un domaine déclare, pour chacune de ses entités historisées, la table `<table>_aud` et les champs à conserver. Un
champ absent de la déclaration n'est **jamais** historisé (le hash du mot de passe, par exemple). Les noms de champs
sont ceux de l'API (camelCase), pour que l'historique lu par le frontend ne change pas.
"""

from dataclasses import dataclass, field

from sqlalchemy import Table


@dataclass(frozen=True)
class ChampAudite:
    nom: str
    """Nom affiché dans l'historique (camelCase, comme les propriétés Java)."""
    attribut: str
    colonne: str
    """Colonne de la table `_aud`."""


@dataclass(frozen=True)
class RelationAuditee:
    """Relation simple, conservée comme identifiant de sa cible et rendue « <id> — <libellé> »."""

    nom: str
    attribut_fk: str
    colonne: str
    cible: Table


@dataclass(frozen=True)
class CollectionAuditee:
    """Collection de droits ou de liaisons : on conserve les éléments ajoutés et retirés par révision."""

    nom: str
    attribut: str
    liaison: Table
    """Table de liaison métier, lue si la collection d'une entité supprimée n'est pas chargée."""
    table_aud: Table
    colonne_proprietaire: str
    colonne_element: str
    cible: Table


@dataclass(frozen=True)
class EntiteAuditee:
    classe: type
    nom: str
    """Nom d'entité de l'URL d'historique (`/logs/historique/{nom}/{id}`), insensible à la casse."""
    nom_hibernate: str
    """Nom enregistré dans `audit_revision_entite` : celui qu'écrivait Spring, pour garder un historique continu."""
    table_aud: Table
    champs: tuple[ChampAudite, ...]
    relations: tuple[RelationAuditee, ...] = ()
    collections: tuple[CollectionAuditee, ...] = ()


@dataclass
class RegistreAudit:
    _entites: dict[type, EntiteAuditee] = field(default_factory=lambda: {})

    def enregistrer(self, entite: EntiteAuditee) -> None:
        self._entites[entite.classe] = entite

    def par_classe(self, classe: type) -> EntiteAuditee | None:
        return self._entites.get(classe)

    def par_nom(self, nom: str) -> EntiteAuditee | None:
        return next((e for e in self._entites.values() if e.nom.lower() == nom.lower()), None)

    def par_nom_hibernate(self, nom: str) -> EntiteAuditee | None:
        return next((e for e in self._entites.values() if e.nom_hibernate == nom), None)

    def toutes(self) -> list[EntiteAuditee]:
        return list(self._entites.values())


registre = RegistreAudit()
"""Registre unique du processus : alimenté à l'import par les modules `audit` des domaines."""
