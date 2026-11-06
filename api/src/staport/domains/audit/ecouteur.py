"""Historique des entités auditées : remplace Hibernate Envers par des écouteurs de session SQLAlchemy (ADR 0016 § 2).

Pendant la transaction, chaque vidage (`flush`) enregistre en mémoire l'état des entités auditées qui ont changé ; juste
avant le commit, une **révision** est créée (qui, quand, d'où) et les instantanés sont insérés dans les tables
`<table>_aud`. Rien n'est écrit si la transaction est annulée : « une transaction annulée ne laisse aucune révision ».
Les tables d'audit n'acceptent que l'insertion (droits du compte applicatif) : chaque ligne est donc écrite une seule
fois, à son état final dans la transaction.

Règles de fusion d'une même transaction (comme Envers) : ajout puis modification = ajout ; modification puis
suppression = suppression ; ajout puis suppression = rien ; une liaison ajoutée puis retirée (ou l'inverse) = rien.
Un enregistrement dont aucun champ audité n'a changé (changement de mot de passe seul, par exemple) ne produit rien.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import event, insert, inspect, select
from sqlalchemy.orm import Session, attributes
from sqlalchemy.orm.attributes import History

from staport.domains.audit.models import RevisionAudit, audit_revision_entite
from staport.domains.audit.registre import CollectionAuditee, EntiteAuditee, registre
from staport.domains.common.audit_contexte import Origine, contexte_audit_courant

journal = logging.getLogger("staport.audit")

AJOUT = 0
MODIFICATION = 1
SUPPRESSION = 2

_CLE = "audit.etat"


@dataclass
class EtatAudit:
    entites: dict[tuple[type, int], tuple[int, dict[str, Any]]] = field(default_factory=lambda: {})
    liens: dict[tuple[str, int, int], int] = field(default_factory=lambda: {})
    """(« Entité.collection », propriétaire, élément) -> AJOUT ou SUPPRESSION."""
    revision_id: int | None = None


def _etat(session: Session) -> EtatAudit:
    etat = session.info.get(_CLE)
    if etat is None:
        etat = EtatAudit()
        session.info[_CLE] = etat
    return cast(EtatAudit, etat)


def _change(histoire: History) -> bool:
    """Valeur réellement modifiée. Sans ancienne valeur connue (`flag_modified`, qui force l'UPDATE pour la version),
    un attribut d'un enregistrement déjà en base n'a pas changé de valeur."""
    ajoutes, supprimes = list(histoire.added or ()), list(histoire.deleted or ())
    if not ajoutes or not supprimes:
        return False
    return ajoutes != supprimes


def _collection_change(histoire: History) -> bool:
    return bool(list(histoire.added or ()) or list(histoire.deleted or ()))


def _identifiant(objet: object) -> int | None:
    valeur = inspect(objet).identity
    return int(valeur[0]) if valeur else cast(int | None, getattr(objet, "id", None))


def _valeurs(entite: EntiteAuditee, objet: object) -> dict[str, Any]:
    valeurs: dict[str, Any] = {c.colonne: getattr(objet, c.attribut) for c in entite.champs}
    valeurs.update({r.colonne: getattr(objet, r.attribut_fk) for r in entite.relations})
    return valeurs


def _champs_modifies(entite: EntiteAuditee, objet: object) -> bool:
    noms = [c.attribut for c in entite.champs] + [r.attribut_fk for r in entite.relations]
    return any(_change(attributes.get_history(objet, nom)) for nom in noms)


def _lier(etat: EtatAudit, cle: str, proprietaire: int, element: int, revtype: int) -> None:
    existant = etat.liens.get((cle, proprietaire, element))
    if existant is not None and existant != revtype:
        del etat.liens[(cle, proprietaire, element)]  # ajouté puis retiré (ou l'inverse) dans la même transaction
    else:
        etat.liens[(cle, proprietaire, element)] = revtype


def _cle(entite: EntiteAuditee, collection: CollectionAuditee) -> str:
    return f"{entite.nom}.{collection.nom}"


def _membres_charges(objet: object, collection: CollectionAuditee) -> list[int] | None:
    charge = inspect(objet).dict.get(collection.attribut)
    return None if charge is None else [cast(int, e.id) for e in charge]


def _enregistrer_collections(
    session: Session, etat: EtatAudit, entite: EntiteAuditee, objet: object, identifiant: int, revtype: int
) -> None:
    for collection in entite.collections:
        cle = _cle(entite, collection)
        if revtype == AJOUT:
            for element in _membres_charges(objet, collection) or []:
                _lier(etat, cle, identifiant, element, AJOUT)
        elif revtype == SUPPRESSION:
            membres = _membres_charges(objet, collection)
            if membres is None:  # non chargée : lue en base avant la suppression des liaisons
                liaison = collection.liaison
                requete = select(liaison.c[collection.colonne_element]).where(
                    liaison.c[collection.colonne_proprietaire] == identifiant
                )
                membres = [int(m) for m in session.execute(requete).scalars()]
            for element in membres:
                _lier(etat, cle, identifiant, element, SUPPRESSION)
        else:
            histoire = attributes.get_history(objet, collection.attribut)
            for element in histoire.added or ():
                _lier(etat, cle, identifiant, cast(int, element.id), AJOUT)
            for element in histoire.deleted or ():
                _lier(etat, cle, identifiant, cast(int, element.id), SUPPRESSION)


def _avant_vidage(session: Session, _contexte: object, _instances: object) -> None:
    etat = _etat(session)
    for objet in cast(list[object], list(session.deleted)):
        entite = registre.par_classe(type(objet))
        identifiant = _identifiant(objet) if entite else None
        if entite is None or identifiant is None:
            continue
        cle = (entite.classe, identifiant)
        precedent = etat.entites.get(cle)
        if precedent is not None and precedent[0] == AJOUT:
            del etat.entites[cle]  # créé puis supprimé dans la même transaction : rien à historiser
            for collection in entite.collections:
                for lien in [k for k in etat.liens if k[0] == _cle(entite, collection) and k[1] == identifiant]:
                    del etat.liens[lien]
            continue
        etat.entites[cle] = (SUPPRESSION, _valeurs(entite, objet))
        _enregistrer_collections(session, etat, entite, objet, identifiant, SUPPRESSION)


def _apres_vidage(session: Session, _contexte: object) -> None:
    etat = _etat(session)
    nouveaux = [(o, AJOUT) for o in cast(set[object], session.new)]
    modifies = [(o, MODIFICATION) for o in cast(set[object], session.dirty)]
    for objet, revtype in nouveaux + modifies:
        entite = registre.par_classe(type(objet))
        if entite is None:
            continue
        identifiant = _identifiant(objet)
        if identifiant is None:
            continue
        if revtype == MODIFICATION:
            collections_modifiees = any(
                _collection_change(attributes.get_history(objet, c.attribut)) for c in entite.collections
            )
            if not _champs_modifies(entite, objet) and not collections_modifiees:
                continue
        cle = (entite.classe, identifiant)
        precedent = etat.entites.get(cle)
        effectif = AJOUT if precedent is not None and precedent[0] == AJOUT else revtype
        etat.entites[cle] = (effectif, _valeurs(entite, objet))
        _enregistrer_collections(session, etat, entite, objet, identifiant, revtype)


def assurer_revision(session: Session) -> int:
    """Révision de la transaction courante, créée si besoin (le journal s'y lie même si rien n'a changé)."""
    etat = _etat(session)
    if etat.revision_id is not None:
        return etat.revision_id
    contexte = contexte_audit_courant()
    if contexte.origine == Origine.INCONNUE:
        journal.warning(
            "Révision d'audit créée hors de tout contexte (ni requête, ni traitement déclaré) : "
            "ouvrir un contexte_batch dans ce traitement"
        )
    table = cast(Any, RevisionAudit.__table__)
    etat.revision_id = session.execute(
        insert(table)
        .values(
            horodatage=datetime.now(UTC),
            utilisateur_id=contexte.utilisateur_id,
            utilisateur_nom=contexte.utilisateur_nom,
            origine=contexte.origine.value,
            request_id=contexte.request_id,
            adresse_ip=contexte.adresse_ip,
        )
        .returning(table.c.id)
    ).scalar_one()
    return etat.revision_id  # pyright: ignore[reportReturnType]


def _avant_commit(session: Session) -> None:
    etat = session.info.get(_CLE)
    if not isinstance(etat, EtatAudit) or not (etat.entites or etat.liens):
        return
    revision = assurer_revision(session)
    noms: set[str] = set()
    for (classe, identifiant), (revtype, valeurs) in etat.entites.items():
        entite = registre.par_classe(classe)
        if entite is None:
            continue
        noms.add(entite.nom_hibernate)
        session.execute(insert(entite.table_aud).values(id=identifiant, rev=revision, revtype=revtype, **valeurs))
    for (cle, proprietaire, element), revtype in etat.liens.items():
        nom_entite, _, nom_collection = cle.partition(".")
        entite = registre.par_nom(nom_entite)
        collection = next((c for c in (entite.collections if entite else ()) if c.nom == nom_collection), None)
        if entite is None or collection is None:
            continue
        noms.add(entite.nom_hibernate)
        session.execute(
            insert(collection.table_aud).values(
                {
                    "rev": revision,
                    "revtype": revtype,
                    collection.colonne_proprietaire: proprietaire,
                    collection.colonne_element: element,
                }
            )
        )
    for nom in sorted(noms):
        session.execute(insert(audit_revision_entite).values(revision_id=revision, entite=nom))
    etat.entites.clear()
    etat.liens.clear()


def _oublier(session: Session, *_: object) -> None:
    session.info.pop(_CLE, None)


_installes = False


def installer_ecouteurs() -> None:
    """Idempotent : les écouteurs s'appliquent à toute `Session`, mais n'agissent que sur les entités enregistrées."""
    global _installes
    if _installes:
        return
    event.listen(Session, "before_flush", _avant_vidage)
    event.listen(Session, "after_flush", _apres_vidage)
    event.listen(Session, "before_commit", _avant_commit)
    event.listen(Session, "after_commit", _oublier)
    event.listen(Session, "after_rollback", _oublier)
    _installes = True
