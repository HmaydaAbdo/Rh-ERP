from collections.abc import AsyncGenerator, Iterator
from contextlib import asynccontextmanager
from io import BytesIO
from types import SimpleNamespace as Ligne
from typing import cast

import pytest
from openpyxl import Workbook, load_workbook
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, AuditeurJournal
from staport.domains.paie.import_service import ServiceImportPaie, lire_lignes_paie
from staport.domains.paie.models import Paie
from staport.domains.paie.schemas import PaieImportAnalyse, PaieImportErreur


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
    with pytest.raises(ValueError, match="L'analyse n'est pas prête"):
        await service.importer(cast(AsyncSession, object()), b"", 202610, ignorer_salaires_zero=True)


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
                return Ligne(scalar_one_or_none=lambda: None)
            return Ligne(scalars=lambda: iter(valeurs))

    service = ServiceImportPaie(cast(Auditeur, object()))
    analyse = await service.analyser(cast(AsyncSession, SessionAnalyse()), sortie.getvalue(), 202610)
    assert analyse.total_lignes == 1
    attendus = [(4, "bulletin")] if chantier_actif else [(4, "bulletin"), (4, "chantier")]
    assert [(erreur.numero_ligne, erreur.champ) for erreur in analyse.erreurs] == attendus
    codes = {avertissement.code_avertissement for avertissement in analyse.avertissements}
    assert codes == ({"SALAIRE_ZERO", "SALAIRE_DIFFERENT"} if salaire_fichier == 0 else {"SALAIRE_DIFFERENT"})
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
    alice = Ligne(id=1, cin="AA1", nom_prenom="Alice", fonction_id=1, chantier_id=1, equipe_id=1, salaire=1000)
    bob = Ligne(id=2, cin="BB2", nom_prenom="Bob", fonction_id=1, chantier_id=1, equipe_id=9, salaire=1000)

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
                return Ligne(scalar_one_or_none=lambda: None)
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
    assert await service.importer(cast(AsyncSession, session), sortie.getvalue(), 202610, False) == 2
    assert (alice.nom_prenom, alice.fonction_id, alice.chantier_id, alice.equipe_id) == ("Alice Nouvelle", 2, 3, 4)
    assert bob.equipe_id == 9
    assert [bulletin.equipe_id for bulletin in session.bulletins] == [4, None]


@pytest.mark.asyncio
async def test_analyse_refuse_un_mois_qui_ne_suit_pas_le_dernier_import() -> None:
    classeur = Workbook()
    sortie = BytesIO()
    classeur.save(sortie)

    class SessionMois:
        def __init__(self) -> None:
            self.appels = 0

        @asynccontextmanager
        async def begin(self) -> AsyncGenerator[SessionMois]:
            yield self

        async def execute(self, _requete: object) -> object:
            self.appels += 1
            if self.appels == 6:
                return Ligne(scalar_one_or_none=lambda: 202610)
            return Ligne(scalars=lambda: iter(()))

    with pytest.raises(ValueError, match="Seul le mois 2026-11"):
        await ServiceImportPaie(cast(Auditeur, object())).analyser(
            cast(AsyncSession, SessionMois()), sortie.getvalue(), 202612
        )
