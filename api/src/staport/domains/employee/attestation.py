"""Attestation de travail (KAN-320) : document Word A4 sur le modèle de la Direction (STE STAPORT S.A., Marrakech).

Décisions du propriétaire (2026-11-25) : « depuis le » est la date de déclaration CNSS ; la fonction est le libellé
actuel, tel quel ; la civilité (Monsieur ou Madame) se choisit à l'impression et reste sur la fiche. L'attestation dit
que l'employé travaille « jusqu'à nos jours » : elle n'est délivrée qu'à un employé en poste, déclaré à la CNSS.

Le document est un Word (python-docx), à retoucher puis imprimer : le PDF a été retiré (décision du propriétaire,
2026-11-27). Il reproduit le modèle retouché par le propriétaire (2026-11-27) : Bahnschrift Light 14 pt, date en
majuscules et en gras, titre en gras 16 pt, corps aligné à gauche en interligne 1,5 avec la raison sociale et les
données de l'employé en gras, « La Direction » centrée en 15 pt.

En-tête et pied de page suivent le papier à en-tête de la société (2026-11-27) : le logo seul en haut ; en bas, le
bandeau bleu des coordonnées légales. Le capital social y est lu dans les paramètres (`societe.capital-social`),
modifiable depuis l'écran Paramètres.
"""

from dataclasses import dataclass
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Protocol, cast

from docx import Document
from docx.document import Document as DocumentObject
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
from staport.domains.function.models import Fonction
from staport.domains.paie import report as _rapport_paie

from . import repository
from .exceptions import AttestationImpossible, EmployeeIntrouvable
from .models import Civilite, Employee, EmployeeStatut

LOGO = Path(_rapport_paie.__file__).with_name("report") / "logo-staport.png"
POLICE = "Bahnschrift Light"
TAILLE_CONTENU = Pt(14)
TAILLE_TITRE = Pt(16)
TAILLE_SIGNATURE = Pt(15)
TAILLE_VIDE = Pt(11)  # les lignes vides de petite taille du modèle
ESPACE_AVANT = Pt(10)  # espace avant chaque paragraphe du modèle
INTERLIGNE_CORPS = 1.5
RETRAITS_CORPS = (Mm(20), Mm(15))  # retrait de première ligne de chaque paragraphe du corps, comme sur le modèle
HAUTEUR_LOGO = Mm(26)
SOCIETE = "STE STAPORT S.A"
LIEU = "MARRAKECH"
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

# Abréviation de la civilité et accord selon la civilité.
FORMULES: dict[Civilite, tuple[str, str]] = {
    Civilite.MONSIEUR: ("Mr.", ""),
    Civilite.MADAME: ("Mme", "e"),
}
VOYELLES = frozenset("AEIOUYÀÂÉÈÊËÎÏÔÛÙ")

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
    """Le texte de l'attestation ; la raison sociale et les données de l'employé sont en gras."""
    formule, accord = FORMULES[a.civilite]
    # « en qualité d'AGENT », « en qualité de CHAUFFEUR » : élision devant une voyelle.
    qualite = f"d{APOSTROPHE}" if a.fonction[:1].upper() in VOYELLES else "de "
    return [
        [
            ("Nous soussignés, la ", False),
            (SOCIETE, True),
            (". attestons par la présente que ", False),
            (f"{formule} {a.nom_prenom.upper()}", True),
            (" titulaire de la CIN N° ", False),
            (a.cin, True),
            (f", immatriculé{accord} à la CNSS sous N° ", False),
            (a.matricule_cnss, True),
            (f", travaille au sein de notre Société en qualité {qualite}", False),
            (a.fonction, True),
            (" depuis le ", False),
            (f"{a.depuis:%d/%m/%Y}", True),
            (f" jusqu{APOSTROPHE}à nos jours.", False),
        ],
        [
            (
                f"La présente attestation est délivrée à l{APOSTROPHE}intéressé{accord} sur sa demande pour servir et "
                "valoir ce que de droit.",
                False,
            )
        ],
    ]


def lignes_pied_de_page(capital_social: int) -> list[str]:
    """Le bandeau de pied de page, ligne par ligne ; le capital s'écrit « 70 000 000,00Dh » comme sur le papier."""
    capital = f"{capital_social:,}".replace(",", " ")
    return [*PIED_AVANT_CAPITAL, f"Capital Social : {capital},00Dh | {IDENTIFIANTS_LEGAUX}"]


def construire_docx(a: Attestation) -> bytes:
    """L'attestation en Word A4 : le logo en en-tête, le bandeau des coordonnées en pied de page."""
    document = Document()
    section = document.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    # Toute la largeur de la page (décision du propriétaire, 2026-11-27) : marges latérales de 15 mm, logo près du bord,
    # bandeau de pied de page d'un bord à l'autre.
    section.top_margin, section.bottom_margin = Mm(40), Mm(40)
    section.left_margin = section.right_margin = Mm(15)
    section.header_distance, section.footer_distance = Mm(10), Mm(8)
    normal = cast(ParagraphStyle, document.styles["Normal"])
    normal.font.name = POLICE
    normal.font.size = TAILLE_CONTENU
    normal.paragraph_format.space_before, normal.paragraph_format.space_after = ESPACE_AVANT, Pt(0)
    normal.paragraph_format.line_spacing = 1.15

    logo = section.header.paragraphs[0]
    logo.paragraph_format.space_before = Pt(0)
    logo.add_run().add_picture(str(LOGO), height=HAUTEUR_LOGO)
    _pied_de_page_docx(section.footer, a.capital_social, Mm(210))

    date_lieu = document.add_paragraph()
    date_lieu.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    date_lieu.add_run(f"{LIEU} LE {a.fait_le:%d/%m/%Y}").bold = True
    _lignes_vides(document, TAILLE_CONTENU, TAILLE_VIDE)

    titre = document.add_paragraph()
    titre.alignment = WD_ALIGN_PARAGRAPH.CENTER
    texte_titre = titre.add_run(TITRE)
    texte_titre.bold, texte_titre.font.size = True, TAILLE_TITRE
    _lignes_vides(document, TAILLE_VIDE, TAILLE_VIDE)

    for segments, retrait in zip(corps(a), RETRAITS_CORPS, strict=True):
        paragraphe = document.add_paragraph()
        paragraphe.paragraph_format.first_line_indent = retrait
        paragraphe.paragraph_format.line_spacing = INTERLIGNE_CORPS
        for texte, gras in segments:
            paragraphe.add_run(texte).bold = gras
    _lignes_vides(document, TAILLE_CONTENU, TAILLE_VIDE, TAILLE_VIDE)

    signature = document.add_paragraph()
    signature.alignment = WD_ALIGN_PARAGRAPH.CENTER
    signature.add_run(SIGNATAIRE).font.size = TAILLE_SIGNATURE

    flux = BytesIO()
    document.save(flux)
    return flux.getvalue()


def _lignes_vides(document: DocumentObject, *tailles: Length) -> None:
    """Les lignes vides du modèle entre les blocs : la hauteur d'une ligne vide est la taille de sa marque de
    paragraphe, que python-docx n'expose pas (`w:rPr` du `w:pPr` posé directement)."""
    for taille in tailles:
        marque = document.add_paragraph()._p.get_or_add_pPr()  # pyright: ignore[reportPrivateUsage]
        marque.append(parse_xml(f'<w:rPr {nsdecls("w")}><w:sz w:val="{round(taille.pt * 2)}"/></w:rPr>'))  # pyright: ignore[reportUnknownMemberType]


def _pied_de_page_docx(pied: _Footer, capital_social: int, largeur: Length) -> None:
    """Le bandeau bleu du papier à en-tête : une cellule de la largeur de la feuille, centrée, texte blanc centré."""
    bandeau = pied.add_table(rows=1, cols=1, width=largeur)
    bandeau.alignment = WD_TABLE_ALIGNMENT.CENTER
    bandeau.autofit = False
    cellule = bandeau.cell(0, 0)
    cellule.width = bandeau.columns[0].width = largeur
    # python-docx n'expose pas la trame d'une cellule : l'élément `w:shd` est posé directement.
    cellule._tc.get_or_add_tcPr().append(  # pyright: ignore[reportPrivateUsage, reportUnknownMemberType]
        parse_xml(f'<w:shd {nsdecls("w")} w:val="clear" w:color="auto" w:fill="{BLEU_BANDEAU}"/>')
    )
    for rang, ligne in enumerate(lignes_pied_de_page(capital_social)):
        paragraphe = cellule.paragraphs[0] if rang == 0 else cellule.add_paragraph()
        paragraphe.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraphe.paragraph_format.space_before = paragraphe.paragraph_format.space_after = Pt(0)
        paragraphe.paragraph_format.line_spacing = 1.0
        texte = paragraphe.add_run(ligne)
        texte.font.name, texte.font.size, texte.font.color.rgb = POLICE, Pt(7), BLANC


class LecteurCapitalSocial(Protocol):
    """Le paramètre `societe.capital-social` (port vers le domaine parametre)."""

    async def capital_social(self, session: AsyncSession) -> int: ...


class ServiceAttestation:
    def __init__(self, auditeur: Auditeur, parametres: LecteurCapitalSocial) -> None:
        self._auditeur = auditeur
        self._parametres = parametres

    async def generer(self, s: AsyncSession, i: int, civilite: Civilite, aujourd_hui: date) -> DocumentGenere:
        """Le Word et son nom de fichier ; la civilité choisie est enregistrée sur la fiche si elle a changé."""
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
        return DocumentGenere(construire_docx(attestation), f"Attestation_de_travail_{attestation.cin}.docx")
