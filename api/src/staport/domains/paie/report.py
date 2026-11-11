import re
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from html import escape
from io import BytesIO
from math import ceil
from pathlib import Path
from typing import cast

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur
from staport.domains.common.pdf import rendre_pdf
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .exceptions import AucunePaiePeriode
from .materiel import tableaux_materiel
from .models import Paie
from .rapport_calcul import BulletinRapport, mesurer, regrouper_sections
from .rapport_texte import (
    decouper,
    decouper_lignes,
    hauteur_ligne_employe,
)
from .rapport_texte import (
    lignes as compter_lignes,
)
from .schemas import PaieRapportRequete


@dataclass(frozen=True)
class PointEvolution:
    periode: int
    masse: Decimal
    effectif: int
    stc: int
    montant_stc: Decimal
    # Salariés payés ce mois-là dans le périmètre : sert à compter les entrants
    # (payés ce mois-ci mais pas le mois civil d'avant).
    membres: frozenset[int] = frozenset()
    entrees: int | None = None


@dataclass(frozen=True)
class PointRepartition:
    libelle: str
    masse: Decimal
    bulletins: int
    stc: int
    montant_stc: Decimal


class ServiceRapportPaie:
    """Premier pipeline PDF natif Python, avec CSS et polices du rapport Spring embarqués."""

    LARGEUR_NIVEAU_ENTETE = 436

    def __init__(self, audit: Auditeur) -> None:
        self._audit = audit
        self._ressources = Path(__file__).with_name("report")

    async def generer(self, session: AsyncSession, requete: PaieRapportRequete) -> BytesIO:
        periode_precedente = _periode_precedente(requete.periode)
        conditions = _conditions([requete.periode, periode_precedente], requete)
        q = (
            select(Paie, Employee, Chantier, Equipe, Fonction)
            .join(Employee, Employee.id == Paie.employee_id)
            .join(Chantier, Chantier.id == Paie.chantier_id)
            .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
            .join(Fonction, Fonction.id == Paie.fonction_id)
            .where(*conditions)
            .order_by(Fonction.libelle, Employee.nom_prenom)
        )
        conditions_evolution = _conditions(_periodes_recentes(requete.periode, 13), requete)
        est_stc = func.lower(func.btrim(Paie.observation, " \t\n\r\f\v")).in_(["stc", "sortie"])
        q_evolution_chantier = (
            select(
                Paie.chantier_id,
                Paie.equipe_id,
                Paie.periode,
                func.coalesce(func.sum(Paie.salaire_total), Decimal(0)),
                func.count(Paie.id),
                func.coalesce(func.sum(case((est_stc, 1), else_=0)), 0),
                func.coalesce(func.sum(case((est_stc, Paie.salaire_total), else_=Decimal(0))), Decimal(0)),
                func.array_agg(Paie.employee_id),
            )
            .join(Employee, Employee.id == Paie.employee_id)
            .where(*conditions_evolution)
            .group_by(Paie.chantier_id, Paie.equipe_id, Paie.periode)
            .order_by(Paie.chantier_id, Paie.equipe_id, Paie.periode)
        )
        async with session.begin():
            lignes = cast(
                list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
                [tuple(row) for row in (await session.execute(q)).all()],
            )
            evolution_chantiers_brute = cast(
                list[tuple[int, int | None, int, Decimal, int, int, Decimal, list[int]]],
                [tuple(row) for row in (await session.execute(q_evolution_chantier)).all()],
            )
        lignes_courantes = [ligne for ligne in lignes if ligne[0].periode == int(requete.periode.replace("-", ""))]
        lignes_precedentes = [ligne for ligne in lignes if ligne[0].periode == int(periode_precedente.replace("-", ""))]
        if not lignes_courantes:
            raise AucunePaiePeriode(requete.periode)
        cumul_global: dict[int, PointEvolution] = {}
        cumul_chantiers: dict[tuple[int, int], PointEvolution] = {}
        evolution_chantiers: dict[int, list[PointEvolution]] = {}
        evolution_equipes: dict[tuple[int, int], list[PointEvolution]] = {}
        for chantier_id, equipe_id, periode, masse, effectif, stc, montant_stc, employes in evolution_chantiers_brute:
            point = PointEvolution(periode, masse, effectif, stc, montant_stc, frozenset(employes))
            if equipe_id is not None:
                evolution_equipes.setdefault((chantier_id, equipe_id), []).append(point)
            cle_chantier = chantier_id, periode
            cumul_chantiers[cle_chantier] = _additionner_points(cumul_chantiers.get(cle_chantier), point)
            cumul_global[periode] = _additionner_points(cumul_global.get(periode), point)
        for (chantier_id, _periode), point in sorted(cumul_chantiers.items()):
            evolution_chantiers.setdefault(chantier_id, []).append(point)
        evolution = [cumul_global[periode] for periode in sorted(cumul_global)]
        html = self._html(
            requete,
            lignes_courantes,
            lignes_precedentes,
            evolution,
            evolution_chantiers,
            evolution_equipes,
            _FenetreEvolution(set(cumul_global), set(_periodes_recentes(requete.periode, 12))),
        )
        return BytesIO(await rendre_pdf(html, self._ressources))

    def _html(
        self,
        requete: PaieRapportRequete,
        lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
        lignes_precedentes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]] | None = None,
        evolution: list[PointEvolution] | None = None,
        evolution_chantiers: dict[int, list[PointEvolution]] | None = None,
        evolution_equipes: dict[tuple[int, int], list[PointEvolution]] | None = None,
        fenetre: _FenetreEvolution | None = None,
    ) -> str:
        css = (self._ressources / "rapport.css").read_text(encoding="utf-8")
        par_chantier: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]] = {}
        for ligne in lignes:
            par_chantier.setdefault(ligne[2].code, []).append(ligne)
        mois = date.fromisoformat(requete.periode + "-01").month
        noms_mois = (
            "janvier",
            "février",
            "mars",
            "avril",
            "mai",
            "juin",
            "juillet",
            "août",
            "septembre",
            "octobre",
            "novembre",
            "décembre",
        )
        corps = [
            '<div class="page cover"><img class="logo-couverture" src="logo-staport.png">',
            '<div class="titre">RAPPORT DE PAIE</div><div class="filet-titre"></div>',
            _identite("DÉPARTEMENT", "Ressources Humaines"),
            _identite("MOIS", noms_mois[mois - 1].capitalize()),
            _identite("ANNÉE", requete.periode[:4]),
            '<div class="signatures">',
            _signature("PRÉSIDENT DIRECTEUR GÉNÉRAL", "BARHICH MOHAMED"),
            _signature("DIRECTEUR GÉNÉRAL ADJOINT", "TROUSSI MOHAMED EL MEHDI"),
            _signature("DIRECTEUR DES RESSOURCES HUMAINES", "MOUSTAJID ISMAIL"),
            _signature("DIRECTEUR DES TRAVAUX", "BRAHIM SOUKRAT", derniere=True),
            '</div><div class="tagline">STAPORT S.A — Société de travaux '
            "d'assainissement, ponts et routes</div></div>",
        ]
        pages: list[tuple[str, str]] = []
        filtres = _filtres_actifs(requete, lignes)
        if filtres:
            lignes_perimetre = [ligne for filtre in filtres for ligne in decouper(filtre, 802, 10.5)]
            lignes_par_page = int((495 - 24 - 8) / 14)
            for debut in range(0, len(lignes_perimetre), lignes_par_page):
                titre_perimetre = "Périmètre du rapport" if debut == 0 else "Périmètre du rapport (suite)"
                contenu = f'<div class="titre-chapitre">{titre_perimetre}</div>' + "".join(
                    f'<div class="perimetre-ligne">{escape(ligne)}</div>'
                    for ligne in lignes_perimetre[debut : debut + lignes_par_page]
                )
                pages.append(("PÉRIMÈTRE", contenu))
        if not requete.sans_vue_ensemble:
            cartes = _cartes_kpi(lignes, lignes_precedentes or [])
            pages.append(
                (
                    "GLOBAL",
                    f'<div class="titre-chapitre">I — Vue d\'ensemble</div>{cartes}'
                    + _rubrique(1, TITRE_EVOLUTION)
                    + _tableau_evolution(_avec_entrees(evolution or [], fenetre)),
                )
            )
            tableaux_globaux = _tableaux_repartition_chantiers(par_chantier)
            for index_graphique, (tableau, _hauteur) in enumerate(tableaux_globaux):
                titre_repartition = (
                    "Répartition par chantier" if index_graphique == 0 else "Répartition par chantier (suite)"
                )
                pages.append(
                    (
                        "GLOBAL",
                        _rubrique(2, titre_repartition) + tableau,
                    )
                )
        chantiers_ordonnes = sorted(par_chantier.items(), key=lambda item: _cle_code(item[0]))
        chapitres_fixes = 0 if requete.sans_vue_ensemble else 1
        for rang_chantier, (code, lignes_chantier) in enumerate(chantiers_ordonnes, start=chapitres_fixes + 1):
            chantier = lignes_chantier[0][2]
            identifiant = f"{chantier.nom} ({code})" if chantier.nom else code
            titre_chantier = f"{_romain(rang_chantier)} — CHANTIER : {identifiant}"
            lignes_chantier_precedentes = [ligne for ligne in lignes_precedentes or [] if ligne[2].code == code]
            choix = set((requete.equipes_par_chantier or {}).get(code, []))
            regroupements = (requete.regroupements_equipes_par_chantier or {}).get(code, [])
            bloc_chantier = (
                f'<div class="titre-chapitre">{escape(titre_chantier)}</div>'
                f"{_cartes_kpi(lignes_chantier, lignes_chantier_precedentes, inclure_chantiers=False)}"
                + _rubrique(1, TITRE_EVOLUTION)
                + _tableau_evolution(_avec_entrees((evolution_chantiers or {}).get(chantier.id, []), fenetre))
            )
            if choix or regroupements:
                pages.append((f"CHANTIER : {identifiant}", bloc_chantier))
                pages.append(
                    (
                        f"CHANTIER : {identifiant}",
                        _rubrique(2, "Répartition par équipe") + _tableau_equipes(lignes_chantier)[0],
                    )
                )
            else:
                pages.append((f"CHANTIER : {identifiant}", bloc_chantier))
                for index_graphique, (tableau, _hauteur) in enumerate(_tableaux_fonctions(lignes_chantier)):
                    titre_repartition = (
                        "Répartition par fonction" if index_graphique == 0 else "Répartition par fonction (suite)"
                    )
                    pages.append(
                        (
                            f"CHANTIER : {identifiant}",
                            _rubrique(2, titre_repartition) + tableau,
                        )
                    )
            sections = regrouper_sections([_LigneDetail(*ligne) for ligne in lignes_chantier], choix, regroupements)
            for index_section, (libelle, section, est_regroupe) in enumerate(sections):
                titre = f"ÉQUIPE : {libelle.upper()}" if libelle else f"CHANTIER : {identifiant}"
                niveau_section = (
                    f"CHANTIER : {identifiant} · ÉQUIPE : {libelle}" if libelle else f"CHANTIER : {identifiant}"
                )
                avec_equipe = libelle is None or est_regroupe
                equipe_choisie = libelle is not None and not est_regroupe and libelle in choix
                hauteur_derniere_analyse: float | None = None
                materiel: tuple[str, float] | None = None
                if libelle is not None:
                    identifiants_equipes = {detail.valeurs[0].equipe_id for detail in section}
                    lignes_section_precedentes = [
                        ligne
                        for ligne in lignes_chantier_precedentes
                        if getattr(ligne[0], "equipe_id", None) in identifiants_equipes
                    ]
                    points_section: dict[int, PointEvolution] = {}
                    for equipe_id in identifiants_equipes:
                        if equipe_id is not None:
                            for point in (evolution_equipes or {}).get((chantier.id, equipe_id), []):
                                points_section[point.periode] = _additionner_points(
                                    points_section.get(point.periode), point
                                )
                    evolutions_section = _avec_entrees([points_section[p] for p in sorted(points_section)], fenetre)
                    pages.append(
                        (
                            niveau_section,
                            f'<div class="titre-chapitre">{escape(titre)}</div>'
                            + _cartes_kpi(
                                [detail.valeurs for detail in section],
                                lignes_section_precedentes,
                                inclure_chantiers=False,
                            )
                            + _rubrique(1, TITRE_EVOLUTION)
                            + _tableau_evolution(evolutions_section),
                        )
                    )
                    tableaux_fonctions = _tableaux_fonctions([detail.valeurs for detail in section])
                    if not est_regroupe:
                        equipe_section = section[0].valeurs[3]
                        if equipe_section is not None:
                            materiel = _tableau_materiel(code, equipe_section.code, requete.materiel or {})
                    materiel_avec_fonctions = (
                        materiel is not None
                        and len(tableaux_fonctions) == 1
                        and tableaux_fonctions[0][1] + materiel[1] + 36 <= 487
                    )
                    for index_graphique, (tableau, hauteur_tableau) in enumerate(tableaux_fonctions):
                        titre_repartition = (
                            "Répartition par fonction" if index_graphique == 0 else "Répartition par fonction (suite)"
                        )
                        contenu_graphique = _rubrique(2, titre_repartition) + tableau
                        hauteur_derniere_analyse = 18 + hauteur_tableau + 8
                        if materiel is not None and materiel_avec_fonctions:
                            contenu_graphique += materiel[0]
                            hauteur_derniere_analyse += 18 + materiel[1] + 8
                        pages.append((niveau_section, contenu_graphique))
                    if materiel is not None and not materiel_avec_fonctions:
                        hauteur_derniere_analyse = 18 + materiel[1] + 8
                        pages.append((niveau_section, materiel[0]))
                pages_recap = _recaps_fonctions([detail.valeurs for detail in section])
                if libelle is None and choix and pages_recap:
                    # Les employés hors des équipes choisies forment un groupe qui a ses propres indicateurs, en tête
                    # de sa première page de récap (`ajouterPagesEquipe` avec `fusionneeAuChantier` faux).
                    identifiants_reste = {detail.valeurs[0].equipe_id for detail in section}
                    precedentes_reste = [
                        ligne
                        for ligne in lignes_chantier_precedentes
                        if getattr(ligne[0], "equipe_id", None) in identifiants_reste
                    ]
                    tete_reste = f'<div class="titre-chapitre">{escape(titre)}</div>' + _cartes_kpi(
                        [detail.valeurs for detail in section], precedentes_reste, inclure_chantiers=False
                    )
                    html_recap, hauteur_recap = pages_recap[0]
                    # Titre d'équipe (20 pt) + titre des cartes (16 pt) + cartes (54 pt au minimum).
                    pages_recap[0] = (tete_reste + html_recap, hauteur_recap + 20 + 16 + 54)
                lignes_html: list[str] = []
                hauteurs: list[float] = []
                for detail in section:
                    paie, employe, _chantier_ligne, equipe, fonction = detail.valeurs
                    valeurs = [
                        employe.nom_prenom,
                        fonction.libelle,
                        employe.cin,
                        _quantite(paie.nombre_jours_travailles),
                        _quantite(paie.jours_recuperation_ouvrable),
                        _quantite(paie.jours_recuperation_dimanche),
                        _montant(paie.salaire_mensuel),
                        _montant(paie.prime_roulage_ordinaire),
                        _montant(paie.prime_roulage_dimanche),
                        _montant(paie.salaire_total),
                        paie.observation or "",
                        equipe.libelle if equipe and avec_equipe else "",
                    ]
                    if not avec_equipe:
                        valeurs.pop()
                    classes = (
                        "nom-prenom",
                        "fonction",
                        "cin",
                        "jours-p",
                        "jours-jro",
                        "jours-jrd",
                        "salaire",
                        "salaire-ro",
                        "salaire-rd",
                        "total",
                        "obs",
                        "equipe",
                    )
                    hauteurs.append(hauteur_ligne_employe(valeurs, avec_equipe=avec_equipe))
                    lignes_html.append(
                        "<tr>"
                        + "".join(
                            f'<td class="{classe}">{escape(str(valeur))}</td>'
                            for classe, valeur in zip(classes, valeurs, strict=False)
                        )
                        + "</tr>"
                    )
                if equipe_choisie and hauteurs:
                    # Équipe choisie dans l'assistant : pas de récap, la liste des employés rejoint la dernière page
                    # d'analyse si 3 lignes (ou toutes) y tiennent (`ajouterPagesEmployesEquipe` de Spring).
                    pages.extend(
                        _pages_employes_equipe(
                            pages,
                            niveau_section,
                            lignes_html,
                            hauteurs,
                            hauteur_derniere_analyse,
                            numero=4 if materiel else 3,
                            avec_equipe=avec_equipe,
                        )
                    )
                    continue
                # 495 pt utiles, moins la marge de sécurité et les blocs présents sur la page.
                # Mêmes hauteurs de base que RapportPageModelBuilder et rapport.css.
                titre_chantier_hauteur = 24 if index_section == 0 and libelle is not None else 0
                budget_initial_sans_recap = 495 - 8 - titre_chantier_hauteur - 18 - 40
                budget_initial_avec_recap = (
                    487 - titre_chantier_hauteur - 18 - 40 - pages_recap[-1][1] if pages_recap else 0
                )
                fusionner_recap_details = bool(hauteurs) and budget_initial_avec_recap >= hauteurs[0]
                budget_initial = budget_initial_avec_recap if fusionner_recap_details else budget_initial_sans_recap
                budget_suite = 495 - 8 - 8
                pages_details: list[tuple[str, str]] = []
                for index_page, tranche in enumerate(decouper_lignes(hauteurs, budget_initial, budget_suite)):
                    contenu_page: list[str] = []
                    if index_page == 0:
                        if index_section == 0 and libelle is not None:
                            contenu_page.append(f'<div class="titre-chapitre">{escape(titre_chantier)}</div>')
                        numero_rubrique_liste = 4 if materiel else 3
                        contenu_page.append(_rubrique(numero_rubrique_liste, "Liste des employés"))
                    contenu_page.append(_table_entete(avec_equipe=avec_equipe, avec_entete=index_page == 0))
                    contenu_page.extend(lignes_html[i] for i in tranche)
                    contenu_page.append("</tbody></table>")
                    pages_details.append((niveau_section, "".join(contenu_page)))
                if fusionner_recap_details and pages_details and pages_recap:
                    pages.extend((niveau_section, recap) for recap, _hauteur in pages_recap[:-1])
                    pages.append((niveau_section, pages_recap[-1][0] + pages_details[0][1]))
                    pages.extend(pages_details[1:])
                else:
                    pages.extend((niveau_section, recap) for recap, _hauteur in pages_recap)
                    pages.extend(pages_details)
        for numero, (niveau, contenu_html) in enumerate(pages, start=1):
            lignes_niveau = min(compter_lignes(niveau, self.LARGEUR_NIVEAU_ENTETE, 9, True), 4)
            niveau = escape(niveau)
            corps.append(
                '<div class="page"><div class="page-header"><img class="logo" src="logo-staport.png">'
                '<div class="separateur s1"></div><div class="bloc b1">Ressources Humaines</div>'
                '<div class="separateur s2"></div>'
                f'<div class="bloc b2">Paie {noms_mois[mois - 1].capitalize()} {escape(requete.periode[:4])}</div>'
                f'<div class="separateur s3"></div><div class="bloc bloc-niveau lignes-{lignes_niveau}">{niveau}</div>'
                f'<div class="filet"></div></div><div class="page-body">{contenu_html}</div>'
                f'<div class="page-footer"><div class="niveau">{niveau}</div>'
                f'<div class="pagination">Page {numero} / {len(pages)}</div></div></div>'
            )
        return (
            "<!doctype html><html><head><meta charset='utf-8'><style>"
            + css
            + "</style></head><body>"
            + "".join(corps)
            + "</body></html>"
        )


def _identite(label: str, valeur: str) -> str:
    return (
        '<div class="bloc-identite">'
        f'<div class="label">{escape(label)}</div><div class="valeur">{escape(valeur)}</div></div>'
    )


def _rubrique(numero: int, titre: str) -> str:
    return f'<div class="titre-section rubrique-titre">{numero}. {escape(titre)}</div>'


def _lignes_qui_tiennent(hauteurs: list[float], debut: int, disponible: float) -> int:
    cumul, nombre = 0.0, 0
    for hauteur in hauteurs[debut:]:
        cumul += hauteur
        if cumul > disponible:
            break
        nombre += 1
    return nombre


def _pages_employes_equipe(
    pages: list[tuple[str, str]],
    niveau: str,
    lignes: list[str],
    hauteurs: list[float],
    hauteur_analyse: float | None,
    *,
    numero: int,
    avec_equipe: bool,
) -> list[tuple[str, str]]:
    """Pages de la liste des employés d'une équipe choisie. La liste est ajoutée à la dernière page d'analyse (retirée
    de `pages`, puis renvoyée complétée) quand assez de lignes y tiennent ; le reste suit sur des pages de suite."""
    utile = 495 - 8
    sortie: list[tuple[str, str]] = []
    position = 0
    tient = _lignes_qui_tiennent(hauteurs, 0, utile - (hauteur_analyse or utile) - 18 - 40)
    if tient >= min(3, len(hauteurs)):
        niveau_analyse, analyse = pages.pop()
        liste = (
            _rubrique(numero, "Liste des employés")
            + _table_entete(avec_equipe=avec_equipe, avec_entete=True)
            + "".join(lignes[:tient])
            + "</tbody></table>"
        )
        sortie.append((niveau_analyse, analyse + liste))
        position = tient
    premiere = True
    while position < len(hauteurs):
        disponible = utile - 18 - 40 if premiere else utile
        fin = min(len(hauteurs), position + max(1, _lignes_qui_tiennent(hauteurs, position, disponible)))
        titre = (
            _rubrique(numero, "Liste des employés")
            if premiere
            else '<div class="titre-section">Liste des employés (suite)</div>'
        )
        sortie.append(
            (
                niveau,
                titre
                + _table_entete(avec_equipe=avec_equipe, avec_entete=premiere)
                + "".join(lignes[position:fin])
                + "</tbody></table>",
            )
        )
        position = fin
        premiere = False
    return sortie


def _romain(valeur: int) -> str:
    """Numérote les chapitres comme le rapport Spring (I à MMMCMXCIX)."""
    symboles = (
        (1000, "M"),
        (900, "CM"),
        (500, "D"),
        (400, "CD"),
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    )
    restant = valeur
    resultat: list[str] = []
    for nombre, symbole in symboles:
        repetitions, restant = divmod(restant, nombre)
        resultat.extend([symbole] * repetitions)
    return "".join(resultat)


def _tableaux_repartition_chantiers(
    par_chantier: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]],
) -> list[tuple[str, float]]:
    elements = [
        _point_repartition((lignes[0][2].nom or code).strip() or code, lignes) for code, lignes in par_chantier.items()
    ]
    elements.sort(key=lambda element: element.masse, reverse=True)
    return _tableaux_repartition(elements, "CHANTIER", maximum=16)


def _repartir_graphiques[T](elements: list[T], *, maximum: int) -> list[list[T]]:
    if not elements:
        return [[]]
    nombre_pages = (len(elements) + maximum - 1) // maximum
    taille_base, reste = divmod(len(elements), nombre_pages)
    tranches: list[list[T]] = []
    debut = 0
    for page in range(nombre_pages):
        taille = taille_base + int(page < reste)
        tranches.append(elements[debut : debut + taille])
        debut += taille
    return tranches


def _tableau_equipes(
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> tuple[str, float]:
    par_equipe: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]] = {}
    for ligne in lignes:
        equipe = ligne[3]
        libelle = equipe.libelle.strip() if equipe and equipe.libelle.strip() else "Sans équipe"
        par_equipe.setdefault(libelle, []).append(ligne)
    elements = [_point_repartition(libelle, groupe) for libelle, groupe in par_equipe.items()]
    elements.sort(key=lambda element: element.masse, reverse=True)
    if len(elements) > 15:
        autres = elements[15:]
        elements = [*elements[:15], _somme_points("Autres", autres)]
        elements.sort(key=lambda element: element.masse, reverse=True)
    return _tableaux_repartition(elements, "ÉQUIPE", maximum=len(elements) or 1)[0]


def _tableaux_fonctions(
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> list[tuple[str, float]]:
    par_fonction: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]] = {}
    for ligne in lignes:
        par_fonction.setdefault(ligne[4].libelle, []).append(ligne)
    elements = [_point_repartition(libelle, groupe) for libelle, groupe in par_fonction.items()]
    elements.sort(key=lambda element: (-element.masse, element.libelle.casefold()))
    return _tableaux_repartition(elements, "FONCTION", maximum=15)


def _somme_points(libelle: str, points: Sequence[PointRepartition]) -> PointRepartition:
    return PointRepartition(
        libelle,
        sum((point.masse for point in points), Decimal(0)),
        sum(point.bulletins for point in points),
        sum(point.stc for point in points),
        sum((point.montant_stc for point in points), Decimal(0)),
    )


_LARGEUR_LIBELLE_REPARTITION = 242  # colonne libellé (250 pt) moins les marges internes de la cellule


def _tableaux_repartition(elements: list[PointRepartition], colonne: str, *, maximum: int) -> list[tuple[str, float]]:
    """Répartition sous forme de tableau, paginée comme les anciens graphiques. Chaque page renvoie son HTML et sa
    hauteur en points ; la ligne Total (sur tous les éléments visibles) ferme la dernière page."""
    visibles = [element for element in elements if element.bulletins > 0]
    total = _somme_points("Total", visibles)
    tranches = _repartir_graphiques(visibles, maximum=maximum)
    pages: list[tuple[str, float]] = []
    for index, tranche in enumerate(tranches):
        derniere = index == len(tranches) - 1
        lignes_html: list[str] = []
        hauteur = 15.0
        for element in tranche:
            lignes_html.append(_ligne_repartition(element.libelle, element, gras=False))
            hauteur += max(15, compter_lignes(element.libelle, _LARGEUR_LIBELLE_REPARTITION, 9) * 11 + 1)
        if derniere:
            lignes_html.append(_ligne_repartition(total.libelle, total, gras=True))
            hauteur += 15
        pages.append(
            (
                '<table class="recap repartition"><col class="libelle"><col class="nombre"><col class="nombre">'
                '<col class="nombre"><col class="nombre"><thead><tr>'
                f"<th>{escape(colonne)}</th><th>MONTANT DE LA PAIE (DH)</th><th>BULLETINS</th>"
                "<th>SORTANTS</th><th>STC (DH)</th></tr></thead><tbody>" + "".join(lignes_html) + "</tbody></table>",
                hauteur,
            )
        )
    return pages


def _ligne_repartition(libelle: str, point: PointRepartition, *, gras: bool) -> str:
    classe = ' class="total"' if gras else ""
    return (
        f'<tr{classe}><td class="libelle">{escape(libelle)}</td>'
        f'<td class="nombre">{_montant(point.masse)}</td><td class="nombre">{_entier(point.bulletins)}</td>'
        f'<td class="nombre">{_entier(point.stc)}</td><td class="nombre">{_montant(point.montant_stc)}</td></tr>'
    )


def _point_repartition(
    libelle: str,
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> PointRepartition:
    bulletins = cast(list[BulletinRapport], [ligne[0] for ligne in lignes])
    mesures = mesurer(bulletins)
    return PointRepartition(libelle, mesures.masse, mesures.effectif, mesures.stc, mesures.montant_stc)


def _tableau_materiel(chantier_code: str, equipe_code: str, nombres: dict[str, int | None]) -> tuple[str, float] | None:
    """Parc matériel d'une équipe : rubrique 3 et tableau Matériel / Nombre, avec la hauteur du tableau en points.
    Absent tant qu'aucune quantité positive n'est saisie ; les lignes sans quantité sont omises."""
    tableau = next(
        (t for t in tableaux_materiel() if t.chantier_code == chantier_code and t.equipe_code == equipe_code), None
    )
    if tableau is None:
        return None
    elements = [(libelle, nombre) for libelle in tableau.libelles if (nombre := nombres.get(libelle)) is not None]
    if not any(nombre > 0 for _, nombre in elements):
        return None
    hauteur = 15.0
    lignes_html: list[str] = []
    for libelle, nombre in elements:
        lignes_html.append(
            f'<tr><td class="libelle">{escape(libelle)}</td><td class="nbre">{_entier(nombre)}</td></tr>'
        )
        hauteur += max(15, compter_lignes(libelle, 172, 9) * 11 + 1)
    return (
        _rubrique(3, f"Parc matériel — {tableau.titre}")
        + '<table class="recap materiel"><col class="libelle"><col class="nbre">'
        "<thead><tr><th>MATÉRIEL</th><th>NOMBRE</th></tr></thead><tbody>" + "".join(lignes_html) + "</tbody></table>",
        hauteur,
    )


def _recaps_fonctions(
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> list[tuple[str, float]]:
    par_fonction: dict[str, list[Paie]] = {}
    for paie, _, _, _, fonction in lignes:
        par_fonction.setdefault(fonction.libelle, []).append(paie)
    lignes_recaps: list[str] = []
    fonctions_triees = sorted(par_fonction.items(), key=lambda item: item[0].casefold())
    for fonction, bulletins in fonctions_triees:
        mesures = mesurer(cast(list[BulletinRapport], bulletins))
        lignes_recaps.append(
            f'<tr><td class="libelle">{escape(fonction)}</td>'
            f'<td class="effectif">{_entier(mesures.effectif)}</td>'
            f'<td class="stc-personnes">{_entier(mesures.stc)}</td>'
            f'<td class="stc-montant">{_montant(mesures.montant_stc)}</td></tr>'
        )
    tranches: list[tuple[list[str], float]] = []
    tranche: list[str] = []
    hauteur_tranche = 34
    for ligne, (fonction, _bulletins) in zip(lignes_recaps, fonctions_triees, strict=True):
        hauteur_ligne = max(15, compter_lignes(fonction, 151, 9) * 11 + 1)
        if tranche and hauteur_tranche + hauteur_ligne > 487:
            tranches.append((tranche, hauteur_tranche))
            tranche = []
            hauteur_tranche = 34
        tranche.append(ligne)
        hauteur_tranche += hauteur_ligne
    if tranche:
        tranches.append((tranche, hauteur_tranche))
    pages: list[tuple[str, float]] = []
    for index, (tranche, hauteur) in enumerate(tranches):
        titre = "Répartition par fonction" if index == 0 else "Répartition par fonction (suite)"
        pages.append(
            (
                f'<div class="recap-row" style="height: {hauteur}pt"><div class="recap-bloc derniere">'
                f'<div class="titre-recap">{titre}</div>'
                '<table class="recap fonction"><col class="libelle"><col class="effectif">'
                '<col class="stc-personnes"><col class="stc-montant">'
                "<thead><tr><th>FONCTION</th><th>BULLETINS</th>"
                "<th>SORTANTS</th><th>STC (DH)</th></tr></thead><tbody>"
                + "".join(tranche)
                + "</tbody></table></div></div>",
                hauteur,
            )
        )
    return pages


TITRE_EVOLUTION = "Évolution sur 12 mois"


def _cle_code(code: str) -> list[str | int]:
    """Tri « naturel » des codes de chantier : C57 avant C108, C108 avant C205 (le nombre compte, pas les lettres)."""
    return [int(morceau) if morceau.isdigit() else morceau.casefold() for morceau in re.split(r"(\d+)", code)]


def _tableau_evolution(points: list[PointEvolution]) -> str:
    """Évolution mensuelle sous forme de tableau : une colonne par mois réellement présent (12 au plus)."""
    if not points:
        return (
            '<div class="evolution-indisponible">'
            "Aucune donnée historique disponible pour le périmètre sélectionné."
            "</div>"
        )
    lignes: tuple[tuple[str, list[str]], ...] = (
        ("Montant de la paie (DH)", [_masse(point.masse) for point in points]),
        ("STC (DH)", [_masse(point.montant_stc) for point in points]),
        ("Bulletins de paie", [_entier(point.effectif) for point in points]),
        ("Sortants", [_entier(point.stc) for point in points]),
        ("Entrants", ["—" if point.entrees is None else _entier(point.entrees) for point in points]),
    )
    colonnes = '<col class="libelle">' + '<col class="mois">' * len(points)
    entete = "<th>MOIS</th>" + "".join(f"<th>{point.periode % 100}/{point.periode // 100}</th>" for point in points)
    corps = "".join(
        f'<tr><td class="libelle">{escape(libelle)}</td>'
        + "".join(f'<td class="mois">{valeur}</td>' for valeur in valeurs)
        + "</tr>"
        for libelle, valeurs in lignes
    )
    return f'<table class="recap evolution">{colonnes}<thead><tr>{entete}</tr></thead><tbody>{corps}</tbody></table>'


def _additionner_points(precedent: PointEvolution | None, point: PointEvolution) -> PointEvolution:
    if precedent is None:
        return point
    return PointEvolution(
        point.periode,
        precedent.masse + point.masse,
        precedent.effectif + point.effectif,
        precedent.stc + point.stc,
        precedent.montant_stc + point.montant_stc,
        precedent.membres | point.membres,
    )


@dataclass(frozen=True)
class _FenetreEvolution:
    """Mois avec de la paie (tous périmètres) et les 12 mois affichés ; le 13e ne sert qu'à compter les entrants."""

    mois_avec_paie: set[int]
    affiches: set[int]


def _mois_civil_precedent(periode: int) -> int:
    annee, mois = divmod(periode, 100)
    return (annee - 1) * 100 + 12 if mois == 1 else periode - 1


def _avec_entrees(points: list[PointEvolution], fenetre: _FenetreEvolution | None) -> list[PointEvolution]:
    """Ajoute les entrants de chaque mois : salariés du périmètre payés ce mois-ci mais pas le mois civil d'avant.

    Inconnu (`None`, affiché « — ») quand le mois civil d'avant n'a aucune paie : on ne peut pas dire qui entre.
    Le même calcul vaut pour le global, un chantier ou une section d'équipes réunies : il part des salariés.
    """
    if fenetre is None:
        return points
    par_periode = {point.periode: point for point in points}
    resultat: list[PointEvolution] = []
    for point in sorted(points, key=lambda p: p.periode):
        if point.periode not in fenetre.affiches:
            continue
        avant = _mois_civil_precedent(point.periode)
        if avant not in fenetre.mois_avec_paie:
            entrees = None
        else:
            precedent = par_periode.get(avant)
            entrees = len(point.membres - (precedent.membres if precedent else frozenset()))
        resultat.append(replace(point, entrees=entrees))
    return resultat


def _conditions(periodes: Sequence[str | int], requete: PaieRapportRequete) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [
        Paie.periode.in_(
            [int(periode.replace("-", "")) if isinstance(periode, str) else periode for periode in periodes]
        )
    ]
    if requete.nom_prenom:
        conditions.append(Employee.nom_prenom.icontains(requete.nom_prenom, autoescape=True))
    if requete.cin:
        conditions.append(Employee.cin.icontains(requete.cin, autoescape=True))
    if requete.fonction_id is not None:
        conditions.append(Paie.fonction_id == requete.fonction_id)
    if requete.chantier_ids:
        conditions.append(Paie.chantier_id.in_(requete.chantier_ids))
    elif requete.chantier_id is not None:
        conditions.append(Paie.chantier_id == requete.chantier_id)
    return conditions


def _periodes_recentes(periode: str, nombre: int) -> list[int]:
    annee, mois = (int(partie) for partie in periode.split("-"))
    periodes: list[int] = []
    for _ in range(nombre):
        periodes.append(annee * 100 + mois)
        annee, mois = (annee - 1, 12) if mois == 1 else (annee, mois - 1)
    return periodes


def _periode_precedente(periode: str) -> str:
    annee, mois = (int(partie) for partie in periode.split("-"))
    return f"{annee - 1}-12" if mois == 1 else f"{annee}-{mois - 1:02}"


def _cartes_kpi(
    courantes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
    precedentes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
    *,
    inclure_chantiers: bool = True,
) -> str:
    bulletins = [ligne[0] for ligne in courantes]
    bulletins_precedents = [ligne[0] for ligne in precedentes]
    courant = mesurer(cast(list[BulletinRapport], bulletins))
    precedent = mesurer(cast(list[BulletinRapport], bulletins_precedents)) if bulletins_precedents else None
    nombre_chantiers = len({ligne[2].id for ligne in courantes})
    nombre_chantiers_precedent = len({ligne[2].id for ligne in precedentes})
    cartes: list[tuple[str, str, str | None, str]] = [
        (
            "Montant de la paie",
            f"{_masse(courant.masse)} DH",
            _ecart_montant(courant.masse, precedent.masse if precedent else None),
            "montant",
        ),
        (
            "Montant mois precedent",
            f"{_masse(precedent.masse)} DH" if precedent else "",
            None,
            "montant",
        ),
        (
            "Bulletins de paie",
            _entier(courant.effectif),
            _ecart_compte(courant.effectif, precedent.effectif if precedent else None, "bulletin", "bulletins"),
            "compte",
        ),
        (
            "Chantiers",
            _entier(nombre_chantiers),
            _ecart_compte(
                nombre_chantiers, nombre_chantiers_precedent if precedentes else None, "chantier", "chantiers"
            ),
            "compte",
        ),
        (
            "Sortants",
            _entier(courant.stc),
            _ecart_compte(courant.stc, precedent.stc if precedent else None, "bulletin", "bulletins"),
            "compte",
        ),
        (
            "STC (DH)",
            f"{_montant(courant.montant_stc)} DH",
            _ecart_montant(courant.montant_stc, precedent.montant_stc if precedent else None, decimales=True),
            "montant",
        ),
    ]
    if not inclure_chantiers:
        cartes.pop(3)
    elements = ['<div class="titre-indicateurs">Indicateurs clés</div>']
    hauteur_cartes = _hauteur_cartes_kpi(cartes)
    elements.append(f'<div class="kpi-row" style="height: {hauteur_cartes}pt">')
    for index, (libelle, valeur, sous_texte, classe) in enumerate(cartes):
        derniere = " derniere" if index == len(cartes) - 1 else ""
        sous_texte_html = f'<div class="sous-texte">{sous_texte}</div>' if sous_texte is not None else ""
        elements.append(
            f'<div class="kpi-carte{derniere}" style="height: {hauteur_cartes}pt"><div class="label">{libelle}</div>'
            f'<div class="valeur {classe}">{valeur}</div>{sous_texte_html}</div>'
        )
    elements.append("</div>")
    return "".join(elements)


def _hauteur_cartes_kpi(cartes: list[tuple[str, str, str | None, str]]) -> int:
    hauteur = 54
    for libelle, valeur, sous_texte, classe in cartes:
        est_montant = classe == "montant"
        corps_valeur = 10 if est_montant else 12
        interligne_valeur = 11.5 if est_montant else 13.5
        besoin = (
            10
            + 8.5 * compter_lignes(libelle.upper(), 109, 7.5, True)
            + 4
            + interligne_valeur * compter_lignes(valeur, 109, corps_valeur, True)
        )
        if sous_texte is not None:
            besoin += 2 + 8 * compter_lignes(sous_texte, 109, 7, False)
        hauteur = max(hauteur, ceil(besoin))
    return hauteur


def _entier(valeur: int) -> str:
    return f"{valeur:,}".replace(",", "\u00a0")


def _masse(valeur: Decimal) -> str:
    arrondie = valeur.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return f"{arrondie:,.0f}".replace(",", "\u00a0")


_MOINS = chr(0x2212)  # signe moins typographique, comme Spring


def _ecart_compte(actuel: int, precedent: int | None, singulier: str, pluriel: str) -> str:
    if precedent is None:
        return "Écart indisponible"
    ecart = actuel - precedent
    signe = "+" if ecart > 0 else _MOINS if ecart < 0 else ""
    return f"Écart : {signe}{abs(ecart)} {singulier if abs(ecart) == 1 else pluriel} vs mois précédent"


def _ecart_montant(actuel: Decimal, precedent: Decimal | None, *, decimales: bool = False) -> str:
    """Écart de montant, à l'entier de dirham (règle commune des montants)."""
    if precedent is None:
        return "Écart indisponible"
    ecart = actuel - precedent
    signe = "+" if ecart > 0 else _MOINS if ecart < 0 else ""
    montant = f"{signe}{_montant(abs(ecart)) if decimales else _masse(abs(ecart))} DH"
    if precedent == 0:
        return f"Écart : {montant} (base à 0)"
    pourcentage = (ecart * Decimal(100) / precedent).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    signe_pourcentage = "+" if pourcentage > 0 else _MOINS if pourcentage < 0 else ""
    return f"Écart : {montant} ({signe_pourcentage}{abs(pourcentage):.1f} %)".replace(".", ",")


def _filtres_actifs(
    requete: PaieRapportRequete,
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> list[str]:
    filtres: list[str] = []
    ids = requete.chantier_ids or ([requete.chantier_id] if requete.chantier_id is not None else [])
    if ids:
        codes = list(dict.fromkeys(chantier.code for _, _, chantier, _, _ in lignes if chantier.id in ids))
        if codes:
            filtres.append("Marchés : " + ", ".join(codes))
    if requete.fonction_id is not None:
        fonction = next((f for _, _, _, _, f in lignes if f.id == requete.fonction_id), None)
        if fonction is not None:
            filtres.append("Fonction : " + fonction.libelle)
    if requete.nom_prenom and requete.nom_prenom.strip():
        filtres.append("Nom & prénom contient : " + requete.nom_prenom)
    if requete.cin and requete.cin.strip():
        filtres.append("CIN contient : " + requete.cin)
    return filtres


def _montant(valeur: Decimal | None) -> str:
    """Montant à l'entier de dirham, séparateur de milliers insécable (règle commune des montants)."""
    return "-" if valeur is None else format(valeur, ",.0f").replace(",", "\u00a0")


def _quantite(valeur: Decimal | None) -> str:
    """Même présentation sans zéros décimaux superflus que le tableau Spring."""
    if valeur is None:
        return "-"
    return format(valeur, ",.2f").rstrip("0").rstrip(".").replace(",", "\u00a0").replace(".", ",")


def _signature(role: str, nom: str, *, derniere: bool = False) -> str:
    classe = "signature derniere" if derniere else "signature"
    return (
        f'<div class="{classe}"><div class="role">{escape(role)}</div>'
        f'<div class="nom">{escape(nom)}</div><div class="filet"></div>'
        '<div class="legende">Signature</div></div>'
    )


def _table_entete(*, avec_equipe: bool, avec_entete: bool = True) -> str:
    classes = (
        "nom-prenom",
        "fonction",
        "cin",
        "jours-p",
        "jours-jro",
        "jours-jrd",
        "salaire",
        "salaire-ro",
        "salaire-rd",
        "total",
        "obs",
    )
    colonnes = "".join(f'<col class="{classe}">' for classe in classes)
    if avec_equipe:
        colonnes += '<col class="equipe">'
    equipe = '<th rowspan="2">Équipe</th>' if avec_equipe else ""
    sans_equipe = "" if avec_equipe else " sans-equipe"
    ouverture = f'<table class="employes{sans_equipe}">{colonnes}'
    if not avec_entete:
        return ouverture + "<tbody>"
    return (
        ouverture + "<thead><tr>"
        '<th rowspan="2">Nom et prénom</th><th rowspan="2">Fonction</th><th rowspan="2">CIN</th>'
        '<th colspan="3">Nbre jrs</th><th colspan="3">Salaire</th>'
        f'<th rowspan="2">Total</th><th rowspan="2">Obs</th>{equipe}</tr><tr>'
        "<th>P</th><th>J.R.O</th><th>J.R.D</th><th>Salaire</th><th>RO</th><th>RD</th>"
        "</tr></thead><tbody>"
    )


@dataclass(frozen=True)
class _LigneDetail:
    paie: Paie
    employe: Employee
    chantier: Chantier
    equipe: Equipe | None
    fonction: Fonction

    @property
    def equipe_libelle(self) -> str | None:
        return self.equipe.libelle if self.equipe else None

    @property
    def valeurs(self) -> tuple[Paie, Employee, Chantier, Equipe | None, Fonction]:
        return self.paie, self.employe, self.chantier, self.equipe, self.fonction
