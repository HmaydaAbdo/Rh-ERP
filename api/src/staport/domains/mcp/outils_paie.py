"""Outils MCP de la Paie et des heures supplémentaires (port de `OutilsPaie` et `OutilsHeuresSupp` de Spring).

Mêmes noms, descriptions, permissions et clés de résultat que Spring. Les chiffres viennent des services des domaines
`paie` et `heuresupp` : le modèle ne calcule rien. Les montants sont rendus en nombres JSON. Aucune écriture, aucune
ligne d'audit : le span du décorateur `@outil` diagnostique l'appel.
"""

from collections.abc import Callable
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Any

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from staport.domains.auth.composition import ContexteAuth
from staport.domains.common.pagination import Pagination
from staport.domains.heuresupp.schemas import HeuresSuppRecherche
from staport.domains.mcp.formats import (
    CHANTIERS_DOC,
    FONCTIONS_DOC,
    LECTURE_SEULE,
    PERIODE,
    Chantiers,
    Dimension,
    Equipes,
    Fonctions,
    Page,
    Periode,
    Sens,
    SensTri,
    ascendant,
    ids,
    mois,
    nombre_de,
    nombre_de_total,
    parametres_url,
    texte,
    vue,
)
from staport.domains.mcp.telemetrie import outil
from staport.domains.paie.periode import afficher_periode
from staport.domains.paie.schemas import (
    DimensionPaie,
    PaieKpi,
    PaieRecherche,
    PaieReponse,
    TriComparaison,
    TriRepartition,
)

BULLETINS = 20
LIGNES = 20
AUCUNE_PAIE = "Aucune paie n'est encore importée."
DEFINITIONS_MOUVEMENTS = {
    "effectif": "Employés payés dans le mois (un bulletin)",
    "effectifMoisPrecedent": "Employés payés le mois précédent ; absent si ce mois n'a pas de paie",
    "variation": "Effectif du mois moins effectif du mois précédent (écart net)",
    "entrees": "Employés payés ce mois-ci et absents de la paie du mois précédent",
    "plusPayes": "Employés payés le mois précédent et absents de la paie de ce mois",
    "sorties": "Départs enregistrés sur la fiche employé dans le mois, parmi les payés du mois ou du précédent",
    "mutations": "Employés payés les deux mois, sur un chantier différent",
}


class TriBulletin(StrEnum):
    """Critère de tri d'une recherche de bulletins."""

    NOM = "NOM"
    SALAIRE_TOTAL = "SALAIRE_TOTAL"
    SALAIRE_MENSUEL = "SALAIRE_MENSUEL"
    JOURS_TRAVAILLES = "JOURS_TRAVAILLES"


TRI_BULLETIN = {
    TriBulletin.NOM: "nom_prenom",
    TriBulletin.SALAIRE_TOTAL: "salaire_total",
    TriBulletin.SALAIRE_MENSUEL: "salaire_mensuel",
    TriBulletin.JOURS_TRAVAILLES: "nombre_jours_travailles",
}


def _nombre_de_periodes(resultat: dict[str, Any]) -> int | None:
    return len(resultat["resultats"]["periodes"])


def _total_des_lignes(resultat: dict[str, Any]) -> int | None:
    return resultat["resultats"]["total"]


def _nombre(valeur: Decimal | None) -> float | None:
    return None if valeur is None else float(valeur)


def _kpi(k: PaieKpi) -> dict[str, Any]:
    return {
        "masse": _nombre(k.masse),
        "effectif": k.effectif,
        "coutMoyen": _nombre(k.cout_moyen),
        "nombreChantiers": k.nombre_chantiers,
        "stc": k.stc,
        "stcMontant": _nombre(k.stc_montant),
    }


def _bulletin(b: PaieReponse) -> dict[str, Any]:
    return {
        "id": b.id,
        "periode": afficher_periode(b.periode),
        "employe": {"id": b.employee.id, "nomPrenom": b.employee.nom_prenom, "cin": b.employee.cin},
        "fonction": b.fonction.libelle,
        "chantier": b.chantier.code,
        "equipe": None if b.equipe is None else b.equipe.code,
        "joursTravailles": _nombre(b.nombre_jours_travailles),
        "joursRecuperationOuvrable": _nombre(b.jours_recuperation_ouvrable),
        "joursRecuperationDimanche": _nombre(b.jours_recuperation_dimanche),
        "salaireMensuel": _nombre(b.salaire_mensuel),
        "primeRoulageOrdinaire": _nombre(b.prime_roulage_ordinaire),
        "primeRoulageDimanche": _nombre(b.prime_roulage_dimanche),
        "salaireTotal": _nombre(b.salaire_total),
        "observation": b.observation,
    }


def _criteres(
    periode: int | None,
    chantiers: list[int] | None,
    equipes: list[int] | None,
    fonctions: list[int] | None,
    nom: str | None = None,
    cin: str | None = None,
) -> PaieRecherche:
    return PaieRecherche(
        cin=cin, nom_prenom=nom, periode=periode, fonction_ids=fonctions, chantier_ids=chantiers, equipe_ids=equipes
    )


def enregistrer(
    serveur: FastMCP, contexte: Callable[[], ContexteAuth], fabrique: Callable[[], async_sessionmaker[AsyncSession]]
) -> None:
    """Déclare les outils Paie, rapport et heures supplémentaires sur `serveur`."""

    async def mois_de_paie(session: AsyncSession, periode: str | None) -> int:
        """Le mois demandé, sinon le dernier mois importé (jamais le mois courant du calendrier)."""
        demande = mois(periode)
        if demande is not None:
            return demande
        dernier = await contexte().paies.derniere_periode(session)
        if dernier is None:
            raise ToolError(AUCUNE_PAIE)
        return dernier

    @serveur.tool(
        name="paie_indicateurs",
        title="Indicateurs de paie d'un mois",
        annotations=LECTURE_SEULE,
        description=(
            "Chiffres clés de la paie d'un mois sur un périmètre (chantiers, équipes, fonctions) : masse salariale "
            "en dirhams, effectif payé (nombre de bulletins), coût moyen par employé, nombre de chantiers, soldes de "
            "tout compte (STC, départs payés) et leur montant. Rend aussi les mêmes chiffres pour le mois précédent "
            "et tous les chantiers du périmètre, classés par masse. C'est l'outil par défaut pour « combien coûte / "
            "combien d'employés payés ». Pour l'évolution sur plusieurs mois utiliser `paie_evolution` ; pour les "
            "arrivées et départs, `paie_mouvements` ; pour détailler par chantier, équipe ou fonction, "
            "`paie_repartition`. Un mois non importé rend des valeurs à zéro qui signifient « aucune donnée », pas "
            "une masse nulle : vérifier les mois importés avec `paie_periodes`."
        ),
    )
    @outil("paie_indicateurs", "PAIE_READ", nombre_de("chantiers"))
    async def paie_indicateurs(  # pyright: ignore[reportUnusedFunction]
        periode: Periode = None,
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
    ) -> dict[str, Any]:
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        async with fabrique()() as session:
            courant = await mois_de_paie(session, periode)
            resultat = await contexte().paies.analytique(
                session, _criteres(courant, chantiers, equipes, fonctions), contexte().parametres
            )
        return {
            "periode": afficher_periode(courant),
            "indicateurs": _kpi(resultat.kpis),
            "moisPrecedent": None if resultat.mois_precedent is None else _kpi(resultat.mois_precedent),
            "chantiers": [
                {"id": c.id, "code": c.code, "libelle": c.libelle, "masse": _nombre(c.masse), "effectif": c.effectif}
                for c in resultat.par_chantier
            ],
            "vue": vue("paie", "analytique", parametres_url(chantiers, equipes, fonctions, courant)),
        }

    @serveur.tool(
        name="paie_periodes",
        title="Mois de paie importés",
        annotations=LECTURE_SEULE,
        description=(
            "Liste les mois de paie importés, du plus récent au plus ancien, avec pour chacun le nombre de "
            "bulletins, le nombre de chantiers, la masse salariale en dirhams et les soldes de tout compte (STC), "
            "sur un périmètre. À utiliser pour savoir quels mois existent ou quel est le dernier mois de paie ; tous "
            "les mois importés sont rendus. Pour les chiffres d'un mois, utiliser `paie_indicateurs`."
        ),
    )
    @outil("paie_periodes", "PAIE_READ", nombre_de("periodes"))
    async def paie_periodes(  # pyright: ignore[reportUnusedFunction]
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
    ) -> dict[str, Any]:
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        async with fabrique()() as session:
            toutes = await contexte().paies.periodes_recherche(session, _criteres(None, chantiers, equipes, fonctions))
        return {
            "nombreMois": len(toutes),
            "periodes": [
                {
                    "periode": afficher_periode(p.periode),
                    "bulletins": p.nombre_bulletins,
                    "chantiers": p.nombre_chantiers,
                    "masse": _nombre(p.masse),
                    "stc": p.stc,
                    "stcMontant": _nombre(p.stc_montant),
                }
                for p in toutes
            ],
            "vue": vue("paie", "cartes", parametres_url(chantiers, equipes, fonctions)),
        }

    @serveur.tool(
        name="paie_repartition",
        title="Paie par chantier, équipe ou fonction",
        annotations=LECTURE_SEULE,
        description=(
            "Répartit la paie d'un mois par chantier, par équipe ou par fonction : masse salariale en dirhams, "
            "effectif payé et soldes de tout compte (STC) de chaque groupe. Tous les groupes sont rendus. De la plus "
            "grosse masse à la plus petite par défaut ; `tri` (MASSE, EFFECTIF, STC, STC_MONTANT, LIBELLE, CODE) et "
            "`sens` (ASC ou DESC) donnent « le chantier le moins cher », « les équipes avec le plus de STC ». À "
            "utiliser pour « quel chantier coûte le plus », « masse par équipe ». Pour les effectifs sans montants, "
            "`employes_regrouper` ; pour un seul chiffre global, `paie_indicateurs`."
        ),
    )
    @outil("paie_repartition", "PAIE_READ", nombre_de("groupes"))
    async def paie_repartition(  # pyright: ignore[reportUnusedFunction]
        dimension: Annotated[Dimension, Field(description="Regroupement : CHANTIER, EQUIPE ou FONCTION.")],
        periode: Periode = None,
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
        tri: Annotated[
            TriRepartition | None,
            Field(
                description="Critère de tri des groupes : MASSE (défaut), EFFECTIF, STC, STC_MONTANT, LIBELLE ou CODE."
            ),
        ] = None,
        sens: Sens = None,
    ) -> dict[str, Any]:
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        async with fabrique()() as session:
            courant = await mois_de_paie(session, periode)
            repartition = await contexte().paies.repartir(
                session,
                _criteres(courant, chantiers, equipes, fonctions),
                contexte().parametres,
                DimensionPaie(dimension.value),
                tri,
                None if sens is None else sens is SensTri.ASC,
            )
        return {
            "periode": afficher_periode(repartition.periode),
            "dimension": dimension.value,
            "nombreGroupes": repartition.nombre_groupes,
            "groupes": [
                {
                    "id": g.id,
                    "code": g.code,
                    "libelle": g.libelle,
                    "masse": _nombre(g.masse),
                    "effectif": g.effectif,
                    "stc": g.stc,
                    "stcMontant": _nombre(g.stc_montant),
                }
                for g in repartition.groupes
            ],
            "vue": vue("paie", "analytique", parametres_url(chantiers, equipes, fonctions, courant)),
        }

    @serveur.tool(
        name="paie_evolution",
        title="Évolution mensuelle de la paie",
        annotations=LECTURE_SEULE,
        description=(
            "Série mensuelle de la paie d'un périmètre, du mois le plus ancien au plus récent, jusqu'au mois donné : "
            "masse salariale en dirhams, effectif payé, soldes de tout compte (STC) et leur montant. À utiliser pour "
            "les tendances (« la masse augmente-t-elle ? »). Pour comparer seulement deux mois, `paie_indicateurs` "
            "rend déjà le mois précédent ; toute la série historique est rendue."
        ),
    )
    @outil("paie_evolution", "PAIE_READ", nombre_de("mois"))
    async def paie_evolution(  # pyright: ignore[reportUnusedFunction]
        periode: Annotated[
            str | None,
            Field(
                pattern=PERIODE,
                description="Dernier mois de la série, au format aaaa-MM. Absent = le dernier mois de paie importé.",
            ),
        ] = None,
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
    ) -> dict[str, Any]:
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        async with fabrique()() as session:
            derniere = await mois_de_paie(session, periode)
            evolution = await contexte().paies.evolution_jusqua(
                session, _criteres(derniere, chantiers, equipes, fonctions), contexte().parametres
            )
        return {
            "mois": [
                {
                    "periode": afficher_periode(e.periode),
                    "masse": _nombre(e.masse),
                    "effectif": e.effectif,
                    "stc": e.stc,
                    "stcMontant": _nombre(e.stc_montant),
                }
                for e in evolution
            ],
            "vue": vue("paie", "analytique", parametres_url(chantiers, equipes, fonctions, derniere)),
        }

    @serveur.tool(
        name="paie_comparer",
        title="Comparer la paie de deux mois",
        annotations=LECTURE_SEULE,
        description=(
            "Compare la paie de deux mois, groupe par groupe (par chantier, équipe ou fonction) : masse salariale, "
            "effectif et coût moyen de chaque mois, variation de la masse en dirhams et en pourcentage, variation de "
            "l'effectif, et la fonction la plus représentée de chaque chantier ou équipe. Tous les calculs sont faits "
            "ici : ne calcule jamais toi-même un écart, un pourcentage ou une moyenne, cite les valeurs rendues. "
            "`periode` est le mois récent (absent = dernier mois de paie) et `periodeReference` le mois de "
            "comparaison (absent = le mois précédent). `tri` et `sens` classent les groupes (MASSE du mois récent par "
            "défaut, VARIATION_MASSE, VARIATION_POURCENTAGE, EFFECTIF, VARIATION_EFFECTIF, LIBELLE). Tous les groupes "
            "sont rendus ; `plusForteHausse` et `plusForteBaisse` sont calculées sur tout le périmètre, comme les "
            "mêmes sur tout le périmètre (`...DuPerimetre`) et le total des deux mois. À utiliser pour « les 3 "
            "chantiers les plus chers puis lequel a le plus augmenté », « qu'est-ce qui a changé depuis le mois "
            "dernier ». Pour une série sur plusieurs mois, `paie_evolution`."
        ),
    )
    @outil("paie_comparer", "PAIE_READ", nombre_de("groupes"))
    async def paie_comparer(  # pyright: ignore[reportUnusedFunction]
        dimension: Annotated[Dimension, Field(description="Regroupement : CHANTIER, EQUIPE ou FONCTION.")],
        periode: Annotated[
            str | None,
            Field(
                pattern=PERIODE, description="Mois récent, au format aaaa-MM. Absent = le dernier mois de paie importé."
            ),
        ] = None,
        periodeReference: Annotated[
            str | None,
            Field(
                pattern=PERIODE,
                description="Mois de comparaison, au format aaaa-MM. Absent = le mois précédent `periode`.",
            ),
        ] = None,
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
        tri: Annotated[
            TriComparaison | None,
            Field(
                description="Critère de tri des groupes : MASSE (défaut, mois récent), VARIATION_MASSE, "
                "VARIATION_POURCENTAGE, EFFECTIF, VARIATION_EFFECTIF ou LIBELLE."
            ),
        ] = None,
        sens: Sens = None,
    ) -> dict[str, Any]:
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        critere = tri or TriComparaison.MASSE
        async with fabrique()() as session:
            recent = await mois_de_paie(session, periode)
            resultat = await contexte().paies.comparer(
                session,
                _criteres(recent, chantiers, equipes, fonctions),
                mois(periodeReference),
                contexte().parametres,
                DimensionPaie(dimension.value),
                critere,
                ascendant(sens, SensTri.ASC if critere is TriComparaison.LIBELLE else SensTri.DESC),
            )
        donnees = resultat.model_dump(mode="json", by_alias=True)
        donnees["vue"] = vue("paie", "analytique", parametres_url(chantiers, equipes, fonctions, recent))
        return donnees

    @serveur.tool(
        name="paie_mouvements",
        title="Arrivées, départs et mutations par mois",
        annotations=LECTURE_SEULE,
        description=(
            "Mouvements d'effectif mois par mois selon la paie, sur un périmètre. Pour chaque mois : employés payés "
            "(`effectif`), effectif du mois précédent et écart net (`variation`), `entrees` (payés ce mois-ci et "
            "absents de la paie du mois précédent), `plusPayes` (payés le mois précédent, absents ce mois-ci), "
            "`sorties` (départs enregistrés sur la fiche employé) et `mutations` (changements de chantier). Chaque "
            "chiffre est défini dans `definitions` : citer ces définitions, et donner `variation` à côté des "
            "entrées, car « entrées » n'est pas l'écart net (entrées − plus payés = variation). Un mois précis ou "  # noqa: RUF001
            "tous les mois disponibles. Pour la liste des départs constatés d'un mois, `employes_sorties` ; pour les "
            "chiffres globaux de la paie, `paie_indicateurs`."
        ),
    )
    @outil("paie_mouvements", "PAIE_READ", nombre_de("mois"))
    async def paie_mouvements(  # pyright: ignore[reportUnusedFunction]
        periode: Annotated[
            str | None,
            Field(pattern=PERIODE, description="Un mois précis au format aaaa-MM. Absent = tous les mois disponibles."),
        ] = None,
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
    ) -> dict[str, Any]:
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        demande = mois(periode)
        async with fabrique()() as session:
            retenus = await contexte().paies.effectifs(session, _criteres(None, chantiers, equipes, fonctions), demande)
        return {
            "mois": [
                {
                    "periode": afficher_periode(m.periode),
                    "effectif": m.effectif,
                    "effectifMoisPrecedent": m.effectif_mois_precedent,
                    "variation": m.variation,
                    "entrees": m.entrees,
                    "plusPayes": m.plus_payes,
                    "sorties": m.sorties,
                    "mutations": m.mutations,
                }
                for m in retenus
            ],
            "definitions": DEFINITIONS_MOUVEMENTS,
            "vue": vue("employees", "analytique", parametres_url(chantiers, equipes, fonctions, demande)),
        }

    @serveur.tool(
        name="paie_qualite",
        title="Qualité des données de paie",
        annotations=LECTURE_SEULE,
        description=(
            "Contrôle la qualité de la paie d'un mois sur un périmètre : nombre de bulletins sans équipe, nombre "
            "sans observation, et répartition des bulletins par tranches de salaire total. À utiliser pour « y a-t-il "
            "des anomalies », « combien de bulletins sans équipe ». Propose la liste des bulletins sans équipe. "
            "Les filtres chantier, équipe et fonction acceptent 50 identifiants au plus chacun. Pour les chiffres de "
            "la paie, utiliser `paie_indicateurs`."
        ),
    )
    @outil("paie_qualite", "PAIE_READ", nombre_de("tranches"))
    async def paie_qualite(  # pyright: ignore[reportUnusedFunction]
        periode: Periode = None,
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
    ) -> dict[str, Any]:
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        async with fabrique()() as session:
            courant = await mois_de_paie(session, periode)
            resultat = await contexte().paies.analytique(
                session, _criteres(courant, chantiers, equipes, fonctions), contexte().parametres
            )
        parametres = parametres_url(chantiers, equipes, fonctions, courant)
        parametres["equipeIds"] = "0"
        return {
            "periode": afficher_periode(courant),
            "sansEquipe": resultat.qualite.sans_equipe,
            "sansObservation": resultat.qualite.sans_observation,
            "tranches": [
                {"min": _nombre(t.min), "max": _nombre(t.max), "effectif": t.effectif} for t in resultat.tranches
            ],
            "vue": vue("paie", "tabulaire", parametres),
        }

    @serveur.tool(
        name="paie_bulletins_rechercher",
        title="Rechercher des bulletins de paie",
        annotations=LECTURE_SEULE,
        description=(
            "Trouve les bulletins de paie d'un mois par nom, CIN et/ou périmètre. Chaque bulletin rend : employé (id, "
            "nom, CIN), fonction, chantier, équipe, jours travaillés, jours de récupération, salaire mensuel, primes, "
            "salaire total en dirhams et observation. Les résultats sont paginés avec le nombre total ; parcourir "
            "toutes les pages pour une réponse complète. Triable (`tri` : NOM par défaut, SALAIRE_TOTAL, "
            "SALAIRE_MENSUEL, JOURS_TRAVAILLES ; `sens` ASC ou DESC) et paginable (`page`) : « les dix plus gros "
            "salaires du mois » se demande avec tri SALAIRE_TOTAL, sens DESC, limite 10. À utiliser pour la paie "
            "d'une personne ou un classement ; pour des totaux, préférer `paie_indicateurs`."
        ),
    )
    @outil("paie_bulletins_rechercher", "PAIE_READ", nombre_de_total)
    async def paie_bulletins_rechercher(  # pyright: ignore[reportUnusedFunction]
        periode: Periode = None,
        nom: Annotated[str | None, Field(max_length=150, description="Nom et/ou prénom de l'employé, partiel.")] = None,
        cin: Annotated[str | None, Field(max_length=30, description="CIN de l'employé, partiel.")] = None,
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
        limite: Annotated[
            int, Field(ge=1, le=BULLETINS, description="Nombre de bulletins rendus par page, de 1 à 20, 10 par défaut.")
        ] = 10,
        tri: Annotated[
            TriBulletin | None,
            Field(description="Critère de tri : NOM (défaut), SALAIRE_TOTAL, SALAIRE_MENSUEL ou JOURS_TRAVAILLES."),
        ] = None,
        sens: Sens = None,
        page: Page = 0,
    ) -> dict[str, Any]:
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        nom_recherche, cin_recherche = texte(nom), texte(cin)
        critere = tri or TriBulletin.NOM
        croissant = ascendant(sens, SensTri.ASC if critere is TriBulletin.NOM else SensTri.DESC)
        async with fabrique()() as session:
            courant = await mois_de_paie(session, periode)
            resultats = await contexte().paies.rechercher_bulletins(
                session,
                _criteres(courant, chantiers, equipes, fonctions, nom_recherche, cin_recherche),
                page,
                limite,
                TRI_BULLETIN[critere],
                croissant,
            )
        parametres = parametres_url(chantiers, equipes, fonctions, courant)
        if nom_recherche:
            parametres["nom"] = nom_recherche
        if cin_recherche:
            parametres["cin"] = cin_recherche
        return {
            "periode": afficher_periode(courant),
            "total": resultats.page.total_elements,
            "page": resultats.page.number,
            "bulletins": [_bulletin(b) for b in resultats.content],
            "vue": vue("paie", "tabulaire", parametres),
        }

    @serveur.tool(
        name="rapport_preparer",
        title="Préparer le rapport de paie",
        annotations=LECTURE_SEULE,
        description=(
            "Prépare le rapport de paie PDF d'un mois : vérifie les chantiers concernés (id, code, effectif, masse) "
            "et propose d'ouvrir l'assistant d'export déjà réglé sur ce mois et ces chantiers. Ne génère aucun "
            "fichier : l'utilisateur lance lui-même l'export. Réservé aux utilisateurs qui peuvent exporter la paie. "
            "`chantierIds` accepte 50 identifiants au plus (ceux de `chantier_rechercher`). Pour un seul chiffre de "
            "paie, utiliser `paie_indicateurs`."
        ),
    )
    @outil("rapport_preparer", ("PAIE_EXPORT", "PAIE_READ"), nombre_de("chantiers"))
    async def rapport_preparer(  # pyright: ignore[reportUnusedFunction]
        periode: Periode = None,
        chantierIds: Annotated[
            list[Annotated[int, Field(ge=0)]] | None,
            Field(
                max_length=50,
                description="Identifiants des chantiers du rapport (rendus par `chantier_rechercher`). Absent = "
                "rapport complet.",
            ),
        ] = None,
    ) -> dict[str, Any]:
        chantiers = ids(chantierIds)
        async with fabrique()() as session:
            courant = await mois_de_paie(session, periode)
            concernes = await contexte().paies.chantiers_periode(session, _criteres(courant, chantiers, None, None))
        parametres = parametres_url(chantiers, None, None, courant)
        parametres["action"] = "export"
        return {
            "periode": afficher_periode(courant),
            "nombreChantiers": len(concernes),
            "chantiers": [
                {
                    "id": c.id,
                    "code": c.code,
                    "libelle": c.libelle,
                    "effectif": c.effectif,
                    "masse": _nombre(c.masse),
                }
                for c in concernes
            ],
            "vue": vue("paie", "tabulaire", parametres),
        }

    # --- Heures supplémentaires ------------------------------------------------------------------------

    def enveloppe(route: str, parametres: dict[str, Any], resultat: dict[str, Any]) -> dict[str, Any]:
        return {"vue": {"route": route, "parametres": parametres}, "resultats": resultat}

    def parametres_heures(c: HeuresSuppRecherche) -> dict[str, Any]:
        parametres: dict[str, Any] = {}
        if c.periode is not None:
            parametres["periode"] = afficher_periode(c.periode)
        for cle, valeur in (
            ("chantierIds", c.chantier_ids),
            ("equipeIds", c.equipe_ids),
            ("fonctionIds", c.fonction_ids),
            ("cin", c.cin),
            ("nomPrenom", c.nom_prenom),
        ):
            if valeur is not None:
                parametres[cle] = valeur
        return parametres

    @serveur.tool(
        name="heures_supp_periodes",
        title="Mois des heures supplémentaires",
        annotations=LECTURE_SEULE,
        description=(
            "Liste les mois ayant un import d'heures supplémentaires. Chaque ligne garde le mois de l'import ; une "
            "modification ultérieure du salaire ne recalcule pas les périodes déjà importées. Pour les chiffres d'un "
            "mois, utiliser `heures_supp_indicateurs`. Sans paramètre ; tous les mois importés sont rendus."
        ),
    )
    @outil(
        "heures_supp_periodes",
        ("HEURES_SUP_READ", "PAIE_READ"),
        _nombre_de_periodes,
    )
    async def heures_supp_periodes() -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        async with fabrique()() as session:
            periodes = await contexte().heures_supp.periodes(session)
        return enveloppe("/heures-supp/analytique", {}, {"periodes": [afficher_periode(p) for p in periodes]})

    @serveur.tool(
        name="heures_supp_import_prerequis",
        title="Vérifier les prérequis d'import des heures supplémentaires",
        annotations=LECTURE_SEULE,
        description=(
            "Vérifie si un mois et un chantier permettent de démarrer l'import Excel des heures supplémentaires. "
            "Confirme l'existence de bulletins pour le mois et du chantier ; ne lit aucun fichier et ne modifie "
            "aucune donnée. À utiliser avant un import, avec une période aaaa-MM et l'identifiant rendu par "
            "chantier_rechercher. Un mois et un chantier par appel, les deux obligatoires."
        ),
    )
    @outil(
        "heures_supp_import_prerequis",
        ("HEURES_SUP_IMPORT", "PAIE_READ", "CHANTIER_READ"),
        lambda _: 1,
    )
    async def heures_supp_import_prerequis(  # pyright: ignore[reportUnusedFunction]
        periode: Annotated[str, Field(pattern=PERIODE, description="Mois au format aaaa-MM, par exemple 2026-10.")],
        chantierId: Annotated[int, Field(ge=1, description="Identifiant du chantier, rendu par chantier_rechercher.")],
    ) -> dict[str, Any]:
        courant = mois(periode)
        assert courant is not None  # noqa: S101  # `periode` est obligatoire et validée par le motif
        async with fabrique()() as session:
            prerequis = await contexte().import_heures_supp.prerequis(session, courant, chantierId)
        return enveloppe(
            "/heures-supp/import",
            {"periode": afficher_periode(courant), "chantierId": chantierId},
            {"prerequis": prerequis.model_dump(mode="json", by_alias=True)},
        )

    @serveur.tool(
        name="heures_supp_indicateurs",
        title="Indicateurs d'heures supplémentaires",
        annotations=LECTURE_SEULE,
        description=(
            "Rend pour un mois et un périmètre les effectifs, heures décimales, Montant, STC (DH), Forfaits et Net à "
            "payer, avec toutes les répartitions par chantier, équipe et fonction. Accepte les filtres chantier, "
            "équipe, fonction, CIN et nom. Les définitions sont incluses dans la réponse. Montant, STC et Net sont "
            "calculés par Spring ; ne les recalculez pas. Pour des lignes individuelles, utiliser "
            "`heures_supp_rechercher` ; pour savoir quels mois existent, `heures_supp_periodes`."
        ),
    )
    @outil("heures_supp_indicateurs", ("HEURES_SUP_READ", "PAIE_READ"), lambda _: 1)
    async def heures_supp_indicateurs(  # pyright: ignore[reportUnusedFunction]
        periode: Annotated[
            str | None,
            Field(
                pattern=PERIODE,
                description="Mois au format aaaa-MM. Absent = dernier mois des heures supplémentaires importées.",
            ),
        ] = None,
        chantierIds: Annotated[
            list[Annotated[int, Field(ge=1)]] | None, Field(max_length=50, description=CHANTIERS_DOC)
        ] = None,
        equipeIds: Equipes = None,
        fonctionIds: Annotated[
            list[Annotated[int, Field(ge=1)]] | None, Field(max_length=50, description=FONCTIONS_DOC)
        ] = None,
        cin: Annotated[
            str | None, Field(max_length=30, description="CIN partiel pour limiter l'analyse à une personne.")
        ] = None,
        nomPrenom: Annotated[
            str | None,
            Field(max_length=150, description="Nom et prénom partiels pour limiter l'analyse à une personne."),
        ] = None,
    ) -> dict[str, Any]:
        async with fabrique()() as session:
            courant = mois(periode)
            if courant is None:
                periodes = await contexte().heures_supp.periodes(session)
                courant = periodes[0] if periodes else None
            if courant is None:
                return enveloppe(
                    "/heures-supp/analytique",
                    {},
                    {"message": "Aucun mois d'heures supplémentaires n'a encore été importé."},
                )
            criteres = HeuresSuppRecherche(
                periode=courant,
                chantier_ids=ids(chantierIds),
                equipe_ids=ids(equipeIds),
                fonction_ids=ids(fonctionIds),
                cin=texte(cin),
                nom_prenom=texte(nomPrenom),
            )
            resultat = await contexte().heures_supp.analyser(session, criteres)
        brut = resultat.model_dump(mode="json", by_alias=True)
        donnees = {
            cle: brut[cle]
            for cle in ("periode", "indicateurs", "parChantier", "parFonction", "parEquipe", "definitions")
        }
        return enveloppe("/heures-supp/analytique", parametres_heures(criteres), donnees)

    @serveur.tool(
        name="heures_supp_rechercher",
        title="Rechercher des lignes d'heures supplémentaires",
        annotations=LECTURE_SEULE,
        description=(
            "Recherche les lignes importées par mois, chantier, fonction, CIN partiel ou nom partiel. Au moins un "
            "critère est obligatoire. Rend au plus 20 lignes par page avec le salaire horaire, P/H, Montant, STC "
            "(DH), Forfait et Net à payer. Les montants et leur source sont calculés par Spring. Pour des totaux et "
            "des répartitions plutôt que des lignes, utiliser `heures_supp_indicateurs`."
        ),
    )
    @outil(
        "heures_supp_rechercher",
        ("HEURES_SUP_READ", "PAIE_READ"),
        _total_des_lignes,
    )
    async def heures_supp_rechercher(  # pyright: ignore[reportUnusedFunction]
        periode: Annotated[str | None, Field(pattern=PERIODE, description="Mois au format aaaa-MM.")] = None,
        chantierIds: Annotated[
            list[Annotated[int, Field(ge=1)]] | None,
            Field(max_length=50, description="Identifiants des chantiers (maximum 50)."),
        ] = None,
        equipeIds: Annotated[
            list[Annotated[int, Field(ge=0)]] | None,
            Field(max_length=50, description="Identifiants des équipes (maximum 50), 0 représente Sans équipe."),
        ] = None,
        fonctionIds: Annotated[
            list[Annotated[int, Field(ge=1)]] | None,
            Field(max_length=50, description="Identifiants des fonctions (maximum 50)."),
        ] = None,
        cin: Annotated[str | None, Field(max_length=30, description="CIN partiel.")] = None,
        nomPrenom: Annotated[str | None, Field(max_length=150, description="Nom et prénom partiels.")] = None,
        page: Annotated[int, Field(ge=0, description="Page à partir de 0.")] = 0,
        limite: Annotated[int, Field(ge=1, le=LIGNES, description="Nombre de lignes, de 1 à 20.")] = LIGNES,
    ) -> dict[str, Any]:
        if not (periode or chantierIds or equipeIds or fonctionIds or texte(cin) or texte(nomPrenom)):
            raise ToolError("Fournissez au moins un critère de recherche.")
        criteres = HeuresSuppRecherche(
            periode=mois(periode),
            chantier_ids=ids(chantierIds),
            equipe_ids=ids(equipeIds),
            fonction_ids=ids(fonctionIds),
            cin=texte(cin),
            nom_prenom=texte(nomPrenom),
        )
        async with fabrique()() as session:
            resultat = await contexte().heures_supp.rechercher(
                session, criteres, Pagination(page, limite, (("periode", False),))
            )
        donnees = {
            "content": [ligne.model_dump(mode="json", by_alias=True) for ligne in resultat.content],
            "page": resultat.page.number,
            "limite": resultat.page.size,
            "total": resultat.page.total_elements,
        }
        return enveloppe("/heures-supp", parametres_heures(criteres), donnees)
