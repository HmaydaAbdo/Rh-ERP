"""Attestation de travail (KAN-320) : PDF A4 ou Word sur le modèle de la Direction (STE STAPORT S.A., Marrakech).

Décisions du propriétaire (2026-11-25) : « depuis le » est la date de déclaration CNSS ; la fonction est le libellé
actuel, tel quel ; la civilité (Monsieur ou Madame) se choisit à l'impression et reste sur la fiche. L'attestation dit
que l'employé travaille « jusqu'à ce jour » : elle n'est délivrée qu'à un employé en poste, déclaré à la CNSS.

Le texte est écrit une seule fois (`corps`) et rendu en deux formats : le PDF (WeasyPrint, tout texte issu des données
passe par `html.escape`) à imprimer tel quel, et le Word (python-docx, 2026-11-27) à retoucher avant impression.

En-tête et pied de page suivent le papier à en-tête de la société (2026-11-27) : le logo seul en haut ; en bas, le
bandeau bleu des coordonnées légales. Le capital social y est lu dans les paramètres (`societe.capital-social`),
modifiable depuis l'écran Paramètres.
"""

from dataclasses import dataclass
from datetime import date
from html import escape
from io import BytesIO
from pathlib import Path
from typing import Protocol, cast

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls
from docx.section import _Footer  # pyright: ignore[reportPrivateUsage]
from docx.shared import Length, Mm, Pt, RGBColor
from docx.styles.style import ParagraphStyle
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.pdf import rendre_pdf
from staport.domains.function.models import Fonction
from staport.domains.paie import report as _rapport_paie

from . import repository
from .exceptions import AttestationImpossible, EmployeeIntrouvable
from .models import Civilite, Employee, EmployeeStatut
from .schemas import FormatDocument

RESSOURCES_PAIE = Path(_rapport_paie.__file__).with_name("report")
CSS_ATTESTATION = Path(__file__).with_name("report") / "attestation.css"
LOGO = RESSOURCES_PAIE / "logo-staport.png"
SOCIETE = "STAPORT S.A."
LIEU = "Marrakech"
TITRE = "ATTESTATION DE TRAVAIL"
SIGNATAIRE = "La Direction"
APOSTROPHE = chr(0x2019)  # apostrophe typographique
TYPE_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
BLEU_BANDEAU = "145B8E"
BLANC = RGBColor(0xFF, 0xFF, 0xFF)

# Coordonnées légales du bandeau de pied de page (papier à en-tête de la société) ; le capital est un paramètre.
PIED_AVANT_CAPITAL = (
    f"Société des Travaux d{APOSTROPHE}Assainissement, Ponts et Routes - Société Anonyme",
    "Siège Social : Ensemble Résidentiel AL BADR Porte n°2, 1Er Etage n°4 , Aïn Sebaâ Casablanca",
    "TEL : 05 22 34 43 63 | FAX : 05 22 35 17 87",
    "Succursale: Résidence Jnane El Harti, Avenue Yacoub El Marini, Guéliz Marrakech",
    "TEL : 05 24 43 57 23 | FAX : 05 24 44 83 52",
)
IDENTIFIANTS_LEGAUX = "R.C : 96 537 | C.N.S.S : 606 7111 | Patente: 37963740 | I.F : 2201604 | ICE : 001515324000076"

# Formule et accords selon la civilité.
FORMULES: dict[Civilite, tuple[str, str]] = {
    Civilite.MONSIEUR: ("Monsieur", ""),
    Civilite.MADAME: ("Madame", "e"),
}

# Un paragraphe du corps : des segments (texte, gras ?).
Paragraphe = list[tuple[str, bool]]


@dataclass(frozen=True)
class Attestation:
    civilite: Civilite
    nom_prenom: str
    cin: str
    matricule_cnss: str
    depuis: date
    fonction: str
    fait_le: date
    capital_social: int


@dataclass(frozen=True)
class DocumentGenere:
    contenu: bytes
    nom: str
    type_mime: str


def manques(x: Employee) -> list[str]:
    """Ce qui empêche d'attester : la fiche doit être en poste et déclarée à la CNSS (matricule et date)."""
    raisons: list[str] = []
    if x.statut != EmployeeStatut.ACTIF:
        raisons.append("l'employé n'est plus en poste")
    if not x.matricule_cnss:
        raisons.append("le matricule CNSS n'est pas renseigné")
    if x.date_declaration_cnss is None:
        raisons.append("la date de déclaration CNSS n'est pas renseignée")
    return raisons


def corps(a: Attestation) -> list[Paragraphe]:
    """Le texte de l'attestation, commun au PDF et au Word ; les données sont en gras."""
    formule, accord = FORMULES[a.civilite]
    return [
        [
            ("Nous soussignés, la société ", False),
            (SOCIETE, True),
            (", attestons par la présente que ", False),
            (f"{formule} ", False),
            (a.nom_prenom.upper(), True),
            (", titulaire de la CIN N° ", False),
            (a.cin, True),
            (f", immatriculé{accord} à la CNSS sous le N° ", False),
            (a.matricule_cnss, True),
            (", travaille au sein de notre société en qualité de ", False),
            (a.fonction, True),
            (" depuis le ", False),
            (f"{a.depuis:%d/%m/%Y}", True),
            (f" jusqu{APOSTROPHE}à ce jour.", False),
        ],
        [
            (
                f"La présente attestation est délivrée à l{APOSTROPHE}intéressé{accord} sur sa demande pour servir et "
                "valoir ce que de droit.",
                False,
            )
        ],
    ]


def _html(paragraphe: Paragraphe) -> str:
    return "".join(f"<strong>{escape(texte)}</strong>" if gras else escape(texte) for texte, gras in paragraphe)


def lignes_pied_de_page(capital_social: int) -> list[str]:
    """Le bandeau de pied de page, ligne par ligne ; le capital s'écrit « 70 000 000,00Dh » comme sur le papier."""
    capital = f"{capital_social:,}".replace(",", " ")
    return [*PIED_AVANT_CAPITAL, f"Capital Social : {capital},00Dh | {IDENTIFIANTS_LEGAUX}"]


def construire_html(a: Attestation) -> str:
    return "".join(
        [
            '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Attestation de travail</title><style>',
            CSS_ATTESTATION.read_text(encoding="utf-8"),
            "</style></head><body>",
            '<div class="pied">',
            *(f"<div>{escape(ligne)}</div>" for ligne in lignes_pied_de_page(a.capital_social)),
            "</div>",
            '<div class="entete"><img class="logo" src="logo-staport.png"></div>',
            f'<div class="lieu-date">{LIEU}, le {a.fait_le:%d/%m/%Y}</div>',
            f"<h1>{TITRE}</h1>",
            *(f'<p class="corps">{_html(p)}</p>' for p in corps(a)),
            f'<div class="signature">{SIGNATAIRE}</div>',
            "</body></html>",
        ]
    )


def construire_docx(a: Attestation) -> bytes:
    """Le même texte que le PDF, en Word A4 : le logo en en-tête, le bandeau des coordonnées en pied de page."""
    document = Document()
    section = document.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    section.top_margin, section.bottom_margin = Mm(22), Mm(24)
    section.left_margin = section.right_margin = Mm(24)
    normal = cast(ParagraphStyle, document.styles["Normal"])
    normal.font.name = "Liberation Serif"
    normal.font.size = Pt(13)

    section.header.paragraphs[0].add_run().add_picture(str(LOGO), height=Mm(18))
    _pied_de_page_docx(section.footer, a.capital_social, Mm(210 - 24 - 24))

    date_lieu = document.add_paragraph(f"{LIEU}, le {a.fait_le:%d/%m/%Y}")
    date_lieu.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    date_lieu.paragraph_format.space_before = Mm(6)

    titre = document.add_paragraph()
    titre.alignment = WD_ALIGN_PARAGRAPH.CENTER
    titre.paragraph_format.space_before, titre.paragraph_format.space_after = Mm(20), Mm(14)
    texte_titre = titre.add_run(TITRE)
    texte_titre.bold, texte_titre.underline, texte_titre.font.size = True, True, Pt(19)

    for segments in corps(a):
        paragraphe = document.add_paragraph()
        paragraphe.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        paragraphe.paragraph_format.first_line_indent = Mm(12)
        paragraphe.paragraph_format.space_after = Mm(7)
        paragraphe.paragraph_format.line_spacing = 1.5
        for texte, gras in segments:
            paragraphe.add_run(texte).bold = gras

    signature = document.add_paragraph()
    signature.paragraph_format.space_before = Mm(24)
    signature.paragraph_format.left_indent = Mm(90)
    signature.alignment = WD_ALIGN_PARAGRAPH.CENTER
    signature.add_run(SIGNATAIRE).bold = True

    flux = BytesIO()
    document.save(flux)
    return flux.getvalue()


def _pied_de_page_docx(pied: _Footer, capital_social: int, largeur: Length) -> None:
    """Le bandeau bleu du papier à en-tête : une cellule pleine largeur, texte blanc centré."""
    bandeau = pied.add_table(rows=1, cols=1, width=largeur)
    bandeau.alignment = WD_TABLE_ALIGNMENT.CENTER
    cellule = bandeau.cell(0, 0)
    # python-docx n'expose pas la trame d'une cellule : l'élément `w:shd` est posé directement.
    cellule._tc.get_or_add_tcPr().append(  # pyright: ignore[reportPrivateUsage, reportUnknownMemberType]
        parse_xml(f'<w:shd {nsdecls("w")} w:val="clear" w:color="auto" w:fill="{BLEU_BANDEAU}"/>')
    )
    for rang, ligne in enumerate(lignes_pied_de_page(capital_social)):
        paragraphe = cellule.paragraphs[0] if rang == 0 else cellule.add_paragraph()
        paragraphe.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraphe.paragraph_format.space_after = Pt(0)
        paragraphe.paragraph_format.line_spacing = 1.0
        texte = paragraphe.add_run(ligne)
        texte.font.name, texte.font.size, texte.font.color.rgb = "Calibri", Pt(7), BLANC


class LecteurCapitalSocial(Protocol):
    """Le paramètre `societe.capital-social` (port vers le domaine parametre)."""

    async def capital_social(self, session: AsyncSession) -> int: ...


class ServiceAttestation:
    def __init__(self, auditeur: Auditeur, parametres: LecteurCapitalSocial) -> None:
        self._auditeur = auditeur
        self._parametres = parametres

    async def generer(
        self, s: AsyncSession, i: int, civilite: Civilite, format_document: FormatDocument, aujourd_hui: date
    ) -> DocumentGenere:
        """Le document et son nom de fichier ; la civilité choisie est enregistrée sur la fiche si elle a changé."""
        async with s.begin():
            x = await repository.par_id(s, i)
            if x is None:
                raise EmployeeIntrouvable(i)
            raisons = manques(x)
            if raisons or x.matricule_cnss is None or x.date_declaration_cnss is None:
                raise AttestationImpossible(raisons)
            fonction = (await s.execute(select(Fonction.libelle).where(Fonction.id == x.fonction_id))).scalar_one()
            attestation = Attestation(
                civilite=civilite,
                nom_prenom=x.nom_prenom,
                cin=x.cin,
                matricule_cnss=x.matricule_cnss,
                depuis=x.date_declaration_cnss,
                fonction=fonction,
                fait_le=aujourd_hui,
                capital_social=await self._parametres.capital_social(s),
            )
            a_enregistrer = x.civilite != civilite
        if a_enregistrer:
            action = self._auditeur.auditer(s, "EMPLOYE_MODIFICATION", TypeOperation.UPDATE, "Employee", i)
            async with s.begin(), action as cible:
                fiche = await repository.par_id(s, i)
                if fiche is None:
                    raise EmployeeIntrouvable(i)
                fiche.civilite = civilite
                cible.perimetre["origine"] = "ATTESTATION_TRAVAIL"
                await s.flush()
        nom = f"Attestation_de_travail_{attestation.cin}"
        if format_document == FormatDocument.WORD:
            return DocumentGenere(construire_docx(attestation), f"{nom}.docx", TYPE_DOCX)
        contenu = await rendre_pdf(construire_html(attestation), RESSOURCES_PAIE)
        return DocumentGenere(contenu, f"{nom}.pdf", "application/pdf")
