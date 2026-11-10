"""Rapport PDF des heures supplémentaires (parité de `HeuresSuppExportPdfService`).

Mêmes filtres, même recherche et même tri que la vue Tabulaire, sur toutes les lignes du périmètre. Même police et même
bandeau que le rapport de paie. Tout texte issu des données passe par `html.escape` : aucun HTML de donnée
n'est interprété.
"""

from collections.abc import Sequence
from datetime import datetime
from decimal import ROUND_DOWN, Decimal
from html import escape
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.pdf import rendre_pdf
from staport.domains.paie import report as _rapport_paie
from staport.domains.paie.periode import afficher_periode

from . import repository
from .exceptions import HeuresSuppInvalide
from .schemas import HeuresSuppExportRequete, HeureSuppReponse
from .service import rep

LIGNES_MAX = 5000
RESSOURCES = Path(__file__).with_name("report")
RESSOURCES_PAIE = Path(_rapport_paie.__file__).with_name("report")
MOIS = (
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
LIBELLES_TRI = {
    "periode": "Mois",
    "chantier.code": "Chantier",
    "employee.nomPrenom": "Employé",
    "employee.cin": "CIN",
    "fonction.libelle": "Fonction",
    "salaireReference": "Salaire référence",
    "salaireHoraire": "S/H",
    "heures": "Nombre d'heures",
    "montant": "Montant",
    "stcDh": "STC",
    "forfait": "Forfait",
    "netAPayer": "Net à payer",
}
COLONNES = (
    ("Employé", ""),
    ("CIN", ""),
    ("Fonction", ""),
    ("Nombre d'heures", "num"),
    ("S/H", "num"),
    ("Montant", "num"),
    ("STC", "num"),
    ("Forfait", "num"),
    ("Net à payer", "num"),
)
LIBELLE_EMARGEMENT = {"signature": "Signature", "signature_empreinte": "Signature et empreinte"}


def _cellule_emargement(mode: str) -> str:
    if mode == "signature_empreinte":
        return '<td class="emargement signature_empreinte"></td>'
    return '<td class="emargement signature"></td>'


def trier(tri: str | None) -> tuple[tuple[str, bool], ...]:
    """Le tri de la vue Tabulaire : « propriété,asc|desc » ; sans tri, l'employé (nom prénom) de A à Z."""
    if tri is None or not tri.strip():
        return (("employee.nomPrenom", True),)
    parties = tri.split(",")
    propriete = parties[0].strip()
    sens_valide = len(parties) == 1 or (len(parties) == 2 and parties[1].strip().lower() in {"asc", "desc"})
    if propriete not in LIBELLES_TRI or not sens_valide:
        raise HeuresSuppInvalide(f"Tri non pris en charge pour l'export : {tri}")
    return ((propriete, not (len(parties) == 2 and parties[1].strip().lower() == "desc")),)


def mois_en_toutes_lettres(periode: int) -> str:
    annee, mois = divmod(periode, 100)
    return f"{MOIS[mois - 1]} {annee}"


def nombre(valeur: Decimal | None, decimales: int) -> str:
    """Format français : espace pour les milliers, virgule décimale ; « — » sans valeur."""
    if valeur is None:
        return "—"
    return f"{valeur:,.{decimales}f}".replace(",", " ").replace(".", ",")


def nombre_heures(valeur: Decimal | None) -> str:
    """Affiche les heures à l'entier inférieur, sans modifier leur valeur métier."""
    if valeur is None:
        return nombre(None, 0)
    return nombre(valeur.to_integral_value(rounding=ROUND_DOWN), 0)


def _td(texte: str, classe: str = "") -> str:
    return f'<td class="{classe}">{escape(texte)}</td>' if classe else f"<td>{escape(texte)}</td>"


def _liste(valeurs: Sequence[str], pluriel: str) -> str:
    return ", ".join(valeurs) if len(valeurs) <= 3 else f"{len(valeurs)} {pluriel}"


def _pluriel(n: int, singulier: str, pluriel: str) -> str:
    return f"{n} {pluriel if n > 1 else singulier}"


def contexte(requete: HeuresSuppExportRequete, lignes: Sequence[HeureSuppReponse]) -> str:
    """Sous le titre : le contenu du document et son ordre de lecture."""
    if not lignes:
        return "Aucune ligne pour ce périmètre."
    employes = len({ligne.employee_id for ligne in lignes})
    trie = requete.tri is not None and bool(requete.tri.strip())
    propriete = requete.tri.split(",")[0].strip() if trie and requete.tri else "employee.nomPrenom"
    decroissant = trie and bool(requete.tri and requete.tri.lower().endswith(",desc"))
    return (
        f"{_pluriel(len(lignes), 'ligne', 'lignes')} · {_pluriel(employes, 'employé', 'employés')}"
        f" · classées par {LIBELLES_TRI.get(propriete, 'Employé').lower()}"
        f" {'décroissant' if decroissant else 'croissant'}"
    )


def filtres(requete: HeuresSuppExportRequete, lignes: Sequence[HeureSuppReponse]) -> list[tuple[str, str]]:
    """Uniquement les filtres réellement appliqués, un par ligne."""
    resultat: list[tuple[str, str]] = []
    if lignes:
        resultat.append(("Mois", afficher_periode(lignes[0].periode)))
        resultat.append(("Chantier", " · ".join(x for x in (lignes[0].code_chantier, lignes[0].chantier) if x)))
    if requete.nom_prenom and requete.nom_prenom.strip():
        resultat.append(("Nom", requete.nom_prenom.strip()))
    if requete.cin and requete.cin.strip():
        resultat.append(("CIN", requete.cin.strip()))
    if requete.equipe_ids:
        resultat.append(("Équipes", _pluriel(len(requete.equipe_ids), "équipe", "équipes")))
    if requete.fonction_ids:
        resultat.append(("Fonctions", _liste(sorted({ligne.fonction for ligne in lignes}), "fonctions")))
    return resultat


def construire_html(requete: HeuresSuppExportRequete, lignes: Sequence[HeureSuppReponse], maintenant: datetime) -> str:
    css = (RESSOURCES / "rapport.css").read_text(encoding="utf-8")
    mois = requete.mois_demandes()
    titre = "Heures supplémentaires" + (" — " + ", ".join(mois_en_toutes_lettres(m) for m in mois) if mois else "")
    entete = [
        '<div class="page-header"><img class="logo" src="logo-staport.png">',
        '<div class="sep s1"></div><div class="bloc b1">Ressources Humaines</div><div class="sep s2"></div>',
        f'<div class="bloc b2"><span>{escape(titre)}</span><span class="contexte">'
        f"{escape(contexte(requete, lignes))}</span></div>",
    ]
    zone = filtres(requete, lignes)
    if zone:
        entete.append('<div class="sep s3"></div><div class="filtres">')
        entete.extend(
            f'<div><span class="lib">{escape(nom)}</span><span>{escape(valeur)}</span></div>' for nom, valeur in zone
        )
        entete.append("</div>")
    entete.append('<div class="filet"></div></div>')
    corps = [
        "".join(entete),
        f'<div class="pied">Édité le {maintenant:%d/%m/%Y} à {maintenant:%H:%M}</div>',
        '<table class="heures"><thead><tr>',
        "".join(
            f'<th class="{classe}">{escape(nom)}</th>' if classe else f"<th>{escape(nom)}</th>"
            for nom, classe in COLONNES
        )
        + f'<th class="emargement {requete.mode}">{escape(LIBELLE_EMARGEMENT[requete.mode])}</th>',
        "</tr></thead><tbody>",
    ]
    for ligne in lignes:
        corps.append(
            "<tr>"
            + _td(ligne.nom_prenom)
            + _td(ligne.cin)
            + _td(ligne.fonction)
            + _td(nombre_heures(ligne.heures_supplementaires), "num")
            + _td(nombre(ligne.salaire_horaire_dh, 0), "num")
            + _td(nombre(ligne.montant_dh, 0), "num")
            + _td(nombre(ligne.stc_dh, 0), "num")
            + _td(nombre(ligne.forfait_dh, 0), "num")
            + _td(nombre(ligne.net_a_payer_dh, 0), "num")
            + _cellule_emargement(requete.mode)
            + "</tr>"
        )
    zero = Decimal(0)
    heures = sum(
        (
            valeur.to_integral_value(rounding=ROUND_DOWN)
            for ligne in lignes
            if (valeur := ligne.heures_supplementaires) is not None
        ),
        zero,
    )
    corps.append(
        '<tr class="total">'
        + f'<td colspan="3">{escape("Total · " + _pluriel(len(lignes), "ligne", "lignes"))}</td>'
        + _td(nombre(heures, 0), "num")
        + '<td class="num"></td>'
        + _td(nombre(sum((ligne.montant_dh for ligne in lignes), zero), 0), "num")
        + _td(nombre(sum((ligne.stc_dh for ligne in lignes), zero), 0), "num")
        + _td(nombre(sum((ligne.forfait_dh or zero for ligne in lignes), zero), 0), "num")
        + _td(nombre(sum((ligne.net_a_payer_dh for ligne in lignes), zero), 0), "num")
        + "<td></td></tr></tbody></table>"
    )
    return (
        '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Heures supplémentaires</title>'
        f"<style>{css}</style></head><body>{''.join(corps)}</body></html>"
    )


def nom_fichier(requete: HeuresSuppExportRequete) -> str:
    mois = requete.mois_demandes()
    suffixe = afficher_periode(mois[0]) if len(mois) == 1 else "tous-les-mois" if not mois else "plusieurs-mois"
    return f"Heures_supplementaires_{suffixe}.pdf"


class ServiceExportPdfHeuresSupp:
    async def generer(self, s: AsyncSession, requete: HeuresSuppExportRequete) -> bytes:
        tri = trier(requete.tri)
        if len(requete.mois_demandes()) != 1 or len(set(requete.chantier_ids or [])) != 1:
            raise HeuresSuppInvalide(
                "L'export PDF porte sur un seul mois et un seul chantier : filtrez-les avant d'exporter."
            )
        async with s.begin():
            fiches = await repository.toutes(s, requete.criteres(), tri)
        if len(fiches) > LIGNES_MAX:
            raise HeuresSuppInvalide(
                f"L'export dépasse {LIGNES_MAX} lignes. Affinez les filtres (mois, chantier, employé) avant d'exporter."
            )
        html = construire_html(requete, [rep(fiche) for fiche in fiches], datetime.now())
        return await rendre_pdf(html, RESSOURCES_PAIE)
