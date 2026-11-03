"""Parité du domaine audit avec Spring (KAN-214) : révisions, journal, événements de sécurité, défaillance, intégrité.

Reprend `AuditRevisionTest`, `AuditOperationTest` (comptes et rôles), `AuditSecurityEventsTest`, `AuditDefaillanceTest`
et `AuditIntegriteTest` sur un PostgreSQL réel. Ne sont pas repris, par décision du propriétaire : l'audit des
lectures et des sorties de données (`AuditAccesTest`, `LECTURE_METIER`). Les tests de paie, d'import et de
synchronisation arrivent avec leurs domaines (KAN-49).
"""

# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from conftest import Plateforme
from sqlalchemy import text

from staport.domains.audit.api import VerificationIntegrite
from staport.domains.audit.service import Audit
from staport.domains.common.securite import ActionSecurite as Action


@pytest.fixture
def admin(plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    acces = connecter("admin-essai", "mdp-admin-essai-123")["accessToken"]
    plateforme.client.cookies.clear()
    return {"Authorization": f"Bearer {acces}"}


def _unique(prefixe: str) -> str:
    return f"{prefixe}-{uuid.uuid4().hex[:8]}"


def _lignes(p: Plateforme, sql: str, **parametres: Any) -> list[dict[str, Any]]:
    with p.moteur.connect() as c:
        return [dict(ligne) for ligne in c.execute(text(sql), parametres).mappings()]


def _journal(p: Plateforme, **filtres: Any) -> list[dict[str, Any]]:
    conditions = " AND ".join(f"{cle} = :{cle}" for cle in filtres) or "TRUE"
    return _lignes(p, f"SELECT * FROM audit_journal WHERE {conditions} ORDER BY id", **filtres)  # noqa: S608


def _compter(p: Plateforme) -> int:
    return _lignes(p, "SELECT count(*) AS n FROM audit_journal")[0]["n"]


def _id_permission(p: Plateforme, code: str) -> int:
    return _lignes(p, "SELECT id FROM permission WHERE code = :c", c=code)[0]["id"]


def _creer_role(p: Plateforme, admin: dict[str, str], permissions: tuple[str, ...] = ("EQUIPE_WRITE",)) -> Any:
    corps = {
        "nom": _unique("role"),
        "description": "Rôle d'essai",
        "permissionIds": [_id_permission(p, c) for c in permissions],
    }
    return p.client.post("/roles", headers=admin, json=corps)


def _creer_compte(p: Plateforme, admin: dict[str, str], **remplacements: Any) -> dict[str, Any]:
    nom = _unique("cpt")
    corps = {
        "username": nom,
        "email": f"{nom}@example.org",
        "motDePasse": "mot-de-passe-valide",
        "employeeId": None,
        "roleIds": [],
        **remplacements,
    }
    reponse = p.client.post("/users", headers=admin, json=corps)
    assert reponse.status_code == 201, reponse.text
    return reponse.json()


# --- Révisions et journal des opérations ----------------------------------------------------------------


def test_une_creation_produit_une_revision_attribuee_a_l_utilisateur_authentifie(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    reponse = _creer_role(plateforme, admin)
    assert reponse.status_code == 201, reponse.text
    role = reponse.json()
    requete = reponse.headers["X-Request-Id"]

    revisions = _lignes(plateforme, "SELECT * FROM audit_revision WHERE request_id = :r", r=requete)
    assert len(revisions) == 1
    assert revisions[0]["utilisateur_nom"] == "admin-essai"
    assert revisions[0]["origine"] == "API"
    assert revisions[0]["utilisateur_id"] is not None
    assert _lignes(plateforme, "SELECT * FROM role_aud WHERE id = :i", i=role["id"]) == [
        {"id": role["id"], "rev": revisions[0]["id"], "revtype": 0, "nom": role["nom"], "description": "Rôle d'essai"}
    ]
    entrees = _journal(plateforme, request_id=requete)
    assert len(entrees) == 1
    assert (entrees[0]["categorie"], entrees[0]["action"], entrees[0]["type_operation"]) == (
        "OPERATION",
        "ROLE_CREATION",
        "CREATE",
    )
    assert (entrees[0]["resultat"], entrees[0]["entite_type"], entrees[0]["entite_id"]) == (
        "SUCCES",
        "Role",
        role["id"],
    )
    assert entrees[0]["revision_id"] == revisions[0]["id"]
    assert entrees[0]["utilisateur_nom"] == "admin-essai"
    assert len(entrees[0]["hash_entree"]) == 64  # chaîne d'intégrité posée par le déclencheur


def test_une_modification_conserve_chaque_version_et_un_enregistrement_identique_n_en_cree_aucune(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin).json()
    corps = {"nom": role["nom"], "description": "Autre", "permissionIds": [p["id"] for p in role["permissions"]]}
    modification = plateforme.client.put(
        f"/roles/{role['id']}", headers=admin, json={**corps, "version": role["version"]}
    )
    assert modification.status_code == 200, modification.text
    suivant = modification.json()

    versions = _lignes(plateforme, "SELECT revtype, description FROM role_aud WHERE id = :i ORDER BY rev", i=role["id"])
    assert versions == [{"revtype": 0, "description": "Rôle d'essai"}, {"revtype": 1, "description": "Autre"}]

    identique = plateforme.client.put(
        f"/roles/{role['id']}", headers=admin, json={**corps, "version": suivant["version"]}
    )
    assert identique.status_code == 200, identique.text
    assert _lignes(plateforme, "SELECT 1 FROM role_aud WHERE id = :i", i=role["id"]).__len__() == 2
    entree = _journal(plateforme, request_id=identique.headers["X-Request-Id"])[0]
    assert (entree["action"], entree["resultat"]) == ("ROLE_MODIFICATION", "SUCCES")
    assert entree["revision_id"] is not None  # l'opération laisse une entrée et une révision vide
    assert _lignes(plateforme, "SELECT 1 FROM role_aud WHERE rev = :r", r=entree["revision_id"]) == []


def test_une_suppression_conserve_tout_le_contenu_de_la_ligne(plateforme: Plateforme, admin: dict[str, str]) -> None:
    role = _creer_role(plateforme, admin, ("EQUIPE_WRITE", "USER_MANAGE")).json()
    suppression = plateforme.client.delete(f"/roles/{role['id']}", headers=admin)
    assert suppression.status_code == 204, suppression.text

    derniere = _lignes(plateforme, "SELECT * FROM role_aud WHERE id = :i ORDER BY rev DESC LIMIT 1", i=role["id"])[0]
    assert (derniere["revtype"], derniere["nom"], derniere["description"]) == (2, role["nom"], "Rôle d'essai")
    retires = _lignes(
        plateforme,
        "SELECT permission_id FROM role_permission_aud WHERE role_id = :i AND rev = :r AND revtype = 2",
        i=role["id"],
        r=derniere["rev"],
    )
    assert len(retires) == 2
    entree = _journal(plateforme, request_id=suppression.headers["X-Request-Id"])[0]
    assert (entree["action"], entree["type_operation"], entree["entite_id"]) == (
        "ROLE_SUPPRESSION",
        "DELETE",
        role["id"],
    )


def test_une_operation_rejetee_trace_la_tentative_sans_rien_enregistrer(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    corps = {"nom": _unique("rejet"), "description": None, "permissionIds": [999_999_999]}
    reponse = plateforme.client.post("/roles", headers=admin, json=corps)
    assert reponse.status_code == 400

    entree = _journal(plateforme, request_id=reponse.headers["X-Request-Id"])[0]
    assert (entree["action"], entree["resultat"], entree["motif"]) == ("ROLE_CREATION", "ECHEC", "PermissionInconnue")
    assert entree["revision_id"] is None
    assert (
        _lignes(plateforme, "SELECT 1 FROM audit_revision WHERE request_id = :r", r=reponse.headers["X-Request-Id"])
        == []
    )
    assert _lignes(plateforme, "SELECT 1 FROM role WHERE nom = :n", n=corps["nom"]) == []


def test_un_role_encore_attribue_n_est_pas_supprime_et_le_refus_est_trace(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin).json()
    _creer_compte(plateforme, admin, roleIds=[role["id"]])
    reponse = plateforme.client.delete(f"/roles/{role['id']}", headers=admin)
    assert reponse.status_code == 409

    entree = _journal(plateforme, request_id=reponse.headers["X-Request-Id"])[0]
    assert (entree["action"], entree["resultat"], entree["motif"]) == ("ROLE_SUPPRESSION", "ECHEC", "RoleUtilise")
    assert _lignes(plateforme, "SELECT 1 FROM role WHERE id = :i", i=role["id"])


def test_un_compte_ses_roles_et_ses_permissions_refusees_sont_audites_avec_leurs_liaisons(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin).json()
    compte = _creer_compte(plateforme, admin, roleIds=[role["id"]])

    creation = _lignes(plateforme, "SELECT * FROM utilisateur_aud WHERE id = :i", i=compte["id"])
    assert [(x["revtype"], x["username"], x["actif"]) for x in creation] == [(0, compte["username"], True)]
    assert "mot_de_passe_hash" not in creation[0]  # un secret n'est jamais audité
    liaisons = _lignes(
        plateforme, "SELECT role_id, revtype FROM utilisateur_role_aud WHERE utilisateur_id = :i", i=compte["id"]
    )
    assert liaisons == [{"role_id": role["id"], "revtype": 0}]

    refus = plateforme.client.put(
        f"/users/{compte['id']}/permissions-refusees",
        headers=admin,
        json={"version": compte["version"], "permissionIds": [_id_permission(plateforme, "EQUIPE_WRITE")]},
    )
    assert refus.status_code == 200, refus.text
    refuses = _lignes(
        plateforme,
        "SELECT revtype FROM utilisateur_permission_refusee_aud WHERE utilisateur_id = :i",
        i=compte["id"],
    )
    assert refuses == [{"revtype": 0}]
    entree = _journal(plateforme, request_id=refus.headers["X-Request-Id"])[0]
    assert (entree["action"], entree["entite_type"], entree["entite_id"]) == (
        "UTILISATEUR_PERMISSIONS_REFUSEES",
        "Utilisateur",
        compte["id"],
    )


def test_un_changement_de_mot_de_passe_seul_ne_cree_aucune_revision(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    compte = _creer_compte(plateforme, admin)
    avant = _lignes(plateforme, "SELECT count(*) AS n FROM utilisateur_aud WHERE id = :i", i=compte["id"])[0]["n"]
    reponse = plateforme.client.post(
        f"/users/{compte['id']}/reset-password", headers=admin, json={"nouveauMotDePasse": "autre-mdp-tres-long"}
    )
    assert reponse.status_code == 204, reponse.text

    apres = _lignes(plateforme, "SELECT count(*) AS n FROM utilisateur_aud WHERE id = :i", i=compte["id"])[0]["n"]
    assert apres == avant
    assert (
        _lignes(plateforme, "SELECT 1 FROM audit_revision WHERE request_id = :r", r=reponse.headers["X-Request-Id"])
        == []
    )


def test_le_compte_administrateur_du_demarrage_est_attribue_au_demarrage(plateforme: Plateforme) -> None:
    revision = _lignes(
        plateforme,
        "SELECT r.* FROM audit_revision r JOIN utilisateur_aud a ON a.rev = r.id WHERE a.username = 'admin-essai'",
    )[0]
    assert (revision["origine"], revision["utilisateur_nom"], revision["utilisateur_id"]) == (
        "DEMARRAGE",
        "Système",
        None,
    )
    assert revision["request_id"] is not None  # l'identifiant d'exécution du traitement
    entree = _journal(plateforme, revision_id=revision["id"])[0]
    assert (entree["action"], entree["origine"]) == ("UTILISATEUR_CREATION", "DEMARRAGE")


# --- Événements de sécurité -------------------------------------------------------------------------------


def test_une_connexion_reussie_puis_echouee_sont_tracees(
    plateforme: Plateforme, creer_utilisateur: Callable[..., Any]
) -> None:
    identifiant, mot_de_passe = creer_utilisateur()
    nom = _lignes(plateforme, "SELECT username FROM utilisateur WHERE id = :i", i=identifiant)[0]["username"]
    reussie = plateforme.client.post("/auth/login", json={"username": nom, "password": mot_de_passe})
    assert reussie.status_code == 200
    entree = _journal(plateforme, request_id=reussie.headers["X-Request-Id"])[0]
    assert (entree["categorie"], entree["action"], entree["resultat"]) == ("SECURITE", "CONNEXION_REUSSIE", "SUCCES")
    assert (entree["utilisateur_id"], entree["utilisateur_nom"]) == (identifiant, nom)

    inconnue = plateforme.client.post("/auth/login", json={"username": "inconnu-xyz", "password": "n'importe-quoi"})
    assert inconnue.status_code == 401
    echec = _journal(plateforme, request_id=inconnue.headers["X-Request-Id"])[0]
    assert (echec["action"], echec["resultat"], echec["motif"]) == ("CONNEXION_ECHOUEE", "ECHEC", "COMPTE_INCONNU")
    # L'identifiant saisi d'un compte inconnu n'est pas conservé : ce peut être un mot de passe tapé au mauvais endroit.
    assert (echec["utilisateur_id"], echec["utilisateur_nom"]) == (None, "Anonyme")
    assert "inconnu-xyz" not in str(echec)


def test_un_acces_refuse_sur_une_route_est_trace_avec_la_route_et_l_identifiant_de_requete(
    plateforme: Plateforme, creer_utilisateur: Callable[..., Any], connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    identifiant, mot_de_passe = creer_utilisateur()
    nom = _lignes(plateforme, "SELECT username FROM utilisateur WHERE id = :i", i=identifiant)[0]["username"]
    acces = connecter(nom, mot_de_passe)["accessToken"]
    plateforme.client.cookies.clear()
    reponse = plateforme.client.get("/users/1", headers={"Authorization": f"Bearer {acces}"})
    assert reponse.status_code == 403

    entree = _journal(plateforme, request_id=reponse.headers["X-Request-Id"])[0]
    assert (entree["categorie"], entree["action"], entree["resultat"]) == ("SECURITE", "ACCES_REFUSE", "ECHEC")
    assert entree["utilisateur_nom"] == nom
    assert entree["perimetre"] == {"methode": "GET", "route": "/users/1"}


def test_une_requete_sans_authentification_est_attribuee_a_un_visiteur_anonyme(plateforme: Plateforme) -> None:
    reponse = plateforme.client.get("/users/12345")
    assert reponse.status_code == 401
    entree = _journal(plateforme, request_id=reponse.headers["X-Request-Id"])[0]
    assert (entree["action"], entree["utilisateur_nom"], entree["origine"], entree["motif"]) == (
        "ACCES_ANONYME_REFUSE",
        "Anonyme",
        "API",
        "HTTP_401",
    )
    assert entree["perimetre"] == {"methode": "GET", "route": "/users/{id}", "statutHttp": 401}


def test_la_reinitialisation_par_un_administrateur_trace_le_compte_vise_sans_mot_de_passe(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    compte = _creer_compte(plateforme, admin)
    reponse = plateforme.client.post(
        f"/users/{compte['id']}/reset-password", headers=admin, json={"nouveauMotDePasse": "autre-mdp-tres-long"}
    )
    entrees = [
        e
        for e in _journal(plateforme, request_id=reponse.headers["X-Request-Id"])
        if e["action"] == Action.MOT_DE_PASSE_REINITIALISE_PAR_ADMIN
    ]
    assert len(entrees) == 1
    assert entrees[0]["utilisateur_nom"] == "admin-essai"  # l'acteur est l'administrateur, le compte visé est en détail
    assert entrees[0]["perimetre"]["cibleId"] == compte["id"]
    assert "autre-mdp-tres-long" not in str(entrees[0])


# --- Rien d'autre que les écritures et la sécurité ----------------------------------------------------------


def test_aucune_lecture_n_est_journalisee(plateforme: Plateforme, admin: dict[str, str]) -> None:
    avant = _compter(plateforme)
    assert plateforme.client.get("/users/1", headers=admin).status_code == 200
    assert plateforme.client.get("/permissions", headers=admin).status_code == 200
    assert plateforme.client.post("/roles/search", headers=admin, json={}).status_code == 200
    assert plateforme.client.post("/logs/search", headers=admin, json={}).status_code == 200
    assert plateforme.client.get("/auth/password-policy").status_code == 200
    assert plateforme.client.get("/health").status_code in (200, 404)  # sans route : aucune trace non plus
    assert _compter(plateforme) == avant


# --- Défaillance de l'audit ------------------------------------------------------------------------------


def test_si_l_entree_d_une_modification_ne_peut_pas_s_ecrire_la_modification_echoue_et_rien_n_est_enregistre(
    plateforme: Plateforme, admin: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    original = Audit._entree  # pyright: ignore[reportPrivateUsage]

    def entree_cassee(*args: Any, **kwargs: Any) -> dict[str, Any]:
        if args[2] == "ROLE_CREATION" and args[3].value == "SUCCES":
            raise RuntimeError("écriture impossible")
        return original(*args, **kwargs)

    monkeypatch.setattr(Audit, "_entree", staticmethod(entree_cassee))
    nom = _unique("panne")
    avant = plateforme.journal.metriques.ecritures_en_echec["OPERATION"]
    reponse = plateforme.client.post(
        "/roles", headers=admin, json={"nom": nom, "description": None, "permissionIds": []}
    )

    assert reponse.status_code == 500
    assert _lignes(plateforme, "SELECT 1 FROM role WHERE nom = :n", n=nom) == []  # fermé pour les données
    entree = _lignes(plateforme, "SELECT * FROM audit_journal WHERE motif = 'AuditIndisponible' ORDER BY id DESC")[0]
    assert (entree["action"], entree["resultat"], entree["motif"]) == ("ROLE_CREATION", "ECHEC", "AuditIndisponible")
    assert plateforme.journal.metriques.ecritures_en_echec["OPERATION"] > avant


def test_si_un_evenement_de_securite_ne_peut_pas_s_ecrire_la_connexion_continue_et_l_erreur_est_comptee(
    plateforme: Plateforme, creer_utilisateur: Callable[..., Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    identifiant, mot_de_passe = creer_utilisateur()
    nom = _lignes(plateforme, "SELECT username FROM utilisateur WHERE id = :i", i=identifiant)[0]["username"]

    async def panne(self: Audit, valeurs: dict[str, Any]) -> None:
        raise RuntimeError("journal indisponible")

    monkeypatch.setattr(Audit, "_ecrire_separement", panne)
    avant = plateforme.journal.metriques.ecritures_en_echec["SECURITE"]
    reponse = plateforme.client.post("/auth/login", json={"username": nom, "password": mot_de_passe})

    assert reponse.status_code == 200  # ouvert : une panne d'audit n'empêche pas de se connecter
    assert plateforme.journal.metriques.ecritures_en_echec["SECURITE"] == avant + 1


# --- Intégrité ---------------------------------------------------------------------------------------------


def test_la_chaine_est_valide_apres_ajout_et_detecte_une_modification_directe(plateforme: Plateforme) -> None:
    with plateforme.moteur.connect() as c:
        assert c.execute(text("SELECT audit_journal_chaine_valide()")).scalar_one() is True
    with plateforme.moteur.connect() as c, c.begin() as transaction:
        c.execute(text("UPDATE audit_journal SET motif = 'trafiqué' WHERE id = (SELECT min(id) FROM audit_journal)"))
        assert c.execute(text("SELECT audit_journal_chaine_valide()")).scalar_one() is False
        transaction.rollback()
    with plateforme.moteur.connect() as c:
        assert c.execute(text("SELECT audit_journal_chaine_valide()")).scalar_one() is True


def test_la_verification_periodique_signale_une_chaine_invalide_et_un_compte_trop_puissant(
    plateforme: Plateforme,
) -> None:
    fabrique = plateforme.app.state.fabrique_sessions
    verification = VerificationIntegrite(fabrique, plateforme.journal.metriques, 1000)

    async def scenario() -> tuple[list[str], bool | None]:
        return await verification.verifier_comptes(), await verification.verifier_chaine()

    modifiables, valide = plateforme.client.portal.call(scenario)  # pyright: ignore[reportOptionalMemberAccess]
    assert valide is True
    assert plateforme.journal.metriques.chaine_invalide == 0
    # En test un seul compte (le propriétaire) sert à tout : l'écart est signalé, pas bloquant.
    assert "audit_journal" in modifiables
    assert plateforme.journal.metriques.integrite_compromise == 1


def test_une_seule_instance_verifie_la_chaine_a_la_fois(plateforme: Plateforme) -> None:
    fabrique = plateforme.app.state.fabrique_sessions
    verification = VerificationIntegrite(fabrique, plateforme.journal.metriques, 1000)

    async def scenario() -> bool | None:
        async with fabrique() as concurrent:
            connexion = await concurrent.connection()
            await connexion.execute(text("SELECT pg_advisory_lock(731942, 2)"))
            try:
                return await verification.verifier_chaine()
            finally:
                await connexion.execute(text("SELECT pg_advisory_unlock(731942, 2)"))
                await concurrent.rollback()

    assert plateforme.client.portal.call(scenario) is None  # pyright: ignore[reportOptionalMemberAccess]


# --- Aucune écriture sans trace (équivalent d'`AuditArchitectureTest`) ----------------------------------------

AUDITEES = {
    ("POST", "/roles"): "ROLE_CREATION",
    ("PUT", "/roles/{identifiant}"): "ROLE_MODIFICATION",
    ("DELETE", "/roles/{identifiant}"): "ROLE_SUPPRESSION",
    ("POST", "/users"): "UTILISATEUR_CREATION",
    ("PUT", "/users/{identifiant}"): "UTILISATEUR_MODIFICATION",
    ("PUT", "/users/{identifiant}/permissions-refusees"): "UTILISATEUR_PERMISSIONS_REFUSEES",
}
"""Routes d'écriture qui changent des données auditées : chacune écrit une entrée d'opération."""

EVENEMENTS_SECURITE = {
    ("POST", "/auth/login"),
    ("POST", "/auth/refresh"),
    ("POST", "/auth/logout"),
    ("POST", "/auth/forgot-password"),
    ("POST", "/auth/reset-password"),
    ("POST", "/auth/jetons/agent"),
    ("POST", "/users/{identifiant}/reset-password"),
}
"""Routes d'écriture tracées par un événement de sécurité (session ou secret, jamais historisés)."""

LECTURES_PAR_POST = {("POST", "/users/search"), ("POST", "/roles/search"), ("POST", "/logs/search")}
"""Recherches par POST : elles ne changent rien et ne sont pas auditées."""


def test_toute_route_d_ecriture_declare_son_audit_ou_son_evenement_de_securite(plateforme: Plateforme) -> None:
    ecritures = {
        (methode.upper(), chemin)
        for chemin, operations in plateforme.app.openapi()["paths"].items()
        for methode in operations
        if methode.upper() != "GET"
    }
    declarees = set(AUDITEES) | EVENEMENTS_SECURITE | LECTURES_PAR_POST
    assert ecritures == declarees, "une route d'écriture sans audit déclaré (ou une déclaration périmée)"
