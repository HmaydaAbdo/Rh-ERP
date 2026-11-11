"""Outils MCP du domaine Employé et de l'accueil (port de `OutilsEmploye` et `OutilsAccueil` de Spring).

Mêmes noms, descriptions et clés de résultat que Spring. Le salaire et son type ne sont rendus qu'avec `PAIE_READ`
(règle de l'API) ; le CIN et les dates le sont avec `EMPLOYEE_READ`. Aucune écriture : les lectures ne sont pas
auditées, le span du décorateur `@outil` les diagnostique. Les chiffres viennent des services du domaine.
"""

from collections.abc import Callable
from enum import StrEnum
from typing import Annotated, Any

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.dependencies import get_access_token
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from staport.domains.auth.composition import ContexteAuth
from staport.domains.common.pagination import Pagination
from staport.domains.employee.models import EmployeeStatut
from staport.domains.employee.schemas import (
    DimensionEmployes,
    EmployeeRecherche,
    EmployeeReponse,
    TrancheReponse,
    TriRegroupement,
)
from staport.domains.mcp.formats import (
    LECTURE_SEULE,
    PERIODE,
    PERIODE_DOC,
    Chantiers,
    Dimension,
    Equipes,
    Fonctions,
    Page,
    Sens,
    SensTri,
    Statut,
    StatutEmploye,
    ascendant,
    ids,
    mois,
    nombre_de,
    nombre_de_total,
    parametres_url,
    texte,
    voit_la_paie,
    vue,
)
from staport.domains.mcp.telemetrie import outil
from staport.domains.paie.periode import afficher_periode

FICHES = 20
AUCUNE_PAIE = "Aucune paie n'est encore importée."


class TriEmploye(StrEnum):
    """Critère de tri d'une recherche d'employés ; SALAIRE n'est permis qu'avec le droit de voir la paie."""

    NOM = "NOM"
    CIN = "CIN"
    DATE_EMBAUCHE = "DATE_EMBAUCHE"
    DATE_NAISSANCE = "DATE_NAISSANCE"
    SALAIRE = "SALAIRE"


TRI_EMPLOYE = {
    TriEmploye.NOM: "nom_prenom",
    TriEmploye.CIN: "cin",
    TriEmploye.DATE_EMBAUCHE: "date_embauche",
    TriEmploye.DATE_NAISSANCE: "date_naissance",
    TriEmploye.SALAIRE: "salaire",
}
STATUT_API = {StatutEmploye.EN_POSTE: EmployeeStatut.ACTIF, StatutEmploye.SORTI: EmployeeStatut.INACTIF}


def _statut_api(statut: StatutEmploye | None) -> EmployeeStatut | None:
    return None if statut is None else STATUT_API[statut]


def _libelle_statut(statut: EmployeeStatut) -> str:
    return StatutEmploye.EN_POSTE.value if statut == EmployeeStatut.ACTIF else StatutEmploye.SORTI.value


def _avec_statut(parametres: dict[str, str], statut: EmployeeStatut | None) -> dict[str, str]:
    """Paramètre `statut` des vues Employés : valeurs de l'API (ACTIF, INACTIF), comme l'URL."""
    if statut is not None:
        parametres["statut"] = statut.value
    return parametres


def _mois_ou_nul(periode: int | None) -> str | None:
    return None if periode is None else afficher_periode(periode)


def _fiche(employe: EmployeeReponse, voit_paie: bool) -> dict[str, Any]:
    """Une fiche Employé pour l'assistant (`OutilsEmploye.fiche`)."""
    fonction, chantier, equipe = employe.fonction, employe.chantier, employe.equipe
    fiche: dict[str, Any] = {
        "id": employe.id,
        "nomPrenom": employe.nom_prenom,
        "cin": employe.cin,
        "dateNaissance": employe.date_naissance.isoformat(),
        "dateEmbauche": employe.date_embauche.isoformat(),
        "statut": _libelle_statut(employe.statut),
        "fonction": {"id": fonction.id, "libelle": fonction.libelle},
        "chantier": None if chantier is None else {"id": chantier.id, "code": chantier.code},
        "equipe": None if equipe is None else {"id": equipe.id, "code": equipe.code},
    }
    if voit_paie:
        fiche["salaire"] = None if employe.salaire is None else float(employe.salaire)
        fiche["typeSalaire"] = None if employe.type_salaire is None else employe.type_salaire.value
    return fiche


def _tranches(tranches: list[TrancheReponse]) -> list[dict[str, Any]]:
    return [{"min": t.min, "max": t.max, "effectif": t.effectif} for t in tranches]


def enregistrer(
    serveur: FastMCP, contexte: Callable[[], ContexteAuth], fabrique: Callable[[], async_sessionmaker[AsyncSession]]
) -> None:
    """Déclare les outils Employé et Accueil sur `serveur`."""

    async def derniere_periode(session: AsyncSession) -> int:
        periode = await contexte().paies.derniere_periode(session)
        if periode is None:
            raise ToolError(AUCUNE_PAIE)
        return periode

    @serveur.tool(
        name="employes_rechercher",
        title="Rechercher des employés",
        annotations=LECTURE_SEULE,
        description=(
            "Trouve des employés par nom (partiel), CIN (partiel) et/ou par chantier, équipe, fonction ou statut ; au "
            "moins un critère est obligatoire. Rend, pour chaque employé : id, nom et prénom, CIN, dates de naissance "
            "et d'embauche, statut (EN_POSTE ou SORTI), fonction, chantier et équipe actuels, et le salaire seulement "
            "si l'utilisateur a le droit de voir la paie (`salaireVisible`). Résultats paginés avec le nombre total ; "
            "parcourir toutes les pages pour une réponse complète. Triable (`tri` : NOM par défaut, CIN, "
            "DATE_EMBAUCHE, DATE_NAISSANCE, SALAIRE si la paie est visible ; `sens` ASC ou DESC) et paginable "
            "(`page`) : « les cinq derniers embauchés » se demande avec tri DATE_EMBAUCHE, sens DESC, limite 5. Pour "
            "seulement compter ou répartir des employés, préférer `employes_compter` ou `employes_regrouper`. Citer "
            "les libellés (fonction, chantier, équipe) tels que rendus, jamais de mémoire : un champ absent du "
            "résultat reste inconnu."
        ),
    )
    @outil("employes_rechercher", "EMPLOYEE_READ", nombre_de_total)
    async def employes_rechercher(  # pyright: ignore[reportUnusedFunction]
        nom: Annotated[
            str | None,
            Field(
                min_length=2,
                max_length=150,
                description="Nom et/ou prénom (2 caractères au moins), recherche partielle. Passer le nom en entier, "
                "tel que l'utilisateur l'a écrit : un fragment commun renvoie plusieurs employés ; si le total rendu "
                "dépasse 1, plusieurs employés correspondent.",
            ),
        ] = None,
        cin: Annotated[
            str | None,
            Field(
                min_length=2,
                max_length=30,
                description="CIN (carte d'identité nationale), partiel (2 caractères au moins).",
            ),
        ] = None,
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
        statut: Statut = None,
        limite: Annotated[
            int, Field(ge=1, le=FICHES, description="Nombre de fiches rendues par page, de 1 à 20, 10 par défaut.")
        ] = 10,
        tri: Annotated[
            TriEmploye | None,
            Field(
                description="Critère de tri : NOM (défaut), CIN, DATE_EMBAUCHE, DATE_NAISSANCE ou SALAIRE (réservé "
                "aux utilisateurs qui voient la paie)."
            ),
        ] = None,
        sens: Sens = None,
        page: Page = 0,
    ) -> dict[str, Any]:
        nom_recherche, cin_recherche = texte(nom), texte(cin)
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        statut_api = _statut_api(statut)
        if not (nom_recherche or cin_recherche or chantiers or equipes or fonctions or statut_api):
            raise ToolError("Préciser un nom, un CIN ou un périmètre (chantier, équipe, fonction, statut).")
        voit_paie = voit_la_paie()
        if tri is TriEmploye.SALAIRE and not voit_paie:
            raise ToolError("Le tri par salaire est réservé aux utilisateurs qui voient la paie.")
        critere = tri or TriEmploye.NOM
        croissant = ascendant(sens, SensTri.ASC if critere in (TriEmploye.NOM, TriEmploye.CIN) else SensTri.DESC)
        champ = TRI_EMPLOYE[critere]
        ordre = ((champ, croissant),) if champ == "nom_prenom" else ((champ, croissant), ("nom_prenom", True))
        criteres = EmployeeRecherche(
            nom_prenom=nom_recherche,
            cin=cin_recherche,
            fonction_ids=fonctions,
            chantier_ids=chantiers,
            equipe_ids=equipes,
            statut=statut_api,
        )
        async with fabrique()() as session:
            resultats = await contexte().employees.rechercher(
                session, criteres, Pagination(page, limite, ordre), voit_paie
            )
        fiches = [_fiche(e, voit_paie) for e in resultats.content]
        parametres = parametres_url(chantiers, equipes, fonctions)
        if nom_recherche:
            parametres["nom"] = nom_recherche
        if cin_recherche:
            parametres["cin"] = cin_recherche
        return {
            "total": resultats.page.total_elements,
            "rendus": len(fiches),
            "page": resultats.page.number,
            "employes": fiches,
            "salaireVisible": voit_paie,
            "vue": vue("employees", "tabulaire", _avec_statut(parametres, statut_api)),
        }

    @serveur.tool(
        name="employe_fiche",
        title="Fiche d'un employé",
        annotations=LECTURE_SEULE,
        description=(
            "Lit la fiche complète d'un employé à partir de son identifiant : CIN, dates de naissance et "
            "d'embauche, fonction, chantier, équipe, statut, et la liste de ses départs enregistrés (période et "
            "motif) ; le salaire seulement avec le droit de voir la paie. Identifiant inconnu : le chercher d'abord "
            "avec `employes_rechercher`. Pour l'historique mois par mois, utiliser `employe_parcours`. "
            "Rend un seul employé, sans pagination."
        ),
    )
    @outil("employe_fiche", "EMPLOYEE_READ", lambda _: 1)
    async def employe_fiche(  # pyright: ignore[reportUnusedFunction]
        id: Annotated[
            int, Field(gt=0, description="Identifiant de l'employé (entier positif), rendu par `employes_rechercher`.")
        ],
    ) -> dict[str, Any]:
        voit_paie = voit_la_paie()
        async with fabrique()() as session:
            employe = await contexte().employees.lire(session, id, voit_paie)
            departs = await contexte().employees.departs(session, id)
        return {
            "employe": _fiche(employe, voit_paie),
            "departs": [{"periode": afficher_periode(p), "motif": m.strip() or "NON_PRECISE"} for _, p, m in departs],
            "vue": vue("employees", "fiche", {"id": str(id)}),
        }

    @serveur.tool(
        name="employes_compter",
        title="Effectif et statistiques des employés",
        annotations=LECTURE_SEULE,
        description=(
            "Compte les employés d'un périmètre (chantiers, équipes, fonctions, statut) : effectif total, en poste, "
            "sortis, âge moyen et ancienneté moyenne en années, embauches des 12 derniers mois et répartition par "
            "tranches d'âge et d'ancienneté. Mêmes chiffres que la vue Analytique des employés ; aucun salaire. État "
            "courant des fiches (issu du dernier mois de paie importé), pas un historique : pour l'évolution d'un mois "
            "à l'autre, utiliser `paie_mouvements`. Pour les chiffres d'un seul groupe, filtrer par identifiants. "
            "Rend un seul résultat agrégé, sans pagination."
        ),
    )
    @outil("employes_compter", "EMPLOYEE_READ")
    async def employes_compter(  # pyright: ignore[reportUnusedFunction]
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
        statut: Statut = None,
    ) -> dict[str, Any]:
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        statut_api = _statut_api(statut)
        criteres = EmployeeRecherche(
            fonction_ids=fonctions, chantier_ids=chantiers, equipe_ids=equipes, statut=statut_api
        )
        async with fabrique()() as session:
            resultat = await contexte().employees.analytique(session, criteres)
        parametres = _avec_statut(parametres_url(chantiers, equipes, fonctions), statut_api)
        return {
            "effectif": resultat.effectif,
            "enPoste": resultat.actifs,
            "sortis": resultat.inactifs,
            "ageMoyen": None if resultat.age_moyen is None else float(resultat.age_moyen),
            "ancienneteMoyenne": None if resultat.anciennete_moyenne is None else float(resultat.anciennete_moyenne),
            "embauchesDouzeMois": resultat.embauches_douze_mois,
            "parAge": _tranches(resultat.par_age),
            "parAnciennete": _tranches(resultat.par_anciennete),
            "vue": vue("employees", "analytique", parametres),
        }

    @serveur.tool(
        name="employes_regrouper",
        title="Effectif par chantier, équipe ou fonction",
        annotations=LECTURE_SEULE,
        description=(
            "Répartit l'effectif des employés par chantier, par équipe ou par fonction (total et en poste) sur un "
            "périmètre. Tous les groupes sont rendus, triés du plus grand au plus petit par défaut ; `tri` (EFFECTIF, "
            "EN_POSTE, LIBELLE, CODE) et `sens` (ASC ou DESC) donnent « les équipes les plus petites » ou l'ordre "
            "alphabétique. À utiliser pour « quels chantiers ont le plus d'employés », « combien par équipe ». Chaque "
            "groupe rend id, code, libellé, effectif et nombre en poste. "
            "Les montants de paie par groupe sont dans `paie_repartition`."
        ),
    )
    @outil("employes_regrouper", "EMPLOYEE_READ", nombre_de("groupes"))
    async def employes_regrouper(  # pyright: ignore[reportUnusedFunction]
        dimension: Annotated[Dimension, Field(description="Regroupement : CHANTIER, EQUIPE ou FONCTION.")],
        chantierIds: Chantiers = None,
        equipeIds: Equipes = None,
        fonctionIds: Fonctions = None,
        statut: Statut = None,
        tri: Annotated[
            TriRegroupement | None,
            Field(description="Critère de tri des groupes : EFFECTIF (défaut), EN_POSTE, LIBELLE ou CODE."),
        ] = None,
        sens: Sens = None,
    ) -> dict[str, Any]:
        chantiers, equipes, fonctions = ids(chantierIds), ids(equipeIds), ids(fonctionIds)
        statut_api = _statut_api(statut)
        critere = tri or TriRegroupement.EFFECTIF
        decroissant_par_defaut = critere in (TriRegroupement.EFFECTIF, TriRegroupement.EN_POSTE)
        croissant = ascendant(sens, SensTri.DESC if decroissant_par_defaut else SensTri.ASC)
        criteres = EmployeeRecherche(
            fonction_ids=fonctions, chantier_ids=chantiers, equipe_ids=equipes, statut=statut_api
        )
        async with fabrique()() as session:
            groupes = await contexte().employees.regrouper_trie(
                session, criteres, DimensionEmployes(dimension.value), critere, croissant
            )
        parametres = _avec_statut(parametres_url(chantiers, equipes, fonctions), statut_api)
        return {
            "dimension": dimension.value,
            "nombreGroupes": len(groupes),
            "groupes": [
                {"id": g.id, "code": g.code, "libelle": g.libelle, "effectif": g.effectif, "enPoste": g.actifs}
                for g in groupes
            ],
            "vue": vue("employees", "cartes", parametres),
        }

    @serveur.tool(
        name="employes_sorties",
        title="Départs d'un mois",
        annotations=LECTURE_SEULE,
        description=(
            "Liste les départs de l'entreprise constatés par la paie d'un mois (sortants : STC et absences "
            "confirmées) : nombre total, nombre par motif et la liste complète des employés concernés. Un départ "
            "ancien sans motif est compté « NON_PRECISE ». À ne pas confondre avec les « plus payés » de "
            "`paie_mouvements`, qui comptent aussi les absences non confirmées. "
            "Un mois par appel (`periode`, absent = dernier mois de paie importé) ; la liste est rendue en entier."
        ),
    )
    @outil("employes_sorties", "EMPLOYEE_READ", nombre_de("employes"))
    async def employes_sorties(  # pyright: ignore[reportUnusedFunction]
        periode: Annotated[str | None, Field(pattern=PERIODE, description=PERIODE_DOC)] = None,
    ) -> dict[str, Any]:
        async with fabrique()() as session:
            demande = mois(periode)
            courant = demande if demande is not None else await derniere_periode(session)
            resultat = await contexte().employees.sorties_mois(session, courant)
        if voit_la_paie():
            proposee = vue("employees", "analytique", {"periode": afficher_periode(courant)})
        else:
            proposee = vue("employees", "tabulaire", _avec_statut({}, EmployeeStatut.INACTIF))
        return {
            "periode": afficher_periode(courant),
            "nombre": resultat.nombre,
            "parMotif": resultat.par_motif,
            "employes": [
                {"id": s.employe_id, "nomPrenom": s.nom_prenom, "motif": s.motif}
                for s in sorted(resultat.sorties, key=lambda s: s.employe_id)
            ],
            "vue": proposee,
        }

    @serveur.tool(
        name="employe_parcours",
        title="Parcours d'un employé",
        annotations=LECTURE_SEULE,
        description=(
            "Reconstitue le parcours complet d'un employé depuis ses bulletins de paie : indicateurs (mois payés, "
            "total perçu en dirhams, jours travaillés, premier et dernier mois), tous ses mois (chantier, équipe, "
            "fonction, jours, salaires, observation) et ses événements (entrée, mutation, changement de salaire, "
            "départ, retour). Réservé aux utilisateurs qui voient la paie. Identifiant inconnu : le chercher d'abord "
            "avec `employes_rechercher`. "
            "Un seul employé par appel ; tous ses mois et événements sont rendus, sans pagination."
        ),
    )
    @outil("employe_parcours", "PAIE_READ", nombre_de("mois"))
    async def employe_parcours(  # pyright: ignore[reportUnusedFunction]
        id: Annotated[
            int, Field(gt=0, description="Identifiant de l'employé (entier positif), rendu par `employes_rechercher`.")
        ],
    ) -> dict[str, Any]:
        async with fabrique()() as session:
            resultat = await contexte().paies.parcours(session, id)
        indicateurs = resultat.indicateurs
        return {
            "indicateurs": {
                "moisPayes": indicateurs.mois_payes,
                "totalPercu": float(indicateurs.total_percu),
                "joursTravailles": float(indicateurs.jours_travailles),
                "premierMois": _mois_ou_nul(indicateurs.premier_mois),
                "dernierMois": _mois_ou_nul(indicateurs.dernier_mois),
            },
            "mois": [
                {
                    "bulletinId": m.bulletin_id,
                    "periode": afficher_periode(m.periode),
                    "fonction": m.fonction,
                    "chantier": m.chantier,
                    "equipe": m.equipe,
                    "joursTravailles": float(m.nombre_jours_travailles),
                    "salaireMensuel": float(m.salaire_mensuel),
                    "salaireTotal": float(m.salaire_total),
                    "observation": m.observation,
                }
                for m in resultat.mois
            ],
            "evenements": [
                {
                    "periode": afficher_periode(e.periode),
                    "type": e.type,
                    "avant": e.avant,
                    "apres": e.apres,
                    "motif": e.motif,
                }
                for e in resultat.evenements
            ],
            "vue": vue("employees", "fiche", {"id": str(id)}),
        }

    @serveur.tool(
        name="accueil_lire",
        title="Accueil de l'utilisateur",
        annotations=LECTURE_SEULE,
        description=(
            "Rend les indicateurs affichés sur l'écran d'accueil de l'utilisateur pour qui tu agis (dans leur ordre) "
            "et ceux qu'il peut y ajouter, avec libellé et explication. À appeler quand l'utilisateur demande ce que "
            "contient son accueil ou quels indicateurs il peut y mettre. Les valeurs des indicateurs se lisent avec "
            "les outils paie_* et employes_*. "
            "Ne rend pas les valeurs des indicateurs : pour leurs valeurs, `paie_indicateurs` ou `employes_compter`. "
            "Sans paramètre ; la liste est rendue en entier, sans pagination."
        ),
    )
    @outil("accueil_lire", "ACCUEIL_READ", nombre_de("indicateurs"))
    async def accueil_lire() -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        jeton = get_access_token()
        # `get_access_token` n'est jamais vide ici : le décorateur a exigé la permission de l'outil.
        assert jeton is not None and jeton.subject is not None  # noqa: S101
        async with fabrique()() as session:
            reponse = await contexte().accueil.lire(session, int(jeton.subject))
        return {
            "personnalise": reponse.personnalise,
            "indicateurs": reponse.indicateurs,
            "disponibles": [
                {"code": d.code, "libelle": d.libelle, "description": d.description} for d in reponse.disponibles
            ],
        }
