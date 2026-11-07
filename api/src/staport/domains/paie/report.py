import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from html import escape
from io import BytesIO
from math import ceil
from pathlib import Path
from typing import Any, cast

from matplotlib.figure import Figure
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
        conditions_evolution = _conditions(_periodes_recentes(requete.periode, 12), requete)
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
                list[tuple[int, int | None, int, Decimal, int, int, Decimal]],
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
        for chantier_id, equipe_id, periode, masse, effectif, stc, montant_stc in evolution_chantiers_brute:
            point = PointEvolution(periode, masse, effectif, stc, montant_stc)
            if equipe_id is not None:
                evolution_equipes.setdefault((chantier_id, equipe_id), []).append(point)
            cle_chantier = chantier_id, periode
            cumul_chantiers[cle_chantier] = _additionner_points(cumul_chantiers.get(cle_chantier), point)
            cumul_global[periode] = _additionner_points(cumul_global.get(periode), point)
        for (chantier_id, _periode), point in sorted(cumul_chantiers.items()):
            evolution_chantiers.setdefault(chantier_id, []).append(point)
        evolution = [cumul_global[periode] for periode in sorted(cumul_global)]
        html = self._html(
            requete, lignes_courantes, lignes_precedentes, evolution, evolution_chantiers, evolution_equipes
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
            points_evolution = (
                f'<div class="graphique">{_graphique_evolution(evolution)}</div>' if evolution is not None else ""
            )
            pages.append(
                (
                    "GLOBAL",
                    f'<div class="titre-chapitre">I — Vue d\'ensemble</div>{cartes}'
                    + _rubrique(1, "Masse salariale et montants des STC (DH)")
                    + _rubrique(2, "Bulletins de paie et sorties du personnel (bulletins)")
                    + points_evolution,
                )
            )
            graphiques_globaux = _graphiques_repartition_chantiers(par_chantier)
            for index_graphique, graphique in enumerate(graphiques_globaux):
                titre_repartition = (
                    "Répartition par chantier" if index_graphique == 0 else "Répartition par chantier (suite)"
                )
                pages.append(
                    (
                        "GLOBAL",
                        _rubrique(3, titre_repartition) + f'<div class="graphique">{graphique}</div>',
                    )
                )
        chantiers_ordonnes = sorted(
            par_chantier.items(), key=lambda item: -sum(ligne[0].salaire_total for ligne in item[1])
        )
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
                + _rubrique(1, "Masse salariale et montants des STC (DH)")
                + _rubrique(2, "Bulletins de paie et sorties du personnel (bulletins)")
                + (
                    f'<div class="graphique">{_graphique_evolution(evolution_chantiers[chantier.id])}</div>'
                    if evolution_chantiers and chantier.id in evolution_chantiers
                    else ""
                )
            )
            if choix or regroupements:
                pages.append((f"CHANTIER : {identifiant}", bloc_chantier))
                pages.append(
                    (
                        f"CHANTIER : {identifiant}",
                        _rubrique(3, "Répartition par équipe")
                        + f'<div class="graphique">{_graphique_equipes(lignes_chantier)}</div>',
                    )
                )
            else:
                pages.append((f"CHANTIER : {identifiant}", bloc_chantier))
                for index_graphique, graphique in enumerate(_graphiques_fonctions(lignes_chantier)):
                    titre_repartition = (
                        "Répartition par fonction" if index_graphique == 0 else "Répartition par fonction (suite)"
                    )
                    pages.append(
                        (
                            f"CHANTIER : {identifiant}",
                            _rubrique(3, titre_repartition) + f'<div class="graphique">{graphique}</div>',
                        )
                    )
            sections = regrouper_sections([_LigneDetail(*ligne) for ligne in lignes_chantier], choix, regroupements)
            for index_section, (libelle, section, est_regroupe) in enumerate(sections):
                titre = f"ÉQUIPE : {libelle}" if libelle else f"CHANTIER : {identifiant}"
                niveau_section = (
                    f"CHANTIER : {identifiant} · ÉQUIPE : {libelle}" if libelle else f"CHANTIER : {identifiant}"
                )
                avec_equipe = libelle is None or est_regroupe
                graphique_materiel = None
                if libelle is not None and evolution_equipes is not None:
                    identifiants_equipes = {detail.valeurs[0].equipe_id for detail in section}
                    lignes_section_precedentes = [
                        ligne for ligne in lignes_chantier_precedentes if ligne[0].equipe_id in identifiants_equipes
                    ]
                    points_section: dict[int, PointEvolution] = {}
                    for equipe_id in identifiants_equipes:
                        if equipe_id is not None:
                            for point in evolution_equipes.get((chantier.id, equipe_id), []):
                                points_section[point.periode] = _additionner_points(
                                    points_section.get(point.periode), point
                                )
                    graphique_section = _graphique_evolution([points_section[p] for p in sorted(points_section)])
                    pages.append(
                        (
                            niveau_section,
                            f'<div class="titre-chapitre">{escape(titre)}</div>'
                            + _cartes_kpi(
                                [detail.valeurs for detail in section],
                                lignes_section_precedentes,
                                inclure_chantiers=False,
                            )
                            + _rubrique(1, "Masse salariale et montants des STC (DH)")
                            + _rubrique(2, "Bulletins de paie et sorties du personnel (bulletins)")
                            + f'<div class="graphique">{graphique_section}</div>',
                        )
                    )
                    graphiques_fonctions = _graphiques_fonctions([detail.valeurs for detail in section])
                    if not est_regroupe:
                        equipe_section = section[0].valeurs[3]
                        if equipe_section is not None:
                            graphique_materiel = _graphique_materiel(code, equipe_section.code, requete.materiel or {})
                            if graphique_materiel:
                                graphique_materiel = graphique_materiel.replace(
                                    '<div class="titre-chapitre">Parc matériel —',
                                    '<div class="titre-section rubrique-titre">4. Parc matériel —',
                                    1,
                                )
                    materiel_avec_fonctions = (
                        graphique_materiel is not None
                        and len(graphiques_fonctions) == 1
                        and _hauteur_svg(graphiques_fonctions[0]) + _hauteur_svg(graphique_materiel) + 36 <= 487
                    )
                    for index_graphique, graphique in enumerate(graphiques_fonctions):
                        titre_repartition = (
                            "Répartition par fonction" if index_graphique == 0 else "Répartition par fonction (suite)"
                        )
                        contenu_graphique = (
                            _rubrique(3, titre_repartition) + f'<div class="graphique">{graphique}</div>'
                        )
                        if materiel_avec_fonctions:
                            contenu_graphique += cast(str, graphique_materiel)
                        pages.append((niveau_section, contenu_graphique))
                    if graphique_materiel and not materiel_avec_fonctions:
                        pages.append((niveau_section, graphique_materiel))
                pages_recap = _recaps_fonctions([detail.valeurs for detail in section])
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
                        numero_rubrique_liste = 5 if graphique_materiel else 4
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
                f'<div class="bloc b2">Paie {escape(requete.periode)}</div>'
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


def _hauteur_svg(contenu: str) -> float:
    dimension = re.search(r'<svg\b[^>]*\bwidth="([\d.]+)pt"[^>]*\bheight="([\d.]+)pt"', contenu)
    if dimension is None:
        raise ValueError("Le graphique du rapport doit exposer ses dimensions SVG en points")
    largeur, hauteur = (float(valeur) for valeur in dimension.groups())
    return 802 * hauteur / largeur


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


def _graphiques_repartition_chantiers(
    par_chantier: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]],
) -> list[str]:
    elements = [
        _point_repartition((lignes[0][2].nom or code).strip() or code, lignes) for code, lignes in par_chantier.items()
    ]
    elements.sort(key=lambda element: element.masse, reverse=True)
    tranches = _repartir_graphiques(elements, maximum=16)
    return [
        _graphique_distribution(
            tranche,
            "Masse salariale par chantier (DH)",
            echelle=elements,
            part_du_total=True,
        )
        for tranche in tranches
    ]


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


def _graphique_equipes(
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> str:
    par_equipe: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]] = {}
    for ligne in lignes:
        equipe = ligne[3]
        libelle = equipe.libelle.strip() if equipe and equipe.libelle.strip() else "Sans équipe"
        par_equipe.setdefault(libelle, []).append(ligne)
    elements = [_point_repartition(libelle, groupe) for libelle, groupe in par_equipe.items()]
    elements.sort(key=lambda element: element.masse, reverse=True)
    if len(elements) > 15:
        autres = elements[15:]
        elements = [
            *elements[:15],
            PointRepartition(
                "Autres",
                sum((point.masse for point in autres), Decimal(0)),
                sum(point.bulletins for point in autres),
                sum(point.stc for point in autres),
                sum((point.montant_stc for point in autres), Decimal(0)),
            ),
        ]
        elements.sort(key=lambda element: element.masse, reverse=True)
    return _graphique_distribution(elements, "Masse salariale par équipe (DH)")


def _graphiques_fonctions(
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> list[str]:
    par_fonction: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]] = {}
    for ligne in lignes:
        par_fonction.setdefault(ligne[4].libelle, []).append(ligne)
    elements = [_point_repartition(libelle, groupe) for libelle, groupe in par_fonction.items()]
    elements.sort(key=lambda element: (-element.masse, element.libelle.casefold()))
    tranches = _repartir_graphiques(elements, maximum=15)
    return [
        _graphique_distribution(tranche, "Masse salariale par fonction (DH)", echelle=elements) for tranche in tranches
    ]


def _point_repartition(
    libelle: str,
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> PointRepartition:
    bulletins = cast(list[BulletinRapport], [ligne[0] for ligne in lignes])
    mesures = mesurer(bulletins)
    return PointRepartition(libelle, mesures.masse, mesures.effectif, mesures.stc, mesures.montant_stc)


def _graphique_materiel(chantier_code: str, equipe_code: str, nombres: dict[str, int]) -> str | None:
    tableau = next(
        (t for t in tableaux_materiel() if t.chantier_code == chantier_code and t.equipe_code == equipe_code), None
    )
    if tableau is None:
        return None
    elements = [(libelle, Decimal(nombres[libelle])) for libelle in tableau.libelles if libelle in nombres]
    if not any(nombre > 0 for _, nombre in elements):
        return None
    graphique = _graphique_barres(elements, f"Parc matériel — {tableau.titre}", unite="Nombre")
    return (
        f'<div class="titre-chapitre">Parc matériel — {escape(tableau.titre)}</div>'
        f'<div class="graphique">{graphique}</div>'
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
                '<div class="recap-row"><div class="recap-bloc derniere">'
                f'<div class="titre-recap">{titre}</div>'
                '<table class="recap fonction"><col class="libelle"><col class="effectif">'
                '<col class="stc-personnes"><col class="stc-montant">'
                "<thead><tr><th>FONCTION</th><th>BULLETINS</th>"
                "<th>STC (PERS.)</th><th>STC (DH)</th></tr></thead><tbody>"
                + "".join(tranche)
                + "</tbody></table></div></div>",
                hauteur,
            )
        )
    return pages


def _graphique_barres(elements: list[tuple[str, Decimal]], titre: str, *, unite: str = "Masse salariale (DH)") -> str:
    hauteur = max(1.8, 0.34 * len(elements))
    figure = Figure(figsize=(10.5, hauteur), layout="constrained")
    axes = cast(Any, figure.subplots())
    libelles = [libelle for libelle, _ in elements]
    valeurs = [float(masse) for _, masse in elements]
    axes.barh(libelles, valeurs, color="#2563EB")
    axes.set_xlabel(unite)
    axes.set_title(titre)
    axes.grid(axis="x", color="#E5E7EB", linewidth=0.6)
    axes.set_axisbelow(True)
    for bordure in axes.spines.values():
        bordure.set_visible(False)
    axes.tick_params(axis="both", length=0)
    figure.set_facecolor("white")
    axes.set_facecolor("white")
    sortie = BytesIO()
    cast(Any, figure).savefig(sortie, format="svg", metadata={"Title": titre})
    return sortie.getvalue().decode("utf-8")


def _graphique_evolution(points: list[PointEvolution]) -> str:
    figure = Figure(figsize=(10.5, 4.8), layout="constrained")
    montant, personnes = figure.subplots(2, 1, sharex=True)
    mois = [f"{point.periode % 100}/{point.periode // 100}" for point in points]
    montant.plot(mois, [float(point.masse) for point in points], color="#2563EB", marker="o", label="Masse salariale")
    montant.plot(
        mois, [float(point.montant_stc) for point in points], color="#0F766E", marker="o", label="Montant des STC"
    )
    montant.set_ylabel("DH")
    montant.legend(loc="upper left")
    personnes.plot(mois, [point.effectif for point in points], color="#D97706", marker="o", label="Bulletins")
    personnes.plot(mois, [point.stc for point in points], color="#B91C1C", marker="o", label="STC / sorties")
    personnes.set_ylabel("Personnes")
    personnes.legend(loc="upper left")
    for axes in (montant, personnes):
        axes.grid(axis="y", color="#C8D3DE", linewidth=0.6)
        axes.set_axisbelow(True)
        for bordure in axes.spines.values():
            bordure.set_visible(False)
        axes.tick_params(axis="both", length=0)
    personnes.tick_params(axis="x", labelrotation=45)
    figure.set_facecolor("white")
    sortie = BytesIO()
    cast(Any, figure).savefig(sortie, format="svg", metadata={"Title": "Évolution de la paie sur douze mois"})
    return sortie.getvalue().decode("utf-8")


def _additionner_points(precedent: PointEvolution | None, point: PointEvolution) -> PointEvolution:
    if precedent is None:
        return point
    return PointEvolution(
        point.periode,
        precedent.masse + point.masse,
        precedent.effectif + point.effectif,
        precedent.stc + point.stc,
        precedent.montant_stc + point.montant_stc,
    )


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
            "Masse salariale",
            _masse(courant.masse),
            _ecart_montant(courant.masse, precedent.masse if precedent else None),
            "montant",
        ),
        (
            "Masse mois précédent",
            f"{_masse(precedent.masse)} DH" if precedent else "",
            None,
            "montant",
        ),
        (
            "Bulletins de paie",
            _entier(courant.effectif),
            _ecart_compte(courant.effectif, precedent.effectif if precedent else None),
            "compte",
        ),
        (
            "Chantiers",
            _entier(nombre_chantiers),
            _ecart_compte(nombre_chantiers, nombre_chantiers_precedent if precedentes else None),
            "compte",
        ),
        (
            "STC / sorties",
            _entier(courant.stc),
            _ecart_compte(courant.stc, precedent.stc if precedent else None),
            "compte",
        ),
        (
            "Montant des STC",
            _montant(courant.montant_stc),
            _ecart_montant(courant.montant_stc, precedent.montant_stc if precedent else None),
            "montant",
        ),
    ]
    if not inclure_chantiers:
        cartes.pop(3)
    elements = [
        '<div class="titre-indicateurs">Indicateurs clés</div><div class="kpi-row">',
    ]
    hauteur_cartes = _hauteur_cartes_kpi(cartes)
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


def _ecart_compte(actuel: int, precedent: int | None) -> str:
    if precedent is None:
        return "Écart indisponible"
    ecart = actuel - precedent
    signe = "+" if ecart > 0 else "\u2212" if ecart < 0 else ""
    return f"Écart : {signe}{_entier(abs(ecart))}"


def _ecart_montant(actuel: Decimal, precedent: Decimal | None) -> str:
    if precedent is None:
        return "Écart indisponible"
    ecart = actuel - precedent
    signe = "+" if ecart > 0 else "\u2212" if ecart < 0 else ""
    montant = f"{signe}{_masse(abs(ecart))} DH"
    if precedent == 0:
        return f"Écart : {montant} (base à 0)"
    pourcentage = (ecart * Decimal(100) / precedent).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    signe_pourcentage = "+" if pourcentage > 0 else "\u2212" if pourcentage < 0 else ""
    return f"Écart : {montant} ({signe_pourcentage}{abs(pourcentage):.1f} %)".replace(".", ",")


def _graphique_distribution(
    elements: list[PointRepartition],
    titre: str,
    *,
    echelle: list[PointRepartition] | None = None,
    part_du_total: bool = False,
) -> str:
    series = (
        ("Masse (DH)", "#2563EB", "masse"),
        ("Bulletins", "#D97706", "bulletins"),
        ("STC bul.", "#B91C1C", "stc"),
        ("STC (DH)", "#0F766E", "montant_stc"),
    )
    visibles = [element for element in elements if element.bulletins > 0]
    points_echelle = echelle or elements
    hauteur = max(1.8, 0.34 * len(visibles))
    figure = Figure(figsize=(10.5, hauteur), layout="constrained")
    axes = cast(Any, figure.subplots())
    libelles = ["\n".join(decouper(element.libelle, 180, 9.5, True)) for element in visibles]
    axes.set_yticks(list(range(len(visibles))), labels=libelles)
    maximum_par_serie: list[Decimal | int] = []
    for _, _, attribut in series:
        valeurs = [getattr(point, attribut) for point in points_echelle]
        if part_du_total:
            maximum_par_serie.append(sum(valeurs, Decimal(0)))
        else:
            maximum_par_serie.append(max(valeurs, default=Decimal(0)))
    decalages = (-0.30, -0.10, 0.10, 0.30)
    colonnes_valeurs = (1.13, 1.48, 1.83, 2.22)
    for numero_serie, (libelle_serie, couleur, attribut) in enumerate(series):
        denominateur = maximum_par_serie[numero_serie]
        largeurs: list[float] = []
        positions: list[float] = []
        valeurs_affichees: list[str] = []
        for index, element in enumerate(visibles):
            valeur = getattr(element, attribut)
            largeur = float(valeur / denominateur) if denominateur > 0 else 0.0
            largeurs.append(largeur * 0.8)
            positions.append(index + decalages[numero_serie])
            valeurs_affichees.append(_montant(valeur) if "DH" in libelle_serie else _entier(valeur))
        axes.barh(
            positions,
            largeurs,
            height=0.16,
            color=couleur,
            label=libelle_serie,
        )
        for position, valeur_affichee in zip(positions, valeurs_affichees, strict=True):
            axes.text(colonnes_valeurs[numero_serie], position, valeur_affichee, ha="right", va="center", fontsize=7)
        axes.text(
            colonnes_valeurs[numero_serie],
            -0.75,
            libelle_serie,
            ha="right",
            va="center",
            fontsize=7,
            fontweight="bold",
        )
    axes.set_xlim(0, 2.35)
    axes.set_ylim(len(visibles) - 0.5, -1.1)
    axes.set_xticks([])
    axes.set_title(titre)
    axes.grid(axis="x", color="#E5E7EB", linewidth=0.6)
    axes.set_axisbelow(True)
    for bordure in axes.spines.values():
        bordure.set_visible(False)
    axes.tick_params(axis="both", length=0)
    axes.legend(ncol=4, loc="lower center", bbox_to_anchor=(0.5, -0.08), fontsize=7, frameon=False)
    figure.set_facecolor("white")
    axes.set_facecolor("white")
    sortie = BytesIO()
    cast(Any, figure).savefig(sortie, format="svg", metadata={"Title": titre})
    return sortie.getvalue().decode("utf-8")


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
    """Même séparateur et deux décimales que PaieReportNumberFormat.montant (Spring)."""
    return "-" if valeur is None else format(valeur, ",.2f").replace(",", "\u00a0").replace(".", ",")


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
