"""Attestation de travail (KAN-320) : PDF A4 sur le modèle de la Direction (STE STAPORT S.A., Marrakech).

Décisions du propriétaire (2026-11-25) : « depuis le » est la date de déclaration CNSS ; la fonction est le libellé
actuel, tel quel ; la civilité se choisit à l'impression et reste sur la fiche. L'attestation dit que l'employé
travaille « jusqu'à ce jour » : elle n'est délivrée qu'à un employé en poste, déclaré à la CNSS. Tout texte issu des
données passe par `html.escape`.
"""

from dataclasses import dataclass
from datetime import date
from html import escape
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.pdf import rendre_pdf
from staport.domains.function.models import Fonction
from staport.domains.paie import report as _rapport_paie

from . import repository
from .exceptions import AttestationImpossible, EmployeeIntrouvable
from .models import Civilite, Employee, EmployeeStatut

RESSOURCES_PAIE = Path(_rapport_paie.__file__).with_name("report")
CSS_ATTESTATION = Path(__file__).with_name("report") / "attestation.css"
SOCIETE = "STAPORT S.A."
LIEU = "Marrakech"
APOSTROPHE = chr(0x2019)  # apostrophe typographique

# Formule et accords selon la civilité.
FORMULES: dict[Civilite, tuple[str, str]] = {
    Civilite.MONSIEUR: ("Monsieur", ""),
    Civilite.MADAME: ("Madame", "e"),
    Civilite.MADEMOISELLE: ("Mademoiselle", "e"),
}


@dataclass(frozen=True)
class Attestation:
    civilite: Civilite
    nom_prenom: str
    cin: str
    matricule_cnss: str
    depuis: date
    fonction: str
    fait_le: date


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


def construire_html(a: Attestation) -> str:
    formule, accord = FORMULES[a.civilite]
    nom = escape(a.nom_prenom.upper())
    return "".join(
        [
            '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Attestation de travail</title><style>',
            CSS_ATTESTATION.read_text(encoding="utf-8"),
            "</style></head><body>",
            '<div class="entete"><img class="logo" src="logo-staport.png">',
            f'<div class="societe"><strong>{SOCIETE}</strong><br>Direction des Ressources Humaines</div></div>',
            f'<div class="lieu-date">{LIEU}, le {a.fait_le:%d/%m/%Y}</div>',
            "<h1>ATTESTATION DE TRAVAIL</h1>",
            f'<p class="corps">Nous soussignés, la société <strong>{SOCIETE}</strong>, ',
            "attestons par la présente que ",
            f"{formule} <strong>{nom}</strong>, titulaire de la CIN N° <strong>{escape(a.cin)}</strong>, ",
            f"immatriculé{accord} à la CNSS sous le N° <strong>{escape(a.matricule_cnss)}</strong>, ",
            "travaille au sein de notre société en qualité de ",
            f"<strong>{escape(a.fonction)}</strong> depuis le <strong>{a.depuis:%d/%m/%Y}</strong> ",
            f"jusqu{APOSTROPHE}à ce jour.</p>",
            '<p class="corps">La présente attestation est délivrée ',
            f"à l{APOSTROPHE}intéressé{accord} sur sa demande pour servir et valoir ce que de droit.</p>",
            '<div class="signature">La Direction</div>',
            "</body></html>",
        ]
    )


class ServiceAttestation:
    def __init__(self, auditeur: Auditeur) -> None:
        self._auditeur = auditeur

    async def generer(self, s: AsyncSession, i: int, civilite: Civilite, aujourd_hui: date) -> tuple[bytes, str]:
        """Le PDF et le nom de fichier ; la civilité choisie est enregistrée sur la fiche si elle a changé."""
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
        contenu = await rendre_pdf(construire_html(attestation), RESSOURCES_PAIE)
        return contenu, f"Attestation_de_travail_{attestation.cin}.pdf"
