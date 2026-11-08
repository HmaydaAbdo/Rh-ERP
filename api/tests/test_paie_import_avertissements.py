from collections.abc import AsyncGenerator, Iterator
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace as Ligne
from typing import Any, cast

import pytest
from openpyxl import Workbook, load_workbook
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, AuditeurJournal
from staport.domains.common.montant import arrondir_montant
from staport.domains.employee.models import EmployeeStatut
from staport.domains.paie.exceptions import ErreurImportPaie
from staport.domains.paie.import_service import (
    MOTIF_ABSENT_DU_FICHIER,
    ServiceImportPaie,
    lire_lignes_paie,
    montant_ligne,
    signature_ligne,
)
from staport.domains.paie.models import Paie
from staport.domains.paie.schemas import (
    PaieImportAnalyse,
    PaieImportControlePeriode,
    PaieImportDepartConfirme,
    PaieImportDeparts,
    PaieImportErreur,
)

VIDE = Ligne(scalar_one_or_none=lambda: None, scalars=lambda: iter(()), all=list)


@pytest.mark.asyncio
async def test_ignorer_salaire_zero_ne_confirme_pas_un_changement_de_salaire(monkeypatch: pytest.MonkeyPatch) -> None:
    service = ServiceImportPaie(cast(Auditeur, object()))

    async def analyser(_session: AsyncSession, _contenu: bytes, _periode: int) -> PaieImportAnalyse:
        return PaieImportAnalyse(
            periode=202610,
            total_lignes=2,
            erreurs=[],
            chantiers_clotures=[],
            cin_inconnus=[],
            ecarts=[],
            departs=[],
            retours=[],
            avertissements=[
                PaieImportErreur(
                    numero_ligne=4,
                    cin="AA1",
                    nom_prenom="Alice",
                    champ="salaireMensuel",
                    valeur="0",
                    raison="salaire nul : cliquer sur « Ignorer et conserver 0 »",
                    avertissement=True,
                    code_avertissement="SALAIRE_ZERO",
                ),
                PaieImportErreur(
                    numero_ligne=5,
                    cin="BB2",
                    nom_prenom="Bob",
                    champ="salaireMensuel",
                    valeur="0",
                    raison="salaire différent de la dernière paie : confirmation wizard requise",
                    avertissement=True,
                    code_avertissement="SALAIRE_DIFFERENT",
                ),
            ],
            pret=False,
        )

    monkeypatch.setattr(service, "analyser", analyser)
    with pytest.raises(ErreurImportPaie, match="L'analyse n'est pas prête"):
        await service.importer(
            cast(AsyncSession, object()), b"", 202610, ignorer_salaires_zero=True, departs_confirmes=PaieImportDeparts()
        )


def test_lecteur_ignore_les_lignes_vides_sans_perdre_le_numero_excel() -> None:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    feuille["A4"] = "Alice"
    feuille["A5"] = "   "
    feuille["A7"] = "Bob"
    sortie = BytesIO()
    classeur.save(sortie)
    assert [(numero, ligne[0]) for numero, ligne in lire_lignes_paie(sortie.getvalue())] == [(4, "Alice"), (7, "Bob")]


def test_modele_import_contient_les_treize_colonnes_sans_ligne_d_exemple() -> None:
    contenu = ServiceImportPaie(cast(Auditeur, object())).generer_modele()
    classeur = load_workbook(contenu, read_only=True)
    feuille = classeur.active
    assert feuille is not None and feuille.title == "Paie"
    assert feuille.max_row == 3
    assert [cellule.value for cellule in feuille[3]] == [
        "Nom & prénom",
        "Fonction",
        "CIN",
        "Nbre Jrs",
        "J.R.O",
        "J.R.D",
        "Salaire",
        "Prime RO",
        "Prime RD",
        "Total",
        "Observation",
        "Chantier",
        "Équipe",
    ]
    classeur.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("chantier_actif", [True, False])
@pytest.mark.parametrize("salaire_fichier", [0, 1000])
async def test_analyse_signale_un_bulletin_deja_present_avant_import(
    chantier_actif: bool, salaire_fichier: int
) -> None:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    feuille["A4"] = "Alice"
    feuille["B4"] = "Conducteur"
    feuille["C4"] = "AA1"
    feuille["D4"] = 20
    feuille["G4"] = salaire_fichier
    feuille["J4"] = salaire_fichier
    feuille["L4"] = "C168"
    sortie = BytesIO()
    classeur.save(sortie)

    class SessionAnalyse:
        def __init__(self) -> None:
            resultats: list[list[object]] = [
                [
                    Ligne(
                        id=7,
                        cin="AA1",
                        nom_prenom="Alice",
                        fonction_id=1,
                        chantier_id=2,
                        equipe_id=None,
                        salaire=None,
                        type_salaire="MENSUEL",
                        statut=EmployeeStatut.ACTIF,
                    )
                ],
                [Ligne(id=1, libelle="Conducteur")],
                [Ligne(id=2, code="C168", designation="Chantier", actif=chantier_actif)],
                [],
                [7],
            ]
            self.resultats: Iterator[list[object]] = iter(resultats)

        @asynccontextmanager
        async def begin(self) -> AsyncGenerator[SessionAnalyse]:
            yield self

        async def execute(self, _requete: object) -> object:
            try:
                valeurs = next(self.resultats)
            except StopIteration:
                return VIDE
            return Ligne(scalars=lambda: iter(valeurs))

    service = ServiceImportPaie(cast(Auditeur, object()))
    analyse = await service.analyser(cast(AsyncSession, SessionAnalyse()), sortie.getvalue(), 202610)
    assert analyse.total_lignes == 1
    attendus = [(4, "bulletin")] if chantier_actif else [(4, "bulletin"), (4, "chantier")]
    assert [(erreur.numero_ligne, erreur.champ) for erreur in analyse.erreurs] == attendus
    codes = {avertissement.code_avertissement for avertissement in analyse.avertissements}
    assert codes == {"SALAIRE_DIFFERENT"}, "0 sur une fiche à salaire différent : un seul avertissement"
    differents = [x for x in analyse.avertissements if x.code_avertissement == "SALAIRE_DIFFERENT"]
    assert all(x.salaire_actuel is not None and x.salaire_actuel in x.raison for x in differents)
    assert any(
        avertissement.code_avertissement == "SALAIRE_DIFFERENT"
        and avertissement.type_salaire_propose == ("JOURNALIER" if salaire_fichier == 0 else "MENSUEL")
        for avertissement in analyse.avertissements
    )
    assert analyse.pret is False


@pytest.mark.asyncio
async def test_import_met_a_jour_les_affectations_sans_supprimer_une_equipe_absente(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    for numero, nom, cin, equipe in ((4, "Alice Nouvelle", "AA1", "OP"), (5, "Bob", "BB2", None)):
        for colonne, valeur in (
            (1, nom),
            (2, "Conducteur"),
            (3, cin),
            (4, 20),
            (7, 1000),
            (10, 1000),
            (12, "C168"),
            (13, equipe),
        ):
            feuille.cell(numero, colonne, valeur)
    sortie = BytesIO()
    classeur.save(sortie)
    alice = Ligne(
        id=1,
        cin="AA1",
        nom_prenom="Alice",
        fonction_id=1,
        chantier_id=1,
        equipe_id=1,
        salaire=1000,
        statut=EmployeeStatut.ACTIF,
    )
    bob = Ligne(
        id=2,
        cin="BB2",
        nom_prenom="Bob",
        fonction_id=1,
        chantier_id=1,
        equipe_id=9,
        salaire=1000,
        statut=EmployeeStatut.ACTIF,
    )

    class SessionImport:
        def __init__(self) -> None:
            resultats: list[list[object]] = [
                [alice, bob],
                [Ligne(id=2, libelle="Conducteur")],
                [Ligne(id=3, code="C168")],
                [Ligne(id=4, code="OP")],
            ]
            self.resultats: Iterator[list[object]] = iter(resultats)
            self.bulletins: list[Paie] = []

        @asynccontextmanager
        async def begin(self) -> AsyncGenerator[SessionImport]:
            yield self

        async def execute(self, _requete: object) -> object:
            try:
                valeurs = next(self.resultats)
            except StopIteration:
                return VIDE
            return Ligne(scalars=lambda: iter(valeurs))

        def add(self, bulletin: Paie) -> None:
            self.bulletins.append(bulletin)

        async def flush(self) -> None:
            pass

    session = SessionImport()
    service = ServiceImportPaie(AuditeurJournal())

    async def analyser(_session: AsyncSession, _contenu: bytes, _periode: int) -> PaieImportAnalyse:
        return PaieImportAnalyse(
            periode=202610,
            total_lignes=2,
            erreurs=[],
            avertissements=[],
            chantiers_clotures=[],
            cin_inconnus=[],
            ecarts=[],
            departs=[],
            retours=[],
            pret=True,
        )

    monkeypatch.setattr(service, "analyser", analyser)
    resultat = await service.importer(
        cast(AsyncSession, session), sortie.getvalue(), 202610, False, PaieImportDeparts()
    )
    assert resultat.crees == 2
    assert (alice.nom_prenom, alice.fonction_id, alice.chantier_id, alice.equipe_id) == ("Alice Nouvelle", 2, 3, 4)
    assert bob.equipe_id == 9
    assert [bulletin.equipe_id for bulletin in session.bulletins] == [4, None]


class _SessionVide:
    @asynccontextmanager
    async def begin(self) -> AsyncGenerator[_SessionVide]:
        yield self

    async def execute(self, _requete: object) -> object:
        return VIDE


def _classeur_vide() -> bytes:
    sortie = BytesIO()
    Workbook().save(sortie)
    return sortie.getvalue()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("periode", "attendu"),
    [
        (202509, []),  # un mois passé : aucun contrôle
        (202610, []),  # le mois civil précédent (octobre en novembre) : l'import normal
        (202611, ["PERIODE_COURANTE_OU_FUTURE"]),  # le mois en cours : la paie n'existe pas encore
        (202612, ["PERIODE_COURANTE_OU_FUTURE"]),  # un mois à venir
    ],
)
async def test_la_periode_courante_ou_future_demande_confirmation(periode: int, attendu: list[str]) -> None:
    service = ServiceImportPaie(cast(Auditeur, object()), aujourd_hui=lambda: date(2026, 11, 8))
    analyse = await service.analyser(cast(AsyncSession, _SessionVide()), _classeur_vide(), periode)
    assert [controle.code for controle in analyse.controles_periode] == attendu
    assert analyse.pret is (not attendu)


@pytest.mark.asyncio
async def test_importer_refuse_une_periode_non_confirmee_et_l_accepte_confirmee(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = ServiceImportPaie(cast(Auditeur, object()))

    async def analyser(_session: AsyncSession, _contenu: bytes, _periode: int) -> PaieImportAnalyse:
        return PaieImportAnalyse(
            periode=202611,
            total_lignes=0,
            erreurs=[],
            avertissements=[],
            chantiers_clotures=[],
            cin_inconnus=[],
            ecarts=[],
            departs=[],
            retours=[],
            controles_periode=[PaieImportControlePeriode(code="PERIODE_COURANTE_OU_FUTURE", message="Mois en cours.")],
            pret=False,
        )

    monkeypatch.setattr(service, "analyser", analyser)
    with pytest.raises(ErreurImportPaie, match="La période demande confirmation"):
        await service.importer(cast(AsyncSession, object()), b"", 202611, False, PaieImportDeparts())


def _ligne_paie(cin: str, total: float, observation: str | None = None) -> list[object]:
    return ["Nom", "Fonction", cin, 26, 0, 0, total, 0, 0, total, observation, "C168", None]


def test_un_fichier_identique_a_un_autre_mois_est_signale_comme_deja_importe() -> None:
    employes = {f"AA{i}": Ligne(id=i, cin=f"AA{i}") for i in range(10)}
    lignes = [(4 + i, _ligne_paie(f"AA{i}", 1000.0 + i)) for i in range(10)]
    voisin = {i: signature_ligne(_ligne_paie(f"AA{i}", 1000.0 + i)) for i in range(10)}

    controle = ServiceImportPaie._controle_doublon(lignes, cast(Any, employes), {202610: voisin})  # pyright: ignore[reportPrivateUsage]
    assert controle is not None
    assert (controle.code, controle.periode_reference) == ("CONTENU_DEJA_IMPORTE", 202610)

    autres = {i: signature_ligne(_ligne_paie(f"AA{i}", 2000.0 + i)) for i in range(10)}
    assert ServiceImportPaie._controle_doublon(lignes, cast(Any, employes), {202610: autres}) is None  # pyright: ignore[reportPrivateUsage]
    un_sur_dix = {**voisin, **{i: signature_ligne(_ligne_paie(f"AA{i}", 5.0)) for i in range(2)}}
    assert ServiceImportPaie._controle_doublon(lignes, cast(Any, employes), {202610: un_sur_dix}) is None  # pyright: ignore[reportPrivateUsage]


@pytest.mark.parametrize(
    ("brut", "arrondi"),
    [
        ("769.230769", "769"),
        ("123.456", "123"),
        ("0.5", "0"),
        ("0.51", "1"),
        ("1000", "1000"),
        ("12.5", "12"),
    ],
)
def test_les_montants_sont_arrondis_automatiquement_a_l_entier(brut: str, arrondi: str) -> None:
    assert arrondir_montant(Decimal(brut)) == Decimal(arrondi)
    assert montant_ligne([None] * 6 + [brut], 6) == Decimal(arrondi)


def test_un_depart_sans_motif_a_son_motif_par_defaut() -> None:
    assert PaieImportDepartConfirme(employe_id=1, sans_motif=True).motif == ""
    assert MOTIF_ABSENT_DU_FICHIER == "Absent du fichier"
