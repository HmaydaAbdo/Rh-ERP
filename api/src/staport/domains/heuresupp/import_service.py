"""Assistant d'import mensuel par chantier (parité de `HeuresSuppImportService`).

Analyse sans écriture, corrections explicites des fiches, import atomique par mois et chantier, remplacement explicite.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.fichier import decrire_fichier
from staport.domains.employee.models import Employee, TypeSalaire
from staport.domains.function.models import Fonction
from staport.domains.paie.models import Paie
from staport.domains.paie.observation import est_stc_ou_sortie
from staport.domains.paie.periode import afficher_periode

from . import calcul, import_fichier, repository
from .exceptions import HeuresSuppInvalide
from .import_fichier import Fichier, LigneFichier
from .models import HeureSupp
from .schemas import (
    ForfaitPrecedent,
    ImportAnalyse,
    ImportCorrections,
    ImportForfaits,
    ImportLigne,
    ImportPrerequis,
    ImportResultat,
)

PAIE_ABSENTE = "Aucune paie n'est disponible pour ce mois. Importez d'abord la paie de ce mois, puis recommencez."


@dataclass
class _Dossier:
    numero_ligne: int
    cin: str
    heures: Decimal | None
    source: LigneFichier | None
    erreurs: list[str] = field(default_factory=list[str])
    employe: Employee | None = None
    paie_id: int | None = None
    salaire_horaire: Decimal | None = None
    forfait: Decimal | None = None
    stc_ou_sortie: bool = False
    fonction_libelle: str | None = None


def _cle(cin: str | None) -> str:
    return "" if cin is None else cin.strip().upper()


def _nom_normalise(valeur: str | None) -> str:
    return "" if valeur is None else " ".join(valeur.strip().lower().split())


def _ecart(gauche: str | None, droite: str | None) -> bool:
    return _nom_normalise(gauche) != _nom_normalise(droite)


def _normaliser_forfaits(forfaits: ImportForfaits | None) -> dict[str, Decimal]:
    resultat: dict[str, Decimal] = {}
    for forfait in [] if forfaits is None else forfaits.forfaits:
        cle = _cle(forfait.cin)
        if cle in resultat:
            raise HeuresSuppInvalide(f"Un seul forfait par CIN peut être saisi dans ce lot : {forfait.cin}")
        resultat[cle] = forfait.montant_dh
    return resultat


async def _employe_par_cin(s: AsyncSession, cin: str) -> Employee | None:
    requete = select(Employee).where(func.upper(func.btrim(Employee.cin)) == _cle(cin))
    return (await s.execute(requete)).scalars().first()


async def _prerequis(s: AsyncSession, periode: int, chantier_id: int) -> ImportPrerequis:
    bulletins = (await s.execute(select(func.count()).select_from(Paie).where(Paie.periode == periode))).scalar_one()
    if bulletins == 0:
        return ImportPrerequis(
            periode=periode, chantier_id=chantier_id, bulletins_disponibles=0, pret=False, message=PAIE_ABSENTE
        )
    if await s.get(Chantier, chantier_id) is None:
        return ImportPrerequis(
            periode=periode,
            chantier_id=chantier_id,
            bulletins_disponibles=bulletins,
            pret=False,
            message="Le chantier sélectionné n'existe plus. Actualisez la liste des chantiers.",
        )
    return ImportPrerequis(
        periode=periode, chantier_id=chantier_id, bulletins_disponibles=bulletins, pret=True, message=None
    )


async def _prerequis_ou_echec(s: AsyncSession, periode: int, chantier_id: int) -> None:
    prerequis = await _prerequis(s, periode, chantier_id)
    if not prerequis.pret:
        raise HeuresSuppInvalide(prerequis.message or PAIE_ABSENTE)


async def _charger(s: AsyncSession, d: _Dossier, periode: int, chantier_id: int, remplacement: bool) -> None:
    employe = await _employe_par_cin(s, d.cin)
    if employe is None:
        d.erreurs.append("aucune fiche employé ne correspond à ce CIN ; créez la fiche avant de relancer l'analyse.")
        return
    d.employe = employe
    fonction = await s.get(Fonction, employe.fonction_id)
    d.fonction_libelle = None if fonction is None else fonction.libelle
    bulletin = await repository.paie_du_mois(s, employe.id, periode)
    if bulletin is None:
        d.erreurs.append("aucun bulletin de paie n'existe pour cet employé pendant le mois choisi.")
    else:
        d.paie_id = bulletin.id
        d.stc_ou_sortie = est_stc_ou_sortie(bulletin.observation)
    if d.heures is not None:
        if employe.salaire is None or employe.type_salaire is None:
            d.erreurs.append(
                "salaire ou type de salaire manquant sur la fiche employé ; complétez la paie avant l'import."
            )
        else:
            d.salaire_horaire = calcul.salaire_horaire(employe.salaire, TypeSalaire(employe.type_salaire))
    if not remplacement and await repository.existe(s, employe.id, periode, chantier_id):
        d.erreurs.append("une ligne existe déjà pour ce mois et ce chantier ; confirmez son remplacement explicite.")
    if d.stc_ou_sortie and await repository.forfait_sur_autre_chantier(s, employe.id, periode, chantier_id):
        d.erreurs.append(
            "un forfait existe déjà pour cet employé sur un autre chantier pendant le mois marqué STC/sortie."
        )


def _verifier_forfait(d: _Dossier) -> None:
    if d.employe is None or d.paie_id is None:
        return
    if d.stc_ou_sortie:
        d.erreurs.append("le forfait est interdit car la paie du même mois est marquée STC/sortie.")
    if d.forfait is None or d.forfait < 0 or d.forfait != d.forfait.to_integral_value():
        d.erreurs.append("le forfait doit être un montant en DH entier de dirhams, positif ou nul (sans décimales).")


async def _dossiers(
    s: AsyncSession,
    lignes: list[LigneFichier],
    periode: int,
    chantier_id: int,
    forfaits: dict[str, Decimal],
    remplacement: bool,
) -> dict[str, _Dossier]:
    dossiers: dict[str, _Dossier] = {}
    rattaches: set[str] = set()
    for ligne in lignes:
        cle = _cle(ligne.cin)
        d = _Dossier(ligne.numero_ligne, ligne.cin, ligne.heures, ligne)
        dossiers[cle] = d
        await _charger(s, d, periode, chantier_id, remplacement)
        if cle in forfaits:
            d.forfait = forfaits[cle]
            rattaches.add(cle)
            _verifier_forfait(d)
    for cin, montant in forfaits.items():
        if cin in rattaches:
            continue
        d = dossiers.setdefault(cin, _Dossier(0, cin, None, None))
        d.forfait = montant
        await _charger(s, d, periode, chantier_id, remplacement)
        _verifier_forfait(d)
    return dossiers


async def _analyser(
    s: AsyncSession,
    lignes: list[LigneFichier],
    periode: int,
    chantier_id: int,
    forfaits: dict[str, Decimal],
    remplacement: bool,
    lignes_zero: int,
    total_lignes: int,
) -> ImportAnalyse:
    await _prerequis_ou_echec(s, periode, chantier_id)
    dossiers = await _dossiers(s, lignes, periode, chantier_id, forfaits, remplacement)
    erreurs: list[str] = []
    resultats: list[ImportLigne] = []
    for d in dossiers.values():
        erreurs.extend(f"CIN {d.cin} : {e}" for e in d.erreurs)
        montant = (
            calcul.ZERO
            if d.heures is None or d.salaire_horaire is None
            else calcul.montant(d.salaire_horaire, d.heures)
        )
        stc = montant if d.stc_ou_sortie else calcul.ZERO
        net = montant - stc + (calcul.ZERO if d.forfait is None else d.forfait)
        resultats.append(
            ImportLigne(
                numero_ligne=d.numero_ligne,
                cin=d.cin,
                nom_prenom=None if d.employe is None else d.employe.nom_prenom,
                fonction=d.fonction_libelle if d.employe is not None else None,
                employe_id=None if d.employe is None else d.employe.id,
                nom_fichier=None if d.source is None else d.source.nom_prenom,
                fonction_fichier=None,
                identite_ecart=False,  # le rapprochement se fait par CIN uniquement, le nom n'est pas comparé
                fonction_ecart=False,
                forfait_seul=d.heures is None,
                heures_supplementaires=d.heures,
                salaire_horaire_dh=d.salaire_horaire,
                montant_dh=montant,
                stc_ou_sortie=d.stc_ou_sortie,
                stc_dh=stc,
                forfait_dh=d.forfait,
                net_a_payer_dh=net,
                erreurs=list(d.erreurs),
            )
        )
    return ImportAnalyse(
        periode=periode,
        chantier_id=chantier_id,
        total_lignes=total_lignes,
        lignes_zero=lignes_zero,
        lignes=resultats,
        erreurs=erreurs,
        pret=not erreurs,
    )


def _description(nom: str | None, contenu: bytes, periode: int, chantier_id: int) -> dict[str, Any]:
    return decrire_fichier(nom, contenu) | {"periode": afficher_periode(periode), "chantierId": chantier_id}


class ServiceImportHeuresSupp:
    def __init__(self, auditeur: Auditeur) -> None:
        self._auditeur = auditeur

    async def prerequis(self, s: AsyncSession, periode: int, chantier_id: int) -> ImportPrerequis:
        async with s.begin():
            return await _prerequis(s, periode, chantier_id)

    async def forfaits_precedents(self, s: AsyncSession, periode: int, chantier_id: int) -> list[ForfaitPrecedent]:
        async with s.begin():
            return [
                ForfaitPrecedent(
                    cin=employe.cin,
                    nom_prenom=employe.nom_prenom,
                    montant_dh=ligne.forfait if ligne.forfait is not None else Decimal(0),
                    periode=ligne.periode,
                )
                for ligne, employe in await repository.forfaits_precedents(s, periode, chantier_id)
            ]

    async def analyser(
        self,
        s: AsyncSession,
        nom: str | None,
        contenu: bytes,
        periode: int,
        chantier_id: int,
        forfaits: ImportForfaits | None,
    ) -> ImportAnalyse:
        async with s.begin():
            await _prerequis_ou_echec(s, periode, chantier_id)
            fichier = import_fichier.lire(nom, contenu)
            return await _analyser(
                s,
                fichier.lignes,
                periode,
                chantier_id,
                _normaliser_forfaits(forfaits),
                False,
                fichier.lignes_zero,
                fichier.total_lignes,
            )

    async def corriger(
        self,
        s: AsyncSession,
        nom: str | None,
        contenu: bytes,
        periode: int,
        chantier_id: int,
        corrections: ImportCorrections,
        forfaits: ImportForfaits | None,
    ) -> ImportAnalyse:
        action = self._auditeur.auditer(s, "HEURES_SUP_IMPORT_CORRECTION", TypeOperation.CREATE, "Employee")
        async with s.begin(), action as cible:
            cible.perimetre.update(_description(nom, contenu, periode, chantier_id))
            cible.perimetre["employesCrees"] = len(corrections.creer)
            cible.nombre_elements = len(corrections.creer)
            await _prerequis_ou_echec(s, periode, chantier_id)
            fichier = import_fichier.lire(nom, contenu)
            ecarts: dict[int, tuple[Employee, LigneFichier]] = {}
            inconnus: dict[int, LigneFichier] = {}
            for ligne in fichier.lignes:
                employe = await _employe_par_cin(s, ligne.cin)
                if employe is None:
                    inconnus[ligne.numero_ligne] = ligne
                elif _ecart(employe.nom_prenom, ligne.nom_prenom):
                    ecarts[employe.id] = (employe, ligne)
            alignes: set[int] = set()
            for alignement in corrections.aligner:
                if alignement.employe_id not in ecarts:
                    raise HeuresSuppInvalide(
                        f"L'employé {alignement.employe_id} n'a pas d'écart à aligner dans le fichier."
                    )
                if alignement.employe_id in alignes:
                    raise HeuresSuppInvalide("Un employé ne peut être aligné qu'une fois par correction.")
                alignes.add(alignement.employe_id)
                employe, ligne = ecarts[alignement.employe_id]
                employe.nom_prenom = ligne.nom_prenom
            traitees: set[int] = set()
            for creation in corrections.creer:
                ligne_inconnue = inconnus.get(creation.numero_ligne)
                if ligne_inconnue is None:
                    raise HeuresSuppInvalide(
                        f"La ligne {creation.numero_ligne} n'est pas un CIN inconnu du fichier. "
                        "Réanalysez le classeur avant de corriger."
                    )
                if creation.numero_ligne in traitees:
                    raise HeuresSuppInvalide(f"La ligne {creation.numero_ligne} est proposée plusieurs fois.")
                traitees.add(creation.numero_ligne)
                if await s.get(Fonction, creation.fonction_id) is None:
                    raise HeuresSuppInvalide(
                        f"La fonction sélectionnée pour la ligne {creation.numero_ligne} n'existe plus."
                    )
                s.add(
                    Employee(
                        nom_prenom=ligne_inconnue.nom_prenom,
                        cin=ligne_inconnue.cin,
                        date_naissance=creation.date_naissance,
                        date_embauche=creation.date_embauche,
                        fonction_id=creation.fonction_id,
                        chantier_id=chantier_id,
                        salaire=creation.salaire,
                        type_salaire=creation.type_salaire,
                    )
                )
            await s.flush()
            return await _analyser(
                s,
                fichier.lignes,
                periode,
                chantier_id,
                _normaliser_forfaits(forfaits),
                False,
                fichier.lignes_zero,
                fichier.total_lignes,
            )

    async def importer(
        self,
        s: AsyncSession,
        nom: str | None,
        contenu: bytes,
        periode: int,
        chantier_id: int,
        forfaits: ImportForfaits | None,
    ) -> ImportResultat:
        return await self._enregistrer(s, nom, contenu, periode, chantier_id, forfaits, remplacement=False)

    async def remplacer(
        self,
        s: AsyncSession,
        nom: str | None,
        contenu: bytes,
        periode: int,
        chantier_id: int,
        forfaits: ImportForfaits | None,
    ) -> ImportResultat:
        return await self._enregistrer(s, nom, contenu, periode, chantier_id, forfaits, remplacement=True)

    async def _enregistrer(
        self,
        s: AsyncSession,
        nom: str | None,
        contenu: bytes,
        periode: int,
        chantier_id: int,
        forfaits: ImportForfaits | None,
        *,
        remplacement: bool,
    ) -> ImportResultat:
        action = self._auditeur.auditer(
            s,
            "HEURES_SUP_REMPLACEMENT" if remplacement else "HEURES_SUP_IMPORT",
            TypeOperation.UPDATE if remplacement else TypeOperation.CREATE,
            "HeureSupp",
        )
        async with s.begin(), action as cible:
            cible.perimetre.update(_description(nom, contenu, periode, chantier_id))
            cible.perimetre["forfaits"] = 0 if forfaits is None else len(forfaits.forfaits)
            await _prerequis_ou_echec(s, periode, chantier_id)
            fichier = import_fichier.lire(nom, contenu)
            par_cin = _normaliser_forfaits(forfaits)
            analyse = await _analyser(
                s,
                fichier.lignes,
                periode,
                chantier_id,
                par_cin,
                remplacement,
                fichier.lignes_zero,
                fichier.total_lignes,
            )
            if not analyse.pret:
                raise HeuresSuppInvalide(
                    "L'import est bloqué : "
                    + " ".join(analyse.erreurs)
                    + " Corrigez les lignes puis relancez l'analyse."
                )
            resultat = await self._ecrire(s, fichier, periode, chantier_id, par_cin, remplacement)
            cible.perimetre.update(
                {
                    "heures": resultat.lignes_heures,
                    "forfaitsSeuls": resultat.forfaits_seuls,
                    "remplacements": resultat.remplacements,
                    "netTotalDh": float(resultat.net_total_dh),
                }
            )
            cible.nombre_elements = resultat.lignes_heures + resultat.forfaits_seuls
            return resultat

    @staticmethod
    async def _ecrire(
        s: AsyncSession,
        fichier: Fichier,
        periode: int,
        chantier_id: int,
        forfaits: dict[str, Decimal],
        remplacement: bool,
    ) -> ImportResultat:
        dossiers = await _dossiers(s, fichier.lignes, periode, chantier_id, forfaits, remplacement)
        nouvelles: list[HeureSupp] = []
        remplacements = forfaits_seuls = 0
        heures_totales = montant_total = stc_total = forfait_total = net_total = calcul.ZERO
        for d in dossiers.values():
            employe = d.employe
            if employe is None or d.paie_id is None:
                raise HeuresSuppInvalide("L'import est bloqué : une fiche ou un bulletin a disparu pendant l'import.")
            for existante in await repository.de_la_personne(s, employe.id, periode, chantier_id):
                if not remplacement:
                    raise HeuresSuppInvalide(
                        f"Une ligne existe déjà pour le CIN {employe.cin} sur ce mois et ce chantier. "
                        "Utilisez l'action explicite de remplacement après vérification."
                    )
                await s.delete(existante)
                remplacements += 1
            await s.flush()
            montant = (
                calcul.ZERO
                if d.heures is None or d.salaire_horaire is None
                else calcul.montant(d.salaire_horaire, d.heures)
            )
            stc = calcul.stc_dh(montant, d.stc_ou_sortie)
            net = calcul.net_a_payer(montant, stc, d.forfait)
            avec_heures = d.heures is not None
            nouvelles.append(
                HeureSupp(
                    employee_id=employe.id,
                    paie_id=d.paie_id,
                    fonction_id=employe.fonction_id,
                    chantier_id=chantier_id,
                    periode=periode,
                    heures=d.heures,
                    salaire_reference=employe.salaire if avec_heures else None,
                    type_salaire_reference=employe.type_salaire if avec_heures else None,
                    salaire_horaire=d.salaire_horaire if avec_heures else None,
                    montant=montant,
                    est_stc_ou_sortie=d.stc_ou_sortie,
                    stc_dh=stc,
                    forfait=d.forfait,
                    net_a_payer=net,
                )
            )
            if d.heures is None:
                forfaits_seuls += 1
            else:
                heures_totales += d.heures
            montant_total += montant
            stc_total += stc
            forfait_total += calcul.ZERO if d.forfait is None else d.forfait
            net_total += net
        s.add_all(nouvelles)
        try:
            await s.flush()
        except IntegrityError as erreur:  # un import concurrent a écrit la même ligne : la contrainte d'unicité tranche
            raise HeuresSuppInvalide(
                "Une ligne existe déjà pour un employé de ce lot, ce mois et ce chantier ; relancez l'analyse."
            ) from erreur
        return ImportResultat(
            periode=periode,
            chantier_id=chantier_id,
            lignes_heures=len(fichier.lignes),
            lignes_zero=fichier.lignes_zero,
            forfaits_seuls=forfaits_seuls,
            remplacements=remplacements,
            heures_totales=heures_totales,
            montant_total_dh=montant_total,
            stc_total_dh=stc_total,
            forfait_total_dh=forfait_total,
            net_total_dh=net_total,
        )
