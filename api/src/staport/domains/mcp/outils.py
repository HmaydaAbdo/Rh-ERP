"""Outils MCP des domaines déjà en Python : identité, paramètres, rôles, journal d'audit (KAN-216).

Port des outils `systeme_identite`, `parametres_lire`, `roles_lister`, `audit_rechercher` et `audit_historique` du
module `staport.rh.mcp` de Spring : mêmes noms, mêmes descriptions, mêmes clés de résultat. Tous sont en lecture seule
et ne modifient rien. Chacun exige la permission de l'écran qu'il reflète, relue en base à chaque requête. Les outils
des autres domaines arrivent avec leur domaine (KAN-49). La liste des comptes n'est volontairement pas exposée.
"""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any, cast

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.dependencies import get_access_token
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from mcp.types import ToolAnnotations
from staport.domains.audit import consultation
from staport.domains.audit.exceptions import EntiteAuditeeInconnue
from staport.domains.audit.registre import registre
from staport.domains.audit.schemas import CategorieAudit, RechercheJournal, ResultatAudit
from staport.domains.auth.composition import ContexteAuth
from staport.domains.auth.schemas import RoleRecherche
from staport.domains.auth.securite import SCOPE_LECTURE
from staport.domains.chantier import repository as repository_chantier
from staport.domains.chantier.schemas import ChantierRecherche
from staport.domains.common.pagination import Pagination
from staport.domains.equipe import repository as repository_equipe
from staport.domains.equipe.schemas import EquipeRecherche
from staport.domains.function import repository as repository_fonction
from staport.domains.mcp.telemetrie import outil

LIGNES = 20
VERSIONS = 10
PAGE_DOC = (
    "Numéro de la page de résultats, à partir de 0 (0 par défaut). Toutes les pages restent accessibles. Avec `limite` "
    "comme taille de page, permet de parcourir tous les résultats quand `total` dépasse ce qui est rendu."
)
LECTURE_SEULE = ToolAnnotations(
    read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False
)

Page = Annotated[int, Field(ge=0, description=PAGE_DOC)]


def _jour(valeur: str | None, nom: str, *, fin: bool) -> datetime | None:
    """Une date (aaaa-MM-jj) en instant UTC : début du jour, ou dernier instant du jour pour une borne de fin."""
    if valeur is None or not valeur.strip():
        return None
    try:
        jour = date.fromisoformat(valeur)
    except ValueError as cause:
        raise ToolError(f"« {nom} » doit être une date réelle au format aaaa-MM-jj.") from cause
    debut = datetime(jour.year, jour.month, jour.day, tzinfo=UTC)
    return debut + timedelta(days=1) - timedelta(microseconds=1) if fin else debut


def _texte(valeur: str | None) -> str | None:
    return None if valeur is None or not valeur.strip() else valeur.strip()


def _nombre_de(cle: str) -> Callable[[dict[str, Any]], int | None]:
    def compter(resultat: dict[str, Any]) -> int | None:
        valeurs = resultat.get(cle)
        return len(cast(list[Any], valeurs)) if isinstance(valeurs, list) else None

    return compter


def _nombre_de_total(resultat: dict[str, Any]) -> int | None:
    total = resultat.get("total")
    return total if isinstance(total, int) else None


def enregistrer(
    serveur: FastMCP, contexte: Callable[[], ContexteAuth], fabrique: Callable[[], async_sessionmaker[AsyncSession]]
) -> None:
    """Déclare les outils sur `serveur` ; contexte et fabrique de sessions sont demandés à chaque appel."""
    entites = sorted(e.nom for e in registre.toutes())
    liste_entites = ", ".join(entites)

    @serveur.tool(
        name="systeme_identite",
        title="Identité et droits de l'utilisateur",
        annotations=LECTURE_SEULE,
        description=(
            "Rend l'identité de l'utilisateur pour qui tu agis et la liste complète de ses droits (permissions et "
            "rôles). À appeler quand la question porte sur ce que l'utilisateur peut faire ou voir, ou pour "
            "comprendre un refus « Access Denied » : il indique alors quelle permission manque. "
            "Ne rend aucune donnée métier (ni paie ni employés) : pour une donnée, utiliser l'outil du domaine "
            "concerné. Sans paramètre ; la liste des droits est rendue en entier, sans pagination."
        ),
    )
    @outil("systeme_identite", None, _nombre_de("autorites"))
    async def systeme_identite() -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        jeton = get_access_token()
        # `get_access_token` n'est jamais vide ici : le décorateur a exigé le scope de lecture.
        assert jeton is not None  # noqa: S101
        return {"utilisateur": jeton.client_id, "autorites": sorted(set(jeton.scopes) - {SCOPE_LECTURE})}

    @serveur.tool(
        name="parametres_lire",
        title="Paramètres de l'application",
        annotations=LECTURE_SEULE,
        description=(
            "Lit les paramètres de fonctionnement de l'application : clé, libellé, description, valeur, unité et "
            "bornes (durées de session, planification de la synchronisation des chantiers, etc.). Réservé aux "
            "administrateurs qui voient l'écran Paramètres. "
            "Lecture seule : ne modifie aucun paramètre. Sans paramètre ; tous les paramètres sont rendus en une fois, "
            "sans pagination. Pour savoir qui peut les gérer, `roles_lister`."
        ),
    )
    @outil("parametres_lire", "PARAMETRE_READ", _nombre_de("parametres"))
    async def parametres_lire() -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        async with fabrique()() as session:
            parametres = await contexte().parametres.lister(session)
        return {
            "parametres": [
                {
                    "cle": p.cle,
                    "libelle": p.libelle,
                    "description": p.description,
                    "type": p.type.value,
                    "valeur": p.valeur,
                    "unite": p.unite,
                    "minimum": p.minimum,
                    "maximum": p.maximum,
                }
                for p in parametres
            ],
            "vue": {"module": "admin/parametres", "vue": "tabulaire", "parametres": {}},
        }

    @serveur.tool(
        name="roles_lister",
        title="Rôles et permissions",
        annotations=LECTURE_SEULE,
        description=(
            "Liste les rôles et les permissions que chacun accorde (jamais les comptes utilisateurs), avec un filtre "
            "facultatif sur le nom. À utiliser pour « qui peut voir la paie », « que permet le rôle X ». Réservé aux "
            "utilisateurs qui gèrent les rôles ; résultats paginés avec le nombre total. Parcourir les pages jusqu'au "
            "total. Pour les droits de l'utilisateur courant, utiliser `systeme_identite` ; pour savoir qui a modifié "
            "un rôle, `audit_historique`."
        ),
    )
    @outil("roles_lister", "ROLE_MANAGE", _nombre_de_total)
    async def roles_lister(  # pyright: ignore[reportUnusedFunction]
        nom: Annotated[
            str | None, Field(max_length=50, description="Nom du rôle, partiel. Absent = tous les rôles.")
        ] = None,
        limite: Annotated[
            int, Field(ge=1, le=LIGNES, description="Nombre de rôles rendus par page, de 1 à 20, 20 par défaut.")
        ] = LIGNES,
        page: Page = 0,
    ) -> dict[str, Any]:
        criteres = RoleRecherche(nom=_texte(nom))
        async with fabrique()() as session:
            resultats = await contexte().roles.rechercher(session, criteres, Pagination(page, limite, (("nom", True),)))
        return {
            "total": resultats.page.total_elements,
            "page": resultats.page.number,
            "roles": [
                {
                    "id": r.id,
                    "nom": r.nom,
                    "description": r.description,
                    "protege": r.protege,
                    "permissions": sorted(p.code for p in r.permissions),
                }
                for r in resultats.content
            ],
            "vue": {"module": "admin/roles", "vue": "tabulaire", "parametres": {}},
        }

    @serveur.tool(
        name="fonction_rechercher",
        title="Rechercher des fonctions",
        annotations=LECTURE_SEULE,
        description=(
            "Trouve des fonctions par libellé partiel, sans tenir compte de la casse. Rend les résultats paginés "
            "avec le nombre total ; parcourir les pages jusqu'au total. Réservé aux utilisateurs qui voient le "
            "référentiel des fonctions. Lecture seule : ne modifie rien."
        ),
    )
    @outil("fonction_rechercher", "FUNCTION_READ", _nombre_de_total)
    async def fonction_rechercher(
        recherche: Annotated[str | None, Field(max_length=100, description="Libellé partiel de la fonction.")] = None,
        limite: Annotated[int, Field(ge=1, le=LIGNES, description="Nombre de fonctions par page.")] = LIGNES,
        page: Page = 0,
    ) -> dict[str, Any]:
        async with fabrique()() as session:
            resultats = await repository_fonction.rechercher(
                session, _texte(recherche), Pagination(page, limite, (("libelle", True),))
            )
        lignes, total = resultats
        return {
            "total": total,
            "page": page,
            "fonctions": [{"id": f.id, "libelle": f.libelle} for f in lignes],
            "vue": {"module": "function", "vue": "tabulaire", "parametres": {}},
        }

    @serveur.tool(
        name="fonction_fiche",
        title="Fiche d'une fonction",
        annotations=LECTURE_SEULE,
        description=(
            "Lit le libellé d'une fonction à partir de son identifiant. L'identifiant doit venir de "
            "fonction_rechercher ; identifiant inconnu : erreur. Réservé aux utilisateurs qui voient le référentiel."
        ),
    )
    @outil("fonction_fiche", "FUNCTION_READ", lambda _: 1)
    async def fonction_fiche(
        id: Annotated[int, Field(gt=0, description="Identifiant obtenu avec fonction_rechercher.")],
    ) -> dict[str, Any]:
        async with fabrique()() as session, session.begin():
            fonction = await repository_fonction.par_id(session, id)
        if fonction is None:
            raise ToolError(f"Fonction introuvable avec l'id : {id}")
        return {
            "fonction": {"id": fonction.id, "libelle": fonction.libelle},
            "vue": {"module": "function", "vue": "detail", "parametres": {"id": id}},
        }

    @serveur.tool(
        name="equipe_rechercher",
        title="Rechercher des équipes",
        annotations=LECTURE_SEULE,
        description=(
            "Trouve des équipes par code ou libellé partiel, sans tenir compte de la casse. Rend les résultats "
            "paginés avec le nombre total ; parcourir les pages jusqu'au total. Réservé aux utilisateurs qui voient "
            "le référentiel des équipes. Lecture seule : ne modifie rien."
        ),
    )
    @outil("equipe_rechercher", "EQUIPE_READ", _nombre_de_total)
    async def equipe_rechercher(
        recherche: Annotated[str | None, Field(max_length=100, description="Code ou libellé partiel.")] = None,
        limite: Annotated[int, Field(ge=1, le=LIGNES, description="Nombre d'équipes par page.")] = LIGNES,
        page: Page = 0,
    ) -> dict[str, Any]:
        async with fabrique()() as session:
            lignes, total = await repository_equipe.rechercher(
                session, EquipeRecherche(recherche=_texte(recherche)), Pagination(page, limite, (("code", True),))
            )
        return {
            "total": total,
            "page": page,
            "equipes": [{"id": e.id, "code": e.code, "libelle": e.libelle} for e in lignes],
            "vue": {"module": "equipe", "vue": "tabulaire", "parametres": {}},
        }

    @serveur.tool(
        name="equipe_fiche",
        title="Fiche d'une équipe",
        annotations=LECTURE_SEULE,
        description=(
            "Lit le code et le libellé d'une équipe à partir de son identifiant. L'identifiant doit venir de "
            "equipe_rechercher ; identifiant inconnu : erreur. Réservé aux utilisateurs qui voient le référentiel."
        ),
    )
    @outil("equipe_fiche", "EQUIPE_READ", lambda _: 1)
    async def equipe_fiche(
        id: Annotated[int, Field(gt=0, description="Identifiant obtenu avec equipe_rechercher.")],
    ) -> dict[str, Any]:
        async with fabrique()() as session, session.begin():
            equipe = await repository_equipe.par_id(session, id)
        if equipe is None:
            raise ToolError(f"Équipe introuvable avec l'id : {id}")
        return {
            "equipe": {"id": equipe.id, "code": equipe.code, "libelle": equipe.libelle},
            "vue": {"module": "equipe", "vue": "detail", "parametres": {"id": id}},
        }

    @serveur.tool(
        name="chantier_rechercher",
        title="Rechercher des chantiers",
        annotations=LECTURE_SEULE,
        description="Trouve des chantiers par code, nom ou désignation. Lecture seule, résultats paginés.",
    )
    @outil("chantier_rechercher", "CHANTIER_READ", _nombre_de_total)
    async def chantier_rechercher(
        recherche: Annotated[str | None, Field(max_length=500, description="Texte partiel.")] = None,
        limite: Annotated[int, Field(ge=1, le=LIGNES)] = LIGNES,
        page: Page = 0,
    ) -> dict[str, Any]:
        async with fabrique()() as session:
            lignes, total = await repository_chantier.rechercher(
                session, ChantierRecherche(recherche=_texte(recherche)), Pagination(page, limite, (("code", True),))
            )
        return {
            "total": total,
            "page": page,
            "chantiers": [
                {"id": x.id, "code": x.code, "designation": x.designation, "nom": x.nom, "actif": x.actif}
                for x in lignes
            ],
            "vue": {"module": "chantier", "vue": "tabulaire", "parametres": {}},
        }

    @serveur.tool(
        name="chantier_fiche",
        title="Fiche d'un chantier",
        annotations=LECTURE_SEULE,
        description="Lit la fiche d'un chantier à partir de son identifiant.",
    )
    @outil("chantier_fiche", "CHANTIER_READ", lambda _: 1)
    async def chantier_fiche(id: Annotated[int, Field(gt=0)]) -> dict[str, Any]:
        async with fabrique()() as session, session.begin():
            chantier = await repository_chantier.par_id(session, id)
        if chantier is None:
            raise ToolError(f"Chantier introuvable avec l'id : {id}")
        return {
            "chantier": {
                "id": chantier.id,
                "code": chantier.code,
                "designation": chantier.designation,
                "nom": chantier.nom,
                "actif": chantier.actif,
                "nature": chantier.nature,
                "localisation": chantier.localisation,
                "latitude": chantier.latitude,
                "longitude": chantier.longitude,
            },
            "vue": {"module": "chantier", "vue": "detail", "parametres": {"id": id}},
        }

    @serveur.tool(
        name="audit_rechercher",
        title="Journal d'audit",
        annotations=LECTURE_SEULE,
        description=(
            "Cherche dans le journal d'audit, des entrées les plus récentes aux plus anciennes : horodatage, "
            "catégorie, action, résultat, utilisateur, entité, nombre d'éléments, motif. Tous les filtres sont "
            "facultatifs et se combinent. À utiliser pour « qui a fait quoi », « quels accès refusés cette semaine ». "
            "Pour l'historique d'un enregistrement précis, `audit_historique`. Réservé aux utilisateurs qui voient le "
            "journal ; résultats paginés avec le nombre total. Parcourir les pages jusqu'au total."
        ),
    )
    @outil("audit_rechercher", "AUDIT_READ", _nombre_de_total)
    async def audit_rechercher(  # pyright: ignore[reportUnusedFunction]
        depuis: Annotated[
            str | None,
            Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$", description="Date de début incluse, au format aaaa-MM-jj."),
        ] = None,
        jusqua: Annotated[
            str | None,
            Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$", description="Date de fin incluse, au format aaaa-MM-jj."),
        ] = None,
        utilisateur: Annotated[
            str | None, Field(max_length=100, description="Identifiant de connexion de l'utilisateur, partiel.")
        ] = None,
        action: Annotated[
            str | None, Field(max_length=100, description="Code exact de l'action, par exemple EMPLOYE_SORTIE.")
        ] = None,
        categorie: Annotated[CategorieAudit | None, Field(description="Catégorie de l'entrée.")] = None,
        resultat: Annotated[ResultatAudit | None, Field(description="Résultat de l'action : SUCCES ou ECHEC.")] = None,
        entite: Annotated[
            str | None, Field(max_length=100, description=f"Type de l'enregistrement concerné ({liste_entites}).")
        ] = None,
        entite_id: Annotated[
            int | None, Field(gt=0, description="Identifiant de l'enregistrement concerné (entier positif).")
        ] = None,
        limite: Annotated[
            int, Field(ge=1, le=LIGNES, description="Nombre d'entrées rendues par page, de 1 à 20, 20 par défaut.")
        ] = LIGNES,
        page: Page = 0,
    ) -> dict[str, Any]:
        criteres = RechercheJournal(
            date_debut=_jour(depuis, "depuis", fin=False),
            date_fin=_jour(jusqua, "jusqua", fin=True),
            utilisateur=_texte(utilisateur),
            categorie=categorie,
            action=_texte(action),
            resultat=resultat,
            entite_type=_texte(entite),
            entite_id=entite_id,
        )
        pagination = Pagination(page, limite, (("horodatage", False),))
        async with fabrique()() as session, session.begin():
            resultats = await consultation.rechercher(session, criteres, pagination)
        return {
            "total": resultats.page.total_elements,
            "page": resultats.page.number,
            "entrees": [
                {
                    "id": ligne.id,
                    "horodatage": ligne.horodatage.isoformat(),
                    "categorie": ligne.categorie.value,
                    "action": ligne.action,
                    "resultat": ligne.resultat.value,
                    "utilisateur": ligne.utilisateur_nom,
                    "origine": ligne.origine.value,
                    "entite": ligne.entite_type,
                    "entiteId": ligne.entite_id,
                    "nombreElements": ligne.nombre_elements,
                    "motif": ligne.motif,
                }
                for ligne in resultats.content
            ],
            "vue": {"module": "audit", "vue": "tabulaire", "parametres": {}},
        }

    @serveur.tool(
        name="audit_historique",
        title="Historique d'un enregistrement",
        annotations=LECTURE_SEULE,
        description=(
            "Historique d'un enregistrement (bulletin, employé, chantier, équipe, fonction, rôle ou paramètre) : ses "
            "versions de la plus récente à la plus ancienne, avec l'auteur, l'opération et les champs modifiés "
            "(valeur avant et après). À utiliser pour « qui a modifié X et quand ». Réservé aux utilisateurs qui "
            "voient le journal ; résultats paginés avec le nombre total. Parcourir les pages jusqu'au total. "
            "Pour chercher dans tout le journal sans cibler un enregistrement, utiliser `audit_rechercher`."
        ),
    )
    @outil("audit_historique", "AUDIT_READ", _nombre_de_total)
    async def audit_historique(  # pyright: ignore[reportUnusedFunction]
        entite: Annotated[str, Field(description=f"Type de l'enregistrement : {liste_entites}.")],
        id: Annotated[  # nom du paramètre exposé à l'agent, identique à celui de Spring
            int,
            Field(
                gt=0,
                description="Identifiant de l'enregistrement (entier positif), obtenu avec l'outil de recherche du "
                "domaine concerné.",
            ),
        ],
        limite: Annotated[
            int, Field(ge=1, le=VERSIONS, description="Nombre de versions rendues par page, de 1 à 10, 10 par défaut.")
        ] = VERSIONS,
        page: Page = 0,
    ) -> dict[str, Any]:
        try:
            async with fabrique()() as session, session.begin():
                resultats = await consultation.historique(session, entite, id, Pagination(page, limite, ()))
        except EntiteAuditeeInconnue as inconnue:
            raise ToolError(
                f"Type d'enregistrement inconnu : {entite}. Valeurs possibles : {liste_entites}."
            ) from inconnue
        return {
            "total": resultats.page.total_elements,
            "page": resultats.page.number,
            "versions": [
                {
                    "revision": v.revision,
                    "horodatage": v.horodatage.isoformat(),
                    "utilisateur": v.utilisateur_nom,
                    "origine": v.origine.value,
                    "operation": v.operation,
                    "champs": [
                        {
                            "champ": c.champ,
                            "avant": c.avant,
                            "apres": c.apres,
                            "ajoutes": c.ajoutes,
                            "retires": c.retires,
                        }
                        for c in v.champs
                    ],
                }
                for v in resultats.content
            ],
        }
