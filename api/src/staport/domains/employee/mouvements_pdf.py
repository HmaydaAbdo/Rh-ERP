"""PDF des mouvements d'un mois : sortants, entrants ou les deux, regroupés par chantier.

Première page : cartes KPI. Ensuite un chapitre par chantier (codes dans l'ordre naturel des nombres : C57, C108, C205),
avec un tableau de sortants et un tableau d'entrants. Les filtres sont ceux de l'écran (`mouvements.correspond`) ;
montants, jours et observation n'apparaissent qu'avec le droit `PAIE_READ`. Tout texte issu des données passe par
`html.escape`.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from html import escape
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.montant import formater_nombre
from staport.domains.common.pdf import css_paysage, entete_paysage, pied_edition, rendre_pdf
from staport.domains.paie import report as _rapport_paie
from staport.domains.paie.periode import afficher_periode, mois_en_toutes_lettres

from .mouvements import effectif_paye
from .schemas import (
    EmployeeEntrantReponse,
    EmployeeEntrantsMoisReponse,
    EmployeeEntrantsRecherche,
    EmployeeMouvementsRecherche,
    EmployeeSortieReponse,
    EmployeeSortiesMoisReponse,
    EmployeeSortiesRecherche,
    TypeEntree,
)
from .service import ServiceEmployee

RESSOURCES = Path(__file__).with_name("report")
RESSOURCES_PAIE = Path(_rapport_paie.__file__).with_name("report")
SANS_CHANTIER = "Sans chantier"
MOINS = chr(0x2212)  # signe moins typographique
LIBELLE_TYPE = {TypeEntree.NOUVELLE_EMBAUCHE: "Nouvelle embauche", TypeEntree.RETOUR: "Retour"}


@dataclass(frozen=True)
class Mouvements:
    periode: int
    sorties: EmployeeSortiesMoisReponse | None
    entrants: EmployeeEntrantsMoisReponse | None
    effectif: int | None
    filtres: Sequence[tuple[str, str]]
    avec_paie: bool


def _nombre(valeur: Decimal | int | None) -> str:
    return formater_nombre(None if valeur is None else Decimal(valeur))


def _date(valeur: date | None) -> str:
    return "—" if valeur is None else f"{valeur:%d/%m/%Y}"


def _texte(valeur: str | None) -> str:
    return valeur if valeur else "—"


def _pluriel(n: int, singulier: str, pluriel: str) -> str:
    return f"{n} {pluriel if n > 1 else singulier}"


def anciennete(mois: int | None) -> str:
    """`14` -> « 1 an 2 mois », `5` -> « 5 mois » : l'ancienneté au mois du départ."""
    if mois is None:
        return "—"
    annees, reste = divmod(mois, 12)
    parties: list[str] = []
    if annees:
        parties.append(f"{annees} an{'s' if annees > 1 else ''}")
    if reste or not annees:
        parties.append(f"{reste} mois")
    return " ".join(parties)


def libelle_motif(motif: str) -> str:
    return "Non précisé" if motif == "NON_PRECISE" else motif


def cle_chantier(code: str | None) -> tuple[bool, list[int | str]]:
    """Ordre naturel des codes (C57 avant C108) ; le groupe « sans chantier » ferme la liste."""
    return (code is None, [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", code or "")])


def _td(texte: str, classe: str = "") -> str:
    return f'<td class="{classe}">{escape(texte)}</td>' if classe else f"<td>{escape(texte)}</td>"


def _carte(libelle: str, valeur: str, detail: str = "") -> str:
    complement = f'<span class="detail">{escape(detail)}</span>' if detail else ""
    return (
        f'<div class="kpi"><span class="lib">{escape(libelle)}</span>'
        f'<span class="val">{escape(valeur)}</span>{complement}</div>'
    )


def _signe(n: int) -> str:
    return f"+{n}" if n > 0 else str(n).replace("-", MOINS)


Groupe = tuple[str | None, list[EmployeeSortieReponse], list[EmployeeEntrantReponse]]


def _chantiers(m: Mouvements) -> dict[str | None, Groupe]:
    """Code du chantier -> (désignation, sortants, entrants) ; les sortants sans bulletin forment « sans chantier »."""
    groupes: dict[str | None, Groupe] = {}
    for sortie in m.sorties.sorties if m.sorties else []:
        groupes.setdefault(sortie.chantier, (sortie.chantier_designation, [], []))[1].append(sortie)
    for entrant in m.entrants.entrants if m.entrants else []:
        groupes.setdefault(entrant.chantier, (entrant.chantier_designation, [], []))[2].append(entrant)
    return dict(sorted(groupes.items(), key=lambda item: cle_chantier(item[0])))


def _somme(valeurs: Sequence[Decimal | None]) -> Decimal | None:
    presentes = [v for v in valeurs if v is not None]
    return sum(presentes, Decimal(0)) if presentes else None


def indicateurs(m: Mouvements) -> list[str]:
    """Les cartes KPI du premier écran, selon les sections demandées."""
    sorties = m.sorties.sorties if m.sorties else []
    entrants = m.entrants.entrants if m.entrants else []
    comparable = m.entrants is None or m.entrants.comparable
    chantiers = len({x.chantier for x in (*sorties, *entrants)})
    masse_sorties = _somme([s.montant_dernier_bulletin for s in sorties]) if m.avec_paie else None
    masse_entrees = _somme([e.montant_bulletin for e in entrants]) if m.avec_paie else None
    cartes: list[str] = []
    if m.sorties is not None and m.entrants is not None:
        solde = _signe(len(entrants) - len(sorties)) if comparable else "—"
        cartes += [
            _carte("Entrants", str(len(entrants)) if comparable else "—", "payés ce mois, pas le mois d'avant"),
            _carte("Sortants", str(len(sorties)), "départs enregistrés"),
            _carte("Solde net", solde, "entrants moins sortants"),
            _carte("Effectif payé", _nombre(m.effectif), "salariés du périmètre ce mois-ci"),
            _carte("Chantiers concernés", str(chantiers)),
        ]
        if m.avec_paie:
            cartes += [
                _carte("Masse entrante (DH)", _nombre(masse_entrees), "bulletins des entrants"),
                _carte("Masse sortante (DH)", _nombre(masse_sorties), "derniers bulletins des sortants"),
            ]
    elif m.sorties is not None:
        stc = sum(1 for s in sorties if s.motif == "STC")
        autres: dict[str, int] = {}
        for s in sorties:
            if s.motif != "STC":
                autres[s.motif] = autres.get(s.motif, 0) + 1
        moyenne = [s.anciennete_mois for s in sorties if s.anciennete_mois is not None]
        cartes += [
            _carte("Départs du mois", str(len(sorties))),
            _carte("STC", str(stc), f"{round(stc * 100 / len(sorties)) if sorties else 0} % des départs"),
            _carte(
                "Autres sorties",
                str(len(sorties) - stc),
                ", ".join(f"{libelle_motif(k)} : {v}" for k, v in sorted(autres.items())) or "Aucun autre motif",
            ),
            _carte("Chantiers concernés", str(chantiers)),
        ]
        if m.avec_paie:
            cartes.append(_carte("Derniers bulletins (DH)", _nombre(masse_sorties), "somme des départs du mois"))
        if moyenne:
            cartes.append(_carte("Ancienneté moyenne", anciennete(round(sum(moyenne) / len(moyenne))), "au départ"))
    elif m.entrants is not None:
        nouvelles = m.entrants.nouvelles_embauches
        cartes += [
            _carte("Entrants du mois", str(len(entrants)) if comparable else "—", "payés ce mois, pas le mois d'avant"),
            _carte("Nouvelles embauches", str(nouvelles) if comparable else "—", "aucun bulletin avant"),
            _carte("Retours", str(m.entrants.retours) if comparable else "—", "déjà payés auparavant"),
            _carte("Chantiers concernés", str(chantiers)),
        ]
        if m.avec_paie:
            cartes.append(_carte("Bulletins du mois (DH)", _nombre(masse_entrees), "somme des entrants"))
    return cartes


def _table(colonnes: Sequence[tuple[str, str]], lignes: Sequence[Sequence[str]], total: Sequence[str]) -> str:
    entete = "".join(f'<th class="{c}">{escape(n)}</th>' if c else f"<th>{escape(n)}</th>" for n, c in colonnes)
    corps = "".join(
        "<tr>" + "".join(_td(v, c) for v, (_, c) in zip(ligne, colonnes, strict=True)) + "</tr>" for ligne in lignes
    )
    pied = "".join(_td(v, c) for v, (_, c) in zip(total, colonnes, strict=True))
    return (
        f'<table class="mv"><thead><tr>{entete}</tr></thead><tbody>{corps}<tr class="total">{pied}</tr></tbody></table>'
    )


def _tableau_sortants(sortants: Sequence[EmployeeSortieReponse], avec_paie: bool) -> str:
    colonnes = [
        ("Nom et prénom", ""),
        ("CIN", ""),
        ("Fonction", ""),
        ("Équipe", ""),
        ("Motif", ""),
        ("Embauche", ""),
        ("Ancienneté", ""),
        ("Dernier bulletin", ""),
    ]
    lignes = [
        [
            s.nom_prenom,
            s.cin,
            _texte(s.fonction),
            _texte(s.equipe),
            libelle_motif(s.motif),
            _date(s.date_embauche),
            anciennete(s.anciennete_mois),
            afficher_periode(s.derniere_paie) if s.derniere_paie else "—",
        ]
        for s in sortants
    ]
    total = ["Total · " + _pluriel(len(sortants), "sortant", "sortants")] + [""] * 7
    if avec_paie:
        colonnes += [("Jours", "num"), ("Montant (DH)", "num"), ("Observation", "")]
        for ligne, s in zip(lignes, sortants, strict=True):
            ligne += [_nombre(s.jours_travailles), _nombre(s.montant_dernier_bulletin), _texte(s.observation)]
        total += ["", _nombre(_somme([s.montant_dernier_bulletin for s in sortants])), ""]
    return _table(colonnes, lignes, total)


def _tableau_entrants(entrants: Sequence[EmployeeEntrantReponse], avec_paie: bool) -> str:
    colonnes = [
        ("Nom et prénom", ""),
        ("CIN", ""),
        ("Fonction", ""),
        ("Équipe", ""),
        ("Type", ""),
        ("Embauche", ""),
        ("Venant de", ""),
    ]
    lignes = [
        [
            e.nom_prenom,
            e.cin,
            e.fonction,
            _texte(e.equipe),
            LIBELLE_TYPE[e.type],
            _date(e.date_embauche),
            _texte(e.chantier_precedent),
        ]
        for e in entrants
    ]
    total = ["Total · " + _pluriel(len(entrants), "entrant", "entrants")] + [""] * 6
    if avec_paie:
        colonnes += [("Jours", "num"), ("Montant (DH)", "num"), ("Observation", "")]
        for ligne, e in zip(lignes, entrants, strict=True):
            ligne += [_nombre(e.jours_travailles), _nombre(e.montant_bulletin), _texte(e.observation)]
        total += ["", _nombre(_somme([e.montant_bulletin for e in entrants])), ""]
    return _table(colonnes, lignes, total)


def _section_chantier(
    code: str | None,
    designation: str | None,
    sortants: Sequence[EmployeeSortieReponse],
    entrants: Sequence[EmployeeEntrantReponse],
    m: Mouvements,
) -> str:
    titre = " — ".join(x for x in (code, designation) if x) or SANS_CHANTIER
    compte: list[str] = []
    if m.sorties is not None:
        compte.append(_pluriel(len(sortants), "sortant", "sortants"))
    if m.entrants is not None:
        compte.append(_pluriel(len(entrants), "entrant", "entrants"))
    resume = escape(" · ".join(compte))
    corps: list[str] = [f'<h2>{escape(titre)} <span class="compte">· {resume}</span></h2>']
    if m.sorties is not None:
        corps.append("<h3>Sortants</h3>")
        vide = '<p class="vide">Aucun sortant sur ce chantier.</p>'
        corps.append(_tableau_sortants(sortants, m.avec_paie) if sortants else vide)
    if m.entrants is not None:
        corps.append("<h3>Entrants</h3>")
        vide = '<p class="vide">Aucun entrant sur ce chantier.</p>'
        corps.append(_tableau_entrants(entrants, m.avec_paie) if entrants else vide)
    tient = " tient" if len(sortants) + len(entrants) <= 10 else ""
    return f'<section class="chantier{tient}">{"".join(corps)}</section>'


def titre(m: Mouvements) -> str:
    nom = "Mouvements" if m.sorties is not None and m.entrants is not None else "Sortants" if m.sorties else "Entrants"
    return f"{nom} — {mois_en_toutes_lettres(m.periode)}"


def contexte(m: Mouvements) -> str:
    morceaux: list[str] = []
    if m.sorties is not None:
        morceaux.append(_pluriel(m.sorties.nombre, "sortant", "sortants"))
    if m.entrants is not None and m.entrants.comparable:
        morceaux.append(_pluriel(m.entrants.nombre, "entrant", "entrants"))
    morceaux.append(_pluriel(len(_chantiers(m)), "chantier", "chantiers"))
    return " · ".join(morceaux)


def construire_html(m: Mouvements, maintenant: datetime) -> str:
    css = css_paysage() + (RESSOURCES / "mouvements.css").read_text(encoding="utf-8")
    corps = [
        entete_paysage(titre(m), contexte(m), m.filtres),
        pied_edition(maintenant),
        f'<section class="kpis">{"".join(indicateurs(m))}</section>',
    ]
    if m.entrants is not None and not m.entrants.comparable:
        corps.append(
            '<p class="note">Entrants indisponibles : ce mois ou le mois civil précédent n\'a aucun bulletin de paie, '
            "on ne peut pas dire qui entre.</p>"
        )
    groupes = _chantiers(m)
    if not groupes:
        corps.append('<p class="note">Aucun mouvement pour ce périmètre.</p>')
    for code, (designation, sortants, entrants) in groupes.items():
        corps.append(_section_chantier(code, designation, sortants, entrants, m))
    return (
        f'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>{escape(titre(m))}</title>'
        f"<style>{css}</style></head><body>{''.join(corps)}</body></html>"
    )


def filtres_appliques(
    c: EmployeeMouvementsRecherche, motifs: Sequence[str] | None, types: Sequence[TypeEntree] | None
) -> list[tuple[str, str]]:
    """Le mois et uniquement les filtres réellement appliqués, un par ligne du bandeau."""
    resultat = [("Mois", afficher_periode(c.periode))]
    if c.nom_prenom and c.nom_prenom.strip():
        resultat.append(("Nom", c.nom_prenom.strip()))
    if c.cin and c.cin.strip():
        resultat.append(("CIN", c.cin.strip()))
    if c.chantier_ids:
        resultat.append(("Chantiers", _pluriel(len(c.chantier_ids), "chantier", "chantiers")))
    if c.equipe_ids:
        sans = c.equipe_ids == [0]
        resultat.append(("Équipes", "Sans équipe" if sans else _pluriel(len(c.equipe_ids), "équipe", "équipes")))
    if c.fonction_ids:
        resultat.append(("Fonctions", _pluriel(len(c.fonction_ids), "fonction", "fonctions")))
    if motifs:
        resultat.append(("Motifs", ", ".join(libelle_motif(m) for m in motifs)))
    if types:
        resultat.append(("Types", ", ".join(LIBELLE_TYPE[t] for t in types)))
    return resultat


class ServiceMouvementsPdf:
    """Compose le rapport à partir des mêmes lectures que l'écran, puis le rend en PDF."""

    def __init__(self, employees: ServiceEmployee) -> None:
        self._employees = employees

    async def generer(
        self,
        s: AsyncSession,
        *,
        sorties: EmployeeSortiesRecherche | None = None,
        entrants: EmployeeEntrantsRecherche | None = None,
        avec_paie: bool,
    ) -> bytes:
        base = sorties or entrants
        if base is None:
            raise ValueError("au moins une section (sortants ou entrants) est demandée")
        lus_sorties = (
            await self._employees.sorties_mois(s, sorties.periode, avec_paie=avec_paie, filtres=sorties)
            if sorties
            else None
        )
        lus_entrants = (
            await self._employees.entrants_mois(s, entrants.periode, avec_paie=avec_paie, filtres=entrants)
            if entrants
            else None
        )
        effectif = await effectif_paye(s, base.periode, base) if sorties and entrants else None
        mouvements = Mouvements(
            periode=base.periode,
            sorties=lus_sorties,
            entrants=lus_entrants,
            effectif=effectif,
            filtres=filtres_appliques(base, sorties.motifs if sorties else None, entrants.types if entrants else None),
            avec_paie=avec_paie,
        )
        return await rendre_pdf(construire_html(mouvements, datetime.now()), RESSOURCES_PAIE)
