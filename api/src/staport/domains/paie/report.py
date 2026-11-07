from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from html import escape
from io import BytesIO
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
from .models import Paie
from .rapport_calcul import BulletinRapport, mesurer, regrouper_sections
from .rapport_texte import decouper_lignes, hauteur_ligne_employe
from .schemas import PaieRapportRequete


@dataclass(frozen=True)
class PointEvolution:
    periode: int
    masse: Decimal
    effectif: int
    stc: int
    montant_stc: Decimal


class ServiceRapportPaie:
    """Premier pipeline PDF natif Python, avec CSS et polices du rapport Spring embarqués."""

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
        q_evolution = (
            select(
                Paie.periode,
                func.coalesce(func.sum(Paie.salaire_total), Decimal(0)),
                func.count(Paie.id),
                func.coalesce(func.sum(case((est_stc, 1), else_=0)), 0),
                func.coalesce(func.sum(case((est_stc, Paie.salaire_total), else_=Decimal(0))), Decimal(0)),
            )
            .join(Employee, Employee.id == Paie.employee_id)
            .where(*conditions_evolution)
            .group_by(Paie.periode)
            .order_by(Paie.periode)
        )
        q_evolution_chantier = (
            select(
                Paie.chantier_id,
                Paie.periode,
                func.coalesce(func.sum(Paie.salaire_total), Decimal(0)),
                func.count(Paie.id),
                func.coalesce(func.sum(case((est_stc, 1), else_=0)), 0),
                func.coalesce(func.sum(case((est_stc, Paie.salaire_total), else_=Decimal(0))), Decimal(0)),
            )
            .join(Employee, Employee.id == Paie.employee_id)
            .where(*conditions_evolution)
            .group_by(Paie.chantier_id, Paie.periode)
            .order_by(Paie.chantier_id, Paie.periode)
        )
        async with session.begin():
            lignes = cast(
                list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
                [tuple(row) for row in (await session.execute(q)).all()],
            )
            evolution_brute = cast(
                list[tuple[int, Decimal, int, int, Decimal]],
                [tuple(row) for row in (await session.execute(q_evolution)).all()],
            )
            evolution_chantiers_brute = cast(
                list[tuple[int, int, Decimal, int, int, Decimal]],
                [tuple(row) for row in (await session.execute(q_evolution_chantier)).all()],
            )
        lignes_courantes = [ligne for ligne in lignes if ligne[0].periode == int(requete.periode.replace("-", ""))]
        lignes_precedentes = [ligne for ligne in lignes if ligne[0].periode == int(periode_precedente.replace("-", ""))]
        if not lignes_courantes:
            raise AucunePaiePeriode(requete.periode)
        evolution = [PointEvolution(*ligne) for ligne in evolution_brute]
        evolution_chantiers: dict[int, list[PointEvolution]] = {}
        for chantier_id, periode, masse, effectif, stc, montant_stc in evolution_chantiers_brute:
            evolution_chantiers.setdefault(chantier_id, []).append(
                PointEvolution(periode, masse, effectif, stc, montant_stc)
            )
        html = self._html(requete, lignes_courantes, lignes_precedentes, evolution, evolution_chantiers)
        return BytesIO(await rendre_pdf(html, self._ressources))

    def _html(
        self,
        requete: PaieRapportRequete,
        lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
        lignes_precedentes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]] | None = None,
        evolution: list[PointEvolution] | None = None,
        evolution_chantiers: dict[int, list[PointEvolution]] | None = None,
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
            pages.append(
                (
                    "PÉRIMÈTRE",
                    '<div class="titre-chapitre">Périmètre du rapport</div>'
                    + "".join(f'<div class="perimetre-ligne">{escape(filtre)}</div>' for filtre in filtres),
                )
            )
        if not requete.sans_vue_ensemble:
            repartition = _graphique_repartition(par_chantier)
            cartes = _cartes_kpi(lignes, lignes_precedentes or [])
            pages.append(
                (
                    "GLOBAL",
                    '<div class="titre-chapitre">Synthèse de la paie</div>'
                    f"{cartes}"
                    f'<div class="graphique">{repartition}</div>',
                )
            )
            if evolution is not None:
                pages.append(
                    (
                        "GLOBAL",
                        '<div class="titre-chapitre">Évolution sur douze mois</div>'
                        f'<div class="graphique">{_graphique_evolution(evolution)}</div>',
                    )
                )
        for code, lignes_chantier in sorted(
            par_chantier.items(), key=lambda item: -sum(ligne[0].salaire_total for ligne in item[1])
        ):
            chantier = lignes_chantier[0][2]
            identifiant = f"{chantier.nom} ({code})" if chantier.nom else code
            lignes_chantier_precedentes = [ligne for ligne in lignes_precedentes or [] if ligne[2].code == code]
            pages.append(
                (
                    f"CHANTIER : {identifiant}",
                    f'<div class="titre-chapitre">{escape(f"CHANTIER : {identifiant}")}</div>'
                    f"{_cartes_kpi(lignes_chantier, lignes_chantier_precedentes, inclure_chantiers=False)}"
                    + (
                        f'<div class="graphique">{_graphique_evolution(evolution_chantiers[chantier.id])}</div>'
                        if evolution_chantiers and chantier.id in evolution_chantiers
                        else ""
                    )
                    + f'<div class="graphique">{_graphique_equipes(lignes_chantier)}</div>',
                )
            )
            choix = set((requete.equipes_par_chantier or {}).get(code, []))
            regroupements = (requete.regroupements_equipes_par_chantier or {}).get(code, [])
            sections = regrouper_sections([_LigneDetail(*ligne) for ligne in lignes_chantier], choix, regroupements)
            for index_section, (libelle, section, est_regroupe) in enumerate(sections):
                titre = f"ÉQUIPE : {libelle}" if libelle else f"CHANTIER : {identifiant}"
                avec_equipe = libelle is None or est_regroupe
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
                budget_initial = 495 - 8 - (24 if index_section == 0 else 0) - 24 - 40
                budget_suite = 495 - 8 - 8
                for index_page, tranche in enumerate(decouper_lignes(hauteurs, budget_initial, budget_suite)):
                    contenu_page: list[str] = []
                    if index_page == 0:
                        if index_section == 0:
                            contenu_page.append(f'<div class="titre-chapitre">CHANTIER : {escape(identifiant)}</div>')
                        contenu_page.append(f'<div class="titre-section">{escape(titre)}</div>')
                    contenu_page.append(_table_entete(avec_equipe=avec_equipe, avec_entete=index_page == 0))
                    contenu_page.extend(lignes_html[i] for i in tranche)
                    contenu_page.append("</tbody></table>")
                    pages.append((f"CHANTIER : {identifiant}", "".join(contenu_page)))
        for numero, (niveau, contenu_html) in enumerate(pages, start=1):
            niveau = escape(niveau)
            corps.append(
                '<div class="page"><div class="page-header"><img class="logo" src="logo-staport.png">'
                '<div class="separateur s1"></div><div class="bloc b1">Ressources Humaines</div>'
                '<div class="separateur s2"></div>'
                f'<div class="bloc b2">Paie {escape(requete.periode)}</div>'
                f'<div class="separateur s3"></div><div class="bloc bloc-niveau lignes-1">{niveau}</div>'
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


def _graphique_repartition(
    par_chantier: dict[str, list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]],
) -> str:
    """Rend la répartition de la masse par chantier avec le backend SVG officiel Matplotlib."""
    elements = sorted(
        (
            ((lignes[0][2].nom or code).strip() or code, sum((ligne[0].salaire_total for ligne in lignes), Decimal(0)))
            for code, lignes in par_chantier.items()
        ),
        key=lambda element: element[1],
    )
    return _graphique_barres(elements, "Masse salariale par chantier (DH)")


def _graphique_equipes(
    lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
) -> str:
    montants: dict[str, Decimal] = {}
    for paie, _, _, equipe, _ in lignes:
        libelle = equipe.libelle.strip() if equipe and equipe.libelle.strip() else "Sans équipe"
        montants[libelle] = montants.get(libelle, Decimal(0)) + paie.salaire_total
    elements = sorted(montants.items(), key=lambda element: element[1], reverse=True)
    if len(elements) > 15:
        elements = [*elements[:15], ("Autres", sum((montant for _, montant in elements[15:]), Decimal(0)))]
        elements.sort(key=lambda element: element[1], reverse=True)
    return _graphique_barres(elements, "Masse salariale par équipe (DH)")


def _graphique_barres(elements: list[tuple[str, Decimal]], titre: str) -> str:
    hauteur = max(1.8, 0.34 * len(elements))
    figure = Figure(figsize=(10.5, hauteur), layout="constrained")
    axes = cast(Any, figure.subplots())
    libelles = [libelle for libelle, _ in elements]
    valeurs = [float(masse) for _, masse in elements]
    axes.barh(libelles, valeurs, color="#2563EB")
    axes.set_xlabel("Masse salariale (DH)")
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
    cartes = [
        (
            "Masse salariale",
            _masse(courant.masse),
            _ecart_montant(courant.masse, precedent.masse if precedent else None),
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
        cartes.pop(2)
    elements = [
        '<div class="titre-indicateurs">Indicateurs clés</div><div class="kpi-row">',
    ]
    for index, (libelle, valeur, sous_texte, classe) in enumerate(cartes):
        derniere = " derniere" if index == len(cartes) - 1 else ""
        elements.append(
            f'<div class="kpi-carte{derniere}" style="height: 54pt"><div class="label">{libelle}</div>'
            f'<div class="valeur {classe}">{valeur}</div><div class="sous-texte">{sous_texte}</div></div>'
        )
    elements.append("</div>")
    return "".join(elements)


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
