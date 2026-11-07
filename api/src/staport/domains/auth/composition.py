"""Assemblage du domaine auth : un seul endroit construit les services à partir de la configuration."""

from dataclasses import dataclass

from staport.domains.accueil import audit as _historique_accueil  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.accueil.service import ServiceAccueil
from staport.domains.audit.api import Audit
from staport.domains.auth import audit as _historique_auth  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.auth.courriel import ServiceCourriel
from staport.domains.auth.parametres import ParametresSecurite
from staport.domains.auth.securite import EmetteurJetons, Hacheur, JeuDeCles
from staport.domains.auth.service_agent import ServiceAgent
from staport.domains.auth.service_auth import ServiceAuth
from staport.domains.auth.service_role import ServiceRole
from staport.domains.auth.service_utilisateur import ServiceUtilisateur
from staport.domains.chantier.service import ServiceChantier
from staport.domains.common.audit_contexte import Auditeur
from staport.domains.employee.service import ServiceEmployee
from staport.domains.equipe.service import ServiceEquipe
from staport.domains.function.service import ServiceFonction
from staport.domains.heuresupp import audit as _historique_heuresupp  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.heuresupp.service import ServiceHeuresSupp
from staport.domains.paie.export import ServiceExportPaie
from staport.domains.paie.import_service import ServiceImportPaie
from staport.domains.paie.report import ServiceRapportPaie
from staport.domains.paie.service import ServicePaie
from staport.domains.parametre import audit as _historique_parametre  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.parametre.service import ServiceParametre
from staport.platform.configuration import Configuration


@dataclass(frozen=True)
class ContexteAuth:
    auth: ServiceAuth
    utilisateurs: ServiceUtilisateur
    roles: ServiceRole
    agent: ServiceAgent
    parametres: ServiceParametre
    emetteur: EmetteurJetons
    courriel: ServiceCourriel
    audit: Auditeur
    origines_autorisees: frozenset[str]
    cookie_secure: bool
    accueil: ServiceAccueil
    heures_supp: ServiceHeuresSupp
    fonctions: ServiceFonction
    equipes: ServiceEquipe
    chantiers: ServiceChantier
    employees: ServiceEmployee
    paies: ServicePaie
    export_paie: ServiceExportPaie
    import_paie: ServiceImportPaie
    rapport_paie: ServiceRapportPaie


def origines(brutes: str) -> frozenset[str]:
    """Liste d'origines CORS séparées par des virgules ; chacune est de la forme `schéma://hôte[:port]`."""
    liste = [o.strip() for o in brutes.split(",")]
    if not liste or any(not o for o in liste):
        raise ValueError("CORS_ALLOWED_ORIGINS doit contenir au moins une origine")
    for origine in liste:
        schema, separateur, reste = origine.partition("://")
        if schema not in ("http", "https") or not separateur or not reste or "/" in reste or "*" in origine:
            raise ValueError(f"Origine CORS invalide (schéma+hôte+port attendus) : {origine}")
    return frozenset(liste)


def creer_contexte(
    configuration: Configuration,
    *,
    parametres: ParametresSecurite | None = None,
    audit: Auditeur | None = None,
) -> ContexteAuth:
    cles = JeuDeCles.depuis_configuration(
        configuration.mcp_jwt_private_key.get_secret_value(),
        configuration.mcp_jwt_key_id,
        configuration.mcp_jwt_previous_public_key,
        configuration.mcp_jwt_previous_key_id,
        "MCP_JWT",
    )
    hacheur = Hacheur()
    emetteur = EmetteurJetons(cles)
    publication = audit or Audit()
    service_parametre = ServiceParametre(publication)
    service_accueil = ServiceAccueil(publication)
    service_fonction = ServiceFonction(publication)
    service_equipe = ServiceEquipe(publication)
    service_chantier = ServiceChantier(publication)
    service_employee = ServiceEmployee(publication)
    service_paie = ServicePaie(publication)
    params = parametres or service_parametre
    courriel = ServiceCourriel(configuration)
    service_auth = ServiceAuth(hacheur, emetteur, params, publication, courriel)
    return ContexteAuth(
        auth=service_auth,
        utilisateurs=ServiceUtilisateur(hacheur, params, publication, service_auth),
        roles=ServiceRole(publication),
        agent=ServiceAgent(cles if configuration.mcp_enabled else None, publication),
        parametres=service_parametre,
        emetteur=emetteur,
        courriel=courriel,
        audit=publication,
        origines_autorisees=origines(configuration.cors_allowed_origins),
        cookie_secure=configuration.cookie_secure,
        accueil=service_accueil,
        heures_supp=ServiceHeuresSupp(publication),
        fonctions=service_fonction,
        equipes=service_equipe,
        chantiers=service_chantier,
        employees=service_employee,
        paies=service_paie,
        export_paie=ServiceExportPaie(),
        import_paie=ServiceImportPaie(publication),
        rapport_paie=ServiceRapportPaie(publication),
    )
