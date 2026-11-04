"""Outils MCP des domaines déjà en Python : identité, paramètres, rôles, journal d'audit (KAN-216).

Port des outils `systeme_identite`, `parametres_lire`, `roles_lister`, `audit_rechercher` et `audit_historique` du
module `staport.rh.mcp` de Spring : mêmes noms, mêmes descriptions, mêmes clés de résultat. Tous sont en lecture seule
et ne modifient rien. Chacun exige la permission de l'écran qu'il reflète, relue en base à chaque requête. Les outils
des autres domaines arrivent avec leur domaine (KAN-49). La liste des comptes n'est volontairement pas exposée.
"""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any, cast

from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from mcp.server import MCPServer
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from staport.domains.audit import consultation
from staport.domains.audit.exceptions import EntiteAuditeeInconnue
from staport.domains.audit.registre import registre
from staport.domains.audit.schemas import CategorieAudit, RechercheJournal, ResultatAudit
from staport.domains.auth.composition import ContexteAuth
from staport.domains.auth.schemas import RoleRecherche
from staport.domains.auth.securite import SCOPE_LECTURE
from staport.domains.common.pagination import Pagination
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
    serveur: MCPServer, contexte: Callable[[], ContexteAuth], fabrique: Callable[[], async_sessionmaker[AsyncSession]]
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
