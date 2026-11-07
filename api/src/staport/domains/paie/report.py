from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from html import escape
from io import BytesIO
from pathlib import Path
from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .exceptions import AucunePaiePeriode
from .models import Paie
from .rapport_calcul import BulletinRapport, mesurer, regrouper_sections
from .rapport_texte import decouper_lignes, hauteur_ligne_employe
from .schemas import PaieRapportRequete


class ServiceRapportPaie:
    """Premier pipeline PDF natif Python, avec CSS et polices du rapport Spring embarqués."""

    def __init__(self, audit: Auditeur) -> None:
        self._audit = audit
        self._ressources = Path(__file__).with_name("report")

    async def generer(self, session: AsyncSession, requete: PaieRapportRequete) -> BytesIO:
        conditions = [Paie.periode == int(requete.periode.replace("-", ""))]
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
        q = (
            select(Paie, Employee, Chantier, Equipe, Fonction)
            .join(Employee, Employee.id == Paie.employee_id)
            .join(Chantier, Chantier.id == Paie.chantier_id)
            .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
            .join(Fonction, Fonction.id == Paie.fonction_id)
            .where(*conditions)
            .order_by(Fonction.libelle, Employee.nom_prenom)
        )
        async with session.begin():
            lignes = cast(
                list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]],
                [tuple(row) for row in (await session.execute(q)).all()],
            )
        if not lignes:
            raise AucunePaiePeriode(requete.periode)
        html = self._html(requete, lignes)
        from weasyprint import HTML  # pyright: ignore[reportMissingTypeStubs]

        sortie = cast(bytes, HTML(string=html, base_url=str(self._ressources)).write_pdf())  # pyright: ignore[reportUnknownMemberType]
        return BytesIO(sortie)

    def _html(
        self, requete: PaieRapportRequete, lignes: list[tuple[Paie, Employee, Chantier, Equipe | None, Fonction]]
    ) -> str:
        css = (self._ressources / "rapport.css").read_text(encoding="utf-8")
        total = mesurer(cast(list[BulletinRapport], [ligne[0] for ligne in lignes]))
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
            pages.append(
                (
                    "GLOBAL",
                    '<div class="titre-chapitre">Synthèse de la paie</div>'
                    f'<div class="perimetre-ligne">Bulletins : {total.effectif} — '
                    f"Masse salariale : {total.masse:,.2f} DH — STC : {total.stc}</div>",
                )
            )
        for code, lignes_chantier in sorted(
            par_chantier.items(), key=lambda item: -sum(ligne[0].salaire_total for ligne in item[1])
        ):
            chantier = lignes_chantier[0][2]
            identifiant = f"{chantier.nom} ({code})" if chantier.nom else code
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
