"""Lecture du journal et de l'historique (parité avec `AuditJournalService` et `EnversDiffService`).

Les différences avant / après sont calculées à la demande à partir des instantanés `*_aud` : jamais stockées. Ajout :
valeurs après ; modification : comparaison avec la version précédente ; suppression : valeurs avant (le contenu de la
ligne supprimée est conservé). Une relation s'écrit « <id> — <libellé> » (l'identifiant est la seule valeur toujours
exacte : le libellé peut avoir changé, ou la cible avoir disparu) ; une collection de droits donne des éléments ajoutés
et retirés. Un champ absent du registre n'apparaît jamais.
"""

from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any, cast

from sqlalchemy import ColumnElement, Select, Table, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.audit.exceptions import EntiteAuditeeInconnue, EntreeIntrouvable, EntreeNonRestaurable
from staport.domains.audit.models import EntreeJournal, RevisionAudit, audit_revision_entite
from staport.domains.audit.registre import EntiteAuditee, registre
from staport.domains.audit.schemas import (
    CategorieAudit,
    ChampAudit,
    Changement,
    EntreeJournalReponse,
    LigneJournal,
    RechercheJournal,
    ResultatAudit,
    Version,
)
from staport.domains.common.pagination import Pagination
from staport.domains.common.recherche import ECHAPPEMENT, motif_contient
from staport.domains.common.schemas import Page, creer_page

AJOUT, MODIFICATION, SUPPRESSION = 0, 1, 2
OPERATIONS = {AJOUT: "AJOUT", MODIFICATION: "MODIFICATION", SUPPRESSION: "SUPPRESSION"}

COLONNES_TRIABLES = {
    "id": "id",
    "horodatage": "horodatage",
    "categorie": "categorie",
    "action": "action",
    "typeOperation": "type_operation",
    "resultat": "resultat",
    "utilisateurId": "utilisateur_id",
    "utilisateurNom": "utilisateur_nom",
    "origine": "origine",
    "requestId": "request_id",
    "adresseIp": "adresse_ip",
    "userAgent": "user_agent",
    "entiteType": "entite_type",
    "entiteId": "entite_id",
    "nombreElements": "nombre_elements",
    "motif": "motif",
    "revisionId": "revision_id",
}

LIBELLES = ("nom", "nom_prenom", "libelle", "designation", "intitule", "reference", "numero", "code", "username")
"""Colonnes qui donnent le libellé d'une cible, dans l'ordre de `AuditLabelResolver`."""

_journal = cast(Any, EntreeJournal.__table__)
_revision = cast(Any, RevisionAudit.__table__)


# --- Journal ---------------------------------------------------------------------------------------------


def _filtres(criteres: RechercheJournal | None) -> list[ColumnElement[bool]]:
    if criteres is None:
        return []
    c = _journal.c
    filtres: list[ColumnElement[bool]] = []
    if criteres.date_debut is not None:
        filtres.append(c.horodatage >= criteres.date_debut)
    if criteres.date_fin is not None:
        filtres.append(c.horodatage <= criteres.date_fin)
    if criteres.utilisateur and criteres.utilisateur.strip():
        filtres.append(
            func.lower(c.utilisateur_nom).like(motif_contient(criteres.utilisateur.strip()), escape=ECHAPPEMENT)
        )
    categories = {x.value for x in criteres.categories or []}
    if criteres.categorie is not None:
        categories.add(criteres.categorie.value)
    if categories:
        filtres.append(c.categorie.in_(categories))
    actions = _textes(criteres.actions, criteres.action)
    if actions:
        filtres.append(c.action.in_(actions))
    if criteres.resultat is not None:
        filtres.append(c.resultat == criteres.resultat.value)
    types = _textes(criteres.entite_types, criteres.entite_type)
    if types:
        filtres.append(c.entite_type.in_(types))
    if criteres.entite_id is not None:
        filtres.append(c.entite_id == criteres.entite_id)
    if criteres.request_id and criteres.request_id.strip():
        filtres.append(c.request_id == criteres.request_id.strip())
    return filtres


def _textes(pluriel: Sequence[str] | None, singulier: str | None) -> set[str]:
    valeurs = {v.strip() for v in pluriel or [] if v and v.strip()}
    if singulier and singulier.strip():
        valeurs.add(singulier.strip())
    return valeurs


async def rechercher(
    session: AsyncSession, criteres: RechercheJournal | None, pagination: Pagination
) -> Page[LigneJournal]:
    filtres = _filtres(criteres)
    total = (await session.execute(select(func.count()).select_from(_journal).where(*filtres))).scalar_one()
    requete: Select[Any] = select(_journal).where(*filtres)
    for propriete, croissant in pagination.tri:
        colonne = _journal.c[COLONNES_TRIABLES[propriete]]
        requete = requete.order_by(colonne.asc() if croissant else colonne.desc())
    requete = requete.order_by(_journal.c.id.desc())  # ordre total : pages stables
    lignes = (await session.execute(requete.limit(pagination.taille).offset(pagination.decalage))).mappings().all()
    contenu = [LigneJournal.model_validate(dict(ligne)) for ligne in lignes]
    return creer_page(contenu, pagination.taille, pagination.page, total)


async def _entree(session: AsyncSession, identifiant: int) -> Mapping[Any, Any]:
    ligne = (await session.execute(select(_journal).where(_journal.c.id == identifiant))).mappings().first()
    if ligne is None:
        raise EntreeIntrouvable(identifiant)
    return ligne


async def lire(session: AsyncSession, identifiant: int) -> EntreeJournalReponse:
    return EntreeJournalReponse.model_validate(dict(await _entree(session, identifiant)))


async def instantanes_suppression(
    session: AsyncSession, identifiant: int, action: str, entite: str
) -> list[dict[str, Any]]:
    """Instantanés `*_aud` des éléments supprimés par l'entrée `identifiant` (parité `instantanesPaiePourRestauration`).

    L'entrée doit être une suppression réussie de l'action et de l'entité attendues, avec une révision, et la révision
    doit contenir exactement le nombre d'instantanés consigné : sinon la restauration serait partielle.
    """
    ligne = await _entree(session, identifiant)
    auditee = registre.par_nom(entite)
    nombre = ligne["nombre_elements"]
    if (
        auditee is None
        or ligne["action"] != action
        or ligne["categorie"] != CategorieAudit.OPERATION
        or ligne["resultat"] != ResultatAudit.SUCCES
        or ligne["type_operation"] != "DELETE"
        or ligne["entite_type"] != entite
        or ligne["revision_id"] is None
        or nombre is None
        or nombre <= 0
    ):
        raise EntreeNonRestaurable(identifiant)
    aud = auditee.table_aud
    requete = (
        select(aud).where(aud.c.rev == ligne["revision_id"], aud.c.revtype == SUPPRESSION).order_by(aud.c.id.asc())
    )
    instantanes = [dict(x) for x in (await session.execute(requete)).mappings().all()]
    if len(instantanes) != nombre:
        raise EntreeNonRestaurable(identifiant)
    return instantanes


# --- Détail d'une opération ------------------------------------------------------------------------------


async def _revisions_de(session: AsyncSession, entree: Mapping[Any, Any]) -> list[int]:
    """La révision de l'entrée ; pour une opération en plusieurs transactions (sans révision unique), toutes celles qui
    portent le même identifiant de requête. Une opération échouée n'a rien modifié."""
    if entree["revision_id"] is not None:
        return [entree["revision_id"]]
    if (
        entree["categorie"] == CategorieAudit.OPERATION
        and entree["resultat"] == ResultatAudit.SUCCES
        and entree["request_id"] is not None
    ):
        requete = select(_revision.c.id).where(_revision.c.request_id == entree["request_id"])
        return list((await session.execute(requete)).scalars())
    return []


async def details(session: AsyncSession, identifiant: int, pagination: Pagination) -> Page[Changement]:
    revisions = await _revisions_de(session, await _entree(session, identifiant))
    if not revisions:
        return creer_page([], pagination.taille, pagination.page, 0)
    noms = (
        await session.execute(
            select(audit_revision_entite.c.entite).where(audit_revision_entite.c.revision_id.in_(revisions)).distinct()
        )
    ).scalars()
    entites = sorted((e for e in (registre.par_nom_hibernate(n) for n in noms) if e is not None), key=lambda e: e.nom)
    total = 0
    a_ignorer, restant = pagination.decalage, pagination.taille
    contenu: list[Changement] = []
    for entite in entites:
        aud = entite.table_aud
        nombre = (
            await session.execute(select(func.count()).select_from(aud).where(aud.c.rev.in_(revisions)))
        ).scalar_one()
        total += nombre
        if restant <= 0:
            continue
        if a_ignorer >= nombre:
            a_ignorer -= nombre
            continue
        requete = (
            select(aud)
            .where(aud.c.rev.in_(revisions))
            .order_by(aud.c.id.asc(), aud.c.rev.asc())
            .offset(a_ignorer)
            .limit(restant)
        )
        lignes = (await session.execute(requete)).mappings().all()
        for ligne in lignes:
            avant = await _version_avant(session, aud, ligne) if ligne["revtype"] == MODIFICATION else None
            contenu.append(
                Changement(
                    entite_type=entite.nom,
                    entite_id=ligne["id"],
                    libelle=_libelle_propre(aud, ligne),
                    operation=OPERATIONS[ligne["revtype"]],
                    champs=await _champs(session, entite, ligne["revtype"], avant, ligne),
                )
            )
        restant -= len(lignes)
        a_ignorer = 0
    return creer_page(contenu, pagination.taille, pagination.page, total)


async def _version_avant(session: AsyncSession, aud: Table, ligne: Mapping[Any, Any]) -> Mapping[Any, Any] | None:
    requete = select(aud).where(aud.c.id == ligne["id"], aud.c.rev < ligne["rev"]).order_by(aud.c.rev.desc()).limit(1)
    return (await session.execute(requete)).mappings().first()


# --- Historique d'un enregistrement ----------------------------------------------------------------------


async def historique(session: AsyncSession, nom: str, identifiant: int, pagination: Pagination) -> Page[Version]:
    entite = registre.par_nom(nom)
    if entite is None:
        raise EntiteAuditeeInconnue(nom)
    aud = entite.table_aud
    total = (await session.execute(select(func.count()).select_from(aud).where(aud.c.id == identifiant))).scalar_one()
    if pagination.decalage >= total:
        return creer_page([], pagination.taille, pagination.page, total)
    # Une version plus ancienne supplémentaire suffit à calculer le diff de la dernière ligne de la page.
    requete = (
        select(
            aud, *(_revision.c[c] for c in ("horodatage", "utilisateur_id", "utilisateur_nom", "origine", "request_id"))
        )
        .join(_revision, _revision.c.id == aud.c.rev)
        .where(aud.c.id == identifiant)
        .order_by(aud.c.rev.desc())
        .offset(pagination.decalage)
        .limit(pagination.taille + 1)
    )
    lignes = (await session.execute(requete)).mappings().all()
    versions: list[Version] = []
    for index, ligne in enumerate(lignes[: pagination.taille]):
        precedente = lignes[index + 1] if index + 1 < len(lignes) else None
        versions.append(
            Version(
                revision=ligne["rev"],
                horodatage=ligne["horodatage"],
                utilisateur_id=ligne["utilisateur_id"],
                utilisateur_nom=ligne["utilisateur_nom"],
                origine=ligne["origine"],
                request_id=ligne["request_id"],
                operation=OPERATIONS[ligne["revtype"]],
                champs=await _champs(session, entite, ligne["revtype"], precedente, ligne),
            )
        )
    return creer_page(versions, pagination.taille, pagination.page, total)


# --- Différences champ par champ -------------------------------------------------------------------------


def _formater(valeur: object) -> str | None:
    if valeur is None:
        return None
    if isinstance(valeur, bool):
        return "Oui" if valeur else "Non"
    if isinstance(valeur, Decimal):
        return format(valeur, "f")
    return str(valeur)


def _libelle_propre(table: Table, ligne: Mapping[Any, Any]) -> str | None:
    for colonne in LIBELLES:
        if colonne in table.c and ligne.get(colonne) not in (None, ""):
            return str(ligne[colonne]).strip() or None
    return None


async def _rendre(session: AsyncSession, cible: Table, identifiant: int | None) -> str | None:
    """`"<id> — <libellé>"` d'après l'état courant de la cible ; l'identifiant seul si elle a disparu."""
    if identifiant is None:
        return None
    ligne = (await session.execute(select(cible).where(cible.c.id == identifiant))).mappings().first()
    libelle = _libelle_propre(cible, ligne) if ligne is not None else None
    return str(identifiant) if libelle is None else f"{identifiant} — {libelle}"


async def _champs(
    session: AsyncSession,
    entite: EntiteAuditee,
    revtype: int,
    avant: Mapping[Any, Any] | None,
    apres: Mapping[Any, Any],
) -> list[ChampAudit]:
    elements: list[tuple[str, ChampAudit]] = []
    for champ in entite.champs:
        valeur_apres = _formater(apres[champ.colonne])
        if revtype == SUPPRESSION:
            if valeur_apres is not None:  # la ligne supprimée porte les valeurs d'« avant »
                elements.append((champ.nom, ChampAudit(champ=champ.nom, avant=valeur_apres, apres=None)))
            continue
        valeur_avant = _formater(avant[champ.colonne]) if avant is not None else None
        if valeur_avant != valeur_apres:
            elements.append((champ.nom, ChampAudit(champ=champ.nom, avant=valeur_avant, apres=valeur_apres)))
    for relation in entite.relations:
        rendu_apres = await _rendre(session, relation.cible, apres[relation.colonne])
        if revtype == SUPPRESSION:
            if rendu_apres is not None:
                elements.append((relation.nom, ChampAudit(champ=relation.nom, avant=rendu_apres, apres=None)))
            continue
        rendu_avant = await _rendre(session, relation.cible, avant[relation.colonne]) if avant is not None else None
        if rendu_avant != rendu_apres:
            elements.append((relation.nom, ChampAudit(champ=relation.nom, avant=rendu_avant, apres=rendu_apres)))
    for collection in entite.collections:
        liaison = collection.table_aud
        lignes = (
            await session.execute(
                select(liaison.c.revtype, liaison.c[collection.colonne_element]).where(
                    # Les liens modifiés dans une révision où l'entité elle-même n'a pas de version (un droit ajouté
                    # par migration) sont rattachés à la version suivante, comme Spring.
                    liaison.c.rev > (avant["rev"] if avant is not None else 0),
                    liaison.c.rev <= apres["rev"],
                    liaison.c[collection.colonne_proprietaire] == apres["id"],
                )
            )
        ).all()
        ajoutes = sorted(
            [
                await _rendre(session, collection.cible, int(el)) or str(el)
                for rev_type, el in lignes
                if rev_type == AJOUT
            ]
        )
        retires = sorted(
            [
                await _rendre(session, collection.cible, int(el)) or str(el)
                for rev_type, el in lignes
                if rev_type == SUPPRESSION
            ]
        )
        if ajoutes or retires:
            elements.append((collection.nom, ChampAudit(champ=collection.nom, ajoutes=ajoutes, retires=retires)))
    return [champ for _, champ in sorted(elements, key=lambda e: e[0])]
