from dataclasses import dataclass
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

from .models import Paie
from .rapport_calcul import BulletinRapport, mesurer, repartir_sections
from .schemas import PaieRapportRequete


class ServiceRapportPaie:
    """Premier pipeline PDF natif Python, avec CSS et polices du rapport Spring embarqués."""

    def __init__(self, audit: Auditeur) -> None:
        self._audit = audit
        self._ressources = Path(__file__).with_name("report")

    async def generer(self, session: AsyncSession, requete: PaieRapportRequete) -> BytesIO:
        conditions = [Paie.periode == int(requete.periode.replace("-", ""))]
        if requete.nom_prenom:
            conditions.append(Employee.nom_prenom.ilike(f"%{requete.nom_prenom}%"))
        if requete.cin:
            conditions.append(Employee.cin.ilike(f"%{requete.cin}%"))
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
            raise ValueError(f"Aucune paie pour la période {requete.periode} et le périmètre demandé")
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
        corps = [
            (
                '<div class="page cover"><img class="logo-couverture" src="logo-staport.png">'
                '<div class="titre">RAPPORT DE PAIE</div>'
            ),
            (
                f'<div class="bloc-identite"><div class="label">PÉRIODE</div><div class="valeur">{requete.periode}'
                "</div></div></div>"
            ),
            (
                '<div class="page"><div class="page-header"><img class="logo" src="logo-staport.png">'
                '<div class="bloc b1">Ressources Humaines</div><div class="bloc b2">Paie</div></div>'
                '<div class="page-body">'
            ),
            '<div class="titre-chapitre">Synthèse de la paie</div>',
            (
                f'<div class="perimetre-ligne">Bulletins : {total.effectif} — '
                f"Masse salariale : {total.masse:,.2f} DH — STC : {total.stc}</div>"
            ),
        ]
        corps.append("</div></div>")
        for code, lignes_chantier in sorted(
            par_chantier.items(), key=lambda item: -sum(ligne[0].salaire_total for ligne in item[1])
        ):
            chantier = lignes_chantier[0][2]
            identifiant = f"{chantier.nom} ({code})" if chantier.nom else code
            corps.append(
                '<div class="page"><div class="page-body"><div class="titre-chapitre">'
                f"CHANTIER : {escape(identifiant)}</div>"
            )
            choix = set((requete.equipes_par_chantier or {}).get(code, []))
            sections = repartir_sections([_LigneDetail(*ligne) for ligne in lignes_chantier], choix)
            for libelle, section in sections:
                titre = f"ÉQUIPE : {libelle}" if libelle else f"CHANTIER : {identifiant}"
                corps.append(f'<div class="titre-section">{escape(titre)}</div>')
                corps.append(
                    '<table class="employes"><thead><tr><th>Nom et prénom</th><th>Fonction</th><th>CIN</th>'
                    "<th>Chantier</th><th>Équipe</th><th>Salaire</th><th>Total</th><th>Obs</th></tr></thead><tbody>"
                )
                for detail in section:
                    paie, employe, chantier_ligne, equipe, fonction = detail.valeurs
                    valeurs = [
                        employe.nom_prenom,
                        fonction.libelle,
                        employe.cin,
                        chantier_ligne.code,
                        equipe.libelle if equipe else "",
                        f"{paie.salaire_mensuel:,.2f}",
                        f"{paie.salaire_total:,.2f}",
                        paie.observation or "",
                    ]
                    corps.append("<tr>" + "".join(f"<td>{escape(str(v))}</td>" for v in valeurs) + "</tr>")
                corps.append("</tbody></table>")
            corps.append("</div></div>")
        return (
            "<!doctype html><html><head><meta charset='utf-8'><style>"
            + css
            + "</style></head><body>"
            + "".join(corps)
            + "</body></html>"
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
