from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from typing import cast

from openpyxl import Workbook, load_workbook
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from . import repository
from .exceptions import EmployeeDejaExistant, EmployeeIntrouvable, EmployeeUtilise
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
)


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


class ServiceEmployee:
    def __init__(self, auditeur: Auditeur):
        self._auditeur = auditeur

    async def rechercher(self, s: AsyncSession, c: EmployeeRecherche | None, p: Pagination) -> Page[EmployeeReponse]:
        async with s.begin():
            rows, total = await repository.rechercher(s, c or EmployeeRecherche(), p)
            contenu = await reponses(s, list(rows))
        return creer_page(contenu, p.taille, p.page, total)

    async def lire(self, s: AsyncSession, i: int, voit_paie: bool) -> EmployeeReponse:
        async with s.begin():
            x = await self._obtenir(s, i)
            r = await reponse(s, x)
        if not voit_paie:
            r.salaire = None
            r.type_salaire = None
        return r

    async def creer(self, s: AsyncSession, r: EmployeeCreationRequete, voit_paie: bool) -> EmployeeReponse:
        action = self._auditeur.auditer(s, "EMPLOYE_CREATION", TypeOperation.CREATE, "Employee")
        async with s.begin(), action as cible:
            cin = r.cin.strip()
            if await repository.existe_cin(s, cin):
                raise EmployeeDejaExistant(cin)
            x = Employee(
                nom_prenom=r.nom_prenom.strip(),
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
                raise EmployeeDejaExistant(r.cin)
            x.nom_prenom, x.cin, x.date_naissance, x.date_embauche, x.fonction_id, x.statut = (
                r.nom_prenom.strip(),
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
        ages = [
            max(
                0,
                today.year
                - x.date_naissance.year
                - ((today.month, today.day) < (x.date_naissance.month, x.date_naissance.day)),
            )
            for x in rows
        ]
        anciennetes = [
            max(
                0,
                today.year
                - x.date_embauche.year
                - ((today.month, today.day) < (x.date_embauche.month, x.date_embauche.day)),
            )
            for x in rows
        ]

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
            actifs=sum(x.statut.value == "ACTIF" for x in rows),
            inactifs=sum(x.statut.value == "INACTIF" for x in rows),
            age_moyen=Decimal(str(round(sum(ages) / n, 1))) if n else None,
            anciennete_moyenne=Decimal(str(round(sum(anciennetes) / n, 1))) if n else None,
            embauches_douze_mois=sum(today.replace(year=today.year - 1) < x.date_embauche <= today for x in rows),
            par_age=tranches(ages, [0, 25, 35, 45, 55]),
            par_anciennete=tranches(anciennetes, [0, 1, 3, 5, 10]),
        )

    async def regrouper(
        self, s: AsyncSession, c: EmployeeRecherche | None, dimension: DimensionEmployes
    ) -> list[EmployeeRegroupementReponse]:
        async with s.begin():
            rows, _ = await repository.rechercher(s, c or EmployeeRecherche(), Pagination(0, 100000, (("id", True),)))
        champ = {
            DimensionEmployes.CHANTIER: "chantier_id",
            DimensionEmployes.EQUIPE: "equipe_id",
            DimensionEmployes.FONCTION: "fonction_id",
        }[dimension]
        groupes: dict[int, list[Employee]] = {}
        for row in rows:
            identifiant = getattr(row, champ) or 0
            groupes.setdefault(identifiant, []).append(row)
        return [
            EmployeeRegroupementReponse(
                id=i,
                code=None,
                libelle="Sans affectation" if i == 0 else str(i),
                effectif=len(v),
                actifs=sum(x.statut.value == "ACTIF" for x in v),
            )
            for i, v in sorted(groupes.items())
        ]

    async def sorties_mois(self, s: AsyncSession, periode: int) -> EmployeeSortiesMoisReponse:
        async with s.begin():
            rows = (
                (
                    await s.execute(
                        select(EmployeeSortie)
                        .where(EmployeeSortie.periode == periode)
                        .order_by(EmployeeSortie.employee_id)
                    )
                )
                .scalars()
                .all()
            )
        motifs: dict[str, int] = {}
        sorties: list[EmployeeSortieReponse] = []
        for row in rows:
            motif = row.motif.strip() or "NON_PRECISE"
            motifs[motif] = motifs.get(motif, 0) + 1
            sorties.append(EmployeeSortieReponse(employe_id=row.employee_id, periode=row.periode, motif=motif))
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
            if feuille is None:
                raise ValueError("Classeur sans feuille")
            lignes = list(feuille.iter_rows(values_only=True))
        except Exception as exc:
            raise ValueError(f"Fichier Excel illisible : {exc}") from exc
        if not lignes or len(lignes[0]) < 6:
            raise ValueError(
                "Six colonnes attendues : Date d'embauche, Nom & prénom, CIN, Fonction, Chantier, Date de naissance"
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
            for numero, valeurs in enumerate(lignes[1:], 2):
                embauche, nom, cin, fonction, chantier, naissance = (
                    valeurs[i] if i < len(valeurs) else None for i in range(6)
                )
                cle = str(cin or "").strip().upper()
                raison = None
                if isinstance(naissance, datetime):
                    naissance = naissance.date()
                if isinstance(embauche, datetime):
                    embauche = embauche.date()
                if not nom or not cle or not fonction or not chantier or not naissance or not embauche:
                    raison = "Champs obligatoires manquants"
                elif not isinstance(naissance, date) or naissance >= date.today():
                    raison = "La date de naissance doit être passée"
                elif cle in cins or cle in vus:
                    raison = "CIN déjà présent ou en doublon"
                elif str(fonction).strip().upper() not in fonctions:
                    raison = f"Fonction introuvable : {fonction}"
                elif str(chantier).strip().upper() not in chantiers:
                    raison = f"Chantier introuvable ou clôturé : {chantier}"
                if raison:
                    erreurs.append(
                        EmployeeLigneIgnoree(
                            numero_ligne=numero, cin=cle or None, nom_prenom=str(nom) if nom else None, raison=raison
                        )
                    )
                    continue
                vus.add(cle)
                nouveaux.append(
                    Employee(
                        nom_prenom=str(nom).strip(),
                        cin=cle,
                        date_naissance=naissance,
                        date_embauche=embauche,
                        fonction_id=fonctions[str(fonction).strip().upper()],
                        chantier_id=chantiers[str(chantier).strip().upper()],
                    )
                )
            if not erreurs:
                s.add_all(nouveaux)
        return EmployeeImportReponse(
            total_lignes=len(lignes) - 1,
            crees=len(nouveaux) if not erreurs else 0,
            ignores=len(erreurs),
            lignes_ignorees=erreurs,
        )

    async def _obtenir(self, s: AsyncSession, i: int) -> Employee:
        x = await repository.par_id(s, i)
        if x is None:
            raise EmployeeIntrouvable(i)
        return x
