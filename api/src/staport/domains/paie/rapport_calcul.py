"""Mesures du rapport de paie : mêmes données historiques et définitions que Spring."""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol


class BulletinRapport(Protocol):
    salaire_total: Decimal
    chantier_id: int
    observation: str | None


@dataclass(frozen=True)
class MesuresRapport:
    masse: Decimal
    effectif: int
    chantiers: int
    stc: int
    montant_stc: Decimal


def mesurer(bulletins: Sequence[BulletinRapport]) -> MesuresRapport:
    """La masse provient du total enregistré, jamais du recalcul des composantes."""
    sorties = [b for b in bulletins if (b.observation or "").strip().casefold() in {"stc", "sortie"}]
    return MesuresRapport(
        masse=sum((b.salaire_total for b in bulletins), Decimal(0)),
        effectif=len(bulletins),
        chantiers=len({b.chantier_id for b in bulletins}),
        stc=len(sorties),
        montant_stc=sum((b.salaire_total for b in sorties), Decimal(0)),
    )


def mesurer_precedent(bulletins: Sequence[BulletinRapport]) -> MesuresRapport | None:
    """Une absence de bulletins ne signifie pas une masse précédente égale à zéro."""
    return mesurer(bulletins) if bulletins else None


class LigneEquipe(Protocol):
    @property
    def equipe_libelle(self) -> str | None: ...


def repartir_sections[T: LigneEquipe](
    lignes: Sequence[T], equipes_selectionnees: set[str]
) -> list[tuple[str | None, list[T]]]:
    """Une section par équipe choisie, puis le reste ; chaque ligne apparaît une seule fois."""
    sections: dict[str, list[T]] = {}
    reste: list[T] = []
    for ligne in lignes:
        nom = ligne.equipe_libelle
        if nom is not None and nom in equipes_selectionnees:
            sections.setdefault(nom, []).append(ligne)
        else:
            reste.append(ligne)
    resultat: list[tuple[str | None, list[T]]] = [(nom, membres) for nom, membres in sorted(sections.items())]
    if reste:
        resultat.append((None, reste))
    return resultat


def regrouper_sections[T: LigneEquipe](
    lignes: Sequence[T], equipes_selectionnees: set[str], regroupements: Sequence[Sequence[str]]
) -> list[tuple[str | None, list[T], bool]]:
    """Regroupe seulement les équipes explicitement réunies, sans doubler les lignes."""
    equipes_groupees: set[str] = set()
    resultat: list[tuple[str | None, list[T], bool]] = []
    for groupe in regroupements:
        noms = list(dict.fromkeys(groupe))
        if len(noms) < 2 or any(nom in equipes_groupees for nom in noms):
            raise ValueError("Un regroupement doit contenir au moins deux équipes distinctes, utilisées une seule fois")
        equipes_groupees.update(noms)
        membres = [ligne for ligne in lignes if ligne.equipe_libelle in noms]
        if membres:
            resultat.append((" + ".join(noms), membres, True))
    autres = [ligne for ligne in lignes if ligne.equipe_libelle not in equipes_groupees]
    resultat.extend((nom, membres, False) for nom, membres in repartir_sections(autres, equipes_selectionnees))
    return resultat
