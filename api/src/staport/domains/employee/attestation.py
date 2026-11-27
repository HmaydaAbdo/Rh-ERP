"""Attestation de travail (KAN-320) : PDF A4 ou Word sur le modèle de la Direction (STE STAPORT S.A., Marrakech).

Décisions du propriétaire (2026-11-25) : « depuis le » est la date de déclaration CNSS ; la fonction est le libellé
actuel, tel quel ; la civilité (Monsieur ou Madame) se choisit à l'impression et reste sur la fiche. L'attestation dit
que l'employé travaille « jusqu'à ce jour » : elle n'est délivrée qu'à un employé en poste, déclaré à la CNSS.

Le texte est écrit une seule fois (`corps`) et rendu en deux formats : le PDF (WeasyPrint, tout texte issu des données
passe par `html.escape`) à imprimer tel quel, et le Word (python-docx, 2026-11-27) à retoucher avant impression.
"""

from dataclasses import dataclass
from datetime import date
from html import escape
from io import BytesIO
from pathlib import Path
from typing import cast

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Mm, Pt, RGBColor
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
SERVICE = "Direction des Ressources Humaines"
LIEU = "Marrakech"
TITRE = "ATTESTATION DE TRAVAIL"
SIGNATAIRE = "La Direction"
APOSTROPHE = chr(0x2019)  # apostrophe typographique
TYPE_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
BLEU = RGBColor(0x1F, 0x3A, 0x5F)

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


def construire_html(a: Attestation) -> str:
    return "".join(
        [
            '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Attestation de travail</title><style>',
            CSS_ATTESTATION.read_text(encoding="utf-8"),
            "</style></head><body>",
            '<div class="entete"><img class="logo" src="logo-staport.png">',
            f'<div class="societe"><strong>{SOCIETE}</strong><br>{SERVICE}</div></div>',
            f'<div class="lieu-date">{LIEU}, le {a.fait_le:%d/%m/%Y}</div>',
            f"<h1>{TITRE}</h1>",
            *(f'<p class="corps">{_html(p)}</p>' for p in corps(a)),
            f'<div class="signature">{SIGNATAIRE}</div>',
            "</body></html>",
        ]
    )


def construire_docx(a: Attestation) -> bytes:
    """Le même texte que le PDF, en Word A4 : en-tête (logo, société), police Liberation Serif, marges identiques."""
    document = Document()
    section = document.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    section.top_margin, section.bottom_margin = Mm(22), Mm(24)
    section.left_margin = section.right_margin = Mm(24)
    normal = cast(ParagraphStyle, document.styles["Normal"])
    normal.font.name = "Liberation Serif"
    normal.font.size = Pt(13)

    entete = document.add_table(rows=1, cols=2)
    logo, societe = entete.rows[0].cells
    logo.paragraphs[0].add_run().add_picture(str(LOGO), height=Mm(18))
    droite = societe.paragraphs[0]
    droite.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    nom = droite.add_run(SOCIETE)
    nom.bold, nom.font.size, nom.font.color.rgb = True, Pt(12), BLEU
    droite.add_run().add_break()
    service = droite.add_run(SERVICE)
    service.font.size, service.font.color.rgb = Pt(10.5), BLEU

    date_lieu = document.add_paragraph(f"{LIEU}, le {a.fait_le:%d/%m/%Y}")
    date_lieu.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    date_lieu.paragraph_format.space_before = Mm(14)

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


class ServiceAttestation:
    def __init__(self, auditeur: Auditeur) -> None:
        self._auditeur = auditeur

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
