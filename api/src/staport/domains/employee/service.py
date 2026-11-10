from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from typing import Any, cast

from openpyxl import Workbook, load_workbook
from openpyxl.utils.datetime import from_excel  # pyright: ignore
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.montant import arrondir_montant
from staport.domains.common.optimiste import verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from . import repository
from .exceptions import (
    EmployeeDejaExistant,
    EmployeeIntrouvable,
    EmployeeUtilise,
    ErreurImportEmployee,
    ReferenceInvalide,
)
from .models import Employee, EmployeeSortie
from .schemas import (
    ChantierResume,
    DimensionEmployes,
    EmployeeAnalytiqueReponse,
    EmployeeCreationRequete,
    EmployeeImportReponse,
    EmployeeLigneIgnoree,
    EmployeeModificationRequete,
    EmployeeRecherche,
    EmployeeRegroupementReponse,
    EmployeeReponse,
    EmployeeSortieReponse,
    EmployeeSortiesMoisReponse,
    EquipeResume,
    FonctionResume,
    TrancheReponse,
    TriRegroupement,
)


def _annees_revolues(depuis: date, jour: date) -> int:
    """Années entières écoulées (`Period.between(depuis, jour).getYears()`)."""
    return jour.year - depuis.year - ((jour.month, jour.day) < (depuis.month, depuis.day))


def _moins_un_an(jour: date) -> date:
    """`LocalDate.minusYears(1)` : un 29 février devient le 28."""
    try:
        return jour.replace(year=jour.year - 1)
    except ValueError:
        return jour.replace(year=jour.year - 1, day=28)


def _annees_moyennes(jours: int, effectif: int) -> Decimal | None:
    """Moyenne de jours en années à une décimale (HALF_UP sur 365,2425 jours) ; `None` sans employé."""
    if effectif == 0:
        return None
    return arrondir_montant(Decimal(jours) / (Decimal(effectif) * Decimal("365.2425")))


def _valeur_texte(valeur: str | None) -> str:
    """`String.valueOf` comparé sans casse : une valeur absente se lit « null »."""
    return "null" if valeur is None else valeur.lower()


async def reponses(s: AsyncSession, employes: list[Employee]) -> list[EmployeeReponse]:
    """Résumés de la fonction, du chantier et de l'équipe, chargés en lot (une requête par table, jamais par ligne)."""
    fonctions = {
        i: FonctionResume(id=i, libelle=libelle)
        for i, libelle in (
            await s.execute(
                select(Fonction.id, Fonction.libelle).where(Fonction.id.in_({x.fonction_id for x in employes}))
            )
        ).all()
    }
    chantiers = {
        i: ChantierResume(id=i, code=code, designation=designation)
        for i, code, designation in (
            await s.execute(
                select(Chantier.id, Chantier.code, Chantier.designation).where(
                    Chantier.id.in_({x.chantier_id for x in employes if x.chantier_id is not None})
                )
            )
        ).all()
    }
    equipes = {
        i: EquipeResume(id=i, code=code, libelle=libelle)
        for i, code, libelle in (
            await s.execute(
                select(Equipe.id, Equipe.code, Equipe.libelle).where(
                    Equipe.id.in_({x.equipe_id for x in employes if x.equipe_id is not None})
                )
            )
        ).all()
    }
    return [
        EmployeeReponse(
            id=x.id,
            version=x.version,
            nom_prenom=x.nom_prenom,
            cin=x.cin,
            date_naissance=x.date_naissance,
            date_embauche=x.date_embauche,
            fonction=fonctions[x.fonction_id],
            chantier=chantiers.get(x.chantier_id) if x.chantier_id is not None else None,
            equipe=equipes.get(x.equipe_id) if x.equipe_id is not None else None,
            salaire=x.salaire,
            type_salaire=x.type_salaire,
            statut=x.statut,
        )
        for x in employes
    ]


async def reponse(s: AsyncSession, x: Employee) -> EmployeeReponse:
    return (await reponses(s, [x]))[0]


ENTETES_IMPORT = ("Date d'embauche", "Nom & prénom", "CIN", "Fonction", "Chantier", "Date de naissance")


def _texte(valeur: Any) -> str | None:
    """`DataFormatter.formatCellValue` : le texte affiché de la cellule, `None` si elle est vide ou blanche."""
    if valeur is None or isinstance(valeur, bool):
        texte = None if valeur is None else str(valeur).upper()
    elif isinstance(valeur, float) and valeur.is_integer():
        texte = str(int(valeur))
    elif isinstance(valeur, datetime | date):
        texte = valeur.isoformat()
    else:
        texte = str(valeur)
    return None if texte is None or not texte.strip() else texte


def _date_cellule(valeur: Any) -> date | None:
    """`getCellAsLocalDate` : seule une cellule numérique (date ou nombre de série) donne une date."""
    if isinstance(valeur, datetime):
        return valeur.date()
    if isinstance(valeur, date):
        return valeur
    if isinstance(valeur, int | float) and not isinstance(valeur, bool):
        try:
            return from_excel(valeur).date()  # type: ignore[union-attr]
        except ValueError, OverflowError, TypeError:
            return None
    return None


def _raison_ligne(
    nom: str | None, cin: str | None, naissance: date | None, embauche: date | None, fonction: str | None,
    chantier: str | None,
) -> str | None:  # fmt: skip
    """`validerLigne` de Spring, dans le même ordre : champs, longueurs, date de naissance (les références ensuite)."""
    manquants = [
        libelle
        for libelle, valeur in (
            ("Nom & prénom", nom), ("CIN", cin), ("Date de naissance", naissance), ("Date d'embauche", embauche),
            ("Fonction", fonction), ("Chantier", chantier),
        )
        if valeur is None
    ]  # fmt: skip
    if manquants:
        return "Champs obligatoires manquants ou invalides : " + ", ".join(manquants)
    if len((nom or "").strip()) > 150 or len((cin or "").strip()) > 30:
        return "Nom/prénom ou CIN trop long"
    if cast(date, naissance) >= date.today():
        return "La date de naissance doit être antérieure à aujourd" + chr(0x2019) + "hui"
    return None


class ServiceEmployee:
    def __init__(self, auditeur: Auditeur):
        self._auditeur = auditeur

    async def rechercher(
        self, s: AsyncSession, c: EmployeeRecherche | None, p: Pagination, voit_paie: bool
    ) -> Page[EmployeeReponse]:
        async with s.begin():
            rows, total = await repository.rechercher(s, c or EmployeeRecherche(), p)
            contenu = await reponses(s, list(rows))
        if not voit_paie:
            for r in contenu:
                r.salaire = None
                r.type_salaire = None
        return creer_page(contenu, p.taille, p.page, total)

    async def lire(self, s: AsyncSession, i: int, voit_paie: bool) -> EmployeeReponse:
        async with s.begin():
            x = await self._obtenir(s, i)
            r = await reponse(s, x)
        if not voit_paie:
            r.salaire = None
            r.type_salaire = None
        return r

    async def departs(self, s: AsyncSession, i: int) -> list[tuple[int, int, str]]:
        """Départs enregistrés d'un employé `(employé, mois, motif)`, du plus ancien au plus récent."""
        async with s.begin():
            return await repository.sorties(s, i)

    @staticmethod
    async def _verifier_references(
        s: AsyncSession, fonction_id: int, chantier_id: int | None, equipe_id: int | None
    ) -> None:
        """Mêmes contrôles et même ordre que les `resolve…Reference` de Spring (fonction, chantier, équipe)."""
        if await s.get(Fonction, fonction_id) is None:
            raise ReferenceInvalide("Fonction", fonction_id)
        if chantier_id is not None and await s.get(Chantier, chantier_id) is None:
            raise ReferenceInvalide("Chantier", chantier_id)
        if equipe_id is not None and await s.get(Equipe, equipe_id) is None:
            raise ReferenceInvalide("Équipe", equipe_id)

    async def creer(self, s: AsyncSession, r: EmployeeCreationRequete, voit_paie: bool) -> EmployeeReponse:
        action = self._auditeur.auditer(s, "EMPLOYE_CREATION", TypeOperation.CREATE, "Employee")
        async with s.begin(), action as cible:
            cin = r.cin.strip()
            if await repository.existe_cin(s, cin):
                raise EmployeeDejaExistant(cin)
            await self._verifier_references(s, r.fonction_id, r.chantier_id, r.equipe_id)
            x = Employee(
                nom_prenom=r.nom_prenom,
                cin=cin,
                date_naissance=r.date_naissance,
                date_embauche=r.date_embauche,
                fonction_id=r.fonction_id,
                chantier_id=r.chantier_id,
                equipe_id=r.equipe_id,
                salaire=r.salaire if voit_paie else None,
                type_salaire=r.type_salaire if voit_paie else None,
            )
            s.add(x)
            await s.flush()
            cible.identifiant = x.id
            return await reponse(s, x)

    async def modifier(
        self, s: AsyncSession, i: int, r: EmployeeModificationRequete, voit_paie: bool
    ) -> EmployeeReponse:
        action = self._auditeur.auditer(s, "EMPLOYE_MODIFICATION", TypeOperation.UPDATE, "Employee", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            verifier_version(r.version, x.version)
            if await repository.existe_cin(s, r.cin.strip(), i):
                raise EmployeeDejaExistant(r.cin.strip())
            actif = r.statut.value == "ACTIF"
            await self._verifier_references(
                s, r.fonction_id, r.chantier_id if actif else None, r.equipe_id if actif else None
            )
            x.nom_prenom, x.cin, x.date_naissance, x.date_embauche, x.fonction_id, x.statut = (
                r.nom_prenom,
                r.cin.strip(),
                r.date_naissance,
                r.date_embauche,
                r.fonction_id,
                r.statut,
            )
            x.chantier_id, x.equipe_id = (r.chantier_id, r.equipe_id) if r.statut.value == "ACTIF" else (None, None)
            if voit_paie:
                x.salaire, x.type_salaire = r.salaire, r.type_salaire
            await s.flush()
            return await reponse(s, x)

    async def supprimer(self, s: AsyncSession, i: int) -> None:
        action = self._auditeur.auditer(s, "EMPLOYE_SUPPRESSION", TypeOperation.DELETE, "Employee", i)
        async with s.begin(), action:
            x = await self._obtenir(s, i)
            await s.delete(x)
            try:
                await s.flush()
            except IntegrityError as e:
                raise EmployeeUtilise from e

    async def analytique(self, s: AsyncSession, c: EmployeeRecherche | None) -> EmployeeAnalytiqueReponse:
        async with s.begin():
            rows, _ = await repository.rechercher(s, c or EmployeeRecherche(), Pagination(0, 100000, (("id", True),)))
        today = date.today()
        ages = [_annees_revolues(x.date_naissance, today) for x in rows]
        anciennetes = [max(0, _annees_revolues(x.date_embauche, today)) for x in rows]
        il_y_a_un_an = _moins_un_an(today)

        def tranches(valeurs: list[int], bornes: list[int]) -> list[TrancheReponse]:
            return [
                TrancheReponse(
                    min=b,
                    max=bornes[i + 1] if i + 1 < len(bornes) else None,
                    effectif=sum(v >= b and (i + 1 == len(bornes) or v < bornes[i + 1]) for v in valeurs),
                )
                for i, b in enumerate(bornes)
            ]

        n = len(rows)
        return EmployeeAnalytiqueReponse(
            effectif=n,
            actifs=sum(str(x.statut) == "ACTIF" for x in rows),
            inactifs=sum(str(x.statut) == "INACTIF" for x in rows),
            age_moyen=_annees_moyennes(sum((today - x.date_naissance).days for x in rows), n),
            anciennete_moyenne=_annees_moyennes(sum(max(0, (today - x.date_embauche).days) for x in rows), n),
            embauches_douze_mois=sum(il_y_a_un_an < x.date_embauche <= today for x in rows),
            par_age=tranches(ages, [0, 25, 35, 45, 55]),
            par_anciennete=tranches(anciennetes, [0, 1, 3, 5, 10]),
        )

    async def regrouper(
        self, s: AsyncSession, c: EmployeeRecherche | None, dimension: DimensionEmployes
    ) -> list[EmployeeRegroupementReponse]:
        """Parité `EmployeeAnalytiqueService.regrouper` : libellés lus en base, plus grand groupe d'abord."""
        async with s.begin():
            lignes = await repository.regrouper(s, c or EmployeeRecherche(), dimension)
        sans = "Sans chantier" if dimension is DimensionEmployes.CHANTIER else "Sans équipe"
        return [
            EmployeeRegroupementReponse(
                id=0 if i is None else i,
                code=None if i is None else code,
                libelle=sans if i is None else libelle or "",
                effectif=effectif,
                actifs=actifs,
            )
            for i, code, libelle, effectif, actifs in lignes
        ]

    async def regrouper_trie(
        self,
        s: AsyncSession,
        c: EmployeeRecherche | None,
        dimension: DimensionEmployes,
        tri: TriRegroupement,
        croissant: bool,
    ) -> list[EmployeeRegroupementReponse]:
        """Les groupes classés selon `tri` puis par code (absents en dernier) et identifiant, pour un ordre stable."""
        groupes = await self.regrouper(s, c, dimension)
        cle: dict[TriRegroupement, Callable[[EmployeeRegroupementReponse], Any]] = {
            TriRegroupement.EFFECTIF: lambda g: g.effectif,
            TriRegroupement.EN_POSTE: lambda g: g.actifs,
            TriRegroupement.LIBELLE: lambda g: _valeur_texte(g.libelle),
            TriRegroupement.CODE: lambda g: _valeur_texte(g.code),
        }
        stable = sorted(groupes, key=lambda g: (g.code is None, (g.code or "").lower(), g.id))
        return sorted(stable, key=cle[tri], reverse=not croissant)

    async def sorties_mois(self, s: AsyncSession, periode: int) -> EmployeeSortiesMoisReponse:
        async with s.begin():
            rows = (
                await s.execute(
                    select(EmployeeSortie.employee_id, Employee.nom_prenom, Employee.cin, EmployeeSortie.motif)
                    .join(Employee, Employee.id == EmployeeSortie.employee_id)
                    .where(EmployeeSortie.periode == periode)
                    .order_by(Employee.nom_prenom, EmployeeSortie.employee_id)
                )
            ).all()
        motifs: dict[str, int] = {}
        sorties: list[EmployeeSortieReponse] = []
        for employee_id, nom_prenom, cin, brut in rows:
            motif = brut.strip() or "NON_PRECISE"
            motifs[motif] = motifs.get(motif, 0) + 1
            sorties.append(
                EmployeeSortieReponse(
                    employe_id=employee_id, nom_prenom=nom_prenom, cin=cin, periode=periode, motif=motif
                )
            )
        return EmployeeSortiesMoisReponse(
            periode=periode, nombre=len(sorties), par_motif=dict(sorted(motifs.items())), sorties=sorties
        )

    @staticmethod
    def modele_import() -> BytesIO:
        """Classeur vierge aux six en-têtes de l'import (parité `EmployeeImportService.genererModele`)."""
        classeur = Workbook()
        feuille = cast(Worksheet, classeur.active)
        feuille.title = "Employés"
        feuille.append(list(ENTETES_IMPORT))
        for colonne in "ABCDEF":
            feuille.column_dimensions[colonne].width = 5000 / 256
        sortie = BytesIO()
        classeur.save(sortie)
        sortie.seek(0)
        return sortie

    async def importer(self, s: AsyncSession, contenu: bytes) -> EmployeeImportReponse:
        erreurs: list[EmployeeLigneIgnoree] = []
        nouveaux: list[Employee] = []
        try:
            feuille = load_workbook(BytesIO(contenu), read_only=True, data_only=True).active
            lignes = list(feuille.iter_rows(values_only=True)) if feuille is not None else []
        except Exception as exc:
            raise ErreurImportEmployee(
                "Fichier Excel illisible : le fichier n'est pas un classeur Excel (.xlsx) valide."
            ) from exc
        if not lignes:
            raise ErreurImportEmployee("Fichier vide.")
        if len(lignes[0]) < len(ENTETES_IMPORT):
            raise ErreurImportEmployee(
                f"Format de fichier invalide : {len(ENTETES_IMPORT)} colonnes attendues "
                f"({', '.join(ENTETES_IMPORT)}), {len(lignes[0])} trouvée(s)."
            )
        async with s.begin():
            fonctions = {
                libelle.strip().upper(): identifiant
                for identifiant, libelle in (await s.execute(select(Fonction.id, Fonction.libelle))).all()
            }
            chantiers = {
                code.strip().upper(): identifiant
                for identifiant, code in (
                    await s.execute(select(Chantier.id, Chantier.code).where(Chantier.actif.is_(True)))
                ).all()
            }
            cins = {x.strip().upper() for x in (await s.execute(select(Employee.cin))).scalars()}
            vus: set[str] = set()
            total = 0
            for numero, valeurs in enumerate(lignes[1:], 2):
                if all(_texte(v) is None for v in valeurs):  # `estLigneVide` : une ligne sans valeur n'est pas comptée
                    continue
                total += 1
                embauche, nom, cin, fonction, chantier, naissance = (
                    valeurs[i] if i < len(valeurs) else None for i in range(6)
                )
                embauche, naissance = _date_cellule(embauche), _date_cellule(naissance)
                nom, cin, fonction, chantier = _texte(nom), _texte(cin), _texte(fonction), _texte(chantier)
                raison = _raison_ligne(nom, cin, naissance, embauche, fonction, chantier)
                cle = (cin or "").strip().upper()
                if raison is None and cle in vus:
                    raison = "CIN en doublon dans le fichier"
                elif raison is None and cle in cins:
                    raison = "Un employé existe déjà avec ce CIN (à modifier depuis l'écran Employés)"
                elif raison is None and (fonction or "").strip().upper() not in fonctions:
                    raison = f"Fonction introuvable : {(fonction or '').strip()}"
                elif raison is None and (chantier or "").strip().upper() not in chantiers:
                    raison = f"Chantier introuvable ou clôturé : {(chantier or '').strip()}"
                if raison:
                    erreurs.append(EmployeeLigneIgnoree(numero_ligne=numero, cin=cin, nom_prenom=nom, raison=raison))
                    continue
                vus.add(cle)
                nouveaux.append(
                    Employee(
                        nom_prenom=(nom or "").strip(),
                        cin=(cin or "").strip(),
                        date_naissance=cast(date, naissance),
                        date_embauche=cast(date, embauche),
                        fonction_id=fonctions[(fonction or "").strip().upper()],
                        chantier_id=chantiers[(chantier or "").strip().upper()],
                    )
                )
            if not erreurs:
                s.add_all(nouveaux)
        return EmployeeImportReponse(
            total_lignes=total,
            crees=len(nouveaux) if not erreurs else 0,
            ignores=len(erreurs),
            lignes_ignorees=erreurs,
        )

    async def _obtenir(self, s: AsyncSession, i: int) -> Employee:
        x = await repository.par_id(s, i)
        if x is None:
            raise EmployeeIntrouvable(i)
        return x
